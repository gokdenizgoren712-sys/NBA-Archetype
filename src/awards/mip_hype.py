# -*- coding: utf-8 -*-
"""Sentetik hype: modelin KENDİ yanlış pozitiflerinden öğrenilen "bariz aday" cezası (videodaki hype indeksinin veri-türevi karşılığı).

Mekanik (senin fikrin): her sezon sonunda model "ilk 30 aday"ını listeler; gerçekte top-10 MIP finisher olmayanlar yanlış pozitiftir.
H aşaması, GEÇMİŞ sezonların ilk-30 listelerinde "hangi tip aday tutmuyor"u öğrenir (özellikler yalnız sezon öncesi bilgi: rookie yılında elit olmak,
seviye, yaş, çıkış yaşı, tarihçe ...). Hype = H'nin "bu aday büyük ihtimalle tutmaz" logiti (sezon içi z-skoru).
Sıralama (videodaki gibi): skor' = skor − λ·hype. Walk-forward: t sezonu için H yalnız t'den önceki sezonların listeleriyle eğitilir.

    python -m src.awards.mip_hype
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.awards import mip_model as mm

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
BASE = "L_B2sh"
LIST_K = 30                 # H'nin öğrendiği aday listesi büyüklüğü (modelin ilk 30'u)
H_FEATS = ["ELITE_SOPH", "SOPH", "SECOND", "VORP_pct", "BPM_pct", "MPG_pct", "USG_pct", "PTS36_pct", "AGE", "DEBUT_AGE", "PEAK_VORP", "PRIOR_MIP_MAX", "SEASONS", "D_BASE"]
C_H = 0.3
DEFAULT_LAMBDA = 0.4         # varsayılan hype ağırlığı (B8f: 2000-26 yarar tavanı λ ≈ 0.4-0.5; videodaki 0.65 uydurmaydı)


def add_obvious(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["SOPH"] = (d["SEASONS"] == 1).astype(float)                            # rookie yılını bitirdi
    d["SECOND"] = (d["SEASONS"] == 2).astype(float)
    d["ELITE_SOPH"] = ((d["SEASONS"] == 1) & (d["VORP_pct"] >= 0.85)).astype(float)
    d["DEBUT_AGE"] = (d["AGE"] - d["SEASONS"] + 1).clip(18, 30)
    return d


def hype_walk_forward(d: pd.DataFrame, first: int = 1996, last: int = 2027, base: str = BASE, list_k: int | None = None) -> pd.DataFrame:
    """Her t için: t'den önceki sezonların ilk-30 listelerinden H'yi eğit, t'nin ilk-30'unu puanla. hype = H logitinin ters işaretlisi (z-skoru)."""
    k = list_k or LIST_K
    d = add_obvious(d)
    d["rkB"] = d.groupby("T")[base].rank(ascending=False)
    d["D_BASE"] = d[base]
    d["hit"] = ((d["RANK_N"] <= 10) & d["RANK_N"].notna()).astype(int)
    d["hype"] = np.nan
    for t in range(first, last + 1):
        tr = d[(d["T"] < t) & (d["rkB"] <= k) & (d["LABELED"] == 1) & d[base].notna()]
        cur = (d["T"] == t) & (d["rkB"] <= k)
        if tr["hit"].sum() < 30 or not cur.any():
            continue
        X = tr[H_FEATS].astype(float)
        med = X.median()
        mu, sd = X.fillna(med).mean(), X.fillna(med).std() + 1e-9
        clf = LogisticRegression(C=C_H, max_iter=1000).fit(((X.fillna(med) - mu) / sd).to_numpy(), tr["hit"].to_numpy())
        z = ((d.loc[cur, H_FEATS].astype(float).fillna(med) - mu) / sd).to_numpy()
        logit_hit = clf.decision_function(z)
        h = -(logit_hit - logit_hit.mean()) / (logit_hit.std() + 1e-9)                   # + : "bu aday büyük ihtimalle tutmaz" (sezon içi z-skoru)
        d.loc[cur, "hype"] = h
        if t == last:
            d.attrs["H_coefs"] = dict(zip(H_FEATS, clf.coef_[0].round(3)))
    return d


def rerank(d: pd.DataFrame, lam: float = DEFAULT_LAMBDA, base: str = BASE) -> pd.Series:
    """skor' = skor − λ·hype (yalnız ilk-30 listesindekiler; geri kalanlar eski sırada, listenin arkasında)."""
    s = d[base] - lam * d["hype"].fillna(0.0)
    return s.where(d["hype"].notna(), d[base] - 100.0)


def predict(top: int = 10, lam: float = DEFAULT_LAMBDA, ds: pd.DataFrame | None = None) -> pd.DataFrame:
    """2026-27 aday listesi: üretim modeli (B2sh, tüm geçmişle eğitilmiş) + sentetik hype (λ varsayılan 0.4).
    Sütunlar: sıra, oyuncu, yaş, hype'sız sıra, hype (z; + = 'tutmaz' eğilimi), P_top10 (kalibre, hype'sız modelden), P_win."""
    ds = mm.load() if ds is None else ds
    w = mm.walk_forward(ds, None)
    d = hype_walk_forward(w)
    cal = mm.calibrate(w, BASE)
    a, b = cal["platt"]
    cur = d[d["T"] == d["T"].max()].copy()
    cur["rk_nohype"] = cur[BASE].rank(ascending=False, method="first").astype(int)
    cur["score_hype"] = rerank(cur, lam)
    cur["P_top10"] = 1 / (1 + np.exp(-(a + b * cur[BASE])))
    z = cal["beta"] * cur[BASE]
    cur["P_win"] = np.exp(z - z.max()) / np.exp(z - z.max()).sum()
    out = cur.sort_values("score_hype", ascending=False).head(top).copy()
    out.insert(0, "rank", range(1, len(out) + 1))
    cols = ["rank", "PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "SEASONS", "MPG", "BPM", "rk_nohype", "hype", "P_top10", "P_win"]
    return out[cols].round(3).reset_index(drop=True)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if "--predict" in sys.argv:
        lst = predict(top=15)
        lst.to_parquet(DATA / "awards__mip_2026-27_candidates.parquet")
        print(f"2026-27 MIP breakout listesi (üretim modeli + sentetik hype, λ = {DEFAULT_LAMBDA}):")
        print(lst.to_string(index=False))
        return 0
    ds = mm.load()
    w = pd.read_parquet(DATA / "awards__mip_wf_b2sh.parquet") if (DATA / "awards__mip_wf_b2sh.parquet").exists() else mm.walk_forward(ds, None)
    d = hype_walk_forward(w)
    print("VİDEO ÖLÇÜTÜ: ilk 10 tahminden kaçı gerçek top-10 MIP finisher (liste başına ortalama), λ duyarlılığı")
    print(f"  {'λ':>5s} {'2023-26':>9s} {'2011-26':>9s} {'2000-26':>9s}   {'ilk3 (2000-26)':>14s}")
    for lam in (0.0, 0.4, 0.65, 0.8, 1.2, 2.0):
        d["_s"] = rerank(d, lam)
        h = [mm.finisher_hits(d, "_s", range(a, 2027)).mean() for a in (2023, 2011, 2000)]
        h3 = mm.finisher_hits(d, "_s", range(2000, 2027), topn=3).mean()
        print(f"  {lam:5.2f} {h[0]:9.2f} {h[1]:9.2f} {h[2]:9.2f}   {h3:14.2f}")
    print("\nH katsayıları (2026-27 için son eğitim; + = 'tutma olasılığı yüksek', hype = bunun tersi):")
    print(dict(sorted(d.attrs["H_coefs"].items(), key=lambda kv: -abs(kv[1]))))
    d.to_parquet(DATA / "awards__mip_hype_walkforward.parquet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
