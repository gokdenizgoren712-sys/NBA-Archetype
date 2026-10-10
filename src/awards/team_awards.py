# -*- coding: utf-8 -*-
"""All-NBA (15 kişi, 3 takım; 2 G + 2 F + 1 C) ve All-Defense (10 kişi, 2 takım): "takıma girmek" hedefi.

Etiket: oy tablosunda `TEAM_LABEL` ∈ {1st, 2nd, 3rd} (All-NBA) / {1st, 2nd} (All-Defense). Eğitim hedefi yalnız takıma girenler pozitif
(ağırlık 1 + 10·pay). Ölçüt: modelin ilk K'sından kaçı gerçekten takıma girdi (K = 15 / 10). Tabanlar: geçen yıl takıma girmek, geçen yılın oy payı,
VORP persantili, rastgele. Olasılık: walk-forward Platt (P(takıma girme)); pozisyon kısıtlı takım dizilimi (açgözlü) ayrıca verilir.

    python -m src.awards.team_awards
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.awards import award_run as ar
from src.awards import mip_model as mm
from src.awards import mip_rank as mr

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SPEC = {
    "allnba": {"labels": ("1st", "2nd", "3rd"), "k": 15, "name": "All-NBA", "feats": ar.FEATS_BASE["mvp"] + ar.TEAM},
    "alldef": {"labels": ("1st", "2nd"), "k": 10, "name": "All-Defense", "feats": ar.FEATS_BASE["dpoy"] + ar.TEAM},
}


def made_flags(labels: pd.Series, n_teams: int) -> pd.Series:
    """Takım etiketi → takıma girdi mi. Biçimler: "1st / 2nd / 3rd" (eski), "1T / 2T / 3T" (2021-22'den beri); boş / bilinmeyen = girmedi."""
    num = pd.to_numeric(labels.astype(str).str.extract(r"^(\d)")[0], errors="coerce")
    return ((num >= 1) & (num <= n_teams)).astype(int)


def load(award: str) -> pd.DataFrame:
    d = mr.features_v2(mm.load(award))
    # Etiket biçimi sezona göre değişir: "1st / 2nd / 3rd" (eski) ve "1T / 2T / 3T" (2021-22'den beri); ilk rakam takım numarasıdır
    d["MADE"] = made_flags(d["TEAM_LABEL"], len(SPEC[award]["labels"])) if "TEAM_LABEL" in d.columns else 0
    d["SHARE_RAW"] = d["SHARE"]
    d["SHARE"] = np.where(d["MADE"] == 1, 0.5 + d["SHARE_RAW"].fillna(0), 0.0)         # pozitif = takıma girdi
    # geçen yıl takıma girmek: PREV_SHARE (bir önceki sezonun ham payı) ham paydan gelir
    d["PREV_MADE"] = (d["PREV_SHARE"] > 0).astype(float)
    return d


def walk_forward(d: pd.DataFrame, feats: list[str], first: int = 1992, last: int = 2027) -> pd.Series:
    out = pd.Series(np.nan, index=d.index)
    for t in range(first, last + 1):
        tr = d[(d["T"] < t) & (d["LABELED"] == 1)]
        cur = d["T"] == t
        if cur.any() and tr["MADE"].sum() >= 30:
            out[cur] = mm.Logit(feats).fit(tr).logit(d[cur])
    return out


def made_hits(d: pd.DataFrame, col: str, seasons: range, k: int) -> np.ndarray:
    out = []
    for t in seasons:
        g = d[(d["T"] == t) & (d["LABELED"] == 1)]
        top = g.sort_values(col, ascending=False).head(k)
        out.append(int(top["MADE"].sum()))
    return np.array(out)


def positions(base_year: int) -> pd.Series:
    p = DATA / f"{md_label(base_year)}__bref_pergame.parquet"
    if not p.exists():
        return pd.Series(dtype=object)
    d = pd.read_parquet(p)
    d["SLUG"] = d["BREF_SLUG"].astype(str).str.split("/").str[-1]
    d = d.sort_values("GP", ascending=False).drop_duplicates("SLUG")
    g = d["POSITION_raw"].astype(str).str.split("-").str[0].map({"PG": "G", "SG": "G", "G": "G", "SF": "F", "PF": "F", "F": "F", "C": "C"})
    return pd.Series(g.to_numpy(), index=d["SLUG"].to_numpy())


def md_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[2:]}"


def teams(cur: pd.DataFrame, n_teams: int, p_col: str = "P_MAKE") -> list[list[str]]:
    """Açgözlü pozisyonlu dizilim: takım başına 2 G + 2 F + 1 C (All-NBA); en yüksek olasılıktan başlayarak."""
    pool = cur.sort_values(p_col, ascending=False)
    slots = {"G": 2, "F": 2, "C": 1}
    out = []
    used: set = set()
    for _ in range(n_teams):
        cnt = {"G": 0, "F": 0, "C": 0}
        team = []
        for r in pool.itertuples():
            if r.SLUG in used:
                continue
            pos = r.POS if r.POS in slots else "F"
            if cnt[pos] < slots[pos]:
                cnt[pos] += 1
                team.append(f"{r.PLAYER_NAME} ({pos}, {getattr(r, p_col) * 100:.0f}%)")
                used.add(r.SLUG)
            if sum(cnt.values()) == 5:
                break
        out.append(team)
    return out


def run(award: str) -> pd.DataFrame:
    sp = SPEC[award]
    d = load(award)
    feats = list(dict.fromkeys(sp["feats"] + ["PREV_MADE"]))
    d["L_BASE"] = walk_forward(d, feats)
    d["L_PREV_MADE"] = d["PREV_MADE"] + 1e-3 * d["PREV_SHARE"].fillna(0)
    d["L_VORP"] = d["VORP_pct"].fillna(0)
    d["L_RAND"] = np.random.default_rng(0).random(len(d))
    return d


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    for award in ("allnba", "alldef"):
        sp = SPEC[award]
        d = run(award)
        k = sp["k"]
        print(f"\n=== {sp['name']} === (modelin ilk {k}'inden kaçı takıma girdi; liste başına)")
        print(f"  {'':30s} {'2023-26':>8s} {'2011-26':>8s} {'2000-26':>8s}")
        for nm, c in (("model", "L_BASE"), ("geçen yıl takımdaydı", "L_PREV_MADE"), ("VORP persantili", "L_VORP"), ("rastgele", "L_RAND")):
            h = [made_hits(d, c, range(a, 2027), k).mean() for a in (2023, 2011, 2000)]
            print(f"  {nm:30s} {h[0]:8.2f} {h[1]:8.2f} {h[2]:8.2f}")
        diff = made_hits(d, "L_BASE", range(2000, 2027), k) - made_hits(d, "L_PREV_MADE", range(2000, 2027), k)
        print(f"  model − geçen yıl takımda: {diff.mean():+.2f} ± {diff.std(ddof=1) / np.sqrt(len(diff)):.2f}")
        # olasılık: walk-forward Platt
        ev = d[(d["T"] >= 2000) & (d["T"] <= 2026) & (d["LABELED"] == 1) & d["L_BASE"].notna()]
        pl = LogisticRegression(C=1e6, max_iter=1000).fit(ev[["L_BASE"]].to_numpy(), ev["MADE"].to_numpy())
        cur = d[d["T"] == d["T"].max()].copy()
        cur["P_MAKE"] = pl.predict_proba(cur[["L_BASE"]].to_numpy())[:, 1]
        pos = positions(d["T"].max() - 1)
        cur["POS"] = cur["SLUG"].map(pos).fillna("F")
        top = cur.sort_values("P_MAKE", ascending=False).head(k + 8)
        print(f"  beklenen takım üyesi sayısı (tüm havuz): {cur['P_MAKE'].sum():.1f} (gerçek {k})")
        print(f"  2026-27 {sp['name']} adayları (P(takıma girme)):")
        for r in top.itertuples():
            print(f"    {r.PLAYER_NAME:26s} {r.TEAM_ABBREVIATION:4s} {int(r.AGE):3d}  {r.P_MAKE * 100:5.1f}%  [{r.POS}]")
        if award == "allnba":
            for i, tm in enumerate(teams(cur, 3), 1):
                print(f"  Tahmini {i}. takım: " + ", ".join(tm))
        d.to_parquet(DATA / f"awards__{award}_walkforward.parquet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
