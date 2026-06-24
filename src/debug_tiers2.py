import pandas as pd, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "config"))
from signatures import COMPONENT_SIGNATURES, POSITION_COMPONENTS

df = pd.read_parquet(ROOT / "data" / "2025-26__labeled.parquet")
comp_cols = list(COMPONENT_SIGNATURES.keys())
pos_cols  = sorted(POSITION_COMPONENTS)

targets = ["Shai Gilgeous-Alexander", "Jalen Johnson", "Scottie Barnes",
           "Alperen Sengun", "Nikola Jok", "LeBron", "Stephen Curry"]

for name in targets:
    match = df[df["PLAYER_NAME"].str.contains(name.split()[0], na=False)]
    if match.empty:
        print(f"{name}: BULUNAMADI")
        continue
    row = match.iloc[0]
    n_comp = int(row[comp_cols].sum())
    n_pos  = int(row[pos_cols].sum())
    vs = row.get("versatility_score", "?")
    vt = row.get("versatility_tier", "?")
    print(f"\n{row['PLAYER_NAME']}")
    print(f"  N_SKILL={n_comp}  N_POS={n_pos}  vscore={vs:.3f}  tier={vt}")
    print(f"  TAG: {row.get('TAG','?')}")
    active = [c for c in comp_cols if row.get(c, False)]
    print(f"  Pozitif: {active}")
