# -*- coding: utf-8 -*-
"""Faz 12 -- markalar (API payi): sahte yayinci ya da yanlis arma yok.
Eski serbest metin yayinci sutunu (yalnizca demo tohumunun uydurma kanallari)
canlida yanita girmez; NBA armasi yalniz NBA takimina eslenir. Gecici DB; ag
yok (NBA eslemesi nba_api'nin statik takim listesinden).
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


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_marks_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(1,'a@t','selin','x')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Basketball','NBA','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Basketball','EuroLeague','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,'Basketball',?,?)",
                      [(1, "Milwaukee Bucks", "MIL"), (2, "Boston Celtics", "BOS"),
                       (3, "Olimpia Milano", "MIL"), (4, "Real Madrid", "RMB")])
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
                     home_score,away_score,provider,broadcaster)
                     VALUES(1,'Basketball',1,'2026-27','2026-09-20T00:00:00Z','finished',1,2,110,104,NULL,'TRT 1')""")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
                     home_score,away_score,provider)
                     VALUES(2,'Basketball',2,'2026-27','2026-09-21T18:00:00Z','finished',3,4,80,78,'euroleague')""")
        rankit_rank.seed_rules(c)
    return path


def client():
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": "1"}
    return TestClient(app)


def test_the_unverified_free_text_broadcaster_never_reaches_production(db, monkeypatch):
    assert client().get("/api/rankit/matches/1").json()["broadcaster"] == "TRT 1"     # yerel demo
    monkeypatch.setattr(RK, "IS_PROD", True)
    assert client().get("/api/rankit/matches/1").json()["broadcaster"] is None


def test_nba_crests_go_only_to_nba_teams(db):
    RK.backfill_rankit_team_logos()
    with DB.get_conn() as c:
        logos = {r[0]: r[1] for r in c.execute("SELECT team_id, logo_url FROM rankit_team_logos")}
    assert "cdn.nba.com" in logos[1] and "cdn.nba.com" in logos[2]
    assert 3 not in logos and 4 not in logos        # "MIL" carpismasi Milano'ya Bucks armasi vermez
