# -*- coding: utf-8 -*-
"""Faz 18 -- kapanis: §26 "20-rating threshold respected everywhere heat
appears". Isi gosteren HER yuzey ayni esikle: 19'da sayi yok (sayac var),
20'de sayi var. Tek testte butun yuzeyler; yeni bir isi yuzeyi eklenince
buraya da eklenmeli. Gecici DB; ag yok.
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

ME = 1
ARS, TOT = 1, 2
PLAYED, NEXT = 1, 2


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_closeout_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 61)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT')")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,stage,
                     home_team_id,away_team_id,home_score,away_score,provider)
                     VALUES(?,'Football',1,'2026-27',?,'finished','Matchday 1',1,2,3,1,'fotmob')""",
                  (PLAYED, iso(utcnow() - timedelta(days=2))))
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,stage,
                     home_team_id,away_team_id,provider)
                     VALUES(?,'Football',1,'2026-27',?,'upcoming','Matchday 2',2,1,'fotmob')""",
                  (NEXT, iso(utcnow() + timedelta(days=3))))
        c.execute("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(10,'Football',1,'Saka')")
        c.execute("INSERT INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,10,1)", (PLAYED,))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def raters(count, first=20):
    """Topluluk puani + Classic damgasi + POTM oyu + canli okuma + beklenti."""
    with DB.get_conn() as c:
        c.execute("DELETE FROM rankit_diary_entries WHERE user_id>=20")
        c.execute("DELETE FROM rankit_potm_votes WHERE user_id>=20")
        c.execute("DELETE FROM rankit_pulse_reads WHERE user_id>=20")
        c.execute("DELETE FROM rankit_watchlist WHERE user_id>=20")
        people = range(first, first + count)
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,classic,visibility)
                         VALUES(?,?,'2026-09-01',4.5,1,'public')""", [(u, PLAYED) for u in people])
        c.executemany("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,?,10)",
                      [(u, PLAYED) for u in people])
        c.executemany("INSERT INTO rankit_pulse_reads(match_id,user_id,value,minute) VALUES(?,?,4,30)",
                      [(PLAYED, u) for u in people])
        c.executemany("INSERT INTO rankit_watchlist(user_id,match_id,appetite) VALUES(?,?,4)",
                      [(u, NEXT) for u in people])


def surfaces(api):
    """Isi gosteren her yuzeyden okunan deger (None = "cok az")."""
    card = api.get(f"/api/rankit/matches/{PLAYED}").json()
    upcoming = api.get(f"/api/rankit/matches/{NEXT}").json()
    table = {r["name"]: r for r in api.get("/api/rankit/competitions/1").json()["standings"]}
    cells = {c["team"]["name"]: c["cells"][0] for c in api.get("/api/rankit/competitions/1/heatmap").json()["clubs"]}
    reviews = api.get(f"/api/rankit/matches/{PLAYED}/reviews").json()
    club = api.get("/api/rankit/search?q=Arsenal").json()["teams"][0]
    drawer = api.get(f"/api/rankit/teams/{ARS}").json()["season"]
    with DB.get_conn() as c:
        pulse_state = rankit_notify.feed(c, ME)
    companion = api.get(f"/api/rankit/matches/{PLAYED}/companion").json()
    catalog_hot = api.get("/api/rankit/catalog?min_heat=4.0").json()["total"]
    return {
        "card": card["community_rating"],
        "card_classic": card["instant_classic"],
        "card_potm": card["potm"],
        "expected": upcoming["expected_heat"],
        "table": table["Arsenal"]["avg_heat"],
        "heatmap": cells["Arsenal"]["heat"],
        "heatmap_state": cells["Arsenal"]["state"],
        "reviews": reviews["community_rating"],
        "spread": reviews["spread"],
        "club_search": club["season_avg_heat"],
        "club_drawer": drawer["season_avg_heat"],
        "pulse": companion["pulse"]["value"],
        "catalog_min_heat": catalog_hot,
        "hot_alert": [i for i in pulse_state["items"] if i["kind"] == "hot_match"],
    }


def test_twenty_rating_threshold_holds_on_every_heat_surface(db):
    api = client()
    raters(19)
    thin = surfaces(api)
    assert thin["card"] is None and thin["card_classic"] is False and thin["card_potm"] is None
    assert thin["expected"] is None and thin["table"] is None and thin["heatmap"] is None
    assert thin["heatmap_state"] == "too_few"
    assert thin["reviews"] is None and thin["spread"] is None
    assert thin["club_search"] is None and thin["club_drawer"] is None
    assert thin["pulse"] is None and thin["catalog_min_heat"] == 0 and thin["hot_alert"] == []

    raters(20)
    full = surfaces(api)
    assert full["card"] == 4.5 and full["card_classic"] is True and full["card_potm"]["name"] == "Saka"
    assert full["expected"] == 4.0 and full["table"] == 4.5 and full["heatmap"] == 4.5
    assert full["heatmap_state"] == "heat"
    assert full["reviews"] == 4.5 and sum(full["spread"].values()) == 20
    assert full["club_search"] == 4.5 and full["club_drawer"] == 4.5
    assert full["pulse"] == 4.0 and full["catalog_min_heat"] == 1
    # "Running hot" durumu izleme listesindeki puanlanmamis mac icin; sayiyi
    # TASIMAZ (§15) ama esigi asmadan hic dogmaz.
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_watchlist(user_id,match_id) VALUES(?,?)", (ME, PLAYED))
        c.execute("UPDATE rankit_matches SET starts_at=? WHERE id=?",
                  (iso(utcnow() - timedelta(hours=1)), PLAYED))
        alerts = [i for i in rankit_notify.feed(c, ME)["items"] if i["kind"] == "hot_match"]
    assert len(alerts) == 1 and "rating" not in alerts[0]
