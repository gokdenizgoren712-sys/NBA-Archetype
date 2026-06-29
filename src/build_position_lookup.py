"""
BBref pozisyon lookup tablosu olusturur.

Her sezon icin fetch_bref_pergame() cagirir (cacheli),
PLAYER_NAME + SEASON -> POSITION_raw (birincil) lookup'u kaydeder.
Ardindan historical__labeled.parquet'taki NaN POSITION'lari gunceller.

Calistir:
  python src/build_position_lookup.py
"""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))

from fetch_bref_pergame import fetch_bref_pergame

SEASONS = [
    f"{y}-{str(y+1)[-2:]}"
    for y in range(1983, 2025)
]

_POS_PRIMARY = {
    "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
    "G": "G", "F": "F", "G-F": "G-F", "F-G": "G-F",
    "F-C": "F-C", "C-F": "F-C",
}


def _norm_primary(pos):
    if not pos:
        return ""
    p = pos.split("-")[0].strip()
    return _POS_PRIMARY.get(p, p)


def _norm_secondary(pos):
    if not pos:
        return ""
    parts = pos.split("-")
    if len(parts) < 2:
        return ""
    return _POS_PRIMARY.get(parts[1].strip(), parts[1].strip())


def build_lookup(force=False):
    out_p = DATA / "position_lookup.parquet"
    if out_p.exists() and not force:
        print("  position_lookup.parquet mevcut, okunuyor")
        return pd.read_parquet(out_p)

    frames = []
    for season in SEASONS:
        print(f"  {season}...", end=" ", flush=True)
        df = fetch_bref_pergame(season)
        if df.empty:
            print("bos")
            continue
        if "POSITION_raw" not in df.columns:
            print("POSITION_raw yok")
            continue
        sub = df[["PLAYER_NAME", "POSITION_raw"]].copy()
        sub["SEASON"] = season
        sub["POS_PRIMARY"] = sub["POSITION_raw"].fillna("").apply(_norm_primary)
        sub["POS_SECONDARY"] = sub["POSITION_raw"].fillna("").apply(_norm_secondary)
        frames.append(sub)
        print(f"{len(sub)} oyuncu")

    if not frames:
        print("HIC VERI YOK")
        return pd.DataFrame()

    lookup = pd.concat(frames, ignore_index=True)
    lookup = lookup.dropna(subset=["PLAYER_NAME"])
    lookup = lookup[lookup["PLAYER_NAME"].str.strip() != ""]
    lookup.to_parquet(out_p)
    print(f"\n  Toplam {len(lookup)} kayit -> {out_p.name}")
    return lookup


def patch_historical(lookup):
    """historical__labeled.parquet'taki NaN POSITION'lari BBref verisiyle doldurur."""
    hist_p = DATA / "historical__labeled.parquet"
    if not hist_p.exists():
        print("  historical__labeled.parquet bulunamadi, atlaniyor")
        return

    hist = pd.read_parquet(hist_p)
    if "POSITION" not in hist.columns:
        hist["POSITION"] = ""
    before_nan = (hist["POSITION"].isna() | (hist["POSITION"].astype(str).str.strip() == "")).sum()
    print(f"  Onceki NaN/bos POSITION: {before_nan}")

    # Lookup dedupe: (PLAYER_NAME, SEASON) -> en sik gorulen pozisyon
    lkp_dedup = (
        lookup
        .groupby(["PLAYER_NAME", "SEASON"])["POS_PRIMARY"]
        .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else "")
        .reset_index()
    )
    lkp_sec_dedup = (
        lookup
        .groupby(["PLAYER_NAME", "SEASON"])["POS_SECONDARY"]
        .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else "")
        .reset_index()
    )
    # Sezon bagimsiz fallback: oyuncunun herhangi sezondaki pozisyon
    name_pos = (
        lookup.groupby("PLAYER_NAME")["POS_PRIMARY"]
        .agg(lambda x: x.mode().iloc[0] if not x.mode().empty else "")
        .reset_index()
        .rename(columns={"POS_PRIMARY": "_pos_name"})
    )

    # Merge
    merged = hist.merge(
        lkp_dedup.rename(columns={"POS_PRIMARY": "_pos_bref"}),
        on=["PLAYER_NAME", "SEASON"], how="left"
    )
    merged = merged.merge(
        lkp_sec_dedup.rename(columns={"POS_SECONDARY": "_pos_sec_bref"}),
        on=["PLAYER_NAME", "SEASON"], how="left"
    )
    merged = merged.merge(name_pos, on="PLAYER_NAME", how="left")

    mask = merged["POSITION"].isna() | (merged["POSITION"].astype(str).str.strip() == "")
    merged.loc[mask, "POSITION"] = merged.loc[mask, "_pos_bref"].fillna("")

    mask2 = merged["POSITION"].isna() | (merged["POSITION"].astype(str).str.strip() == "")
    merged.loc[mask2, "POSITION"] = merged.loc[mask2, "_pos_name"].fillna("")

    merged["POS_SECONDARY"] = merged["_pos_sec_bref"].fillna("")

    merged.drop(columns=["_pos_bref", "_pos_sec_bref", "_pos_name"], inplace=True, errors="ignore")

    after_nan = (merged["POSITION"].isna() | (merged["POSITION"].astype(str).str.strip() == "")).sum()
    print(f"  Sonraki NaN/bos POSITION: {after_nan} (duzeltilen: {before_nan - after_nan})")
    merged.to_parquet(hist_p)
    print(f"  historical__labeled.parquet guncellendi")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    print("=== BBref Pozisyon Lookup ===")
    lookup = build_lookup(force=args.force)
    if not lookup.empty:
        print("\n=== historical__labeled Guncelleme ===")
        patch_historical(lookup)
        print("\nTamamlandi.")
