"""RankIt yerel katalog senkronizasyonu.

2025-26 NBA maclarini NBA Stats (nba_api), Avrupa'nin bes buyuk ligini
FotMob lig ucundan alir. Kadrolar daha once cache'lenmis oyuncu parquet'lerinden
kurulur; mac detayi basina yuzlerce ek istek yapilmaz.

Calistirma:
    python src/rankit_sync.py --season 2025-26
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "src" / "football"))

from api.db import get_conn, init_db  # noqa: E402


FOOTBALL_LEAGUES = {
    "premier-league": (47, "Premier League", "England"),
    "la-liga": (87, "La Liga", "Spain"),
    "serie-a": (55, "Serie A", "Italy"),
    "bundesliga": (54, "Bundesliga", "Germany"),
    "ligue-1": (53, "Ligue 1", "France"),
}

NBA_COLORS = {
    "ATL":"#E03A3E","BOS":"#007A33","BKN":"#000000","CHA":"#1D1160","CHI":"#CE1141",
    "CLE":"#860038","DAL":"#00538C","DEN":"#0E2240","DET":"#C8102E","GSW":"#1D428A",
    "HOU":"#CE1141","IND":"#002D62","LAC":"#C8102E","LAL":"#552583","MEM":"#5D76A9",
    "MIA":"#98002E","MIL":"#00471B","MIN":"#0C2340","NOP":"#0C2340","NYK":"#F58426",
    "OKC":"#007AC1","ORL":"#0077C0","PHI":"#006BB6","PHX":"#1D1160","POR":"#E03A3E",
    "SAC":"#5A2D81","SAS":"#C4CED4","TOR":"#CE1141","UTA":"#002B5C","WAS":"#002B5C",
}


def _color(name: str) -> str:
    palette = ["#FFB11B", "#3FB08C", "#7B61FF", "#D34E4E", "#1D78B5", "#C65FA5"]
    return palette[int(hashlib.md5(name.encode("utf-8")).hexdigest()[:4], 16) % len(palette)]


def _team_key(name: str) -> str:
    value = re.sub(r"[^a-z0-9 ]", "", str(name).lower().replace("&", "and"))
    aliases = {"man utd":"manchester united", "man city":"manchester city", "nottm forest":"nottingham forest",
               "wolves":"wolverhampton wanderers", "brighton":"brighton and hove albion", "bournemouth":"afc bournemouth"}
    return aliases.get(value.strip(), value.strip())


def _match_team_name(raw: str, fixture_names: list[str]) -> str | None:
    wanted = _team_key(raw)
    keyed = {_team_key(name): name for name in fixture_names}
    if wanted in keyed:
        return keyed[wanted]
    hit = difflib.get_close_matches(wanted, list(keyed), n=1, cutoff=.58)
    return keyed[hit[0]] if hit else None


def _competition(conn, sport: str, name: str, country: str, season: str) -> int:
    conn.execute("INSERT OR IGNORE INTO rankit_competitions(sport,name,country,season) VALUES(?,?,?,?)", (sport, name, country, season))
    return conn.execute("SELECT id FROM rankit_competitions WHERE sport=? AND name=? AND season=?", (sport, name, season)).fetchone()["id"]


def _team(conn, sport: str, name: str, short: str, color: str, country: str | None) -> int:
    conn.execute("""INSERT INTO rankit_teams(sport,name,short_name,color,country) VALUES(?,?,?,?,?)
        ON CONFLICT(sport,name) DO UPDATE SET short_name=excluded.short_name,color=excluded.color,country=excluded.country""",
        (sport, name, short, color, country))
    return conn.execute("SELECT id FROM rankit_teams WHERE sport=? AND name=?", (sport, name)).fetchone()["id"]


def _match(conn, *, provider: str, external_id: str, sport: str, comp_id: int, season: str,
           starts_at: str, status: str, home_id: int, away_id: int, home_score, away_score) -> int:
    conn.execute("""INSERT INTO rankit_matches
        (sport,competition_id,season,starts_at,status,home_team_id,away_team_id,home_score,away_score,
         editorial,summary,cover_variant,provider,provider_match_id)
        VALUES(?,?,?,?,?,?,?,?,?,0,'','crests',?,?)
        ON CONFLICT(provider,provider_match_id) DO UPDATE SET
          starts_at=excluded.starts_at,status=excluded.status,home_score=excluded.home_score,
          away_score=excluded.away_score,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id""",
        (sport, comp_id, season, starts_at, status, home_id, away_id, home_score, away_score, provider, str(external_id)))
    return conn.execute("SELECT id FROM rankit_matches WHERE provider=? AND provider_match_id=?", (provider, str(external_id))).fetchone()["id"]


def _player(conn, sport: str, team_id: int, external_id, name: str) -> int:
    conn.execute("""INSERT INTO rankit_players(sport,team_id,name) VALUES(?,?,?)
        ON CONFLICT(sport,name) DO UPDATE SET team_id=excluded.team_id""", (sport, team_id, name))
    return conn.execute("SELECT id FROM rankit_players WHERE sport=? AND name=?", (sport, name)).fetchone()["id"]


def sync_nba(season: str) -> dict:
    from nba_api.stats.static import teams as nba_teams
    from fetch_schedules import fetch_season_schedule

    cache = ROOT / "data" / f"{season}__schedule.parquet"
    schedule = pd.read_parquet(cache) if cache.exists() else fetch_season_schedule(season)
    if not cache.exists():
        schedule.to_parquet(cache, index=False)
    players = pd.read_parquet(ROOT / "data" / f"{season}__player_scores.parquet")
    meta = {t["abbreviation"]: t for t in nba_teams.get_teams()}
    # Normal maclarda ev satiri IS_HOME=True. Neutral saha maclarinda iki satir
    # da False olabildigi icin GAME_ID basina ev satirini tercih et, yoksa ilk
    # satiri katalogdaki gorsel home/away sirasi olarak kullan.
    home_games = (schedule.sort_values("IS_HOME", ascending=False)
                          .drop_duplicates("GAME_ID").copy())
    linked = 0
    with get_conn() as conn:
        comp_id = _competition(conn, "Basketball", "NBA", "USA", season)
        team_ids = {}
        for abbr in sorted(set(schedule["TEAM_ABBREVIATION"])):
            item = meta.get(abbr, {"full_name": abbr})
            team_ids[abbr] = _team(conn, "Basketball", item["full_name"], abbr, NBA_COLORS.get(abbr, _color(abbr)), "USA")
        roster = {}
        for row in players[["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION"]].dropna().drop_duplicates("PLAYER_ID").itertuples(index=False):
            if row.TEAM_ABBREVIATION not in team_ids:
                continue
            pid = _player(conn, "Basketball", team_ids[row.TEAM_ABBREVIATION], row.PLAYER_ID, row.PLAYER_NAME)
            roster.setdefault(row.TEAM_ABBREVIATION, []).append(pid)
        for row in home_games.itertuples(index=False):
            mid = _match(conn, provider="nba", external_id=row.GAME_ID, sport="Basketball", comp_id=comp_id,
                         season=season, starts_at=f"{row.GAME_DATE}T00:00:00Z", status="finished" if pd.notna(row.WL) else "upcoming",
                         home_id=team_ids[row.TEAM_ABBREVIATION], away_id=team_ids[row.OPP_ABBREVIATION],
                         home_score=None if pd.isna(row.PTS) else int(row.PTS), away_score=None if pd.isna(row.OPP_PTS) else int(row.OPP_PTS))
            for abbr in (row.TEAM_ABBREVIATION, row.OPP_ABBREVIATION):
                for pid in roster.get(abbr, []):
                    conn.execute("INSERT OR IGNORE INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,?,?)", (mid, pid, team_ids[abbr]))
                    linked += 1
    return {"matches": len(home_games), "players": sum(map(len, roster.values())), "links": linked}


def sync_football(season: str) -> dict:
    import fetch_fotmob as ff

    start_year = int(season.split("-")[0])
    long_season = f"{start_year}-{start_year + 1}"
    fotmob_season = f"{start_year}/{start_year + 1}"
    total_matches = total_players = linked = 0
    with get_conn() as conn:
        for slug, (league_id, league_name, country) in FOOTBALL_LEAGUES.items():
            comp_id = _competition(conn, "Football", league_name, country, season)
            parquet = ROOT / "data" / f"football__{slug}__{long_season}__fotmob.parquet"
            roster_df = pd.read_parquet(parquet)
            roster_df = roster_df[["PLAYER_ID", "PLAYER_NAME", "TEAM"]].dropna().drop_duplicates("PLAYER_ID")
            payload = ff.api(f"leagues?id={league_id}&season={fotmob_season.replace('/', '%2F')}") or {}
            fixtures = ((payload.get("fixtures") or {}).get("allMatches") or [])
            team_ids, rosters = {}, {}
            for item in fixtures:
                for side in (item.get("home") or {}, item.get("away") or {}):
                    name = side.get("name")
                    if name and name not in team_ids:
                        short = (side.get("shortName") or name)[:12]
                        team_ids[name] = _team(conn, "Football", name, short, _color(name), country)
            fixture_names = list(team_ids)
            for row in roster_df.itertuples(index=False):
                matched_team = _match_team_name(row.TEAM, fixture_names)
                if not matched_team:
                    continue
                pid = _player(conn, "Football", team_ids[matched_team], row.PLAYER_ID, row.PLAYER_NAME)
                rosters.setdefault(matched_team, []).append(pid)
                total_players += 1
            for item in fixtures:
                home, away, st = item.get("home") or {}, item.get("away") or {}, item.get("status") or {}
                if home.get("name") not in team_ids or away.get("name") not in team_ids:
                    continue
                score = str(st.get("scoreStr") or "").replace("–", "-").split("-")
                hs = int(score[0].strip()) if len(score) == 2 and score[0].strip().isdigit() else None
                aws = int(score[1].strip()) if len(score) == 2 and score[1].strip().isdigit() else None
                status = "finished" if st.get("finished") else "live" if st.get("started") else "upcoming"
                mid = _match(conn, provider="fotmob", external_id=item["id"], sport="Football", comp_id=comp_id,
                             season=season, starts_at=st.get("utcTime") or "", status=status,
                             home_id=team_ids[home["name"]], away_id=team_ids[away["name"]], home_score=hs, away_score=aws)
                for team_name in (home["name"], away["name"]):
                    for pid in rosters.get(team_name, []):
                        conn.execute("INSERT OR IGNORE INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,?,?)", (mid, pid, team_ids[team_name]))
                        linked += 1
                total_matches += 1
    return {"matches": total_matches, "players": total_players, "links": linked}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025-26")
    parser.add_argument("--only", choices=["nba", "football", "all"], default="all")
    args = parser.parse_args()
    init_db()
    if args.only in ("nba", "all"):
        print("NBA", sync_nba(args.season))
    if args.only in ("football", "all"):
        print("FOOTBALL", sync_football(args.season))


if __name__ == "__main__":
    main()
