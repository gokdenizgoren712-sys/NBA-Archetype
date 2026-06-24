"""
Aşama 4: 1983-84'ten 2024-25'e kadar her sezon için veri çek ve etiketle.

- Modern metrikler (tracking/hustle) yok -> FALLBACK_SIGNATURES kullanılır.
- Her sezon önce cache'e bakılır; zaten varsa atlanır.
- Çıktı: data/historical__labeled.parquet (tüm sezonlar birleşik)
"""
import sys, time, json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from fetch_data import _cache_path, SLEEP
from engine import predict_components, assign_positions, select_signatures
from signatures import FALLBACK_SIGNATURES, POSITION_COMPONENTS

LEARNED = ROOT / "config" / "learned_thresholds.json"

# 1983-84 -> "1983-84" formatı; 1983'ten 2024'e kadar (2025-26 zaten var)
START_YEAR = 1983
END_YEAR   = 2024   # dahil; 2024-25 en son tarihsel sezon

MIN_TOTAL_MINUTES = 200   # MIN * GP

# Tarihsel sezonlarda SADECE Base, Advanced, Usage, Misc, Scoring var (tracking yok)
MEASURE_TYPES_HIST = ["Base", "Advanced", "Usage", "Misc", "Scoring"]


def season_str(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def fetch_season_hist(season: str) -> pd.DataFrame:
    """Tarihsel sezon verisini çeker; merge edilmiş DataFrame döner."""
    from nba_api.stats.endpoints import leaguedashplayerstats

    merged_cp = DATA_DIR / f"{season.replace('/', '-')}__hist_merged.parquet"
    if merged_cp.exists():
        return pd.read_parquet(merged_cp)

    tables = {}
    for measure in MEASURE_TYPES_HIST:
        cp = _cache_path(season, f"hist_{measure}")
        if cp.exists():
            tables[measure] = pd.read_parquet(cp)
            print(f"  [cache] {season} {measure}")
            continue
        try:
            resp = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                season_type_all_star="Regular Season",
                measure_type_detailed_defense=measure,
                per_mode_detailed="PerGame",
            )
            df = resp.get_data_frames()[0]
            df.to_parquet(cp)
            tables[measure] = df
            print(f"  [fetch] {season} {measure} ({len(df)} oyuncu)")
        except Exception as e:
            print(f"  [HATA] {season} {measure}: {e}")
        time.sleep(SLEEP)

    if not tables:
        return pd.DataFrame()

    base = tables.get("Base")
    if base is None:
        return pd.DataFrame()
    merged = base.copy()
    id_col = "PLAYER_ID"
    for name, df in tables.items():
        if name == "Base":
            continue
        new_cols = [c for c in df.columns if c not in merged.columns or c == id_col]
        if id_col not in df.columns:
            continue
        merged = merged.merge(df[new_cols], on=id_col, how="left")

    merged.to_parquet(merged_cp)
    return merged


def label_season(df: pd.DataFrame, season: str) -> pd.DataFrame:
    """Tek sezonu fallback imzalarla etiketler."""
    if df.empty:
        return pd.DataFrame()

    # Minimum dakika filtresi
    if "MIN" in df.columns and "GP" in df.columns:
        df = df[(df["MIN"] * df["GP"]) >= MIN_TOTAL_MINUTES].reset_index(drop=True)

    # FT_RATE türet
    if "FTA" in df.columns and "FGA" in df.columns:
        df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

    sigset = select_signatures(df, force_fallback=True)   # eski sezon -> fallback zorla

    # Learned thresholds modern 2025-26 verisinden optimize edildi; fallback imzalarına uygulanmaz.

    _, positives = predict_components(df, sigset=sigset, force_fallback=True)
    positions  = assign_positions(df, position_col="POSITION") if "POSITION" in df.columns else pd.DataFrame(
        False, index=df.index, columns=sorted(POSITION_COMPONENTS))

    comp_cols = list(positives.columns)
    pos_cols  = sorted(POSITION_COMPONENTS)

    def tag(row):
        p = [c for c in pos_cols if row.get(c, False)]
        c = [c for c in comp_cols if row.get(c, False)]
        return " | ".join(p + c) or "—"

    keep_cols = ["PLAYER_ID", "PLAYER_NAME", "BREF_SLUG", "GP", "MIN", "PTS", "REB", "AST",
                 "TEAM_ABBREVIATION", "POSITION"]
    keep_cols = [c for c in keep_cols if c in df.columns]

    out = pd.concat([
        df[keep_cols].reset_index(drop=True),
        positives.reset_index(drop=True),
        positions.reset_index(drop=True),
    ], axis=1)
    out["SEASON"] = season
    out["TAG"] = out.apply(tag, axis=1)
    out["N_COMPONENTS"] = positives.sum(axis=1) + positions.sum(axis=1)
    return out


def main(start: int = START_YEAR, end: int = END_YEAR, test_mode: bool = False):
    """
    start..end (dahil) sezonlarını işler.
    test_mode=True: sadece 3 sezon çek (hız testi).
    """
    seasons = [season_str(y) for y in range(start, end + 1)]
    if test_mode:
        seasons = seasons[-3:]   # son 3 sezon (2022-23, 2023-24, 2024-25)
        print(f"[TEST] {len(seasons)} sezon: {seasons}")
    else:
        print(f"Toplam {len(seasons)} sezon: {seasons[0]} -> {seasons[-1]}")

    all_frames = []
    for season in seasons:
        print(f"\n=== {season} ===")
        df = fetch_season_hist(season)
        if df.empty:
            print(f"  [atla] {season} verisi yok")
            continue
        labeled = label_season(df, season)
        if not labeled.empty:
            all_frames.append(labeled)
            print(f"  Etiketlendi: {len(labeled)} oyuncu")

    if not all_frames:
        print("Hiç veri yok.")
        return

    combined = pd.concat(all_frames, ignore_index=True)
    out = DATA_DIR / "historical__labeled.parquet"
    combined.to_parquet(out)
    print(f"\n=== TAMAMLANDI ===")
    print(f"Toplam kayıt: {len(combined)} ({combined['SEASON'].nunique()} sezon)")
    print(f"Kaydedildi: {out}")

    # Özet: bileşen başına kaç benzersiz oyuncu-sezon?
    comp_cols = [c for c in combined.columns
                 if c in FALLBACK_SIGNATURES or c in POSITION_COMPONENTS]
    print("\nBileşen dağılımı (tüm sezonlar):")
    for col in comp_cols:
        n = combined[col].sum()
        print(f"  {col:<18} {n:>6} oyuncu-sezon")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="Sadece son 3 sezon (hız testi)")
    parser.add_argument("--start", type=int, default=START_YEAR)
    parser.add_argument("--end",   type=int, default=END_YEAR)
    args = parser.parse_args()
    main(start=args.start, end=args.end, test_mode=args.test)
