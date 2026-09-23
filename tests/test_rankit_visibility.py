# -*- coding: utf-8 -*-
"""Asama 4 -- gorunurluk sozlesmesi API YANITINDA (CODE.md Adim 2 ve 4).

Arayuz gizlese bile hassas veri yaniti terk etmemeli: 20 puan altindaki
topluluk isisi, ozet listelerdeki spoiler metni, yildizsiz izleme kaydinin
puan sayilmasi. Rotalar FastAPI TestClient ile cagriliyor; gecici DB,
canli servis ya da gercek kullanici verisi yok.
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

VIEWER, AUTHOR = 1, 2
SPOILER_TEXT = "Late winner in the 94th minute"


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_vis_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 31)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("""INSERT INTO rankit_teams(id,sport,name,short_name)
                     VALUES(1,'Football','Arsenal','ARS'),(2,'Football','Spurs','TOT')""")
        for mid in (1, 2):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,3,1,'fotmob')""",
                      (mid, f"2026-09-0{mid}T19:00:00"))
        rankit_rank.seed_rules(c)
    return path


def client_as(uid):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def entry(uid, mid, rating, *, review="", visibility="public", spoiler=0, classic=0):
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_diary_entries
                     (user_id,match_id,watched_date,rating,review,visibility,spoiler,classic)
                     VALUES(?,?,'2026-09-01',?,?,?,?,?)""",
                  (uid, mid, rating, review, visibility, spoiler, classic))


# ── BUILD §5.5: 20 puan ──────────────────────────────────────────────────────

def test_community_rating_is_withheld_below_twenty_ratings(db):
    for uid in range(3, 22):                     # 19 puan
        entry(uid, 1, 4.0)
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["rating_count"] == 19
    assert body["community_rating"] is None      # sayi yaniti terk etmiyor
    entry(22, 1, 4.0)                            # 20. puan
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["rating_count"] == 20 and body["community_rating"] == 4.0


def test_watch_only_entries_do_not_count_as_ratings(db):
    for uid in range(3, 22):
        entry(uid, 1, 4.0)
    entry(22, 1, None)                           # izleme kaydi, puan degil
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["rating_count"] == 19 and body["community_rating"] is None


# ── Sayaclar tutarli ─────────────────────────────────────────────────────────

def test_review_count_equals_the_list_it_links_to(db):
    entry(3, 1, 4.0, review="public words")
    entry(4, 1, 4.0, review="for followers", visibility="followers")
    entry(5, 1, 4.0, review="only me", visibility="private")
    client = client_as(VIEWER)
    match = client.get("/api/rankit/matches/1").json()
    listed = client.get("/api/rankit/matches/1/reviews").json()
    assert match["review_count"] == 1 == listed["total"]


# ── Ozetlerde spoiler metni ──────────────────────────────────────────────────

def _feed_item(uid):
    items = client_as(uid).get("/api/rankit/home").json()["activity"]
    return next(i for i in items if i["user_id"] == AUTHOR)


def test_home_feed_withholds_spoiler_text_from_unrated_viewers(db):
    entry(AUTHOR, 1, 4.5, review=SPOILER_TEXT, spoiler=1)
    item = _feed_item(VIEWER)
    assert item["spoiler"] is True and item["review_withheld"] is True
    assert item["review"] == "" and SPOILER_TEXT not in str(item)
    assert "viewer_rated" not in item
    # Yazarin kendisi metni gorur.
    assert _feed_item(AUTHOR)["review"] == SPOILER_TEXT
    # Yildizsiz izleme kaydi puan degil: metin hala saklı.
    entry(VIEWER, 1, None)
    assert _feed_item(VIEWER)["review"] == ""
    # Maci puanlayan icin bozulacak bir sey kalmadi.
    entry(VIEWER, 1, 3.5)
    item = _feed_item(VIEWER)
    assert item["review"] == SPOILER_TEXT and item["review_withheld"] is False


def test_home_feed_keeps_plain_reviews(db):
    entry(AUTHOR, 1, 4.5, review="Brilliant night", spoiler=0)
    item = _feed_item(VIEWER)
    assert item["review"] == "Brilliant night" and item["spoiler"] is False


def test_member_entries_withhold_spoiler_text(db):
    entry(AUTHOR, 1, 4.5, review=SPOILER_TEXT, spoiler=1)
    entries = client_as(VIEWER).get(f"/api/rankit/members/{AUTHOR}").json()["entries"]
    assert entries[0]["review"] == "" and entries[0]["review_withheld"] is True
    entry(VIEWER, 1, 3.0)
    entries = client_as(VIEWER).get(f"/api/rankit/members/{AUTHOR}").json()["entries"]
    assert entries[0]["review"] == SPOILER_TEXT


# ── BUILD §12.1: yildizsiz kayit puan degil ─────────────────────────────────

def test_watch_only_log_earns_no_rating_points(db):
    client = client_as(VIEWER)
    watched = client.post("/api/rankit/diary", json={"match_id": 2}).json()
    assert watched["points_awarded"] == 0 and watched["award_kind"] is None
    rated = client.post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0}).json()
    assert rated["points_awarded"] > 0 and rated["award_kind"] == "rate_late"


def test_classic_alert_skips_people_who_only_logged_the_match(db):
    entry(5, 2, None)            # izledi, puanlamadi
    entry(6, 2, 4.0)             # puanladi
    client_as(VIEWER).post("/api/rankit/diary", json={"match_id": 2, "rating": 5.0, "classic": True})
    with DB.get_conn() as c:
        told = {r[0] for r in c.execute(
            "SELECT user_id FROM rankit_notifications WHERE kind='classic' AND match_id=2")}
    assert told == {6}


# ── Sahibin kararlari (2026-09-21) ───────────────────────────────────────────
# (1) Instant Classic 20 puan, payda puanlayanlar

def test_instant_classic_needs_twenty_ratings(db):
    for uid in range(3, 22):                     # 19 puan, hepsi Classic
        entry(uid, 1, 5.0, classic=1)
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["classic_count"] == 19 and body["instant_classic"] is False
    entry(22, 1, 5.0, classic=1)
    assert client_as(VIEWER).get("/api/rankit/matches/1").json()["instant_classic"] is True


def test_classic_share_counts_raters_only(db):
    for uid in range(3, 16):                     # 13 Classic
        entry(uid, 1, 5.0, classic=1)
    for uid in range(16, 23):                    # 7 Classic degil: 13/20 = .65
        entry(uid, 1, 3.0)
    entry(23, 1, None, classic=1)                # yildizsiz damga: hukum degil
    for uid in range(24, 30):                    # yildizsiz izleme kayitlari
        entry(uid, 1, None)
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["rating_count"] == 20 and body["classic_count"] == 13
    # Eski payda 27 kayitla 14/27 = .52'ye dusuyordu.
    assert body["instant_classic"] is True


# (2) Puan kaldirilinca yalnizca puanlama odulu geri

def _ledger(uid, kind=None):
    query, args = "SELECT COALESCE(SUM(points),0) FROM rankit_points WHERE user_id=?", [uid]
    if kind:
        query += " AND kind=?"
        args.append(kind)
    with DB.get_conn() as c:
        return c.execute(query, args).fetchone()[0]


def test_removing_the_rating_takes_back_only_the_rating_award(db):
    client = client_as(VIEWER)
    first = client.post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0}).json()
    with DB.get_conn() as c:                     # ayni macta baska kazanc
        rankit_rank.award(c, VIEWER, "companion", "match", 2)
    before = _ledger(VIEWER)
    removed = client.post("/api/rankit/diary", json={"match_id": 2, "rating": None}).json()
    assert removed["points_revoked"] == first["points_awarded"] > 0
    assert _ledger(VIEWER) == before - first["points_awarded"]
    assert _ledger(VIEWER, "companion") > 0      # dokunulmadi
    again = client.post("/api/rankit/diary", json={"match_id": 2, "rating": 3.5}).json()
    assert again["points_awarded"] == first["points_awarded"]
    assert _ledger(VIEWER) == before             # tekrar oder, ciftlenmez


def test_rewatch_keeps_the_award_while_another_entry_is_rated(db):
    client = client_as(VIEWER)
    client.post("/api/rankit/diary", json={"match_id": 2, "rating": 4.0})
    rewatch = client.post("/api/rankit/diary",
                          json={"match_id": 2, "rating": 3.0, "is_rewatch": True}).json()
    before = _ledger(VIEWER)
    out = client.put(f"/api/rankit/diary/{rewatch['entry_id']}",
                     json={"match_id": 2, "rating": None}).json()
    assert out["points_revoked"] == 0 and _ledger(VIEWER) == before


# (3) Beklenen isi: izleme listesine ekleyenin 1-5 okumasi

def _upcoming(mid=3):
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,provider)
                     VALUES(?,'Football',1,'2026-27','2026-10-13T19:00:00','upcoming',1,2,'fotmob')""",
                  (mid,))
    return mid


def test_expected_heat_needs_twenty_readings_and_is_not_community_heat(db):
    mid = _upcoming()
    for uid in range(2, 21):                                    # 19 okuma
        client_as(uid).put(f"/api/rankit/matches/{mid}/appetite", json={"appetite": 4})
    client_as(21).post(f"/api/rankit/matches/{mid}/watchlist")  # listede, okuma yok
    body = client_as(VIEWER).get(f"/api/rankit/matches/{mid}").json()
    # Alan adlari frontend adaptorunun okuduklari (heat.js).
    assert (body["expected_heat"], body["expected_rating_count"], body["watchlist_count"]) == (None, 19, 20)
    client_as(22).put(f"/api/rankit/matches/{mid}/appetite", json={"appetite": 1})
    body = client_as(VIEWER).get(f"/api/rankit/matches/{mid}").json()
    assert body["expected_rating_count"] == 20
    assert body["expected_heat"] == round((19 * 4 + 1) / 20, 1)
    assert body["community_rating"] is None                     # ayri alan


def test_appetite_is_idempotent_own_and_closes_at_kickoff(db):
    mid = _upcoming()
    client = client_as(VIEWER)
    for _ in range(2):
        assert client.put(f"/api/rankit/matches/{mid}/appetite",
                          json={"appetite": 5}).json() == {"watchlisted": True, "my_appetite": 5}
    body = client.get(f"/api/rankit/matches/{mid}").json()
    assert body["watchlisted"] is True and body["my_appetite"] == 5
    assert body["expected_rating_count"] == 1
    assert client.put(f"/api/rankit/matches/{mid}/appetite",
                      json={"appetite": None}).json()["my_appetite"] is None
    assert client.get(f"/api/rankit/matches/{mid}").json()["expected_rating_count"] == 0
    assert client.put(f"/api/rankit/matches/{mid}/appetite", json={"appetite": 6}).status_code == 422
    assert client.put("/api/rankit/matches/1/appetite", json={"appetite": 3}).status_code == 409
    finished = client.get("/api/rankit/matches/1").json()                    # bitmis mac
    assert (finished["expected_heat"], finished["expected_rating_count"], finished["watchlist_count"]) == (None, None, None)


# ── Faz 1 kararlari (2026-09-21) ─────────────────────────────────────────────
# POTM "kim aldi" 20 oy olmadan yok; toplam oy sayisi kalir.

def test_potm_needs_twenty_votes(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(1,'Football',1,'Bukayo Saka')")
        c.executemany("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,1,1)",
                      [(uid,) for uid in range(2, 21)])          # 19 oy
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["potm"] is None and body["potm_votes"] == 19
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(21,1,1)")
    body = client_as(VIEWER).get("/api/rankit/matches/1").json()
    assert body["potm_votes"] == 20
    assert body["potm"]["name"] == "Bukayo Saka" and body["potm"]["votes"] == 20
