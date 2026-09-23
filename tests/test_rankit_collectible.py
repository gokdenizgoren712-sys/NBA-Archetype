# -*- coding: utf-8 -*-
"""Faz 4 -- Collectible (6a / 7e): tek kayit, tekrar korumasi, oyuncular
puanla acilir, sonuc ekraninin toplamlari.

Rotalar FastAPI TestClient ile; gecici DB, canli servis yok.
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

KEY = "3f2c9a1e-7b4d-4c1e-9a55-0d6e8b2f1c77"


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_collectible_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(1,'v@t','viewer','x')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','A','A'),(2,'Football','B','B')")
        for mid in (1, 2):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,2,1,'fotmob')""",
                      (mid, f"2026-09-0{mid}T19:00:00Z"))
        for pid, name in ((1, "Saka"), (2, "Rice"), (3, "Odegaard")):
            c.execute("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(?,'Football',1,?)", (pid, name))
            c.execute("INSERT INTO rankit_match_players(match_id,player_id,team_id) VALUES(1,?,1)", (pid,))
        rankit_rank.seed_rules(c)
    return path


def client():
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": "1"}
    return TestClient(app)


def rows(sql, args=()):
    with DB.get_conn() as c:
        return c.execute(sql, args).fetchall()


# ── Tekrar korumasi (HANDOFF §4.10) ──────────────────────────────────────────

def test_rewatch_retry_with_the_same_key_updates_the_same_entry(db):
    api = client()
    body = {"match_id": 1, "rating": 4.0, "is_rewatch": True, "client_entry_id": KEY}
    first = api.post("/api/rankit/diary", json=body).json()
    retry = api.post("/api/rankit/diary", json=body).json()     # yanit kayboldu, kuyruk tekrar yolladi
    assert retry["entry_id"] == first["entry_id"] and retry["updated"] is True
    assert len(rows("SELECT id FROM rankit_diary_entries WHERE user_id=1 AND match_id=1")) == 1
    other = api.post("/api/rankit/diary", json={**body, "client_entry_id": KEY[::-1]}).json()
    assert other["entry_id"] != first["entry_id"]                # gercek ikinci izleme
    assert api.post("/api/rankit/diary", json={**body, "match_id": 2}).status_code == 409
    assert api.post("/api/rankit/diary", json={**body, "client_entry_id": "x"}).status_code == 422


def test_rating_moment_is_kept_for_the_streak(db):
    api = client()
    api.post("/api/rankit/diary", json={"match_id": 1})          # yildizsiz izleme kaydi
    assert rows("SELECT rated_at FROM rankit_diary_entries WHERE match_id=1")[0][0] is None
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 3.5})
    first = rows("SELECT rated_at FROM rankit_diary_entries WHERE match_id=1")[0][0]
    assert first is not None
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0})   # puan degisti: an kalir
    assert rows("SELECT rated_at FROM rankit_diary_entries WHERE match_id=1")[0][0] == first
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": None})  # puan kaldirildi
    assert rows("SELECT rated_at FROM rankit_diary_entries WHERE match_id=1")[0][0] is None


# ── Oyuncular puanla acilir (BUILD §9.1 / §9.3) ──────────────────────────────

def test_potm_and_respect_open_only_once_there_is_a_rating(db):
    api = client()
    api.post("/api/rankit/diary", json={"match_id": 1})          # izledi, puanlamadi
    assert api.post("/api/rankit/matches/1/potm", json={"player_id": 1}).status_code == 403
    assert api.put("/api/rankit/matches/1/respect", json={"player_ids": [2]}).status_code == 403
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.5})
    assert api.post("/api/rankit/matches/1/potm", json={"player_id": 1}).status_code == 200
    assert api.put("/api/rankit/matches/1/respect", json={"player_ids": [2]}).status_code == 200


def test_moving_potm_onto_a_respected_player_drops_that_respect(db):
    api = client()
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.5})
    api.put("/api/rankit/matches/1/respect", json={"player_ids": [2, 3]})
    api.post("/api/rankit/matches/1/potm", json={"player_id": 2})
    left = {r[0] for r in rows("SELECT player_id FROM rankit_respect_votes WHERE user_id=1 AND match_id=1")}
    assert left == {3}


# ── 6a toplamlari (BUILD §4.1) ───────────────────────────────────────────────

def test_receipt_carries_card_number_and_running_totals(db):
    api = client()
    first = api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0}).json()
    assert first["card_number"] == 1 and first["collection"] is None
    assert first["points_total"] == first["points_awarded"] > 0
    assert isinstance(first["streak_current"], int)
    second = api.post("/api/rankit/diary", json={"match_id": 2, "rating": 3.0}).json()
    assert second["card_number"] == 2
    assert second["points_total"] == first["points_awarded"] + second["points_awarded"]
    # Duzenleme puani da gonderir: API'de rating HER ZAMAN yazilir, bos gelirse
    # "puani kaldir" demektir (DiaryIn sozlesmesi).
    edit = api.post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0,
                                              "review": "Still thinking about it"}).json()
    assert edit["card_number"] == 1 and edit["points_awarded"] == 0      # ayni kart, odul bir kez
