# -*- coding: utf-8 -*-
"""Faz 9.5 -- 3h listeler: "a list is a shelf you curate". Olusturulduktan
sonra duzenlenir (baslik / gorunurluk / sira, mac cikar, listeyi sil),
olmayan mac kimligi 500 degil 404, banli sahibin listesi hicbir yuzeyde
yok, kendi listene respect yok. Gecici DB; ag yok.
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

OWNER, OTHER = 1, 2


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_lists_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(1, "o@t", "selin"), (2, "x@t", "deniz")])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT')")
        for mid in (1, 2, 3, 4):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,3,1,'fotmob')""",
                      (mid, f"2026-09-{10 + mid}T19:00:00Z"))
        rankit_rank.seed_rules(c)
    return path


def client(uid=OWNER):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def make_list(**extra):
    body = {"title": "Nights I'd watch again", "ranked": True, "match_ids": [1, 2, 3], **extra}
    out = client().post("/api/rankit/lists", json=body)
    assert out.status_code == 200, out.text
    return out.json()["list_id"]


def order(list_id):
    with DB.get_conn() as c:
        return [tuple(r) for r in c.execute(
            "SELECT match_id, position FROM rankit_list_items WHERE list_id=? ORDER BY position", (list_id,))]


def test_unknown_matches_are_refused_not_crashing(db):
    assert client().post("/api/rankit/lists", json={"title": "x", "match_ids": [1, 999]}).status_code == 404
    lid = make_list()
    assert client().post(f"/api/rankit/lists/{lid}/items", json={"match_id": 999}).status_code == 404


def test_a_list_can_be_edited_after_it_is_made(db):
    lid = make_list()
    api = client()
    assert api.put(f"/api/rankit/lists/{lid}", json={"title": "Rewatchable", "visibility": "private"}).status_code == 200
    row = api.get(f"/api/rankit/lists/{lid}").json()["list"]
    assert (row["title"], row["visibility"], row["ranked"]) == ("Rewatchable", "private", 1)
    assert client(OTHER).get(f"/api/rankit/lists/{lid}").status_code == 404          # artik gizli
    assert client(OTHER).put(f"/api/rankit/lists/{lid}", json={"title": "mine"}).status_code == 403
    assert api.put("/api/rankit/lists/999", json={"title": "x"}).status_code == 404


def test_removing_and_reordering_keep_positions_dense(db):
    lid = make_list()
    api = client()
    api.post(f"/api/rankit/lists/{lid}/items", json={"match_id": 4})
    assert api.delete(f"/api/rankit/lists/{lid}/items/2").status_code == 200
    assert order(lid) == [(1, 1), (3, 2), (4, 3)]
    assert api.delete(f"/api/rankit/lists/{lid}/items/2").status_code == 404
    assert api.put(f"/api/rankit/lists/{lid}/order", json={"match_ids": [4, 1, 3]}).status_code == 200
    assert order(lid) == [(4, 1), (1, 2), (3, 3)]
    assert [m["id"] for m in api.get(f"/api/rankit/lists/{lid}").json()["matches"]] == [4, 1, 3]
    for bad in ([4, 1], [4, 1, 3, 2], [4, 4, 1]):
        assert api.put(f"/api/rankit/lists/{lid}/order", json={"match_ids": bad}).status_code == 422
    assert client(OTHER).delete(f"/api/rankit/lists/{lid}/items/1").status_code == 403


def test_deleting_a_list(db):
    lid = make_list()
    assert client(OTHER).delete(f"/api/rankit/lists/{lid}").status_code == 403
    assert client().delete(f"/api/rankit/lists/{lid}").status_code == 200
    assert client().get(f"/api/rankit/lists/{lid}").status_code == 404


def test_no_respect_for_your_own_list(db):
    lid = make_list()
    assert client().post(f"/api/rankit/lists/{lid}/respect").status_code == 403
    assert client(OTHER).post(f"/api/rankit/lists/{lid}/respect").json() == {"respected": True, "respect": 1}


def test_a_banned_owners_lists_disappear(db):
    lid = make_list()
    with DB.get_conn() as c:
        c.execute("UPDATE users SET is_banned=1 WHERE id=?", (OWNER,))
    viewer = client(OTHER)
    assert viewer.get(f"/api/rankit/lists/{lid}").status_code == 404
    assert viewer.get("/api/rankit/lists").json()["lists"] == []
    assert viewer.get("/api/rankit/search?q=Nights").json()["lists"] == []
