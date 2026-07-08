"""
G4 dry-run: primary_arch'ı lig-içi z-skoruna göre yeniden ata, dağılımı kontrol et.
Pipeline'a DOKUNMAZ — mevcut score_*'lardan hesaplar. NBA sağlıklı kalıyor mu +
EuroLeague/G-League dengeleniyor mu görür.
  python scripts/test_g4.py
"""
import sys
import glob
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

CORE = ["Engine", "Ecosystem", "Hub", "Connector", "Creator", "Anchor",
        "Spacer", "Finisher", "Force", "Initiator", "Stopper", "Rim Runner"]


def analyze(path, label):
    df = pd.read_parquet(path)
    if "GP" in df.columns:
        df = df[df["GP"].fillna(0) >= 15].copy()
    cols = [f"score_{c}" for c in CORE if f"score_{c}" in df.columns]
    if not cols:
        print(f"{label}: score kolonu yok"); return
    M = df[cols].astype(float).fillna(0)
    # lig-içi z (her arketip skorunu kendi dağılımında standardize et)
    mu, sd = M.mean(), M.std().replace(0, 1)
    Z = (M - mu) / sd
    new_arch = Z.idxmax(axis=1).str.replace("score_", "", regex=False)
    n = len(df)

    def show(series, tag):
        vc = series.fillna("(yok)").replace("", "(yok)").value_counts()
        maxpct = vc.iloc[0] / n * 100
        zero = [c for c in CORE if c not in vc.index]
        print(f"  {tag:10} en yüksek: {vc.index[0]} %{maxpct:.0f} | 0-alan arketip: {len(zero)}/12 "
              f"| " + ", ".join(f"{a} %{c/n*100:.0f}" for a, c in vc.head(5).items()))

    print(f"\n{label} (n={n}):")
    if "primary_arch" in df.columns:
        show(df["primary_arch"], "MEVCUT")
    show(new_arch, "z-skor")


analyze(ROOT / "data" / "2025-26__player_scores.parquet", "NBA 2025-26")
for pat, lab in [("data/euroleague__*__player_scores.parquet", "EuroLeague"),
                 ("data/gleague__*__player_scores.parquet", "G-League")]:
    fs = glob.glob(str(ROOT / pat))
    if fs:
        analyze(fs[0], lab)
print()
