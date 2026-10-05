# -*- coding: utf-8 -*-
"""Futbol odası yaşam döngüsü: kur → katıl → (hazır) → ayrıl.

docs/BACKEND_PROMPT_GAME_UI.md madde 1. Arayüz iki hesapla oda kurunca iki taraf
da lobide takılı kalıyordu: lobiden draft'a geçiş `p2_name`'e bakıyordu, join ise
yalnız `p2_user_id` yazıyordu, create de isim göndermeyen arayüz yüzünden
`p1_name`'i boş bırakıyordu. Yani isim hiçbir tarafta dolmuyordu.

Geçici veritabanı (DB_PATH) — kullanıcının data/app.db'sine dokunmaz.
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

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbroom_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

SEASON = "2023-2024"


@pytest.fixture(autouse=True)
def _fresh_rate_window():
    """Hız sınırı penceresini her testin önünde VE ardında boşalt.

    api.main'deki limiter IP başına 60 sn'de 120 istek sayıyor ve TÜM test
    trafiği tek sahte IP'den, tek süreçte geliyor. Bu modül birkaç düzine istek
    atıyor; temizlemeden bıraksa, sonra çalışan ilgisiz testler (test_h2h_room)
    kendi hatalarından değil bu pencereden 429 alıyordu. Diğer test dosyalarının
    kullandığı kalıp: M._RL.clear().
    """
    import api.main as M
    M._RL.clear()
    yield
    M._RL.clear()


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    with TestClient(app) as c:
        yield c


def _user(name):
    from api.auth import create_token
    from api.db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
        uid = row["id"] if row else conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            (name, f"{name}@test.invalid", "x")).lastrowid
    tok = create_token(uid, "user")
    return {"id": uid, "name": name, "token": tok,
            "h": {"Authorization": "Bearer " + tok}}


@pytest.fixture(scope="module")
def alice():
    return _user("lc_alice")


@pytest.fixture(scope="module")
def bob():
    return _user("lc_bob")


@pytest.fixture(scope="module")
def carol():
    return _user("lc_carol")


def _create(client, host, mode="friend"):
    # Arayüz create'e isim GÖNDERMİYOR — testin amacı tam bu.
    r = client.post("/api/football/h2h/room", json={"mode": mode, "season": SEASON},
                    headers=host["h"])
    assert r.status_code == 200, r.text
    return r.json()["room_code"]


def _get(client, code, who):
    r = client.get(f"/api/football/h2h/room/{code}", headers=who["h"])
    assert r.status_code == 200, r.text
    return r.json()


def _status_in_db(code):
    from api.db import get_conn
    with get_conn() as conn:
        return conn.execute("SELECT * FROM football_h2h_rooms WHERE room_code=?",
                            (code,)).fetchone()


# ── Madde 1: isimler ve opponent_joined ──────────────────────────────────────

def test_create_names_the_host_from_the_account(client, alice):
    code = _create(client, alice)
    room = _get(client, code, alice)
    assert room["p1_name"] == "lc_alice", "isim göndermeyen create host'u adsız bıraktı"
    assert room["opponent_joined"] is False
    assert room["players"] == [{"seat": 1, "user_id": alice["id"], "username": "lc_alice"}]


def test_join_names_the_guest_and_the_host_sees_it(client, alice, bob):
    """Hatanın kendisi: host'un yoklaması misafiri hiç görmüyordu."""
    code = _create(client, alice)
    j = client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    assert j.status_code == 200, j.text

    host_view = _get(client, code, alice)           # host'un 4 sn'lik yoklaması
    assert host_view["opponent_joined"] is True
    assert host_view["p2_name"] == "lc_bob"
    assert host_view["status"] == "building"

    guest_view = _get(client, code, bob)
    assert guest_view["opponent_joined"] is True    # misafir için de simetrik
    assert guest_view["you"] == "p2"
    assert [p["username"] for p in guest_view["players"]] == ["lc_alice", "lc_bob"]
    assert [p["seat"] for p in guest_view["players"]] == [1, 2]


def test_a_stored_name_wins_over_the_account_name(client, alice):
    """Kadro gönderirken verilen ad hesap adının önüne geçmeli (eski davranış)."""
    r = client.post("/api/football/h2h/room",
                    json={"mode": "friend", "season": SEASON, "name": "The Gaffer"},
                    headers=alice["h"])
    code = r.json()["room_code"]
    assert _get(client, code, alice)["p1_name"] == "The Gaffer"


def test_old_rows_without_names_still_get_one(client, alice, bob):
    """Düzeltmeden ÖNCE açılmış satırlar p1_name/p2_name boş. Okurken hesap
    adından türetilmeli — yoksa canlıdaki mevcut odalar adsız kalır."""
    from api.db import get_conn
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with get_conn() as conn:
        conn.execute("UPDATE football_h2h_rooms SET p1_name=NULL, p2_name=NULL "
                     "WHERE room_code=?", (code,))
    v = _get(client, code, alice)
    assert (v["p1_name"], v["p2_name"]) == ("lc_alice", "lc_bob")


def test_a_third_player_is_refused(client, alice, bob, carol):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    r = client.post(f"/api/football/h2h/room/{code}/join", headers=carol["h"])
    assert r.status_code == 409
    # Ve kazanan hâlâ bob: carol onu ezmedi.
    assert _get(client, code, alice)["p2_name"] == "lc_bob"


def test_joining_twice_is_idempotent(client, alice, bob):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    again = client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    assert again.status_code == 200 and again.json()["opponent_joined"] is True


# ── Madde 1.3: ayrılma ───────────────────────────────────────────────────────

def test_guest_leaving_a_friend_room_reopens_the_seat(client, alice, bob, carol):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])

    r = client.post(f"/api/football/h2h/room/{code}/leave", headers=bob["h"])
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "status": "waiting", "reopened": True}

    host_view = _get(client, code, alice)
    assert host_view["opponent_joined"] is False
    assert host_view["p2_name"] is None
    assert host_view["status"] == "waiting"

    # Kod hâlâ geçerli: başkası girebilir.
    j = client.post(f"/api/football/h2h/room/{code}/join", headers=carol["h"])
    assert j.status_code == 200
    assert _get(client, code, alice)["p2_name"] == "lc_carol"


def test_leaving_clears_the_guests_squad_and_the_draft_state(client, alice, bob):
    """Koltuk değişince eski draft durumu kalmamalı — yeni gelen eski koltuk
    atamasıyla devam ederdi."""
    from api.db import get_conn
    import api.football_ws as fws
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with get_conn() as conn:
        conn.execute("UPDATE football_h2h_rooms SET draft_state_json='{\"x\":1}', "
                     "p2_squad_json='{\"players\":[]}' WHERE room_code=?", (code,))
    fws.ROOM_STATES[code] = {"stale": True}

    client.post(f"/api/football/h2h/room/{code}/leave", headers=bob["h"])
    row = _status_in_db(code)
    assert row["draft_state_json"] is None and row["p2_squad_json"] is None
    assert code not in fws.ROOM_STATES


def test_host_leaving_abandons_the_room(client, alice, bob, carol):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    r = client.post(f"/api/football/h2h/room/{code}/leave", headers=alice["h"])
    assert r.json()["status"] == "abandoned" and r.json()["reopened"] is False
    assert _get(client, code, bob)["status"] == "abandoned"
    # Kapanmış odaya kimse giremez — kimsenin gelmeyeceği bir lobiye girmek olurdu.
    j = client.post(f"/api/football/h2h/room/{code}/join", headers=carol["h"])
    assert j.status_code == 409 and "closed" in j.json()["detail"].lower()


def test_guest_leaving_a_matched_online_room_closes_it(client, alice, bob):
    """Eşleştirmeyle kurulmuş çiftte bekleyecek kimse yok: koltuk açılmaz."""
    import api.football_ws as fws
    code = fws._make_room(alice["id"], bob["id"], SEASON)
    assert code
    # Eşleştirme artık adları da yazıyor.
    v = _get(client, code, alice)
    assert (v["p1_name"], v["p2_name"]) == ("lc_alice", "lc_bob")
    assert v["opponent_joined"] is True

    r = client.post(f"/api/football/h2h/room/{code}/leave", headers=bob["h"])
    assert r.json()["status"] == "abandoned"


def test_leave_never_touches_a_resolved_tie(client, alice, bob):
    from api.db import get_conn
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with get_conn() as conn:
        conn.execute("UPDATE football_h2h_rooms SET status='resolved', "
                     "result_json='{\"winner\":\"a\"}' WHERE room_code=?", (code,))
    r = client.post(f"/api/football/h2h/room/{code}/leave", headers=bob["h"])
    assert r.json()["status"] == "resolved"
    row = _status_in_db(code)
    assert row["status"] == "resolved" and row["p2_user_id"] == bob["id"]
    assert row["result_json"] is not None


def test_leave_is_refused_for_outsiders_and_unknown_rooms(client, alice, bob, carol):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    assert client.post(f"/api/football/h2h/room/{code}/leave",
                       headers=carol["h"]).status_code == 403
    assert client.post("/api/football/h2h/room/NOPE99/leave",
                       headers=alice["h"]).status_code == 404
    assert client.post(f"/api/football/h2h/room/{code}/leave").status_code == 401


def test_leaving_frees_the_player_for_matchmaking(client, alice):
    """Önceden misafir ayrıldıktan sonra satır 'building' kalıyor, 12 saat
    boyunca 'zaten bir odadasın' diye eşleştirmeye alınmıyordu.

    Kendi kullanıcısı var: bu veritabanı modül boyunca paylaşılıyor ve diğer
    testler bob'u açık odalarda bırakıyor; onu kullanmak bu testi kirletirdi."""
    import api.football_ws as fws
    dave = _user("lc_dave")
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=dave["h"])
    assert fws._user_in_open_room(dave["id"]) is True
    client.post(f"/api/football/h2h/room/{code}/leave", headers=dave["h"])
    assert fws._user_in_open_room(dave["id"]) is False


# ── WS tarafı: aynı kaynak, aynı adlar ───────────────────────────────────────

def _state(ws, tries=8):
    for _ in range(tries):
        m = ws.receive_json()
        if m.get("type") == "state":
            return m
        if m.get("type") in ("fatal", "error"):
            raise AssertionError(m)
    raise AssertionError("state gelmedi")


def test_the_socket_shows_the_same_names_as_the_rest_api(client, alice, bob):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with client.websocket_connect(f"/ws/football/room/{code}?token={alice['token']}") as ws:
        s = _state(ws)
    assert s["names"] == {"1": "lc_alice", "2": "lc_bob"}


def test_the_host_is_told_when_the_guest_leaves(client, alice, bob):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with client.websocket_connect(f"/ws/football/room/{code}?token={alice['token']}") as ws:
        _state(ws)
        client.post(f"/api/football/h2h/room/{code}/leave", headers=bob["h"])
        seen = []
        for _ in range(4):
            m = ws.receive_json()
            seen.append(m)
            if m.get("type") == "opponent_left" and m.get("room_status"):
                break
    left = [m for m in seen if m.get("type") == "opponent_left" and m.get("room_status")]
    assert left and left[0]["room_status"] == "waiting"
    assert left[0]["user_id"] == bob["id"]


def test_a_new_guest_gets_a_fresh_draft_not_the_old_one(client, alice, bob, carol):
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with client.websocket_connect(f"/ws/football/room/{code}?token={bob['token']}") as ws:
        s1 = _state(ws)
    assert s1["seats"]["2"] == bob["id"]

    client.post(f"/api/football/h2h/room/{code}/leave", headers=bob["h"])
    client.post(f"/api/football/h2h/room/{code}/join", headers=carol["h"])
    with client.websocket_connect(f"/ws/football/room/{code}?token={carol['token']}") as ws:
        s2 = _state(ws)
    assert s2["seats"]["2"] == carol["id"], "yeni misafir eski koltuk atamasını devraldı"
    assert s2["names"]["2"] == "lc_carol"
    assert s2["stage"] == "setup"


def test_the_socket_refuses_a_closed_room_with_a_message(client, alice, bob):
    """Kapanmış odaya bağlanan, kimsenin gelmeyeceği bir drafta girerdi. Red,
    close code'la değil gerçek bir mesajla (tarayıcı close code'u güvenilir
    iletmiyor; istemci aksi hâlde sonsuza dek yeniden dener)."""
    code = _create(client, alice)
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    client.post(f"/api/football/h2h/room/{code}/leave", headers=alice["h"])   # host çıktı
    with client.websocket_connect(f"/ws/football/room/{code}?token={bob['token']}") as ws:
        m = ws.receive_json()
    assert m["type"] == "fatal" and m["reason"] == "room_closed"
