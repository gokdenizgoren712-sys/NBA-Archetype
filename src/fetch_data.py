"""
Aşama 1: NBA verisini çekme.

nba_api üzerinden güncel (ve sonradan tarihsel) sezon verisini çeker,
rate-limit'e saygı duyar, diske parquet olarak cache'ler.

Kurulum:
    pip install nba_api pandas pyarrow

NOT: stats.nba.com resmi/dokümante bir API DEĞİL. Bu yüzden:
  - İstekler arası bekleme (SLEEP) zorunlu, yoksa IP ban riski.
  - Her çekilen tablo diske cache'lenir; aynı sezonu iki kez çekme.
  - Endpoint'ler ara sıra değişir; hata yakalama şart.
"""

import time
import os
from pathlib import Path
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SLEEP = 0.8  # istekler arası saniye; agresif olma

# Bu üç tablo, çoğu bileşen için gereken metrikleri kapsar.
# Tracking (PT) ve Hustle yalnızca yeni sezonlarda mevcuttur (Aşama 4 notu).
MEASURE_TYPES_BASE = ["Base", "Advanced", "Usage", "Misc", "Scoring"]


def _cache_path(season: str, name: str) -> Path:
    safe = season.replace("/", "-")
    return DATA_DIR / f"{safe}__{name}.parquet"


def fetch_player_stats(season: str = "2025-26",
                       season_type: str = "Regular Season") -> dict:
    """
    Belirtilen sezon için tüm gerekli oyuncu tablolarını çeker.
    season formatı nba_api standardı: '2025-26'.
    Dönen: {tablo_adı: DataFrame}
    """
    from nba_api.stats.endpoints import (
        leaguedashplayerstats,
        leaguehustlestatsplayer,
        leaguedashptstats,
    )

    out = {}

    # 1) Box-score temelli + advanced + usage + misc + scoring
    for measure in MEASURE_TYPES_BASE:
        cp = _cache_path(season, f"player_{measure}")
        if cp.exists():
            out[measure] = pd.read_parquet(cp)
            print(f"[cache] {season} {measure}")
            continue
        try:
            resp = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                season_type_all_star=season_type,
                measure_type_detailed_defense=measure,
                per_mode_detailed="PerGame",
            )
            df = resp.get_data_frames()[0]
            df.to_parquet(cp)
            out[measure] = df
            print(f"[fetch] {season} {measure}  ({len(df)} oyuncu)")
        except Exception as e:
            print(f"[HATA] {season} {measure}: {e}")
        time.sleep(SLEEP)

    # 2) Hustle (yalnızca 2015-16+). Glue/energy/stopper bileşenleri için kritik.
    cp = _cache_path(season, "hustle")
    if cp.exists():
        out["Hustle"] = pd.read_parquet(cp); print(f"[cache] {season} Hustle")
    else:
        try:
            resp = leaguehustlestatsplayer.LeagueHustleStatsPlayer(
                season=season, season_type_all_star=season_type, per_mode_time="PerGame")
            df = resp.get_data_frames()[0]
            df.to_parquet(cp); out["Hustle"] = df
            print(f"[fetch] {season} Hustle ({len(df)})")
        except Exception as e:
            print(f"[HATA/yok] {season} Hustle: {e}")
        time.sleep(SLEEP)

    # 3) Tracking - sürüş/şut tipi (yalnızca 2013-14+). Downhill/Pull-Up/Off-Ball için.
    for pt_measure in ["Drives", "CatchShoot", "PullUpShot", "Passing"]:
        cp = _cache_path(season, f"pt_{pt_measure}")
        if cp.exists():
            out[f"PT_{pt_measure}"] = pd.read_parquet(cp); print(f"[cache] {season} PT_{pt_measure}")
            continue
        try:
            resp = leaguedashptstats.LeagueDashPtStats(
                season=season, season_type_all_star=season_type,
                pt_measure_type=pt_measure, per_mode_simple="PerGame",
                player_or_team="Player")
            df = resp.get_data_frames()[0]
            df.to_parquet(cp); out[f"PT_{pt_measure}"] = df
            print(f"[fetch] {season} PT_{pt_measure} ({len(df)})")
        except Exception as e:
            print(f"[HATA/yok] {season} PT_{pt_measure}: {e}")
        time.sleep(SLEEP)

    return out


def merge_player_tables(tables: dict) -> pd.DataFrame:
    """Tüm tabloları PLAYER_ID üzerinde tek satır/oyuncu olacak şekilde birleştirir."""
    base = tables.get("Base")
    if base is None:
        raise RuntimeError("Base tablosu yok; çekme başarısız.")
    merged = base.copy()
    id_col = "PLAYER_ID"
    for name, df in tables.items():
        if name == "Base":
            continue
        # çakışan kolonları ayıkla, sadece yeni metrikleri ekle
        new_cols = [c for c in df.columns if c not in merged.columns or c == id_col]
        if id_col not in df.columns:
            continue
        merged = merged.merge(df[new_cols], on=id_col, how="left", suffixes=("", f"_{name}"))
    return merged


# playerindex kısa pozisyon kodu -> engines long format eşlemesi
_POS_SHORT_TO_LONG = {
    "G":   "Guard",
    "G-F": "Guard-Forward",
    "F-G": "Forward-Guard",
    "F":   "Forward",
    "F-C": "Forward-Center",
    "C-F": "Center-Forward",
    "C":   "Center",
}


def fetch_player_bios(season: str = "2025-26") -> pd.DataFrame:
    """PLAYER_ID + POSITION + HEIGHT bilgisini çeker (playerindex)."""
    from nba_api.stats.endpoints import playerindex, leaguedashplayerbiostats
    cp = _cache_path(season, "bios")
    if cp.exists():
        print(f"[cache] {season} bios")
        return pd.read_parquet(cp)

    # Boy için leaguedashplayerbiostats
    bio_df = pd.DataFrame()
    try:
        resp = leaguedashplayerbiostats.LeagueDashPlayerBioStats(
            season=season, per_mode_simple="PerGame")
        bio_df = resp.get_data_frames()[0][["PLAYER_ID", "PLAYER_HEIGHT_INCHES", "PLAYER_WEIGHT"]]
        time.sleep(SLEEP)
    except Exception as e:
        print(f"[HATA] bios height: {e}")

    # Pozisyon için playerindex
    pos_df = pd.DataFrame()
    try:
        resp2 = playerindex.PlayerIndex(season=season)
        idx = resp2.get_data_frames()[0]
        pos_df = idx[["PERSON_ID", "POSITION"]].rename(columns={"PERSON_ID": "PLAYER_ID"})
        pos_df["POSITION"] = pos_df["POSITION"].map(_POS_SHORT_TO_LONG).fillna(pos_df["POSITION"])
        time.sleep(SLEEP)
    except Exception as e:
        print(f"[HATA] playerindex: {e}")

    if bio_df.empty and pos_df.empty:
        return pd.DataFrame()

    df = bio_df if not bio_df.empty else pd.DataFrame({"PLAYER_ID": pos_df["PLAYER_ID"]})
    if not pos_df.empty:
        df = df.merge(pos_df, on="PLAYER_ID", how="left")

    df.to_parquet(cp)
    print(f"[fetch] {season} bios+pozisyon ({len(df)} oyuncu)")
    return df


def fetch_playoff_stats(season: str = "2025-26") -> pd.DataFrame:
    """
    Playoff sezon istatistiklerini çeker ve birleştirir.
    Çıktı: data/{season}__playoff_merged.parquet
    Sadece temel metrikler (Base, Advanced, Usage) — tracking playoff'ta güvenilmez.
    """
    out_p = DATA_DIR / f"{season.replace('/', '-')}__playoff_merged.parquet"
    if out_p.exists():
        print(f"[cache] {season} playoff_merged")
        return pd.read_parquet(out_p)

    tables = {}
    for measure in ["Base", "Advanced", "Usage"]:
        cp = _cache_path(season, f"playoff_{measure}")
        if cp.exists():
            tables[measure] = pd.read_parquet(cp)
            print(f"[cache] {season} playoff {measure}")
            continue
        try:
            from nba_api.stats.endpoints import leaguedashplayerstats
            resp = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                season_type_all_star="Playoffs",
                measure_type_detailed_defense=measure,
                per_mode_detailed="PerGame",
            )
            df = resp.get_data_frames()[0]
            df.to_parquet(cp)
            tables[measure] = df
            print(f"[fetch] {season} playoff {measure} ({len(df)} oyuncu)")
        except Exception as e:
            print(f"[HATA/yok] {season} playoff {measure}: {e}")
        time.sleep(SLEEP)

    if not tables:
        return pd.DataFrame()

    merged = merge_player_tables(tables)
    merged.to_parquet(out_p)
    print(f"[fetch] {season} playoff_merged: {len(merged)} oyuncu")
    return merged


if __name__ == "__main__":
    # internet açıkken çalıştır:
    tables = fetch_player_stats("2025-26", "Regular Season")
    df = merge_player_tables(tables)

    # Pozisyon + boy ekle
    bios = fetch_player_bios("2025-26")
    if not bios.empty:
        bio_cols = ["PLAYER_ID"] + [c for c in bios.columns
                                    if c in ("POSITION", "PLAYER_HEIGHT_INCHES",
                                             "PLAYER_WEIGHT", "PLAYER_HEIGHT")]
        df = df.merge(bios[bio_cols], on="PLAYER_ID", how="left")

    df.to_parquet(DATA_DIR / "2025-26__merged.parquet")
    print(f"\nBirleşik tablo: {df.shape[0]} oyuncu, {df.shape[1]} kolon")
    print("Kaydedildi: data/2025-26__merged.parquet")

    # Playoff verisi (sezon bittiyse otomatik çekilir, önce regular season cache'i kontrol eder)
    print("\nPlayoff verisi çekiliyor...")
    po = fetch_playoff_stats("2025-26")
    if not po.empty:
        print(f"Playoff: {len(po)} oyuncu, {po.shape[1]} kolon")
    else:
        print("Playoff verisi yok (sezon henüz bitmemiş olabilir).")
