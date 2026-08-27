"""RankIt canlı skorlarının hafif, kendi kendini sınırlayan güncelleyicisi.

Tam katalog/kadro senkronu değildir. Yalnızca yakın zamanda başlayan veya
başlayacak maçların saat, durum ve skorunu sağlayıcıdan günceller. SQLite
claim kaydı birden fazla worker'ın aynı işi eşzamanlı çalıştırmasını önler.
"""
from __future__ import annotations

import threading
import time

from .db import get_conn


FOTMOB_LEAGUES = {
    "Premier League": [(47, False)],
    "La Liga": [(87, False)],
    "Serie A": [(55, False)],
    "Bundesliga": [(54, False)],
    "Ligue 1": [(53, False)],
    "UEFA Champions League": [(42, False), (10611, True)],
    "UEFA Europa League": [(73, False), (10613, True)],
    "UEFA Conference League": [(10216, False), (10615, True)],
}
JOB_NAME = "rankit_live_scores"


def _claim() -> bool:
    with get_conn() as conn:
        cur = conn.execute("""INSERT INTO rankit_sync_state(job_name,last_attempt)
            VALUES(?,datetime('now'))
            ON CONFLICT(job_name) DO UPDATE SET last_attempt=datetime('now')
            WHERE last_attempt IS NULL OR last_attempt < datetime('now','-15 minutes')""", (JOB_NAME,))
        return cur.rowcount > 0


def _active_scopes() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("""SELECT DISTINCT m.provider,c.name competition,m.season
            FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
            WHERE m.provider IS NOT NULL AND m.status IN ('upcoming','live')
              AND datetime(m.starts_at) BETWEEN datetime('now','-2 days') AND datetime('now','+8 hours')""").fetchall()
        return [dict(row) for row in rows]


def _parse_score(value) -> tuple[int | None, int | None]:
    parts = str(value or "").replace("–", "-").split("-")
    if len(parts) != 2:
        return None, None
    left, right = parts[0].strip(), parts[1].strip()
    return (int(left), int(right)) if left.isdigit() and right.isdigit() else (None, None)


def _stage(item: dict, qualification: bool) -> str:
    code = str(item.get("round") or "")
    name = str(item.get("roundName") or "")
    if qualification:
        return {"1": "First qualifying round", "2": "Second qualifying round",
                "3": "Third qualifying round", "final": "Play-off round"}.get(code, name or "Qualifying")
    return {"playoff": "Knockout phase play-offs", "1/8": "Round of 16",
            "1/4": "Quarter-finals", "1/2": "Semi-finals", "final": "Final"}.get(
                code, f"League phase · Matchday {code}" if code.isdigit() else name)


def _refresh_fotmob(competition: str, season: str) -> int:
    from curl_cffi import requests

    sources = FOTMOB_LEAGUES.get(competition)
    if not sources:
        return 0
    start = str(season).split("-")[0]
    updated = 0
    for league_id, qualification in sources:
        response = requests.get(
            "https://www.fotmob.com/api/data/leagues",
            params={"id": league_id, "season": f"{start}/{int(start) + 1}"},
            impersonate="chrome124", timeout=25,
        )
        response.raise_for_status()
        fixtures = ((response.json().get("fixtures") or {}).get("allMatches") or [])
        with get_conn() as conn:
            for item in fixtures:
                status_data = item.get("status") or {}
                status = "finished" if status_data.get("finished") else "live" if status_data.get("started") else "upcoming"
                home_score, away_score = _parse_score(status_data.get("scoreStr"))
                stage = _stage(item, qualification)
                cur = conn.execute("""UPDATE rankit_matches SET starts_at=?,status=?,home_score=?,away_score=?,stage=?
                    WHERE provider='fotmob' AND provider_match_id=?
                      AND (starts_at<>? OR status<>? OR COALESCE(home_score,-1)<>COALESCE(?,-1)
                           OR COALESCE(away_score,-1)<>COALESCE(?,-1) OR COALESCE(stage,'')<>?)""",
                    (status_data.get("utcTime") or "", status, home_score, away_score, stage, str(item.get("id")),
                     status_data.get("utcTime") or "", status, home_score, away_score, stage))
                updated += max(0, cur.rowcount)
    return updated


def _refresh_nba(season: str) -> int:
    from nba_api.stats.endpoints import ScheduleLeagueV2

    frame = ScheduleLeagueV2(season=season, timeout=45).get_data_frames()[0]
    if frame.empty:
        return 0
    frame = frame[frame["gameLabel"].fillna("").str.lower() != "preseason"]
    updated = 0
    with get_conn() as conn:
        for row in frame.itertuples(index=False):
            game_id = str(getattr(row, "gameId"))
            game_status = int(getattr(row, "gameStatus"))
            status = "finished" if game_status == 3 else "live" if game_status == 2 else "upcoming"
            home_raw, away_raw = getattr(row, "homeTeam_score", None), getattr(row, "awayTeam_score", None)
            home_score = int(home_raw) if str(home_raw).isdigit() else None
            away_score = int(away_raw) if str(away_raw).isdigit() else None
            starts_at = str(getattr(row, "gameDateTimeUTC"))
            cur = conn.execute("""UPDATE rankit_matches SET starts_at=?,status=?,home_score=?,away_score=?
                WHERE provider='nba' AND provider_match_id=?
                  AND (starts_at<>? OR status<>? OR COALESCE(home_score,-1)<>COALESCE(?,-1)
                       OR COALESCE(away_score,-1)<>COALESCE(?,-1))""",
                (starts_at, status, home_score, away_score, game_id,
                 starts_at, status, home_score, away_score))
            updated += max(0, cur.rowcount)
    return updated


def refresh_live_scores() -> dict:
    scopes = _active_scopes()
    updated = 0
    errors = []
    for scope in scopes:
        try:
            if scope["provider"] == "fotmob":
                updated += _refresh_fotmob(scope["competition"], scope["season"])
            elif scope["provider"] == "nba":
                updated += _refresh_nba(scope["season"])
        except Exception as exc:
            errors.append(f"{scope['competition']} {scope['season']}: {exc}")
    with get_conn() as conn:
        conn.execute("""UPDATE rankit_sync_state SET
            last_success=CASE WHEN ?='' THEN datetime('now') ELSE last_success END,
            last_error=?,updated_matches=? WHERE job_name=?""",
            ("; ".join(errors), "; ".join(errors)[:1000], updated, JOB_NAME))
    return {"scopes": len(scopes), "updated": updated, "errors": errors}


def _worker() -> None:
    time.sleep(12)
    while True:
        try:
            if _claim():
                print(f"[rankit-sync] {refresh_live_scores()}", flush=True)
        except Exception as exc:
            print(f"[rankit-sync] failed: {exc}", flush=True)
        time.sleep(60)


def start_rankit_live_sync() -> None:
    # Her process kendi hafif worker'ını açabilir; veritabanı claim'i sağlayıcı
    # çağrısının tüm process'lerde toplam 15 dakikada bir yapılmasını garanti eder.
    threading.Thread(target=_worker, name="rankit-live-sync", daemon=True).start()
