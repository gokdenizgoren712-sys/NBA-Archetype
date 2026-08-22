# -*- coding: utf-8 -*-
"""Oda içi canlı draft — iki websocket istemcisiyle uçtan uca.

Odanın tek amacı, iki cihazda oynanırken kararların istemcide olmaması: sıra
kimde, çark neye düştü, bu seçim geçerli mi. Bu test bunları istemci gibi
davranarak sınıyor — sırası olmayan koltuktan seçim denemek, havuzda olmayan
bir oyuncu göndermek, kaleciyi kanada koymak — ve draftı sonuna kadar oynatıp
elemenin sunucuda çözüldüğünü görüyor.

Geçici veritabanı kullanıyor; kullanıcının data/app.db'sine dokunmuyor.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbws_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

SEASON = "2023-2024"


@pytest.fixture(scope="module")
def app_client():
    from fastapi.testclient import TestClient
    from api.main import app
    if not (ROOT / "data" / f"football__{SEASON}__scores.parquet").exists():
        pytest.skip("futbol skor verisi yok")
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def two_users():
    from api.auth import create_token
    from api.db import get_conn
    out = []
    with get_conn() as conn:
        for name in ("ws_tester_1", "ws_tester_2"):
            row = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
            uid = row["id"] if row else conn.execute(
                "INSERT INTO users (username, email, hashed_password, role) "
                "VALUES (?,?,?,'user')", (name, f"{name}@test.invalid", "x")).lastrowid
            out.append({"id": uid, "token": create_token(uid, "user"),
                        "h": {"Authorization": "Bearer " + create_token(uid, "user")}})
    return out


def _open_room(client, users):
    r = client.post("/api/football/h2h/room",
                    json={"mode": "friend", "season": SEASON}, headers=users[0]["h"])
    code = r.json()["room_code"]
    client.post(f"/api/football/h2h/room/{code}/join", headers=users[1]["h"])
    return code


def _latest_state(ws, tries: int = 8) -> dict:
    """Yayınlar sırayla geliyor; son 'state' mesajını al."""
    last = None
    for _ in range(tries):
        m = ws.receive_json()
        if m.get("type") == "state":
            last = m
            break
        if m.get("type") in ("error", "fatal"):
            return m
    assert last is not None, "state mesajı gelmedi"
    return last


def _drain(ws, want="state", tries: int = 10) -> dict:
    """Beklenen mesaj gelene kadar oku. Hata mesajı gelirse SESSİZCE BEKLEME —
    testi orada patlat; yoksa bir sonraki receive sonsuza kadar bloke olur ve
    hatanın ne olduğu hiç görünmez."""
    for _ in range(tries):
        m = ws.receive_json()
        if m.get("type") == want:
            return m
        if m.get("type") in ("error", "fatal"):
            raise AssertionError(f"sunucu {m['type']}: {m.get('message') or m.get('reason')}")
    raise AssertionError(f"{want} mesajı gelmedi")


@pytest.fixture
def room(app_client, two_users):
    """İki bağlı istemci, draft başlamış bir oda."""
    code = _open_room(app_client, two_users)
    with app_client.websocket_connect(
            f"/ws/football/room/{code}?token={two_users[0]['token']}") as w1, \
         app_client.websocket_connect(
            f"/ws/football/room/{code}?token={two_users[1]['token']}") as w2:
        _latest_state(w1)
        _latest_state(w2)
        yield {"code": code, "w1": w1, "w2": w2}


def test_unknown_room_is_rejected_with_a_message(app_client, two_users):
    """Reddi close code'la değil GERÇEK bir mesajla yapıyoruz — tarayıcı close
    code'u güvenilir iletmediği için istemci aksi hâlde sonsuza dek yeniden
    dener (basketbolda yaşanmış)."""
    with app_client.websocket_connect(
            f"/ws/football/room/NOPE99?token={two_users[0]['token']}") as ws:
        m = ws.receive_json()
    assert m["type"] == "fatal" and m["reason"] == "room_not_found"


def test_outsider_cannot_open_the_socket(app_client, two_users):
    from api.auth import create_token
    from api.db import get_conn
    code = _open_room(app_client, two_users)
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username=?", ("ws_outsider",)).fetchone()
        uid = row["id"] if row else conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            ("ws_outsider", "out@test.invalid", "x")).lastrowid
    with app_client.websocket_connect(
            f"/ws/football/room/{code}?token={create_token(uid, 'user')}") as ws:
        m = ws.receive_json()
    assert m["type"] == "fatal" and m["reason"] == "room_not_found"


def test_setup_then_both_ready_starts_the_wheel(room):
    w1, w2 = room["w1"], room["w2"]
    w1.send_json({"type": "shape", "shape": "4-2-3-1"})
    s = _drain(w1)
    assert s["shapes"]["1"] == "4-2-3-1"
    assert s["stage"] == "setup", "tek taraf hazır değilken draft başladı"
    _drain(w2)

    w1.send_json({"type": "ready", "ready": True})
    s = _drain(w1); _drain(w2)
    assert s["stage"] == "setup", "tek onayla başladı"

    w2.send_json({"type": "ready", "ready": True})
    s = _drain(w2); _drain(w1)
    assert s["stage"] == "drafting"
    assert s["pool"] and s["pool"]["players"], "sunucu çarkı çevirmedi"
    assert s["activeSeat"] in (1, 2)


def test_only_the_host_sets_the_wheel_mode(room):
    room["w2"].send_json({"type": "wheel", "wheelMode": "pick"})
    m = room["w2"].receive_json()
    assert m["type"] == "error" and "opened the room" in m["message"]


def _start(room):
    w1, w2 = room["w1"], room["w2"]
    w1.send_json({"type": "ready", "ready": True}); _drain(w1); _drain(w2)
    w2.send_json({"type": "ready", "ready": True})
    s = _drain(w2); _drain(w1)
    return s


def test_the_wrong_seat_cannot_pick(room):
    s = _start(room)
    active = s["activeSeat"]
    idle = room["w2"] if active == 1 else room["w1"]
    player = s["pool"]["players"][0]
    idle.send_json({"type": "pick", "player_id": player["PLAYER_ID"], "slot": "GK"})
    m = idle.receive_json()
    assert m["type"] == "error" and "not your turn" in m["message"].lower()


def test_a_player_outside_the_pool_is_refused(room):
    s = _start(room)
    ws = room["w1"] if s["activeSeat"] == 1 else room["w2"]
    ws.send_json({"type": "pick", "player_id": 99999999, "slot": "GK"})
    m = ws.receive_json()
    assert m["type"] == "error" and "not in the squad" in m["message"]


def test_keeper_rule_holds_over_the_socket(room):
    s = _start(room)
    seat = s["activeSeat"]
    ws = room["w1"] if seat == 1 else room["w2"]
    outfield = next((p for p in s["pool"]["players"] if p["POSITION"] != "GK"), None)
    if outfield is None:
        pytest.skip("havuzda saha oyuncusu yok")
    ws.send_json({"type": "pick", "player_id": outfield["PLAYER_ID"], "slot": "GK"})
    m = ws.receive_json()
    assert m["type"] == "error" and "cannot play there" in m["message"]


def test_full_draft_plays_out_and_the_server_resolves_the_tie(room):
    """22 seçim, sunucu sırayı yönetiyor, sonunda eleme burada oynanıyor."""
    import json as _json
    from api.db import get_conn

    s = _start(room)
    sockets = {1: room["w1"], 2: room["w2"]}
    rounds_seen = []
    guard = 0

    while s["stage"] == "drafting" and guard < 60:
        guard += 1
        seat = s["activeSeat"]
        rounds_seen.append((s["round"], seat))
        pool = (s.get("pool") or {}).get("players") or []
        squad = s["squads"][str(seat)]
        shape = s["shapes"][str(seat)]

        from football import draft_rules as R
        slots = [x for x in R.slots_for(shape) if x["id"] not in squad]
        taken = set(s.get("takenIds") or [])
        choice = None
        for p in pool:
            if p["PLAYER_ID"] in taken:
                continue          # rakip aldi — sunucu da reddeder
            slot = next((x for x in slots if R.can_place(p, x)), None)
            if slot is not None:
                choice = (p, slot["id"])
                break
        assert choice, "seçilebilir kimse kalmadı — sunucu yeniden çevirmeliydi"

        sockets[seat].send_json({"type": "pick", "player_id": choice[0]["PLAYER_ID"],
                                 "slot": choice[1]})
        s = _drain(sockets[seat], tries=14)
        _drain(sockets[3 - seat], tries=14)     # karşı taraf da yayını almalı

    assert s["stage"] == "done", f"draft bitmedi (guard={guard})"
    assert s["filled"]["1"] == s["needed"]["1"] == 11
    assert s["filled"]["2"] == s["needed"]["2"] == 11

    # Yılan sırası: her turda ilk seçen değişmeli
    firsts = {}
    for rnd, seat in rounds_seen:
        firsts.setdefault(rnd, seat)
    starts = [firsts[r] for r in sorted(firsts)]
    for a, b in zip(starts, starts[1:]):
        assert a != b, f"tur sırası dönüşmüyor: {starts}"

    # Aynı oyuncu iki kadroda olamaz
    a_ids = {p["PLAYER_ID"] for p in s["squads"]["1"].values()}
    b_ids = {p["PLAYER_ID"] for p in s["squads"]["2"].values()}
    assert not (a_ids & b_ids)

    # Eleme SUNUCUDA çözülmüş ve saklanmış olmalı
    res = s["result"]
    assert res and res["winner"] in ("a", "b")
    assert len(res["legs"]) == 2
    with get_conn() as conn:
        row = conn.execute("SELECT status, result_json FROM football_h2h_rooms "
                           "WHERE room_code=?", (room["code"],)).fetchone()
    assert row["status"] == "resolved"
    assert _json.loads(row["result_json"])["winner"] == res["winner"]


def test_draft_survives_a_reconnect(app_client, two_users):
    """Bağlantı koparsa draft kaybolmamalı — durum DB'ye yazılıyor."""
    from football import draft_rules as R
    code = _open_room(app_client, two_users)
    t1, t2 = two_users[0]["token"], two_users[1]["token"]

    with app_client.websocket_connect(f"/ws/football/room/{code}?token={t1}") as w1, \
         app_client.websocket_connect(f"/ws/football/room/{code}?token={t2}") as w2:
        _latest_state(w1); _latest_state(w2)
        w1.send_json({"type": "ready", "ready": True}); _drain(w1); _drain(w2)
        w2.send_json({"type": "ready", "ready": True})
        s = _drain(w2); _drain(w1)

        seat = s["activeSeat"]
        ws = w1 if seat == 1 else w2
        pool = s["pool"]["players"]
        squad = s["squads"][str(seat)]
        slots = [x for x in R.slots_for(s["shapes"][str(seat)]) if x["id"] not in squad]
        taken = set(s.get("takenIds") or [])
        p = next(p for p in pool if p["PLAYER_ID"] not in taken
                 and any(R.can_place(p, x) for x in slots))
        slot = next(x for x in slots if R.can_place(p, x))
        ws.send_json({"type": "pick", "player_id": p["PLAYER_ID"], "slot": slot["id"]})
        s = _drain(ws); _drain(w1 if ws is w2 else w2)
        picked_total = s["filled"]["1"] + s["filled"]["2"]
        assert picked_total == 1

    # Belleği temizle: sunucu yeniden başlamış gibi
    import api.football_ws as fws
    fws.ROOM_STATES.pop(code, None)

    with app_client.websocket_connect(f"/ws/football/room/{code}?token={t1}") as w1:
        s = _latest_state(w1)
    assert s["stage"] == "drafting", "yeniden bağlanınca draft sıfırlandı"
    assert s["filled"]["1"] + s["filled"]["2"] == picked_total, "seçim kayboldu"


# ── Online: eşleştirme ───────────────────────────────────────────────────────
# Online bugüne kadar "kodu kendin ilet" friend odasıydı; kuyruk onu gerçek bir
# mod hâline getiriyor.

def _fresh_user(name):
    from api.auth import create_token
    from api.db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
        uid = row["id"] if row else conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            (name, f"{name}@test.invalid", "x")).lastrowid
    return uid, {"Authorization": "Bearer " + create_token(uid, "user")}


def test_first_in_the_queue_waits(app_client):
    import api.football_ws as fws
    fws.MM_QUEUE.clear()
    _, h = _fresh_user("mm_solo")
    r = app_client.post("/api/football/matchmaking/join", headers=h)
    assert r.status_code == 200
    assert r.json()["queue_size"] == 1 and "room_code" not in r.json()
    app_client.delete("/api/football/matchmaking", headers=h)


def test_two_in_the_queue_get_a_room(app_client):
    import api.football_ws as fws
    fws.MM_QUEUE.clear()
    ua, ha = _fresh_user("mm_a")
    ub, hb = _fresh_user("mm_b")
    app_client.post("/api/football/matchmaking/join", headers=ha)
    r = app_client.post("/api/football/matchmaking/join", headers=hb)
    body = r.json()
    assert body["queue_size"] == 0
    code = body.get("room_code")
    assert code, "eşleşme oda açmadı"

    # İki taraf da odanın içinde ve oda 'draft' akışında olmalı
    from api.db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM football_h2h_rooms WHERE room_code=?",
                           (code,)).fetchone()
    assert {row["p1_user_id"], row["p2_user_id"]} == {ua, ub}
    assert row["mode"] == "online" and row["flow"] == "draft"
    assert row["status"] == "building"

    # Ve gerçekten bağlanılabiliyor
    from api.auth import create_token
    with app_client.websocket_connect(
            f"/ws/football/room/{code}?token={create_token(ua, 'user')}") as ws:
        m = _latest_state(ws)
    assert m["type"] == "state" and m["stage"] == "setup"


def test_joining_twice_does_not_duplicate_you(app_client):
    import api.football_ws as fws
    fws.MM_QUEUE.clear()
    _, h = _fresh_user("mm_dup")
    app_client.post("/api/football/matchmaking/join", headers=h)
    r = app_client.post("/api/football/matchmaking/join", headers=h)
    assert r.json()["queue_size"] == 1, "aynı kişi kuyrukta iki kez"
    app_client.delete("/api/football/matchmaking", headers=h)


def test_leaving_the_queue_works(app_client):
    import api.football_ws as fws
    fws.MM_QUEUE.clear()
    _, h = _fresh_user("mm_leaver")
    app_client.post("/api/football/matchmaking/join", headers=h)
    app_client.delete("/api/football/matchmaking", headers=h)
    assert not fws.MM_QUEUE


def test_matched_message_reaches_a_waiting_socket(app_client):
    """Kuyruğa ilk giren soketiyle beklerken eşleşme haberi ona ulaşmalı."""
    import api.football_ws as fws
    from api.auth import create_token
    fws.MM_QUEUE.clear()
    ua, ha = _fresh_user("mm_ws_a")
    ub, hb = _fresh_user("mm_ws_b")

    with app_client.websocket_connect(
            f"/ws/football/matchmaking?token={create_token(ua, 'user')}") as ws:
        first = ws.receive_json()
        assert first["type"] == "queue"
        app_client.post("/api/football/matchmaking/join", headers=ha)
        ws.receive_json()                       # kuyruk boyu güncellemesi
        app_client.post("/api/football/matchmaking/join", headers=hb)
        m = ws.receive_json()
    assert m["type"] == "matched" and m["room_code"]
    assert m["opponent_user_id"] == ub
