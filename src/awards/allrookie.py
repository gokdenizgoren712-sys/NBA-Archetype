# -*- coding: utf-8 -*-
"""All-Rookie (2 takım, 10 çaylak): "takıma girmek" hedefi; ROY veri yapısı (satır = o sezon ilk NBA sezonunu oynayan oyuncu).

Özellikler sezon öncesi: draft sırası, kolej / uluslararası, yaş, draft ile ilk sezon arası yıl, takımın açılan dakikası ve kolej istatistikleri.
Ölçüt: modelin ilk 10'undan kaçı takıma girdi. Taban: draft sırası (ilk 10 pick). Olasılık: walk-forward Platt.

    python -m src.awards.allrookie
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.awards import mip_model as mm
from src.awards import roy as roy_mod
from src.awards import team_awards as ta

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
PICK = ["LOG_PICK", "LOTTERY", "TOP3", "UNDRAFTED"]


def load() -> pd.DataFrame:
    d = roy_mod.build(award="allrookie")
    d["MADE"] = ta.made_flags(d["TEAM_LABEL"], 2) if "TEAM_LABEL" in d.columns else 0
    d["SHARE_RAW"] = d["SHARE"]
    d["SHARE"] = np.where(d["MADE"] == 1, 0.5 + d["SHARE_RAW"].fillna(0), 0.0)
    return d


def made_hits(d: pd.DataFrame, col: str, seasons: range, k: int = 10) -> np.ndarray:
    return np.array([int(d[(d["T"] == t) & (d["LABELED"] == 1)].sort_values(col, ascending=False).head(k)["MADE"].sum()) for t in seasons])


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    d = load()
    ev = d[(d["LABELED"] == 1) & (d["T"] >= 1986)]
    print(f"Satır {len(d)}; takıma giren çaylak sayısı {int(ev['MADE'].sum())} (sezon başına ort. {ev.groupby('T')['MADE'].sum().mean():.1f})")
    d["L_PICKS"] = roy_mod.walk_forward(d, PICK, first=1996)
    d["L_MODEL"] = roy_mod.walk_forward(d, roy_mod.FEATS, first=1996)
    d["L_COL"] = roy_mod.walk_forward(d, roy_mod.FEATS + roy_mod.COLLEGE_FEATS, first=2014)
    d["L_ORDER"] = -d["PICK_F"]
    d["L_RAND"] = np.random.default_rng(0).random(len(d))
    print("All-Rookie: modelin ilk 10'undan kaçı takıma girdi (liste başına; 10 üye)")
    print(f"  {'':34s} {'2014-26':>8s} {'2000-26':>8s}")
    for nm, c in (("draft sırası (ilk 10 pick)", "L_ORDER"), ("yalnız pick özellikleri", "L_PICKS"), ("model (pick, yaş, takım)", "L_MODEL"), ("+ kolej istatistikleri", "L_COL"), ("rastgele", "L_RAND")):
        h14 = made_hits(d, c, range(2014, 2027)).mean()
        h00 = made_hits(d, c, range(2000, 2027)).mean() if c != "L_COL" else float("nan")
        print(f"  {nm:34s} {h14:8.2f} {h00:8.2f}")
    diff = made_hits(d, "L_MODEL", range(2000, 2027)) - made_hits(d, "L_ORDER", range(2000, 2027))
    print(f"  model − draft sırası (2000-26): {diff.mean():+.2f} ± {diff.std(ddof=1) / np.sqrt(len(diff)):.2f}")
    best = "L_MODEL" if made_hits(d, "L_MODEL", range(2014, 2027)).mean() >= made_hits(d, "L_COL", range(2014, 2027)).mean() else "L_COL"
    evl = d[(d["T"] >= 2000) & (d["T"] <= 2026) & (d["LABELED"] == 1) & d[best].notna()]
    pl = LogisticRegression(C=1e6, max_iter=1000).fit(evl[[best]].to_numpy(), evl["MADE"].to_numpy())
    cur = d[d["T"] == 2027].copy()
    cur["P_MAKE"] = pl.predict_proba(cur[[best]].to_numpy())[:, 1]
    print(f"  seçilen model: {best}; beklenen takım üyesi (tüm çaylak havuzu): {cur['P_MAKE'].sum():.1f} (gerçek 10)")
    top = cur.sort_values("P_MAKE", ascending=False).head(14)
    print("2026-27 All-Rookie adayları (P(takıma girme)):")
    for r in top.itertuples():
        print(f"    {r.PLAYER_NAME:24s} {str(r.TEAM_ABBREVIATION):4s} pick {int(r.PICK) if r.PICK == r.PICK else '-':>3}  {r.P_MAKE * 100:5.1f}%")
    d.to_parquet(DATA / "awards__allrookie_walkforward.parquet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
