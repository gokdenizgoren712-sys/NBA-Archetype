# -*- coding: utf-8 -*-
"""Faz 16 -- kalan web yuzeyleri: 11c arama (gercek toplamlar, kulup isisi +
takip, kisi iliskisi + "N Arsenal matches logged", liste yazari, hottest
first), 12a kulup cekmecesi, 12b kendi + kaydedilen listeler, 14a hesap,
14b bildirim kanallari ve derin baglanti. Gecici DB; ag yok.
"""
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_notify
from api import rankit_rank
from api.auth import get_optional_user

ME, FRIEND, OTHER = 1, 2, 3
ARS, CHE, TOT = 1, 2, 3


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_websurf_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    now = utcnow()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 61)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Football','FA Cup','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,'Football',?,?)",
                      [(ARS, "Arsenal", "ARS"), (CHE, "Chelsea", "CHE"), (TOT, "Tottenham", "TOT")] +
                      [(10 + i, f"Club {i} FC", f"C{i}") for i in range(25)])
        games = [(1, 1, ARS, CHE, -20, "finished", 2, 0), (2, 1, TOT, ARS, -10, "finished", 1, 3),
                 (3, 1, CHE, TOT, -5, "finished", 1, 1), (4, 1, ARS, TOT, 3, "upcoming", None, None),
                 (5, 2, ARS, CHE, -15, "finished", 1, 0)]
        for mid, comp, home, away, days, status, hs, aws in games:
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',?,'2026-27',?,?,?,?,?,?,'fotmob')""",
                      (mid, comp, iso(now + timedelta(days=days)), status, home, away, hs, aws))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def crowd(match_id, rating, voters=20, start=20, classic=0):
    with DB.get_conn() as c:
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,classic,visibility)
                         VALUES(?,?,'2026-09-01',?,?,'public')""",
                      [(u, match_id, rating, classic) for u in range(start, start + voters)])


def follow(a, kind, b):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,?,?)", (a, kind, b))


# ── 11c arama ────────────────────────────────────────────────────────────────

def test_search_reports_real_totals_and_rich_rows(db):
    crowd(1, 4.6); crowd(2, 3.0); crowd(3, 4.9, voters=19)
    follow(ME, "team", ARS); follow(ME, "user", FRIEND); follow(FRIEND, "user", ME)
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0})
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0, "visibility": "private"})
    client(OTHER).post("/api/rankit/lists", json={"title": "Arsenal nights", "match_ids": [1, 2]})
    many = client().get("/api/rankit/search?q=FC").json()
    assert len(many["teams"]) == 20 and many["counts"]["teams"] == 25
    found = client().get("/api/rankit/search?q=Arsenal").json()
    arsenal = found["teams"][0]
    assert (arsenal["season_avg_heat"], arsenal["season_heat_matches"]) == (3.8, 2)   # (4.6 + 3.0) / 2
    assert arsenal["season_competition"]["name"] == "Premier League" and arsenal["following"] is True
    assert found["lists"][0]["username"] == "user3" and found["counts"]["lists"] == 1
    assert found["counts"]["matches"] == 4
    people = client().get("/api/rankit/search?q=user2").json()
    friend = people["members"][0]
    assert friend["following"] is True and friend["follows_you"] is True
    club_people = client().get("/api/rankit/search?q=Arsenal&kind=All").json()
    assert club_people["members"] == []                                  # "Arsenal" kullanici adina uymuyor
    hottest = [m["id"] for m in client().get("/api/rankit/search?q=Arsenal&match_sort=hottest").json()["matches"]]
    assert hottest[:2] == [1, 2]                                         # 4.6, 3.0; esik altlari sonda


def test_member_rows_count_club_matches_they_logged_visibly(db):
    follow(ME, "user", FRIEND)
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0})
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 5, "rating": 4.0})
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0, "visibility": "private"})
    with DB.get_conn() as c:
        c.execute("UPDATE users SET username='arsenal_fan' WHERE id=?", (FRIEND,))
    row = client().get("/api/rankit/search?q=arsenal").json()["members"][0]
    assert row["club"] == "Arsenal" and row["club_logged"] == 2          # gizli kayit sayilmaz


# ── 12a kulup cekmecesi ──────────────────────────────────────────────────────

def test_club_drawer_has_season_logged_hottest_and_next(db):
    crowd(1, 4.6, classic=1); crowd(2, 3.0, voters=19)                  # 2. mac esik alti
    follow(ME, "team", ARS)
    client().post("/api/rankit/diary", json={"match_id": 1, "rating": 5.0, "classic": True})
    client().post("/api/rankit/diary", json={"match_id": 5, "rating": 3.0})
    body = client().get(f"/api/rankit/teams/{ARS}").json()
    season = body["season"]
    assert season["season_competition"]["name"] == "Premier League" and season["played"] == 2
    assert season["position"] == 1 and season["classics"] == 1
    assert (season["season_avg_heat"], season["season_heat_matches"]) == (4.6, 1)
    assert body["logged"] == 2 and body["venue"] is None
    assert [m["id"] for m in body["hottest"]] == [1]
    assert body["next"]["id"] == 4 and body["next"]["collections"] == ["The 4"]   # 3 takim: 2 x 2


# ── 12b listeler ─────────────────────────────────────────────────────────────

def test_my_lists_show_owned_with_counts_and_saved_from_others(db):
    api = client()
    mine = api.post("/api/rankit/lists", json={"title": "Derbies", "match_ids": [1, 2]}).json()["list_id"]
    api.post("/api/rankit/lists", json={"title": "Secret", "visibility": "private", "match_ids": [3]})
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0})
    client(FRIEND).post(f"/api/rankit/lists/{mine}/respect")
    theirs = client(FRIEND).post("/api/rankit/lists", json={"title": "The 38", "match_ids": [1]}).json()["list_id"]
    hidden = client(OTHER).post("/api/rankit/lists", json={"title": "Followers only", "visibility": "followers",
                                                          "match_ids": [2]}).json()["list_id"]
    follow(ME, "user", OTHER)
    api.post(f"/api/rankit/lists/{theirs}/save")
    api.post(f"/api/rankit/lists/{hidden}/save")
    body = api.get("/api/rankit/lists/mine").json()
    owned = {l["title"]: l for l in body["owned"]}
    assert set(owned) == {"Derbies", "Secret"}
    assert (owned["Derbies"]["match_count"], owned["Derbies"]["rated"], owned["Derbies"]["respect"]) == (2, 1, 1)
    assert [(l["title"], l["username"]) for l in body["saved"]] == [("Followers only", "user3"), ("The 38", "user2")]
    with DB.get_conn() as c:
        c.execute("DELETE FROM rankit_follows WHERE user_id=? AND target_id=?", (ME, OTHER))
    assert [l["title"] for l in api.get("/api/rankit/lists/mine").json()["saved"]] == ["The 38"]


# ── 14a / 14b ────────────────────────────────────────────────────────────────

def test_first_run_shows_the_connected_account(db):
    body = client().get("/api/rankit/onboarding").json()
    assert body["account"] == {"username": "user1", "email": "u1@t"} and body["primary_arch_connections"] is None


def test_notifications_carry_channels_and_deep_links(db):
    entry = client().post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "review": "Great"}).json()["entry_id"]
    client(FRIEND).post(f"/api/rankit/reviews/{entry}/comments", json={"content": "Agreed"})
    with DB.get_conn() as c:
        rankit_notify.notify(c, ME, "broadcast", match_id=4, detail="Sky Sports")
    items = {i["kind"]: i for i in client().get("/api/rankit/notifications").json()["items"]}
    assert items["reply"]["channel"] == "social" and items["reply"]["entry_id"] == entry
    assert items["broadcast"]["channel"] == "heat"
