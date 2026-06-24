"""
1983-2013 sezonlarında MIN (dakika/maç) veri kalitesini kontrol eder.
BBref eski tablolarında MP sütunu bazen eksik — bu script hangi sezonlarda
MIN'in eksik/sıfır olduğunu raporlar.

Çalıştırma: python src/validate_min_coverage.py
"""
from pathlib import Path
import sys
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# El ile bilinen benchmark değerler (sezon, oyuncu, beklenen MPG aralığı)
BENCHMARKS = [
    ("1995-96", "Michael Jordan",  37, 42),
    ("1995-96", "Scottie Pippen",  36, 42),
    ("1995-96", "Dennis Rodman",   28, 38),
    ("1991-92", "Michael Jordan",  36, 42),
    ("1992-93", "Charles Barkley", 36, 42),
    ("1993-94", "Hakeem Olajuwon", 36, 42),
    ("1994-95", "David Robinson",  36, 42),
    ("1989-90", "Magic Johnson",   35, 42),
    ("1990-91", "Michael Jordan",  36, 42),
    ("1986-87", "Magic Johnson",   35, 42),
    ("1983-84", "Julius Erving",   34, 40),
]


def run():
    hist_path = DATA / "historical__labeled.parquet"
    if not hist_path.exists():
        print("[HATA] historical__labeled.parquet yok — once fetch_historical.py calistir.")
        sys.exit(1)

    df = pd.read_parquet(hist_path)
    print(f"\nToplam kayit: {len(df)}, Sezon araligı: {df['SEASON'].min()} - {df['SEASON'].max()}")

    # Sezon bazli MIN eksiklik raporu
    print("\n--- Sezon bazli MIN eksiklik ---")
    seasons_with_min = []
    for season, grp in df.groupby("SEASON"):
        if "MIN" not in grp.columns:
            missing_pct = 100.0
        else:
            missing_pct = grp["MIN"].isna().mean() * 100
            zero_pct    = (grp["MIN"].fillna(0) == 0).mean() * 100
        n = len(grp)
        flag = " !" if missing_pct > 30 else ""
        seasons_with_min.append((season, n, missing_pct))
        if missing_pct > 5:
            print(f"  {season}: {n} oyuncu, MIN eksik={missing_pct:.0f}%{flag}")

    # Benchmark kontrol
    print("\n--- Bilinen oyuncu MIN benchmark ---")
    ok = err = notfound = 0
    for season, name, lo, hi in BENCHMARKS:
        rows = df[(df["SEASON"] == season) & (df["PLAYER_NAME"].str.lower() == name.lower())]
        if rows.empty:
            nm = name.encode("ascii","replace").decode()
            print(f"  {season} {nm:<22} BULUNAMADI")
            notfound += 1
            continue
        min_val = rows.iloc[0].get("MIN")
        nm = name.encode("ascii","replace").decode()
        if pd.isna(min_val) or min_val == 0:
            print(f"  {season} {nm:<22} MIN=EKSIK !")
            err += 1
        elif lo <= min_val <= hi:
            print(f"  {season} {nm:<22} MIN={min_val:.1f} OK")
            ok += 1
        else:
            print(f"  {season} {nm:<22} MIN={min_val:.1f} ! (beklenen {lo}-{hi})")
            err += 1

    print(f"\nBenchmark: OK={ok}, HATALI={err}, BULUNAMADI={notfound}")
    total_flagged = sum(1 for _, _, mp in seasons_with_min if mp > 5)
    print(f"MIN eksiklik >5% olan sezon sayisi: {total_flagged}")


if __name__ == "__main__":
    run()
