import pandas as pd
df = pd.read_parquet("data/2025-26__player_scores.parquet")
ranked = df[df["overall_score"].notna()]
top10 = ranked.nlargest(10, "overall_score")
for _, r in top10.iterrows():
    nm = r["PLAYER_NAME"].encode("ascii","replace").decode()
    print(f"{nm[:28]:<28} {r['overall_score']:.3f}  {int(r['eff_games'])} min")
print(f"Ranked: {len(ranked)}")
