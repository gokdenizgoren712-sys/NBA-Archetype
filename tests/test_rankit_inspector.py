# -*- coding: utf-8 -*-
"""Faz 14 -- Inspector'in bes evresi (16c, 15w, 7b, 15x, 7c, 16a, 7d, 16b):
ayni mac nesnesi, sekmeler degismez, yalnizca icerik ve izinler. Tek bir mac
evreden evreye tasinip her evrede yanitlar ve izinler kabul ediliyor. Ayrica
15z "saves as you type": puan alani gonderilmeyen otomatik kayit puana
dokunmaz. Gecici DB; ag yok.
"""
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_live_sync as LS
from api import rankit_rank
from api.auth import get_optional_user

ME, M = 1, 1
LINEUP = {"lineup": {
    "homeTeam": {"formation": "4-3-3", "starters": [{"id": 11, "name": "Raya", "shirtNumber": "1", "positionId": 11}],
                 "subs": [{"id": 19, "name": "Trossard", "shirtNumber": "19", "performance": {}}]},
    "awayTeam": {"formation": "4-4-2", "starters": [{"id": 21, "name": "Vicario", "shirtNumber": "1", "positionId": 11}],
                 "subs": []}}}


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_inspector_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 31)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT')")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,home_team_id,away_team_id,provider)
                     VALUES(1,'Football',1,'2026-27',?,'upcoming',1,2,'fotmob')""", (iso(utcnow() + timedelta(hours=2)),))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def sheet(uid=ME):
    api = client(uid)
    return api.get(f"/api/rankit/matches/{M}").json(), api.get(f"/api/rankit/matches/{M}/companion").json()


def set_match(**cols):
    with DB.get_conn() as c:
        sets = ",".join(f"{k}=?" for k in cols)
        c.execute(f"UPDATE rankit_matches SET {sets} WHERE id=?", (*cols.values(), M))


def player(name):
    with DB.get_conn() as c:
        return c.execute("SELECT id FROM rankit_players WHERE name=?", (name,)).fetchone()[0]


def test_one_match_through_all_five_phases(db):
    api = client()

    # ── Scheduled, no XI (16c / 16a) ─────────────────────────────────────────
    match, companion = sheet()
    assert match["status"] == "upcoming" and match["lineups"] == [] and match["events"] is None
    assert match["score"] is None                        # oynanmamis macin skoru yok
    assert match["live_minute"] is None and match["community_rating"] is None
    for uid in range(2, 22):
        client(uid).put(f"/api/rankit/matches/{M}/appetite", json={"appetite": 4})
    assert client().get(f"/api/rankit/matches/{M}").json()["expected_heat"] == 4.0
    assert api.post("/api/rankit/diary", json={"match_id": M, "rating": 4.0}).status_code == 409   # yildizlar tam zamanda
    assert api.post(f"/api/rankit/matches/{M}/pulse", json={"value": 4}).status_code == 409        # canli okuma canlida
    assert companion["room_open"] is True and companion["record"] is None

    # ── XI announced: kadro, squad notunun yerine ────────────────────────────
    with DB.get_conn() as c:
        LS._store_lineups_from(c, {"id": M, "home_team_id": 1, "away_team_id": 2}, LINEUP)
    assert client().get(f"/api/rankit/matches/{M}").json()["lineups"]
    # Baslama saati gecti, saglayici hala "upcoming" diyor: beklenti kapandi.
    set_match(starts_at=iso(utcnow() - timedelta(minutes=2)))
    assert api.put(f"/api/rankit/matches/{M}/appetite", json={"appetite": 5}).status_code == 409

    # ── Live (15w / 7d) ──────────────────────────────────────────────────────
    set_match(status="live", live_minute="12‎’‎", events_polled_at="2026-09-22 19:12:00",
              home_score=1, away_score=0)
    match, companion = sheet()
    assert match["live_minute"] == "12'" and match["live_updated_at"] == "2026-09-22 19:12:00"
    assert match["score"] == "1 – 0"
    assert match["events"] is None                     # §9.2: anlar Companion'da
    assert match["expected_heat"] is None              # beklenti bitti
    assert api.post("/api/rankit/diary", json={"match_id": M, "rating": 4.0}).status_code == 409
    assert api.post(f"/api/rankit/matches/{M}/pulse", json={"value": 4}).status_code == 200
    assert companion["badge"] == "LIVE" and companion["room_open"] is True

    # ── Full time, unrated (15x / 16b) ───────────────────────────────────────
    set_match(status="finished", home_score=2, away_score=0)
    match, companion = sheet()
    assert match["events"] == [] and match["events_checked"] is True      # kadro okundu, olay yok
    assert match["live_minute"] is None and match["live_updated_at"] is None
    assert companion["room_open"] is False and companion["badge"] is None
    assert api.post(f"/api/rankit/matches/{M}/pulse", json={"value": 4}).status_code == 409
    assert api.post(f"/api/rankit/matches/{M}/potm", json={"player_id": player("Raya")}).status_code == 403
    assert match["my_rating"] is None

    # ── Full time, rated (7b / 7c) ───────────────────────────────────────────
    saved = api.post("/api/rankit/diary", json={"match_id": M, "rating": 4.0, "tz_offset": 0}).json()
    assert saved["ok"] and client().get(f"/api/rankit/matches/{M}").json()["my_rating"] == 4.0
    assert api.post(f"/api/rankit/matches/{M}/potm", json={"player_id": player("Raya")}).status_code == 200
    assert api.post(f"/api/rankit/matches/{M}/potm", json={"player_id": player("Trossard")}).status_code == 422  # oynamadi
    for uid in range(2, 22):
        client(uid).post("/api/rankit/diary", json={"match_id": M, "rating": 5.0})
    crowd = client().get(f"/api/rankit/matches/{M}").json()
    assert crowd["community_rating"] is not None and crowd["rating_count"] == 21


def test_composer_autosave_does_not_touch_the_rating(db):
    set_match(status="finished", starts_at=iso(utcnow() - timedelta(hours=3)), home_score=1, away_score=1)
    api = client()
    entry = api.post("/api/rankit/diary", json={"match_id": M, "rating": 4.5}).json()["entry_id"]
    with DB.get_conn() as c:
        before = c.execute("SELECT COALESCE(SUM(points),0) FROM rankit_points WHERE user_id=?", (ME,)).fetchone()[0]
    for text in ("S", "St", "Stayed on my feet"):                       # yazdikca kaydeder
        assert api.put(f"/api/rankit/diary/{entry}", json={"match_id": M, "review": text}).status_code == 200
    with DB.get_conn() as c:
        rating, review, rated_at = c.execute("SELECT rating, review, rated_at FROM rankit_diary_entries WHERE id=?",
                                             (entry,)).fetchone()
        after = c.execute("SELECT COALESCE(SUM(points),0) FROM rankit_points WHERE user_id=?", (ME,)).fetchone()[0]
    assert (rating, review) == (4.5, "Stayed on my feet") and rated_at and after == before
    # Acik null hala "puani kaldir".
    api.put(f"/api/rankit/diary/{entry}", json={"match_id": M, "rating": None})
    with DB.get_conn() as c:
        assert c.execute("SELECT rating FROM rankit_diary_entries WHERE id=?", (entry,)).fetchone()[0] is None
