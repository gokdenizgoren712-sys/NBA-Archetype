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


def add_obvious(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["SOPH"] = (d["SEASONS"] == 1).astype(float)                            # rookie yılını bitirdi
    d["SECOND"] = (d["SEASONS"] == 2).astype(float)
    d["ELITE_SOPH"] = ((d["SEASONS"] == 1) & (d["VORP_pct"] >= 0.85)).astype(float)
    d["DEBUT_AGE"] = (d["AGE"] - d["SEASONS"] + 1).clip(18, 30)
    return d


def hype_walk_forward(d: pd.DataFrame, first: int = 1996, last: int = 2027) -> pd.DataFrame:
    """Her t için: t'den önceki sezonların ilk-30 listelerinden H'yi eğit, t'nin ilk-30'unu puanla. hype = H logitinin ters işaretlisi (z-skoru)."""
    d = add_obvious(d)
    d["rkB"] = d.groupby("T")[BASE].rank(ascending=False)
    d["D_BASE"] = d[BASE]
    d["hit"] = ((d["RANK_N"] <= 10) & d["RANK_N"].notna()).astype(int)
    d["hype"] = np.nan
    for t in range(first, last + 1):
        tr = d[(d["T"] < t) & (d["rkB"] <= LIST_K) & (d["LABELED"] == 1) & d[BASE].notna()]
        cur = (d["T"] == t) & (d["rkB"] <= LIST_K)
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


def rerank(d: pd.DataFrame, lam: float) -> pd.Series:
    """skor' = skor − λ·hype (yalnız ilk-30 listesindekiler; geri kalanlar eski sırada, listenin arkasında)."""
    s = d[BASE] - lam * d["hype"].fillna(0.0)
    return s.where(d["hype"].notna(), d[BASE] - 100.0)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
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
