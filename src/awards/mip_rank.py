# -*- coding: utf-8 -*-
"""MIP ikinci tur: sıralama kaybı (ListNet) + genişletilmiş özellikler + yaş kutucukları.

İlk tur (mip_model.py) sorunları: yaş doğrusal / tek yönlü → modelin ilk 10'unun %81'i ≤ 21 yaş (kazananlar 20–26 arası dengeli);
model "momentum"u kovalıyor (önceki yıl zaten çok gelişmiş), kazananlar ise sürpriz; hedef oylamaya GİRMEKti, KİM KAZANIR değil.

Burada hedef sezon içi dağılım: q_i = PAY_i / Σ PAY (kazanan en çok kütle alır), skor softmax'ı q'ya yaklaştırılır (ListNet kaybı).
Walk-forward ve değerlendirme mip_model ile aynı (2000–2026), böylece karşılaştırma elma-elma.

    python -m src.awards.mip_rank
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.ensemble import HistGradientBoostingClassifier

from src.awards import mip_model as mm

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

AGE_BINS = [(0, 20, "age_le20"), (21, 21, "age_21"), (22, 22, "age_22"), (23, 23, "age_23"), (24, 24, "age_24"), (25, 26, "age_25_26"), (27, 29, "age_27_29"), (30, 99, "age_ge30")]
AGE_COLS = [n for _, _, n in AGE_BINS]
BASE = mm.LEVELS_NOA + mm.GROWTH                                   # ilk turun B2 özellikleri
LEVELS2 = ["TS_pct", "WS48_pct", "AST36_pct", "REB36_pct", "TRB_PCT_pct", "AST_PCT_pct", "MP_pct", "PTS36_pct"]
ROLE = ["TEAM_SHARE", "TEAM_RANK_C", "GP_FRAC"]
PRIOR = ["MPG_p1", "USG_p1", "BPM_p1", "PTS36_p1", "d2_MPG", "d2_USG", "d2_BPM", "d2_PTS36"]
CONTEXT = ["MOVED", "VAC", "ARR"]


def features_v2(ds: pd.DataFrame) -> pd.DataFrame:
    d = ds.copy()
    for lo, hi, name in AGE_BINS:
        d[name] = ((d["AGE"] >= lo) & (d["AGE"] <= hi)).astype(float)
    d["DEBUT_AGE"] = (d["AGE"] - d["SEASONS"] + 1).clip(18, 30)
    d["TEAM_RANK_C"] = d["TEAM_RANK"].clip(upper=10)
    gmax = d.groupby("END_YEAR")["GP"].transform("max")
    d["GP_FRAC"] = d["GP"] / gmax
    return d


def _u(cols):
    return list(dict.fromkeys(cols))


VARIANTS = {
    "LN_base": BASE,                                                          # yalnız kayıp değişti (B2 özellikleri)
    "LN_age": _u([c for c in BASE if c != "AGE"] + AGE_COLS),                       # + yaş kutucukları
    "LN_v2": _u([c for c in BASE if c != "AGE"] + AGE_COLS + ["DEBUT_AGE"] + LEVELS2 + ROLE + PRIOR + CONTEXT),
    "LN_v2_noage": _u([c for c in BASE if c != "AGE"] + LEVELS2 + ROLE + PRIOR + CONTEXT),          # yaş bilgisi hiç yok: yaşa bağımlılık testi
}


def _prep(train: pd.DataFrame, cols: list[str]):
    med = train[cols].astype(float).median()
    X = train[cols].astype(float).fillna(med).fillna(0.0).to_numpy()
    mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-9
    return med, mu, sd


def listnet_fit(train: pd.DataFrame, cols: list[str], lam: float):
    med, mu, sd = _prep(train, cols)
    Xs, qs = [], []
    for _, g in train.groupby("T"):
        tot = g["SHARE"].sum()
        if tot <= 0:
            continue
        Xs.append((g[cols].astype(float).fillna(med).fillna(0.0).to_numpy() - mu) / sd)
        qs.append(g["SHARE"].to_numpy() / tot)

    def f(b):
        loss, grad = lam * float(b @ b), 2 * lam * b
        for X, q in zip(Xs, qs):
            s = X @ b
            s -= s.max()
            e = np.exp(s)
            p = e / e.sum()
            loss -= float((q * np.log(p + 1e-12)).sum())
            grad = grad + X.T @ (p - q)
        return loss, grad

    res = minimize(f, np.zeros(len(cols)), jac=True, method="L-BFGS-B")
    return {"b": res.x, "med": med, "mu": mu, "sd": sd, "cols": cols}


def listnet_score(m, d: pd.DataFrame) -> np.ndarray:
    X = (d[m["cols"]].astype(float).fillna(m["med"]).fillna(0.0).to_numpy() - m["mu"]) / m["sd"]
    return X @ m["b"]


def walk_forward(ds: pd.DataFrame, variants: dict, lam: float, first: int = 1996, last: int = 2027) -> pd.DataFrame:
    ds = ds.copy()
    coefs = {}
    for name in variants:
        ds[f"S_{name}"] = np.nan
    for t in range(first, last + 1):
        tr = ds[(ds["T"] < t) & (ds["LABELED"] == 1)]
        cur = ds["T"] == t
        if not cur.any():
            continue
        for name, cols in variants.items():
            m = listnet_fit(tr, cols, lam)
            ds.loc[cur, f"S_{name}"] = listnet_score(m, ds[cur])
            if t == last:
                coefs[name] = dict(zip(cols, m["b"].round(3)))
    ds.attrs["coefs"] = coefs
    return ds


def gbm_walk_forward(ds: pd.DataFrame, cols: list[str], first: int = 1996, last: int = 2027) -> pd.Series:
    out = pd.Series(np.nan, index=ds.index)
    for t in range(first, last + 1):
        tr = ds[(ds["T"] < t) & (ds["LABELED"] == 1)]
        cur = ds["T"] == t
        if not cur.any():
            continue
        y = (tr["SHARE"] > 0).astype(int)
        w = 1.0 + 10.0 * tr["SHARE"]
        clf = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=150, min_samples_leaf=60, l2_regularization=5.0, random_state=0)
        clf.fit(tr[cols].astype(float), y, sample_weight=w)
        p = clf.predict_proba(ds.loc[cur, cols].astype(float))[:, 1]
        out[cur] = np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
    return out


def show(label: str, e: dict) -> None:
    print(f"{label:34s} hits@10 {e['hits@10']:.2f}  recall@10 {e['share_recall@10']:.3f}  ndcg {e['ndcg@10']:.3f}  kazanan ilk10 {e['winner_in_top10']:.2f}  ilk3 {e['winner_in_top3']:.2f}  medyan sıra {e['median_winner_rank']:.0f}")


def age_profile(ds: pd.DataFrame, col: str, start: int = 2000, end: int = 2026) -> list[float]:
    ev = ds[(ds["T"] >= start) & (ds["T"] <= end) & (ds["LABELED"] == 1)].copy()
    ev["rk"] = ev.groupby("T")[col].rank(ascending=False)
    top = ev[ev["rk"] <= 10]
    bins = [0, 20, 21, 22, 23, 24, 26, 29, 50]
    return (pd.cut(top["AGE"], bins).value_counts(normalize=True).sort_index() * 100).round(0).tolist()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ds = features_v2(mm.load())
    print("1. İlk tur (pointwise lojistik) yeniden hesaplanıyor ...", flush=True)
    base = mm.walk_forward(ds, None)
    ds["L_B2"] = base["L_B2"]
    res = {}
    for lam in (10.0, 60.0, 200.0):
        w = walk_forward(ds, VARIANTS, lam)
        res[lam] = w
        for name in VARIANTS:
            show(f"ListNet λ={lam:g} {name}", mm.evaluate(w, f"S_{name}"))
    show("pointwise B2 (ilk tur)", mm.evaluate(ds, "L_B2"))
    best_lam = max(res, key=lambda l: mm.evaluate(res[l], "S_LN_v2")["ndcg@10"])
    w = res[best_lam]
    print(f"\nSeçilen λ (LN_v2 NDCG'ye göre) = {best_lam:g}  [not: λ test üzerinde seçildi, hafif iyimser]")
    w["L_B2"] = ds["L_B2"]
    print("GBM (pointwise, v2 özellikleri) hesaplanıyor ...", flush=True)
    w["S_GBM_v2"] = gbm_walk_forward(w, VARIANTS["LN_v2"])
    show("GBM pointwise v2", mm.evaluate(w, "S_GBM_v2"))
    print("\nÇİFTLİ FARKLAR (NDCG@10, ortalama ± s.h.)")
    for a_, b_ in (("S_LN_base", "L_B2"), ("S_LN_age", "S_LN_base"), ("S_LN_v2", "S_LN_age"), ("S_LN_v2", "L_B2"), ("S_LN_v2_noage", "S_LN_v2"), ("S_GBM_v2", "S_LN_v2")):
        m, se = mm.paired(w, a_, b_)
        print(f"  {a_} − {b_}: {m:+.3f} ± {se:.3f}")
    print("\nİlk 10'un yaş dağılımı (≤20, 21, 22, 23, 24, 25-26, 27-29, ≥30), kazananlar [15, 22, 15, 11, 19, 15, 4, 0]:")
    for col in ("L_B2", "S_LN_base", "S_LN_age", "S_LN_v2", "S_LN_v2_noage", "S_GBM_v2"):
        print(f"  {col:15s}", age_profile(w, col))
    print("\nLN_v2 katsayıları (2026-27 için son eğitim, standartlaştırılmış):")
    print(dict(sorted(w.attrs["coefs"]["LN_v2"].items(), key=lambda kv: -abs(kv[1]))[:18]))
    w.to_parquet(DATA / "awards__mip_rank_walkforward.parquet")
    print("\nSon 8 sezonda kazanan sırası (LN_v2):")
    for t in range(2019, 2027):
        g = w[(w["T"] == t) & (w["LABELED"] == 1)].copy()
        g["rk"] = g["S_LN_v2"].rank(ascending=False)
        win = g[g["WINNER"] == 1].iloc[0]
        top = g.sort_values("S_LN_v2", ascending=False).head(5)
        print(t, win["PLAYER_NAME"], int(win["rk"]), "| ilk5:", ", ".join(f"{r.PLAYER_NAME}{'*' if r.SHARE > 0 else ''}" for r in top.itertuples()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
