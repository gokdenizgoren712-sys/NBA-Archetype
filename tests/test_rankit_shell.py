# -*- coding: utf-8 -*-
"""Faz 8 -- Kabuk (2r, 4g, 6b, 3j): hesaba bagli veriler karismaz.
Silinmis hesabin token'i yeniden giris ister, ayarlar yalniz gercek boolean
kabul eder, profil sayaclari gercek (yeniden izleme ciftlemez), banli uyenin
profili acilmaz, quick-rate yildizsiz kaydi da gosterir ve bu gece zaten
sayildiysa seriyi "risk altinda" demez. Gecici DB; ag yok.
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

ME, OTHER, GHOST = 1, 2, 99


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def stamp(moment):
    return moment.strftime("%Y-%m-%d %H:%M:%S")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_shell_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in (1, 2, 3)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Chelsea','CHE'),(2,'Football','Sporting','SCP')")
        rankit_rank.seed_rules(c)
    return path


def add_match(mid, when):
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,home_score,away_score,provider)
                     VALUES(?,'Football',1,'2026-27',?,'finished',1,2,1,0,'fotmob')""", (mid, iso(when)))


def client(uid):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


# ── Silinmis hesabin token'i ─────────────────────────────────────────────────

def test_a_token_for_a_deleted_account_asks_to_sign_in_again(db):
    add_match(1, utcnow() - timedelta(days=2))
    ghost = client(GHOST)
    assert ghost.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0}).status_code == 401
    assert ghost.get("/api/rankit/profile").status_code == 401            # eskiden 500
    assert ghost.put("/api/rankit/settings", json={"alerts_running_hot": False}).status_code == 401


# ── Ayarlar: "false" true degildir ───────────────────────────────────────────

def test_settings_accept_only_real_booleans(db):
    api = client(ME)
    assert api.put("/api/rankit/settings", json={"alerts_running_hot": "false"}).status_code == 422
    assert api.get("/api/rankit/settings").json()["alerts_running_hot"] is True     # dokunulmadi
    assert api.put("/api/rankit/settings", json={"alerts_running_hot": False}).json()["alerts_running_hot"] is False
    assert api.put("/api/rankit/settings", json={"alerts_running_hot": 1}).status_code == 422
    assert client(OTHER).get("/api/rankit/settings").json()["alerts_running_hot"] is True   # hesaba bagli


# ── 6b sayaclari ─────────────────────────────────────────────────────────────

def seed_diary():
    now = utcnow()
    for mid in (1, 2, 3):
        add_match(mid, now - timedelta(days=10 + mid))
    api = client(ME)
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 2.0, "classic": True})
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "classic": True, "is_rewatch": True})
    api.post("/api/rankit/diary", json={"match_id": 2, "rating": 5.0})
    with DB.get_conn() as c:   # eski kayit: puansiz Classic
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,classic,visibility)
                     VALUES(?,3,'2026-09-01',NULL,1,'public')""", (ME,))


def test_profile_counters_count_matches_not_entries(db):
    seed_diary()
    stats = client(ME).get("/api/rankit/profile").json()["stats"]
    assert (stats["matches"], stats["classics"], stats["diary_count"]) == (3, 1, 4)
    assert stats["avg_rating"] == 4.5                     # mac basina son puan: (4 + 5) / 2
    member = client(OTHER).get(f"/api/rankit/members/{ME}").json()["stats"]
    assert (member["classics"], member["avg_rating"]) == (1, 4.5)
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'user',?)", (OTHER, ME))
    people = client(OTHER).get("/api/rankit/people?kind=following").json()["people"]
    assert people[0]["classics"] == 1


def test_a_banned_members_profile_does_not_open(db):
    with DB.get_conn() as c:
        c.execute("UPDATE users SET is_banned=1 WHERE id=3")
    assert client(ME).get("/api/rankit/members/3").status_code == 404
    assert client(ME).get(f"/api/rankit/members/{OTHER}").status_code == 200


# ── 3j: elmasin actigi sey ───────────────────────────────────────────────────

def test_quick_rate_shows_unrated_logs_and_knows_when_tonight_is_counted(db):
    now = utcnow()
    day_start = now.replace(hour=rankit_rank.RANKIT_DAY_START_HOUR, minute=0, second=0, microsecond=0)
    if now < day_start:
        day_start -= timedelta(days=1)
    tonight = max(day_start, now - timedelta(hours=2))
    add_match(1, tonight)
    add_match(2, tonight + timedelta(seconds=1))
    add_match(3, now - timedelta(days=3))                                 # yakalama
    yesterday = day_start - timedelta(hours=16)
    add_match(4, yesterday)
    with DB.get_conn() as c:
        # Dun gecesinde puanlanmis mac: seri 1.
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility,created_at,rated_at)
                     VALUES(?,4,?,4.0,'public',?,?)""",
                  (ME, yesterday.date().isoformat(), stamp(yesterday + timedelta(hours=2)),
                   stamp(yesterday + timedelta(hours=2))))
    api = client(ME)
    api.post("/api/rankit/diary", json={"match_id": 1})                  # yildizsiz izleme kaydi
    body = api.get("/api/rankit/quick-rate").json()
    assert sorted(m["id"] for m in body["tonight"]) == [1, 2]             # eskiden 1 dusuyordu
    assert [m["id"] for m in body["catchup"]] == [3]
    assert body["streak"] == 1 and body["at_risk"] is True and body["tonight_counted"] is False
    api.post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0})
    body = api.get("/api/rankit/quick-rate").json()
    assert [m["id"] for m in body["tonight"]] == [1]
    assert body["tonight_counted"] is True and body["at_risk"] is False  # gece sayildi
    assert api.get("/api/rankit/quick-rate?tz_offset=900").status_code == 422
