# -*- coding: utf-8 -*-
"""Codex'in ONARIM'e biraktigi backend istekleri: 6d gecenin tum sohbeti
(sayfalama), 2f bitmis macta olaylar (taraf bilgisiyle, canliyken yok),
4a / 5c sahiplik (user_id, is_mine). Gecici DB; ag yok.
"""
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_live_sync as LS
from api import rankit_rank
from api.auth import get_optional_user

ME, OTHER = 1, 2


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_codexreq_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(1, "a@t", "selin"), (2, "b@t", "deniz")])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT')")
        for mid, status in ((1, "finished"), (2, "live"), (3, "finished")):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
                         home_score,away_score,provider) VALUES(?,'Football',1,'2026-27',?,?,1,2,3,1,'fotmob')""",
                      (mid, f"2026-09-1{mid}T15:30:00Z", status))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


# ── 6d: gecenin tum sohbeti ──────────────────────────────────────────────────

def test_the_whole_thread_can_be_read_page_by_page(db):
    with DB.get_conn() as c:
        c.executemany("INSERT INTO rankit_watchalong_messages(match_id,user_id,room,content) VALUES(1,1,'community',?)",
                      [(f"m{i}",) for i in range(250)])
    api = client()
    first = api.get("/api/rankit/matches/1/watchalong").json()
    assert len(first["messages"]) == 100 and first["has_more"] is True
    assert first["messages"][-1]["content"] == "m249"                   # eskiden yeniye
    seen, page = [], first
    while True:
        seen = [m["content"] for m in page["messages"]] + seen
        if not page["has_more"]:
            break
        page = api.get(f"/api/rankit/matches/1/watchalong?before_id={page['next_before_id']}").json()
    assert seen == [f"m{i}" for i in range(250)]                          # hepsi, bir kez, sirayla


# ── 2f: bitmis macta olaylar ─────────────────────────────────────────────────

def test_finished_match_carries_events_with_sides_live_does_not(db):
    with DB.get_conn() as c:
        LS._store_moments(c, 1, [
            {"type": "Goal", "time": 71, "nameStr": "Saka", "isHome": True},
            {"type": "Card", "time": 40, "card": "Red", "nameStr": "Romero", "isHome": False},
        ])
        c.execute("INSERT INTO rankit_match_lineups(match_id,team_id,side) VALUES(1,1,'home')")
        c.execute("""INSERT INTO rankit_match_lineup_players(match_id,team_id,name,role,ord,sub_in,replaced)
                     VALUES(1,1,'Trossard','bench',1,63,'Martinelli')""")
        LS._store_moments(c, 2, [{"type": "Goal", "time": 10, "nameStr": "Palmer", "isHome": True}])
    body = client().get("/api/rankit/matches/1").json()
    assert [(e["minute"], e["kind"], e["side"]) for e in body["events"]] == [
        (40, "card", "away"), (63, "substitution", "home"), (71, "goal", "home")]
    assert body["events"][1]["label"] == "Trossard for Martinelli" and body["events_checked"] is True
    live = client().get("/api/rankit/matches/2").json()
    assert live["events"] is None                                        # §9.2: canliyken Companion'da
    quiet = client().get("/api/rankit/matches/3").json()
    assert quiet["events"] == [] and quiet["events_checked"] is False     # bilinmiyor, "golsuz" degil


def test_an_old_moment_gets_its_side_when_seen_again(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_moments(match_id,minute,kind,label,detail) VALUES(1,71,'goal','Goal - Saka','Saka')")
        LS._store_moments(c, 1, [{"type": "Goal", "time": 71, "nameStr": "Saka", "isHome": True}])
        rows = c.execute("SELECT side FROM rankit_moments WHERE match_id=1").fetchall()
    assert [r[0] for r in rows] == ["home"]


# ── 4a / 5c: sahiplik sunucudan ──────────────────────────────────────────────

def test_ownership_comes_from_the_server(db):
    entry = client().post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "review": "Great"}).json()["entry_id"]
    client(OTHER).post(f"/api/rankit/reviews/{entry}/comments", json={"content": "Agreed"})
    mine = client().get(f"/api/rankit/reviews/{entry}/thread").json()
    assert mine["review"]["user_id"] == ME and mine["review"]["is_mine"] is True
    assert mine["replies"][0]["is_mine"] is False
    theirs = client(OTHER).get(f"/api/rankit/reviews/{entry}/thread").json()
    assert theirs["review"]["is_mine"] is False and theirs["replies"][0]["is_mine"] is True
    listed = client().get("/api/rankit/matches/1/reviews").json()
    assert (listed["followed"] + listed["everyone"])[0]["is_mine"] is True
