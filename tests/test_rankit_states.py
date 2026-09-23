# -*- coding: utf-8 -*-
"""Faz 10 -- durumlar (3k / 3l, BUILD §5.4, HANDOFF §4.10): tekrar gonderilen
istek isi bozmaz (toggle istenen durumu alir, yanit client_id ile tekillesir),
kesilen liste "devami var" der, canli skorun tazeligi gorunur, eski POST
/follow kisi kurallarini atlatamaz. Gecici DB; ag yok.
"""
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_rank
from api.auth import get_optional_user

ME, OTHER = 1, 2


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_states_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 46)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,'Football',?,?)",
                      [(i, f"Club {i} FC", f"C{i}") for i in range(1, 24)])
        for mid in range(1, 36):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,1,0,'fotmob')""",
                      (mid, f"2026-08-01T{mid % 24:02d}:{mid:02d}:00Z"))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def one(sql, args=()):
    with DB.get_conn() as c:
        return c.execute(sql, args).fetchone()[0]


# ── Tekrar guvenli toggle ────────────────────────────────────────────────────

def test_toggles_accept_the_wanted_state_so_a_retry_does_not_undo(db):
    entry = client(OTHER).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "review": "Great"}).json()["entry_id"]
    api = client()
    for _ in range(2):                                       # belirsiz istegin tekrari
        assert api.post(f"/api/rankit/reviews/{entry}/like", json={"on": True}).json() == {"liked": True, "likes": 1}
    assert one("SELECT points FROM rankit_points WHERE kind='respect' AND subject_id=?", (entry,)) == 2
    for _ in range(2):
        assert api.post(f"/api/rankit/reviews/{entry}/like", json={"on": False}).json() == {"liked": False, "likes": 0}
    assert api.post(f"/api/rankit/reviews/{entry}/like").json()["liked"] is True        # govdesiz: eski davranis
    for _ in range(2):
        assert api.post("/api/rankit/matches/2/watchlist", json={"on": True}).json() == {"watchlisted": True}
    assert one("SELECT COUNT(*) FROM rankit_watchlist WHERE user_id=?", (ME,)) == 1
    for _ in range(2):
        assert api.post("/api/rankit/favorite", json={"target_type": "match", "target_id": 2, "on": True}).json() == {"favorited": True}
    assert one("SELECT COUNT(*) FROM rankit_favorites WHERE user_id=?", (ME,)) == 1
    lid = client(OTHER).post("/api/rankit/lists", json={"title": "Mine", "match_ids": [1]}).json()["list_id"]
    for _ in range(2):
        assert api.post(f"/api/rankit/lists/{lid}/save", json={"on": True}).json() == {"saved": True, "saves": 1}
        assert api.post(f"/api/rankit/lists/{lid}/respect", json={"on": True}).json() == {"respected": True, "respect": 1}
    comment = client(OTHER).post(f"/api/rankit/reviews/{entry}/comments", json={"content": "Thanks"}).json()["comment_id"]
    for _ in range(2):
        assert api.post(f"/api/rankit/comments/{comment}/respect", json={"on": True}).json() == {"respected": True, "respect": 1}


def test_a_retried_reply_is_written_once(db):
    entry = client(OTHER).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "review": "Great"}).json()["entry_id"]
    api = client()
    body = {"content": "Agreed", "client_id": "reply-0001-abcd"}
    first = api.post(f"/api/rankit/reviews/{entry}/comments", json=body).json()
    again = api.post(f"/api/rankit/reviews/{entry}/comments", json=body).json()
    assert again == {"ok": True, "comment_id": first["comment_id"], "duplicate": True}
    assert one("SELECT COUNT(*) FROM rankit_review_comments WHERE entry_id=?", (entry,)) == 1
    assert one("SELECT COUNT(*) FROM rankit_notifications WHERE user_id=? AND kind='reply'", (OTHER,)) == 1
    other = client(3).post("/api/rankit/diary", json={"match_id": 2, "rating": 3.0, "review": "Meh"}).json()["entry_id"]
    assert api.post(f"/api/rankit/reviews/{other}/comments", json=body).status_code == 409


# ── "That's all" yalnizca liste bittiyse ─────────────────────────────────────

def test_truncated_lists_say_there_is_more(db):
    with DB.get_conn() as c:
        c.executemany("INSERT INTO rankit_notifications(user_id,kind,actor_id) VALUES(?,'follow',?)",
                      [(ME, a) for a in range(2, 43)])                   # 41 olay
    feed = client().get("/api/rankit/notifications").json()
    assert feed["has_more"] is True and len(feed["items"]) == 40
    with DB.get_conn() as c:
        c.execute("DELETE FROM rankit_notifications WHERE actor_id=42")
    assert client().get("/api/rankit/notifications").json()["has_more"] is False

    found = client().get("/api/rankit/search?q=FC").json()
    assert len(found["teams"]) == 20 and found["truncated"]["teams"] is True
    assert found["truncated"]["members"] is False

    with DB.get_conn() as c:
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                         VALUES(?,?,'2026-08-02',4.0,'public')""", [(OTHER, m) for m in range(1, 32)])
    member = client().get(f"/api/rankit/members/{OTHER}").json()
    assert len(member["entries"]) == 30 and member["entries_has_more"] is True


# ── Canli skor tazeligi ──────────────────────────────────────────────────────

def test_live_score_carries_its_freshness(db):
    with DB.get_conn() as c:
        c.execute("UPDATE rankit_matches SET status='live', events_polled_at='2026-09-22 20:15:00' WHERE id=3")
        c.execute("UPDATE rankit_matches SET events_polled_at='2026-09-22 20:15:00' WHERE id=4")
    assert client().get("/api/rankit/matches/3").json()["live_updated_at"] == "2026-09-22 20:15:00"
    assert client().get("/api/rankit/matches/4").json()["live_updated_at"] is None   # canli degil


# ── Eski POST /follow ────────────────────────────────────────────────────────

def test_legacy_follow_keeps_the_people_rules(db):
    api = client()
    assert api.post("/api/rankit/follow", json={"target_type": "user", "target_id": ME}).status_code == 422
    assert api.post("/api/rankit/follow", json={"target_type": "user", "target_id": 999}).status_code == 404
    with DB.get_conn() as c:
        c.execute("UPDATE users SET is_banned=1 WHERE id=5")
    assert api.post("/api/rankit/follow", json={"target_type": "user", "target_id": 5}).status_code == 404
    assert api.post("/api/rankit/follow", json={"target_type": "team", "target_id": 999}).status_code == 404
    for _ in range(2):
        assert api.post("/api/rankit/follow", json={"target_type": "team", "target_id": 1, "on": True}).json() == {"following": True}
    assert one("SELECT COUNT(*) FROM rankit_follows WHERE user_id=? AND target_type='team'", (ME,)) == 1
