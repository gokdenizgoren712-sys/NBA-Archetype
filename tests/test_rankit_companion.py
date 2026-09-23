# -*- coding: utf-8 -*-
"""Faz 6 -- Companion (5a, 5b, 6d): katilim ve sure sunucu saatiyle, su an
odada, takip edilen katilanlar, nabiz dakikasi saglayicidan, §5.5 esigi,
mac sonu kaydi. Gecici DB; ag yok.
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
from api.auth import get_optional_user

LIVE, UPCOMING, FINISHED = 1, 2, 3


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_companion_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    now = utcnow()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 31)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','Chelsea','CHE'),(2,'Football','Sporting','SCP')")
        for mid, when, status, minute in ((LIVE, now - timedelta(minutes=75), "live", "73‎’‎"),
                                          (UPCOMING, now + timedelta(hours=2), "upcoming", None),
                                          (FINISHED, now - timedelta(hours=3), "finished", None)):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,provider,live_minute)
                         VALUES(?,'Football',1,'2026-27',?,?,1,2,'fotmob',?)""", (mid, iso(when), status, minute))
        rankit_rank.seed_rules(c)
    return path


def client(uid=1):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    return TestClient(app)


def one(sql, args=()):
    with DB.get_conn() as c:
        return c.execute(sql, args).fetchone()


# ── Nabiz dakikasi ───────────────────────────────────────────────────────────

def test_pulse_minute_comes_from_the_provider_not_the_client(db):
    # Saglayicinin dakikasi kazanir: istemci baska bir sey yollasa da 73.
    assert client().post(f"/api/rankit/matches/{LIVE}/pulse",
                         json={"value": 4, "minute": 12}).status_code == 200
    assert one("SELECT minute FROM rankit_pulse_reads ORDER BY id DESC LIMIT 1")[0] == 73
    with DB.get_conn() as c:
        c.execute("UPDATE rankit_matches SET live_minute=NULL WHERE id=?", (LIVE,))
    # Saglayici dakikasi yoksa istemcininki yedek -- metin de kabul (eskiden
    # yanittaki "73'" metni tamsayi alanda 422 ile reddediliyordu).
    assert client(2).post(f"/api/rankit/matches/{LIVE}/pulse",
                          json={"value": 3, "minute": "61‎’‎"}).status_code == 200
    assert one("SELECT minute FROM rankit_pulse_reads ORDER BY id DESC LIMIT 1")[0] == 61
    client(3).post(f"/api/rankit/matches/{LIVE}/pulse", json={"value": 3, "minute": "HT"})
    assert one("SELECT minute FROM rankit_pulse_reads ORDER BY id DESC LIMIT 1")[0] == 45


# ── Katilim suresi durust ────────────────────────────────────────────────────

def test_presence_counts_only_real_time_during_a_live_match(db):
    api = client()
    before = api.post(f"/api/rankit/matches/{UPCOMING}/presence", json={"seconds": 600}).json()
    assert before["counted"] == 0 and before["seconds"] == 0                  # mac oncesi: katildi, sure yok
    first = api.post(f"/api/rankit/matches/{LIVE}/presence", json={"seconds": 1800}).json()
    assert first["counted"] == 60                                             # ilk rapor tavani
    again = api.post(f"/api/rankit/matches/{LIVE}/presence", json={"seconds": 1800}).json()
    assert again["counted"] <= 6                                              # gecen gercek sure kadar
    with DB.get_conn() as c:
        c.execute("""UPDATE rankit_companion_presence SET updated_at=datetime('now','-50 minutes')
                     WHERE user_id=1 AND match_id=?""", (LIVE,))
    late = api.post(f"/api/rankit/matches/{LIVE}/presence", json={"seconds": 1800}).json()
    assert late["counted"] == 1800 and late["qualified"] is False          # ~31 dk < 45 dk esigi
    with DB.get_conn() as c:
        c.execute("""UPDATE rankit_companion_presence SET updated_at=datetime('now','-20 minutes')
                     WHERE user_id=1 AND match_id=?""", (LIVE,))
    final = api.post(f"/api/rankit/matches/{LIVE}/presence", json={"seconds": 1200}).json()
    assert final["counted"] == 1200 and final["qualified"] is True and final["points_awarded"] > 0
    assert api.post(f"/api/rankit/matches/{FINISHED}/presence", json={"seconds": 900}).json()["counted"] == 0


def test_socket_joins_the_room_and_time_comes_from_the_server_clock(db):
    api = client()
    with api.websocket_connect(f"/api/rankit/ws/watchalong/{LIVE}"):
        assert api.get(f"/api/rankit/matches/{LIVE}/companion").json()["in_room"] == 1
    body = api.get(f"/api/rankit/matches/{LIVE}/companion").json()
    assert body["in_room"] == 0 and body["joined"] == 1
    # Sure: baglantinin canli pencereyle ortusmesi, mac suresiyle sinirli.
    started = rankit_rank._as_dt(one("SELECT starts_at FROM rankit_matches WHERE id=?", (LIVE,))[0])
    with DB.get_conn() as c:
        c.execute("INSERT OR IGNORE INTO rankit_companion_presence(user_id,match_id,seconds) VALUES(5,?,0)", (LIVE,))
        assert RK._accrue_room_seconds(c, 5, LIVE, started - timedelta(minutes=10),
                                       started + timedelta(minutes=50)) == 50 * 60
        c.execute("INSERT OR IGNORE INTO rankit_companion_presence(user_id,match_id,seconds) VALUES(6,?,0)", (LIVE,))
        assert RK._accrue_room_seconds(c, 6, LIVE, started, started + timedelta(hours=5)) == 130 * 60
        assert RK._accrue_room_seconds(c, 6, UPCOMING, utcnow(), utcnow() + timedelta(hours=1)) == 0
    assert one("SELECT awarded_at FROM rankit_companion_presence WHERE user_id=5 AND match_id=?", (LIVE,))[0]


# ── Oda sayilari ─────────────────────────────────────────────────────────────

def test_companion_counts_followed_joiners_and_messages(db):
    with DB.get_conn() as c:
        c.executemany("INSERT INTO rankit_companion_presence(user_id,match_id,seconds) VALUES(?,?,0)",
                      [(u, UPCOMING) for u in (2, 3, 4)])
        c.executemany("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(1,'user',?)", [(2,), (3,)])
        c.executemany("INSERT INTO rankit_watchalong_messages(match_id,user_id,room,content) VALUES(?,?,'community','hi')",
                      [(UPCOMING, 2)] * 5)
    body = client().get(f"/api/rankit/matches/{UPCOMING}/companion").json()
    assert (body["joined"], body["joined_following"], body["messages"]) == (3, 2, 5)
    assert body["badge"] == "3" and body["room_open"] is True and body["sport"] == "Football"
    assert client().get(f"/api/rankit/matches/{FINISHED}/companion").json()["room_open"] is False


# ── §5.5: nabiz 20 okumayla ──────────────────────────────────────────────────

def test_crowd_pulse_needs_twenty_readers(db):
    for uid in range(1, 20):
        client(uid).post(f"/api/rankit/matches/{LIVE}/pulse", json={"value": 4})
    pulse = client().get(f"/api/rankit/matches/{LIVE}/companion").json()["pulse"]
    assert pulse["value"] is None and pulse["reads"] == 19 and pulse["timeline"][0]["value"] is None
    client(20).post(f"/api/rankit/matches/{LIVE}/pulse", json={"value": 4})
    pulse = client().get(f"/api/rankit/matches/{LIVE}/companion").json()["pulse"]
    assert pulse["value"] == 4.0 and pulse["timeline"][0]["value"] == 4.0


# ── 6d: gecenin kaydi ────────────────────────────────────────────────────────

def test_finished_match_record_uses_only_measured_buckets(db):
    with DB.get_conn() as c:
        def reads(minute, value, users=range(1, 21)):
            c.executemany("INSERT INTO rankit_pulse_reads(match_id,user_id,value,minute) VALUES(?,?,?,?)",
                          [(FINISHED, u, value, minute) for u in users])
        reads(42, 2.0)
        reads(45, 2.5)
        reads(52, 3.0)
        reads(60, 5.0, users=range(1, 6))       # 5 okuma: esik alti, zirve olamaz
        reads(88, 4.5)
        c.execute("INSERT INTO rankit_moments(match_id,minute,kind,label) VALUES(?,47,'goal','Goal - Palmer')", (FINISHED,))
        c.execute("INSERT INTO rankit_moments(match_id,minute,kind,label) VALUES(?,88,'goal','Goal - winner')", (FINISHED,))
        c.executemany("INSERT INTO rankit_watchalong_messages(match_id,user_id,room,content) VALUES(?,1,'community','x')",
                      [(FINISHED,)] * 3)
        c.executemany("INSERT INTO rankit_companion_presence(user_id,match_id,seconds) VALUES(?,?,0)",
                      [(1, FINISHED), (2, FINISHED)])
    body = client().get(f"/api/rankit/matches/{FINISHED}/companion").json()
    record = body["record"]
    assert record["peak"] == {"minute": 85, "value": 4.5, "reads": 20}
    assert record["rise_from_ht"] == 2.0 and record["messages"] == 3 and record["attendance"] == 2
    deltas = {m["minute"]: m["pulse_delta"] for m in body["moments"]}
    assert deltas == {47: 1.0, 88: None}        # 88'in oncesinde olculmus kova yok
    assert body["badge"] is None and client().get(f"/api/rankit/matches/{LIVE}/companion").json()["record"] is None
