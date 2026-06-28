"""
Basketball Reference per-game istatistik scraper.
Hedef: PTS, REB, AST, STL, BLK, FGA, FG_PCT, FG3A, FG3_PCT, FTA, TOV, MIN, GP, POSITION

URL: https://www.basketball-reference.com/leagues/NBA_{year}_per_game.html

Çıktı: data/{season}__bref_pergame.parquet
       data/{season}__hist_merged.parquet  (advanced ile birleşik, nba_api format)
"""

import time
import sys
import hashlib
from pathlib import Path

import requests
from bs4 import BeautifulSoup
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NbaArchetypeResearch/1.0; educational use only)"
    )
}
SLEEP = 2.0  # BBref rate limit

# BBref pozisyon → nba_api pozisyon (ilk pozisyonu al)
def _normalize_pos(pos: str) -> str:
    if not pos:
        return "G"
    primary = pos.split("-")[0].strip()
    mapping = {"PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
               "G": "G", "F": "F"}
    return mapping.get(primary, primary)


def _season_to_year(season: str) -> int:
    return int(season.split("-")[0]) + 1


def fetch_bref_pergame(season: str, force: bool = False) -> pd.DataFrame:
    """BBref per-game tablosunu çeker."""
    out_p = DATA / f"{season}__bref_pergame.parquet"
    if out_p.exists() and not force:
        return pd.read_parquet(out_p)

    year = _season_to_year(season)
    url  = f"https://www.basketball-reference.com/leagues/NBA_{year}_per_game.html"
    print(f"  [{season}] per-game çekiliyor: {url}")

    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"  [HATA] {season}: {e}")
        return pd.DataFrame()

    soup = BeautifulSoup(resp.text, "lxml")
    table = soup.find("table", {"id": "per_game_stats"})
    if table is None:
        # Eski sayfa formatı farklı olabilir
        table = soup.find("table", {"id": "per_game"})
    if table is None:
        print(f"  [HATA] {season}: per_game tablosu bulunamadı")
        return pd.DataFrame()

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        tds = tr.find_all(["td", "th"])
        if not tds:
            continue
        cells = {td.get("data-stat", ""): td.get_text(strip=True) for td in tds}

        player = cells.get("name_display") or cells.get("player", "")
        if not player or player in ("Player", ""):
            continue

        # BBref slug: /players/j/jordami01.html
        bref_slug = ""
        for td in tds:
            a = td.find("a")
            if a and "/players/" in (a.get("href", "")):
                bref_slug = a["href"].split("/players/")[1].rstrip("/").replace(".html", "")
                break  # örn. "j/jordami01"

        team = cells.get("team_name_abbr") or cells.get("team_id", "")
        pos  = cells.get("pos", "")

        def _f(k):
            v = cells.get(k, "")
            try:
                return float(v) if v not in ("", "\xa0", "—") else None
            except ValueError:
                return None

        def _i(k):
            v = _f(k)
            return int(v) if v is not None else None

        # BBref modern format: per-game stats have _per_g suffix (ör. pts_per_g).
        # Eski format (pre-2020 cache): pts, mp, trb vb. — fallback olarak dene.
        rows.append({
            "PLAYER_NAME":       player,
            "BREF_SLUG":         bref_slug,
            "TEAM_ABBREVIATION": team,
            "POSITION_raw":      pos,
            "GP":                _i("g") or _i("games"),
            "MIN":               _f("mp_per_g") or _f("mp"),
            "PTS":               _f("pts_per_g") or _f("pts"),
            "REB":               _f("trb_per_g") or _f("trb"),
            "AST":               _f("ast_per_g") or _f("ast"),
            "STL":               _f("stl_per_g") or _f("stl"),
            "BLK":               _f("blk_per_g") or _f("blk"),
            "TOV":               _f("tov_per_g") or _f("tov"),
            "FGA":               _f("fga_per_g") or _f("fga"),
            "FG_PCT":            _f("fg_pct"),
            "FG3A":              _f("fg3a_per_g") or _f("fg3a"),
            "FG3_PCT":           _f("fg3_pct"),
            "FTA":               _f("fta_per_g") or _f("fta"),
        })

    df = pd.DataFrame(rows)
    if df.empty:
        print(f"  [UYARI] {season}: per-game satır yok")
        return df

    # Traded players: TOT satırını tut
    has_tot = df[df["TEAM_ABBREVIATION"] == "TOT"]["PLAYER_NAME"].unique()
    df = df[~((df["PLAYER_NAME"].isin(has_tot)) & (df["TEAM_ABBREVIATION"] != "TOT"))]
    df = df.reset_index(drop=True)

    df.to_parquet(out_p)
    print(f"  [{season}] {len(df)} oyuncu per-game kaydedildi")
    return df


def fetch_bref_mpg(season: str, force: bool = False) -> pd.DataFrame:
    """BBref totals tablosundan MP (total) çekip GP'ye bölerek MPG döndürür."""
    out_p = DATA / f"{season}__bref_mpg.parquet"
    if out_p.exists() and not force:
        return pd.read_parquet(out_p)

    year = _season_to_year(season)
    url  = f"https://www.basketball-reference.com/leagues/NBA_{year}_totals.html"
    print(f"  [{season}] totals (MP) çekiliyor: {url}")

    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"  [HATA MPG] {season}: {e}")
        return pd.DataFrame()

    soup  = BeautifulSoup(resp.text, "lxml")
    table = soup.find("table", {"id": "totals_stats"}) or soup.find("table", {"id": "totals"})
    if table is None:
        print(f"  [HATA MPG] {season}: totals tablosu bulunamadı")
        return pd.DataFrame()

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        tds = tr.find_all(["td", "th"])
        if not tds:
            continue
        cells = {td.get("data-stat", ""): td.get_text(strip=True) for td in tds}
        player = cells.get("name_display") or cells.get("player", "")
        if not player or player in ("Player", ""):
            continue
        team = cells.get("team_name_abbr") or cells.get("team_id", "")

        def _f(k):
            v = cells.get(k, "")
            try:
                return float(v) if v not in ("", "\xa0", "—") else None
            except ValueError:
                return None

        mp = _f("mp")
        gp = _f("g") or _f("games")
        rows.append({"PLAYER_NAME": player, "TEAM_ABBREVIATION": team,
                     "MP_total": mp, "GP": gp})

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Traded players: TOT satırını tut
    has_tot = df[df["TEAM_ABBREVIATION"] == "TOT"]["PLAYER_NAME"].unique()
    df = df[~((df["PLAYER_NAME"].isin(has_tot)) & (df["TEAM_ABBREVIATION"] != "TOT"))]
    df = df.reset_index(drop=True)

    # MPG hesapla
    df["MIN"] = (df["MP_total"] / df["GP"].replace(0, pd.NA)).round(1)
    df = df[["PLAYER_NAME", "MIN"]].dropna(subset=["MIN"])
    df = df.drop_duplicates("PLAYER_NAME").reset_index(drop=True)
    df.to_parquet(out_p)
    print(f"  [{season}] {len(df)} oyuncu MPG kaydedildi")
    return df


def build_hist_merged(season: str, force: bool = False) -> pd.DataFrame:
    """
    Per-game + advanced verilerini birleştirip hist_merged parqueti oluşturur.
    nba_api hist_merged formatına benzer kolon isimleri kullanır.
    """
    out_p = DATA / f"{season}__hist_merged.parquet"

    pg = fetch_bref_pergame(season, force=force)
    if pg.empty:
        print(f"  [{season}] per-game verisi yok, atlanıyor")
        return pd.DataFrame()

    # Advanced (BPM, USG_PCT, AST_PCT, TS_PCT, OREB_PCT, DREB_PCT)
    adv_p = DATA / f"{season}__bref_advanced.parquet"
    if adv_p.exists():
        adv = pd.read_parquet(adv_p)
        adv_cols = ["PLAYER_NAME"]
        for src, dst in [("USG_PCT_bref", "USG_PCT"), ("AST_PCT_bref", "AST_PCT"),
                          ("TS_PCT_bref", "TS_PCT"), ("BPM", "BPM"),
                          ("TRB_PCT_bref", "TRB_PCT"), ("BLK_PCT_bref", "BLK_PCT"),
                          ("STL_PCT_bref", "STL_PCT"), ("TOV_PCT_bref", "TOV_PCT")]:
            if src in adv.columns:
                adv[dst] = adv[src]
                adv_cols.append(dst)
            elif dst in adv.columns:
                adv_cols.append(dst)
        # OREB/DREB percentages
        for col in ["OREB_PCT", "DREB_PCT"]:
            if col not in adv.columns:
                # BBref uses orb_pct / drb_pct via data-stat
                pass
            else:
                adv_cols.append(col)
        adv_cols = list(dict.fromkeys(adv_cols))  # dedupe
        adv = adv.drop_duplicates("PLAYER_NAME")
        merged = pg.merge(adv[adv_cols], on="PLAYER_NAME", how="left")
    else:
        merged = pg.copy()

    # Türetilen metrikler
    if "AST" in merged.columns and "TOV" in merged.columns:
        merged["AST_TO"] = (merged["AST"] / merged["TOV"].replace(0, pd.NA)).fillna(0)
    if "FTA" in merged.columns and "FGA" in merged.columns:
        merged["FT_RATE"] = (merged["FTA"] / merged["FGA"].replace(0, pd.NA)).fillna(0)

    # Pozisyon normalize et
    merged["POSITION"] = merged["POSITION_raw"].fillna("").apply(_normalize_pos)
    merged.drop(columns=["POSITION_raw"], inplace=True, errors="ignore")

    # PLAYER_ID: BBref slug tabanlı (sezon bağımsız, çapraz sezon tutarlı)
    # Slug: "j/jordami01" → MD5(slug)[:8] hex → int
    # Slug yoksa: MD5(isim) ile fallback (eski davranış)
    def _make_id(row) -> int:
        slug = str(row.get("BREF_SLUG", "") or "")
        key  = slug if slug else f"{row['PLAYER_NAME']}__{season}"
        h    = hashlib.md5(key.encode()).hexdigest()
        return int(h[:8], 16)

    merged["PLAYER_ID"] = merged.apply(_make_id, axis=1)
    merged["SEASON"] = season

    # hist_merged formatında GP filtresi: en az 10 maç
    merged = merged[merged["GP"].fillna(0) >= 10].reset_index(drop=True)

    # MIN eksikse (BBref eski tablolarda mp sütunu yok) → totals'tan çek
    if "MIN" not in merged.columns or merged["MIN"].isna().all():
        time.sleep(SLEEP)
        mpg = fetch_bref_mpg(season, force=force)
        if not mpg.empty:
            merged = merged.merge(mpg[["PLAYER_NAME", "MIN"]], on="PLAYER_NAME", how="left",
                                  suffixes=("_old", ""))
            if "MIN_old" in merged.columns:
                merged.drop(columns=["MIN_old"], inplace=True)
            filled = merged["MIN"].notna().sum()
            print(f"  [{season}] MIN totals'tan dolduruldu: {filled}/{len(merged)}")
        if "MIN" not in merged.columns or merged["MIN"].isna().all():
            merged["MIN"] = 25.0  # son çare placeholder

    merged.to_parquet(out_p)
    print(f"  [{season}] hist_merged oluşturuldu: {len(merged)} oyuncu")
    return merged


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", nargs="*", default=[
        "1989-90", "1990-91", "1991-92", "1992-93", "1993-94", "1994-95", "1995-96"
    ])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    for i, season in enumerate(args.seasons):
        build_hist_merged(season, force=args.force)
        if i < len(args.seasons) - 1:
            time.sleep(SLEEP)

    print("\nTamamlandi. Simdi fetch_historical.py ve enrich_historical.py calistirin.")
