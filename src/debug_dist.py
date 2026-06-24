import pandas as pd
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from config.signatures import COMPONENT_SIGNATURES

df = pd.read_parquet(ROOT / "data" / "2025-26__player_scores.parquet")

for arch in ["Spacer", "Rim Runner"]:
    thr = COMPONENT_SIGNATURES[arch]["percentile_threshold"]
    col = "score_" + arch
    print("=== " + arch + " top 15 (thr=" + str(thr) + ") ===")
    top = df.nlargest(15, col)[["PLAYER_NAME", col]]
    for _, r in top.iterrows():
        nm = str(r["PLAYER_NAME"]).encode("ascii", "replace").decode()
        flag = " *AKTIF" if r[col] >= thr else ""
        print("  " + nm.ljust(28) + str(round(float(r[col]), 3)) + flag)
    print()

print("=== CREATOR boyut etkisi ===")
thr_c = COMPONENT_SIGNATURES["Creator"]["percentile_threshold"]
names = ["Paolo Banchero", "Franz Wagner", "Shai Gilgeous-Alexander",
         "Jalen Brunson", "Josh Giddey", "LeBron James"]
for nm in names:
    rows = df[df["PLAYER_NAME"].str.lower().str.contains(nm.lower())]
    if len(rows):
        r = rows.iloc[0]
        name = str(r["PLAYER_NAME"]).encode("ascii", "replace").decode()
        ht = r.get("PLAYER_HEIGHT_INCHES", float("nan"))
        sc = round(float(r["score_Creator"]), 3)
        flag = " *AKTIF" if sc >= thr_c else ""
        print("  " + name.ljust(28) + "score=" + str(sc) + "  h=" + str(ht) + flag)
