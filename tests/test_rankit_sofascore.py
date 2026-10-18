# -*- coding: utf-8 -*-
"""Turkiye lansman paketi (2026-10-18): voleybol, BSL, Turk kupalari
(SofaScore), EuroCup, eksik ulusal futbol kupalari, NBA otomatik fikstur.

Ag yok: SofaScore sahte bir `get`, FotMob sahte bir modul. Testler su
sozleri kilitliyor:
  * lig listesi tek kayittan geliyor ve eski uc liste birebir korunuyor;
  * saglayicinin adi beklenmeyen bir yarismaysa ICERI ALINMIYOR;
  * yarisma kimligi adla cozuluyor; tek aday yoksa hata, sabitleme mumkun;
  * kadin takimi erkek takimiyla karismiyor; ayni kulup iki kaynakta tek satir;
  * iptal edilen mac alinmiyor, sezon disi mac alinmiyor, iki tur ayni sonucu verir;
  * bir yarismanin hatasi digerlerini durdurmuyor;
  * voleybol veritabanina yazilabiliyor (sport CHECK goc ile genisledi).
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import api.db as db                                   # noqa: E402
from api import rankit_competitions as rc             # noqa: E402
from api import rankit_sofascore as sofa              # noqa: E402


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "sofa.db")
    db.init_db()
    return tmp_path


def ts(day: str, hour: int = 17) -> int:
    return int(datetime.fromisoformat(f"{day}T{hour:02d}:00:00+00:00").timestamp())


def event(eid, home, away, day, kind="finished", hs=None, as_=None, round_no=None, round_name=None,
          women=False):
    item = {"id": eid, "startTimestamp": ts(day), "status": {"type": kind},
            "homeTeam": {"name": home, "shortName": home[:10]},
            "awayTeam": {"name": away, "shortName": away[:10]},
            "homeScore": {"current": hs} if hs is not None else {},
            "awayScore": {"current": as_} if as_ is not None else {}}
    info = {}
    if round_no is not None:
        info["round"] = round_no
    if round_name:
        info["name"] = round_name
    if info:
        item["roundInfo"] = info
    return item


TR_VOLLEY = [
    {"id": 10, "name": "Sultanlar Ligi"}, {"id": 11, "name": "Efeler Ligi"},
    {"id": 12, "name": "Kupa Voley"}, {"id": 13, "name": "Kupa Voley, Women"},
    {"id": 14, "name": "Super Cup"}, {"id": 15, "name": "Super Cup, Women"},
    {"id": 16, "name": "1. Lig"},
]
EU_VOLLEY = [{"id": 20, "name": "CEV Champions League"}, {"id": 21, "name": "CEV Champions League, Women"},
             {"id": 22, "name": "CEV Cup"}]
TR_BASKET = [{"id": 30, "name": "Basketbol Süper Ligi"}, {"id": 31, "name": "Türkiye Kupası"},
             {"id": 32, "name": "Cumhurbaşkanlığı Kupası"}, {"id": 33, "name": "Kadınlar Basketbol Süper Ligi"},
             {"id": 34, "name": "TBL"}]


def fake_get(events_by_tournament=None, seasons=None, fail=()):
    events_by_tournament = events_by_tournament or {}
    calls = []

    def get(path):
        calls.append(path)
        parts = path.strip("/").split("/")
        if path == "/sport/volleyball/categories":
            return {"categories": [{"id": 1, "name": "Turkey", "alpha2": "TR"},
                                   {"id": 2, "name": "Europe"}, {"id": 3, "name": "Italy", "alpha2": "IT"}]}
        if path == "/sport/basketball/categories":
            return {"categories": [{"id": 4, "name": "Turkey", "alpha2": "TR"}]}
        if parts[0] == "category":
            return {"groups": [{"uniqueTournaments": {1: TR_VOLLEY, 2: EU_VOLLEY, 4: TR_BASKET,
                                                      3: [{"id": 99, "name": "SuperLega"}]}[int(parts[1])]}]}
        if parts[0] == "unique-tournament" and parts[-1] == "seasons":
            tid = int(parts[1])
            if tid in fail:
                raise RuntimeError("boom")
            return {"seasons": (seasons or {}).get(tid, [{"id": tid * 100, "year": "26/27"},
                                                         {"id": tid * 100 - 1, "year": "25/26"}])}
        if parts[0] == "unique-tournament" and "events" in parts:
            tid, sid, direction, page = int(parts[1]), int(parts[3]), parts[5], int(parts[6])
            if page > 0 or sid != tid * 100:
                return None
            rows = events_by_tournament.get(tid, [])
            now = datetime.now(timezone.utc).date().isoformat()
            mine = [e for e in rows if (e["status"]["type"] == "finished") == (direction == "last")]
            return {"events": mine, "hasNextPage": False} if mine or now else None
        if parts[0] == "event":
            return {"event": LIVE_EVENTS.get(int(parts[1]))}
        return None
    get.calls = calls
    return get


LIVE_EVENTS: dict = {}


def one(sql, args=()):
    with db.get_conn() as conn:
        return conn.execute(sql, args).fetchone()


def rows(sql, args=()):
    with db.get_conn() as conn:
        return [tuple(r) for r in conn.execute(sql, args).fetchall()]


# ── Kayit ────────────────────────────────────────────────────────────────────

def test_registry_is_the_single_source_and_keeps_the_old_lists():
    import src.rankit_sync as rs
    import api.rankit as rk
    import api.rankit_live_sync as live

    assert rs.FOOTBALL_LEAGUES["premier-league"] == (47, "Premier League", "England", "league")
    assert rs.FOOTBALL_LEAGUES["champions-league-qualification"] == (10611, "UEFA Champions League", "Europe", "qualifying")
    assert live.FOTMOB_LEAGUES["UEFA Europa League"] == [(73, "uefa"), (10613, "qualifying")]
    assert rk.FOTMOB_LEAGUE_IDS["UEFA Conference League"] == [10216, 10615]
    for added in ("EFL Cup", "FA Community Shield", "Supercopa de España", "Supercoppa Italiana",
                  "DFL-Supercup", "Trophée des Champions"):
        assert added in live.FOTMOB_LEAGUES, added
    keys = [c.key for c in rc.COMPETITIONS]
    names = [(c.sport, c.name) for c in rc.COMPETITIONS]
    assert len(keys) == len(set(keys)) and len(names) == len(set(names))
    # Kazinan her kaynakta ad dogrulamasi sart.
    for comp in rc.COMPETITIONS:
        if comp.provider in ("fotmob", "sofascore"):
            assert comp.expect, comp.key
    assert {c.name for c in rc.of("sofascore")} >= {
        "Sultanlar Ligi", "Efeler Ligi", "CEV Champions League", "CEV Champions League Women",
        "Basketbol Süper Ligi", "Turkish Cup", "Kupa Voley Women", "Kupa Voley Men"}
    assert rc.BY_NAME["EuroCup"].provider == "eurocup"


@pytest.mark.parametrize("key,name,ok", [
    ("sultanlar-ligi", "Sultanlar Ligi", True),
    ("efeler-ligi", "Sultanlar Ligi", False),
    ("kupa-voley-women", "Kupa Voley, Women", True),
    ("kupa-voley-men", "Kupa Voley, Women", False),
    ("kupa-voley-men", "Kupa Voley", True),
    ("kupa-voley-men", "Super Cup", False),
    ("cev-champions-league", "CEV Champions League, Women", False),
    ("cev-champions-league-women", "CEV Champions League, Women", True),
    ("cev-champions-league", "CEV Cup", False),
    ("bsl", "Basketbol Süper Ligi", True),
    ("bsl", "Kadınlar Basketbol Süper Ligi", False),
    ("tr-basketball-cup", "Türkiye Kupası", True),
    ("tr-basketball-cup", "Cumhurbaşkanlığı Kupası", False),
    ("tr-basketball-supercup", "Cumhurbaşkanlığı Kupası", True),
    ("efl-cup", "Carabao Cup", True),
    ("efl-cup", "Eredivisie", False),
])
def test_provider_names_are_checked_before_anything_is_imported(key, name, ok):
    assert rc.name_matches(rc.BY_KEY[key], name) is ok


# ── Kimlik ve sezon ──────────────────────────────────────────────────────────

def test_every_turkish_competition_resolves_to_exactly_one_tournament():
    get = fake_get()
    expected = {"sultanlar-ligi": 10, "efeler-ligi": 11, "kupa-voley-men": 12, "kupa-voley-women": 13,
                "tr-volleyball-supercup-men": 14, "tr-volleyball-supercup-women": 15,
                "cev-champions-league": 20, "cev-champions-league-women": 21,
                "bsl": 30, "tr-basketball-cup": 31, "tr-basketball-supercup": 32}
    for key, tid in expected.items():
        assert sofa.resolve_tournament(rc.BY_KEY[key], get)[0] == tid, key


def test_ambiguous_or_missing_names_fail_loudly_and_ids_can_be_pinned(monkeypatch):
    original = list(TR_VOLLEY)
    TR_VOLLEY.append({"id": 17, "name": "Sultanlar Ligi Play-off"})
    try:
        with pytest.raises(LookupError, match="2 SofaScore matches"):
            sofa.resolve_tournament(rc.BY_KEY["sultanlar-ligi"], fake_get())
    finally:
        TR_VOLLEY[:] = original
    monkeypatch.setenv("SOFASCORE_TOURNAMENT_IDS", '{"sultanlar-ligi": 77}')
    get = lambda path: {"uniqueTournament": {"name": "Sultanlar Ligi"}} if path == "/unique-tournament/77" else None
    assert sofa.resolve_tournament(rc.BY_KEY["sultanlar-ligi"], get) == (77, "Sultanlar Ligi")
    bad = lambda path: {"uniqueTournament": {"name": "Efeler Ligi"}}
    with pytest.raises(LookupError, match="not this competition"):
        sofa.resolve_tournament(rc.BY_KEY["sultanlar-ligi"], bad)


def test_season_picks_two_year_name_then_single_year():
    get = lambda path: {"seasons": [{"id": 3, "year": "26/27"}, {"id": 2, "year": "25/26"}]}
    assert sofa.season_ids(1, "2025-26", get) == [2]
    get = lambda path: {"seasons": [{"id": 9, "year": "2026"}, {"id": 8, "year": "2025"}, {"id": 7, "year": "2024"}]}
    assert sofa.season_ids(1, "2025-26", get) == [9, 8]


def test_mapping_status_scores_stage_and_women_names():
    comp = rc.BY_KEY["sultanlar-ligi"]
    assert sofa.status_of({"status": {"type": "canceled"}}) is None
    assert sofa.status_of({"status": {"type": "postponed"}}) == "upcoming"
    assert sofa.status_of({"status": {"type": "inprogress"}}) == "live"
    assert sofa.scores({"homeScore": {"current": 3}, "awayScore": {"current": 1}}, "finished") == (3, 1)
    assert sofa.scores({"homeScore": {"current": 3}}, "upcoming") == (None, None)
    assert sofa.stage_of({"roundInfo": {"round": 4}}, comp) == "Matchday 4"
    assert sofa.stage_of({"roundInfo": {"round": 4, "name": "Quarterfinals"}}, comp) == "Quarterfinals"
    assert sofa.stage_of({}, rc.BY_KEY["tr-volleyball-supercup-women"]) == "Final"
    assert sofa.team_name({"name": "VakıfBank"}, comp) == "VakıfBank (W)"
    assert sofa.team_name({"name": "Fenerbahçe Medicana, Women"}, comp) == "Fenerbahçe Medicana (W)"
    assert sofa.team_name({"name": "Fenerbahçe"}, rc.BY_KEY["efeler-ligi"]) == "Fenerbahçe"
    assert sofa.starts_at({"startTimestamp": ts("2026-10-18")}) == "2026-10-18T17:00:00Z"


# ── Uctan uca: SofaScore -> veritabani ───────────────────────────────────────

def test_sofascore_sync_writes_volleyball_and_bsl_without_duplicating_clubs(fresh_db):
    import src.rankit_sync as rs

    with db.get_conn() as conn:   # EuroLeague'den gelmis ayni kulup
        conn.execute("INSERT INTO rankit_teams(sport,name,short_name,color,country) "
                     "VALUES('Basketball','Fenerbahce Beko Istanbul','FEN','#fff','Europe')")
        conn.execute("INSERT INTO rankit_teams(sport,name,short_name,color,country) "
                     "VALUES('Volleyball','Fenerbahçe','FB','#fff','Turkey')")   # erkek takimi
    get = fake_get({
        10: [event(1001, "VakıfBank", "Fenerbahçe Medicana", "2026-10-11", hs=3, as_=1, round_no=1),
             event(1002, "Eczacıbaşı", "VakıfBank", "2026-10-25", "notstarted", round_no=3),
             event(1003, "Galatasaray", "Eczacıbaşı", "2026-10-12", "canceled", round_no=1),
             event(1004, "Old", "Season", "2026-05-01", hs=3, as_=0, round_no=30)],
        11: [event(1101, "Fenerbahçe", "Halkbank", "2026-10-12", hs=3, as_=2, round_no=1)],
        30: [event(3001, "Fenerbahçe Beko", "Anadolu Efes", "2026-10-05", hs=88, as_=81, round_no=2),
             event(3002, "Anadolu Efes", "Beşiktaş", "2026-11-02", "notstarted", round_no=6)],
    })
    first = rs.sync_sofascore("2026-27", get=get)
    second = rs.sync_sofascore("2026-27", get=get)
    assert first["matches"] == second["matches"] == 5          # iptal ve sezon disi alinmadi
    assert one("SELECT COUNT(*) FROM rankit_matches WHERE provider='sofascore'")[0] == 5
    sultanlar = rows("""SELECT h.name,a.name,m.home_score,m.away_score,m.status,m.stage,c.sport
        FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
        JOIN rankit_teams h ON h.id=m.home_team_id JOIN rankit_teams a ON a.id=m.away_team_id
        WHERE c.name='Sultanlar Ligi' ORDER BY m.starts_at""")
    assert sultanlar == [("VakıfBank (W)", "Fenerbahçe Medicana (W)", 3, 1, "finished", "Matchday 1", "Volleyball"),
                         ("Eczacıbaşı (W)", "VakıfBank (W)", None, None, "upcoming", "Matchday 3", "Volleyball")]
    # Erkek Fenerbahce mevcut satira esledi; kadin takimi ona hic eslenmedi.
    efeler = one("""SELECT h.name FROM rankit_matches m JOIN rankit_teams h ON h.id=m.home_team_id
        WHERE m.provider_match_id='1101'""")[0]
    assert efeler == "Fenerbahçe"
    assert one("SELECT COUNT(*) FROM rankit_teams WHERE sport='Volleyball' AND name LIKE 'Fenerbah%'")[0] == 2
    # BSL'deki "Fenerbahçe Beko" EuroLeague'deki "Fenerbahce Beko Istanbul" ile ayni satir.
    bsl_home = one("""SELECT h.name FROM rankit_matches m JOIN rankit_teams h ON h.id=m.home_team_id
        WHERE m.provider_match_id='3001'""")[0]
    assert bsl_home == "Fenerbahce Beko Istanbul"
    assert one("SELECT COUNT(*) FROM rankit_teams WHERE sport='Basketball' AND name LIKE 'Fenerbah%'")[0] == 1
    # Arma yok (Paket E): SofaScore gorsellerini cekmiyoruz.
    assert one("SELECT COUNT(*) FROM rankit_team_logos")[0] == 0


def test_one_failing_competition_does_not_stop_the_others(fresh_db):
    import src.rankit_sync as rs

    get = fake_get({11: [event(1101, "Fenerbahçe", "Halkbank", "2026-10-12", hs=3, as_=2, round_no=1)]},
                   fail=(10,))
    out = rs.sync_sofascore("2026-27", get=get)
    assert out["matches"] == 1
    assert any(e.startswith("sultanlar-ligi:") for e in out["errors"])


def test_live_refresh_updates_sofascore_scores(fresh_db):
    import src.rankit_sync as rs
    from api import rankit_live_sync as live

    soon = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%d")
    rs.sync_sofascore("2026-27", keys=["efeler-ligi"],
                      get=fake_get({11: [event(1201, "Ziraat", "Halkbank", soon, "notstarted", round_no=2)]}))
    with db.get_conn() as conn:
        conn.execute("UPDATE rankit_matches SET starts_at=? WHERE provider_match_id='1201'",
                     ((datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S"),))
    LIVE_EVENTS[1201] = event(1201, "Ziraat", "Halkbank", soon, "inprogress", hs=2, as_=1, round_no=2)
    try:
        assert live._refresh_sofascore("Efeler Ligi", get=fake_get()) == 1
    finally:
        LIVE_EVENTS.clear()
    assert one("SELECT status,home_score,away_score FROM rankit_matches WHERE provider_match_id='1201'")[:] == ("live", 2, 1)


# ── EuroCup, NBA, futbol kupalari ────────────────────────────────────────────

def test_eurocup_uses_the_euroleague_feed_with_its_own_provider(fresh_db, monkeypatch):
    import src.rankit_sync as rs

    seen = []

    def payload(season, code="E"):
        seen.append(code)
        return [{"identifier": "U2026_1", "utcDate": "2026-10-07T18:00:00Z", "played": True,
                 "gameStatus": "Result", "roundName": "Round 1", "phaseType": {"name": "REGULAR SEASON"},
                 "local": {"score": 90, "club": {"code": "TTK", "name": "Turk Telekom Ankara"}},
                 "road": {"score": 80, "club": {"code": "BUR", "name": "Bursaspor"}}}]

    monkeypatch.setattr(rs, "_euroleague_payload", payload)
    rs.sync_eurocup("2026-27")
    assert seen == ["U"]
    assert rows("""SELECT m.provider,c.name,m.home_score,m.stage FROM rankit_matches m
        JOIN rankit_competitions c ON c.id=m.competition_id""") == [("eurocup", "EuroCup", 90, "Round 1")]


@pytest.mark.parametrize("label,sub,stage", [
    ("", "", "Regular Season"),
    ("Emirates NBA Cup", "West Group A", "Regular Season · Emirates NBA Cup"),
    ("Emirates NBA Cup", "Final", "Emirates NBA Cup · Final"),
    ("Play-In", "", "Play-In"),
    ("East First Round", "Game 1", "East First Round · Game 1"),
])
def test_nba_games_carry_their_stage(label, sub, stage):
    import src.rankit_sync as rs
    assert rs.nba_stage(label, sub) == stage


def test_nba_season_target_counts_only_the_regular_season():
    from api import rankit_hunt
    sql, args = rankit_hunt._stage("NBA")
    assert "Regular Season%" in sql and args == []


def test_wrong_fotmob_id_never_imports_another_league(fresh_db, monkeypatch):
    import src.rankit_sync as rs

    fake = types.ModuleType("fetch_fotmob")
    fixture = {"id": 777001, "round": "1", "roundName": "Round 3",
               "home": {"id": 1, "name": "Ajax"}, "away": {"id": 2, "name": "PSV"},
               "status": {"utcTime": "2026-10-20T19:00:00Z", "started": False, "finished": False}}

    def api(path, tries=3):
        if path.startswith("leagues?id=133&"):     # EFL Cup kimligi, ama donen Eredivisie
            return {"details": {"name": "Eredivisie"}, "fixtures": {"allMatches": [fixture]}}
        return {}
    fake.api = api
    monkeypatch.setitem(sys.modules, "fetch_fotmob", fake)
    out = rs.sync_football("2026-27")
    assert out["skipped"] == ["efl-cup: FotMob id 133 is 'Eredivisie'"]
    assert one("SELECT COUNT(*) FROM rankit_matches")[0] == 0
    assert one("SELECT COUNT(*) FROM rankit_competitions WHERE name='EFL Cup'")[0] == 0


def test_volleyball_is_a_valid_sport_after_migration(fresh_db):
    with db.get_conn() as conn:
        conn.execute("INSERT INTO rankit_competitions(sport,name,season) VALUES('Volleyball','X','2026-27')")
        with pytest.raises(Exception):
            conn.execute("INSERT INTO rankit_competitions(sport,name,season) VALUES('Curling','X','2026-27')")
