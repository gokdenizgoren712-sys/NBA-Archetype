import pandas as pd, sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/"src")); sys.path.insert(0, str(ROOT/"config"))
from engine import predict_components, select_signatures
from signatures import COMPONENT_SIGNATURES

df = pd.read_parquet(ROOT/"data"/"2025-26__merged.parquet")
df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)
sigset = select_signatures(df)
learned = json.loads((ROOT/"config"/"learned_thresholds.json").read_text())
for c in list(sigset.keys()):
    if c in learned: sigset[c] = {**sigset[c], "percentile_threshold": learned[c]["percentile"]}

scores, positives = predict_components(df, sigset=sigset)
scores["PLAYER_NAME"] = df["PLAYER_NAME"].values
comps = list(COMPONENT_SIGNATURES.keys())

targets = ["Shai Gilgeous-Alexander","Nikola Jok","Stephen Curry",
           "Rudy Gobert","Chet Holmgren","Jalen Johnson"]
for name in targets:
    row = scores[scores["PLAYER_NAME"].str.contains(name.split()[0], na=False)]
    if row.empty: continue
    row = row.iloc[0]
    vals = " | ".join(f"{c}={row[c]:.2f}" for c in comps)
    print(f"{row['PLAYER_NAME']}:\n  {vals}\n")
