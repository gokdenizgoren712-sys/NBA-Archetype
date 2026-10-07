# -*- coding: utf-8 -*-
"""NBA ödül modelleri için Basketball-Reference çekimleri (önce MIP, sonra diğer ödüller).

İki iş, ikisi de var olan verilere dokunmadan YENİ dosyalara yazar:

  1. Yaş: `{sezon}__bref_age.parquet`  — PLAYER_NAME, BREF_SLUG, TEAM_ABBREVIATION, AGE, GP, MP
     (`fetch_bref.py` yaşı kaydetmiyordu; NBA-API kaynaklı yaş yalnız 1996-97'den beri var.)
  2. Ödül oylaması: `awards__{ödül}_voting.parquet` — sezon başına oy tablosu (Rank, First, Pts Won, Pts Max, Share ...)
     MIP 1985-86'da başladı; sezon başına `awards_{yıl}.html` sayfasındaki ödül tablosu okunur.

Nezaket: B-Ref bot kuralı dakikada en çok 20 istek; burada 3.5 sn aralık. Her sezon / sayfa önbelleğe yazılır, yeniden çekilmez
(`--force` hariç). Engellenirsek (403 / 429) dururuz — ısrar etmeyiz.

    python -m src.fetch_awards --test            # tek sayfa dene (2024-25 yaş + MIP)
    python -m src.fetch_awards --age             # 1983-84 .. 2024-25 yaşları
    python -m src.fetch_awards --mip             # MIP oylaması 1985-86 .. 2025-26
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup, Comment

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; NbaArchetypeResearch/1.0; educational use only)"}
SLEEP = 3.5
MIP_FIRST_YEAR = 1986            # 1985-86 sezonu
FIRST_SEASON, LAST_SEASON = 1984, 2025       # sezon bitiş yılı: 1983-84 .. 2024-25 (yaş); oylama için 2026'ya kadar denenir


class Blocked(RuntimeError):
    pass


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[2:]}"


def _get(url: str) -> str:
    """Bağlantı kopmasında en çok 3 deneme (20 / 40 sn bekleyerek); 403 / 429'da hemen durur (engellenmeye ısrar etme)."""
    resp = None
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=25)
            break
        except (requests.ConnectionError, requests.Timeout) as e:
            print(f"  [bağlantı] {type(e).__name__}; {20 * (attempt + 1)} sn sonra yeniden", flush=True)
            time.sleep(20 * (attempt + 1))
    if resp is None:
        raise Blocked(f"bağlantı kurulamadı: {url}")
    if resp.status_code in (403, 429):
        raise Blocked(f"{resp.status_code} {url} — dur; bir süre sonra tekrar dene")
    if resp.status_code == 404:
        return ""
    resp.raise_for_status()
    resp.encoding = "utf-8"
    return resp.text


def _find_table(soup: BeautifulSoup, table_id: str):
    t = soup.find("table", {"id": table_id})
    if t is not None:
        return t
    for c in soup.find_all(string=lambda s: isinstance(s, Comment)):          # B-Ref bazı tabloları yorum içine saklar
        if f'id="{table_id}"' in c:
            inner = BeautifulSoup(c, "lxml").find("table", {"id": table_id})
            if inner is not None:
                return inner
    return None


def _num(v):
    try:
        return float(v) if v not in ("", "\xa0", "—") else None
    except (TypeError, ValueError):
        return None


# ── Yaş ───────────────────────────────────────────────────────────────────────

def fetch_age(end_year: int, force: bool = False) -> pd.DataFrame:
    season = season_label(end_year)
    out = DATA / f"{season}__bref_age.parquet"
    if out.exists() and not force:
        return pd.read_parquet(out)
    html = _get(f"https://www.basketball-reference.com/leagues/NBA_{end_year}_advanced.html")
    table = _find_table(BeautifulSoup(html, "lxml"), "advanced") if html else None
    if table is None:
        print(f"  [{season}] advanced tablosu yok")
        return pd.DataFrame()
    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        cells = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        name_td = cells.get("name_display") or cells.get("player")
        if name_td is None or not name_td.get_text(strip=True):
            continue
        rows.append({
            "PLAYER_NAME": name_td.get_text(strip=True),
            "BREF_SLUG": name_td.get("data-append-csv"),
            "TEAM_ABBREVIATION": (cells.get("team_name_abbr") or cells.get("team_id") or name_td).get_text(strip=True)
            if (cells.get("team_name_abbr") or cells.get("team_id")) else "",
            "AGE": _num(cells["age"].get_text(strip=True)) if "age" in cells else None,
            "GP": _num((cells.get("games") or cells.get("g")).get_text(strip=True)) if (cells.get("games") or cells.get("g")) else None,
            "MP": _num(cells["mp"].get_text(strip=True)) if "mp" in cells else None,
        })
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    tot = df[df["TEAM_ABBREVIATION"] == "TOT"]["BREF_SLUG"].unique()                 # takas edilen: yalnız sezon toplamı satırı
    df = df[~(df["BREF_SLUG"].isin(tot) & (df["TEAM_ABBREVIATION"] != "TOT"))].reset_index(drop=True)
    df.to_parquet(out)
    print(f"  [{season}] yaş: {len(df)} oyuncu → {out.name}  (yaş dolu {df['AGE'].notna().mean():.0%}, slug dolu {df['BREF_SLUG'].notna().mean():.0%})")
    return df


# ── Ödül oylaması ──────────────────────────────────────────────────────────────

AWARD_TABLE = {"mip": "mip"}      # ödül anahtarı → awards_{yıl}.html içindeki tablo kimliği


def fetch_award_year(award: str, end_year: int, force: bool = False) -> pd.DataFrame:
    season = season_label(end_year)
    cache = DATA / f"awards__{award}_{season}.parquet"
    if cache.exists() and not force:
        return pd.read_parquet(cache)
    html = _get(f"https://www.basketball-reference.com/awards/awards_{end_year}.html")
    table = _find_table(BeautifulSoup(html, "lxml"), AWARD_TABLE[award]) if html else None
    if table is None:
        print(f"  [{season}] {award} oylama tablosu yok")
        return pd.DataFrame()
    rows = []
    for tr in table.find("tbody").find_all("tr"):
        cells = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        pl = cells.get("player")
        if pl is None or not pl.get_text(strip=True):
            continue
        g = lambda k: cells[k].get_text(strip=True) if k in cells else ""          # noqa: E731
        rows.append({
            "SEASON": season, "RANK": g("rank"), "PLAYER_NAME": pl.get_text(strip=True), "BREF_SLUG": pl.get("data-append-csv"),
            "AGE": _num(g("age")), "TEAM_ABBREVIATION": g("team_id"),
            "FIRST": _num(g("votes_first")), "PTS_WON": _num(g("points_won")), "PTS_MAX": _num(g("points_max")), "SHARE": _num(g("award_share")),
            "WINNER": 1 if g("rank") in ("1", "T1") else 0,
        })
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df.to_parquet(cache)
    print(f"  [{season}] {award}: {len(df)} oy alan oyuncu, kazanan {df.loc[df['WINNER'] == 1, 'PLAYER_NAME'].tolist()}")
    return df


def build_award_table(award: str, years: range, force: bool = False) -> pd.DataFrame:
    frames = []
    for i, y in enumerate(years):
        cached = (DATA / f"awards__{award}_{season_label(y)}.parquet").exists() and not force
        d = fetch_award_year(award, y, force)
        if len(d):
            frames.append(d)
        if not cached and i < len(years) - 1:
            time.sleep(SLEEP)
    if not frames:
        return pd.DataFrame()
    allv = pd.concat(frames, ignore_index=True)
    allv.to_parquet(DATA / f"awards__{award}_voting.parquet")
    print(f"awards__{award}_voting.parquet: {len(allv)} satır, {allv['SEASON'].nunique()} sezon")
    return allv


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--age", action="store_true")
    ap.add_argument("--mip", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)
    try:
        if a.test:
            print(fetch_age(2025, force=True).head(3).to_string())
            time.sleep(SLEEP)
            print(fetch_award_year("mip", 2025, force=True).head(5).to_string())
        if a.age:
            for i, y in enumerate(range(FIRST_SEASON, LAST_SEASON + 1)):
                had = (DATA / f"{season_label(y)}__bref_age.parquet").exists() and not a.force
                fetch_age(y, a.force)
                if not had:
                    time.sleep(SLEEP)
        if a.mip:
            build_award_table("mip", range(MIP_FIRST_YEAR, 2027), a.force)
    except Blocked as e:
        print(f"[DURDU] {e}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
