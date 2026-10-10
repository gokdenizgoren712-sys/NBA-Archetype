# -*- coding: utf-8 -*-
"""ROY (Yılın Çaylağı): çaylakların sezon öncesi bilgisi yalnız draft sırası, kolej / uluslararası, yaş ve takımın açılan dakikası.

Veri yapısı diğer ödüllerden ayrı: satır = o sezon ilk NBA sezonunu oynayan oyuncu (önceki sezonu yok). Özellikler (hepsi sezon öncesi bilinir):
  PICK / LOG_PICK, LOTTERY (≤ 14), TOP3, UNDRAFTED, COLLEGE (kolej var mı), AGE (sezon başı yaş), DRAFT_LAG (draft ile ilk sezon arası yıl: "stash"),
  TEAM_OPEN (takımın önceki sezon dakikasının kaçı bu sezon kadroda değil; açılan rol).
Etiket: ROY oy payı. Model: ağırlıklı lojistik (walk-forward). Taban: yalnız draft sırası. Hype yok (pick zaten hype'ın kendisi).

    python -m src.awards.roy
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

from src.awards import mip_data as md
from src.awards import mip_model as mm

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
FEATS = ["LOG_PICK", "LOTTERY", "TOP3", "UNDRAFTED", "COLLEGE", "AGE", "DRAFT_LAG", "TEAM_OPEN"]
COLLEGE_FEATS = ["C_PTS40", "C_REB40", "C_AST40", "C_STL40", "C_BLK40", "C_TS", "C_USG", "C_BPM", "C_OBPM", "C_DBPM", "C_AGE", "C_SOS", "C_MPG", "C_OVR", "C_HT"]


def drafts() -> pd.DataFrame:
    fr = [pd.read_parquet(f) for f in sorted(DATA.glob("draft__????.parquet"))]
    d = pd.concat(fr, ignore_index=True)
    d = d[(d["PLAYER_NAME"] != "Player") & d["PICK"].notna()].copy()          # tablo içi başlık satırları
    d["SLUG"] = d["BREF_SLUG"]
    return d


def team_open(prev_year: int, year: int) -> pd.Series:
    """Takım → önceki sezon dakikasının bu sezon kadroda olmayan payı (açılan rol; emeklilik ve ayrılanlar dahil)."""
    rp, rn = md.team_rows(prev_year), md.team_rows(year)
    if rp.empty or rn.empty:
        return pd.Series(dtype=float)
    now = md.main_team(rn)
    rp = rp.sort_values("MP", ascending=False).drop_duplicates("SLUG")
    rp["gone"] = rp["SLUG"].map(now) != rp["TEAM"]
    tot = rp.groupby("TEAM")["MP"].sum()
    gone = rp[rp["gone"]].groupby("TEAM")["MP"].sum()
    return (gone / tot).fillna(0.0)


def _fold(s) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(ch for ch in "".join(c for c in s if not unicodedata.combining(c)).lower() if ch.isalnum())


def college_features(d: pd.DataFrame) -> pd.DataFrame:
    """Draft yılı Y olan oyuncu için NCAA (Y−1)-Y sezonu (Torvik): 40 dakikaya göre üretim, verimlilik, kullanım, BPM, yaş, lig gücü, boy, genel skor.
    Eşleme: katlanmış ad (aynı adlıda en çok dakikalı); kolejsiz / eşleşmeyen satır NaN (bilinmiyor)."""
    cache: dict[int, pd.DataFrame] = {}
    cols = {"C_PTS40": None, "C_REB40": None, "C_AST40": None, "C_STL40": None, "C_BLK40": None, "C_TS": "TS_PCT", "C_USG": "USG_PCT", "C_BPM": "BPM",
            "C_OBPM": "OBPM", "C_DBPM": "DBPM", "C_AGE": "AGE", "C_SOS": "CONF_ADJEM", "C_MPG": "MIN", "C_OVR": "overall_score", "C_HT": "PLAYER_HEIGHT_INCHES"}
    out = pd.DataFrame(np.nan, index=d.index, columns=list(cols))
    for y in sorted(d["DRAFT_YEAR"].dropna().unique()):
        y = int(y)
        f = DATA / f"ncaa__{y - 1}-{str(y)[2:]}__player_scores.parquet"
        if not f.exists():
            continue
        n = pd.read_parquet(f)
        n["key"] = n["PLAYER_NAME"].map(_fold)
        n = n.sort_values("MIN", ascending=False).drop_duplicates("key").set_index("key")
        rows = d.index[d["DRAFT_YEAR"] == y]
        m = n.reindex(d.loc[rows, "PLAYER_NAME"].map(_fold).to_numpy())
        m.index = rows
        mp = m["MIN"].where(m["MIN"] > 0)
        for c, src in cols.items():
            if src is not None and src in m.columns:
                out.loc[rows, c] = m[src].to_numpy(float)
        # MIN kolejde maç başı dakika; PTS, REB ... maç başı ortalama: 40 dakikaya ölçekle
        for c, s_ in (("C_PTS40", "PTS"), ("C_REB40", "REB"), ("C_AST40", "AST"), ("C_STL40", "STL"), ("C_BLK40", "BLK")):
            if s_ in m.columns:
                out.loc[rows, c] = (m[s_] / mp * 40.0).to_numpy(float)
    return out


def build(last_target: int = 2027) -> pd.DataFrame:
    dr = drafts()
    first_seen: dict[str, int] = {}
    frames: dict[int, pd.DataFrame] = {}
    for y in range(md.FIRST_FEATURE_END_YEAR, last_target + 1):
        try:
            f = md.season_frame(y)
        except FileNotFoundError:
            continue
        frames[y] = f
        for s in f["SLUG"]:
            first_seen.setdefault(s, y)
    votes = md.award_shares("roy")
    vote_seasons = set(votes["SEASON"].unique())
    out = []
    for t in range(md.FIRST_FEATURE_END_YEAR + 1, last_target + 1):
        f = frames.get(t)
        if f is not None:
            rk = f[f["SLUG"].map(first_seen) == t][["SLUG", "PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "MPG", "MP", "GP"]].copy()
        else:                                                       # henüz oynanmamış sezon: o yılın draft sınıfı
            rk = dr[dr["DRAFT_YEAR"] == t - 1][["SLUG", "PLAYER_NAME", "TEAM"]].rename(columns={"TEAM": "TEAM_ABBREVIATION"}).copy()
            rk["AGE"] = np.nan
        rk["T"] = t
        rk["TARGET_SEASON"] = md.season_label(t)
        out.append(rk)
    d = pd.concat(out, ignore_index=True)
    d = d.merge(dr[["SLUG", "PICK", "ROUND", "DRAFT_YEAR", "COLLEGE"]].drop_duplicates("SLUG"), on="SLUG", how="left")
    d["UNDRAFTED"] = d["PICK"].isna().astype(float)
    d["PICK_F"] = d["PICK"].fillna(70.0)
    d["LOG_PICK"] = np.log(d["PICK_F"])
    d["LOTTERY"] = (d["PICK_F"] <= 14).astype(float)
    d["TOP3"] = (d["PICK_F"] <= 3).astype(float)
    d["COLLEGE"] = d["COLLEGE"].fillna("").ne("").astype(float)
    d["DRAFT_LAG"] = ((d["T"] - 1) - d["DRAFT_YEAR"]).where(d["DRAFT_YEAR"].notna(), 0.0).clip(0, 10)
    opens = {t: team_open(t - 1, t) for t in range(md.FIRST_FEATURE_END_YEAR + 1, last_target + 1)}
    d["TEAM_OPEN"] = [opens[t].get(tm, np.nan) for t, tm in zip(d["T"], d["TEAM_ABBREVIATION"])]
    cf = college_features(d)
    for c in cf.columns:
        d[c] = cf[c].to_numpy()
    d["SHARE"], d["WINNER"], d["RANK"] = 0.0, 0, np.nan
    v = votes.rename(columns={"BREF_SLUG": "SLUG", "SEASON": "TARGET_SEASON"})[["SLUG", "TARGET_SEASON", "SHARE", "WINNER", "RANK"]]
    d = d.drop(columns=["SHARE", "WINNER", "RANK"]).merge(v, on=["SLUG", "TARGET_SEASON"], how="left")
    d["SHARE"], d["WINNER"] = d["SHARE"].fillna(0.0), d["WINNER"].fillna(0).astype(int)
    d["LABELED"] = d["TARGET_SEASON"].isin(vote_seasons).astype(int)
    d["RANK_N"] = pd.to_numeric(d["RANK"].astype(str).str.replace("T", "", regex=False), errors="coerce")
    return d


def walk_forward(d: pd.DataFrame, feats: list[str], first: int = 1996, last: int = 2027) -> pd.Series:
    out = pd.Series(np.nan, index=d.index)
    for t in range(first, last + 1):
        tr = d[(d["T"] < t) & (d["LABELED"] == 1)]
        cur = d["T"] == t
        if cur.any() and tr["SHARE"].gt(0).sum() >= 20:
            out[cur] = mm.Logit(feats).fit(tr).logit(d[cur])
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    d = build()
    ev = d[(d["LABELED"] == 1) & (d["T"] >= 1986)]
    cov = ev[ev["SHARE"] > 0].shape[0] / max(votes_total(), 1)
    print(f"Satır {len(d)}, etiketli çaylak {len(ev)}, oy alan çaylakların veri setinde bulunma oranı {cov:.0%}")
    d["L_ROY"] = walk_forward(d, FEATS)
    d["L_ROY_COL"] = walk_forward(d, FEATS + COLLEGE_FEATS, first=2014)
    d["L_ROY_PICK"] = walk_forward(d, ["LOG_PICK", "LOTTERY", "TOP3", "UNDRAFTED"], first=2014)
    print("Kolej istatistikleri (2014-26; kolej 2008-09'dan beri): ilk 5 tahminden kaçı top-5 finisher; kazananın sırası")
    for nm, c in (("model (pick, yaş, takım)", "L_ROY"), ("yalnız pick özellikleri", "L_ROY_PICK"), ("+ kolej istatistikleri", "L_ROY_COL"), ("yalnız draft sırası", "L_PICK")):
        if c == "L_PICK":
            d["L_PICK"] = -d["PICK_F"]
        h5 = mm.finisher_hits(d, c, range(2014, 2027), topn=5, k=5).mean()
        wr = [int(g[c].rank(ascending=False)[g[g["WINNER"] == 1].index[0]]) for t in range(2014, 2027)
              for g in [d[(d["T"] == t) & (d["LABELED"] == 1)]] if (g["WINNER"] == 1).any()]
        print(f"  {nm:30s} top-5/5 {h5:.2f}  kazanan 1.'si %{np.mean(np.array(wr) == 1):.0%}, ilk 3'te %{np.mean(np.array(wr) <= 3):.0%}, medyan {np.median(wr):.0f}")
    d["L_PICK"] = -d["PICK_F"]
    d["rastgele"] = np.random.default_rng(0).random(len(d))
    print("ROY: ilk 5 tahminden kaçı gerçek top-5 finisher / ilk 10'dan kaçı top-10 finisher; liste başına ortalama (2000-26)")
    for nm, c in (("model", "L_ROY"), ("yalnız draft sırası", "L_PICK"), ("rastgele", "rastgele")):
        h5 = mm.finisher_hits(d, c, range(2000, 2027), topn=5, k=5).mean()
        h10 = mm.finisher_hits(d, c, range(2000, 2027), topn=10, k=10).mean()
        h5b = mm.finisher_hits(d, c, range(2011, 2027), topn=5, k=5).mean()
        print(f"  {nm:22s} top-5/5: {h5:.2f} (2011-26: {h5b:.2f})   top-10/10: {h10:.2f}")
    wr = []
    for t in range(2000, 2027):
        g = d[(d["T"] == t) & (d["LABELED"] == 1)]
        w = g[g["WINNER"] == 1]
        if len(w):
            wr.append(int(g["L_ROY"].rank(ascending=False)[w.index[0]]))
    wr = np.array(wr)
    print(f"  kazanan: modelin 1.'si %{(wr == 1).mean():.0%}, ilk 3'te %{(wr <= 3).mean():.0%}, ilk 5'te %{(wr <= 5).mean():.0%}, medyan sıra {np.median(wr):.0f}")
    pr = []
    for t in range(2000, 2027):
        g = d[(d["T"] == t) & (d["LABELED"] == 1)]
        w = g[g["WINNER"] == 1]
        if len(w):
            pr.append(int(g["L_PICK"].rank(ascending=False)[w.index[0]]))
    pr = np.array(pr)
    print(f"  kazanan (yalnız draft sırası): 1.'si %{(pr == 1).mean():.0%}, ilk 3'te %{(pr <= 3).mean():.0%}, ilk 5'te %{(pr <= 5).mean():.0%}, medyan sıra {np.median(pr):.0f}")
    best = "L_ROY_COL"
    cur = d[d["T"] == 2027].sort_values(best, ascending=False).head(10)
    print("2026-27 çaylak (ROY) adayları (kolej istatistikli model):")
    print(cur[["PLAYER_NAME", "TEAM_ABBREVIATION", "PICK", "C_PTS40", "C_BPM", "C_AGE", best]].round(2).to_string(index=False))
    d.to_parquet(DATA / "awards__roy_walkforward.parquet")
    return 0


def votes_total() -> int:
    v = md.award_shares("roy")
    return int((v["SEASON"].map(lambda s: int(s[:4]) + 1) >= 1986).sum())


if __name__ == "__main__":
    raise SystemExit(main())
