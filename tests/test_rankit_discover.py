# -*- coding: utf-8 -*-
"""Faz 3 -- Diary ve Discover (2e, 2c/6c, 3e).

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


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_discover_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 41)])
        c.execute("INSERT INTO users(id,email,username,hashed_password,is_banned) VALUES(50,'b@t','arsenal_troll','x',1)")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("""INSERT INTO rankit_teams(id,sport,name,short_name) VALUES
                     (1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT'),
                     (3,'Football','Chelsea','CHE'),(4,'Football','Fulham','FUL')""")
        for mid, (home, away) in enumerate(((1, 2), (3, 4), (1, 3)), start=1):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',?,?,1,0,'fotmob')""",
                      (mid, f"2026-09-0{mid}T19:00:00Z", home, away))
        rankit_rank.seed_rules(c)
    return path


def client(uid=1):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def rate(mid, rating, users):
    with DB.get_conn() as c:
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating)
                         VALUES(?,?,'2026-09-05',?)""", [(u, mid, rating) for u in users])


# ── 6c: en dusuk isi, tum katalogda ──────────────────────────────────────────

def test_catalog_min_heat_filters_the_whole_catalog_and_respects_twenty(db):
    rate(1, 4.0, range(2, 22))          # 20 puan, 4.0
    rate(2, 5.0, range(2, 21))          # 19 puan -- isi yok, filtreye girmez
    rate(3, 2.0, range(2, 27))          # 25 puan, 2.0
    api = client()
    everything = api.get("/api/rankit/catalog").json()
    assert everything["total"] == 3
    good = api.get("/api/rankit/catalog", params={"min_heat": 2.5}).json()
    assert good["total"] == 1 and [m["id"] for m in good["matches"]] == [1]
    assert api.get("/api/rankit/catalog", params={"min_heat": 6}).status_code == 422


# ── 3e: arama literal ve gorunur olanla sinirli ──────────────────────────────

def test_search_treats_wildcards_as_literal_characters(db):
    api = client()
    found = api.get("/api/rankit/search", params={"q": "ars"}).json()
    assert [t["name"] for t in found["teams"]] == ["Arsenal"]
    for q in ("%", "_"):
        out = api.get("/api/rankit/search", params={"q": q}).json()
        assert out["matches"] == [] and out["teams"] == [] and out["members"] == []


def test_search_hides_demo_leftovers_and_banned_members(db):
    with DB.get_conn() as c:        # canlidaki gibi: provider NULL demo maci
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,provider)
                     VALUES(9,'Football',1,'2025-26','2026-08-18T22:00:00','upcoming',1,4,NULL)""")
    out = client().get("/api/rankit/search", params={"q": "arsenal"}).json()
    assert 9 not in [m["id"] for m in out["matches"]]
    assert sorted(m["id"] for m in out["matches"]) == [1, 3]
    assert "arsenal_troll" not in [m["username"] for m in out["members"]]


# ── 2e: diary tarihi kullanicinin gunu ───────────────────────────────────────

def test_diary_default_date_is_the_users_local_day(db):
    """UTC+13 ile UTC-12 arasinda 25 saat var: her an FARKLI takvim gunundeler.
    Saat dilimini yok sayan her uygulama ikisine ayni tarihi yazar."""
    def local(tz):
        return (utcnow() + timedelta(minutes=tz)).date().isoformat()

    stored = {}
    for mid, tz in ((1, 780), (2, -720)):
        before = local(tz)
        entry_id = client().post("/api/rankit/diary",
                                 json={"match_id": mid, "rating": 4.0, "tz_offset": tz}).json()["entry_id"]
        with DB.get_conn() as c:
            stored[tz] = c.execute("SELECT watched_date FROM rankit_diary_entries WHERE id=?",
                                   (entry_id,)).fetchone()[0]
        assert stored[tz] in {before, local(tz)}
    assert stored[780] != stored[-720]


def test_diary_future_check_uses_the_earliest_timezone_not_the_server(db):
    api = client()
    east = (utcnow() + timedelta(hours=14)).date().isoformat()     # UTC+14'un bugunu
    assert api.post("/api/rankit/diary", json={"match_id": 2, "rating": 3.0,
                                              "watched_date": east}).status_code == 200
    beyond = (utcnow() + timedelta(days=2)).date().isoformat()
    assert api.post("/api/rankit/diary", json={"match_id": 3, "rating": 3.0,
                                              "watched_date": beyond}).status_code == 422
    assert api.post("/api/rankit/diary", json={"match_id": 3, "tz_offset": 900}).status_code == 422
