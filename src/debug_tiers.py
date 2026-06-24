import pandas as pd, sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))
from engine import predict_components, select_signatures
from signatures import COMPONENT_SIGNATURES

df = pd.read_parquet(ROOT / "data" / "2025-26__merged.parquet")
if "FTA" in df.columns and "FGA" in df.columns:
    df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

sigset = select_signatures(df)
learned = json.loads((ROOT / "config" / "learned_thresholds.json").read_text())
for c in list(sigset.keys()):
    if c in learned:
        sigset[c] = {**sigset[c], "percentile_threshold": learned[c]["percentile"]}

scores, positives = predict_components(df, sigset=sigset)
scores["PLAYER_NAME"] = df["PLAYER_NAME"].values
positives["PLAYER_NAME"] = df["PLAYER_NAME"].values

comp_cols = list(COMPONENT_SIGNATURES.keys())
targets = ["Shai Gilgeous-Alexander", "Jalen Johnson", "Scottie Barnes", "Alperen Sengun", "Nikola Jok"]

for name in targets:
    match = scores[scores["PLAYER_NAME"].str.contains(name, case=False, na=False)]
    if match.empty:
        print(f"\n{name}: BULUNAMADI")
        continue
    row_s = match.iloc[0]
    row_p = positives[positives["PLAYER_NAME"] == row_s["PLAYER_NAME"]].iloc[0]
    n_pos = int(row_p[comp_cols].sum())
    print(f"\n{'='*55}")
    print(f"{row_s['PLAYER_NAME']}  (pozitif bileşen: {n_pos})")
    print(f"{'Bileşen':<16} {'Skor':>6}  {'Pozitif?':>8}")
    print("-"*35)
    for c in comp_cols:
        v = row_s[c]
        pos = bool(row_p[c])
        flag = "  ✓" if pos else ""
        print(f"  {c:<14} {v:.3f}{flag}")
