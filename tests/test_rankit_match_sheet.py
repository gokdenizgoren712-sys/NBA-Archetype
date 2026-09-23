# -*- coding: utf-8 -*-
"""Faz 5 -- mac sayfasi (2f, 15d, 15b): kadro oyunculari oy verilebilir,
mevki, oyuna giris/cikis dakikasi, kimin yerine; yalnizca oynayanlara oy.

Saglayici yaniti elle kurulmus bir matchDetails parcasi; ag yok.
"""
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_live_sync as LS
from api import rankit_rank
from api.auth import get_optional_user

CONTENT = {
    "lineup": {
        "homeTeam": {
            "formation": "4-3-3", "coach": {"name": "Mikel Arteta"},
            "starters": [
                {"id": 1001, "name": "Raya", "shirtNumber": "1", "positionId": 11},
                {"id": 1002, "name": "White", "shirtNumber": "4", "positionId": 32},
                {"id": 1007, "name": "Saka", "shirtNumber": "7", "positionId": 82,
                 "performance": {"substitutionEvents": [{"time": 70, "type": "subOut"}]}},
            ],
            "subs": [
                {"id": 1019, "name": "Trossard", "shirtNumber": "19",
                 "performance": {"substitutionEvents": [{"time": 70, "type": "subIn"}]}},
                {"id": 1030, "name": "Unused Keeper", "shirtNumber": "30", "performance": {}},
            ],
        },
        "awayTeam": {
            "formation": "4-2-3-1",
            "starters": [{"id": 2001, "name": "Vicario", "shirtNumber": "1", "positionId": 11}],
            "subs": [],
        },
    },
    "matchFacts": {"events": {"events": [
        {"type": "Substitution", "time": 70, "isHome": True,
         "swap": [{"name": "Trossard", "id": "1019"}, {"name": "Saka", "id": "1007"}]},
    ]}},
}


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_sheet_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(1,'v@t','viewer','x')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Spurs','TOT')")
        for mid in (1, 2):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,3,1,'fotmob')""",
                      (mid, f"2026-09-{13 + mid}T15:30:00Z"))
        rankit_rank.seed_rules(c)
    return path


def store_lineup():
    with DB.get_conn() as c:
        return LS._store_lineups_from(c, {"id": 1, "home_team_id": 1, "away_team_id": 2}, CONTENT)


def client():
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": "1"}
    return TestClient(app)


def player_id(name):
    with DB.get_conn() as c:
        return c.execute("SELECT id FROM rankit_players WHERE name=?", (name,)).fetchone()[0]


# ── Kadro: mevki, dakika, kimin yerine ───────────────────────────────────────

def test_lineup_carries_positions_substitutions_and_votable_ids(db):
    assert store_lineup() == 2
    home = next(l for l in client().get("/api/rankit/matches/1").json()["lineups"] if l["side"] == "home")
    starters = {p["name"]: p for p in home["starters"]}
    bench = {p["name"]: p for p in home["bench"]}
    assert starters["Raya"]["position"] == "Keeper" and starters["Raya"]["position_code"] == 11
    assert starters["White"]["position"] == "Defender"
    assert starters["Saka"]["sub_out"] == 70 and starters["Saka"]["played"] is True
    assert bench["Trossard"]["sub_in"] == 70 and bench["Trossard"]["replaced"] == "Saka"
    assert bench["Trossard"]["played"] is True
    assert bench["Unused Keeper"]["played"] is False and bench["Unused Keeper"]["sub_in"] is None
    assert all(p["player_id"] for p in home["starters"] + home["bench"])
    with DB.get_conn() as c:
        image, team = c.execute("SELECT image_url, team_id FROM rankit_players WHERE name='Trossard'").fetchone()
    assert image.endswith("/playerimages/1019.png") and team == 1


# ── Oy: yalnizca oynayanlara (BUILD §10.2) ───────────────────────────────────

def test_potm_and_respect_only_for_players_who_played(db):
    store_lineup()
    api = client()
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.5})
    assert api.post("/api/rankit/matches/1/potm", json={"player_id": player_id("Trossard")}).status_code == 200
    assert api.post("/api/rankit/matches/1/potm", json={"player_id": player_id("Unused Keeper")}).status_code == 422
    assert api.put("/api/rankit/matches/1/respect",
                   json={"player_ids": [player_id("Raya"), player_id("Unused Keeper")]}).status_code == 422
    assert api.put("/api/rankit/matches/1/respect", json={"player_ids": [player_id("Raya")]}).status_code == 200


def test_matches_without_a_linked_lineup_fall_back_to_the_squad(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(50,'Football',1,'Squad Man')")
        c.execute("INSERT INTO rankit_match_players(match_id,player_id,team_id) VALUES(2,50,1)")
    api = client()
    api.post("/api/rankit/diary", json={"match_id": 2, "rating": 3.0})
    assert api.post("/api/rankit/matches/2/potm", json={"player_id": 50}).status_code == 200


def test_restoring_the_lineup_keeps_one_row_per_player(db):
    store_lineup()
    store_lineup()                                  # 45 sn'de bir yeniden yazilir
    with DB.get_conn() as c:
        n = c.execute("SELECT COUNT(*) FROM rankit_match_lineup_players WHERE match_id=1").fetchone()[0]
        players = c.execute("SELECT COUNT(*) FROM rankit_players WHERE name='Trossard'").fetchone()[0]
    assert n == 6 and players == 1



def test_live_events_loop_keeps_the_lineup_current(db, monkeypatch):
    """15d oyuna girenleri dakikasiyla gosteriyor: canli olay dongusu (45 sn)
    ayni matchDetails yanitindan kadroyu da yaziyor. Saglayici sahte."""
    import sys
    import types

    with DB.get_conn() as c:
        c.execute("""UPDATE rankit_matches SET status='live', provider_match_id='5868065',
                     home_score=NULL, away_score=NULL WHERE id=1""")

    class Response:
        status_code = 200

        def json(self):
            return {"content": CONTENT,
                    "header": {"status": {"liveTime": {"short": "73'"}, "scoreStr": "2 - 1"}}}

    fake = types.ModuleType("curl_cffi")
    fake.requests = types.SimpleNamespace(get=lambda *a, **k: Response())
    monkeypatch.setitem(sys.modules, "curl_cffi", fake)
    monkeypatch.setattr(LS.time, "sleep", lambda s: None)
    out = LS.refresh_live_events()
    assert out["polled"] == 1
    home = next(l for l in client().get("/api/rankit/matches/1").json()["lineups"] if l["side"] == "home")
    assert {p["name"]: p["sub_in"] for p in home["bench"]}["Trossard"] == 70
