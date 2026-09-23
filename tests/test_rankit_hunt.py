# -*- coding: utf-8 -*-
"""Faz 9.4 -- The Hunt (2m / 2n): kural koleksiyonlari (kulubun lig sezonu,
yilin Classic'leri) + sahibin seckileri; toplanan = puanlanan; planlanmamis
fikstur sayilir ama uydurulmaz; 6a karosu; "A season followed end to end"
(takip edilen kulubun tum lig maclari, 300); arama. Gecici DB; ag yok.
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

ME = 1
ARS, CHE, TOT, WHU = 1, 2, 3, 4


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_hunt_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 31)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','Premier League','2026-27')")
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Football','FA Cup','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(?,'Football',?,?)",
                      [(ARS, "Arsenal", "ARS"), (CHE, "Chelsea", "CHE"), (TOT, "Tottenham", "TOT"), (WHU, "West Ham", "WHU")])
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'team',?)", (ME, ARS))
        rankit_rank.seed_rules(c)
    return path


def add(mid, comp, home, away, days, status="finished"):
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,home_score,away_score,provider)
                     VALUES(?,'Football',?,'2026-27',?,?,?,?,?,?,'fotmob')""",
                  (mid, comp, iso(utcnow() + timedelta(days=days)), status, home, away,
                   1 if status == "finished" else None, 0 if status == "finished" else None))


def arsenal_season(complete=False):
    """Dort takimli lig: kulup basina 2 x 3 = 6 mac. Arsenal'in 5'i bilinir
    (biri planlanmamis) ya da complete ise 6'si oynanmis."""
    add(1, 1, ARS, CHE, -30); add(2, 1, TOT, ARS, -20); add(3, 1, ARS, WHU, -10)
    if complete:
        add(4, 1, CHE, ARS, -8); add(5, 1, ARS, TOT, -6); add(6, 1, WHU, ARS, -4)
    else:
        add(4, 1, CHE, ARS, 3, "upcoming"); add(5, 1, ARS, TOT, 10, "upcoming")
    add(9, 2, ARS, CHE, -15)                                  # kupa maci: kulup sezonuna girmez


def client(uid=ME, admin=False):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    if admin:
        app.dependency_overrides[require_admin] = lambda: {"sub": str(uid)}
    return TestClient(app)


def rate(mid, rating=4.0, uid=ME):
    return client(uid).post("/api/rankit/diary", json={"match_id": mid, "rating": rating}).json()


def hunt(uid=ME):
    return client(uid).get("/api/rankit/collections").json()


# ── 2m: kulubun lig sezonu ───────────────────────────────────────────────────

def test_club_season_counts_rated_matches_and_unscheduled_fixtures(db):
    arsenal_season()
    rate(1); rate(2)
    client().post("/api/rankit/diary", json={"match_id": 3})          # yildizsiz: toplanmaz
    rate(9)                                                            # kupa maci: sayilmaz
    body = hunt()
    club = next(c for c in body["collections"] if c["kind"] == "club_season")
    assert (club["title"], club["total"], club["known"], club["unscheduled"]) == ("The 6", 6, 5, 1)
    assert (club["collected"], club["remaining"], club["status"]) == (2, 4, "active")
    assert club["next"]["match_id"] == 4 and club["team"]["name"] == "Arsenal"
    assert body["collections"][-1]["kind"] == "classics_year"               # henuz Classic yok: en sonda
    assert body["collections"][-1]["status"] == "not_open"
    assert body["summary"] == {"collected": 2, "total": 6, "pct": 0.333, "active": 1, "one_left": 0}
    # Takip etmedigin kulubun sezonu avinda yok.
    assert all(c["kind"] != "club_season" for c in hunt(uid=2)["collections"])


# ── 2n: sahibin seckisi, bosluklar hakkinda durust ───────────────────────────

def test_curated_collection_is_honest_about_gaps(db):
    arsenal_season()
    admin = client(admin=True)
    assert client().post("/api/rankit/admin/collections", json={"title": "x"}).status_code in (401, 403)
    assert admin.post("/api/rankit/admin/collections",
                      json={"title": "Derby", "declared_total": 1, "match_ids": [1, 2]}).status_code == 422
    assert admin.post("/api/rankit/admin/collections",
                      json={"title": "Derby", "match_ids": [999]}).status_code == 404
    cid = admin.post("/api/rankit/admin/collections", json={
        "title": "Every London Derby", "subtitle": "Rate all four this season.", "declared_total": 4,
        "reward": "TURF", "match_ids": [3, 1, 4]}).json()["id"]
    admin.post("/api/rankit/admin/collections", json={
        "title": "Olympic Finals 2028", "opens_note": "Opens when the schedule is published."})
    rate(1)
    detail = client().get(f"/api/rankit/collections/{cid}").json()
    assert (detail["collected"], detail["total"], detail["known"], detail["unscheduled"]) == (1, 4, 3, 1)
    assert [m["id"] for m in detail["collected_matches"]] == [1]
    assert [m["id"] for m in detail["open_matches"]] == [3]                 # oynandi, puanlanmadi
    assert [m["id"] for m in detail["upcoming_matches"]] == [4]
    assert detail["reward"] == "TURF"
    items = hunt()["collections"]
    assert items[-1]["title"] == "Olympic Finals 2028" and items[-1]["status"] == "not_open"
    assert items[-1]["opens_note"] == "Opens when the schedule is published."
    admin.post("/api/rankit/admin/collections", json={"id": cid, "title": "Every London Derby",
                                                      "active": False, "match_ids": [3, 1, 4]})
    assert client().get(f"/api/rankit/collections/{cid}").status_code == 404
    assert all(c["id"] != cid for c in hunt()["collections"])


# ── 6a: koleksiyon karosu ────────────────────────────────────────────────────

def test_collectible_result_carries_the_collection_tile(db):
    arsenal_season()
    first = rate(1)
    assert first["collection"] == {"id": first["collection"]["id"], "kind": "club_season", "title": "The 6",
                                   "collected": 1, "total": 6, "delta": 1, "status": "active"}
    again = client().put(f"/api/rankit/diary/{first['entry_id']}", json={"match_id": 1, "rating": 3.0}).json()
    assert again["collection"]["delta"] == 0 and again["collection"]["collected"] == 1
    # Daha dolu bir secki varsa o gosterilir: 2 / 3 > 2 / 6.
    client(admin=True).post("/api/rankit/admin/collections", json={
        "title": "Every London Derby", "declared_total": 3, "match_ids": [1, 2, 4]})
    assert rate(2)["collection"]["title"] == "Every London Derby"
    assert rate(9)["collection"] is None                                   # kupa maci, secki yok


# ── "A season followed end to end" ───────────────────────────────────────────

def test_rating_every_league_match_of_a_followed_club_earns_the_season(db):
    arsenal_season(complete=True)
    for mid in (1, 2, 3, 4, 5):
        assert rate(mid)["season_award"] is None
    last = rate(6)
    assert last["season_award"] == {"points": 300}
    rank = client().get("/api/rankit/rank").json()
    assert {r["kind"]: r for r in rank["breakdown"]}["season"] == {"kind": "season", "count": 1, "points": 300}
    # Puani kaldirmak sezonu eksik birakir: odul geri alinir.
    entry = client().get("/api/rankit/diary").json()["entries"][0]["id"]
    removed = client().put(f"/api/rankit/diary/{entry}", json={"match_id": 6, "rating": None}).json()
    assert removed["points_revoked"] >= 300
    assert {r["kind"]: r for r in client().get("/api/rankit/rank").json()["breakdown"]}["season"]["count"] == 0
    # Takip etmedigin kulubun sezonunu tamamlamak odul vermez: user2 Arsenal'in
    # alti macinin hepsini puanliyor ama Arsenal'i takip etmiyor.
    for mid in (1, 2, 3, 4, 5, 6):
        rate(mid, uid=2)
    with DB.get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM rankit_points WHERE user_id=2 AND kind='season'").fetchone()[0] == 0


# ── Yilin Classic'leri ───────────────────────────────────────────────────────

def test_classics_of_the_year_follow_the_instant_classic_rule(db):
    add(30, 1, CHE, TOT, 0)                     # bu yil oynandi (starts_at = simdi)
    add(31, 1, TOT, WHU, 0, "finished")
    with DB.get_conn() as c:
        c.execute("UPDATE rankit_matches SET starts_at=? WHERE id=31", (iso(utcnow() - timedelta(minutes=5)),))
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,classic,visibility)
                         VALUES(?,30,'2026-09-01',4.5,?,'public')""",
                      [(u, 1 if u <= 14 else 0) for u in range(2, 22)])     # 20 puan, 13 Classic = %65
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,classic,visibility)
                         VALUES(?,31,'2026-09-01',4.5,?,'public')""",
                      [(u, 1 if u <= 13 else 0) for u in range(2, 22)])     # 12 / 20 = %60: Classic degil
    classics = next(c for c in hunt()["collections"] if c["kind"] == "classics_year")
    assert (classics["title"], classics["total"], classics["collected"]) == (f"Classics of {utcnow().year}", 1, 0)
    # Classic'siz bir puan payi %65'in altina ceker ve maci listeden dusurur
    # (kural canli); burada damgayla puanlaniyor: 14 / 21.
    client().post("/api/rankit/diary", json={"match_id": 30, "rating": 4.5, "classic": True})
    classics = next(c for c in hunt()["collections"] if c["kind"] == "classics_year")
    assert classics["collected"] == 1 and classics["status"] == "complete"


# ── 3e: arama ────────────────────────────────────────────────────────────────

def test_search_finds_collections_by_title_and_by_club(db):
    arsenal_season()
    client(admin=True).post("/api/rankit/admin/collections", json={
        "title": "Every London Derby", "declared_total": 4, "match_ids": [1, 2, 3]})
    found = client().get("/api/rankit/search?q=Chelsea").json()["collections"]
    kinds = {(c["kind"], c["matched_team"]) for c in found}
    assert ("curated", "Chelsea") in kinds and ("club_season", "Chelsea") in kinds
    assert client().get("/api/rankit/search?q=derby").json()["collections"][0]["title"] == "Every London Derby"


def test_catalog_cleanup_keeps_curated_matches(db):
    import src.rankit_sync as rs
    add(20, 1, CHE, TOT, 5, "upcoming")
    client(admin=True).post("/api/rankit/admin/collections", json={"title": "Keep", "match_ids": [20]})
    with DB.get_conn() as c:
        kept = {r[0] for r in c.execute(rs.USER_CONTENT_MATCH_IDS)}
    assert 20 in kept


def test_one_left_needs_a_dated_fixture():
    """Ozet ile bildirim ayni kurali uyguluyor: kalan tek mac planlanmamissa
    "one night from closing" DENMEZ (rankit_notify._closing_collection)."""
    from api import rankit_hunt
    dated = {"status": "active", "remaining": 1, "unscheduled": 0, "collected": 11, "total": 12}
    undated = {"status": "active", "remaining": 1, "unscheduled": 1, "collected": 1, "total": 2}
    assert rankit_hunt.index_summary([dated])["one_left"] == 1
    assert rankit_hunt.index_summary([undated])["one_left"] == 0
    assert rankit_hunt.index_summary([dated, undated])["one_left"] == 1
