"""
Basketball Reference Advanced Stats Scraper
Hedef: BPM, OBPM, DBPM, WS, WS/48, VORP — her sezon için

URL pattern: https://www.basketball-reference.com/leagues/NBA_{year}_advanced.html
  - 2024-25 sezonu → year=2025
  - 1996-97 sezonu → year=1997

Çıktı: data/{season}__bref_advanced.parquet
  Kolonlar: PLAYER_NAME, TEAM_ABBREVIATION, GP, BPM, OBPM, DBPM, WS, WS48, VORP, USG_PCT_bref, TS_PCT_bref

Notlar:
  - 1 saniye bekleme (BBref robot kuralı)
  - Birden fazla takımda oynayan oyuncu: sadece "TOT" satırı alınır (sezon toplamı)
  - Cache: parquet varsa tekrar çekilmez
"""

import time
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NbaArchetypeResearch/1.0; "
        "educational use only)"
    )
}
SLEEP = 1.5  # saniye — BBref rate limit


def _season_to_year(season: str) -> int:
    """'2024-25' → 2025,  '1996-97' → 1997"""
    return int(season.split("-")[0]) + 1


def fetch_bref_advanced(season: str, force: bool = False) -> pd.DataFrame:
    """Bir sezon için BBref advanced tablosunu çeker ve parquet'e kaydeder.
    Döner: DataFrame (PLAYER_NAME, BPM, OBPM, DBPM, WS, WS48, VORP, ...)
    """
    out_p = DATA / f"{season}__bref_advanced.parquet"
    if out_p.exists() and not force:
        return pd.read_parquet(out_p)

    year = _season_to_year(season)
    url  = f"https://www.basketball-reference.com/leagues/NBA_{year}_advanced.html"
    print(f"  [{season}] çekiliyor: {url}")

    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        resp.encoding = "utf-8"  # BBref UTF-8 yayınlar; auto-detect bazen hatalı
    except Exception as e:
        print(f"  [HATA] {season}: {e}")
        return pd.DataFrame()

    soup = BeautifulSoup(resp.text, "lxml")
    table = soup.find("table", {"id": "advanced"})
    if table is None:
        print(f"  [HATA] {season}: advanced tablosu bulunamadı")
        return pd.DataFrame()

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        tds = tr.find_all(["td", "th"])
        if not tds:
            continue
        cells = {td.get("data-stat", ""): td.get_text(strip=True) for td in tds}

        # BBref'te oyuncu adı data-stat="name_display" (eski: "player")
        player = cells.get("name_display") or cells.get("player", "")
        if not player or player in ("Player", ""):
            continue
        # Takım: data-stat="team_name_abbr" (eski: "team_id")
        team = cells.get("team_name_abbr") or cells.get("team_id", "")

        def _f(k):
            v = cells.get(k, "")
            try:
                return float(v) if v not in ("", "\xa0", "—") else None
            except ValueError:
                return None

        rows.append({
            "PLAYER_NAME":       player,
            "TEAM_ABBREVIATION": team,
            "GP":                _f("games") or _f("g"),
            "MP":                _f("mp"),
            "BPM":               _f("bpm"),
            "OBPM":              _f("obpm"),
            "DBPM":              _f("dbpm"),
            "VORP":              _f("vorp"),
            "WS":                _f("ws"),
            "WS48":              _f("ws_per_48"),
            "TS_PCT_bref":       _f("ts_pct"),
            "USG_PCT_bref":      _f("usg_pct"),
            "AST_PCT_bref":      _f("ast_pct"),
            "TRB_PCT_bref":      _f("trb_pct"),
            "BLK_PCT_bref":      _f("blk_pct"),
            "STL_PCT_bref":      _f("stl_pct"),
            "TOV_PCT_bref":      _f("tov_pct"),
        })

    df = pd.DataFrame(rows)
    if df.empty:
        print(f"  [UYARI] {season}: satır yok")
        return df

    # Birden fazla takımda oynayan oyuncu → TOT satırını tut
    has_tot = df[df["TEAM_ABBREVIATION"] == "TOT"]["PLAYER_NAME"].unique()
    df = df[~((df["PLAYER_NAME"].isin(has_tot)) & (df["TEAM_ABBREVIATION"] != "TOT"))]
    df = df.reset_index(drop=True)

    df.to_parquet(out_p)
    print(f"  [{season}] {len(df)} oyuncu kaydedildi -> {out_p.name}")
    return df


def fetch_all(seasons: list[str], force: bool = False):
    """Tüm sezonlar için sırayla çeker."""
    for i, season in enumerate(seasons):
        out_p = DATA / f"{season}__bref_advanced.parquet"
        if out_p.exists() and not force:
            print(f"  [{season}] cache var, atlanıyor")
            continue
        fetch_bref_advanced(season, force=force)
        if i < len(seasons) - 1:
            time.sleep(SLEEP)


def merge_bref_into_historical(hist_df: pd.DataFrame) -> pd.DataFrame:
    """
    historical__labeled.parquet'e BPM/OBPM/DBPM/WS/VORP sütunlarını ekler.
    Her sezon için {season}__bref_advanced.parquet okunur, PLAYER_NAME üzerinden join.
    """
    BREF_COLS = ["BPM","OBPM","DBPM","WS","WS48","VORP"]
    seasons = hist_df["SEASON"].unique().tolist()
    parts = []

    for season in sorted(seasons):
        part = hist_df[hist_df["SEASON"] == season].copy()
        bref_p = DATA / f"{season}__bref_advanced.parquet"
        if not bref_p.exists():
            print(f"  [{season}] bref parquet yok, atlanıyor")
            parts.append(part)
            continue

        bref = pd.read_parquet(bref_p)
        # İsim normalizasyonu: aksan temizleme için basit unidecode benzeri
        bref["_name_key"] = bref["PLAYER_NAME"].str.lower().str.strip()
        part["_name_key"] = part["PLAYER_NAME"].str.lower().str.strip()

        merge_cols = ["_name_key"] + [c for c in BREF_COLS if c in bref.columns]
        part = part.merge(bref[merge_cols], on="_name_key", how="left", suffixes=("","_bref"))
        # Çakışma yoksa doğrudan ekle; varsa sadece eksik olanı doldur
        for col in BREF_COLS:
            if col + "_bref" in part.columns:
                if col in part.columns:
                    part[col] = part[col].fillna(part[col + "_bref"])
                else:
                    part[col] = part[col + "_bref"]
                part.drop(columns=[col + "_bref"], inplace=True)

        part.drop(columns=["_name_key"], inplace=True, errors="ignore")
        parts.append(part)
        n = part["BPM"].notna().sum() if "BPM" in part.columns else 0
        print(f"  [{season}] BPM dolu: {n} / {len(part)}")

    return pd.concat(parts, ignore_index=True)


if __name__ == "__main__":
    import argparse
    import pandas as pd

    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", nargs="*",
                        help="Çekilecek sezonlar (ör. 2024-25 2023-24). Boş=tümü")
    parser.add_argument("--force", action="store_true",
                        help="Cache olsa bile yeniden çek")
    parser.add_argument("--merge", action="store_true",
                        help="Çekilen veriyi historical__labeled.parquet'e ekle")
    parser.add_argument("--test", action="store_true",
                        help="Sadece son 3 sezonu test et")
    args = parser.parse_args()

    hist_p = DATA / "historical__labeled.parquet"
    if hist_p.exists():
        hist_df = pd.read_parquet(hist_p)
        all_seasons = sorted(hist_df["SEASON"].unique().tolist())
    else:
        all_seasons = []

    if args.test:
        target_seasons = all_seasons[-3:] if all_seasons else ["2024-25","2023-24","2022-23"]
    elif args.seasons:
        target_seasons = args.seasons
    else:
        target_seasons = all_seasons

    print(f"Hedef: {len(target_seasons)} sezon\n")
    fetch_all(target_seasons, force=args.force)

    if args.merge and hist_p.exists():
        print("\nHistorical parquet'e merge ediliyor...")
        hist_df = pd.read_parquet(hist_p)
        enriched = merge_bref_into_historical(hist_df)
        enriched.to_parquet(hist_p)
        n_bpm = enriched["BPM"].notna().sum() if "BPM" in enriched.columns else 0
        print(f"Kaydedildi. BPM dolu toplam: {n_bpm} / {len(enriched)}")
