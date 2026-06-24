"""Spacer / Creator / Versatile yeni imzaları test eder."""
import sys, re
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))
from engine import compute_percentiles, score_component

NEW_SIGS = {
    # Veri odaklı yeniden yazım (diagnose_sigs.py bulguları):
    # KAT/Markkanen: DRIVES çok düşük (0.14-0.18), PASSES_MADE çok düşük (0.05-0.13)
    # -> spot-up şutörler; topla oynamıyorlar, sürüş yapmıyorlar
    "Spacer": {
        "percentile_threshold": 0.75,
        "metrics": {
            "FG3_PCT":    {"w": 0.22, "higher": True},
            "FG3A":       {"w": 0.18, "higher": True},
            "PCT_PTS_3PT":{"w": 0.15, "higher": True},
            "DRIVES":     {"w": 0.25, "higher": False},  # en kritik ayırt edici
            "PASSES_MADE":{"w": 0.12, "higher": False},  # top tutmuyor
            "AST_PCT":    {"w": 0.08, "higher": False},  # playmaker değil
        },
    },
    # Banchero/Wagner: DRIVES + DRIVE_FGA + FTA + PCT_PTS_PAINT yüksek
    # -> sürüşle yaratan kanatlar; PASSES_MADE düşük (PG değil, Engine değil)
    # -> PCT_PTS_3PT düşük (şutör değil)
    "Creator": {
        "percentile_threshold": 0.75,
        "metrics": {
            "DRIVES":        {"w": 0.20, "higher": True},
            "DRIVE_FGA":     {"w": 0.20, "higher": True},
            "FTA":           {"w": 0.18, "higher": True},
            "PCT_PTS_PAINT": {"w": 0.15, "higher": True},
            "PASSES_MADE":   {"w": 0.15, "higher": False},  # PG değil, Engine değil
            "PCT_PTS_3PT":   {"w": 0.12, "higher": False},  # şutör değil
        },
    },
    # Jalen Johnson: PASSES_MADE (0.95!), AST (0.89), REB (0.87) çok yüksek
    # Siakam: dengeli ama PTS/USG orta -> süperstar değil
    # -> BLK ikisi de düşük (0.30) = rim protector değil
    # -> PTS ve USG'yi penalize et: Giannis/Luka/SGA'dan ayırır
    "Versatile": {
        "percentile_threshold": 0.70,
        "metrics": {
            "PASSES_MADE":{"w": 0.22, "higher": True},   # çok yönlü pasör/handler
            "REB":        {"w": 0.18, "higher": True},
            "DRIVES":     {"w": 0.16, "higher": True},
            "AST_PCT":    {"w": 0.13, "higher": True},
            "PTS":        {"w": 0.15, "higher": False},   # birincil skorer değil
            "USG_PCT":    {"w": 0.16, "higher": False},   # yıldız değil
        },
    },
}

COMP_LIST = list(NEW_SIGS.keys())
TAGS_XLSX = str(ROOT / "TAGS.xlsx")
MERGED = ROOT / "data" / "2025-26__merged.parquet"

df = pd.read_parquet(MERGED)
if "FTA" in df.columns and "FGA" in df.columns:
    df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

tags = pd.read_excel(TAGS_XLSX, sheet_name="Top 41", header=1).dropna(subset=["Oyuncu"])

def parse_label(label):
    found = set()
    for c in COMP_LIST:
        if re.search(r"\b" + re.escape(c) + r"\b", str(label), re.IGNORECASE):
            found.add(c)
    return found

ground_truth = {r["Oyuncu"]: parse_label(r["Etiket"]) for _, r in tags.iterrows()}
df38 = df[df["PLAYER_NAME"].isin(ground_truth.keys())].reset_index(drop=True)

all_metrics = sorted({m for c in COMP_LIST for m in NEW_SIGS[c]["metrics"]})
pct = compute_percentiles(df38, all_metrics)

print("=== YENİ İMZA TESTİ ===\n")
for comp in COMP_LIST:
    thr = NEW_SIGS[comp]["percentile_threshold"]
    s = score_component(pct, comp, NEW_SIGS)
    cut = s.quantile(thr)
    positives_mask = s >= cut
    true_players = [p for p, comps in ground_truth.items() if comp in comps]
    pred_players = list(df38.loc[positives_mask, "PLAYER_NAME"])
    tp = len([p for p in true_players if p in pred_players])
    fp = len([p for p in pred_players if p not in true_players])
    fn = len([p for p in true_players if p not in pred_players])
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec  = tp / (tp + fn) if (tp + fn) else 0.0
    f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    print(f"--- {comp} (thr={thr}, cutoff={cut:.3f}) -> P={prec:.2f} R={rec:.2f} F1={f1:.2f}")
    print(f"  GT  : {true_players}")
    print(f"  PRED: {pred_players}")
    for p in true_players:
        rows = df38[df38["PLAYER_NAME"] == p]
        if not rows.empty:
            idx = rows.index[0]
            print(f"  Score({p}): {s[idx]:.3f}  [cutoff={cut:.3f}]")
    print()
