# -*- coding: utf-8 -*-
"""Faz 9.6 -- 2j skinler: katalog ve gercek kilit durumu (Turf = bir
koleksiyonu bitir, Floodlight = 7 gecelik seri; kazanilan kalir), kayit basina
kalici skin (kart, raf, baskasinin rafi), Gilt yalniz Classic kartta.
Gecici DB; ag yok.
"""
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_rank
from api.auth import get_optional_user, require_admin

ME, OTHER = 1, 2


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_skins_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(1, "a@t", "selin"), (2, "b@t", "deniz")])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Tottenham','TOT')")
        for mid in range(1, 11):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,3,1,'fotmob')""",
                      (mid, (utcnow() - timedelta(days=40 + mid)).strftime("%Y-%m-%dT19:00:00Z")))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME, admin=False):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    if admin:
        app.dependency_overrides[require_admin] = lambda: {"sub": str(uid)}
    return TestClient(app)


def log(mid, **extra):
    return client().post("/api/rankit/diary", json={"match_id": mid, "rating": 4.0, **extra})


def skins(entry_id=None):
    url = "/api/rankit/skins" + (f"?entry_id={entry_id}" if entry_id else "")
    return {s["id"]: s for s in client().get(url).json()["skins"]}


def test_catalog_shows_what_is_locked_and_what_fits_this_card(db):
    table = skins()
    assert list(table) == ["default", "broadsheet", "holofoil", "ember", "ink", "stub",
                           "chalk", "scarf", "scoreboard", "rain", "gilt", "turf", "floodlight",
                           "premier", "laliga", "seriea", "bundesliga", "ligue1", "euroleague", "nba"]
    assert table["turf"]["locked"] and table["floodlight"]["locked"] and not table["ember"]["locked"]
    assert table["gilt"]["available"] is False                          # kart yok
    classic = log(1, classic=True).json()["entry_id"]
    assert skins(classic)["gilt"]["available"] is True
    plain = log(2).json()["entry_id"]
    assert skins(plain)["gilt"]["available"] is False


def test_a_skin_is_saved_on_the_entry_and_shows_everywhere(db):
    entry = log(1, skin="ember").json()["entry_id"]
    assert client().get("/api/rankit/matches/1").json()["my_skin"] == "ember"
    assert client().get("/api/rankit/diary").json()["entries"][0]["skin"] == "ember"
    shelf = client(OTHER).get(f"/api/rankit/members/{ME}").json()["shelf"]
    assert shelf[0]["their_skin"] == "ember"
    client().put(f"/api/rankit/diary/{entry}", json={"match_id": 1, "rating": 4.0})    # skin gonderilmedi: kalir
    assert client().get("/api/rankit/matches/1").json()["my_skin"] == "ember"
    client().put(f"/api/rankit/diary/{entry}", json={"match_id": 1, "rating": 4.0, "skin": "default"})
    assert client().get("/api/rankit/matches/1").json()["my_skin"] == "default"


def test_gilt_only_on_a_classic_card(db):
    assert log(1, skin="gilt").status_code == 422
    entry = log(2, classic=True, skin="gilt").json()["entry_id"]
    assert client().get("/api/rankit/matches/2").json()["my_skin"] == "gilt"
    # Damga kalkarsa Gilt da kalkar.
    client().put(f"/api/rankit/diary/{entry}", json={"match_id": 2, "rating": 4.0, "classic": False})
    assert client().get("/api/rankit/matches/2").json()["my_skin"] == "default"


def test_floodlight_opens_at_seven_nights_and_stays_open(db):
    assert log(1, skin="floodlight").status_code == 403
    with DB.get_conn() as c:
        rows = c.execute("SELECT id, starts_at FROM rankit_matches WHERE id BETWEEN 2 AND 8").fetchall()
        for mid, starts in rows:                                     # yedi ayri gece, gecesinde puan
            night = datetime.strptime(starts, "%Y-%m-%dT%H:%M:%SZ") + timedelta(hours=1)
            c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility,
                         created_at,rated_at) VALUES(?,?,?,4.0,'public',?,?)""",
                      (ME, mid, night.date().isoformat(), night.strftime("%Y-%m-%d %H:%M:%S"),
                       night.strftime("%Y-%m-%d %H:%M:%S")))
    assert skins()["floodlight"]["locked"] is False
    with DB.get_conn() as c:                                         # seri silinse de kilit acik kalir
        c.execute("DELETE FROM rankit_diary_entries WHERE user_id=?", (ME,))
    assert skins()["floodlight"]["locked"] is False
    assert log(9, skin="floodlight").status_code == 200


def test_turf_opens_when_a_collection_is_finished(db):
    client(admin=True).post("/api/rankit/admin/collections", json={"title": "Two derbies", "match_ids": [3, 4]})
    log(3)
    assert skins()["turf"]["locked"] is True                          # 1 / 2
    log(4)
    assert skins()["turf"]["locked"] is False                         # 2 / 2
    assert log(5, skin="turf").status_code == 200


# --- Sahibin karari 2026-09-23: 10 serbest skin + her Hunt liginin skini ---

def test_a_new_member_holds_ten_skins_and_gilt_is_not_one_of_them(db):
    table = skins()
    free = [sid for sid, s in table.items() if not s["locked"] and s["available"]]
    assert len(free) == 10, free
    assert "gilt" not in free                                         # maca gore acilir, elde degil
    assert all(table[sid]["rule"] is None for sid in free)
    for sid in free:                                                  # hepsi gercekten secilebilir
        assert log(3, skin=sid).status_code == 200, sid


def test_every_hunt_league_has_its_own_locked_skin(db):
    from api import rankit_hunt
    table = skins()
    leagues = {s["league"]: sid for sid, s in table.items() if s["league"]}
    assert set(leagues) == rankit_hunt.ROUND_ROBIN_LEAGUES | set(rankit_hunt.FIXED_SEASON_GAMES)
    for league, sid in leagues.items():
        assert table[sid]["locked"] is True, league
        assert table[sid]["rule"] == f"league:{league}"
        assert table[sid]["name"] == league


def _la_liga_season(c):
    """Iki kuluplu bir La Liga sezonu: kulup basina beklenen 2 mac (cift devre)."""
    c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(7,'Football','La Liga','2026-27')")
    c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(7,'Football','Sevilla','SEV'),(8,'Football','Betis','BET')")
    for mid, home, away in ((71, 7, 8), (72, 8, 7)):
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,home_score,away_score,provider)
                     VALUES(?,'Football',7,'2026-27',?,'finished',?,?,1,0,'fotmob')""",
                  (mid, (utcnow() - timedelta(days=5 + mid - 70)).strftime("%Y-%m-%dT19:00:00Z"), home, away))
    c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'team',7)", (ME,))


def test_finishing_a_la_liga_season_opens_la_liga_and_nothing_else(db):
    with DB.get_conn() as c:
        _la_liga_season(c)
    assert log(71, skin="laliga").status_code == 403                  # kilitli
    first = log(72)                                                    # 1/2: henuz degil
    assert skins()["laliga"]["locked"] is True
    assert first.json()["skins_unlocked"] == []
    done = client().post("/api/rankit/diary", json={"match_id": 71, "rating": 3.5}).json()
    unlocked = {s["id"] for s in done["skins_unlocked"]}
    assert "laliga" in unlocked, done["skins_unlocked"]               # 6a satiri
    table = skins()
    assert table["laliga"]["locked"] is False
    assert all(table[sid]["locked"] for sid in ("premier", "seriea", "bundesliga", "ligue1", "euroleague", "nba"))
    assert log(9, skin="laliga").status_code == 200
    # Bir sonraki puan ayni kilidi yeniden "acmaz".
    assert client().post("/api/rankit/diary", json={"match_id": 8, "rating": 3.0}).json()["skins_unlocked"] == []


def test_a_league_skin_stays_open_after_the_season_is_no_longer_complete(db):
    with DB.get_conn() as c:
        _la_liga_season(c)
    log(71); log(72)
    assert skins()["laliga"]["locked"] is False
    with DB.get_conn() as c:                                          # puanlar silinse de
        c.execute("DELETE FROM rankit_diary_entries WHERE user_id=?", (ME,))
        c.execute("DELETE FROM rankit_follows WHERE user_id=?", (ME,))
    assert skins()["laliga"]["locked"] is False


def test_unfollowing_after_finishing_still_counts(db):
    """Tamamlanma kaydi yazildiktan sonra kulup takipten cikarilirsa av listesinde
    gorunmez, ama sezon bitirilmistir."""
    with DB.get_conn() as c:
        _la_liga_season(c)
    with DB.get_conn() as c:                                          # kilit henuz yazilmadan
        for mid in (71, 72):
            c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                         VALUES(?,?,date('now'),4.0,'public')""", (ME, mid))
        from api import rankit_hunt
        col = rankit_hunt.club_season(c, 7, 7)
        c.execute("INSERT INTO rankit_collection_completions(user_id,collection_id) VALUES(?,?)", (ME, col["id"]))
        c.execute("DELETE FROM rankit_follows WHERE user_id=?", (ME,))
    assert skins()["laliga"]["locked"] is False


def test_the_collection_screen_names_its_league_skin(db):
    with DB.get_conn() as c:
        _la_liga_season(c)
    log(72)
    hunt = client().get("/api/rankit/collections").json()["collections"]
    season = next(i for i in hunt if i["kind"] == "club_season")
    detail = client().get(f"/api/rankit/collections/{season['id']}").json()
    assert detail["skin_reward"] == {"id": "laliga", "name": "La Liga", "unlocked": False}
    log(71)
    assert client().get(f"/api/rankit/collections/{season['id']}").json()["skin_reward"]["unlocked"] is True
    curated = client(admin=True).post("/api/rankit/admin/collections",
                                      json={"title": "Two derbies", "match_ids": [3, 4]}).json()
    assert client().get(f"/api/rankit/collections/{curated['id']}").json()["skin_reward"] is None


def test_a_skin_only_update_leaves_the_rating_review_and_stamp_alone(db):
    """2j yalniz {match_id, skin} gonderir. Puan, yorum, damga, etiket ve
    gorunurluk kaydi oldugu gibi kalmali (DiaryIn: gonderilmeyen alan degismez)."""
    entry = client().post("/api/rankit/diary", json={
        "match_id": 1, "rating": 4.5, "review": "Proper derby.", "classic": True,
        "visibility": "followers", "tags": ["Derby"]}).json()["entry_id"]
    r = client().put(f"/api/rankit/diary/{entry}", json={"match_id": 1, "skin": "gilt"})
    assert r.status_code == 200, r.text
    assert r.json()["points_awarded"] == 0                            # skin odul degil
    with DB.get_conn() as c:
        row = c.execute("SELECT rating,review,classic,visibility,skin FROM rankit_diary_entries WHERE id=?",
                        (entry,)).fetchone()
        tags = [t["tag"] for t in c.execute("SELECT tag FROM rankit_entry_tags WHERE entry_id=?", (entry,))]
    assert (row["rating"], row["review"], row["classic"], row["visibility"], row["skin"]) == \
        (4.5, "Proper derby.", 1, "followers", "gilt")
    assert tags == ["Derby"]
