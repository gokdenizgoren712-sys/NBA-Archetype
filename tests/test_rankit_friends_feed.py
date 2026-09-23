# -*- coding: utf-8 -*-
"""2q arkadas akisi: kayit bir koleksiyon karti olarak cizilir.

/activity her kayit icin karti cizecek alanlari tasir (yarisma, spor, kulup
renkleri, armalar, ARKADASIN skin'i) ve kartin isisi toplulugun -- §5.5 20
puanin altinda yok, sayac kalir. Gecici DB; ag yok.
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

ME, FRIEND = 1, 2


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_friends_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(uid, f"u{uid}@t", f"user{uid}") for uid in range(1, 25)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("""INSERT INTO rankit_teams(id,sport,name,short_name,color) VALUES
                     (1,'Football','Arsenal','ARS','#c8202f'),(2,'Football','Tottenham','TOT','#e9ecf2')""")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,home_score,away_score,provider)
                     VALUES(1,'Football',1,'2026-27',?,'finished',1,2,3,1,'fotmob')""",
                  ((utcnow() - timedelta(days=2)).strftime("%Y-%m-%dT19:00:00Z"),))
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?, 'user', ?)", (ME, FRIEND))
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,review,classic,skin,visibility)
                     VALUES(?,1,date('now'),5.0,'Best atmosphere in years.',1,'ember','public')""", (FRIEND,))
        rankit_rank.seed_rules(c)
    return path


def feed():
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(ME)}
    return TestClient(app).get("/api/rankit/activity").json()["items"]


def test_an_entry_carries_what_the_card_needs(db):
    item = next(i for i in feed() if i["kind"] == "entry")
    m = item["match"]
    assert (m["competition"], m["sport"], m["home_color"], m["away_color"]) == \
        ("Premier League", "Football", "#c8202f", "#e9ecf2")
    assert item["skin"] == "ember", "arkadasin karti KENDI skin'iyle"
    assert item["classic"] is True and item["rating"] == 5.0
    assert m["rating_count"] == 1 and m["community_rating"] is None, "§5.5: 20 puan altinda isi yok"


def test_the_card_heat_is_the_community_once_twenty_rated(db):
    with DB.get_conn() as c:
        for uid in range(3, 22):                 # 19 kisi + arkadas = 20
            c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                         VALUES(?,1,date('now'),4.0,'public')""", (uid,))
    m = next(i for i in feed() if i["kind"] == "entry")["match"]
    assert m["rating_count"] == 20
    assert m["community_rating"] == round((5.0 + 19 * 4.0) / 20, 1)
