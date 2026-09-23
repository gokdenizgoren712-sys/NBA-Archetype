# -*- coding: utf-8 -*-
"""Faz 2 -- Home (2a): RankIt gunu, canli dakika, gecenin sayisi, yayinci.

Rotalar FastAPI TestClient ile; gecici DB, canli servis yok.
"""
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_rank
from api.auth import get_optional_user


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_home_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(1,'v@t','viewer','x')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Basketball','B','2026-27')")
        c.execute("""INSERT INTO rankit_teams(id,sport,name,short_name) VALUES
                     (1,'Football','Chelsea','CHE'),(2,'Football','Sporting CP','SCP'),
                     (3,'Basketball','Fenerbahce','FEN'),(4,'Basketball','Real Madrid','RMB')""")
    return path


def add_match(mid, when, status, *, sport="Football", comp=1, minute=None, provider="fotmob"):
    home, away = (1, 2) if sport == "Football" else (3, 4)
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,provider,live_minute)
                     VALUES(?,?,?,'2026-27',?,?,?,?,?,?)""",
                  (mid, sport, comp, iso(when), status, home, away, provider, minute))


def client():
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": "1"}
    return TestClient(app)


# ── Canli dakika ─────────────────────────────────────────────────────────────

def test_live_minute_only_on_live_matches(db):
    now = utcnow()
    add_match(1, now - timedelta(minutes=70), "live", minute="73'")
    add_match(2, now - timedelta(days=1), "finished", minute="90+4'")   # kalinti
    add_match(3, now + timedelta(hours=3), "upcoming")
    api = client()
    assert api.get("/api/rankit/matches/1").json()["live_minute"] == "73'"
    assert api.get("/api/rankit/matches/2").json()["live_minute"] is None
    assert api.get("/api/rankit/matches/3").json()["live_minute"] is None


# ── Gecenin sayisi ───────────────────────────────────────────────────────────

def test_home_counts_the_real_number_of_matches_in_the_window(db):
    now = utcnow()
    start, end = now - timedelta(hours=1), now + timedelta(hours=23)
    add_match(1, now + timedelta(hours=1), "upcoming")
    add_match(2, now + timedelta(hours=2), "upcoming")
    add_match(3, now + timedelta(hours=3), "upcoming", sport="Basketball", comp=2)
    add_match(4, now + timedelta(days=2), "upcoming")                   # pencere disi
    add_match(5, now - timedelta(days=2), "finished")                   # pencere disi
    add_match(6, now + timedelta(hours=4), "upcoming", provider=None)   # demo kalintisi
    params = {"window_start": iso(start), "window_end": iso(end)}
    day = client().get("/api/rankit/home", params=params).json()["day"]
    assert day["matches"] == 3
    football = client().get("/api/rankit/home", params={**params, "sport": "Football"}).json()
    assert football["day"]["matches"] == 2


def test_home_day_window_follows_the_timezone_offset(db):
    def expected(tz):
        day = rankit_rank.rankit_day(utcnow(), tz)
        return (datetime.fromisoformat(day)
                + timedelta(hours=rankit_rank.RANKIT_DAY_START_HOUR, minutes=-tz)).isoformat()
    before = expected(180)
    got = client().get("/api/rankit/home", params={"tz_offset": 180}).json()["day"]["start"]
    assert got in {before, expected(180)}          # 11:00 sinirinda gun donebilir
    assert got.endswith("08:00:00")                # Istanbul 11:00 = 08:00 UTC
    assert client().get("/api/rankit/home", params={"tz_offset": 1000}).status_code == 422


# ── Yayinci ──────────────────────────────────────────────────────────────────

def test_home_broadcast_uses_the_viewers_country_and_never_invents(db):
    now = utcnow()
    add_match(1, now + timedelta(hours=2), "upcoming")                  # kuralli turnuva
    add_match(2, now + timedelta(hours=3), "upcoming", sport="Basketball", comp=2)
    add_match(3, now - timedelta(hours=20), "finished")
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_broadcasters(id,country,name) VALUES(1,'TR','beIN SPORTS')")
        c.execute("INSERT INTO rankit_broadcast_rules(competition_id,country,broadcaster_id) VALUES(1,'TR',1)")
    cards = {m["id"]: m for m in client().get("/api/rankit/home", params={"country": "tr"}).json()["matches"]}
    assert cards[1]["broadcast"]["confidence"] == "typical"
    assert [ch["name"] for ch in cards[1]["broadcast"]["channels"]] == ["beIN SPORTS"]
    assert cards[2]["broadcast"] == {"country": "TR", "confidence": None, "channels": []}
    assert "broadcast" not in cards[3]                                  # bitmis mac
    for params in ({}, {"country": "XX"}):                              # ulke yok / desteklenmiyor
        resp = client().get("/api/rankit/home", params=params)
        assert resp.status_code == 200
        assert all("broadcast" not in m for m in resp.json()["matches"])
