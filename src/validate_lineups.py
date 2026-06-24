"""
Lineup fit score <-> gerçek NET_RATING korelasyon validasyonu.
Çalıştır: python src/validate_lineups.py
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

import pandas as pd
import numpy as np
from score_compat import build_score_table, lineup_score_from_names

scores = build_score_table(season="2025-26")

# (İlk harf + soyad) → tam isim lookup
initial_last_to_full = {}  # "r_gobert" -> "Rudy Gobert"
last_to_full = {}           # "gobert" -> "Rudy Gobert" (benzersiz soyadlar için fallback)
from collections import defaultdict
last_count = defaultdict(list)
for name in scores["PLAYER_NAME"]:
    parts = name.split()
    if not parts:
        continue
    last = parts[-1].lower()
    first_init = parts[0][0].lower() if parts[0] else ""
    key = f"{first_init}_{last}"
    initial_last_to_full[key] = name
    last_count[last].append(name)

for last, names in last_count.items():
    if len(names) == 1:
        last_to_full[last] = names[0]


def expand_abbr(abbr: str) -> str:
    """'A. Edwards' → 'Anthony Edwards' (ilk harf + soyad eşleşmesiyle)"""
    parts = abbr.strip().split()
    if not parts:
        return abbr
    last = parts[-1].lower()
    first_init = parts[0].rstrip(".").lower() if len(parts) > 1 else ""
    # Önce ilk harf + soyad
    key = f"{first_init}_{last}"
    if key in initial_last_to_full:
        return initial_last_to_full[key]
    # Benzersiz soyad fallback
    if last in last_to_full:
        return last_to_full[last]
    return abbr


MIN_THRESHOLD = int(sys.argv[1]) if len(sys.argv) > 1 else 50
lineups = pd.read_parquet(ROOT / "data/2025-26__lineups_5man.parquet")
lineups = lineups[lineups["MIN"] >= MIN_THRESHOLD].copy().reset_index(drop=True)
print(f"MIN>={MIN_THRESHOLD} lineup: {len(lineups)}")

fit_scores, matched = [], 0
for _, row in lineups.iterrows():
    raw   = [n.strip() for n in row["GROUP_NAME"].split(" - ")]
    names = [expand_abbr(n) for n in raw]
    try:
        res = lineup_score_from_names(names, scores)
        fs  = res.get("lineup_score") or res.get("total_fit")
        if fs is not None:
            matched += 1
        fit_scores.append(fs)
    except Exception:
        fit_scores.append(None)

lineups["fit_score"] = fit_scores
print(f"Eslesen: {matched}/{len(lineups)}")

valid = lineups[lineups["fit_score"].notna() & lineups["NET_RATING"].notna()].copy()
if len(valid) < 5:
    print("Yeterli veri yok.")
    sys.exit()

r = valid["fit_score"].corr(valid["NET_RATING"])
r_rank = valid["fit_score"].corr(valid["NET_RATING"], method="spearman")
print(f"\nPearson  r = {r:.3f}  (n={len(valid)})")
print(f"Spearman r = {r_rank:.3f}")

valid_sorted = valid.nlargest(5, "fit_score")[["GROUP_NAME", "fit_score", "NET_RATING", "MIN"]]
print("\nEn yüksek fit_score lineup'lar:")
print(valid_sorted.to_string(index=False))

valid_sorted2 = valid.nlargest(5, "NET_RATING")[["GROUP_NAME", "fit_score", "NET_RATING", "MIN"]]
print("\nEn yuksek NET_RATING lineup'lar:")
for _, r2 in valid_sorted2.iterrows():
    print(f"  fit={r2['fit_score']:.3f}  net={r2['NET_RATING']:+.1f}  min={int(r2['MIN'])}")

# Kuartil analizi
try:
    valid["fit_q"] = pd.qcut(valid["fit_score"], 4,
                             labels=["Q1 (low)", "Q2", "Q3", "Q4 (high)"],
                             duplicates="drop")
    print("\nKuartil bazinda ortalama NET_RATING:")
    print(valid.groupby("fit_q", observed=True)["NET_RATING"].mean().round(2).to_string())
except Exception as e:
    print(f"Kuartil hatasi: {e}")

# Kontrol degisken analizi: sample size etkisi
print("\n--- Kontrol Degisken Analizi ---")
# MIN'e göre gruplara göre korelasyon
for min_cut in [50, 100, 200, 500]:
    sub = valid[valid["MIN"] >= min_cut]
    if len(sub) >= 10:
        r_sub = sub["fit_score"].corr(sub["NET_RATING"])
        print(f"  MIN>={min_cut:>4}: r={r_sub:+.3f}  n={len(sub)}")

# Oyuncu etki kontrolü: TOP takımlar vs BOTTOM takımlar
if "TEAM_ABBREVIATION" in lineups.columns:
    pass  # takım bazlı analiz için çok az satır olabilir

# Boş test: fit_score ~ NET_RATING scatter için quantile
print("\nEn yuksek fit ama dusuk NET_RATING (outlier'lar):")
if len(valid) >= 20:
    top_fit = valid.nlargest(20, "fit_score")
    bad_fit = top_fit.nsmallest(5, "NET_RATING")
    for _, r2 in bad_fit.iterrows():
        gn = r2['GROUP_NAME'][:50] if len(r2['GROUP_NAME']) > 50 else r2['GROUP_NAME']
        print(f"  fit={r2['fit_score']:.3f}  net={r2['NET_RATING']:+.1f}  {gn}")
