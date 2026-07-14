"""
Aşama 2 (motor): Persantil tabanlı bileşen tahmini + iki katmanlı doğrulama.

Akış:
  1. compute_percentiles: her metrik lig içinde [0..1] persantile çevrilir.
  2. score_component: bir bileşenin ağırlıklı kompozit skoru hesaplanır.
  3. predict_components: tüm bileşenler için oyuncu pozitif mi tespit edilir.
  4. validate: ground truth ile karşılaştır -> bileşen F1 (Katman 1)
              + kompozit Jaccard (Katman 2).
"""

import numpy as np
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "config"))
from signatures import (COMPONENT_SIGNATURES,
                        FALLBACK_SIGNATURES, MODERN_ONLY_METRICS)


def select_signatures(df: pd.DataFrame, force_fallback: bool = False) -> dict:
    """Sezonun veri zenginliğine göre modern mı fallback imza mı kullanılacağına karar verir.
    Tracking metrikleri (DRIVES vb.) tabloda yoksa fallback'e düşer.
    force_fallback=True ile tarihsel koşularda elle zorlanabilir."""
    if force_fallback:
        return FALLBACK_SIGNATURES
    # modern metriklerin kaçı mevcut?
    present = [m for m in MODERN_ONLY_METRICS if m in df.columns]
    coverage = len(present) / len(MODERN_ONLY_METRICS)
    if coverage < 0.4:  # tracking verisi büyük ölçüde yok -> eski sezon
        return FALLBACK_SIGNATURES
    return COMPONENT_SIGNATURES


def compute_percentiles(df: pd.DataFrame, metric_cols: list) -> pd.DataFrame:
    """Her metriği lig içinde rank-persantile çevirir (0..1). Eksik metrik: atlanır.
    Clip 0.999: küçük havuzlarda (tarihsel sezonlar, GP filtresi sonrası N<100) en iyi
    oyuncunun tüm metriklerde 1.0 alıp overall=100 görünmesini önler."""
    pct = pd.DataFrame(index=df.index)
    for col in metric_cols:
        if col in df.columns:
            pct[col] = df[col].rank(pct=True).clip(upper=0.999)
    return pct


def score_component(pct_df: pd.DataFrame, comp_name: str, sigset: dict = None) -> pd.Series:
    """Bileşenin ağırlıklı kompozit persantil skorunu döndürür [0..1].
    Mevcut olmayan metrikler düşürülür, ağırlıklar yeniden normalize edilir.
    sigset: kullanılacak imza sözlüğü (modern ya da fallback). None -> modern."""
    sigset = sigset or COMPONENT_SIGNATURES
    sig = sigset[comp_name]
    available = {m: spec for m, spec in sig["metrics"].items() if m in pct_df.columns}
    if not available:
        return pd.Series(np.nan, index=pct_df.index)
    total_w = sum(spec["w"] for spec in available.values())
    score = pd.Series(0.0, index=pct_df.index)
    for m, spec in available.items():
        v = pct_df[m].fillna(0.5)
        if not spec["higher"]:
            v = 1.0 - v
        score += (spec["w"] / total_w) * v
    return score


def predict_components(df: pd.DataFrame, only=None, sigset: dict = None,
                       force_fallback: bool = False):
    """Her oyuncu x bileşen için (skor, pozitif_mi) üretir.
    sigset verilmezse sezona göre otomatik seçilir (modern/fallback)."""
    if sigset is None:
        sigset = select_signatures(df, force_fallback=force_fallback)
    comps = only or list(sigset.keys())
    comps = [c for c in comps if c in sigset]
    all_metrics = sorted({m for c in comps for m in sigset[c]["metrics"]})
    pct = compute_percentiles(df, all_metrics)

    scores = pd.DataFrame(index=df.index)
    positives = pd.DataFrame(index=df.index)
    for c in comps:
        s = score_component(pct, c, sigset)
        scores[c] = s
        thr = sigset[c]["percentile_threshold"]
        positives[c] = s >= s.quantile(thr)
    return scores, positives


def validate_components(positives: pd.DataFrame, ground_truth: dict,
                        player_col: pd.Series) -> pd.DataFrame:
    """Katman 1: her bileşen için precision/recall/F1.
    ground_truth: {oyuncu_adı: set(bileşenler)}
    player_col: positives index'iyle hizalı oyuncu adları."""
    name_to_idx = {name: idx for idx, name in player_col.items()}
    rows = []
    for comp in positives.columns:
        tp = fp = fn = tn = 0
        for name, true_comps in ground_truth.items():
            if name not in name_to_idx:
                continue
            idx = name_to_idx[name]
            pred = bool(positives.loc[idx, comp])
            truth = comp in true_comps
            if pred and truth: tp += 1
            elif pred and not truth: fp += 1
            elif not pred and truth: fn += 1
            else: tn += 1
        n_pos = tp + fn
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        rows.append({
            "component": comp, "n_true": n_pos, "TP": tp, "FP": fp, "FN": fn,
            "precision": round(prec, 3), "recall": round(rec, 3), "F1": round(f1, 3),
            "validatable": n_pos >= 2,
        })
    return pd.DataFrame(rows).sort_values(["validatable", "n_true"], ascending=[False, False])


def jaccard_composite(positives: pd.DataFrame, ground_truth: dict,
                      player_col: pd.Series) -> pd.DataFrame:
    """Katman 2: tahmin edilen bileşen kümesi vs gerçek küme (Jaccard + tam eşleşme)."""
    name_to_idx = {name: idx for idx, name in player_col.items()}
    rows = []
    for name, true_comps in ground_truth.items():
        if name not in name_to_idx:
            continue
        idx = name_to_idx[name]
        pred_comps = {c for c in positives.columns if positives.loc[idx, c]}
        inter = pred_comps & true_comps
        union = pred_comps | true_comps
        jac = len(inter) / len(union) if union else 0.0
        rows.append({
            "player": name,
            "true": sorted(true_comps),
            "predicted": sorted(pred_comps),
            "jaccard": round(jac, 3),
            "exact": pred_comps == true_comps,
        })
    return pd.DataFrame(rows).sort_values("jaccard", ascending=False)


def assign_positions(df: pd.DataFrame, position_col: str = "POSITION") -> pd.DataFrame:
    """Pozisyon bileşenlerini nba_api POSITION alanından atar (skor motoru DEĞİL).
    Dönen: oyuncu x {Guard,Wing,Forward,Big,Center} boolean DataFrame.
    Wing ek kural: G-F/F-G ya da Forward olup boy < 205cm (~80.7 inch) => Wing."""
    import sys as _sys
    from pathlib import Path as _P
    _sys.path.insert(0, str(_P(__file__).resolve().parent.parent / "config"))
    from signatures import NBA_POSITION_MAP, POSITION_COMPONENTS

    pos = pd.DataFrame(False, index=df.index, columns=sorted(POSITION_COMPONENTS))
    for idx in df.index:
        raw = str(df.loc[idx, position_col]) if position_col in df.columns else ""
        comps = set(NBA_POSITION_MAP.get(raw, set()))
        # boy bazlı Wing inceltmesi
        h = df.loc[idx, "PLAYER_HEIGHT_INCHES"] if "PLAYER_HEIGHT_INCHES" in df.columns else None
        if raw in ("Forward",) and h is not None and h < 80.7:
            comps.add("Wing")
        for c in comps:
            if c in pos.columns:
                pos.at[idx, c] = True
    return pos


def optimize_thresholds(scores: pd.DataFrame, ground_truth: dict,
                        player_col: pd.Series, grid=None) -> dict:
    """Her bileşen için F1'i maksimize eden persantil eşiğini grid search ile bulur.
    'Önce elle, sonra optimize' yaklaşımının optimize ayağı.
    Dönen: {component: best_percentile}. Sadece n_true>=2 olanları optimize eder."""
    if grid is None:
        grid = np.arange(0.50, 0.951, 0.025)
    name_to_idx = {name: idx for idx, name in player_col.items()}
    best = {}
    for comp in scores.columns:
        truth_vec, score_vec = [], []
        for name, true_comps in ground_truth.items():
            if name not in name_to_idx:
                continue
            idx = name_to_idx[name]
            truth_vec.append(comp in true_comps)
            score_vec.append(scores.loc[idx, comp])
        truth_vec = np.array(truth_vec); score_vec = np.array(score_vec)
        n_true = truth_vec.sum()
        if n_true < 2:
            continue  # optimize etme; elle eşik kalsın
        best_f1, best_q = -1, None
        for q in grid:
            cut = np.quantile(score_vec, q)
            pred = score_vec >= cut
            tp = (pred & truth_vec).sum(); fp = (pred & ~truth_vec).sum(); fn = (~pred & truth_vec).sum()
            prec = tp/(tp+fp) if (tp+fp) else 0
            rec = tp/(tp+fn) if (tp+fn) else 0
            f1 = 2*prec*rec/(prec+rec) if (prec+rec) else 0
            if f1 > best_f1:
                best_f1, best_q = f1, q
        best[comp] = {"percentile": round(float(best_q), 3), "F1": round(float(best_f1), 3)}
    return best
