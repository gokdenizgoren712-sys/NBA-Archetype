"""RankIt yerel katalog senkronizasyonu.

NBA maclarini NBA Stats (nba_api), Avrupa'nin bes buyuk ligini FotMob lig
ucundan alir. Tamamlanmis sezonda kadrolar Primary Arch oyuncu parquet'inden
kurulur. Yeni sezon parquet'i henuz yoksa fikstur yine eklenir; eslesen takimlar
icin son mevcut sezon kadrosu kullanilir.

Calistirma:
    python src/rankit_sync.py --season 2025-26
    python src/rankit_sync.py --season 2026-27
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
import time
from urllib.request import Request, urlopen
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "src" / "football"))

from api.db import get_conn, init_db  # noqa: E402


FOOTBALL_LEAGUES = {
    "premier-league": (47, "Premier League", "England", "league"),
    "la-liga": (87, "La Liga", "Spain", "league"),
    "serie-a": (55, "Serie A", "Italy", "league"),
    "bundesliga": (54, "Bundesliga", "Germany", "league"),
    "ligue-1": (53, "Ligue 1", "France", "league"),
    "fa-cup": (132, "FA Cup", "England", "cup"),
    "copa-del-rey": (138, "Copa del Rey", "Spain", "cup"),
    "coppa-italia": (141, "Coppa Italia", "Italy", "cup"),
    "dfb-pokal": (209, "DFB-Pokal", "Germany", "cup"),
    "coupe-de-france": (134, "Coupe de France", "France", "cup"),
    "champions-league": (42, "UEFA Champions League", "Europe", "uefa"),
    "champions-league-qualification": (10611, "UEFA Champions League", "Europe", "qualifying"),
    "europa-league": (73, "UEFA Europa League", "Europe", "uefa"),
    "europa-league-qualification": (10613, "UEFA Europa League", "Europe", "qualifying"),
    "conference-league": (10216, "UEFA Conference League", "Europe", "uefa"),
    "conference-league-qualification": (10615, "UEFA Conference League", "Europe", "qualifying"),
}

NBA_COLORS = {
    "ATL":"#E03A3E","BOS":"#007A33","BKN":"#000000","CHA":"#1D1160","CHI":"#CE1141",
    "CLE":"#860038","DAL":"#00538C","DEN":"#0E2240","DET":"#C8102E","GSW":"#1D428A",
    "HOU":"#CE1141","IND":"#002D62","LAC":"#C8102E","LAL":"#552583","MEM":"#5D76A9",
    "MIA":"#98002E","MIL":"#00471B","MIN":"#0C2340","NOP":"#0C2340","NYK":"#F58426",
    "OKC":"#007AC1","ORL":"#0077C0","PHI":"#006BB6","PHX":"#1D1160","POR":"#E03A3E",
    "SAC":"#5A2D81","SAS":"#C4CED4","TOR":"#CE1141","UTA":"#002B5C","WAS":"#002B5C",
}


# Bir maçı "kullanıcı içeriği taşıyor" yapan her şey. Bu id'lerin hiçbiri
# katalog temizliğinde silinemez (hepsi rankit_matches'e ON DELETE CASCADE ile
# bağlı; maçı silmek içeriği de siler).
#
# rankit_match_players ve rankit_broadcasts BİLEREK dışarıda: ilki sistemin
# kendi ürettiği kadro bağı, ikincisi editoryal yayın kaydı — ikisi de maçla
# birlikte gitmeli. rankit_favorites gerçek bir yabancı anahtar değil
# (target_id polimorfik), o yüzden cascade olmaz ama öksüz kalır; onu da
# koruma listesine alıyoruz.
USER_CONTENT_MATCH_IDS = """
    SELECT match_id FROM rankit_diary_entries
    UNION SELECT match_id FROM rankit_potm_votes
    UNION SELECT match_id FROM rankit_respect_votes
    UNION SELECT match_id FROM rankit_watchlist
    UNION SELECT match_id FROM rankit_list_items
    UNION SELECT match_id FROM rankit_watchalong_messages
    UNION SELECT target_id FROM rankit_favorites WHERE target_type='match'
"""


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


def _short_label(raw: str | None, fallback: str, limit: int = 16) -> str:
    """short_name generation. A provider-supplied short label is used as-is —
    that's their editorial call. When none exists, the old fallback was
    `fallback[:limit]`, which cuts mid-word: "Crystal Palace" -> "Crystal
    Pala", "FC Milsami Orhei" -> "FC Milsami O", "Real Sociedad" -> "Real
    Socieda". None of those overflow their card column, so the CSS ellipsis
    meant to catch long names never engages — the mangled form ships as-is
    and reads as a data glitch, not an abbreviation (confirmed live: 5 of 10
    sampled Discover cards had a word-mangled short_name, 0 had a CSS-level
    overflow). Cutting on the last word boundary inside the limit means
    whatever a card shows is always a real word or phrase; a name still too
    long for its column is still truncated, but by the single, visible
    ellipsis in .ri-score-band's CSS, not silently in the data.
    """
    raw = (raw or "").strip()
    if raw:
        return raw
    full = (fallback or "").strip()
    if len(full) <= limit:
        return full
    cut = full[:limit]
    boundary = cut.rfind(" ")
    return cut[:boundary] if boundary > limit * 0.4 else cut


def _competition(conn, sport: str, name: str, country: str, season: str) -> int:
    conn.execute("INSERT OR IGNORE INTO rankit_competitions(sport,name,country,season) VALUES(?,?,?,?)", (sport, name, country, season))
    return conn.execute("SELECT id FROM rankit_competitions WHERE sport=? AND name=? AND season=?", (sport, name, season)).fetchone()["id"]


def _team(conn, sport: str, name: str, short: str, color: str, country: str | None) -> int:
    conn.execute("""INSERT INTO rankit_teams(sport,name,short_name,color,country) VALUES(?,?,?,?,?)
        ON CONFLICT(sport,name) DO UPDATE SET short_name=excluded.short_name,color=excluded.color,country=excluded.country""",
        (sport, name, short, color, country))
    return conn.execute("SELECT id FROM rankit_teams WHERE sport=? AND name=?", (sport, name)).fetchone()["id"]


def _team_logo(conn, team_id: int, logo_url: str, source: str) -> None:
    conn.execute("""INSERT INTO rankit_team_logos(team_id,logo_url,source,updated_at)
        VALUES(?,?,?,datetime('now'))
        ON CONFLICT(team_id) DO UPDATE SET
          logo_url=excluded.logo_url,source=excluded.source,updated_at=datetime('now')""",
        (team_id, logo_url, source))


def _match(conn, *, provider: str, external_id: str, sport: str, comp_id: int, season: str,
           starts_at: str, status: str, home_id: int, away_id: int, home_score, away_score,
           stage: str | None = None) -> int:
    conn.execute("""INSERT INTO rankit_matches
        (sport,competition_id,season,starts_at,status,home_team_id,away_team_id,home_score,away_score,
         editorial,summary,cover_variant,provider,provider_match_id,stage)
        VALUES(?,?,?,?,?,?,?,?,?,0,'','crests',?,?,?)
        ON CONFLICT(provider,provider_match_id) DO UPDATE SET
          starts_at=excluded.starts_at,status=excluded.status,home_score=excluded.home_score,
          away_score=excluded.away_score,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,
          competition_id=excluded.competition_id,season=excluded.season,stage=excluded.stage""",
        (sport, comp_id, season, starts_at, status, home_id, away_id, home_score, away_score,
         provider, str(external_id), stage))
    return conn.execute("SELECT id FROM rankit_matches WHERE provider=? AND provider_match_id=?", (provider, str(external_id))).fetchone()["id"]


def _player(conn, sport: str, team_id: int, external_id, name: str) -> int:
    conn.execute("""INSERT INTO rankit_players(sport,team_id,name) VALUES(?,?,?)
        ON CONFLICT(sport,name) DO UPDATE SET team_id=excluded.team_id""", (sport, team_id, name))
    return conn.execute("SELECT id FROM rankit_players WHERE sport=? AND name=?", (sport, name)).fetchone()["id"]


def _previous_season(season: str) -> str:
    start = int(season.split("-")[0]) - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _season_player_file(season: str) -> Path | None:
    exact = ROOT / "data" / f"{season}__player_scores.parquet"
    fallback = ROOT / "data" / f"{_previous_season(season)}__player_scores.parquet"
    return exact if exact.exists() else fallback if fallback.exists() else None


def _fotmob_stage(item: dict, mode: str) -> str:
    """FotMob tur kodunu kullanıcıya dönük sabit bir aşama adına çevir."""
    round_code = str(item.get("round") or "")
    round_name = str(item.get("roundName") or "")
    if mode == "qualifying":
        return {"1": "First qualifying round", "2": "Second qualifying round",
                "3": "Third qualifying round", "final": "Play-off round"}.get(round_code, round_name or "Qualifying")
    if mode == "cup":
        return round_name or {"1": "First round", "2": "Second round", "3": "Third round",
                              "1/8": "Round of 16", "1/4": "Quarter-finals",
                              "1/2": "Semi-finals", "final": "Final"}.get(round_code, "Cup tie")
    if mode == "league":
        return f"Matchday {round_code}" if round_code.isdigit() else round_name
    return {"playoff": "Knockout phase play-offs", "1/8": "Round of 16",
            "1/4": "Quarter-finals", "1/2": "Semi-finals", "final": "Final"}.get(
                round_code, f"League phase · Matchday {round_code}" if round_code.isdigit() else round_name)


def _fixture_in_season(item: dict, start_year: int) -> bool:
    """Sağlayıcı geçersiz gelecek sezonu sessizce eski sezona düşürürse engelle."""
    utc_time = str((item.get("status") or {}).get("utcTime") or "")
    date_part = utc_time[:10]
    return f"{start_year}-07-01" <= date_part < f"{start_year + 1}-07-01"


def _euroleague_payload(season: str) -> list[dict]:
    start = int(season.split("-")[0])
    url = f"https://api-live.euroleague.net/v2/competitions/E/seasons/E{start}/games"
    request = Request(url, headers={"User-Agent": "PrimaryArch-RankIt/0.4"})
    with urlopen(request, timeout=30) as response:
        return (json.load(response) or {}).get("data") or []


def _euroleague_stage(item: dict) -> str:
    phase = str((item.get("phaseType") or {}).get("name") or "").strip().title()
    group = str((item.get("group") or {}).get("rawName") or "").strip().title()
    round_name = str(item.get("roundName") or "").strip()
    if phase == "Regular Season":
        return round_name or "Regular Season"
    return " · ".join(part for part in (phase, group) if part) or round_name or "EuroLeague"


def sync_euroleague(season: str) -> dict:
    """Resmi EuroLeague canlı feed'ini ortak RankIt maç şemasına aktar."""
    games = _euroleague_payload(season)
    if not games:
        return {"matches": 0, "players": 0, "links": 0}
    player_path = ROOT / "data" / f"euroleague__{season}__player_scores.parquet"
    if not player_path.exists():
        player_path = ROOT / "data" / f"euroleague__{_previous_season(season)}__player_scores.parquet"
    players = pd.read_parquet(player_path) if player_path.exists() else pd.DataFrame(
        columns=["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION"])
    linked = 0
    with get_conn() as conn:
        comp_id = _competition(conn, "Basketball", "EuroLeague", "Europe", season)
        team_ids: dict[str, int] = {}
        for game in games:
            for side_key in ("local", "road"):
                club = (game.get(side_key) or {}).get("club") or {}
                code, name = str(club.get("code") or ""), str(club.get("name") or "")
                if not code or not name or code in team_ids:
                    continue
                team_ids[code] = _team(conn, "Basketball", name,
                                       _short_label(club.get("abbreviatedName"), code), _color(name), "Europe")
                crest = ((club.get("images") or {}).get("crest") or "").strip()
                if crest:
                    _team_logo(conn, team_ids[code], crest, "euroleague")
        rosters: dict[str, list[int]] = {}
        required = ["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION"]
        for row in players[required].dropna().drop_duplicates("PLAYER_ID").itertuples(index=False):
            code = str(row.TEAM_ABBREVIATION)
            if code not in team_ids:
                continue
            pid = _player(conn, "Basketball", team_ids[code], row.PLAYER_ID, row.PLAYER_NAME)
            rosters.setdefault(code, []).append(pid)
        for game in games:
            home, away = game.get("local") or {}, game.get("road") or {}
            home_code = str((home.get("club") or {}).get("code") or "")
            away_code = str((away.get("club") or {}).get("code") or "")
            if home_code not in team_ids or away_code not in team_ids:
                continue
            game_status = str(game.get("gameStatus") or "").lower()
            played = bool(game.get("played"))
            status = "finished" if played else "live" if game_status in {"live", "playing", "in progress", "started"} else "upcoming"
            mid = _match(conn, provider="euroleague", external_id=game.get("identifier") or game.get("id"),
                         sport="Basketball", comp_id=comp_id, season=season,
                         starts_at=str(game.get("utcDate") or game.get("date") or ""), status=status,
                         home_id=team_ids[home_code], away_id=team_ids[away_code],
                         home_score=int(home.get("score") or 0) if played or status == "live" else None,
                         away_score=int(away.get("score") or 0) if played or status == "live" else None,
                         stage=_euroleague_stage(game))
            for code in (home_code, away_code):
                for pid in rosters.get(code, []):
                    conn.execute("INSERT OR IGNORE INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,?,?)",
                                 (mid, pid, team_ids[code]))
                    linked += 1
    return {"matches": len(games), "players": sum(map(len, rosters.values())), "links": linked}


def _nba_schedule_v2(season: str) -> pd.DataFrame:
    """Gelecek maclari da veren NBA ScheduleLeagueV2'yi ortak semaya cevir."""
    from nba_api.stats.endpoints import ScheduleLeagueV2

    raw = ScheduleLeagueV2(season=season, timeout=45).get_data_frames()[0]
    if raw.empty:
        return raw
    raw = raw[raw["gameLabel"].fillna("").str.lower() != "preseason"].copy()
    # NBA Cup eleme slotlarinda takimlar grup asamasi bitene kadar null gelir.
    # Bunlari uydurmak yerine sonraki idempotent senkronizasyona birak.
    raw = raw.dropna(subset=["homeTeam_teamTricode", "awayTeam_teamTricode"])
    return pd.DataFrame({
        "GAME_ID": raw["gameId"].astype(str),
        "GAME_DATE_TIME": raw["gameDateTimeUTC"],
        "HOME_ABBREVIATION": raw["homeTeam_teamTricode"],
        "AWAY_ABBREVIATION": raw["awayTeam_teamTricode"],
        "GAME_STATUS": raw["gameStatus"],
        "HOME_PTS": pd.to_numeric(raw["homeTeam_score"], errors="coerce"),
        "AWAY_PTS": pd.to_numeric(raw["awayTeam_score"], errors="coerce"),
    })


def _cache_is_fresh(path: Path, max_age_hours: float | None) -> bool:
    """max_age_hours None ise cache süresiz geçerli (eski davranış).

    Zamanlanmış sync için bu şart: cache dosyası bir kez oluştuktan sonra
    sağlayıcıya bir daha gidilmiyordu, dolayısıyla skorlar hiç güncellenmiyor
    ve upcoming→live→finished geçişi hiç olmuyordu. 6 saatte bir koşan bir job
    NBA tarafında hiçbir şey değiştirmezdi.
    """
    if not path.exists():
        return False
    if max_age_hours is None:
        return True
    age_h = (time.time() - path.stat().st_mtime) / 3600
    return age_h < max_age_hours


def sync_nba(season: str, max_age_hours: float | None = None) -> dict:
    from nba_api.stats.static import teams as nba_teams
    from fetch_schedules import fetch_season_schedule

    stale = False   # True: saglayici bos dondu, elimizdeki bayat cache kullanildi

    legacy_cache = ROOT / "data" / f"{season}__schedule.parquet"
    fixture_cache = ROOT / "data" / f"{season}__rankit_schedule.parquet"
    if _cache_is_fresh(legacy_cache, max_age_hours):
        legacy = pd.read_parquet(legacy_cache)
        schedule = (legacy.sort_values("IS_HOME", ascending=False).drop_duplicates("GAME_ID")
                    .rename(columns={"TEAM_ABBREVIATION":"HOME_ABBREVIATION", "OPP_ABBREVIATION":"AWAY_ABBREVIATION",
                                     "PTS":"HOME_PTS", "OPP_PTS":"AWAY_PTS"}))
        schedule["GAME_DATE_TIME"] = schedule["GAME_DATE"].astype(str) + "T00:00:00Z"
        schedule["GAME_STATUS"] = schedule["WL"].notna().map({True: 3, False: 1})
    elif _cache_is_fresh(fixture_cache, max_age_hours):
        schedule = pd.read_parquet(fixture_cache)
    else:
        schedule = _nba_schedule_v2(season)
        if schedule.empty:
            legacy = fetch_season_schedule(season)
            if legacy.empty:
                # Sağlayıcı boş döndü. Bayat da olsa elimizdeki cache hiç
                # veriden iyidir — katalogu boşaltmak yerine ona düşüyoruz.
                if fixture_cache.exists():
                    stale = True
                    schedule = pd.read_parquet(fixture_cache)
                else:
                    return {"matches": 0, "players": 0, "links": 0}
            schedule = (legacy.sort_values("IS_HOME", ascending=False).drop_duplicates("GAME_ID")
                        .rename(columns={"TEAM_ABBREVIATION":"HOME_ABBREVIATION", "OPP_ABBREVIATION":"AWAY_ABBREVIATION",
                                         "PTS":"HOME_PTS", "OPP_PTS":"AWAY_PTS"}))
            schedule["GAME_DATE_TIME"] = schedule["GAME_DATE"].astype(str) + "T00:00:00Z"
            schedule["GAME_STATUS"] = schedule["WL"].notna().map({True: 3, False: 1})
        schedule.to_parquet(fixture_cache, index=False)
    schedule = schedule.dropna(subset=["HOME_ABBREVIATION", "AWAY_ABBREVIATION"])
    player_file = _season_player_file(season)
    players = pd.read_parquet(player_file) if player_file else pd.DataFrame(columns=["PLAYER_ID","PLAYER_NAME","TEAM_ABBREVIATION"])
    meta = {t["abbreviation"]: t for t in nba_teams.get_teams()}
    home_games = schedule.drop_duplicates("GAME_ID").copy()
    linked = 0
    with get_conn() as conn:
        comp_id = _competition(conn, "Basketball", "NBA", "USA", season)
        team_ids = {}
        abbreviations = set(schedule["HOME_ABBREVIATION"]) | set(schedule["AWAY_ABBREVIATION"])
        for abbr in sorted(abbreviations):
            item = meta.get(abbr, {"full_name": abbr})
            team_ids[abbr] = _team(conn, "Basketball", item["full_name"], abbr, NBA_COLORS.get(abbr, _color(abbr)), "USA")
            if item.get("id"):
                _team_logo(conn, team_ids[abbr], f"https://cdn.nba.com/logos/nba/{item['id']}/primary/L/logo.svg", "nba")
        roster = {}
        for row in players[["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION"]].dropna().drop_duplicates("PLAYER_ID").itertuples(index=False):
            if row.TEAM_ABBREVIATION not in team_ids:
                continue
            pid = _player(conn, "Basketball", team_ids[row.TEAM_ABBREVIATION], row.PLAYER_ID, row.PLAYER_NAME)
            roster.setdefault(row.TEAM_ABBREVIATION, []).append(pid)
        for row in home_games.itertuples(index=False):
            mid = _match(conn, provider="nba", external_id=row.GAME_ID, sport="Basketball", comp_id=comp_id,
                         season=season, starts_at=row.GAME_DATE_TIME, status="finished" if int(row.GAME_STATUS) == 3 else "live" if int(row.GAME_STATUS) == 2 else "upcoming",
                         home_id=team_ids[row.HOME_ABBREVIATION], away_id=team_ids[row.AWAY_ABBREVIATION],
                         home_score=None if pd.isna(row.HOME_PTS) else int(row.HOME_PTS), away_score=None if pd.isna(row.AWAY_PTS) else int(row.AWAY_PTS))
            for abbr in (row.HOME_ABBREVIATION, row.AWAY_ABBREVIATION):
                for pid in roster.get(abbr, []):
                    conn.execute("INSERT OR IGNORE INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,?,?)", (mid, pid, team_ids[abbr]))
                    linked += 1
    return {"matches": len(home_games), "players": sum(map(len, roster.values())),
            "links": linked, "stale": stale}


def sync_football(season: str) -> dict:
    import fetch_fotmob as ff

    start_year = int(season.split("-")[0])
    long_season = f"{start_year}-{start_year + 1}"
    fotmob_season = f"{start_year}/{start_year + 1}"
    total_matches = total_players = linked = total_pruned = 0
    with get_conn() as conn:
        for slug, (league_id, league_name, country, mode) in FOOTBALL_LEAGUES.items():
            comp_id = _competition(conn, "Football", league_name, country, season)
            parquet = ROOT / "data" / f"football__{slug}__{long_season}__fotmob.parquet"
            if not parquet.exists():
                previous = start_year - 1
                parquet = ROOT / "data" / f"football__{slug}__{previous}-{previous + 1}__fotmob.parquet"
            roster_df = pd.read_parquet(parquet) if parquet.exists() else pd.DataFrame(columns=["PLAYER_ID","PLAYER_NAME","TEAM"])
            roster_df = roster_df[["PLAYER_ID", "PLAYER_NAME", "TEAM"]].dropna().drop_duplicates("PLAYER_ID")
            payload = ff.api(f"leagues?id={league_id}&season={fotmob_season.replace('/', '%2F')}") or {}
            fixtures = [item for item in ((payload.get("fixtures") or {}).get("allMatches") or [])
                        if _fixture_in_season(item, start_year)]
            if mode == "uefa":
                # Kura çekilmeden önce sağlayıcı aynı saate yüzlerce boş slot
                # döndürebiliyor; gerçek tur kodu oluşana kadar bunları alma.
                fixtures = [item for item in fixtures if _fotmob_stage(item, mode)]
            # Kura öncesi boş slotları temizle — AMA iki koşulla.
            #
            # (1) Sağlayıcı bize hiçbir fikstür vermediyse HİÇBİR ŞEY SİLME.
            #     Eskiden silme, ff.api() boş dönse bile çalışıyordu: sağlayıcı
            #     çöktüğünde satırlar gidiyor, yerine yenisi konmuyordu.
            # (2) Kullanıcı içeriği taşıyan maça DOKUNMA. rankit_diary_entries
            #     match_id'ye ON DELETE CASCADE ile bağlı; bir maçı silmek o
            #     maça yazılmış puanları, yorumları, yorum beğenilerini ve
            #     yorum cevaplarını da siliyor. Geri alma yok, silinen içerik
            #     geri gelmiyor. Katalog temizliği asla kullanıcının yazdığını
            #     silmemeli — böyle bir satır varsa maç kalır.
            if (country == "Europe" or mode == "cup") and fixtures:
                pruned = conn.execute(f"""DELETE FROM rankit_matches
                    WHERE provider='fotmob' AND competition_id=?
                      AND (substr(starts_at,1,10)<? OR substr(starts_at,1,10)>=?
                           OR stage IS NULL OR stage='')
                      AND id NOT IN ({USER_CONTENT_MATCH_IDS})""",
                    (comp_id, f"{start_year}-07-01", f"{start_year + 1}-07-01")).rowcount
                total_pruned += pruned
            team_ids, rosters = {}, {}
            for item in fixtures:
                for side in (item.get("home") or {}, item.get("away") or {}):
                    name = side.get("name")
                    if name and name not in team_ids:
                        short = _short_label(side.get("shortName"), name)
                        team_ids[name] = _team(conn, "Football", name, short, _color(name), country)
                        if side.get("id"):
                            _team_logo(conn, team_ids[name], f"https://images.fotmob.com/image_resources/logo/teamlogo/{side['id']}.png", "fotmob")
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
                             home_id=team_ids[home["name"]], away_id=team_ids[away["name"]], home_score=hs, away_score=aws,
                             stage=_fotmob_stage(item, mode))
                for team_name in (home["name"], away["name"]):
                    for pid in rosters.get(team_name, []):
                        conn.execute("INSERT OR IGNORE INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,?,?)", (mid, pid, team_ids[team_name]))
                        linked += 1
                total_matches += 1
    return {"matches": total_matches, "players": total_players, "links": linked, "pruned": total_pruned}


def _record_run(provider: str, season: str, ok: bool, result: dict, error: str, duration_ms: int) -> None:
    """Her çalışmayı günlüğe yaz — başarılıyı da, başarısızı da.

    Zamanlanmış bir job'ın sessizce bozulması ile hiç kurulmamış olması
    dışarıdan aynı görünüyordu. Bu satır ikisini ayırır.
    """
    with get_conn() as conn:
        conn.execute("""INSERT INTO rankit_sync_runs
            (provider,season,ok,matches,players,links,pruned,stale,error,duration_ms)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (provider, season, int(ok), int(result.get("matches") or 0), int(result.get("players") or 0),
             int(result.get("links") or 0), int(result.get("pruned") or 0), int(bool(result.get("stale"))),
             error[:500], duration_ms))


def _run(provider: str, fn, season: str) -> bool:
    """Bir sağlayıcıyı çalıştır, sonucu günlüğe yaz, patlamasına izin verme.

    Önceden herhangi bir sağlayıcının hatası tüm script'i düşürüyordu: FotMob
    500 dönerse NBA senkronizasyonu da yapılmamış oluyordu. Sağlayıcılar
    birbirinden bağımsız, hataları da öyle olmalı.
    """
    started = time.time()
    try:
        result = fn()
        ms = int((time.time() - started) * 1000)
        _record_run(provider, season, True, result, "", ms)
        print(provider.upper(), result)
        return True
    except Exception as exc:                       # noqa: BLE001 — sağlayıcı hatası ölümcül değil
        ms = int((time.time() - started) * 1000)
        _record_run(provider, season, False, {}, f"{type(exc).__name__}: {exc}", ms)
        print(f"{provider.upper()} BASARISIZ: {type(exc).__name__}: {exc}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025-26")
    parser.add_argument("--only", choices=["nba", "euroleague", "football", "all"], default="all")
    parser.add_argument("--refresh", action="store_true",
                        help="Cache'i yok say, saglayiciya git (--max-age 0 ile ayni)")
    parser.add_argument("--max-age", type=float, default=None, metavar="SAAT",
                        help="NBA fikstur cache'i bu saatten eskiyse saglayiciya git. "
                             "Verilmezse cache suresiz gecerli (eski davranis).")
    args = parser.parse_args()
    max_age = 0.0 if args.refresh else args.max_age

    init_db()
    ok = True
    if args.only in ("nba", "all"):
        ok &= _run("nba", lambda: sync_nba(args.season, max_age), args.season)
    if args.only in ("euroleague", "all"):
        ok &= _run("euroleague", lambda: sync_euroleague(args.season), args.season)
    if args.only in ("football", "all"):
        ok &= _run("football", lambda: sync_football(args.season), args.season)
    # Zamanlayıcının başarısızlığı görebilmesi için çıkış kodu.
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
