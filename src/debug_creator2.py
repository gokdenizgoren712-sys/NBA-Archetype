import pandas as pd, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

df = pd.read_parquet(ROOT / "data" / "2025-26__player_scores.parquet")
cr = df[df["primary_arch"] == "Creator"].sort_values("score_Creator", ascending=False)
print("Creator primary_arch: " + str(len(cr)) + " oyuncu")
for _, r in cr.head(25).iterrows():
    nm = str(r["PLAYER_NAME"]).encode("ascii", "replace").decode()
    ht = r.get("PLAYER_HEIGHT_INCHES", 0)
    pos = str(r.get("POSITION", "?"))
    cr_s = round(float(r["score_Creator"]), 3)
    en_s = round(float(r["score_Engine"]), 3) if "score_Engine" in r.index else 0
    print(nm.ljust(28) + "Cr=" + str(cr_s) + "  En=" + str(en_s) + "  h=" + str(ht) + "  " + pos)
