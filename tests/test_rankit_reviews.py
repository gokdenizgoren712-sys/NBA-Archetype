# -*- coding: utf-8 -*-
"""Faz 7 -- Yorumlar (15c, 5c, 4a): yanit adresi yalnizca dizideki birine,
yanit respect'i erisim kontrollu, kendine respect yok, spoiler incelemenin
yanitlari da spoiler, puansiz kayda inceleme/etiket/Classic yok, banli
yazarin icerigi listelerden duser, "on the night" yazarin kendi gecesi,
"Your reviews" listesi. Gecici DB; ag yok.
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

AUTHOR, FAN, OTHER, STRANGER = 1, 2, 3, 9
MATCH, SECOND = 1, 2


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_reviews_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 11)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Chelsea','CHE'),(2,'Football','Sporting','SCP')")
        for mid, when in ((MATCH, "2026-09-14T19:00:00Z"), (SECOND, "2026-09-12T19:00:00Z")):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,2,1,'fotmob')""", (mid, when))
        rankit_rank.seed_rules(c)
    return path


def client(uid):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def review(uid=AUTHOR, match=MATCH, **extra):
    body = {"match_id": match, "rating": 4.0, "review": "Palmer ran the show.", **extra}
    out = client(uid).post("/api/rankit/diary", json=body)
    assert out.status_code == 200, out.text
    return out.json()["entry_id"]


def reply(entry, uid, reply_to=None, text="Agreed."):
    return client(uid).post(f"/api/rankit/reviews/{entry}/comments",
                            json={"content": text, "reply_to": reply_to})


def one(sql, args=()):
    with DB.get_conn() as c:
        return c.execute(sql, args).fetchone()


# ── §11.2: yanit adresi yalnizca dizideki birine ─────────────────────────────

def test_reply_addresses_only_the_author_or_someone_in_the_thread(db):
    entry = review()
    assert reply(entry, FAN).status_code == 200                              # varsayilan: yazar
    assert reply(entry, OTHER, reply_to=FAN).status_code == 200              # dizide yanit yazmis
    stray = reply(entry, OTHER, reply_to=STRANGER)
    assert stray.status_code == 422                                          # diziyle ilgisi yok
    assert one("SELECT COUNT(*) FROM rankit_notifications WHERE user_id=?", (STRANGER,))[0] == 0
    thread = client(AUTHOR).get(f"/api/rankit/reviews/{entry}/thread").json()
    assert [(r["username"], r["reply_to"]) for r in thread["replies"]] == [("user2", "user1"), ("user3", "user2")]


# ── §11.3: respect ───────────────────────────────────────────────────────────

def test_no_respect_for_your_own_review_or_reply(db):
    entry = review()
    assert client(AUTHOR).post(f"/api/rankit/reviews/{entry}/like").status_code == 403
    assert client(FAN).post(f"/api/rankit/reviews/{entry}/like").json() == {"liked": True, "likes": 1}
    comment = reply(entry, FAN).json()["comment_id"]
    assert client(FAN).post(f"/api/rankit/comments/{comment}/respect").status_code == 403
    assert client(AUTHOR).post(f"/api/rankit/comments/{comment}/respect").json() == {"respected": True, "respect": 1}


def test_reply_respect_checks_the_review_is_visible(db):
    entry = review(visibility="followers")
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'user',?)", (FAN, AUTHOR))
    comment = reply(entry, FAN).json()["comment_id"]
    assert client(STRANGER).post(f"/api/rankit/comments/{comment}/respect").status_code == 403
    assert client(STRANGER).post("/api/rankit/comments/999/respect").status_code == 404
    assert one("SELECT COUNT(*) FROM rankit_comment_respect")[0] == 0


# ── Spoiler: yanitlar da kapinin arkasinda ───────────────────────────────────

def test_replies_on_a_spoiler_review_carry_the_spoiler_flag(db):
    shielded, plain = review(spoiler=True), review(uid=FAN)
    reply(shielded, FAN)
    reply(plain, AUTHOR)
    thread = client(OTHER).get(f"/api/rankit/reviews/{shielded}/thread").json()
    assert thread["review"]["spoiler"] is True and thread["replies"][0]["spoiler"] is True
    assert client(OTHER).get(f"/api/rankit/reviews/{shielded}/comments").json()["comments"][0]["spoiler"] is True
    assert client(OTHER).get(f"/api/rankit/reviews/{plain}/thread").json()["replies"][0]["spoiler"] is False


# ── §9.3: inceleme, etiket ve Classic puanla acilir ──────────────────────────

def test_review_tags_and_classic_need_a_rating(db):
    api = client(AUTHOR)
    assert api.post("/api/rankit/diary", json={"match_id": MATCH, "review": "Loved it"}).status_code == 422
    assert api.post("/api/rankit/diary", json={"match_id": MATCH, "tags": ["Chaos"]}).status_code == 422
    assert api.post("/api/rankit/diary", json={"match_id": MATCH, "classic": True}).status_code == 422
    entry = review(tags=["Chaos"])
    # Puani kaldirmak: istemci ayni metni ve etiketi geri gonderir -- reddedilmez, metin kalir.
    out = api.put(f"/api/rankit/diary/{entry}", json={"match_id": MATCH, "rating": None,
                                                     "review": "Palmer ran the show.", "tags": ["Chaos"]})
    assert out.status_code == 200
    assert tuple(one("SELECT rating, review FROM rankit_diary_entries WHERE id=?", (entry,))) == (None, "Palmer ran the show.")
    # Puansiz kayda YENI metin ya da YENI etiket yazilamaz; etiketi kaldirmak serbest.
    assert api.put(f"/api/rankit/diary/{entry}", json={"match_id": MATCH, "review": "Changed"}).status_code == 422
    assert api.put(f"/api/rankit/diary/{entry}", json={"match_id": MATCH, "tags": ["Chaos", "Derby"]}).status_code == 422
    assert api.put(f"/api/rankit/diary/{entry}", json={"match_id": MATCH, "tags": []}).status_code == 200


def test_unrated_entry_does_not_send_a_classic_notification(db):
    entry = review(classic=True)
    review(uid=FAN)                                   # sonradan puanlayan
    client(AUTHOR).put(f"/api/rankit/diary/{entry}", json={"match_id": MATCH, "rating": None, "classic": True})
    assert one("SELECT COUNT(*) FROM rankit_notifications WHERE user_id=? AND kind='classic'", (FAN,))[0] == 0


# ── Banli yazar ──────────────────────────────────────────────────────────────

def test_banned_authors_drop_out_of_every_review_surface(db):
    kept, banned = review(), review(uid=FAN, review="Banned take")
    reply(kept, OTHER)
    reply(kept, FAN, text="Banned reply")
    with DB.get_conn() as c:
        c.execute("UPDATE users SET is_banned=1 WHERE id=?", (FAN,))
    viewer = client(OTHER)
    listed = viewer.get(f"/api/rankit/matches/{MATCH}/reviews").json()
    assert listed["total"] == 1 and [r["id"] for r in listed["followed"] + listed["everyone"]] == [kept]
    assert listed["everyone"][0]["replies"] == 1
    match = viewer.get(f"/api/rankit/matches/{MATCH}").json()
    assert [r["id"] for r in match["reviews"]] == [kept] and match["reviews"][0]["comments"] == 1
    assert match["review_count"] == 1
    assert viewer.get(f"/api/rankit/reviews/{banned}/thread").status_code == 404
    assert [r["content"] for r in viewer.get(f"/api/rankit/reviews/{kept}/thread").json()["replies"]] == ["Agreed."]
    assert all(a["id"] != banned for a in viewer.get("/api/rankit/home").json()["activity"])


# ── "on the night": yazarin kendi gecesi ─────────────────────────────────────

def test_on_the_night_is_the_authors_night(db):
    with DB.get_conn() as c:
        def entry(uid, rating, created, rated=None, rewatch=0, award=None):
            c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,review,is_rewatch,
                         visibility,created_at,rated_at) VALUES(?,?,?,?,?,?,'public',?,?)""",
                      (uid, MATCH, created[:10], rating, f"take {uid}", rewatch, created, rated))
            if award:
                c.execute("""INSERT INTO rankit_points(user_id,kind,points,subject_type,subject_id)
                             VALUES(?,?,15,'match',?)""", (uid, award, MATCH))
        entry(1, 4.0, "2026-09-15 02:00:00", "2026-09-15 02:00:00", award="rate_same_day")
        entry(2, 4.0, "2026-09-14 20:50:00", "2026-09-16 12:00:00", award="rate_late")   # yildizsiz kayit, sonra puan
        entry(3, 4.0, "2026-09-20 12:00:00", "2026-09-20 12:00:00", rewatch=1, award="rate_same_day")
        entry(4, 3.0, "2026-09-14 20:00:00")                                             # eski kayit: odul yok
        entry(5, None, "2026-09-14 20:00:00")                                            # puansiz
        entry(6, 4.0, "2026-09-14 20:00:00", "2026-09-16 12:00:00")                      # odulsuz: puanin ani
    def night(tz):
        body = client(OTHER).get(f"/api/rankit/matches/{MATCH}/reviews?tz_offset={tz}").json()
        return {r["username"]: r["on_the_night"] for r in body["everyone"]}
    assert night(0) == {"user1": True, "user2": False, "user3": False, "user4": True, "user5": False,
                        "user6": False}
    # Izleyenin saat dilimi yazarin gecesini degistirmez (UTC+10'da mac 05:00, puan 12:00).
    assert night(600)["user1"] is True
    first = one("SELECT id FROM rankit_diary_entries WHERE user_id=1")[0]
    assert client(OTHER).get(f"/api/rankit/reviews/{first}/thread?tz_offset=600").json()["review"]["on_the_night"] is True


# ── "Your reviews" (6b -> 5c) ────────────────────────────────────────────────

def test_your_reviews_lists_the_accounts_own_reviews_across_matches(db):
    mine = review(visibility="private")
    client(AUTHOR).post("/api/rankit/diary", json={"match_id": SECOND, "rating": 3.0})    # incelemesiz kayit
    other = review(uid=FAN, match=SECOND)
    client(AUTHOR).post(f"/api/rankit/reviews/{other}/like")
    rows = client(AUTHOR).get("/api/rankit/diary?view=reviews").json()["entries"]
    assert [r["id"] for r in rows] == [mine] and rows[0]["visibility"] == "private"
    assert (rows[0]["respect"], rows[0]["replies"]) == (0, 0)
    assert len(client(AUTHOR).get("/api/rankit/diary").json()["entries"]) == 2
