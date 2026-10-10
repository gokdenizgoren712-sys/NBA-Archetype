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
TEAM = ["TM_WIN_PCT", "TM_SRS", "TM_NRTG", "TM_ORTG", "TM_DRTG", "TMB_WIN_PCT", "TMB_SRS"]      # t'de oynayacağı takımın geçen sezonu + eski takımı
GS = ["GS_FRAC", "GS_FRAC_P1", "GS_CAREER"]                                                   # başlangıç oranı: yedek rolü
FEATS_BASE = {
    "mvp": COMMON + ["WS_pct", "OBPM_pct", "PTS36_pct", "AST36_pct", "USG_pct"],
    "dpoy": COMMON + ["DBPM_pct", "STL36_pct", "BLK36_pct", "TRB_PCT_pct", "WS_pct"],
    "smoy": COMMON + ["TEAM_SHARE", "TEAM_RANK_C", "OBPM_pct", "PTS36_pct"],
}
FEATS_TEAM = {"mvp": FEATS_BASE["mvp"] + TEAM, "dpoy": FEATS_BASE["dpoy"] + TEAM}      # takım başarısı eklenmiş sürüm (B9e: fark yok, ±0.00 ± 0.10)
FEATS = {
    "mvp": FEATS_BASE["mvp"],                        # takım başarısı katkı vermediği için sade küme
    "dpoy": FEATS_BASE["dpoy"],
    "smoy": FEATS_BASE["smoy"] + GS + ["TM_WIN_PCT", "TM_NRTG"],
}
LABEL = {"mvp": "MVP", "dpoy": "DPOY", "smoy": "6MOY", "mip": "MIP"}


def run(award: str, lam: float = mh.DEFAULT_LAMBDA, first_b: int = 1992, feats: list[str] | None = None) -> pd.DataFrame:
    ds = mr.features_v2(mm.load(award))
    feats = list(dict.fromkeys(feats or FEATS[award]))
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


def plackett_luce(logits: np.ndarray, beta: float, ks=(1, 3, 5, 10), n: int = 20000, seed: int = 0) -> dict[int, np.ndarray]:
    """Skorlardan (beta·logit) Plackett-Luce sıralama olasılıkları: oyuncu başına P(sıra ≤ k). Gumbel hilesi: skor + Gumbel gürültüsü, sırala.
    P(1) softmax ile aynıdır; üst-k olasılıkları aynı kalibre edilmiş sıcaklıkla tutarlı gelir."""
    rng = np.random.default_rng(seed)
    z = beta * np.asarray(logits, float)
    g = rng.gumbel(size=(n, len(z)))
    order = np.argsort(-(z[None, :] + g), axis=1)
    ranks = np.empty_like(order)
    rows = np.arange(n)[:, None]
    ranks[rows, order] = np.arange(len(z))[None, :]
    return {k: (ranks < k).mean(axis=0) for k in ks}


def calibration_check(d: pd.DataFrame, beta: float, start: int = 2000, end: int = 2026) -> dict:
    """Walk-forward tahminlerde P(top-10) toplamı ile gerçekleşen top-10 sayısı ve P(kazanan) ortalama log-olasılığı."""
    exp10, act10, lw = [], [], []
    for t in range(start, end + 1):
        g = d[(d["T"] == t) & (d["LABELED"] == 1) & d["L_BASE"].notna()]
        if g.empty or g["WINNER"].sum() == 0:
            continue
        pl = plackett_luce(g["L_BASE"].to_numpy(), beta, ks=(1, 10), n=4000, seed=t)
        exp10.append(pl[10][np.argsort(-g["L_BASE"].to_numpy())[:10]].sum())      # modelin ilk 10'u için beklenen top-10 isabeti
        act10.append(int(((g.sort_values("L_BASE", ascending=False).head(10)["RANK_N"] <= 10)).sum()))
        w = g["WINNER"].to_numpy() == 1
        lw.append(float(np.log(max(pl[1][w][0], 1e-4))))
    return {"expected_top10_hits": float(np.mean(exp10)), "actual_top10_hits": float(np.mean(act10)), "winner_logp": float(np.mean(lw))}


def candidates_table(d: pd.DataFrame, award: str, n: int = 10, beta: float | None = None, hype: bool = False) -> pd.DataFrame:
    """2026-27 adayları yüzdeleriyle: P(kazanır), P(ilk 3), P(ilk 5), P(ilk 10)."""
    from sklearn.linear_model import LogisticRegression
    cal = mm.calibrate(d, "L_BASE")
    beta = beta or cal["beta"]
    cur = d[d["T"] == d["T"].max()].copy()
    cur = cur[cur["L_BASE"].notna()]
    # P(kazanır): kalibre edilmiş softmax (sezon içinde toplam 1). P(ilk k): walk-forward puanlardan doğrudan Platt kalibrasyonu (k = 3, 5, 10);
    # PL üst-k olasılıkları kazanan için kalibre edilen sıcaklıkla düşük kalıyordu (DPOY'da beklenen 2.45 ↔ gerçek 4.74 ilk-10 isabeti).
    z = beta * cur["L_BASE"].to_numpy()
    cur["P1"] = np.exp(z - z.max()) / np.exp(z - z.max()).sum()
    ev = d[(d["T"] >= 2000) & (d["T"] <= 2026) & (d["LABELED"] == 1) & d["L_BASE"].notna()]
    for k in (3, 5, 10):
        y = ((ev["RANK_N"] <= k) & ev["RANK_N"].notna()).astype(int)
        clf = LogisticRegression(C=1e6, max_iter=1000).fit(ev[["L_BASE"]].to_numpy(), y.to_numpy())
        cur[f"P{k}"] = clf.predict_proba(cur[["L_BASE"]].to_numpy())[:, 1]
    cur["P3"] = np.maximum(cur["P3"], cur["P1"])                  # tutarlılık: P(kazanır) ≤ P(ilk 3) ≤ P(ilk 5) ≤ P(ilk 10)
    cur["P5"] = np.maximum(cur["P5"], cur["P3"])
    cur["P10"] = np.maximum(cur["P10"], cur["P5"])
    cols = ["PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "P1", "P3", "P5", "P10"]
    out = cur.sort_values("L_BASE", ascending=False).head(n)[cols].copy()
    for c in ("P1", "P3", "P5", "P10"):
        out[c] = (out[c] * 100).round(1)
    out.columns = ["Oyuncu", "Takım", "Yaş", "Kazanır %", "İlk 3 %", "İlk 5 %", "İlk 10 %"]
    return out.reset_index(drop=True)


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
