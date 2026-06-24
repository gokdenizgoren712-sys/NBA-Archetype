"""Her bileşen için ağırlık + eşik grid-search ile en iyi F1'i bul."""
import sys, re, itertools
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))
from engine import compute_percentiles

TAGS_XLSX = str(ROOT / "TAGS.xlsx")
MERGED = ROOT / "data" / "2025-26__merged.parquet"
COMP_LIST = ["Spacer", "Creator", "Versatile"]

df = pd.read_parquet(MERGED)
if "FTA" in df.columns and "FGA" in df.columns:
    df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

tags = pd.read_excel(TAGS_XLSX, sheet_name="Top 41", header=1).dropna(subset=["Oyuncu"])

def parse_label(label, comp_list):
    found = set()
    for c in comp_list:
        if re.search(r"\b" + re.escape(c) + r"\b", str(label), re.IGNORECASE):
            found.add(c)
    return found

ground_truth = {r["Oyuncu"]: parse_label(r["Etiket"], COMP_LIST) for _, r in tags.iterrows()}
df38 = df[df["PLAYER_NAME"].isin(ground_truth.keys())].reset_index(drop=True)

def eval_sig(sig, comp, pct_all):
    metrics = sig["metrics"]
    available = {m: spec for m, spec in metrics.items() if m in pct_all.columns}
    if not available:
        return 0.0, []
    total_w = sum(s["w"] for s in available.values())
    score = pd.Series(0.0, index=pct_all.index)
    for m, spec in available.items():
        v = pct_all[m].fillna(0.5)
        if not spec["higher"]:
            v = 1.0 - v
        score += (spec["w"] / total_w) * v
    thr = sig["percentile_threshold"]
    cut = score.quantile(thr)
    pos_mask = score >= cut
    true_pl = [p for p, comps in ground_truth.items() if comp in comps]
    pred_pl = list(df38.loc[pos_mask, "PLAYER_NAME"])
    tp = len([p for p in true_pl if p in pred_pl])
    fp = len([p for p in pred_pl if p not in true_pl])
    fn = len([p for p in true_pl if p not in pred_pl])
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec  = tp / (tp + fn) if (tp + fn) else 0.0
    f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return f1, pred_pl

# Önceden bulduğumuz iyi temel imzalar üzerine eşik grid search
BASE_SIGS = {
    "Spacer": {
        "metrics": {
            "FG3_PCT":    {"w": 0.22, "higher": True},
            "FG3A":       {"w": 0.18, "higher": True},
            "PCT_PTS_3PT":{"w": 0.15, "higher": True},
            "DRIVES":     {"w": 0.25, "higher": False},
            "PASSES_MADE":{"w": 0.12, "higher": False},
            "AST_PCT":    {"w": 0.08, "higher": False},
        },
    },
    "Creator": {
        "metrics": {
            "DRIVES":        {"w": 0.20, "higher": True},
            "DRIVE_FGA":     {"w": 0.20, "higher": True},
            "FTA":           {"w": 0.18, "higher": True},
            "PCT_PTS_PAINT": {"w": 0.15, "higher": True},
            "PASSES_MADE":   {"w": 0.15, "higher": False},
            "PCT_PTS_3PT":   {"w": 0.12, "higher": False},
        },
    },
    "Versatile": {
        "metrics": {
            "PASSES_MADE":{"w": 0.22, "higher": True},
            "REB":        {"w": 0.18, "higher": True},
            "DRIVES":     {"w": 0.16, "higher": True},
            "AST_PCT":    {"w": 0.13, "higher": True},
            "PTS":        {"w": 0.15, "higher": False},
            "USG_PCT":    {"w": 0.16, "higher": False},
        },
    },
}

all_metrics = sorted({m for comp in COMP_LIST for m in BASE_SIGS[comp]["metrics"]})
pct = compute_percentiles(df38, all_metrics)

print("=== EŞİK GRID SEARCH ===\n")
for comp in COMP_LIST:
    best_f1, best_thr, best_pred = -1, None, []
    for thr in np.arange(0.50, 0.96, 0.025):
        sig = {**BASE_SIGS[comp], "percentile_threshold": thr}
        f1, pred = eval_sig(sig, comp, pct)
        if f1 > best_f1:
            best_f1, best_thr, best_pred = f1, thr, pred
    true_pl = [p for p, comps in ground_truth.items() if comp in comps]
    print(f"{comp}: best F1={best_f1:.3f}  threshold={best_thr:.3f}")
    print(f"  GT  : {true_pl}")
    print(f"  PRED: {best_pred}\n")

# Creator için DRIVE_FGA ağırlığını arttır + FTA arttır deneyi
print("=== CREATOR VARYANT (FTA ağırlığı artırıldı) ===")
creator_v2 = {
    "metrics": {
        "DRIVES":        {"w": 0.18, "higher": True},
        "DRIVE_FGA":     {"w": 0.18, "higher": True},
        "FTA":           {"w": 0.25, "higher": True},   # Banchero FTA=0.89 çok güçlü
        "PCT_PTS_PAINT": {"w": 0.18, "higher": True},   # Wagner PCT_PTS_PAINT=0.72
        "PASSES_MADE":   {"w": 0.13, "higher": False},
        "PCT_PTS_3PT":   {"w": 0.08, "higher": False},
    },
}
for thr in np.arange(0.50, 0.96, 0.025):
    sig = {**creator_v2, "percentile_threshold": thr}
    f1, pred = eval_sig(sig, "Creator", pct)
    if f1 > 0.25:
        true_pl = [p for p, comps in ground_truth.items() if "Creator" in comps]
        print(f"  thr={thr:.3f} F1={f1:.3f}  PRED: {pred}")

print("\n=== VERSATILE VARYANT (Siakam için SCREEN_ASSISTS + DRIVE_FGA) ===")
# Siakam'ın yüksek: SCREEN_ASSISTS(0.66), DRIVE_FGA(0.71) -> bunları ekle
versatile_v2 = {
    "metrics": {
        "SCREEN_ASSISTS":{"w": 0.18, "higher": True},   # Siakam 0.66, Johnson 0.71(?)
        "DRIVE_FGA":     {"w": 0.18, "higher": True},   # Siakam 0.71, Johnson 0.75
        "REB":           {"w": 0.15, "higher": True},
        "AST_PCT":       {"w": 0.13, "higher": True},
        "PTS":           {"w": 0.18, "higher": False},
        "USG_PCT":       {"w": 0.18, "higher": False},
    },
}
for thr in np.arange(0.50, 0.96, 0.025):
    sig = {**versatile_v2, "percentile_threshold": thr}
    f1, pred = eval_sig(sig, "Versatile", pct)
    if f1 > 0.20:
        true_pl = [p for p, comps in ground_truth.items() if "Versatile" in comps]
        print(f"  thr={thr:.3f} F1={f1:.3f}  PRED: {pred}")
