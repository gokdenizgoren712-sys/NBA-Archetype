# -*- coding: utf-8 -*-
"""Breakout adayı listesi (MIP kılıfı): sezon öncesi 10 oyuncu; başarı = çoğu sezonu breakout geçirsin, kazanan olması şart değil.

BREAKOUT tanımı (oyuncu-sezon, sezon sonu bilgisiyle; yalnız etiket, özellik değil):
  (a) MIP oylamasında pay aldı (PAY ≥ 0.02), YA DA
  (b) sezonun en çok gelişen ilk 12 oyuncusundan biri: dVORP82 = (VORP_n − VORP) × 82 / sezon uzunluğu, şart: hedef sezonda ≥ 1200 dk.
Neden iki kapı: MIP oylaması gürültülü ve anlatıya bağlı; gerçek gelişimi (b) ölçer, oylamayı (a) yakalar.

    python -m src.awards.mip_breakout
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

from src.awards import mip_model as mm
from src.awards import mip_rank as mr

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
TOP_IMPROVERS = 12
MIN_MP_NEXT = 1200
MIN_SHARE = 0.02


ELITE_PCT = 0.85            # önceki sezon VORP persantili bunun üstündeyse "zaten yıldız": breakout sayılmaz (sentetik hype'ın etiket biçimi)


def add_labels(ds: pd.DataFrame, exclude_elite: bool = False) -> pd.DataFrame:
    d = ds.copy()
    glen = d.groupby("T")["GP_n"].transform("max") if "GP_n" in d.columns else d.groupby("T")["MP_n"].transform(lambda s: 82.0)
    d["dVORP82"] = (d["VORP_n"] - d["VORP"]) * 82.0 / glen.where(glen > 0, 82.0)
    elig = (d["MP_n"] >= MIN_MP_NEXT) & d["dVORP82"].notna() & (d["LABELED"] == 1)
    if exclude_elite:
        elig &= ~(d["VORP_pct"].fillna(0) >= ELITE_PCT)
    d["IMP_RANK"] = d[elig].groupby("T")["dVORP82"].rank(ascending=False, method="first")
    d["TOP_IMP"] = (d["IMP_RANK"] <= TOP_IMPROVERS).astype(int)
    d["BALLOT"] = (d["SHARE"] >= MIN_SHARE).astype(int)
    d["BREAKOUT"] = ((d["TOP_IMP"] == 1) | (d["BALLOT"] == 1)).astype(int)
    return d


def evaluate_breakout(ds: pd.DataFrame, score: str | pd.Series, start: int = 2000, end: int = 2026) -> dict:
    sc = ds[score] if isinstance(score, str) else score
    rows = []
    for t in range(start, end + 1):
        m = ds[(ds["T"] == t) & (ds["LABELED"] == 1)]
        s = sc.loc[m.index].fillna(-1e9)
        top = m.loc[s.sort_values(ascending=False).index[:10]]
        rows.append({"breakout": top["BREAKOUT"].sum(), "ballot": top["BALLOT"].sum(), "top_imp": top["TOP_IMP"].sum(),
                     "any_ballot_or_imp": int(top["BREAKOUT"].sum() >= 1), "mean_dvorp": float(top["dVORP82"].mean(skipna=True)),
                     "ge4": int(top["BREAKOUT"].sum() >= 4)})
    r = pd.DataFrame(rows)
    return {"breakout@10": r["breakout"].mean(), "ballot@10": r["ballot"].mean(), "top_imp@10": r["top_imp"].mean(),
            "seasons_ge4": r["ge4"].mean(), "mean_dVORP82": r["mean_dvorp"].mean(), "per": r}


def fit_variant(ds: pd.DataFrame, cols: list[str], target: str = "BREAKOUT", first_b: int = 1992, last: int = 2027) -> pd.Series:
    """Walk-forward: t'den önceki sezonlarla eğitilen ağırlıklı lojistik; hedef BREAKOUT (ağırlık: 1 + 10·PAY + 3·ilk12)."""
    out = pd.Series(np.nan, index=ds.index)
    for t in range(first_b, last + 1):
        tr = ds[(ds["T"] < t) & (ds["LABELED"] == 1)].copy()
        cur = ds["T"] == t
        if not cur.any() or tr[target].sum() < 40:
            continue
        tr["SHARE"] = np.where(tr[target] == 1, 0.1 + tr["SHARE"] + 0.3 * tr["TOP_IMP"], 0.0)          # mm.Logit: y = SHARE > 0, ağırlık 1 + 10·SHARE
        out[cur] = mm.Logit(cols).fit(tr).logit(ds[cur])
    return out


def main(exclude_elite: bool = False) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ds = add_labels(mr.features_v2(mm.load()), exclude_elite)
    ev = ds[(ds["T"] >= 2000) & (ds["T"] <= 2026) & (ds["LABELED"] == 1)]
    print(f"Sezon başına ortalama: breakout {ev.groupby('T')['BREAKOUT'].sum().mean():.1f}, oylama {ev.groupby('T')['BALLOT'].sum().mean():.1f}, ilk12 gelişen {ev.groupby('T')['TOP_IMP'].sum().mean():.1f}")
    # Aşama A (istatistiksel gelişme) öngörülerini ekle: ilk tur walk-forward, hedef BREAKOUT'tan bağımsız
    w = mm.walk_forward(ds, None)
    for c in ("A_dBPM", "A_dPTS", "A_BPMn"):
        ds[c] = w[c]
    ds["A_RELIAB"] = ds["A_dBPM"] * ds["RELIAB"]
    sets = {
        "ballot-B2 (ilk tur modeli)": ("ballot", mm.LEVELS_NOA + mm.GROWTH),
        "breakout-B2": ("breakout", mm.LEVELS_NOA + mm.GROWTH),
        "breakout-B3 (+ Aşama A)": ("breakout", mm.LEVELS_NOA + mm.GROWTH + ["A_dBPM", "A_dPTS", "A_BPMn", "A_RELIAB"]),
        "breakout-v2 (yaş kutuları + rol + ...)": ("breakout", mr.VARIANTS["LN_v2"] + ["A_dBPM", "A_dPTS", "A_BPMn", "A_RELIAB"]),
        "breakout-sadeA (A + yaş + güvenilirlik)": ("breakout", ["A_dBPM", "A_dPTS", "A_BPMn", "A_RELIAB", "AGE", "RELIAB"]),
    }
    scores = {}
    for name, (kind, cols) in sets.items():
        if kind == "ballot":
            tr = ds.copy()
            scores[name] = mm.walk_forward(tr, None)["L_B2"]
        else:
            scores[name] = fit_variant(ds, cols)
        e = evaluate_breakout(ds, scores[name])
        print(f"{name:42s} breakout@10 {e['breakout@10']:.2f}  oylama@10 {e['ballot@10']:.2f}  ilk12-gelişen@10 {e['top_imp@10']:.2f}  ≥4 isabet {e['seasons_ge4']:.0%}  ort. dVORP82 {e['mean_dVORP82']:+.2f}")
    base = {"genç + üretken": ds["BPM_pct"].fillna(0) - 0.06 * (ds["AGE"] - 22).clip(lower=0), "Aşama A tek başına": ds["A_RELIAB"],
            "rastgele": pd.Series(np.random.default_rng(0).random(len(ds)), index=ds.index)}
    for name, s in base.items():
        e = evaluate_breakout(ds, s)
        print(f"{name:42s} breakout@10 {e['breakout@10']:.2f}  oylama@10 {e['ballot@10']:.2f}  ilk12-gelişen@10 {e['top_imp@10']:.2f}  ≥4 isabet {e['seasons_ge4']:.0%}  ort. dVORP82 {e['mean_dVORP82']:+.2f}")
    ds["S_BREAKOUT"] = scores["breakout-B3 (+ Aşama A)"]
    ds.to_parquet(DATA / "awards__mip_breakout_walkforward.parquet")
    last = ds[ds["T"] == 2027].sort_values("S_BREAKOUT", ascending=False).head(15)
    print("\n2026-27 breakout adayları (breakout-B3):")
    print(last[["PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "MPG", "BPM", "A_dBPM", "S_BREAKOUT"]].round(2).to_string(index=False))
    for t in range(2022, 2027):
        g = ds[(ds["T"] == t) & (ds["LABELED"] == 1)].sort_values("S_BREAKOUT", ascending=False).head(10)
        print(t, "|", ", ".join(f"{r.PLAYER_NAME}{'+' if r.BREAKOUT else ''}" for r in g.itertuples()), f"→ {int(g['BREAKOUT'].sum())}/10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(exclude_elite="--no-elite" in sys.argv))
