# -*- coding: utf-8 -*-
"""Faz 11 -- erisilebilirlik (API payi): erisilebilir adi bozan alan yok.
Canli dakika gorunmez yon isaretleri tasimaz; bildirim metni tam takim
adlariyla; uye kayitlari ve mac kadrosu tam takim adini tasir; isi her zaman
sayiyla ya da acik "yok" (null + sayac) ile gelir. Gecici DB; ag yok.
"""
import sys
import tempfile
import types
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_live_sync as LS
from api import rankit_notify
from api import rankit_rank
from api.auth import get_optional_user

ME, OTHER = 1, 2
RAW_MINUTE = "73‎’‎"            # FotMob'un canli dakikasi


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_a11y_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 3)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham Hotspur','TOT')")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
                     home_score,away_score,provider,provider_match_id,live_minute)
                     VALUES(1,'Football',1,'2026-27','2026-09-22T19:00:00Z','live',1,2,1,0,'fotmob','555',?)""", (RAW_MINUTE,))
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
                     home_score,away_score,provider)
                     VALUES(2,'Football',1,'2026-27','2026-09-15T19:00:00Z','finished',2,1,2,2,'fotmob')""")
        c.execute("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(10,'Football',1,'Saka')")
        c.execute("INSERT INTO rankit_match_players(match_id,player_id,team_id) VALUES(2,10,1)")
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def test_live_minute_has_no_invisible_marks(db):
    assert client().get("/api/rankit/matches/1").json()["live_minute"] == "73'"      # eski satir, okurken
    assert client().get("/api/rankit/matches/1/companion").json()["minute"] == "73'"
    assert LS.clean_minute("45+2’") == "45+2'" and LS.clean_minute("HT") == "HT"
    assert LS.clean_minute("") is None and LS.clean_minute(None) is None


def test_live_minute_is_stored_clean(db, monkeypatch):
    class Response:
        status_code = 200

        def json(self):
            return {"content": {"matchFacts": {"events": {"events": []}}},
                    "header": {"status": {"liveTime": {"short": "88‎’‎"}, "scoreStr": "2 - 0"}}}

    fake = types.ModuleType("curl_cffi")
    fake.requests = types.SimpleNamespace(get=lambda *a, **k: Response())
    monkeypatch.setitem(sys.modules, "curl_cffi", fake)
    monkeypatch.setattr(LS.time, "sleep", lambda s: None)
    LS.refresh_live_events()
    with DB.get_conn() as c:
        assert c.execute("SELECT live_minute FROM rankit_matches WHERE id=1").fetchone()[0] == "88'"


def test_notifications_read_with_full_team_names(db):
    with DB.get_conn() as c:
        rankit_notify.notify(c, ME, "broadcast", match_id=2, detail="Sky Sports")
    item = client().get("/api/rankit/notifications").json()["items"][0]
    assert item["match"] == "Tottenham Hotspur vs Arsenal" and item["match_short"] == "TOT vs ARS"


def test_member_entries_and_squads_carry_full_team_names(db):
    client(OTHER).post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0})
    entry = client().get(f"/api/rankit/members/{OTHER}").json()["entries"][0]
    assert (entry["home_name"], entry["away_name"]) == ("Tottenham Hotspur", "Arsenal")
    squad = client().get("/api/rankit/matches/2").json()["players"]
    assert squad[0]["team_name"] == "Arsenal" and squad[0]["team"] == "ARS"


def test_heat_is_a_number_or_an_explicit_absence(db):
    """§6 "heat never as colour alone": isi alani ya sayi ya da null -- null
    iken sayac her zaman var (TOO FEW RATINGS). Kademe/renk kodu tek basina yok."""
    card = client().get("/api/rankit/matches/2").json()
    assert card["community_rating"] is None and card["rating_count"] == 0
    assert all(k not in card for k in ("heat_level", "heat_color", "heat_bucket"))
