"""
G2 Modern backtest — veri hazırlığı.

Yakın TAMAMLANMIŞ sezonların (tracking+hustle var) modern verisini çeker ve
COMPONENT_SIGNATURES (modern yol) ile skorlar. Amaç: modern skorlama yolunu
ilk kez cetvele karşı doğrulamak (tarihsel gibi ~0.78 tutturuyor mu?).

Çalıştır:  python src/fetch_modern_seasons.py [sezon1 sezon2 ...]
           (arg yoksa 6 varsayılan sezon)
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import pandas as pd  # noqa: E402
from fetch_data import fetch_player_stats, merge_player_tables, fetch_player_bios, DATA_DIR  # noqa: E402
from score_compat import build_score_table  # noqa: E402

# 6 tamamlanmış tracking-dönemi sezon (COVID-kısaltılmışları hariç: temiz 82-maç)
DEFAULT_SEASONS = ["2016-17", "2017-18", "2018-19", "2021-22", "2022-23", "2023-24"]


def prep(season: str):
    merged_p = DATA_DIR / f"{season}__merged.parquet"
    if not merged_p.exists():
        tables = fetch_player_stats(season, "Regular Season")
        df = merge_player_tables(tables)
        bios = fetch_player_bios(season)
        if not bios.empty:
            cols = ["PLAYER_ID"] + [c for c in bios.columns if c in
                                    ("POSITION", "PLAYER_HEIGHT_INCHES", "PLAYER_WEIGHT", "PLAYER_HEIGHT")]
            df = df.merge(bios[cols], on="PLAYER_ID", how="left")
        try:
            from compute_bpm import compute_bpm
            df = compute_bpm(df)
        except Exception as e:
            print(f"  [uyarı] compute_bpm: {e}")
        df.to_parquet(merged_p)
        print(f"  [merged] {season}: {df.shape[0]} oyuncu, {df.shape[1]} kolon")
    else:
        print(f"  [cache] {season}__merged.parquet var")

    # Modern skorla
    st = build_score_table(season, "nba")
    out_p = DATA_DIR / f"{season}__player_scores.parquet"
    st.to_parquet(out_p)
    score_cols = [c for c in st.columns if c.startswith("score_")]
    core = {"Engine", "Ecosystem", "Hub", "Connector", "Creator", "Anchor", "Spacer", "Finisher", "Force", "Initiator", "Stopper", "Rim Runner"}
    modifiers = [c for c in score_cols if c.replace("score_", "") not in core]
    is_modern = len(modifiers) > 0
    print(f"  [scored] {season}: {len(st)} oyuncu, {len(score_cols)} score kolon, "
          f"{len(modifiers)} modifier → {'MODERN ✓' if is_modern else 'FALLBACK (modern DEĞİL!)'}")
    return is_modern


def main():
    seasons = sys.argv[1:] or DEFAULT_SEASONS
    print(f"Modern veri hazırlığı: {len(seasons)} sezon\n")
    for s in seasons:
        print(f"── {s} ──")
        try:
            prep(s)
        except Exception as e:
            print(f"  [HATA] {s}: {type(e).__name__}: {e}")
        time.sleep(1)
    print("\nBitti.")


if __name__ == "__main__":
    main()
