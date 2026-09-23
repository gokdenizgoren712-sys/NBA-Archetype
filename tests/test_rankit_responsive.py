# -*- coding: utf-8 -*-
"""Faz 17 -- responsive (API payi): yanit cihaza gore degismez. §25 "At 820
and below, web should be indistinguishable in behaviour from the app" --
ayni uc telefon ve masaustu tarayicisina ayni yuku doner; telefon agi icin
JSON gzip'le sikistirilir. Gecici DB; ag yok.
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

PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"
DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_responsive_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(1,'a@t','selin','x')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,'Football',?,?)",
                      [(i, f"Club {i}", f"C{i}") for i in range(1, 21)])
        for mid in range(1, 41):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,stage,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',?,?,?,1,0,'fotmob')""",
                      (mid, f"2026-08-{(mid % 28) + 1:02d}T{mid % 24:02d}:00:00Z", f"Matchday {mid // 10 + 1}",
                       (mid % 20) + 1, ((mid + 7) % 20) + 1))
        rankit_rank.seed_rules(c)
    return path


PATHS = ["/api/rankit/home?tz_offset=0", "/api/rankit/catalog?limit=40&facets=true", "/api/rankit/matches/1",
         "/api/rankit/competitions/1", "/api/rankit/competitions/1/heatmap", "/api/rankit/collections",
         "/api/rankit/search?q=Club", "/api/rankit/shelf"]


def test_the_same_endpoint_returns_the_same_payload_to_phone_and_desktop(db):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": "1"}
    api = TestClient(app)
    for path in PATHS:
        phone = api.get(path, headers={"User-Agent": PHONE})
        desktop = api.get(path, headers={"User-Agent": DESKTOP})
        assert phone.status_code == desktop.status_code == 200, path
        assert phone.json() == desktop.json(), path


def test_json_is_compressed_for_phone_networks(db):
    from api.main import app
    api = TestClient(app)
    response = api.get("/api/rankit/catalog?limit=40", headers={"Accept-Encoding": "gzip", "User-Agent": PHONE})
    assert response.status_code == 200 and response.headers.get("content-encoding") == "gzip"
    assert len(response.json()["matches"]) == 40
