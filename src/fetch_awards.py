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


def _slug_from_cell(cell) -> str | None:
    """Oyuncu hücresi: önce data-append-csv, yoksa /players/d/doncilu01.html bağlantısından."""
    v = cell.get("data-append-csv")
    if v:
        return v
    a = cell.find("a")
    if a is not None and a.get("href"):
        m = re.search(r"/players/\w/([a-z0-9]+)\.html", a["href"])
        return m.group(1) if m else None
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

AWARD_TABLE = {**{a: a for a in ("mvp", "roy", "dpoy", "smoy", "mip", "clutch_poy", "coy")}, "allnba": "leading_all_nba", "alldef": "leading_all_defense", "allrookie": "leading_all_rookie"}      # ödül anahtarı → awards_{yıl}.html içindeki tablo kimliği
AWARD_START = {"mvp": 1956, "roy": 1953, "dpoy": 1983, "smoy": 1983, "mip": 1986, "clutch_poy": 2023, "coy": 1963, "allnba": 1947, "alldef": 1969, "allrookie": 1963}   # ilk oylama sezonu (bitiş yılı)


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


def _parse_award_table(table, season: str) -> pd.DataFrame:
    rows = []
    for tr in table.find("tbody").find_all("tr"):
        cells = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        pl = cells.get("player") or cells.get("coach")                       # COY tablosunda oyuncu yerine koç
        if pl is None or not pl.get_text(strip=True):
            continue
        g = lambda k: cells[k].get_text(strip=True) if k in cells else ""          # noqa: E731
        team_label = g("all_nba_team") or g("all_defense_team") or g("all_rookie_team")              # All-NBA / All-Defense: 1st / 2nd / 3rd (boş = seçilmedi)
        rows.append({"SEASON": season, "RANK": g("rank"), "PLAYER_NAME": pl.get_text(strip=True), "BREF_SLUG": _slug_from_cell(pl),
                     "AGE": _num(g("age")), "TEAM_ABBREVIATION": g("team_id"), "POS": g("pos"), "TEAM_LABEL": team_label,
                     "FIRST": _num(g("votes_first")), "PTS_WON": _num(g("points_won")), "PTS_MAX": _num(g("points_max")),
                     "SHARE": _num(g("award_share")), "WINNER": 1 if g("rank") in ("1", "T1") else 0})
    return pd.DataFrame(rows)


def fetch_awards_page(end_year: int, awards: list[str] | None = None, force: bool = False) -> dict[str, pd.DataFrame]:
    """awards_{yıl}.html tek istekle: sayfadaki TÜM ödül oylama tablolarını (mvp, roy, dpoy, smoy, mip, clutch_poy, coy) ayrı önbelleğe yazar."""
    season = season_label(end_year)
    want = [a for a in (awards or list(AWARD_TABLE)) if end_year >= AWARD_START[a]]
    todo = [a for a in want if force or not (DATA / f"awards__{a}_{season}.parquet").exists()]
    out = {a: pd.read_parquet(DATA / f"awards__{a}_{season}.parquet") for a in want if a not in todo}
    if not todo:
        return out
    html = _get(f"https://www.basketball-reference.com/awards/awards_{end_year}.html")
    soup = BeautifulSoup(html, "lxml") if html else None
    for a in todo:
        t = _find_table(soup, AWARD_TABLE[a]) if soup is not None else None
        if t is None:
            continue
        df = _parse_award_table(t, season)
        if len(df):
            df.to_parquet(DATA / f"awards__{a}_{season}.parquet")
            out[a] = df
    print(f"  [{season}] {', '.join(f'{a}:{len(v)}' for a, v in out.items())}", flush=True)
    return out


def build_all_awards(years: range, force: bool = False) -> None:
    for i, y in enumerate(years):
        cached = all((DATA / f"awards__{a}_{season_label(y)}.parquet").exists() for a in AWARD_TABLE if y >= AWARD_START[a]) and not force
        fetch_awards_page(y, force=force)
        if not cached and i < len(years) - 1:
            time.sleep(SLEEP)
    for a in AWARD_TABLE:
        fr = [pd.read_parquet(DATA / f"awards__{a}_{season_label(y)}.parquet") for y in years if (DATA / f"awards__{a}_{season_label(y)}.parquet").exists()]
        if fr:
            allv = pd.concat(fr, ignore_index=True)
            allv.to_parquet(DATA / f"awards__{a}_voting.parquet")
            print(f"awards__{a}_voting.parquet: {len(allv)} satır, {allv['SEASON'].nunique()} sezon")


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


# ── Draft (ROY için: çaylakların sezon öncesi bilgisi yalnız draft sırası, ülke / kolej) ────────────────────

def fetch_draft(year: int, force: bool = False) -> pd.DataFrame:
    """draft/NBA_{yıl}.html: PICK, takım, oyuncu (+ slug), kolej (boş = uluslararası / lise)."""
    out = DATA / f"draft__{year}.parquet"
    if out.exists() and not force:
        return pd.read_parquet(out)
    html = _get(f"https://www.basketball-reference.com/draft/NBA_{year}.html")
    t = _find_table(BeautifulSoup(html, "lxml"), "stats") if html else None
    if t is None:
        print(f"  [{year}] draft tablosu yok")
        return pd.DataFrame()
    rows = []
    for tr in t.find("tbody").find_all("tr"):
        c = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        pl = c.get("player")
        if pl is None or not pl.get_text(strip=True):
            continue
        g = lambda k: c[k].get_text(strip=True) if k in c else ""          # noqa: E731
        rows.append({"DRAFT_YEAR": year, "PICK": _num(g("pick_overall")), "ROUND": _num(g("round") if "round" in c else None),
                     "TEAM": g("team_id"), "PLAYER_NAME": pl.get_text(strip=True), "BREF_SLUG": _slug_from_cell(pl),
                     "COLLEGE": g("college_name"), "AGE_DRAFT": _num(g("age")) if "age" in c else None})
    df = pd.DataFrame(rows)
    if len(df):
        df.to_parquet(out)
        print(f"  [{year}] draft: {len(df)} oyuncu, kolej dolu {(df['COLLEGE'] != '').mean():.0%}, yaş dolu {df['AGE_DRAFT'].notna().mean():.0%}", flush=True)
    return df


# ── GS, takım gücü, koçlar ────────────────────────────────────────────────────

def _first_table(html: str, ids: list[str]):
    soup = BeautifulSoup(html, "lxml")
    for tid in ids:
        t = _find_table(soup, tid)
        if t is not None:
            return t
    return None


def fetch_gs(end_year: int, force: bool = False) -> pd.DataFrame:
    """per_game sayfası: maç ve BAŞLANGIÇ sayısı (6MOY: yedek rolü). `{sezon}__bref_gs.parquet`."""
    season = season_label(end_year)
    out = DATA / f"{season}__bref_gs.parquet"
    if out.exists() and not force:
        return pd.read_parquet(out)
    html = _get(f"https://www.basketball-reference.com/leagues/NBA_{end_year}_per_game.html")
    t = _first_table(html, ["per_game_stats", "per_game"]) if html else None
    if t is None:
        return pd.DataFrame()
    rows = []
    for tr in t.find("tbody").find_all("tr"):
        c = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        nm = c.get("name_display") or c.get("player")
        if nm is None or not nm.get_text(strip=True):
            continue
        g = lambda k: c[k].get_text(strip=True) if k in c else ""          # noqa: E731
        rows.append({"BREF_SLUG": _slug_from_cell(nm), "PLAYER_NAME": nm.get_text(strip=True),
                     "TEAM_ABBREVIATION": g("team_name_abbr") or g("team_id"), "G": _num(g("games") or g("g")),
                     "GS": _num(g("games_started") or g("gs"))})
    df = pd.DataFrame(rows)
    df = df.sort_values("G", ascending=False).drop_duplicates("BREF_SLUG").reset_index(drop=True)      # takas edilen: toplam satır
    df.to_parquet(out)
    print(f"  [{season}] GS: {len(df)} oyuncu", flush=True)
    return df


def fetch_team_season(end_year: int, force: bool = False) -> pd.DataFrame:
    """Lig sayfasındaki gelişmiş takım tablosu: galibiyet, mağlubiyet, MOV, SRS, ORtg, DRtg. `team__{sezon}.parquet`."""
    season = season_label(end_year)
    out = DATA / f"team__{season}.parquet"
    if out.exists() and not force:
        return pd.read_parquet(out)
    html = _get(f"https://www.basketball-reference.com/leagues/NBA_{end_year}.html")
    t = _first_table(html, ["advanced-team", "misc_stats"]) if html else None
    if t is None:
        return pd.DataFrame()
    rows = []
    for tr in t.find("tbody").find_all("tr"):
        c = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        tm = c.get("team")
        if tm is None or not tm.get_text(strip=True) or tm.get_text(strip=True).startswith("League"):
            continue
        g = lambda k: c[k].get_text(strip=True) if k in c else ""          # noqa: E731
        link = tm.find("a")
        m = re.search(r"/teams/([A-Z]{3})/", link["href"]) if link is not None and link.get("href") else None
        rows.append({"SEASON": season, "TEAM": m.group(1) if m else None, "TEAM_NAME": tm.get_text(strip=True).rstrip("*"),
                     "W": _num(g("wins")), "L": _num(g("losses")),
                     "MOV": _num(g("mov")), "SRS": _num(g("srs")), "ORTG": _num(g("off_rtg")), "DRTG": _num(g("def_rtg")),
                     "NRTG": _num(g("net_rtg"))})
    df = pd.DataFrame(rows)
    df["WIN_PCT"] = df["W"] / (df["W"] + df["L"])
    df.to_parquet(out)
    print(f"  [{season}] takım: {len(df)}", flush=True)
    return df


def fetch_coaches(end_year: int, force: bool = False) -> pd.DataFrame:
    """Koç sayfası: koç, takım, sezon maç / galibiyet, franchise ve kariyer sezon sayısı. `coach__{sezon}.parquet`."""
    season = season_label(end_year)
    out = DATA / f"coach__{season}.parquet"
    if out.exists() and not force:
        return pd.read_parquet(out)
    html = _get(f"https://www.basketball-reference.com/leagues/NBA_{end_year}_coaches.html")
    t = _first_table(html, ["NBA_coaches"]) if html else None
    if t is None:
        return pd.DataFrame()
    rows = []
    for tr in t.find("tbody").find_all("tr"):
        c = {td.get("data-stat", ""): td for td in tr.find_all(["td", "th"])}
        co = c.get("coach")
        if co is None or not co.get_text(strip=True):
            continue
        g = lambda k: c[k].get_text(strip=True) if k in c else ""          # noqa: E731
        rows.append({"SEASON": season, "COACH": co.get_text(strip=True), "COACH_SLUG": _slug_from_cell(co), "TEAM": g("team"),
                     "G": _num(g("cur_g")), "W": _num(g("cur_w")), "L": _num(g("cur_l")),
                     "SEASONS_FRANCHISE": _num(g("seas_num_franch")), "SEASONS_OVERALL": _num(g("seas_num_overall")),
                     "CAREER_W": _num(g("car_w")), "CAREER_L": _num(g("car_l"))})
    df = pd.DataFrame(rows)
    df.to_parquet(out)
    print(f"  [{season}] koç: {len(df)}", flush=True)
    return df


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--age", action="store_true")
    ap.add_argument("--mip", action="store_true")
    ap.add_argument("--drafts", action="store_true", help="1984-2026 draft sınıfları (ROY için)")
    ap.add_argument("--extras", action="store_true", help="GS (per_game), takım gücü (lig sayfası), koçlar: 1984-2026")
    ap.add_argument("--awards", action="store_true", help="tüm ödül oylama tabloları (mvp, roy, dpoy, smoy, mip, clutch_poy, coy), sayfa başına tek istek")
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
        if a.awards:
            build_all_awards(range(1984, 2027), a.force)
        if a.extras:
            for fn, pat in ((fetch_gs, "{s}__bref_gs"), (fetch_team_season, "team__{s}"), (fetch_coaches, "coach__{s}")):
                for y in range(1984, 2027):
                    had = (DATA / (pat.format(s=season_label(y)) + ".parquet")).exists() and not a.force
                    fn(y, a.force)
                    if not had:
                        time.sleep(SLEEP)
        if a.drafts:
            for i, y in enumerate(range(1984, 2027)):
                had = (DATA / f"draft__{y}.parquet").exists() and not a.force
                fetch_draft(y, a.force)
                if not had:
                    time.sleep(SLEEP)
    except Blocked as e:
        print(f"[DURDU] {e}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
