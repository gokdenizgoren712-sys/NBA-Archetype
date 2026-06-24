import pandas as pd, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))
from engine import predict_components
from config.signatures import COMPONENT_SIGNATURES

df = pd.read_parquet(ROOT / "data" / "2025-26__merged.parquet")
if "FTA" in df.columns and "FGA" in df.columns:
    df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, float("nan"))).fillna(0)

scores, positives = predict_components(df, only=list(COMPONENT_SIGNATURES.keys()))
thr = COMPONENT_SIGNATURES["Creator"]["percentile_threshold"]
print("Creator threshold:", thr)

print("score cols:", [c for c in scores.columns if "Creator" in c or "Engine" in c][:5])
for name in ["Paolo Banchero", "Franz Wagner"]:
    idx = df[df["PLAYER_NAME"] == name].index
    if len(idx):
        col = "score_Creator" if "score_Creator" in scores.columns else "Creator"
        v = scores.loc[idx[0], col]
        print(name + ": Creator=" + str(round(float(v), 3)) + " (thr=" + str(thr) + ")")
    else:
        print(name + ": bulunamadi")

creator_col = "score_Creator" if "score_Creator" in scores.columns else "Creator"
sc = scores[[creator_col]].copy()
sc = sc.rename(columns={creator_col: "score_Creator"})
sc["PLAYER_NAME"] = df["PLAYER_NAME"].values
top = sc.nlargest(15, "score_Creator")
print("\nTop 15 Creator skoru:")
for _, r in top.iterrows():
    flag = " >= thr" if r["score_Creator"] >= thr else ""
    nm = str(r["PLAYER_NAME"]).encode("ascii", "replace").decode()
    print("  " + nm.ljust(25) + str(round(r["score_Creator"], 3)) + flag)
