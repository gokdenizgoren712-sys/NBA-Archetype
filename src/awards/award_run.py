# -*- coding: utf-8 -*-
"""Ödül-bağımsız hat: MIP'te kurulan mekanik (walk-forward + küçültme + sentetik hype) diğer ödüllere genişletildi.

Aynı iskelet: satır = (oyuncu, hedef sezon t), özellikler t−1'den (veya son NBA sezonundan), etiket = o ödülün oy payı.
Üretim modeli: ağırlıklı lojistik (ağırlık 1 + 10·pay), önce ödüle özgü özellik kümesi; ikinci aşama: modelin ilk-30 yanlış pozitiflerinden
öğrenilen sentetik hype, `skor − λ·hype` (λ = 0.4 varsayılan). Ölçüt: videodaki gibi, ilk 10 tahminden kaçı gerçek top-10 finisher.

    python -m src.awards.award_run                  # MVP, DPOY, 6MOY
    python -m src.awards.award_run mvp dpoy
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

from src.awards import mip_hype as mh
from src.awards import mip_model as mm
from src.awards import mip_rank as mr

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SHRUNK = ["PTS36_sh", "AST36_sh", "REB36_sh", "TS_sh", "g1_PTS_sh"]
COMMON = mm.LEVELS_NOA + mm.GROWTH + SHRUNK + ["PREV_SHARE"]
FEATS = {
    "mvp": COMMON + ["WS_pct", "OBPM_pct", "PTS36_pct", "AST36_pct", "USG_pct"],
    "dpoy": COMMON + ["DBPM_pct", "STL36_pct", "BLK36_pct", "TRB_PCT_pct", "WS_pct"],
    "smoy": COMMON + ["TEAM_SHARE", "TEAM_RANK_C", "OBPM_pct", "PTS36_pct"],
}
LABEL = {"mvp": "MVP", "dpoy": "DPOY", "smoy": "6MOY", "mip": "MIP"}


def run(award: str, lam: float = mh.DEFAULT_LAMBDA, first_b: int = 1992) -> pd.DataFrame:
    ds = mr.features_v2(mm.load(award))
    feats = list(dict.fromkeys(FEATS[award]))
    out = pd.Series(np.nan, index=ds.index)
    for t in range(first_b, 2028):
        tr = ds[(ds["T"] < t) & (ds["LABELED"] == 1)]
        cur = ds["T"] == t
        if not cur.any() or tr["SHARE"].gt(0).sum() < 30:
            continue
        out[cur] = mm.Logit(feats).fit(tr).logit(ds[cur])
    ds["L_BASE"] = out
    d = mh.hype_walk_forward(ds, base="L_BASE")
    d["S_HYPE"] = mh.rerank(d, lam, base="L_BASE")
    return d


def summarize(award: str, d: pd.DataFrame) -> dict:
    res = {}
    cols = {"model (hype'sız)": "L_BASE", f"model + hype (λ={mh.DEFAULT_LAMBDA})": "S_HYPE",
            "geçen yılın oy payı": "PREV_SHARE", "geçen yılın VORP persantili": "VORP_pct",
            "genç + üretken": None}
    d = d.copy()
    d["genç + üretken"] = d["BPM_pct"].fillna(0) - 0.06 * (d["AGE"] - 22).clip(lower=0)
    d["rastgele"] = np.random.default_rng(0).random(len(d))
    for nm, c in {"model (hype'sız)": "L_BASE", "model + hype": "S_HYPE", "geçen yılın oy payı": "PREV_SHARE",
                  "geçen yılın VORP pers.": "VORP_pct", "genç + üretken": "genç + üretken", "rastgele": "rastgele"}.items():
        h = [mm.finisher_hits(d, c, range(a, 2027)).mean() for a in (2023, 2011, 2000)]
        res[nm] = h
    return res


def winner_stats(d: pd.DataFrame, col: str, start: int = 2000) -> tuple[float, float, float]:
    ranks = []
    for t in range(start, 2027):
        g = d[(d["T"] == t) & (d["LABELED"] == 1)]
        w = g[g["WINNER"] == 1]
        if len(w):
            ranks.append(int(g[col].rank(ascending=False)[w.index[0]]))
    r = np.array(ranks)
    return float((r <= 10).mean()), float((r <= 3).mean()), float(np.median(r))


def main(awards: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    for award in awards:
        d = run(award)
        s = summarize(award, d)
        print(f"\n=== {LABEL[award]} ===  (ilk 10 tahminden kaçı gerçek top-10 finisher; liste başına)")
        print(f"  {'':28s} {'2023-26':>8s} {'2011-26':>8s} {'2000-26':>8s}")
        for nm, h in s.items():
            print(f"  {nm:28s} {h[0]:8.2f} {h[1]:8.2f} {h[2]:8.2f}")
        for nm, c in (("hype'sız", "L_BASE"), ("hype'lı", "S_HYPE")):
            t10, t3, med = winner_stats(d, c)
            print(f"  kazanan ({nm}): ilk 10'da {t10:.0%}, ilk 3'te {t3:.0%}, medyan sıra {med:.0f}")
        diff = mm.finisher_hits(d, "S_HYPE", range(2000, 2027)) - mm.finisher_hits(d, "L_BASE", range(2000, 2027))
        print(f"  hype farkı (2000-26): {diff.mean():+.2f} ± {diff.std(ddof=1) / np.sqrt(len(diff)):.2f}")
        cur = d[d["T"] == d["T"].max()].sort_values("S_HYPE", ascending=False).head(10)
        cur["rk0"] = d[d["T"] == d["T"].max()]["L_BASE"].rank(ascending=False, method="first").loc[cur.index].astype(int)
        print(f"  2026-27 {LABEL[award]} adayları:")
        print("   " + cur[["PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "rk0", "hype"]].round(2).to_string(index=False).replace("\n", "\n   "))
        d.to_parquet(DATA / f"awards__{award}_walkforward.parquet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main([a for a in sys.argv[1:] if not a.startswith("-")] or ["mvp", "dpoy", "smoy"]))
