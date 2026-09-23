# -*- coding: utf-8 -*-
"""YEREL gelistirme icin: saglayicidan GERCEK bir mac ceker (kadro + olaylar).

Neden var: `15b` oyuncu secici ve `15d` canli kadro gorsel kabulu, dogrulanmis
bir 11 olmadan yapilamiyor; yerel veritabaninda `rankit_match_lineups` bos
(Codex'in 2026-09-22 notu). Sezon kadrosunu sahte 11 gibi gostermek yasak
(BUILD §9.2), o yuzden uydurma kadro DEGIL, saglayicinin kendi verisi
yaziliyor: 11 + yedekler, formasyon, teknik direktor, dakikali degisiklikler,
gol ve kartlar.

    python src/scratch/seed_local_real_match.py                  # ligin son bitmis maci
    python src/scratch/seed_local_real_match.py --match-id 4813754
    python src/scratch/seed_local_real_match.py --league 87 --season 2025/2026
    python src/scratch/seed_local_real_match.py --undo           # yazdigi maci siler

Yalniz yerel veritabaninda calisir (prod ortam degiskeni varsa durur).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from api.db import get_conn, init_db                     # noqa: E402
from api import rankit_live_sync as LS                   # noqa: E402
from api.rankit_colors import club_color                 # noqa: E402

LEAGUES = {47: "Premier League", 87: "La Liga", 55: "Serie A", 54: "Bundesliga", 53: "Ligue 1"}
STAGE = "Matchday"
LOGO = "https://images.fotmob.com/image_resources/logo/teamlogo/{}.png"


def prod() -> bool:
    return bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") == "true"
                or os.environ.get("IS_PROD") == "true")


def api(path: str, **params):
    from curl_cffi import requests
    response = requests.get(f"https://www.fotmob.com/api/data/{path}", params=params,
                            impersonate="chrome124", timeout=25)
    if response.status_code != 200:
        raise SystemExit(f"provider HTTP {response.status_code} for {path}")
    return response.json()


def newest_finished(league: int, season: str) -> dict:
    fixtures = (api("leagues", id=league, season=season).get("fixtures") or {}).get("allMatches") or []
    done = [m for m in fixtures if (m.get("status") or {}).get("finished")]
    if not done:
        raise SystemExit("no finished match in that league season")
    return done[-1]


def short_label(name: str, fallback: str) -> str:
    raw = (name or "").strip()
    return raw if raw else (fallback or "")[:16]


def team_id(conn, name: str, short: str, provider_id, sport="Football") -> int:
    row = conn.execute("SELECT id FROM rankit_teams WHERE sport=? AND name=?", (sport, name)).fetchone()
    if row:
        tid = int(row["id"])
    else:
        tid = conn.execute("""INSERT INTO rankit_teams(sport,name,short_name,color,country)
                              VALUES(?,?,?,?,?)""",
                           (sport, name, short_label(short, name), club_color(name), "England")).lastrowid
    if provider_id:
        conn.execute("""INSERT INTO rankit_team_logos(team_id,logo_url,source,updated_at)
                        VALUES(?,?,'fotmob',datetime('now'))
                        ON CONFLICT(team_id) DO UPDATE SET logo_url=excluded.logo_url""",
                     (tid, LOGO.format(provider_id)))
    return tid


def seed(conn, match_id: str) -> int:
    payload = api("matchDetails", matchId=match_id)
    general = payload.get("general") or {}
    header = payload.get("header") or {}
    content = payload.get("content") or {}
    status = (header.get("status") or {})
    home_name = general.get("homeTeam", {}).get("name") or "Home"
    away_name = general.get("awayTeam", {}).get("name") or "Away"
    league_name = general.get("leagueName") or LEAGUES.get(general.get("leagueId"), "Premier League")
    season = str(general.get("parentLeagueSeason") or "2025/2026").replace("/", "-")
    season = f"{season.split('-')[0]}-{season.split('-')[1][-2:]}" if "-" in season else season
    kickoff = general.get("matchTimeUTCDate") or status.get("utcTime")
    score = str(status.get("scoreStr") or "").split("-")
    home_score, away_score = (int(score[0].strip()), int(score[1].strip())) if len(score) == 2 else (None, None)

    comp = conn.execute("SELECT id FROM rankit_competitions WHERE sport='Football' AND name=? AND season=?",
                        (league_name, season)).fetchone()
    comp_id = int(comp["id"]) if comp else conn.execute(
        "INSERT INTO rankit_competitions(sport,name,season,country) VALUES('Football',?,?,?)",
        (league_name, season, "England")).lastrowid

    home = team_id(conn, home_name, general.get("homeTeam", {}).get("shortName"), general.get("homeTeam", {}).get("id"))
    away = team_id(conn, away_name, general.get("awayTeam", {}).get("shortName"), general.get("awayTeam", {}).get("id"))
    round_no = (general.get("matchRound") or content.get("matchFacts", {}).get("matchRound") or 1)
    row = conn.execute("SELECT id FROM rankit_matches WHERE provider='fotmob' AND provider_match_id=?",
                       (str(match_id),)).fetchone()
    if row:
        mid = int(row["id"])
        conn.execute("""UPDATE rankit_matches SET status='finished',home_score=?,away_score=?,
                        events_polled_at=datetime('now') WHERE id=?""", (home_score, away_score, mid))
    else:
        mid = conn.execute("""INSERT INTO rankit_matches(sport,competition_id,season,starts_at,status,stage,
                              home_team_id,away_team_id,home_score,away_score,provider,provider_match_id,
                              events_polled_at)
                              VALUES('Football',?,?,?,'finished',?,?,?,?,?,'fotmob',?,datetime('now'))""",
                           (comp_id, season, kickoff, f"{STAGE} {round_no}", home, away,
                            home_score, away_score, str(match_id))).lastrowid

    stored = LS._store_lineups_from(conn, {"id": mid, "home_team_id": home, "away_team_id": away}, content)
    events = ((content.get("matchFacts") or {}).get("events") or {}).get("events") or []
    LS._store_moments(conn, mid, events)
    counts = conn.execute("""SELECT
        (SELECT COUNT(*) FROM rankit_match_lineups WHERE match_id=?) lineups,
        (SELECT COUNT(*) FROM rankit_match_lineup_players WHERE match_id=?) players,
        (SELECT COUNT(*) FROM rankit_match_lineup_players WHERE match_id=? AND sub_in IS NOT NULL) subs,
        (SELECT COUNT(*) FROM rankit_moments WHERE match_id=?) moments""",
        (mid, mid, mid, mid)).fetchone()
    print(f"match {mid} ({home_name} {home_score}-{away_score} {away_name}, {league_name} {season})")
    print(f"  lineups={counts['lineups']} teams, players={counts['players']}, subs={counts['subs']}, moments={counts['moments']}")
    print(f"  check: GET /api/rankit/matches/{mid} -> lineups[].starters/bench, events[], events_checked: true")
    return mid


def undo(conn, match_id: str) -> None:
    row = conn.execute("SELECT id FROM rankit_matches WHERE provider='fotmob' AND provider_match_id=?",
                       (str(match_id),)).fetchone()
    if not row:
        print("nothing to undo")
        return
    mid = int(row["id"])
    kept = conn.execute("SELECT COUNT(*) FROM rankit_diary_entries WHERE match_id=?", (mid,)).fetchone()[0]
    if kept:
        print(f"match {mid} has {kept} diary entries - left alone (user content is never deleted)")
        return
    conn.execute("DELETE FROM rankit_matches WHERE id=?", (mid,))   # kadro/an/olaylar CASCADE ile gider
    print(f"match {mid} and its lineup/moment rows removed")


def main() -> None:
    if prod():
        raise SystemExit("local only: production environment variable found")
    parser = argparse.ArgumentParser()
    parser.add_argument("--match-id")
    parser.add_argument("--league", type=int, default=47)
    parser.add_argument("--season", default="2025/2026")
    parser.add_argument("--undo", action="store_true")
    args = parser.parse_args()

    match_id = args.match_id
    if not match_id:
        match_id = str(newest_finished(args.league, args.season)["id"])
    init_db()
    with get_conn() as conn:
        undo(conn, match_id) if args.undo else seed(conn, match_id)


if __name__ == "__main__":
    main()
