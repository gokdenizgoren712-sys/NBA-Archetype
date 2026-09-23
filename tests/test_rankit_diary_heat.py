# -*- coding: utf-8 -*-
"""2d isi seridi: "Height is your stars, colour is community heat."

/diary her kayda macin TOPLULUK isisini ekliyor. Kural kartla ayni:
kullanici basina son puanli kayit sayilir (rewatch ortalamayi sisirmez) ve
§5.5 20 puanin altinda isi yok -- sayac yine de doner. Gecici DB; ag yok.
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

ME = 1


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_diary_heat_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(uid, f"u{uid}@t", f"user{uid}") for uid in range(1, 26)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT')")
        for mid in (1, 2):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,3,1,'fotmob')""",
                      (mid, (utcnow() - timedelta(days=10 + mid)).strftime("%Y-%m-%dT19:00:00Z")))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def diary():
    return {e["match_id"]: e for e in client().get("/api/rankit/diary").json()["entries"]}


def rate(conn, uid, mid, rating):
    conn.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                    VALUES(?,?,date('now'),?,'public')""", (uid, mid, rating))


def test_heat_appears_only_once_twenty_people_rated(db):
    with DB.get_conn() as c:
        rate(c, ME, 1, 5.0)
        rate(c, ME, 2, 2.0)
        for uid in range(2, 21):              # 19 kisi + ben = 20 -> esik
            rate(c, uid, 1, 4.0)
        for uid in range(2, 10):              # 8 kisi + ben = 9 -> esik alti
            rate(c, uid, 2, 3.0)
    rows = diary()
    assert rows[1]["rating_count"] == 20
    assert rows[1]["community_rating"] == round((5.0 + 19 * 4.0) / 20, 1)
    assert rows[2]["rating_count"] == 9
    assert rows[2]["community_rating"] is None, "§5.5: 20 puanin altinda isi yok"
    assert rows[1]["rating"] == 5.0, "kendi puanin ayri alanda kaliyor"


def test_a_rewatch_does_not_count_twice(db):
    with DB.get_conn() as c:
        for uid in range(1, 20):              # 19 kisi
            rate(c, uid, 1, 4.0)
        rate(c, 2, 1, 1.0)                    # ayni kisinin ikinci (son) kaydi
    row = diary()[1]
    assert row["rating_count"] == 19, "rewatch ikinci kisi degil"
    assert row["community_rating"] is None
    with DB.get_conn() as c:
        rate(c, 21, 1, 4.0)                   # 20. kisi
    row = diary()[1]
    assert row["rating_count"] == 20
    # kullanici 2'nin SON puani (1.0) sayilir, ilki degil
    assert row["community_rating"] == round((19 * 4.0 - 4.0 + 1.0 + 4.0) / 20, 1)
