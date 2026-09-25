# -*- coding: utf-8 -*-
"""Faz 13 -- web temeli (7a / 8a / 8c): katalog siralamasi ve raydaki
secenek sayilari, tabloda AVG HEAT (§5.5 esigiyle), takip edilenlerin akisi
ve koleksiyon kapatma olaylari. Gecici DB; ag yok.
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
from api.auth import get_optional_user, require_admin

ME, FRIEND, MUTUAL, STRANGER = 1, 2, 3, 4


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_web_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    now = utcnow()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 61)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Basketball','NBA','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,?,?,?)",
                      [(1, "Football", "Arsenal", "ARS"), (2, "Football", "Chelsea", "CHE"),
                       (3, "Football", "Everton", "EVE"), (4, "Basketball", "Knicks", "NYK"),
                       (5, "Basketball", "Celtics", "BOS")])
        rows = [
            (1, 1, "Football", 1, 2, now - timedelta(days=3), "finished"),
            (2, 1, "Football", 2, 3, now - timedelta(days=2), "finished"),
            (3, 1, "Football", 3, 1, now - timedelta(days=1), "finished"),
            (4, 1, "Football", 1, 3, now + timedelta(days=2), "upcoming"),
            (5, 1, "Football", 2, 1, now - timedelta(minutes=30), "live"),
            (6, 2, "Basketball", 4, 5, now + timedelta(days=1), "upcoming"),
        ]
        for mid, comp, sport, home, away, when, status in rows:
            done = status == "finished"
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,?,?,'2026-27',?,?,?,?,?,?,'fotmob')""",
                      (mid, sport, comp, iso(when), status, home, away, 2 if done else None, 1 if done else None))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME, admin=False):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    if admin:
        app.dependency_overrides[require_admin] = lambda: {"sub": str(uid)}
    return TestClient(app)


def crowd(match_id, rating, voters=20, start=10):
    with DB.get_conn() as c:
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                         VALUES(?,?,'2026-09-01',?,'public')""",
                      [(u, match_id, rating) for u in range(start, start + voters)])


# ── 8a: siralama ve secenek sayilari ─────────────────────────────────────────

def test_catalog_facets_count_each_option_under_the_other_filters(db):
    body = client().get("/api/rankit/catalog?sport=Football&facets=true").json()
    assert body["total"] == 5
    facets = {dim: {f["value"]: f["count"] for f in rows} for dim, rows in body["facets"].items()}
    assert facets["sport"] == {"Football": 5, "Basketball": 1}           # secili boyut kendini daraltmaz
    assert facets["status"] == {"finished": 3, "upcoming": 1, "live": 1}   # yalniz futbol
    assert facets["competition"] == {"Premier League": 5}
    assert "facets" not in client().get("/api/rankit/catalog").json()


def test_catalog_sorts_hottest_soonest_and_most_reviewed(db):
    crowd(1, 3.0); crowd(2, 4.5); crowd(3, 5.0, voters=19)              # 3: esik alti
    hottest = [m["id"] for m in client().get("/api/rankit/catalog?status=finished&sort=hottest").json()["matches"]]
    assert hottest == [2, 1, 3]
    soonest = [m["id"] for m in client().get("/api/rankit/catalog?sort=soonest").json()["matches"]]
    assert soonest[:3] == [5, 6, 4] and soonest[3:] == [3, 2, 1]        # canli, yaklasan (yakin once), bitmis
    with DB.get_conn() as c:
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,review,visibility)
                         VALUES(?,1,'2026-09-02',4.0,'Good','public')""", [(u,) for u in (40, 41)])
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,review,visibility)
                     VALUES(42,3,'2026-09-02',4.0,'Fine','public')""")
    reviewed = [m["id"] for m in client().get("/api/rankit/catalog?status=finished&sort=reviewed").json()["matches"]]
    assert reviewed == [1, 3, 2]
    assert client().get("/api/rankit/catalog?sort=random").status_code == 422


# ── 8c: AVG HEAT ─────────────────────────────────────────────────────────────

def test_table_avg_heat_uses_only_matches_with_twenty_ratings(db):
    crowd(1, 3.0); crowd(2, 4.6); crowd(3, 5.0, voters=19)
    table = {r["name"]: r for r in client().get("/api/rankit/competitions/1").json()["standings"]}
    assert (table["Arsenal"]["avg_heat"], table["Arsenal"]["heat_matches"]) == (3.0, 1)    # 3. mac esik alti
    assert table["Chelsea"]["avg_heat"] == 3.8 and table["Chelsea"]["heat_matches"] == 2
    assert table["Everton"]["avg_heat"] == 4.6


# ── 7a / 11d: takip edilenlerin akisi ────────────────────────────────────────

def follow(a, b):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'user',?)", (a, b))


def test_activity_shows_the_people_you_follow_and_respects_visibility(db):
    follow(ME, FRIEND); follow(ME, MUTUAL); follow(MUTUAL, ME)
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.5, "review": "Late winner!", "spoiler": True})
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 2, "rating": 3.0, "visibility": "followers"})
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 3, "rating": 2.0, "visibility": "private"})
    client(MUTUAL).post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0, "review": "Tense"})
    client(STRANGER).post("/api/rankit/diary", json={"match_id": 1, "rating": 1.0, "review": "Dull"})
    feed = client().get("/api/rankit/activity").json()
    seen = {(i["user"]["username"], i["match"]["id"]) for i in feed["items"]}
    assert seen == {("user2", 1), ("user2", 2), ("user3", 2)}           # gizli ve yabanci yok
    spoiled = next(i for i in feed["items"] if i["match"]["id"] == 1)
    assert spoiled["review"] == "" and spoiled["review_withheld"] is True and spoiled["viewer_rated"] is False
    assert spoiled["match"]["home_name"] == "Arsenal"
    mutuals = client().get("/api/rankit/activity?scope=mutuals").json()["items"]
    assert {i["user"]["username"] for i in mutuals} == {"user3"}
    with DB.get_conn() as c:
        c.execute("UPDATE users SET is_banned=1 WHERE id=?", (MUTUAL,))
    assert all(i["user"]["id"] != MUTUAL for i in client().get("/api/rankit/activity").json()["items"])
    page = client().get("/api/rankit/activity?limit=1").json()
    assert len(page["items"]) == 1 and page["has_more"] is True


def test_closing_a_collection_reaches_the_feed_and_leaves_it_when_undone(db):
    follow(ME, FRIEND)
    client(admin=True).post("/api/rankit/admin/collections", json={"title": "Two derbies", "match_ids": [1, 2]})
    friend = client(FRIEND)
    friend.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0})
    assert not [i for i in client().get("/api/rankit/activity").json()["items"] if i["kind"] == "collection"]
    last = friend.post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0}).json()
    closed = [i for i in client().get("/api/rankit/activity").json()["items"] if i["kind"] == "collection"]
    assert closed[0]["collection"]["title"] == "Two derbies" and closed[0]["collection"]["collected"] == 2
    friend.put(f"/api/rankit/diary/{last['entry_id']}", json={"match_id": 2, "rating": None})
    assert not [i for i in client().get("/api/rankit/activity").json()["items"] if i["kind"] == "collection"]


def test_activity_items_know_whether_you_respected_them(db):
    """11d: akistaki respect dugmesi kendi durumunu bilir (web ReviewArticle)."""
    follow(ME, FRIEND)
    entry = client(FRIEND).post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0, "review": "Tense"}).json()
    item = client().get("/api/rankit/activity").json()["items"][0]
    assert item["respected"] is False and item["respect"] == 0
    client().post(f"/api/rankit/reviews/{entry['entry_id']}/like", json={"on": True})
    item = client().get("/api/rankit/activity").json()["items"][0]
    assert item["respected"] is True and item["respect"] == 1
    other = client(MUTUAL)
    follow(MUTUAL, FRIEND)
    assert other.get("/api/rankit/activity").json()["items"][0]["respected"] is False
