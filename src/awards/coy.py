# -*- coding: utf-8 -*-
"""COY (Yılın Koçu): koç düzeyinde; satır = (koç, sezon). Hedef: oy payı.

COY, takımın beklentisini aşmasını ödüllendirir; sezon öncesi gözlenebilenler:
  PREV_WIN_PCT / PREV_SRS / PREV_NRTG : takımın geçen sezonu (franchise koduyla; takas / koç değişimi fark etmez)
  PREV_DELTA_WIN                      : geçen sezon ile ondan önceki sezon arasındaki galibiyet değişimi (ivme)
  NEW_COACH                           : franchise'da ilk sezonu (SEASONS_FRANCHISE == 1)
  COACH_EXP                           : toplam koçluk sezonu (kıdem)
  CONTINUITY                          : takımın geçen sezon dakikasının bu sezon kadroda kalan payı (1 − açılan rol)
  PREV_COY_SHARE                      : koçun bir önceki sezonki COY payı
Taban çizgileri: geçen yılın COY payı, geçen sezon galibiyet yüzdesi (yüksek = favori), "iyi takım + yeni kıdemli koç" kuralı yok.

    python -m src.awards.coy
"""

from __future__ import annotations

import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from src.awards import mip_data as md
from src.awards import mip_model as mm
from src.awards import roy as roy_mod

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
FEATS_BASE = ["PREV_WIN_PCT", "PREV_SRS", "PREV_NRTG", "PREV_DELTA_WIN", "NEW_COACH", "COACH_EXP", "CONTINUITY", "PREV_COY_SHARE", "PREV_W_FROM_COACH"]
FEATS_TALENT = FEATS_BASE + ["TALENT_DELTA", "TALENT_NOW", "TALENT_PREV"]      # yaz transferlerinin eklediği / kaybettirdiği yetenek (oyuncu VORP toplamı)
FEATS = FEATS_TALENT


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(ch for ch in "".join(c for c in s if not unicodedata.combining(c)).lower() if ch.isalnum())


def talent_by_team(t: int) -> pd.DataFrame:
    """Takım başına (franchise): t sezonunda kadroda olanların GEÇEN sezon VORP toplamı (TALENT_NOW) ve geçen sezon kendi takımında olanların VORP toplamı
    (TALENT_PREV). Fark = yaz transferlerinin eklediği yetenek. Kadro üyeliği sezon öncesi bilinir (yalnız üyelik, performans değil)."""
    try:
        base = md.season_frame(t - 1)[["SLUG", "VORP"]].set_index("SLUG")["VORP"]
    except FileNotFoundError:
        return pd.DataFrame(columns=["TALENT_NOW", "TALENT_PREV", "TALENT_DELTA"])
    rn = md.team_rows(t)
    rp = md.team_rows(t - 1)
    if rn.empty or rp.empty:
        return pd.DataFrame(columns=["TALENT_NOW", "TALENT_PREV", "TALENT_DELTA"])
    now = md.main_team(rn).map(md.franchise)
    prev = md.main_team(rp).map(md.franchise)
    a = now.map(lambda x: x).to_frame("FR").assign(V=base.reindex(now.index).fillna(0.0).to_numpy()).groupby("FR")["V"].sum()
    b = prev.to_frame("FR").assign(V=base.reindex(prev.index).fillna(0.0).to_numpy()).groupby("FR")["V"].sum()
    out = pd.DataFrame({"TALENT_NOW": a, "TALENT_PREV": b}).fillna(0.0)
    out["TALENT_DELTA"] = out["TALENT_NOW"] - out["TALENT_PREV"]
    return out


def build(last_target: int = 2027) -> pd.DataFrame:
    votes = md.award_shares("coy")
    votes["key"] = votes["PLAYER_NAME"].map(fold)           # COY tablosunda koç adı PLAYER_NAME sütununda
    vote_seasons = set(votes["SEASON"].unique())
    prior_share = {}
    for _, r in votes.iterrows():
        prior_share[(r["key"], int(r["SEASON"][:4]) + 1)] = r["SHARE"]
    rows = []
    for t in range(1986, last_target + 1):
        p = DATA / f"coach__{md.season_label(t)}.parquet"
        if not p.exists():
            continue
        c = pd.read_parquet(p)
        c = c[c["G"].fillna(0) >= 20].copy()                  # sezonun en az 20 maçında takımdaydı (geçici koçlar hariç)
        c["FR"] = c["TEAM"].map(md.franchise)
        prev, prev2 = md.team_season(t - 1).set_index("FR"), md.team_season(t - 2).set_index("FR")
        c["PREV_WIN_PCT"] = c["FR"].map(prev["WIN_PCT"]) if len(prev) else np.nan
        c["PREV_SRS"] = c["FR"].map(prev["SRS"]) if len(prev) else np.nan
        c["PREV_NRTG"] = c["FR"].map(prev["NRTG"]) if len(prev) else np.nan
        c["PREV_DELTA_WIN"] = c["PREV_WIN_PCT"] - (c["FR"].map(prev2["WIN_PCT"]) if len(prev2) else np.nan)
        c["NEW_COACH"] = (c["SEASONS_FRANCHISE"] == 1).astype(float)
        c["COACH_EXP"] = c["SEASONS_OVERALL"]
        op = roy_mod.team_open(t - 1, t)
        c["CONTINUITY"] = 1.0 - c["TEAM"].map(op)
        tal = talent_by_team(t)
        for col in ("TALENT_NOW", "TALENT_PREV", "TALENT_DELTA"):
            c[col] = c["FR"].map(tal[col]) if len(tal) else np.nan
        c["key"] = c["COACH"].map(fold)
        c["PREV_COY_SHARE"] = [prior_share.get((k, t - 1), 0.0) for k in c["key"]]
        # koçun geçen sezonki galibiyet yüzdesi (aynı koç): deneyim sinyali
        pc = pd.read_parquet(DATA / f"coach__{md.season_label(t - 1)}.parquet") if (DATA / f"coach__{md.season_label(t - 1)}.parquet").exists() else None
        if pc is not None:
            pc["key"] = pc["COACH"].map(fold)
            pc = pc[pc["G"].fillna(0) >= 20].sort_values("G", ascending=False).drop_duplicates("key").set_index("key")
            c["PREV_W_FROM_COACH"] = c["key"].map(pc["W"] / pc["G"].where(pc["G"] > 0))
        else:
            c["PREV_W_FROM_COACH"] = np.nan
        c["T"] = t
        c["TARGET_SEASON"] = md.season_label(t)
        rows.append(c)
    d = pd.concat(rows, ignore_index=True)
    v = votes.rename(columns={"SEASON": "TARGET_SEASON"})[["key", "TARGET_SEASON", "SHARE", "WINNER", "RANK"]]
    d = d.merge(v, on=["key", "TARGET_SEASON"], how="left")
    d["SHARE"], d["WINNER"] = d["SHARE"].fillna(0.0), d["WINNER"].fillna(0).astype(int)
    d["LABELED"] = d["TARGET_SEASON"].isin(vote_seasons).astype(int)
    d["RANK_N"] = pd.to_numeric(d["RANK"].astype(str).str.replace("T", "", regex=False), errors="coerce")
    d["PLAYER_NAME"] = d["COACH"]
    return d


def walk_forward(d: pd.DataFrame, feats: list[str], first: int = 1996, last: int = 2027) -> pd.Series:
    out = pd.Series(np.nan, index=d.index)
    for t in range(first, last + 1):
        tr = d[(d["T"] < t) & (d["LABELED"] == 1)]
        cur = d["T"] == t
        if cur.any() and tr["SHARE"].gt(0).sum() >= 30:
            out[cur] = mm.Logit(feats).fit(tr).logit(d[cur])
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    d = build()
    ev = d[(d["LABELED"] == 1) & (d["T"] >= 1996)]
    n_votes = md.award_shares("coy")
    cover = (ev["SHARE"] > 0).sum() / max(len(n_votes[n_votes["SEASON"].map(lambda s: int(s[:4]) + 1) >= 1996]), 1)
    print(f"Satır {len(d)}; oy alan koçların eşleşme oranı {cover:.0%}")
    d["L_COY_BASE"] = walk_forward(d, FEATS_BASE)
    d["L_COY"] = walk_forward(d, FEATS_TALENT)
    d["L_PREV_SHARE"] = d["PREV_COY_SHARE"]
    d["L_PREV_WIN"] = d["PREV_WIN_PCT"].fillna(0)
    d["L_RAND"] = np.random.default_rng(0).random(len(d))
    print("COY: ilk 10 tahminden kaçı gerçek top-10 finisher (30 koç içinden); liste başına")
    for nm, c in (("model (yetenek değişimi yok)", "L_COY_BASE"), ("model + yetenek değişimi", "L_COY"), ("geçen yılın COY payı", "L_PREV_SHARE"), ("geçen sezon galibiyet yüzdesi", "L_PREV_WIN"), ("rastgele", "L_RAND")):
        h = [mm.finisher_hits(d, c, range(a, 2027)).mean() for a in (2011, 2000)]
        print(f"  {nm:34s} 2011-26 {h[0]:.2f}   2000-26 {h[1]:.2f}")
    wr = []
    for t in range(2000, 2027):
        g = d[(d["T"] == t) & (d["LABELED"] == 1)]
        w = g[g["WINNER"] == 1]
        if len(w):
            wr.append(int(g["L_COY"].rank(ascending=False)[w.index[0]]))
    wr = np.array(wr)
    for lab, col in (("yetenek yok", "L_COY_BASE"), ("yetenek var", "L_COY")):
        diff = mm.finisher_hits(d, "L_COY", range(2000, 2027)) - mm.finisher_hits(d, "L_COY_BASE", range(2000, 2027))
    print(f"  yetenek değişimi farkı (2000-26): {diff.mean():+.2f} ± {diff.std(ddof=1) / np.sqrt(len(diff)):.2f}")
    print(f"  kazanan: ilk 10'da {(wr <= 10).mean():.0%}, ilk 3'te {(wr <= 3).mean():.0%}, medyan sıra {np.median(wr):.0f}")
    cur = d[d["T"] == d["T"].max()].sort_values("L_COY", ascending=False).head(10)
    print("\n2026-27 COY adayları:")
    print(cur[["COACH", "TEAM", "PREV_WIN_PCT", "PREV_NRTG", "NEW_COACH", "COACH_EXP", "CONTINUITY", "TALENT_DELTA", "L_COY"]].round(2).to_string(index=False))
    d.to_parquet(DATA / "awards__coy_walkforward.parquet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
