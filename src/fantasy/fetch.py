# -*- coding: utf-8 -*-
"""Fantezi modülünün ham verisi: oyuncu maç logları + güncel kadrolar.

Sitenin geri kalanı SEZON ORTALAMASIYLA çalışıyor; fantezi ise maç maç
dağılıma ihtiyaç duyuyor (haftalık varyans, High Score'da haftanın en iyi
maçı, sezon simülasyonu). O yüzden ayrı bir çekme adımı.

İki endpoint de sezon başına TEK istek (2026-09 ölçüldü: ~1-2 sn), yani
stats.nba.com'u yormuyor. Yine de fetch_data.py ile aynı kural: her tablo
diske cache'lenir, aynı sezon ikinci kez çekilmez (refresh=True hariç).

Çıktılar:
  data/{season}__player_gamelogs.parquet   (normal sezon, oyuncu × maç)
  data/{season}__rosters.parquet           (aktif kadro, PLAYER_ID + takım + pozisyon)
"""

from __future__ import annotations

import time
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATA_DIR.mkdir(exist_ok=True)

SLEEP = 0.8
RETRIES = 3

GAMELOG_COLUMNS = [
    "SEASON_ID", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION",
    "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "MIN",
    "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA",
    "OREB", "DREB", "REB", "AST", "STL", "BLK", "TOV", "PF", "PTS", "PLUS_MINUS",
]

# playerindex'in kısa pozisyon kodları — fetch_data.py'deki bios ile aynı sözlük.
RAW_POSITIONS = {"G", "F", "C", "G-F", "F-G", "F-C", "C-F"}


def _path(season: str, name: str) -> Path:
    return DATA_DIR / f"{season.replace('/', '-')}__{name}.parquet"


def _call(make, what: str):
    """nba_api çağrısını sınırlı sayıda, artan beklemeyle tekrarlar."""
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            frames = make().get_data_frames()
            time.sleep(SLEEP)
            return frames[0]
        except Exception as e:  # nba_api ağ/JSON hatalarını tek tipte vermiyor
            last = e
            print(f"[retry {attempt}/{RETRIES}] {what}: {e}")
            time.sleep(SLEEP * 3 * attempt)
    raise RuntimeError(f"{what} failed after {RETRIES} attempts: {last}")


def add_game_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Maç başına double-double / triple-double bayrakları (bazı puan
    formatları bonus veriyor). İki haneli sayılan kategoriler: PTS, REB,
    AST, STL, BLK — NBA'nin kendi DD2/TD3 tanımıyla aynı."""
    tens = (df[["PTS", "REB", "AST", "STL", "BLK"]] >= 10).sum(axis=1)
    out = df.copy()
    out["DD2"] = (tens >= 2).astype("int8")
    out["TD3"] = (tens >= 3).astype("int8")
    return out


def fetch_player_gamelogs(season: str, refresh: bool = False) -> pd.DataFrame:
    """Bir normal sezonun tüm oyuncu maç satırları."""
    cp = _path(season, "player_gamelogs")
    if cp.exists() and not refresh:
        print(f"[cache] {season} player_gamelogs")
        return pd.read_parquet(cp)

    from nba_api.stats.endpoints import leaguegamelog

    raw = _call(lambda: leaguegamelog.LeagueGameLog(
        season=season, player_or_team_abbreviation="P",
        season_type_all_star="Regular Season", timeout=90), f"gamelogs {season}")
    missing = [c for c in GAMELOG_COLUMNS if c not in raw.columns]
    if missing:
        raise RuntimeError(f"gamelogs {season}: endpoint dropped columns {missing}")

    df = raw[GAMELOG_COLUMNS].copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date.astype(str)
    df["IS_HOME"] = ~df["MATCHUP"].str.contains("@", regex=False)
    df["SEASON"] = season
    df = add_game_flags(df)
    df.to_parquet(cp, index=False)
    print(f"[fetch] {season} player_gamelogs ({len(df)} satır, {df['PLAYER_ID'].nunique()} oyuncu)")
    return df


def fetch_rosters(season: str = "2026-27", refresh: bool = False) -> pd.DataFrame:
    """Sezonun aktif kadroları. Takaslar ve serbest oyuncu hareketleri
    burada görünür — 2025-26 istatistiklerindeki TEAM_ABBREVIATION eski takımı
    gösterir, projeksiyon yeni takımı buradan almalı. Kadrolar sezon öncesi
    değişmeye devam ettiği için bu dosya düzenli yenilenmeli (refresh=True)."""
    cp = _path(season, "rosters")
    if cp.exists() and not refresh:
        print(f"[cache] {season} rosters")
        return pd.read_parquet(cp)

    from nba_api.stats.endpoints import playerindex

    raw = _call(lambda: playerindex.PlayerIndex(season=season, timeout=60), f"rosters {season}")
    df = raw[raw["ROSTER_STATUS"] == 1].copy()
    df = pd.DataFrame({
        "PLAYER_ID": df["PERSON_ID"].astype("int64"),
        "PLAYER_NAME": (df["PLAYER_FIRST_NAME"].fillna("") + " " + df["PLAYER_LAST_NAME"].fillna("")).str.strip(),
        "TEAM_ID": df["TEAM_ID"].astype("int64"),
        "TEAM_ABBREVIATION": df["TEAM_ABBREVIATION"],
        "POSITION_RAW": df["POSITION"],
        "DRAFT_YEAR": pd.to_numeric(df["DRAFT_YEAR"], errors="coerce"),
        "DRAFT_NUMBER": pd.to_numeric(df["DRAFT_NUMBER"], errors="coerce"),
        "FROM_YEAR": pd.to_numeric(df["FROM_YEAR"], errors="coerce"),
    })
    unknown = sorted(set(df["POSITION_RAW"].dropna()) - RAW_POSITIONS)
    if unknown:
        print(f"[uyarı] {season} rosters: tanınmayan pozisyon kodları {unknown}")
    df["FETCHED_AT"] = pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")
    df.to_parquet(cp, index=False)
    print(f"[fetch] {season} rosters ({len(df)} oyuncu, {df['TEAM_ABBREVIATION'].nunique()} takım)")
    return df
