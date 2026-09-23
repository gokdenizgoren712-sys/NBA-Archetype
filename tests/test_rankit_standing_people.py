# -*- coding: utf-8 -*-
"""Faz 9.1-9.3 -- 6b/2p (respect puani geri alinabilir, ver/geri al ile
uretilemez; 2p dokumu toplamla tutar), 9a/9b (on ortak mac altinda sira
alfabe degil ortak mac sayisi), 3d (POTM onde: WON / SHARE, 20 oy esigi).
Gecici DB; ag yok.
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

AUTHOR, FAN = 1, 2


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_standing_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    names = {1: "author", 2: "fan", 3: "alpha", 4: "bravo", 5: "charlie"}
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", names.get(i, f"voter{i}")) for i in range(1, 61)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Football','Serie A','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Chelsea','CHE'),(2,'Football','Sporting','SCP')")
        for mid in range(1, 9):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',?,'2026-27',?,'finished',1,2,1,0,'fotmob')""",
                      (mid, 2 if mid == 8 else 1, f"2026-08-{10 + mid}T19:00:00Z"))
        rankit_rank.seed_rules(c)
    return path


def client(uid):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def respect_points(entry):
    with DB.get_conn() as c:
        row = c.execute("""SELECT points FROM rankit_points WHERE user_id=? AND kind='respect'
                           AND subject_type='review' AND subject_id=?""", (AUTHOR, entry)).fetchone()
    return row[0] if row else 0


def review():
    out = client(AUTHOR).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "review": "Great"})
    return out.json()["entry_id"]


# ── 9.1: respect puani ───────────────────────────────────────────────────────

def test_taking_respect_back_takes_the_points_back(db):
    entry = review()
    fan = client(FAN)
    fan.post(f"/api/rankit/reviews/{entry}/like")
    assert respect_points(entry) == 2
    fan.post(f"/api/rankit/reviews/{entry}/like")                    # geri al
    assert respect_points(entry) == 0                                 # eskiden 4
    for _ in range(5):                                                # ver / geri al
        fan.post(f"/api/rankit/reviews/{entry}/like")
    assert respect_points(entry) == 2                                 # tek kisi = tek respect


def test_respect_points_stop_at_the_cap(db):
    entry = review()
    for uid in range(10, 45):
        client(uid).post(f"/api/rankit/reviews/{entry}/like")
    assert respect_points(entry) == rankit_rank.RESPECT_CAP_PER_REVIEW


def test_standing_breakdown_adds_up_to_the_total(db):
    entry = review()                                                  # gec puanlama: rate_late
    for uid in (10, 11, 12):
        client(uid).post(f"/api/rankit/reviews/{entry}/like")
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_points(user_id,kind,points,subject_type,subject_id)
                     VALUES(?,'companion',20,'match',2)""", (AUTHOR,))
    rank = client(AUTHOR).get("/api/rankit/rank").json()
    rows = {r["kind"]: r for r in rank["breakdown"]}
    assert rows["respect"]["count"] == 3 and rows["respect"]["points"] == 6   # uc respect, bir defter satiri
    assert rows["rate_late"]["count"] == 1
    assert sum(r["points"] for r in rank["breakdown"]) == rank["rank"]["points"]


# ── 9.2: esik altinda sira ortak mac sayisi ──────────────────────────────────

def test_people_below_the_threshold_sort_by_shared_matches_not_names(db):
    with DB.get_conn() as c:
        def rate(uid, matches):
            c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                             VALUES(?,?,'2026-08-20',4.0,'public')""", [(uid, m) for m in matches])
        rate(AUTHOR, range(1, 7))
        rate(3, range(1, 4))              # alpha: 3 ortak
        rate(4, range(1, 7))              # bravo: 6 ortak
        c.executemany("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'user',?)",
                      [(AUTHOR, 3), (AUTHOR, 4), (AUTHOR, 5)])
    people = client(AUTHOR).get("/api/rankit/people?kind=following").json()["people"]
    assert [p["username"] for p in people] == ["bravo", "alpha", "charlie"]
    assert all(p["overlap"]["pct"] is None for p in people)          # on macin altinda yuzde yok
    found = client(AUTHOR).get("/api/rankit/people/discover").json()["people"]
    assert [p["username"] for p in found] == ["bravo", "alpha"]


# ── 9.3: 3d POTM onde ────────────────────────────────────────────────────────

def test_competition_players_lead_with_potm_won_and_share(db):
    with DB.get_conn() as c:
        c.executemany("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(?,'Football',1,?)",
                      [(101, "Palmer"), (102, "Enzo"), (103, "Neto"), (104, "Low Sample")])
        voter = iter(range(10, 61))

        def vote(match, player, n):
            c.executemany("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,?,?)",
                          [(next(voter), match, player) for _ in range(n)])
        vote(2, 101, 12); vote(2, 102, 8)                      # 20 secmen: Palmer
        voter = iter(range(10, 61))
        vote(3, 102, 14); vote(3, 101, 5); vote(3, 103, 1)     # 20 secmen: Enzo
        voter = iter(range(10, 61))
        vote(4, 104, 10)                                       # 10 secmen: esik alti
        # Neto 2. macta oynadi ama oy almadi: payi o macta 0.
        c.execute("""INSERT INTO rankit_match_lineup_players(match_id,team_id,name,role,ord,player_id)
                     VALUES(2,1,'Neto','start',9,103)""")
        c.execute("""INSERT INTO rankit_player_stats(competition_id,season,stat,rank,name,value)
                     VALUES(1,'2026-27','goals',1,'Palmer',5)""")
    body = client(AUTHOR).get("/api/rankit/competitions/1/players").json()
    assert body["stat"] == "potm" and body["available"] == ["potm", "goals"] and body["min_votes"] == 20
    rows = [(r["name"], r["won"], r["share"], r["matches"]) for r in body["players"]]
    assert rows == [("Enzo", 1, 0.55, 2), ("Palmer", 1, 0.425, 2), ("Neto", 0, 0.025, 2)]
    assert client(AUTHOR).get("/api/rankit/competitions/1/players?stat=goals").json()["players"][0]["name"] == "Palmer"


def test_without_a_decided_vote_the_tab_falls_back_to_the_feed(db):
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_player_stats(competition_id,season,stat,rank,name,value)
                     VALUES(2,'2026-27','goals',1,'Lautaro',4)""")
    body = client(AUTHOR).get("/api/rankit/competitions/2/players").json()
    assert body["stat"] == "goals" and body["available"] == ["goals"]
