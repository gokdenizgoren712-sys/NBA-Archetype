# -*- coding: utf-8 -*-
"""Faz 15 -- masaustunun kazandigi uc ekran: 7f raf (siralar, sayfalama,
sayilar, gorunurluk), 7g sezon isi haritasi (tablo sirasi, §5.5 kesikli
hucre, "sen kaydettin" elmasi, ozet), 7h okuma (Following, etiketler, puan
dagilimi). Gecici DB; ag yok.
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
ARS, CHE, TOT, EVE = 1, 2, 3, 4


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_desktop_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 61)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Football','FA Cup','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,'Football',?,?)",
                      [(ARS, "Arsenal", "ARS"), (CHE, "Chelsea", "CHE"), (TOT, "Tottenham", "TOT"), (EVE, "Everton", "EVE")])
        games = [  # id, comp, stage, home, away, hs, as, status, day
            (1, 1, "Matchday 1", ARS, CHE, 2, 0, "finished", 10),
            (2, 1, "Matchday 1", TOT, EVE, 2, 0, "finished", 10),
            (3, 1, "Matchday 2", CHE, TOT, 3, 1, "finished", 17),
            (4, 1, "Matchday 2", EVE, ARS, 0, 1, "finished", 17),
            (5, 1, "Matchday 3", ARS, TOT, None, None, "upcoming", 24),
            (6, 2, "Round 3", ARS, EVE, 2, 1, "finished", 12),
        ]
        for mid, comp, stage, home, away, hs, aws, status, day in games:
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,stage,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',?,'2026-27',?,?,?,?,?,?,?,'fotmob')""",
                      (mid, comp, f"2026-09-{day:02d}T15:00:00Z", status, stage, home, away, hs, aws))
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
                         VALUES(?,?,'2026-09-20',?,?,'public')""",
                      [(u, match_id, rating, classic) for u in range(start, start + voters)])


# ── 7f: raf ──────────────────────────────────────────────────────────────────

def test_shelf_sorts_counts_pages_and_respects_visibility(db):
    api = client()
    for mid, rating, classic, day in ((1, 3.0, False, "2026-09-10"), (3, 5.0, True, "2026-09-17"),
                                      (6, 4.0, False, "2026-09-12"), (2, 2.0, False, "2026-09-11")):
        api.post("/api/rankit/diary", json={"match_id": mid, "rating": rating, "classic": classic,
                                            "watched_date": day, "visibility": "private" if mid == 2 else "public"})
    mine = api.get("/api/rankit/shelf").json()
    assert [c["id"] for c in mine["cards"]] == [3, 6, 2, 1]                      # en yeni once
    assert mine["counts"] == {"cards": 4, "classic_cards": 1}
    assert [c["id"] for c in api.get("/api/rankit/shelf?sort=rating").json()["cards"]] == [3, 6, 1, 2]
    assert [c["id"] for c in api.get("/api/rankit/shelf?sort=classics").json()["cards"]] == [3]
    by_comp = api.get("/api/rankit/shelf?sort=competition").json()["cards"]
    assert [c["competition"] for c in by_comp] == ["FA Cup", "Premier League", "Premier League", "Premier League"]
    page = api.get("/api/rankit/shelf?limit=3").json()
    assert len(page["cards"]) == 3 and page["next_offset"] == 3
    assert page["cards"][0]["entry"]["rating"] == 5.0 and page["cards"][0]["entry"]["classic"] is True
    theirs = client(OTHER).get(f"/api/rankit/shelf?member_id={ME}").json()
    assert [c["id"] for c in theirs["cards"]] == [3, 6, 1] and theirs["counts"]["cards"] == 3   # gizli yok
    with DB.get_conn() as c:
        c.execute("UPDATE users SET is_banned=1 WHERE id=?", (ME,))
    assert client(OTHER).get(f"/api/rankit/shelf?member_id={ME}").status_code == 404


# ── 7g: sezon isi haritasi ───────────────────────────────────────────────────

def test_heatmap_rows_follow_the_table_and_cells_are_honest(db):
    crowd(1, 4.5); crowd(3, 4.0); crowd(4, 3.0, voters=19)
    client().post("/api/rankit/diary", json={"match_id": 3})          # kaydettin (yildizsiz da)
    body = client().get("/api/rankit/competitions/1/heatmap").json()
    assert body["available"] is True and body["weeks"] == [1, 2, 3]
    # Tablo sirasi (alfabetik degil): Tottenham, Everton'un onunde.
    assert [c["team"]["name"] for c in body["clubs"]] == ["Arsenal", "Chelsea", "Tottenham", "Everton"]
    arsenal = {cell["week"]: cell for cell in body["clubs"][0]["cells"]}
    assert (arsenal[1]["state"], arsenal[1]["heat"]) == ("heat", 4.5)
    assert arsenal[2]["state"] == "too_few" and arsenal[2]["heat"] is None       # 19 puan: kesikli, renk yok
    assert arsenal[3]["state"] == "unplayed"
    chelsea = {cell["week"]: cell for cell in body["clubs"][1]["cells"]}
    assert chelsea[2]["logged"] is True and arsenal[1]["logged"] is False
    summary = body["summary"]
    assert summary["best_week"] == {"week": 1, "heat": 4.5} and summary["hot_weeks"] == 2
    assert summary["logged"] == 1
    assert client().get("/api/rankit/competitions/2/heatmap").json()["available"] is True  # "Round 3" haftasi


# ── 7h: iki sutunlu okuma ────────────────────────────────────────────────────

def test_review_reading_has_following_tags_and_spread(db):
    crowd(1, 4.5, voters=12, start=20)
    crowd(1, 2.0, voters=8, start=40)
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'user',?)", (ME, OTHER))
    client(OTHER).post("/api/rankit/diary", json={"match_id": 1, "rating": 5.0, "review": "Loud", "tags": ["Atmosphere"]})
    client(3).post("/api/rankit/diary", json={"match_id": 1, "rating": 3.0, "review": "Fine", "tags": ["Atmosphere", "Refereeing"]})
    api = client()
    everything = api.get("/api/rankit/matches/1/reviews").json()
    assert everything["total"] == 2
    following = api.get("/api/rankit/matches/1/reviews?scope=following").json()
    assert following["total"] == 1 and [r["username"] for r in following["followed"] + following["everyone"]] == ["user2"]
    assert everything["top_tags"][0] == {"tag": "Atmosphere", "count": 2}
    assert everything["spread"] == {"1": 0, "2": 8, "3": 1, "4": 0, "5": 13} and everything["rating_count"] == 22
    assert everything["community_rating"] is not None
    with DB.get_conn() as c:
        c.execute("DELETE FROM rankit_diary_entries WHERE user_id>=40")
    thin = api.get("/api/rankit/matches/1/reviews").json()
    assert thin["spread"] is None and thin["community_rating"] is None and thin["rating_count"] == 14
