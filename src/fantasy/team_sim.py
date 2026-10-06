# -*- coding: utf-8 -*-
"""Takım simülasyonu — oyun düzeyinde, takım bağlamlı istatistik projeksiyonu.

Her takım için K sezon senaryosu × 82 oyun simüle edilir:
  1. SEZON ŞOKU: oyuncunun yeteneği (üretim çarpanı, ampirik FP oran aralığından) ve sakatlık (oynanan maç çarpanı
     ampirik GP oranından; iki ardışık blok + dağınık kayıp — season_sim.py ile aynı model).
  2. DAKİKA: o oyunda sahadaki oyuncular arasında. Her oyuncunun dakikası kendi 'oynarken dakikası' × oyun gürültüsü;
     takım bütçesi (BUDGET) doluncaya kadar: ilk beş (öncelikli) bütçe değişimini yalnız kısmen (λ_top) taşır, kalanını yedekler.
  3. BAĞLAM: o oyunun kadrosuna göre kullanım / ribaund / asist yükü. Oyuncunun hızı = kendi geçmiş hızı × (L_eski / L_oyun)^θ;
     L = sahadaki takım arkadaşlarının dakika ağırlıklı ortalama eğilimi (context.fit_propensity: göç eden oyunculardan öğrenilmiş
     a_p ve θ). Bir yıldız oynamayınca diğerlerinin payı OYUN İÇİNDE yükselir — statik düzeltmenin yapamadığı.
  4. SKORLAMA: usage-verimlilik ödünleşimi (ε): fazla kullanım verimi biraz düşürür.
Çıktı: oyuncu başına oynanan maç başına ortalama (SIM_*), 10./90. yüzdelik (SIM_P10_* / SIM_P90_*), ortalama oynanan maç ve dakika.
Girdi hızları DÜZELTİLMEMİŞ projeksiyondandır (bağlamı simülasyon kendisi üretir); context.py'nin regresyon katmanı ayrı bir yoldur.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from src.fantasy.context import SPLIT, fit_propensity, stints

STATS = ["PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "FG3M", "FG3A", "FGA", "FTA", "PF", "FGM", "FTM"]
KEY_STATS = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M"]
RATE_CALIB_COLS = ["age", "mpg"]
GROUP_OF = {s: g for g, ss in SPLIT.items() for s in ss}
EFF_STATS = {"PTS", "FGM", "FG3M", "FTM"}            # üretim: kullanımla artar ama verim biraz düşer
BLOCK_SHARES = (0.42, 0.25)


@dataclass
class SimParams:
    budget_scale: float = 0.94      # otomatik bütçeye çarpan (yanlılığı sıfırlayan değer; 0.90 → −0.8, 1.0 → +1.1 FP)
    budget: float | None = None   # None: takımın kendi beklenen toplamı Σ b·p (ortalama oyun yeniden ölçeklenmez, yalnız sapmalar)
    lam_top: float = 0.15          # ilk beşin bütçe değişimini taşıma payı (0 = hiç, 1 = yedekler gibi)
    sigma_minutes: float = 0.10    # oyun içi dakika gürültüsü (log)
    eps: float = 0.2               # usage–verim: puan hızı μ^(1−ε)
    minute_cap: float = 42.0
    sigma_talent_scale: float = 1.05   # P10–P90 kapsaması ≈ %80 (backtest: 1.0 → 0.78, 1.1 → 0.82)
    theta_scale: float = 1.0       # yapısal θ'ya çarpan
    mover_delta: float = 0.02      # yeni takıma geçenlerin 'oynarken dakika'sından düşülen pay (backtest: yeni takımlar fazla tahmin ediliyor)
    games: int = 82
    scenarios: int = 100
    seed: int = 7
    bench_floor: float = 0.3
    bench_ceiling: float = 2.0
    talent_on: bool = True
    extra: dict = field(default_factory=dict)


def _quantile_draw(q: np.ndarray, u: np.ndarray) -> np.ndarray:
    """q: (n × K+1) oyuncu başına kantil tablosu; u: (S × n) ∈[0,1) → (S × n) örnek."""
    k = q.shape[1] - 1
    pos = u * k
    lo = np.minimum(pos.astype(int), k - 1)
    f = pos - lo
    idx = np.arange(q.shape[0])[None, :]
    return q[idx, lo] * (1 - f) + q[idx, lo + 1] * f


def old_loads(proj: pd.DataFrame, logs: dict, target: str, fits: dict, last_team: pd.Series) -> dict[str, np.ndarray]:
    """Oyuncu başına eski bağlam yükü L_eski,−p (gruplara göre), geçen sezonun gerçek dakikalarıyla."""
    from src.fantasy.projections import prev_season
    last_st = stints(logs, [prev_season(target)])
    members = {t: g.set_index("PLAYER_ID")["MIN"].to_dict() for t, g in last_st.groupby("TEAM_ABBREVIATION")}
    out = {}
    for key, (a, _theta) in fits.items():
        da = float(a.mean())
        vals = []
        for pid in proj.index:
            to = last_team.get(pid)
            if not isinstance(to, str) or to not in members:
                vals.append(np.nan)
                continue
            num = den = 0.0
            for q, m in members[to].items():
                if q == pid:
                    continue
                num += float(a.get(q, da)) * m
                den += m
            vals.append(num / den if den > 0 else np.nan)
        out[key] = np.array(vals)
    return out


def team_game_lambdas(df: pd.DataFrame, fits: dict, Lold: dict[str, np.ndarray], gp_q: np.ndarray, fp_q: np.ndarray, P: SimParams,
                      seed_offset: int = 0) -> tuple[dict[str, np.ndarray], np.ndarray, np.ndarray]:
    """Bir takımın K senaryo × 82 oyunluk beklenen istatistikleri. Dönüş: (λ[istatistik] → (K × G × n), sahada mı (K × G × n), dakika (K × G × n)).
    λ oyun içi gürültüden ÖNCEKİ beklenen değerdir (sakatlık, dakika dağıtımı, takım bağlamı, yetenek şoku dahil)."""
    n, K, G = len(df), P.scenarios, P.games
    rng = np.random.default_rng(P.seed + seed_offset)
    b = df["PROJ_MPG"].to_numpy(float).clip(min=1.0)
    gp = df["PROJ_GP"].to_numpy(float)
    rate_b = df["RATE_MPG"].to_numpy(float).clip(min=1.0) if "RATE_MPG" in df.columns else b      # istatistikler hangi dakikayla yazıldı
    rates = {s: df[s].to_numpy(float) / rate_b for s in STATS}
    if P.mover_delta and "MOVER" in df.columns:
        b = b * (1.0 - P.mover_delta * df["MOVER"].to_numpy(float))
    a = {k: np.array([float(fits[k][0].get(pid, fits[k][0].mean())) for pid in df.index]) for k in fits}
    theta = {k: fits[k][1] * P.theta_scale for k in fits}

    # 1. sezon şokları ────────────────────────────────────────────────
    if P.talent_on:
        T = _quantile_draw(fp_q, rng.random((K, n)))
        T = T / np.maximum(T.mean(axis=0, keepdims=True), 1e-9)              # ortalama korunur (yalnız yayılım)
        T = 1.0 + (T - 1.0) * P.sigma_talent_scale
    else:
        T = np.ones((K, n))
    ratio = _quantile_draw(gp_q, rng.random((K, n)))
    played = np.minimum(gp[None, :] * np.clip(ratio, 0, None), float(G))
    missed = np.clip(G - played, 0, G)                                     # (K × n)
    gidx = np.arange(G)[None, :, None]
    absent = np.zeros((K, G, n), dtype=bool)
    for share in BLOCK_SHARES:
        length = share * missed
        start = rng.random((K, n)) * np.maximum(G - length, 0)
        absent |= (gidx >= start[:, None, :]) & (gidx < (start + length)[:, None, :])
    scatter = (1.0 - sum(BLOCK_SHARES)) * missed / G
    absent |= rng.random((K, G, n)) < scatter[:, None, :]
    # Bloklar çakışınca kaçırılan maç hedefin altında kalır → eksik kadarını rastgele oynanan maçlardan çıkar
    short = np.rint(missed - absent.sum(axis=1)).clip(min=0).astype(int)           # (K × n)
    if short.any():
        score = rng.random((K, G, n))
        score[absent] = -1.0
        rank = np.argsort(np.argsort(-score, axis=1), axis=1)                        # 0 = en yüksek skor = çıkarılacak ilk maç
        absent |= (rank < short[:, None, :]) & ~absent
    present = ~absent

    # 2. dakika ────────────────────────────────────────────────────────
    z = np.exp(rng.normal(0.0, P.sigma_minutes, (K, G, n)) - 0.5 * P.sigma_minutes ** 2)
    m0 = b[None, None, :] * z * present
    order = np.argsort(-b)                                                  # öncelik sırası (kadro içinde sabit)
    pres_sorted = present[:, :, order]
    starter_sorted = pres_sorted & (np.cumsum(pres_sorted, axis=2) <= 5)
    starter = np.empty_like(starter_sorted)
    starter[:, :, order] = starter_sorted
    budget = P.budget if P.budget is not None else float((b * np.clip(gp / G, 0.0, 1.0)).sum()) * P.budget_scale
    tot0 = m0.sum(axis=2, keepdims=True)
    f = np.clip(budget / np.maximum(tot0, 1e-9), 0.5, 2.0)
    m_st = m0 * np.where(starter, f ** P.lam_top, 1.0)
    st_sum = (m_st * starter).sum(axis=2, keepdims=True)
    bench0 = (m0 * ~starter).sum(axis=2, keepdims=True)
    f_b = np.clip((budget - st_sum) / np.maximum(bench0, 1e-9), P.bench_floor, P.bench_ceiling)
    m = np.where(starter, m_st, m0 * f_b)
    m = np.minimum(m, P.minute_cap) * present

    # 3. bağlam yükü ───────────────────────────────────────────────────
    mu = {}
    for key in fits:
        am = a[key][None, None, :] * m
        A, M = am.sum(axis=2, keepdims=True), m.sum(axis=2, keepdims=True)
        L = (A - am) / np.maximum(M - m, 1e-6)
        Lo = np.where(np.isnan(Lold[key]), np.nan, Lold[key])[None, None, :]
        # eski yük bilinmeyen (çaylak): yeni bağlamın ortalama yükü → çarpan 1
        Lref = np.where(np.isnan(Lo), L.mean(axis=(0, 1), keepdims=True), Lo)
        mu[key] = np.clip((Lref / np.maximum(L, 1e-6)) ** theta[key], 0.5, 1.6)

    # 4. beklenen istatistik (oyun başına) ──────────────────────────────
    lams = {}
    for s in STATS:
        g = GROUP_OF.get(s)
        factor = np.ones((K, G, n)) if g is None else mu[g].copy()
        if s in EFF_STATS:
            factor = factor ** (1.0 - P.eps)
        lams[s] = rates[s][None, None, :] * m * factor * T[:, None, :]
    return lams, present, m


def simulate_team(df: pd.DataFrame, fits: dict, Lold: dict[str, np.ndarray], gp_q: np.ndarray, fp_q: np.ndarray, P: SimParams,
                  seed_offset: int = 0) -> dict[str, np.ndarray]:
    """df: takım kadrosu (PLAYER_ID indeksli; PROJ_MPG, PROJ_GP, STATS sütunları). Dönüş: istatistik → (K × n) sezon ortalaması (oynanan maç başına)."""
    lams, present, m = team_game_lambdas(df, fits, Lold, gp_q, fp_q, P, seed_offset)
    out = {}
    cnt = present.sum(axis=1).astype(float)                                 # (K × n)
    for s in STATS:
        tot = (lams[s] * present).sum(axis=1)
        out[s] = np.where(cnt > 0, tot / np.maximum(cnt, 1.0), np.nan)
    out["MPG"] = np.where(cnt > 0, m.sum(axis=1) / np.maximum(cnt, 1.0), np.nan)
    out["GP"] = cnt
    return out


def simulate_league(proj: pd.DataFrame, team_new: pd.Series, fits: dict, Lold: dict, gp_q_by_player: np.ndarray,
                    fp_q_by_player: np.ndarray, P: SimParams) -> pd.DataFrame:
    """proj: PLAYER_ID indeksli. Dönüş: oyuncu başına SIM_<stat> (ortalama), SIM_P10_/SIM_P90_ (FP için), SIM_MPG, SIM_GP."""
    from src.fantasy.projections import PTS_WEIGHTS
    rows = []
    pos_of = {pid: i for i, pid in enumerate(proj.index)}
    teams = team_new.reindex(proj.index)
    for ti, (team, g) in enumerate(proj.groupby(teams)):
        if not isinstance(team, str):
            continue
        ix = [pos_of[p] for p in g.index]
        res = simulate_team(g, fits, {k: v[ix] for k, v in Lold.items()}, gp_q_by_player[ix], fp_q_by_player[ix], P, seed_offset=ti)
        fp = sum(res[s] * w for s, w in PTS_WEIGHTS.items())
        for j, pid in enumerate(g.index):
            r = {"PLAYER_ID": pid}
            for s in STATS + ["MPG", "GP"]:
                r[f"SIM_{s}"] = float(np.nanmean(res[s][:, j])) if s != "GP" else float(res[s][:, j].mean())
            for s_ in KEY_STATS:
                v = res[s_][:, j]
                ok = np.isfinite(v)
                r[f"SIM_P10_{s_}"], r[f"SIM_P90_{s_}"] = (float(np.percentile(v[ok], 10)), float(np.percentile(v[ok], 90))) if ok.any() else (np.nan, np.nan)
            col = fp[:, j]
            r["SIM_FP"] = float(np.nanmean(col))
            r["SIM_FP_P10"], r["SIM_FP_P90"] = (float(np.nanpercentile(col, 10)), float(np.nanpercentile(col, 90))) if np.isfinite(col).any() else (np.nan, np.nan)
            rows.append(r)
    return pd.DataFrame(rows).set_index("PLAYER_ID")


# ── Hız kalibrasyonu (yaş, dakika): yıldızların kalıcı olarak az, bazı gruplarda çok tahmin edilmesini düzeltir ─────────

def fit_rate_calibration(cases: pd.DataFrame) -> dict[str, list[float]]:
    """cases: context.backtest_cases çıktısı (özellikler + tahmin + gerçek). Grup başına gerçek/tahmin dakika-başı oran ~ yaş, dakika."""
    from src.fantasy import context as cx
    c = cases[cases["PROJ_MPG"] >= cx.MIN_MPG]
    out = {}
    for s, grp in (("PTS", "usg"), ("REB", "reb"), ("AST", "ast")):
        y = ((c[f"{s}_a"] / c["MIN_a"]) / (c[s] / c["PROJ_MPG"]).clip(lower=1e-6)).clip(0.3, 2.5)
        out[grp] = [float(x) for x in cx._ridge(cx.design(c, RATE_CALIB_COLS).to_numpy(float), y.to_numpy())]
    return out


def calibrate_rates(proj: pd.DataFrame, betas: dict) -> pd.DataFrame:
    """Girdi hızlarını kalibre eder (≥15 dk olanlara, [0.7, 1.3] sınırıyla). proj: AGE, PROJ_MPG ve STATS sütunlu."""
    from src.fantasy import context as cx
    f = pd.DataFrame({"age": proj["AGE"].to_numpy(), "mpg": proj["PROJ_MPG"].to_numpy(), "mover": 0.0, "S_team": 272.0,
                      "rank_in_team": 1.0, "cum_before": 0.0, "ex_frac": 0.0}, index=proj.index)
    out = proj.copy()
    ok = proj["PROJ_MPG"].to_numpy(float) >= cx.MIN_MPG
    for grp, b in betas.items():
        r = np.where(ok, np.clip(cx.design(f, RATE_CALIB_COLS).to_numpy(float) @ np.array(b), 0.7, 1.3), 1.0)
        for s_ in SPLIT[grp]:
            out[s_] = out[s_] * r
    return out


# ── Canlı yol ─────────────────────────────────────────────────────────────────

def sim_inputs(proj: pd.DataFrame, logs: dict, target: str, model: dict) -> pd.DataFrame:
    """Simülasyonun TÜM girdileri, maç logları olmadan yeniden kurulabilsin diye (World / sunucu): PLAYER_ID indeksli `SI_*` tablosu.
    proj: DÜZELTİLMEMİŞ projeksiyon (PLAYER_ID sütunu; TEAM, AGE, PROJ_MPG, PROJ_GP, STATS)."""
    from src.fantasy import context as cx
    from src.fantasy.projections import prev_season
    p = proj.set_index("PLAYER_ID").copy()
    last = prev_season(target)
    prior = [s for s in logs if s < target]
    st = cx.stints(logs, prior)
    fits = {k: cx.fit_propensity(st, k) for k in ("usg", "reb", "ast")}
    last_team = cx._main_team(logs[last])
    Lold = old_loads(p, logs, target, fits, last_team)
    lt = last_team.reindex(p.index)
    p["MOVER"] = ((p["TEAM"] != lt) & lt.notna()).astype(float)
    p = calibrate_rates(p, model.get("sim", {}).get("rate_calib", {}))
    out = pd.DataFrame(index=p.index)
    for s_ in STATS:
        out[f"SI_{s_}"] = p[s_].astype(float)
    out["SI_MPG"], out["SI_GP"], out["SI_MOVER"] = p["PROJ_MPG"].astype(float), p["PROJ_GP"].astype(float), p["MOVER"]
    for k, (a, theta) in fits.items():
        out[f"SI_A_{k}"] = a.reindex(p.index).fillna(float(a.mean())).astype(float)
        out[f"SI_L_{k}"] = Lold[k]
        out[f"SI_THETA_{k}"] = float(theta)
    return out


def _frame_inputs(inp: pd.DataFrame, model: dict, scenarios: int | None = None):
    """SI_* tablosu (+ TEAM, FP_RATIO_Q, GP_RATIO_Q) → simülasyon girdileri."""
    ix = inp.set_index("PLAYER_ID") if "PLAYER_ID" in inp.columns else inp
    p = pd.DataFrame(index=ix.index)
    for s_ in STATS:
        p[s_] = ix[f"SI_{s_}"].to_numpy(float)
    p["PROJ_MPG"], p["PROJ_GP"], p["MOVER"] = ix["SI_MPG"].to_numpy(float), ix["SI_GP"].to_numpy(float), ix["SI_MOVER"].to_numpy(float)
    fits = {k: (pd.Series(ix[f"SI_A_{k}"].to_numpy(float), index=ix.index), float(ix[f"SI_THETA_{k}"].iloc[0])) for k in ("usg", "reb", "ast")}
    Lold = {k: ix[f"SI_L_{k}"].to_numpy(float) for k in ("usg", "reb", "ast")}
    sim = model.get("sim", {})
    params = SimParams(**{**sim.get("params", {}), **({"scenarios": scenarios} if scenarios else {})})
    gpq = np.array([list(x) for x in ix["GP_RATIO_Q"]], float)
    fpq = np.array([list(x) for x in ix["FP_RATIO_Q"]], float)
    return p, ix["TEAM"], fits, Lold, gpq, fpq, params


def run_from_inputs(inp: pd.DataFrame, model: dict, scenarios: int | None = None) -> pd.DataFrame:
    """SI_* girdilerinden SIM_* (ortalama, P10/P90) — maç logu gerekmez."""
    p, team, fits, Lold, gpq, fpq, params = _frame_inputs(inp, model, scenarios)
    return simulate_league(p, team, fits, Lold, gpq, fpq, params)


def build_sim(proj: pd.DataFrame, logs: dict, target: str, model: dict, scenarios: int | None = None) -> pd.DataFrame:
    """proj: DÜZELTİLMEMİŞ projeksiyon (+ FP_RATIO_Q, GP_RATIO_Q). Dönüş: PLAYER_ID indeksli SI_* + SIM_* tablosu."""
    inp = sim_inputs(proj, logs, target, model)
    inp["TEAM"] = proj.set_index("PLAYER_ID")["TEAM"]
    inp["FP_RATIO_Q"] = proj.set_index("PLAYER_ID")["FP_RATIO_Q"]
    inp["GP_RATIO_Q"] = proj.set_index("PLAYER_ID")["GP_RATIO_Q"]
    sim = run_from_inputs(inp, model, scenarios)
    return inp.drop(columns=["TEAM", "FP_RATIO_Q", "GP_RATIO_Q"]).join(sim)


def attach_sim(final: pd.DataFrame, raw: pd.DataFrame, logs: dict, target: str) -> pd.DataFrame:
    """publish: simülasyonu DÜZELTİLMEMİŞ projeksiyondan (`raw`) koş, SIM_* sütunlarını son tabloya ekle. Model dosyasında
    'sim' bölümü yoksa dokunmaz."""
    import json
    from src.fantasy import context as cx
    path = cx.model_path(target)
    if not path.exists():
        return final
    model = json.loads(path.read_text(encoding="utf-8"))
    if "sim" not in model:
        return final
    r = raw.merge(final[["PLAYER_ID", "FP_RATIO_Q", "GP_RATIO_Q"]], on="PLAYER_ID", how="left")
    sim = build_sim(r, logs, target, model)
    drop = [c for c in final.columns if c.startswith(("SIM_", "SI_"))]
    return final.drop(columns=drop).merge(sim.reset_index(), on="PLAYER_ID", how="left")


BLEND_W = 0.25   # Harman: 0.25 simülasyon + 0.75 model (önceki testte tek yolun en iyisinden daha düşük hata)


def with_sim(proj: pd.DataFrame, weight: float = 1.0) -> pd.DataFrame:
    """Projeksiyon tablosunu SİMÜLASYON ortalamalarıyla değiştirir (aynı değerleme motoru 'simülasyon projeksiyonu'ndan çalışsın).
    weight < 1: Harman — her istatistik (1−w)·model + w·simülasyon; FG%/FT% harmanlanmış isabet/denemeden yeniden çıkar.
    SIM_* olmayan / NaN satırlar model değerinde kalır. Aralık çarpanları (FP_RATIO_P10/P90) simülasyonun FP yüzdeliklerinden gelir
    (harmanda iki oranın harmanı)."""
    if "SIM_FP" not in proj.columns:
        return proj
    w = float(np.clip(weight, 0.0, 1.0))
    out = proj.copy()
    has = out["SIM_FP"].notna()

    def mix(col: str, sim: pd.Series) -> None:
        out.loc[has, col] = (1.0 - w) * out.loc[has, col] + w * sim[has]

    for s_ in STATS:
        col = f"SIM_{s_}"
        if col in out.columns:
            mix(s_, out[col])
    mix("PROJ_MPG", out["SIM_MPG"])
    gp = out["SIM_GP"].clip(upper=82.0)
    okg = has & (gp > 0)
    out.loc[okg, "PROJ_GP"] = (1.0 - w) * out.loc[okg, "PROJ_GP"] + w * gp[okg]
    fga, fta = out["FGA"].clip(lower=1e-6), out["FTA"].clip(lower=1e-6)
    out.loc[has, "FG%"] = (out.loc[has, "FGM"] / fga[has]).clip(0, 1)
    out.loc[has, "FT%"] = (out.loc[has, "FTM"] / fta[has]).clip(0, 1)
    ok = has & (out["SIM_FP"] > 0)
    for q in ("P10", "P90"):
        sim_ratio = out["SIM_FP_" + q] / out["SIM_FP"].where(out["SIM_FP"] > 0)
        out.loc[ok, "FP_RATIO_" + q] = (1.0 - w) * out.loc[ok, "FP_RATIO_" + q] + w * sim_ratio[ok]
    return out


# ── Backtest ve CLI ───────────────────────────────────────────────────────────

def _backtest_inputs(targets):
    from src.fantasy import context as cx
    from src.fantasy.backtest import actual_per_game
    from src.fantasy.projections import load_gamelogs
    from src.fantasy.strategy_backtest import historical_projections
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    logs = load_gamelogs(["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"])
    roster = pd.read_parquet(root / "data" / "2026-27__rosters.parquet")
    out = {}
    for t in targets:
        prior = {k: v for k, v in logs.items() if k < t}
        proj = historical_projections(t, logs, roster).set_index("PLAYER_ID")
        team_t = logs[t].groupby("PLAYER_ID")["TEAM_ABBREVIATION"].agg(lambda s: s.value_counts().index[0])
        last_team = cx._main_team(prior[max(prior)])
        proj["TEAM"] = pd.Series({p: team_t.get(p, last_team.get(p)) for p in proj.index})
        proj["MOVER"] = ((proj["TEAM"] != last_team.reindex(proj.index)) & last_team.reindex(proj.index).notna()).astype(float)
        st = cx.stints(prior, list(prior))
        fits = {k: cx.fit_propensity(st, k) for k in ("usg", "reb", "ast")}
        Lold = old_loads(proj, prior, t, fits, last_team)
        act = actual_per_game(logs[t])
        out[t] = dict(proj=proj, fits=fits, Lold=Lold, act=act[act["GP"] >= 20])
    return out


def backtest(write: bool = True, scenarios: int = 100) -> dict:
    """Leave-one-season-out: hız kalibrasyonu iki sezondan öğrenilir, üçüncüde simülasyon koşulur; baz projeksiyonla kıyas."""
    import json
    from pathlib import Path
    from src.fantasy import context as cx
    from src.fantasy.projections import PTS_WEIGHTS, _fp
    targets = ["2023-24", "2024-25", "2025-26"]
    cases = cx.backtest_cases(tuple(targets))
    inputs = _backtest_inputs(targets)
    res = {"targets": targets, "per_season": {}}
    for t in targets:
        betas = fit_rate_calibration(pd.concat([cases[x] for x in targets if x != t]))
        d = inputs[t]
        p = calibrate_rates(d["proj"], betas)
        gpq = np.array([list(x) for x in p["GP_RATIO_Q"]], float)
        fpq = np.array([list(x) for x in p["FP_RATIO_Q"]], float)
        sim = simulate_league(p, p["TEAM"], d["fits"], d["Lold"], gpq, fpq, SimParams(scenarios=scenarios))
        j = d["proj"].join(sim).join(d["act"][["PTS", "REB", "AST", "FP", "GP", "MIN"]].add_suffix("_a"), how="inner")
        j = j[j["PROJ_MPG"] >= cx.MIN_MPG]
        base_fp = _fp(j, PTS_WEIGHTS)
        row = {"n": int(len(j))}
        for name, fp, pts, reb, ast, mpg in (("base", base_fp, j["PTS"], j["REB"], j["AST"], j["PROJ_MPG"]),
                                             ("sim", j["SIM_FP"], j["SIM_PTS"], j["SIM_REB"], j["SIM_AST"], j["SIM_MPG"])):
            e = fp - j["FP_a"]
            row[name] = {"FP": [round(float(e.abs().mean()), 3), round(float(e.mean()), 3)],
                         "PTS": [round(float((pts - j["PTS_a"]).abs().mean()), 3), round(float((pts - j["PTS_a"]).mean()), 3)],
                         "REB": [round(float((reb - j["REB_a"]).abs().mean()), 3), round(float((reb - j["REB_a"]).mean()), 3)],
                         "AST": [round(float((ast - j["AST_a"]).abs().mean()), 3), round(float((ast - j["AST_a"]).mean()), 3)],
                         "MPG": [round(float((mpg - j["MIN_a"]).abs().mean()), 3), round(float((mpg - j["MIN_a"]).mean()), 3)]}
        row["cover80"] = round(float(((j["FP_a"] >= j["SIM_FP_P10"]) & (j["FP_a"] <= j["SIM_FP_P90"])).mean()), 3)
        res["per_season"][t] = row
    if write:
        (Path(__file__).resolve().parents[2] / "data" / "fantasy_sim_backtest.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    return res


def main(argv=None) -> int:
    import argparse
    import json
    import sys
    from dataclasses import asdict
    from pathlib import Path
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backtest", action="store_true", help="leave-one-season-out: simülasyon ortalaması vs gerçek (MAE, yanlılık, aralık kapsaması)")
    ap.add_argument("--fit", action="store_true", help="hız kalibrasyonunu 3 sezonla öğren, data/{season}__fantasy_context_model.json içine 'sim' bölümü olarak yaz")
    a = ap.parse_args(argv)
    if a.backtest:
        r = backtest()
        for t, row in r["per_season"].items():
            print(t, "n", row["n"], "kapsama(P10–P90)", row["cover80"])
            for k in ("FP", "PTS", "REB", "AST", "MPG"):
                print(f"  {k:4s} MAE {row['base'][k][0]:.3f} → {row['sim'][k][0]:.3f}   yanlılık {row['base'][k][1]:+.3f} → {row['sim'][k][1]:+.3f}")
    if a.fit:
        from src.fantasy import context as cx
        cases = cx.backtest_cases()
        betas = fit_rate_calibration(pd.concat(cases.values()))
        path = cx.model_path("2026-27")
        model = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        keep = ("budget_scale", "lam_top", "sigma_minutes", "eps", "sigma_talent_scale", "mover_delta", "scenarios", "minute_cap")
        model["sim"] = {"params": {k: v for k, v in asdict(SimParams()).items() if k in keep}, "rate_calib": betas, "fitted_on": list(cases)}
        path.write_text(json.dumps(model, indent=2), encoding="utf-8")
        print("[team_sim] 'sim' bölümü yazıldı:", path.name)
    return 0


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    raise SystemExit(main())
