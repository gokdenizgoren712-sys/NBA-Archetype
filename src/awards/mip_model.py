# -*- coding: utf-8 -*-
"""MIP modeli: iki aşamalı, walk-forward (docs/MODELS_AND_SIMULATION_GUIDE.md, Bölüm B).

Aşama A  istatistiksel gelişme: "bu oyuncu gelecek sezon BPM ve maç başı sayıda ne kadar artar?" (ridge; hype YOK; her sezon yüzlerce etiket)
Aşama B  tanınma: "bu gelişme MIP oylamasına yansır mı?" (ağırlıklı lojistik; etiket = oylamada pay almak, ağırlık = 1 + 10·pay)
  B0  yalnız A'nın öngördüğü gelişme (+ yaş, güvenilirlik)       → "istatistik olarak ne bekleniyor"
  B1  B0 + seviye / tepe / önceki oy / kıdem                     → "oylama gerçekte ne ödüllendiriyor"
  sentetik hype = logit(B0) − logit(B1): B1'in B0'a uyguladığı indirim (zaten iyi / bariz olan oyuncu).

Sızıntısızlık: hedef sezon t için A ve B yalnız t'den ÖNCEKİ sezonların satırlarıyla eğitilir; B'nin eğitim girdileri, o satırların kendi
sezonunda (yalnız o zamana kadarki veriyle eğitilmiş) A'nın verdiği tahminlerdir (iç içe walk-forward).

    python -m src.awards.mip_model                 # üç eğitim penceresi, 2000-2026 değerlendirme, 2026-27 adayları
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

LEVEL_RAW = ["AGE", "MPG", "USG", "TS", "AST_PCT", "TRB_PCT", "BPM", "VORP", "WS48", "PTS36", "AST36", "REB36", "RELIAB"]
LEVEL_PCT = ["MPG_pct", "USG_pct", "TS_pct", "BPM_pct", "VORP_pct", "WS48_pct", "PTS36_pct", "AST_PCT_pct", "AST36_pct", "REB36_pct", "TRB_PCT_pct", "MP_pct"]
DELTAS = ["d_MPG", "d_USG", "d_TS", "d_BPM", "d_PTS36", "d_AST36", "d_WS48", "d2_MPG", "d2_USG", "d2_TS", "d2_BPM", "d2_PTS36", "d2_AST36", "d2_WS48"]
HIST = ["PEAK_VORP", "SEASONS", "PRIOR_MIP_MAX", "HAS_PREV", "GAP"]
B0_FEATS = ["A_dBPM", "A_dPTS", "AGE", "RELIAB"]
B1_EXTRA = ["BPM_pct", "VORP_pct", "MPG_pct", "USG_pct", "PEAK_VORP", "PRIOR_MIP_MAX", "SEASONS", "A_BPMn", "GAP"]
LEVELS_NOA = ["AGE", "RELIAB", "BPM_pct", "VORP_pct", "MPG_pct", "USG_pct", "PEAK_VORP", "PRIOR_MIP_MAX", "SEASONS", "GAP"]
GROWTH = ["d_MPG", "d_PTS36", "d_USG", "d_BPM", "PTS36_pct", "TS_pct", "HAS_PREV"]
VARIANTS = {                                   # ad → B özellikleri (B0 hype'ın "istatistik" yarısı, geri kalanı tanınma)
    "B0": B0_FEATS,
    "B1": B0_FEATS + B1_EXTRA,
    "B1_noA": LEVELS_NOA,
    "B2": LEVELS_NOA + GROWTH,
    "B3": LEVELS_NOA + GROWTH + ["A_dBPM", "A_dPTS", "A_BPMn"],
    "B2sh": LEVELS_NOA + GROWTH + ["PTS36_sh", "AST36_sh", "REB36_sh", "TS_sh", "g1_PTS_sh"],   # + videodaki dakikaya göre küçültülmüş hızlar
    "B4": LEVELS_NOA + GROWTH + ["MOVED", "VAC", "ARR"],          # + takım bağlamı değişimi (yaz transferleri)
}
RIDGE_ALPHA = 60.0
LOGIT_C = 0.3
SHARE_WEIGHT = 10.0


def end_year(season: str) -> int:
    return int(season[:4]) + 1


SHRINK_K = 800.0


def add_shrunk(d: pd.DataFrame) -> pd.DataFrame:
    """Videodaki küçültme: dakika başı hızlar, oynanan dakikaya göre sezon ortalamasına çekilir (az dakika → ortalamaya yakın).
    PTS36_sh = (MP·PTS36 + K·sezon ortalaması) / (MP + K). g1_PTS_sh: küçültülmüş 1 yıllık sayı büyümesi."""
    for c in ("PTS36", "AST36", "REB36", "TS"):
        ref = d["MP"] >= 500
        mean = d[c].where(ref).groupby(d["END_YEAR"]).transform("mean")
        d[c + "_sh"] = (d["MP"] * d[c] + SHRINK_K * mean) / (d["MP"] + SHRINK_K)
        if c == "PTS36" and "d_PTS36" in d.columns:
            prev = (d[c] - d["d_PTS36"]).where(d["MP_p1"].notna())
            mp1 = d["MP_p1"].fillna(0.0)
            d["PTS36_p1sh"] = (mp1 * prev.fillna(0.0) + SHRINK_K * mean) / (mp1 + SHRINK_K)
    d["g1_PTS_sh"] = d["PTS36_sh"] - d["PTS36_p1sh"]
    d["RANK_N"] = pd.to_numeric(d["RANK"].astype(str).str.replace("T", "", regex=False), errors="coerce")
    return d


def load() -> pd.DataFrame:
    d = pd.read_parquet(DATA / "awards__mip_dataset.parquet")
    d["T"] = d["TARGET_SEASON"].map(end_year)
    d["AGE2"] = d["AGE"] ** 2
    d["SEASONS"] = d["SEASONS"].clip(upper=15)
    return add_shrunk(d)


def _matrix(d: pd.DataFrame, cols: list[str]) -> np.ndarray:
    x = d[cols].astype(float)
    return x.fillna(x.median()).fillna(0.0).to_numpy()


class Ridge:
    def __init__(self, alpha: float = RIDGE_ALPHA):
        self.alpha = alpha

    def fit(self, X: np.ndarray, y: np.ndarray, w: np.ndarray):
        self.mu = np.average(X, axis=0, weights=w)
        self.sd = np.sqrt(np.average((X - self.mu) ** 2, axis=0, weights=w)) + 1e-9
        Z = (X - self.mu) / self.sd
        self.ym = np.average(y, weights=w)
        sw = np.sqrt(w)[:, None]
        A = (Z * sw).T @ (Z * sw) + self.alpha * np.eye(Z.shape[1])
        self.beta = np.linalg.solve(A, (Z * sw).T @ ((y - self.ym) * sw[:, 0]))
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.ym + ((X - self.mu) / self.sd) @ self.beta


A_COLS = LEVEL_RAW + ["AGE2"] + LEVEL_PCT + DELTAS + HIST


def stage_a_fit(train: pd.DataFrame):
    """Hedef: BPM ve maç başı sayı değişimi; ağırlık: iki sezonun güvenilirliği."""
    t = train[(train["MP_n"] >= 100) & train["BPM_n"].notna() & train["PTS_n"].notna() & train["PTS"].notna() & train["BPM"].notna()]
    w = np.sqrt(t["RELIAB"].to_numpy() * (t["MP_n"] / (t["MP_n"] + 800.0)).to_numpy())
    X = _matrix(t, A_COLS)
    return (Ridge().fit(X, (t["BPM_n"] - t["BPM"]).to_numpy(), w), Ridge().fit(X, (t["PTS_n"] - t["PTS"]).to_numpy(), w), t[A_COLS].astype(float).median())


def stage_a_predict(models, d: pd.DataFrame) -> pd.DataFrame:
    m1, m2, med = models
    x = d[A_COLS].astype(float).fillna(med).fillna(0.0).to_numpy()
    out = pd.DataFrame({"A_dBPM": m1.predict(x), "A_dPTS": m2.predict(x)}, index=d.index)
    out["A_BPMn"] = d["BPM"].fillna(0.0) + out["A_dBPM"]
    return out


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


class Logit:
    def __init__(self, cols: list[str]):
        self.cols = cols

    def fit(self, d: pd.DataFrame):
        X = _matrix(d, self.cols)
        self.mu, self.sd = X.mean(axis=0), X.std(axis=0) + 1e-9
        y = (d["SHARE"] > 0).astype(int).to_numpy()
        w = 1.0 + SHARE_WEIGHT * d["SHARE"].to_numpy()
        self.m = LogisticRegression(C=LOGIT_C, max_iter=1000).fit((X - self.mu) / self.sd, y, sample_weight=w)
        self.med = d[self.cols].astype(float).median()
        return self

    def logit(self, d: pd.DataFrame) -> np.ndarray:
        x = d[self.cols].astype(float).fillna(self.med).fillna(0.0).to_numpy()
        return self.m.decision_function((x - self.mu) / self.sd)

    def coefs(self) -> dict:
        return dict(zip(self.cols, self.m.coef_[0].round(3)))


def walk_forward(ds: pd.DataFrame, window: int | None = None, first_a: int = 1988, first_b: int = 1992, last: int = 2027) -> pd.DataFrame:
    """Her hedef sezon t için A ve B'yi yalnız t'den önceki sezonlarla eğitip t satırlarını puanlar. window=None: tüm geçmiş; n: son n sezon."""
    ds = ds.copy()
    for c in ["A_dBPM", "A_dPTS", "A_BPMn", "p0", "p1", "hype", "L0", "L1"] + [f"L_{n}" for n in VARIANTS]:
        ds[c] = np.nan
    coefs = {}
    for t in range(first_a, last + 1):
        lo = (t - window) if window else 0
        tr = ds[(ds["T"] < t) & (ds["T"] >= lo)]
        cur = ds["T"] == t
        if not cur.any() or tr["BPM_n"].notna().sum() < 300:
            continue
        ds.loc[cur, ["A_dBPM", "A_dPTS", "A_BPMn"]] = stage_a_predict(stage_a_fit(tr), ds[cur]).to_numpy()
        if t < first_b:
            continue
        trb = ds[(ds["T"] < t) & (ds["T"] >= lo) & (ds["LABELED"] == 1) & ds["A_dBPM"].notna()]
        if trb["SHARE"].gt(0).sum() < 30:
            continue
        for name, cols in VARIANTS.items():
            ds.loc[cur, f"L_{name}"] = Logit(cols).fit(trb).logit(ds[cur])
        b0, b1 = Logit(B0_FEATS).fit(trb), Logit(B0_FEATS + B1_EXTRA).fit(trb)
        l0, l1 = b0.logit(ds[cur]), b1.logit(ds[cur])
        ds.loc[cur, "L0"], ds.loc[cur, "L1"] = l0, l1
        ds.loc[cur, "p0"], ds.loc[cur, "p1"] = 1 / (1 + np.exp(-l0)), 1 / (1 + np.exp(-l1))
        ds.loc[cur, "hype"] = l0 - l1
        coefs[t] = b1.coefs()
    ds.attrs["coefs"] = coefs
    return ds


def _ndcg(score: np.ndarray, gain: np.ndarray, k: int = 10) -> float:
    order = np.argsort(-score, kind="stable")[:k]
    disc = 1.0 / np.log2(np.arange(2, k + 2))
    dcg = float((gain[order] * disc[: len(order)]).sum())
    ideal = float((np.sort(gain)[::-1][:k] * disc[: min(k, len(gain))]).sum())
    return dcg / ideal if ideal > 0 else np.nan


def evaluate(ds: pd.DataFrame, score_col: str | pd.Series, start: int = 2000, end: int = 2026) -> dict:
    """Sezon başına: ilk 10'un oylamaya girenleri, oy payı geri çağırma, NDCG@10, kazananın sırası; sezon ortalamaları."""
    rows = []
    sc = ds[score_col] if isinstance(score_col, str) else score_col
    for t in range(start, end + 1):
        m = ds[(ds["T"] == t) & (ds["LABELED"] == 1)]
        s = sc.loc[m.index]
        if s.isna().all() or m["SHARE"].sum() == 0:
            continue
        s = s.fillna(s.min() - 1)
        order = s.sort_values(ascending=False).index
        top = m.loc[order[:10]]
        win = m[m["WINNER"] == 1]
        rank = int(s.rank(ascending=False)[win.index[0]]) if len(win) else np.nan
        rows.append({"T": t, "hits": int((top["SHARE"] > 0).sum()), "recall": float(top["SHARE"].sum() / m["SHARE"].sum()),
                     "ndcg": _ndcg(s.to_numpy(), m["SHARE"].to_numpy()), "winner_rank": rank, "winner_top10": float(rank <= 10), "winner_top3": float(rank <= 3)})
    r = pd.DataFrame(rows)
    return {"seasons": len(r), "hits@10": r["hits"].mean(), "share_recall@10": r["recall"].mean(), "ndcg@10": r["ndcg"].mean(),
            "winner_in_top10": r["winner_top10"].mean(), "winner_in_top3": r["winner_top3"].mean(), "median_winner_rank": r["winner_rank"].median(), "per_season": r}


def baselines(ds: pd.DataFrame) -> dict[str, pd.Series]:
    """Karşılaştırma tabanları (hepsi sezon öncesi bilgiyle)."""
    rel = ds["RELIAB"]
    return {
        "genç + üretken": ds["BPM_pct"].fillna(0) - 0.06 * (ds["AGE"] - 22).clip(lower=0),
        "son yıl artışı (BPM, güvenilirlik ağırlıklı)": (ds["d_BPM"].fillna(0) * rel * ds["MP_p1"].fillna(0).pipe(lambda x: x / (x + 800.0))),
        "son yıl artışı (maç başı sayı)": ds["d_PTS36"].fillna(0) * rel,
        "yalnız Aşama A (öngörülen BPM artışı)": ds["A_dBPM"] * rel,
    }


PRODUCTION = "L_B2sh"          # üretim modeli: seviye + yaş + tarihçe + büyüme özellikleri (B1_noA / B3 ile istatistiksel olarak eşit; bkz. rehber B10)


def calibrate(ds: pd.DataFrame, col: str = PRODUCTION, start: int = 2000, end: int = 2026) -> dict:
    """Walk-forward puanlardan olasılığa: (1) oylamaya girme için Platt (a, b); (2) kazanan için softmax sıcaklığı β (sezon içinde toplam 1)."""
    m = ds[(ds["T"] >= start) & (ds["T"] <= end) & (ds["LABELED"] == 1) & ds[col].notna()]
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(m[[col]].to_numpy(), ((m["RANK_N"] <= 10) & m["RANK_N"].notna()).astype(int).to_numpy())     # hedef: top-10 MIP finisher (videodaki gibi)
    best = (None, -1e18)
    for beta in np.arange(0.1, 3.01, 0.05):
        ll = 0.0
        for t, g in m.groupby("T"):
            w = g[g["WINNER"] == 1]
            if w.empty:
                continue
            z = beta * g[col].to_numpy()
            lse = np.log(np.exp(z - z.max()).sum()) + z.max()
            ll += float(beta * w[col].iloc[0] - lse)
        if ll > best[1]:
            best = (float(beta), ll)
    n_win = int((m["WINNER"] == 1).sum())
    return {"platt": (float(platt.intercept_[0]), float(platt.coef_[0][0])), "beta": best[0], "winner_loglik_per_season": best[1] / max(n_win, 1),
            "uniform_loglik_per_season": float(np.mean([-np.log(len(g)) for _, g in m.groupby("T")]))}


def candidates(ds: pd.DataFrame, t: int = 2027, n: int = 15, col: str = PRODUCTION, cal: dict | None = None) -> pd.DataFrame:
    c = ds[ds["T"] == t].copy()
    cal = cal or calibrate(ds, col)
    a, b = cal["platt"]
    c["P_top10"] = 1 / (1 + np.exp(-(a + b * c[col])))
    z = cal["beta"] * c[col]
    c["P_win"] = np.exp(z - z.max()) / np.exp(z - z.max()).sum()
    c["hype"] = c["L0"] - c[col]                      # B0 (yalnız istatistik) − üretim: seviye/tarihçenin uyguladığı indirim
    cols = ["PLAYER_NAME", "TEAM_ABBREVIATION", "AGE", "GAP", "MPG", "USG", "BPM", "A_dBPM", "A_dPTS", "P_top10", "P_win", "hype"]
    return c.sort_values(col, ascending=False).head(n)[cols].round(3)


def finisher_hits(ds: pd.DataFrame, col: str, seasons: range, topn: int = 10, k: int = 10) -> np.ndarray:
    """Videonun ölçütü: modelin ilk k tahmininden kaçı gerçek top-N MIP finisher'ı (RANK ≤ N). Sezon başına dizi."""
    out = []
    for t in seasons:
        g = ds[(ds["T"] == t) & (ds["LABELED"] == 1)]
        top = g.sort_values(col, ascending=False).head(k)
        out.append(int(((top["RANK_N"] <= topn) & top["RANK_N"].notna()).sum()))
    return np.array(out)


def paired(ds: pd.DataFrame, a, b, metric: str = "ndcg") -> tuple[float, float]:
    """İki skorun sezon başına metrik farkı: (ortalama, standart hata). Sıfırı içeren aralık = ayırt edilemiyor."""
    ra, rb = evaluate(ds, a)["per_season"].set_index("T")[metric], evaluate(ds, b)["per_season"].set_index("T")[metric]
    d = (ra - rb).dropna()
    return float(d.mean()), float(d.std(ddof=1) / np.sqrt(len(d)))


def stage_a_report(ds: pd.DataFrame, start: int = 2000) -> dict:
    """A'nın tek başına kalitesi (örneklem dışı): öngörülen ve gerçekleşen BPM / sayı değişimi arasındaki korelasyon ve MSE iyileşmesi (sıfır tahminine göre)."""
    d = ds[(ds["T"] >= start) & ds["BPM_n"].notna() & ds["A_dBPM"].notna() & (ds["MP_n"] >= 300) & (ds["MP"] >= 300)]
    y = d["BPM_n"] - d["BPM"]
    out = {"n": len(d), "corr_dBPM": float(np.corrcoef(d["A_dBPM"], y)[0, 1]), "mse_gain_dBPM": float(1 - ((y - d["A_dBPM"]) ** 2).mean() / (y ** 2).mean())}
    e = d[d["A_dPTS"].notna() & d["PTS_n"].notna()]
    yp = e["PTS_n"] - e["PTS"]
    out.update(corr_dPTS=float(np.corrcoef(e["A_dPTS"], yp)[0, 1]), mse_gain_dPTS=float(1 - ((yp - e["A_dPTS"]) ** 2).mean() / (yp ** 2).mean()))
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ds = load()
    pd.set_option("display.width", 220)
    results = {}
    for label, window in (("tüm geçmiş (1986+)", None), ("son 20 sezon", 20), ("son 12 sezon", 12)):
        w = walk_forward(ds, window)
        results[label] = w
        for name in VARIANTS:
            e = evaluate(w, f"L_{name}")
            print(f"{label:20s} {name:7s} hits@10 {e['hits@10']:.2f}  recall@10 {e['share_recall@10']:.3f}  ndcg {e['ndcg@10']:.3f}  kazanan ilk10 {e['winner_in_top10']:.2f}  ilk3 {e['winner_in_top3']:.2f}  medyan sıra {e['median_winner_rank']:.0f}")
    base_ds = results["tüm geçmiş (1986+)"]
    print("Aşama A (tüm geçmiş, 2000+):",{k: round(v, 3) for k, v in stage_a_report(base_ds).items()})
    print("TABANLAR (2000-2026, aynı satırlar)")
    for name, s_ in baselines(base_ds).items():
        e = evaluate(base_ds, s_)
        print(f"  {name:45s} hits@10 {e['hits@10']:.2f}  recall@10 {e['share_recall@10']:.3f}  ndcg {e['ndcg@10']:.3f}  kazanan ilk10 {e['winner_in_top10']:.2f}  medyan sıra {e['median_winner_rank']:.0f}")
    rng = np.random.default_rng(0)
    e = evaluate(base_ds, pd.Series(rng.random(len(base_ds)), index=base_ds.index))
    print(f"  {'rastgele':45s} hits@10 {e['hits@10']:.2f}  recall@10 {e['share_recall@10']:.3f}  ndcg {e['ndcg@10']:.3f}  kazanan ilk10 {e['winner_in_top10']:.2f}")
    print("VİDEO ÖLÇÜTÜ: ilk 10 tahminden kaçı gerçek top-10 MIP finisher'ı (liste başına ortalama; videoda 4 sezonda 7/40 = 1.75)")
    print(f"  {'':44s} {'2023-26':>8s} {'2011-26':>8s} {'2000-26':>8s}")
    cols = {f"B2sh (üretim)": "L_B2sh", "B2": "L_B2", "B1_noA": "L_B1_noA", "B3 (+ A)": "L_B3", "B4 (+ takım değişimi)": "L_B4"}
    cols.update({n: n for n in baselines(base_ds)})
    for nm, c in cols.items():
        if c in baselines(base_ds):
            base_ds[c] = baselines(base_ds)[c]
        h = [finisher_hits(base_ds, c, range(a, 2027)).mean() for a in (2023, 2011, 2000)]
        print(f"  {nm:44s} {h[0]:8.2f} {h[1]:8.2f} {h[2]:8.2f}")
    print("ÇİFTLİ FARKLAR (sezon başına NDCG@10; ortalama ± s.h.)")
    for a_, b_ in (("L_B1", "L_B0"), ("L_B2", "L_B1"), ("L_B1_noA", "L_B1"), ("L_B3", "L_B2"), ("L_B2", "L_B1_noA"), ("L_B4", "L_B2"), ("L_B2sh", "L_B2")):
        m, se = paired(base_ds, a_, b_)
        print(f"  {a_} − {b_}: {m:+.3f} ± {se:.3f}")
    m, se = paired(base_ds, "L_B2", baselines(base_ds)["genç + üretken"])
    print(f"  L_B2 − genç+üretken: {m:+.3f} ± {se:.3f}")
    for lab in ("son 20 sezon", "son 12 sezon"):
        m, se = paired(results[lab], results[lab]["L_B2"], base_ds["L_B2"])
        print(f"  B2 {lab} − B2 tüm geçmiş: {m:+.3f} ± {se:.3f}")
    base_ds.to_parquet(DATA / "awards__mip_walkforward.parquet")
    cal = calibrate(base_ds)
    print("KALİBRASYON:", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in cal.items()})
    print("2026-27 ADAYLARI (üretim modeli, tüm geçmişle eğitilmiş):")
    print(candidates(base_ds, cal=cal).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
