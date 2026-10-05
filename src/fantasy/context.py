# -*- coding: utf-8 -*-
"""Takım bağlamı katmanı — projeksiyonu YENİ kadronun gerçekliğine göre düzeltir.

Sorun (backtest, 2023-26): oyuncu kendi geçmişinden projekte ediliyor, takım bağlamı yok. Sonuç: yeni takıma geçenler
(+%10 fantezi puanı, +%9 dakika) ve rotasyonun 5.–10. sırasındakiler fazla tahmin ediliyor; takım toplam dakikası
ortalama 274 (gerçek bütçe ≈ 241). Üç parça:

  1. YAPISAL KULLANIM YÜKÜ (göç eden oyuncuların doğal deneyi): hız = a_p · L_{−p}^(−θ). a_p oyuncunun kadro-bağımsız
     eğilimi, L_{−p} takım arkadaşlarının dakika ağırlıklı ortalama eğilimi. θ (kullanım ≈ 0.8, ribaund ≈ 0.5, asist ≈ 0.55)
     aynı oyuncunun farklı takımlardaki hızından tahmin edilir. Yeni kadro için çarpan μ = (L_eski / L_yeni)^θ.
  2. DAKİKA: gerçek/tahmin dakika oranı ~ yeni takım, takım dakika fazlası (öncelik-doldurma: kendinden yüksek dakikalıların
     bütçeyi ne kadar tükettiği), rotasyon sırası, yaş.
  3. HIZ (dakika başı üretim): gerçek/tahmin oranı ~ yeni takım, μ, yaş, dakika — kullanım / ribaund / asist grupları ayrı.

2 ve 3 ridge doğrusal regresyon (düzey uzayı: ortalama yanlılığı hedefler). Katsayılar `data/{season}__fantasy_context_model.json`.
Doğrulama: `python -m src.fantasy.context --backtest` (leave-one-season-out). Yalnız tahmini ≥15 dk olanlara uygulanır.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DATA_DIR = ROOT / "data"
BUDGET = 241.0                      # takım maç başı dakika bütçesi (48·5, uzatmalar dahil)
MIN_MPG = 15.0                      # bunun altındakilere uygulanmaz
RIDGE = 3.0
MIN_RATIO_CLIP = (0.6, 1.25)
RATE_RATIO_CLIP = (0.7, 1.3)
SPLIT = {"usg": ["PTS", "FGA", "FTA", "FG3A", "FG3M", "FGM", "FTM", "TOV"], "reb": ["REB", "OREB", "DREB"], "ast": ["AST"]}
GROUP_OF_EVAL = {"PTS": "usg", "REB": "reb", "AST": "ast", "TOV": "usg"}
SCALED_STATS = [s for g in SPLIT.values() for s in g] + ["STL", "BLK", "PF"]
MINUTE_COLS = ["mover", "S", "moverS", "r_mid", "r_low", "mpg", "age", "ex", "cb"]
RATE_COLS = ["mover", "lmu", "age", "mpg"]


# ── Yapısal kullanım yükü ──────────────────────────────────────────────────────

def stints(logs: dict[str, pd.DataFrame], seasons: list[str]) -> pd.DataFrame:
    rows = []
    for s in seasons:
        g = logs[s].groupby(["PLAYER_ID", "TEAM_ABBREVIATION"])
        t = g[["MIN", "FGA", "FTA", "TOV", "REB", "AST"]].sum()
        t["SEASON"] = s
        rows.append(t.reset_index())
    st = pd.concat(rows, ignore_index=True)
    st["usg"] = st["FGA"] + 0.44 * st["FTA"] + st["TOV"]
    st["reb"], st["ast"] = st["REB"], st["AST"]
    return st


def fit_propensity(st: pd.DataFrame, stat: str, iters: int = 40, min_min: float = 150.0) -> tuple[pd.Series, float]:
    """hız = a_p · L_{−p}^(−θ); a_p ve θ dönüşümlü tahmin edilir (dakika ağırlıklı, ortalama a = 1)."""
    st = st[st["MIN"] > 0].copy()
    st["r"] = st[stat] / st["MIN"]
    st["tid"] = st["TEAM_ABBREVIATION"] + "|" + st["SEASON"]
    wavg = lambda g: np.average(g["r"], weights=g["MIN"])   # noqa: E731
    a = st.groupby("PLAYER_ID").apply(wavg)
    theta = 0.7
    for _ in range(iters):
        st["a"] = st["PLAYER_ID"].map(a)
        st["am"] = st["a"] * st["MIN"]
        st["L"] = (st.groupby("tid")["am"].transform("sum") - st["am"]) / (st.groupby("tid")["MIN"].transform("sum") - st["MIN"]).clip(lower=1)
        e = st[st["MIN"] >= min_min].copy()
        e["lr"], e["lL"] = np.log(e["r"].clip(lower=1e-4)), np.log(e["L"].clip(lower=1e-4))
        e = e[e.groupby("PLAYER_ID")["lr"].transform("size") >= 2]
        w = e["MIN"]
        center = lambda col: e[col] - e.groupby("PLAYER_ID")[col].transform(lambda x: np.average(x, weights=w.loc[x.index]))   # noqa: E731
        dr_, dl_ = center("lr"), center("lL")
        theta = float(np.clip(-np.sum(w * dr_ * dl_) / np.sum(w * dl_ ** 2), 0.0, 1.5))
        st["x"] = st["r"] * st["L"] ** theta
        a_new = st.groupby("PLAYER_ID").apply(lambda g: np.average(g["x"], weights=g["MIN"]))
        a_new = a_new / np.average(a_new.reindex(st["PLAYER_ID"]).to_numpy(), weights=st["MIN"].to_numpy())
        done = np.abs(a_new - a).max() < 1e-5
        a = a_new
        if done:
            break
    return a, theta


def _L_minus(members: dict, a: pd.Series, default_a: float, pid) -> float:
    num = den = 0.0
    for q, m in members.items():
        if q == pid:
            continue
        num += float(a.get(q, default_a)) * m
        den += m
    return num / den if den > 0 else default_a


def _main_team(logs_last: pd.DataFrame) -> pd.Series:
    t = logs_last.groupby(["PLAYER_ID", "TEAM_ABBREVIATION"])["MIN"].sum().reset_index()
    return t.sort_values("MIN", ascending=False).drop_duplicates("PLAYER_ID").set_index("PLAYER_ID")["TEAM_ABBREVIATION"]


def features(proj: pd.DataFrame, logs: dict[str, pd.DataFrame], target: str, team_col: str = "TEAM",
             team_new: pd.Series | None = None, fits: dict | None = None) -> pd.DataFrame:
    """Oyuncu başına bağlam özellikleri. `proj`: PLAYER_ID indeksli ya da sütunlu projeksiyon (düzeltme ÖNCESİ).
    `team_new`: yeni takım (PLAYER_ID indeksli); yoksa proj[team_col]."""
    from src.fantasy.projections import prev_season
    p = proj.copy()
    if "PLAYER_ID" in p.columns:
        p = p.set_index("PLAYER_ID")
    last = prev_season(target)
    prior = [s for s in logs if s < target]
    if fits is None:
        st = stints(logs, prior)
        fits = {k: fit_propensity(st, k) for k in ("usg", "reb", "ast")}
    p["TEAM_N"] = team_new.reindex(p.index) if team_new is not None else p[team_col]
    p["TEAM_O"] = _main_team(logs[last]).reindex(p.index)
    p["m_new"] = p["PROJ_MPG"] * (p["PROJ_GP"] / 82.0)
    f = pd.DataFrame(index=p.index)
    f["mover"] = ((p["TEAM_N"] != p["TEAM_O"]) & p["TEAM_O"].notna()).astype(float)
    f["S_team"] = p.groupby("TEAM_N")["m_new"].transform("sum")
    f["rank_in_team"] = p.groupby("TEAM_N")["PROJ_MPG"].rank(ascending=False, method="first")
    ps = p.assign(_k=-p["PROJ_MPG"]).sort_values(["TEAM_N", "_k"])
    cum_before = (ps.groupby("TEAM_N")["m_new"].cumsum() - ps["m_new"]).reindex(p.index)
    f["cum_before"] = cum_before
    own = p["m_new"].clip(lower=1.0)
    f["ex_frac"] = ((cum_before + p["m_new"] - BUDGET) / own).clip(0, 1)
    # yapısal yük
    last_st = stints(logs, [last])
    old_members = {t: g.set_index("PLAYER_ID")["MIN"].to_dict() for t, g in last_st.groupby("TEAM_ABBREVIATION")}
    new_members = {t: g["m_new"].to_dict() for t, g in p.dropna(subset=["TEAM_N"]).groupby("TEAM_N")}
    for key, (a, theta) in fits.items():
        da = float(a.mean())
        mu = []
        for pid in p.index:
            tn, to = p.at[pid, "TEAM_N"], p.at[pid, "TEAM_O"]
            if not isinstance(tn, str) or not isinstance(to, str) or to not in old_members:
                mu.append(1.0)
                continue
            mu.append((_L_minus(old_members[to], a, da, pid) / _L_minus(new_members[tn], a, da, pid)) ** theta)
        f[f"mu_{key}"] = mu
    f["age"], f["mpg"] = p["AGE"], p["PROJ_MPG"]
    return f


def design(f: pd.DataFrame, cols: list[str], mu_key: str | None = None) -> pd.DataFrame:
    X = pd.DataFrame(index=f.index)
    X["c"] = 1.0
    rk = f["rank_in_team"].clip(upper=11)
    s = (f["S_team"] - 272) / 30
    table = {
        "mover": f["mover"], "S": s, "moverS": f["mover"] * s,
        "r_mid": ((rk >= 5) & (rk <= 8)).astype(float), "r_low": (rk > 8).astype(float),
        "mpg": (f["mpg"] - 25) / 8, "age": (f["age"].fillna(27) - 27) / 5,
        "ex": f["ex_frac"], "cb": (f["cum_before"] - 120) / 60,
        "lmu": np.log(f[f"mu_{mu_key}"]) if mu_key else 0.0,
    }
    for c in cols:
        X[c] = table[c]
    return X


def _ridge(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    return np.linalg.solve(X.T @ X + RIDGE * np.diag([0.0] + [1.0] * (X.shape[1] - 1)), X.T @ y)


# ── Öğrenme ve uygulama ────────────────────────────────────────────────────────

def fit_model(cases: pd.DataFrame) -> dict:
    """cases: features + 'PROJ_MPG', per-game stat sütunları (tahmin) ve '<stat>_a', 'MIN_a' (gerçek). Rotasyon (≥15 dk) satırları."""
    c = cases[cases["PROJ_MPG"] >= MIN_MPG]
    m = {"minutes": {"cols": MINUTE_COLS,
                     "beta": _ridge(design(c, MINUTE_COLS).to_numpy(float), (c["MIN_a"] / c["PROJ_MPG"]).clip(0.4, 1.8).to_numpy())}}
    rates = {}
    for s, grp in GROUP_OF_EVAL.items():
        if s == "TOV":
            continue
        y = ((c[f"{s}_a"] / c["MIN_a"]) / (c[s] / c["PROJ_MPG"]).clip(lower=1e-6)).clip(0.3, 2.5)
        rates[grp] = {"cols": RATE_COLS, "beta": _ridge(design(c, RATE_COLS, grp).to_numpy(float), y.to_numpy())}
    m["rates"] = rates
    return {"minutes": {"cols": m["minutes"]["cols"], "beta": [float(x) for x in m["minutes"]["beta"]]},
            "rates": {g: {"cols": v["cols"], "beta": [float(x) for x in v["beta"]]} for g, v in rates.items()}}


def adjust(proj: pd.DataFrame, f: pd.DataFrame, model: dict) -> pd.DataFrame:
    """Projeksiyonu bağlama göre düzeltir. Çıktı: aynı tablo + CTX_MIN_RATIO / CTX_RATE_<grup> sütunları."""
    out = proj.copy()
    keyed = "PLAYER_ID" in out.columns
    idx = pd.Index(out["PLAYER_ID"]) if keyed else out.index
    ff = f.reindex(idx)
    ok = (out["PROJ_MPG"].to_numpy(float) >= MIN_MPG) & ff["S_team"].notna().to_numpy()
    mr = np.ones(len(out))
    mm = model["minutes"]
    mr_pred = design(ff, mm["cols"]).to_numpy(float) @ np.array(mm["beta"])
    mr = np.where(ok, np.clip(mr_pred, *MIN_RATIO_CLIP), 1.0)
    out["CTX_MIN_RATIO"] = mr
    for s in SCALED_STATS:
        if s in out.columns:
            out[s] = out[s] * mr
    out["PROJ_MPG"] = out["PROJ_MPG"] * mr
    for grp, spec in model["rates"].items():
        rr_pred = design(ff, spec["cols"], grp).to_numpy(float) @ np.array(spec["beta"])
        rr = np.where(ok, np.clip(rr_pred, *RATE_RATIO_CLIP), 1.0)
        out[f"CTX_RATE_{grp.upper()}"] = rr
        for s in SPLIT[grp]:
            if s in out.columns:
                out[s] = out[s] * rr
    for c in [c for c in out.columns if c.startswith("SD_")]:
        out[c] = out[c] * mr
    return out


def model_path(target: str) -> Path:
    return DATA_DIR / f"{target}__fantasy_context_model.json"


def apply_to_projection(proj: pd.DataFrame, logs: dict[str, pd.DataFrame], target: str) -> pd.DataFrame:
    """Canlı yol (publish): kayıtlı katsayılarla projeksiyonu yeni kadroya göre düzeltir. Model dosyası yoksa dokunmaz."""
    p = model_path(target)
    if not p.exists():
        return proj
    model = json.loads(p.read_text(encoding="utf-8"))
    return adjust(proj, features(proj, logs, target), model)


# ── Backtest ve CLI ────────────────────────────────────────────────────────────

def backtest_cases(targets=("2023-24", "2024-25", "2025-26")) -> dict[str, pd.DataFrame]:
    """Her hedef için: tahmin (düzeltme öncesi) + bağlam özellikleri + gerçekleşen. Yalnız ≥20 maç oynayanlar."""
    from src.fantasy.backtest import actual_per_game
    from src.fantasy.projections import load_gamelogs
    from src.fantasy.strategy_backtest import historical_projections
    seasons = sorted({s for t in targets for s in ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"] if s <= max(targets)})
    logs = load_gamelogs(seasons)
    roster = pd.read_parquet(DATA_DIR / "2026-27__rosters.parquet")
    out = {}
    for t in targets:
        prior = {s: v for s, v in logs.items() if s < t}
        proj = historical_projections(t, logs, roster).set_index("PLAYER_ID")
        team_t = logs[t].groupby("PLAYER_ID")["TEAM_ABBREVIATION"].agg(lambda s: s.value_counts().index[0])
        last_main = _main_team(prior[max(prior)])
        team_new = pd.Series({p: team_t.get(p, last_main.get(p)) for p in proj.index})
        f = features(proj, {**prior}, t, team_new=team_new)
        act = actual_per_game(logs[t])
        act = act[act["GP"] >= 20].add_suffix("_a")
        d = proj.join(f).join(act, how="inner")
        d["target"] = t
        out[t] = d
    return out


def _fp(df: pd.DataFrame) -> pd.Series:
    from src.fantasy.projections import PTS_WEIGHTS, _fp as fp
    return fp(df, PTS_WEIGHTS)


def backtest(write: bool = True) -> dict:
    cases = backtest_cases()
    targets = list(cases)
    res: dict = {"targets": targets, "per_season": {}}
    for t in targets:
        te = cases[t]
        te = te[te["PROJ_MPG"] >= MIN_MPG].copy()
        train = pd.concat([cases[x] for x in targets if x != t])
        model = fit_model(train)
        adj = adjust(te, te, model)
        row = {}
        for name, d in (("base", te), ("context", adj)):
            fp = _fp(d)
            e = fp - te["FP_a"]
            row[name] = {"FP": [round(float(e.abs().mean()), 3), round(float(e.mean()), 3)],
                         **{s: [round(float((d[s] - te[f"{s}_a"]).abs().mean()), 3), round(float((d[s] - te[f"{s}_a"]).mean()), 3)] for s in ("PTS", "REB", "AST")},
                         "MPG": [round(float((d["PROJ_MPG"] - te["MIN_a"]).abs().mean()), 3), round(float((d["PROJ_MPG"] - te["MIN_a"]).mean()), 3)], "n": int(len(te))}
        res["per_season"][t] = row
    if write:
        (DATA_DIR / "fantasy_context_backtest.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    return res


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fit", action="store_true", help="3 sezonun hepsiyle katsayıları öğren, data/{season}__fantasy_context_model.json yaz")
    ap.add_argument("--backtest", action="store_true", help="leave-one-season-out MAE / yanlılık raporu")
    a = ap.parse_args(argv)
    if a.backtest:
        r = backtest()
        for t, row in r["per_season"].items():
            print(t, "n", row["base"]["n"])
            for k in ("FP", "PTS", "REB", "AST", "MPG"):
                print(f"  {k:4s} MAE {row['base'][k][0]:.3f} → {row['context'][k][0]:.3f}   yanlılık {row['base'][k][1]:+.3f} → {row['context'][k][1]:+.3f}")
    if a.fit:
        cases = backtest_cases()
        model = fit_model(pd.concat(cases.values()))
        model["fitted_on"] = list(cases)
        p = DATA_DIR / "2026-27__fantasy_context_model.json"
        p.write_text(json.dumps(model, indent=2), encoding="utf-8")
        print("[context] model yazıldı:", p.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
