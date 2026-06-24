"""GT oyuncularının her metrikte 38'lik sample içindeki yüzdeliğini gösterir."""
import sys, re
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))
from engine import compute_percentiles

COMP_LIST = ["Spacer", "Creator", "Versatile"]
TAGS_XLSX = str(ROOT / "TAGS.xlsx")
MERGED = ROOT / "data" / "2025-26__merged.parquet"

df_full = pd.read_parquet(MERGED)
if "FTA" in df_full.columns and "FGA" in df_full.columns:
    df_full["FT_RATE"] = (df_full["FTA"] / df_full["FGA"].replace(0, pd.NA)).fillna(0)

tags = pd.read_excel(TAGS_XLSX, sheet_name="Top 41", header=1).dropna(subset=["Oyuncu"])

def parse_all(label):
    # Tüm token'ları çıkar
    return str(label)

ground_truth_labels = {r["Oyuncu"]: r["Etiket"] for _, r in tags.iterrows()}

def parse_label(label, comp_list):
    found = set()
    for c in comp_list:
        if re.search(r"\b" + re.escape(c) + r"\b", str(label), re.IGNORECASE):
            found.add(c)
    return found

ground_truth = {r["Oyuncu"]: parse_label(r["Etiket"], COMP_LIST) for _, r in tags.iterrows()}

df38 = df_full[df_full["PLAYER_NAME"].isin(ground_truth.keys())].reset_index(drop=True)

# GT label'ları göster
print("=== GT ETİKETLER ===")
for comp in COMP_LIST:
    players = [(p, ground_truth_labels[p]) for p, comps in ground_truth.items() if comp in comps]
    print(f"\n{comp} GT oyuncular:")
    for p, lbl in players:
        print(f"  {p}: '{lbl}'")

print("\n=== METRİK PERSANTİLLER (38 içinde) ===")
# İlgili metrikler
KEY_METRICS = [
    "CATCH_SHOOT_FG3_PCT", "FG3_PCT", "PCT_PTS_3PT", "FG3A", "FG3M",
    "TIME_OF_POSS", "DRIVES", "DRIVE_FGA", "USG_PCT", "PULL_UP_PTS",
    "AST_PCT", "PCT_UAST_FGM", "FTA", "PASSES_MADE",
    "STL", "REB", "AST", "BLK", "SCREEN_ASSISTS", "DEFLECTIONS",
    "PCT_PTS_PAINT", "PLAYER_HEIGHT_INCHES", "PTS"
]

pct38 = compute_percentiles(df38, KEY_METRICS)

focus_players = {
    "Spacer": ["Karl-Anthony Towns", "Lauri Markkanen"],
    "Creator": ["Paolo Banchero", "Franz Wagner"],
    "Versatile": ["Jalen Johnson", "Pascal Siakam"],
}

for comp, players in focus_players.items():
    print(f"\n--- {comp} ---")
    for p in players:
        rows = df38[df38["PLAYER_NAME"] == p]
        if rows.empty:
            print(f"  {p}: BULUNAMADI")
            continue
        idx = rows.index[0]
        vals = {m: round(pct38.loc[idx, m], 2) for m in KEY_METRICS if m in pct38.columns}
        # En yüksek 8 metrik
        top8 = sorted(vals.items(), key=lambda x: x[1], reverse=True)[:8]
        # En düşük 5 metrik
        bot5 = sorted(vals.items(), key=lambda x: x[1])[:5]
        print(f"  {p}:")
        print(f"    YÜKSEK: {top8}")
        print(f"    DÜŞÜK : {bot5}")
