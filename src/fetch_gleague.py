"""
G-League veri çekme (Aşama 3.1).

nba_api üzerinden NBA G-League (league_id="20") oyuncu istatistiklerini çeker.
Tracking/hustle endpoint'leri G-League'i desteklemediğinden sadece:
  Base, Advanced, Usage
Bunlara ek olarak LeagueDashPlayerBioStats (pozisyon verisi) ve
compute_bpm (OBPM/DBPM proxy) eklenir.

Kullanım:
    python src/fetch_gleague.py
    python src/fetch_gleague.py --season 2024-25
"""

import time, sys
from pathlib import Path

import pandas as pd

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / "src"))

SLEEP       = 0.8   # nba_api rate-limit
LEAGUE_ID   = "20"  # G-League
MEASURES    = ["Base", "Advanced", "Usage"]


def _cache_path(season: str, name: str) -> Path:
    safe = season.replace("/", "-")
    return DATA_DIR / f"gleague__{safe}__{name}.parquet"


def fetch_gleague_stats(season: str = "2025-26") -> dict:
    from nba_api.stats.endpoints import leaguedashplayerstats, leaguedashplayerbiostats

    out = {}

    for measure in MEASURES:
        cp = _cache_path(season, f"player_{measure}")
        if cp.exists():
            out[measure] = pd.read_parquet(cp)
            print(f"[cache] G-League {season} {measure}")
            continue
        try:
            resp = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                season_type_all_star="Regular Season",
                measure_type_simple=measure,
                per_mode_simple="PerGame",
                league_id_nullable=LEAGUE_ID,
            )
            df = resp.get_data_frames()[0]
            df.to_parquet(cp)
            out[measure] = df
            print(f"[fetch] G-League {season} {measure} — {len(df)} oyuncu")
        except Exception as e:
            print(f"[HATA] G-League {measure}: {e}")
        time.sleep(SLEEP)

    # Pozisyon (bio)
    bio_cp = _cache_path(season, "player_Bio")
    if bio_cp.exists():
        out["Bio"] = pd.read_parquet(bio_cp)
        print(f"[cache] G-League {season} Bio")
    else:
        try:
            bio = leaguedashplayerbiostats.LeagueDashPlayerBioStats(
                season=season,
                season_type_all_star="Regular Season",
                league_id_nullable=LEAGUE_ID,
            )
            df_bio = bio.get_data_frames()[0]
            df_bio.to_parquet(bio_cp)
            out["Bio"] = df_bio
            print(f"[fetch] G-League {season} Bio — {len(df_bio)} oyuncu")
        except Exception as e:
            print(f"[HATA] G-League Bio: {e}")
        time.sleep(SLEEP)

    return out


def merge_gleague(tables: dict, season: str = "2025-26") -> pd.DataFrame:
    """
    Tüm G-League tablolarını tek bir DataFrame'de birleştirir.
    Çakışan sütunları '_adv' / '_usg' suffix'i ile yönetir.
    """
    base = tables.get("Base")
    if base is None:
        raise ValueError("Base tablosu eksik — çekme adımını kontrol et")

    merged = base.copy()

    def _join(df, suffix):
        if df is None or df.empty:
            return
        nonlocal merged
        drop = [c for c in df.columns
                if c in merged.columns and c not in ("PLAYER_ID", "PLAYER_NAME")]
        df2 = df.drop(columns=drop, errors="ignore")
        merged = merged.merge(df2, on=["PLAYER_ID", "PLAYER_NAME"],
                               how="left", suffixes=("", suffix))

    _join(tables.get("Advanced"), "_adv")
    _join(tables.get("Usage"),    "_usg")

    # Pozisyon
    bio = tables.get("Bio")
    if bio is not None and not bio.empty:
        pos_cols = ["PLAYER_ID", "PLAYER_NAME"]
        if "POSITION" in bio.columns:
            pos_cols.append("POSITION")
        elif "PLAYER_POSITION" in bio.columns:
            bio = bio.rename(columns={"PLAYER_POSITION": "POSITION"})
            pos_cols.append("POSITION")
        if "POSITION" in pos_cols and "POSITION" not in merged.columns:
            merged = merged.merge(bio[pos_cols], on=["PLAYER_ID", "PLAYER_NAME"],
                                   how="left")
        elif "POSITION" in pos_cols:
            # Bio pozisyonu daha güvenilir — override et
            merged = merged.drop(columns=["POSITION"], errors="ignore")
            merged = merged.merge(bio[pos_cols], on=["PLAYER_ID", "PLAYER_NAME"],
                                   how="left")

    if "POSITION" not in merged.columns:
        merged["POSITION"] = ""

    return merged.reset_index(drop=True)


def run(season: str = "2025-26"):
    out_path = _cache_path(season, "merged")
    if out_path.exists():
        print(f"[cache] Merged parquet zaten mevcut: {out_path.name}")
        print("  Yeniden çekmek için dosyayı sil.")
    else:
        tables = fetch_gleague_stats(season)
        df = merge_gleague(tables, season)

        # BPM proxy
        try:
            from compute_bpm import compute_bpm
            df = compute_bpm(df)
            print(f"  BPM proxy hesaplandı: OBPM/DBPM sütunları eklendi")
        except Exception as e:
            print(f"  [UYARI] BPM proxy: {e}")

        df.to_parquet(out_path)
        print(f"[OK] Merged kaydedildi: {out_path.name}  ({len(df)} oyuncu)")

    # Skor tablosu
    scores_path = _cache_path(season, "player_scores")
    if scores_path.exists():
        print(f"[cache] Scores parquet zaten mevcut: {scores_path.name}")
    else:
        print("Skor tablosu hesaplanıyor (FALLBACK imzaları)...")
        sys.path.insert(0, str(ROOT / "config"))
        from score_compat import build_score_table
        st = build_score_table(season, league="gleague")
        st.to_parquet(scores_path)
        print(f"[OK] Scores kaydedildi: {scores_path.name}  ({len(st)} oyuncu)")

    return out_path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="G-League veri çekici")
    parser.add_argument("--season", default="2025-26", help="Sezon (ör. 2025-26)")
    args = parser.parse_args()
    run(args.season)
