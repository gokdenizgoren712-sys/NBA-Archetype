"""
Prospect modeli backtest cetveli (P5).

Geçmiş NCAA sınıflarının (Torvik) prospect notunu, o oyuncuların gerçek NBA
kariyer-zirvesi (historical__labeled peak BPM) ile korele eder. Modelin
"NBA başarısını yordama" gücünü ölçer + ağırlık kalibrasyonuna cetvel olur.

Önce sınıfları çek:
    for s in 2016-17 2017-18 2018-19 2019-20 2020-21; do
        python src/fetch_ncaa.py --season $s; done
Sonra:
    python scripts/prospect_backtest.py

Bulgu (kalibrasyon): üretim sinyali overall_pct breadth yerine OBPM+PTS
persantili + SOS-persantili → Spearman 0.19 → 0.26, top-60 NBA-hit %60 → %67.
"""
import sys
from pathlib import Path

import pandas as pd
import numpy as np
from scipy.stats import spearmanr, pearsonr

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from prospect import add_prospect_fields

CLASSES = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21"]
MIN_NBA_GP = 30


def _grades_for(season: str) -> pd.DataFrame:
    p = ROOT / "data" / f"ncaa__{season}__player_scores.parquet"
    if not p.exists():
        print(f"[atla] {p.name} yok — önce fetch_ncaa --season {season}")
        return pd.DataFrame()
    df = pd.read_parquet(p)
    df["overall_pct"] = df["overall_score"].rank(pct=True, na_option="keep")
    df = add_prospect_fields(df)
    df["yr"] = int(season[:4])
    return df


def main():
    frames = [g for s in CLASSES if len(g := _grades_for(s))]
    if not frames:
        print("Hiç sınıf yok."); return
    allp = pd.concat(frames)
    # her oyuncunun SON kolej sezonu (draft-öncesi profil)
    last = allp.sort_values("yr").groupby("PLAYER_NAME").tail(1).copy()

    nba = pd.read_parquet(ROOT / "data" / "historical__labeled.parquet")
    nba = nba[nba["GP"].fillna(0) >= MIN_NBA_GP]
    peak = nba.groupby("PLAYER_NAME")["BPM"].max().rename("peak_bpm").reset_index()
    last = last.merge(peak, on="PLAYER_NAME", how="left")
    last["reached"] = last["peak_bpm"].notna()
    last["outcome"] = last["peak_bpm"].fillna(-6.0)   # NBA'e ulaşmayan = bust-altı

    m = last[last["reached"]]
    print(f"kolej prospekti: {len(last)} | NBA'e ulaşan (isim eşleşen): "
          f"{last['reached'].sum()} (%{100*last['reached'].mean():.1f})\n")
    print("=== KORELASYON (prospect_grade → NBA sonucu) ===")
    print(f"  tüm prospekt (non-NBA=-6): Spearman {spearmanr(last.prospect_grade, last.outcome)[0]:+.3f}"
          f"  Pearson {pearsonr(last.prospect_grade, last.outcome)[0]:+.3f}")
    print(f"  sadece NBA'e ulaşanlar    : Spearman {spearmanr(m.prospect_grade, m.peak_bpm)[0]:+.3f} (n={len(m)})")

    print("\n=== HIT-RATE (nota göre en iyi 60 vs geri kalan) ===")
    top = last.nlargest(60, "prospect_grade")
    rest = last.drop(top.index)
    print(f"  top-60: NBA-hit %{100*top.reached.mean():.0f}, "
          f"medyan peak BPM {top[top.reached].peak_bpm.median():.1f}")
    print(f"  kalan : NBA-hit %{100*rest.reached.mean():.0f}")


if __name__ == "__main__":
    main()
