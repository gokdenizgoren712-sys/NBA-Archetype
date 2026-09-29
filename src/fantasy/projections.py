# -*- coding: utf-8 -*-
"""Fantezi projeksiyonu — bir sonraki sezon için oyuncu başı maç ortalamaları.

Yöntem (Marcel ailesi, NBA'e uyarlanmış):
  1. Son 3 sezonun maç loglarından dakika başı üretim, sezon ağırlıkları
     SEASON_WEIGHTS = 7/2/1 (en yenisi önce), dakikayla ağırlıklı.
  2. Az dakikası olan oyuncu kendi pozisyon grubunun (G/F/C) lig ortalamasına
     çekilir: oran = (Σ w·toplam + K·lig_oranı) / (Σ w·dakika + K). K stat'a
     göre değişir — STL/BLK gibi gürültülü stat'lar daha çok çekilir.
  3. Yüzdeler (FG%, FT%) deneme sayısıyla aynı şekilde çekilir; FGM/FTM =
     çekilmiş deneme × çekilmiş yüzde.
  4. Yaş: 2013-14'ten beri art arda iki sezon oynayanların yıldan yıla
     değişiminden (dakika başı üretim ve maç başı dakika için ayrı) eğri.
  5. Dakika ve oynanacak maç da aynı ağırlıklarla, lig ortalamasına çekilerek.
  6. Geçmişi olmayan (çaylak) oyuncular: draft sırası kovasına göre önceki
     çaylak sınıflarının ilk sezonu.

Sabitler backtest ile seçildi (src/fantasy/backtest.py) — elle değiştirmeden
önce backtest'i yeniden koş.

Arketip skorlarıyla ilgisi yok: burada ham istatistik projeksiyonu var.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

# Backtest seçimi (2026-09-28): 7/2/1, 5/3/2 · 6/3/1 · 5/4/3'ten iyi çıktı —
# NBA'de son sezon, beyzboldaki Marcel'in 5/4/3'ünden çok daha belirleyici.
SEASON_WEIGHTS = (7, 2, 1)
TEAM_GAMES = 82

RATE_STATS = ["PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV",
              "FG3M", "FG3A", "FGA", "FTA", "PF"]
# Dakika cinsinden çekme sabitleri (ağırlıklı dakika birimi: w·dakika).
K_RATE = {"PTS": 1500, "REB": 1500, "OREB": 2500, "DREB": 1500, "AST": 1500,
          "STL": 5000, "BLK": 4000, "TOV": 2500, "FG3M": 2500, "FG3A": 1500,
          "FGA": 1500, "FTA": 2500, "PF": 2500}
K_PCT = {"FG": 1500, "FT": 800}      # ağırlıklı deneme birimi
K_MPG_GAMES = 60                     # ağırlıklı maç birimi
K_GP = 500                          # ağırlıklı takım-maçı birimi (maç sayısı çekmesi)
# K_GP backtest ile seçildi (2026-09-29, 3 kat: 23-24/24-25/25-26, rotasyon oyuncuları): eski değer 164
# sakatlık geçmişini fazla kalıcı sayıyordu — geçen sezon <40 maç oynayanı ~5.6 maç eksik, 72+ oynayanı
# ~7.5 maç fazla tahmin ediyordu. 500'de sapmalar −0.6 / +2.9, MAE optimumun (300) yanında.
K_DD = 150                           # DD2/TD3 maç başı oranı için ağırlıklı maç
# Tek seferlik sakatlık dönüşü: rotasyon oyuncusu (geçen sezon ≥26 dk) geçen sezon <45, bir önceki sezon ≥62
# maç oynadıysa maç oranı, sakat sezon HARİÇ geçmiş ortalamayla yarı yarıya karıştırılır. Backtest
# (2023-24…2025-26, n=28): gerçekleşen 51 maç; model 46 (MAE 21.8), "sağlıklı geçmiş" 68 (21.9),
# yarı yarıya karışım MAE 18.8. Küçük örnek — kural sade tutuldu, tek parametre yok.
ONEOFF_LAST_GP, ONEOFF_PRIOR_GP, ONEOFF_MIN_MPG, ONEOFF_BLEND = 45, 62, 26.0, 0.5
MPG_CEILING = 36.0                   # dakika artışının sıfırlandığı seviye

ROTATION_MIN = 500                   # lig ortalaması için sezonluk dakika tabanı
SD_MIN_GAMES = 10                    # maçtan maça oynaklık ölçmek için taban

PROJ_STATS = RATE_STATS + ["FGM", "FTM", "DD2", "TD3"]
QUANTILES = np.linspace(0, 1, 41)    # oyuncu maç puanı dağılımı (High Score için)
HS_WEIGHTS = {"PTS": 1.0, "REB": 1.0, "AST": 2.0, "STL": 3.0, "BLK": 3.0}
PTS_WEIGHTS = {"PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0}


# ── Yardımcılar ──────────────────────────────────────────────────────────────

def prev_season(season: str, n: int = 1) -> str:
    y = int(season[:4]) - n
    return f"{y}-{str(y + 1)[2:]}"


def load_gamelogs(seasons: list[str]) -> dict[str, pd.DataFrame]:
    out = {}
    for s in seasons:
        p = DATA_DIR / f"{s}__player_gamelogs.parquet"
        if p.exists():
            out[s] = pd.read_parquet(p)
    return out


def _fp(df: pd.DataFrame, weights: dict) -> pd.Series:
    return sum(df[k].astype(float) * w for k, w in weights.items())


def position_groups(seasons: list[str], roster: pd.DataFrame | None = None) -> dict[int, str]:
    """PLAYER_ID → 'G' / 'F' / 'C' (NBA kodunun ilk harfi). Önce güncel
    kadro, yoksa en yeni sezonun bios tablosu."""
    groups: dict[int, str] = {}
    for s in sorted(seasons):
        p = DATA_DIR / f"{s}__bios.parquet"
        if p.exists():
            b = pd.read_parquet(p)
            for pid, pos in zip(b["PLAYER_ID"], b["POSITION"]):
                if isinstance(pos, str) and pos:
                    groups[int(pid)] = pos[0].upper()
    if roster is not None:
        for pid, pos in zip(roster["PLAYER_ID"], roster["POSITION_RAW"]):
            if isinstance(pos, str) and pos:
                groups[int(pid)] = pos[0].upper()
    return groups


# ── Sezon özetleri ──────────────────────────────────────────────────────────

def season_aggregates(logs: pd.DataFrame, fg_lg: float, ft_lg: float) -> pd.DataFrame:
    """Oyuncu başına: maç, dakika, toplamlar, maçtan maça standart sapmalar,
    son takım. `fg_lg`/`ft_lg` yüzde katkısının (isabet − lig% × deneme)
    oynaklığı için."""
    df = logs.copy()
    df["FG_IMP"] = df["FGM"] - fg_lg * df["FGA"]
    df["FT_IMP"] = df["FTM"] - ft_lg * df["FTA"]
    df = df.sort_values("GAME_DATE")
    g = df.groupby("PLAYER_ID")
    # float'a çevir: DD2/TD3 int8 geliyor ve ağırlıkla çarpılınca taşıyordu
    # (7 × 70 double-double = 490 > 127) — projeksiyonu sessizce bozuyordu.
    agg = g[PROJ_STATS + ["MIN"]].sum().astype(float)
    agg["GP"] = g.size().astype(float)
    sd_cols = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "FG_IMP", "FT_IMP", "MIN"]
    sd = g[sd_cols].std(ddof=0).add_prefix("SD_")
    agg = agg.join(sd)
    agg["LAST_TEAM"] = g["TEAM_ABBREVIATION"].last()
    agg["PLAYER_NAME"] = g["PLAYER_NAME"].last()
    return agg


def league_means(agg: pd.DataFrame, groups: dict[int, str]) -> dict[str, dict[str, float]]:
    """Pozisyon grubuna göre dakika başı oran + yüzdeler (rotasyon oyuncuları)."""
    rot = agg[agg["MIN"] >= ROTATION_MIN].copy()
    rot["GRP"] = [groups.get(int(p), "F") for p in rot.index]
    out: dict[str, dict[str, float]] = {}
    for grp, sub in list(rot.groupby("GRP")) + [("ALL", rot)]:
        m = {s: sub[s].sum() / sub["MIN"].sum() for s in RATE_STATS}
        m["FG%"] = sub["FGM"].sum() / sub["FGA"].sum()
        m["FT%"] = sub["FTM"].sum() / sub["FTA"].sum()
        m["DD2"] = sub["DD2"].sum() / sub["GP"].sum()
        m["TD3"] = sub["TD3"].sum() / sub["GP"].sum()
        m["MPG"] = sub["MIN"].sum() / sub["GP"].sum()
        # Maç oranı hedefi TÜM oynayanlardan (≥10 maç): yalnız rotasyon
        # oyuncularından alınınca (onlar daha çok oynuyor) projeksiyon backtest'te
        # sistematik ~+4.5 maç fazla çıkıyordu.
        allp = agg[agg["GP"] >= 10]
        allp = allp[[groups.get(int(i), "F") == grp for i in allp.index]] if grp != "ALL" else allp
        m["GP_RATE"] = allp["GP"].mean() / TEAM_GAMES
        out[grp] = m
    return out


# ── Yaş eğrisi ──────────────────────────────────────────────────────────────

@lru_cache(maxsize=8)
def age_curve(until_season: str, first_season: str = "2013-14") -> pd.DataFrame:
    """Yaş a → a+1 geçişinde log değişim: dakika başı fantezi üretimi ve MPG.

    Delta yöntemi: aynı oyuncunun art arda iki sezonu (ikisinde de ≥20 maç ve
    ≥10 dk), ağırlık = iki sezon dakikasının harmonik ortalaması. Yalnızca
    `until_season`'dan ÖNCE biten çiftler kullanılır (backtest sızıntısız)."""
    frames = []
    y = int(first_season[:4])
    while True:
        s = f"{y}-{str(y + 1)[2:]}"
        if s >= until_season:
            break
        p = DATA_DIR / f"{s}__player_Base.parquet"
        if p.exists():
            d = pd.read_parquet(p, columns=["PLAYER_ID", "AGE", "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV"])
            d["SEASON_Y"] = y
            frames.append(d)
        y += 1
    if len(frames) < 2:
        return pd.DataFrame(columns=["AGE", "D_RATE", "D_MPG"])
    h = pd.concat(frames, ignore_index=True)
    h = h[(h["GP"] >= 20) & (h["MIN"] >= 10)].copy()
    h["RATE"] = _fp(h, PTS_WEIGHTS) / h["MIN"]
    h["TOT_MIN"] = h["GP"] * h["MIN"]
    nxt = h.copy()
    nxt["SEASON_Y"] -= 1
    pairs = h.merge(nxt, on=["PLAYER_ID", "SEASON_Y"], suffixes=("", "_N"))
    pairs = pairs[pairs["RATE"] > 0]
    pairs["W"] = 2 / (1 / pairs["TOT_MIN"] + 1 / pairs["TOT_MIN_N"])
    pairs["D_RATE"] = np.log(pairs["RATE_N"] / pairs["RATE"])
    pairs["D_MPG"] = np.log(pairs["MIN_N"] / pairs["MIN"])
    pairs["AGE"] = pairs["AGE"].round().astype(int).clip(19, 38)

    rows = []
    for age, sub in pairs.groupby("AGE"):
        w = sub["W"]
        rows.append({"AGE": age, "N": len(sub),
                     "D_RATE": np.average(sub["D_RATE"], weights=w),
                     "D_MPG": np.average(sub["D_MPG"], weights=w)})
    cur = pd.DataFrame(rows).set_index("AGE").reindex(range(19, 39))
    # Seyrek uçları yumuşat: 3 yaşlık ağırlıklı kayan ortalama, boşlukları doldur.
    for c in ("D_RATE", "D_MPG"):
        cur[c] = cur[c].interpolate(limit_direction="both").rolling(3, center=True, min_periods=1).mean()
    return cur.reset_index()


def _age_mult(curve: pd.DataFrame, age: float | None, col: str) -> float:
    if age is None or np.isnan(age) or curve.empty:
        return 1.0
    a = int(np.clip(round(age), 19, 38))
    v = curve.loc[curve["AGE"] == a, col]
    return float(np.exp(v.iloc[0])) if len(v) and not np.isnan(v.iloc[0]) else 1.0


def player_ages(season_before: str) -> dict[int, float]:
    """Hedef sezondan önceki sezonun yaşı (bilinen en yeni sezondan +yıl)."""
    ages: dict[int, float] = {}
    for back in range(0, 4):
        s = prev_season(season_before, back) if back else season_before
        p = DATA_DIR / f"{s}__player_Base.parquet"
        if not p.exists():
            continue
        d = pd.read_parquet(p, columns=["PLAYER_ID", "AGE"])
        for pid, age in zip(d["PLAYER_ID"], d["AGE"]):
            ages.setdefault(int(pid), float(age) + back)
    return ages


# ── Çaylak tabanı ───────────────────────────────────────────────────────────

PICK_BUCKETS = [(1, 3, "1-3"), (4, 10, "4-10"), (11, 20, "11-20"), (21, 30, "21-30"), (31, 60, "31-60")]


def pick_bucket(pick) -> str:
    if pick is None or (isinstance(pick, float) and np.isnan(pick)):
        return "undrafted"
    for lo, hi, name in PICK_BUCKETS:
        if lo <= pick <= hi:
            return name
    return "undrafted"


def rookie_baselines(logs: dict[str, pd.DataFrame], roster: pd.DataFrame, target: str) -> dict[str, dict]:
    """Draft kovası → çaylak sezonunun dakika başı oranları, MPG, maç oranı.

    Yalnızca hedef sezondan ÖNCEKİ çaylak sınıfları. Kaynak güncel kadro
    (FROM_YEAR, DRAFT_NUMBER) olduğu için ligden düşenler yok — sonraki
    sıraların tabanı hafif iyimser, bilinerek kabul edildi."""
    info = roster.set_index("PLAYER_ID")
    rows = []
    for season, df in logs.items():
        if season >= target:
            continue
        y = int(season[:4])
        ids = info.index[info["FROM_YEAR"] == y]
        sub = df[df["PLAYER_ID"].isin(ids)]
        if sub.empty:
            continue
        agg = sub.groupby("PLAYER_ID")[PROJ_STATS + ["MIN"]].sum().astype(float)
        agg["GP"] = sub.groupby("PLAYER_ID").size().astype(float)
        agg["BUCKET"] = [pick_bucket(info.at[p, "DRAFT_NUMBER"]) for p in agg.index]
        rows.append(agg)
    if not rows:
        return {}
    allr = pd.concat(rows)
    out = {}
    for b, sub in allr.groupby("BUCKET"):
        m = {s: sub[s].sum() / sub["MIN"].sum() for s in RATE_STATS}
        m["FG%"] = sub["FGM"].sum() / max(sub["FGA"].sum(), 1)
        m["FT%"] = sub["FTM"].sum() / max(sub["FTA"].sum(), 1)
        m["DD2"] = sub["DD2"].sum() / sub["GP"].sum()
        m["TD3"] = sub["TD3"].sum() / sub["GP"].sum()
        m["MPG"] = sub["MIN"].sum() / sub["GP"].sum()
        m["GP_RATE"] = sub["GP"].mean() / TEAM_GAMES
        m["N"] = len(sub)
        out[b] = m
    return out


# ── Projeksiyon ─────────────────────────────────────────────────────────────

def _quantiles(values: np.ndarray) -> list[float] | None:
    """Maç puanlarının ortalamaya bölünmüş quantile'ları (dağılımın şekli)."""
    if len(values) < SD_MIN_GAMES or values.mean() <= 0:
        return None
    return list(np.quantile(values / values.mean(), QUANTILES).round(4))


def project(target: str, logs: dict[str, pd.DataFrame], roster: pd.DataFrame,
            players: list[int] | None = None, weights=SEASON_WEIGHTS,
            k_scale: float = 1.0) -> pd.DataFrame:
    """Hedef sezon için projeksiyon. `players` verilmezse kadrodaki herkes.

    Yalnızca hedeften ÖNCEKİ sezonların logları kullanılır — backtest ile
    canlı projeksiyon aynı fonksiyondan geçer. `k_scale` tüm çekme sabitlerini
    birlikte ölçekler (backtest ayarı için)."""
    k_rate = {s: v * k_scale for s, v in K_RATE.items()}
    k_pct = {s: v * k_scale for s, v in K_PCT.items()}
    window = [prev_season(target, i) for i in range(1, len(weights) + 1)]
    window = [s for s in window if s in logs]
    if not window:
        raise ValueError(f"no game logs before {target}")
    last = window[0]
    groups = position_groups(window, roster)

    last_logs = logs[last]
    fg_lg = last_logs["FGM"].sum() / last_logs["FGA"].sum()
    ft_lg = last_logs["FTM"].sum() / last_logs["FTA"].sum()
    aggs = {s: season_aggregates(logs[s], fg_lg, ft_lg) for s in window}
    lg = league_means(aggs[last], groups)
    curve = age_curve(target)
    ages = player_ages(last)
    rookies = rookie_baselines(logs, roster, target)
    rinfo = roster.set_index("PLAYER_ID")

    if players is None:
        players = [int(p) for p in roster["PLAYER_ID"]]

    rows = []
    for pid in players:
        grp = groups.get(pid, "F")
        base = lg.get(grp, lg["ALL"])
        hist = [(w, aggs[s].loc[pid]) for w, s in zip(weights, window) if pid in aggs[s].index]
        age = ages.get(pid)
        age_next = age + 1 if age is not None else None
        rec: dict = {"PLAYER_ID": pid, "POS_GROUP": grp,
                     "AGE": round(age_next, 1) if age_next is not None else None}

        if hist:
            wmin = sum(w * h["MIN"] for w, h in hist)
            wgp = sum(w * h["GP"] for w, h in hist)
            rate_mult = _age_mult(curve, age, "D_RATE")
            mpg_mult = _age_mult(curve, age, "D_MPG")
            rates = {s: (sum(w * h[s] for w, h in hist) + k_rate[s] * base[s]) / (wmin + k_rate[s]) * rate_mult
                     for s in RATE_STATS}
            fga, fta = (sum(w * h["FGA"] for w, h in hist), sum(w * h["FTA"] for w, h in hist))
            fg = (sum(w * h["FGM"] for w, h in hist) + k_pct["FG"] * base["FG%"]) / (fga + k_pct["FG"])
            ft = (sum(w * h["FTM"] for w, h in hist) + k_pct["FT"] * base["FT%"]) / (fta + k_pct["FT"])
            mpg = (wmin + K_MPG_GAMES * base["MPG"]) / (wgp + K_MPG_GAMES)
            # Gençlerin dakika artışı eğrisi çoğunlukla az oynayanların rotasyona
            # girmesinden geliyor; zaten 33 dk oynayana aynı artışı vermek onu 37
            # dk'ya itiyordu. Artış, MPG_CEILING'e kalan boşlukla orantılı.
            if mpg_mult > 1:
                room = float(np.clip((MPG_CEILING - mpg) / (MPG_CEILING - 20), 0, 1))
                mpg_mult = 1 + (mpg_mult - 1) * room
            mpg *= mpg_mult
            gp_rate = (wgp + K_GP * base["GP_RATE"]) / (sum(w for w, _ in hist) * TEAM_GAMES + K_GP)
            dd = {k: (sum(w * h[k] for w, h in hist) + K_DD * base[k]) / (wgp + K_DD) for k in ("DD2", "TD3")}
            gps = [h["GP"] for _, h in hist]
            last_mpg = hist[0][1]["MIN"] / max(hist[0][1]["GP"], 1)
            gp_adj = None
            if (len(gps) >= 2 and gps[0] < ONEOFF_LAST_GP and gps[1] >= ONEOFF_PRIOR_GP
                    and last_mpg >= ONEOFF_MIN_MPG):
                healthy = float(np.mean(gps[1:])) / TEAM_GAMES
                gp_rate = (1 - ONEOFF_BLEND) * gp_rate + ONEOFF_BLEND * healthy
                gp_adj = "injury_return"
            source = "history"
            recent = hist[0][1]
            rec["LAST_TEAM"] = recent["LAST_TEAM"]
            rec["SEASONS_USED"] = len(hist)
            rec["HIST_GP_RATE"] = wgp / (sum(w for w, _ in hist) * TEAM_GAMES)
            rec["GP_ADJ"] = gp_adj
        else:
            b = rookies.get(pick_bucket(rinfo.at[pid, "DRAFT_NUMBER"]) if pid in rinfo.index else "undrafted")
            if b is None:
                b = rookies.get("undrafted", base)
            rates = {s: b[s] for s in RATE_STATS}
            fg, ft, mpg, gp_rate = b["FG%"], b["FT%"], b["MPG"], b["GP_RATE"]
            dd = {"DD2": b["DD2"], "TD3": b["TD3"]}
            source = "rookie_baseline"
            rec["LAST_TEAM"] = None
            rec["SEASONS_USED"] = 0
            rec["HIST_GP_RATE"] = None
            rec["GP_ADJ"] = None

        mpg = float(np.clip(mpg, 0, 40))
        gp = float(np.clip(gp_rate, 0, 1) * TEAM_GAMES)
        rec.update({"SOURCE": source, "PROJ_MPG": round(mpg, 2), "PROJ_GP": round(gp, 1)})
        for s in RATE_STATS:
            rec[s] = rates[s] * mpg
        rec["FG%"], rec["FT%"] = fg, ft
        rec["FGM"], rec["FTM"] = rec["FGA"] * fg, rec["FTA"] * ft
        rec["DD2"], rec["TD3"] = dd["DD2"], dd["TD3"]

        # Maçtan maça oynaklık: en yeni yeterli sezon, projeksiyon dakikasına ölçeklenmiş.
        sd_src = next((h for _, h in hist if h["GP"] >= SD_MIN_GAMES), None)
        if sd_src is not None:
            scale = mpg / max(sd_src["MIN"] / sd_src["GP"], 1.0)
            for c in ("PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "FG_IMP", "FT_IMP"):
                rec[f"SD_{c}"] = float(sd_src[f"SD_{c}"]) * scale
        rows.append(rec)

    out = pd.DataFrame(rows)
    _fill_missing_sd(out)
    _attach_quantiles(out, logs, window)
    return out


def _fill_missing_sd(out: pd.DataFrame) -> None:
    """Oynaklığı ölçülemeyen (çaylak, az maç) oyunculara lig medyan varyasyon
    katsayısı × kendi projeksiyonu."""
    pairs = [("PTS", "PTS"), ("REB", "REB"), ("AST", "AST"), ("STL", "STL"), ("BLK", "BLK"),
             ("TOV", "TOV"), ("FG3M", "FG3M"), ("FG_IMP", "FGA"), ("FT_IMP", "FTA")]
    for sd_col, mean_col in pairs:
        col = f"SD_{sd_col}"
        if col not in out.columns:
            out[col] = np.nan
        have = out[col].notna() & (out[mean_col] > 0)
        cv = (out.loc[have, col] / out.loc[have, mean_col]).median() if have.any() else 0.5
        miss = out[col].isna()
        out.loc[miss, col] = out.loc[miss, mean_col] * cv


def _attach_quantiles(out: pd.DataFrame, logs: dict[str, pd.DataFrame], window: list[str]) -> None:
    """Yahoo Points ve High Score maç puanı dağılımlarının şekli (son iki sezon)."""
    recent = pd.concat([logs[s] for s in window[:2]], ignore_index=True)
    recent = recent[recent["MIN"] > 0]
    q_pts, q_hs = {}, {}
    for pid, sub in recent.groupby("PLAYER_ID"):
        q_pts[int(pid)] = _quantiles(_fp(sub, PTS_WEIGHTS).to_numpy())
        q_hs[int(pid)] = _quantiles(_fp(sub, HS_WEIGHTS).to_numpy())
    all_hs = [q for q in q_hs.values() if q]
    all_pts = [q for q in q_pts.values() if q]
    med_hs = list(np.median(np.array(all_hs), axis=0).round(4)) if all_hs else None
    med_pts = list(np.median(np.array(all_pts), axis=0).round(4)) if all_pts else None
    out["Q_POINTS"] = [q_pts.get(p) or med_pts for p in out["PLAYER_ID"]]
    out["Q_HIGH_SCORE"] = [q_hs.get(p) or med_hs for p in out["PLAYER_ID"]]
