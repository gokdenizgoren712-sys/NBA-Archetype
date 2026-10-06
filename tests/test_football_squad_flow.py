# -*- coding: utf-8 -*-
"""Tam kadro ("squad": 11 + 7 yedek) akışı — draft → review → hire → eleme.

Kısa draft ("xi") bu dosyanın konusu değil, o akış diğer test dosyalarında;
burada yalnızca uzunluk seçimi, yedek/takas/kilit/menajer ve uzunluğa göre
eşleştirme sınanıyor. Draftlar iki soketle gerçekten sonuna kadar oynatılır.
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

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbsquad_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

SEASON = "2023-2024"


@pytest.fixture(autouse=True)
def _fresh_rate_window():
    import api.main as M
    M._RL.clear()
    yield
    M._RL.clear()


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    if not (ROOT / "data" / f"football__{SEASON}__scores.parquet").exists():
        pytest.skip("futbol skor verisi yok")
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
    return {"id": uid, "token": tok, "h": {"Authorization": "Bearer " + tok}}


def _drain(ws, want="state", tries=14):
    for _ in range(tries):
        m = ws.receive_json()
        if m.get("type") == want:
            return m
        if m.get("type") in ("error", "fatal"):
            raise AssertionError(f"sunucu {m['type']}: {m.get('message') or m.get('reason')}")
    raise AssertionError(f"{want} gelmedi")


def _expect_error(ws, tries=8):
    for _ in range(tries):
        m = ws.receive_json()
        if m.get("type") == "error":
            return m["message"]
    raise AssertionError("hata mesajı gelmedi")


def _both(w1, w2, msg, sender=1):
    """Mesajı gönder, iki tarafın da state yayınını oku, (gönderenin) state'i döndür."""
    a, b = (w1, w2) if sender == 1 else (w2, w1)
    a.send_json(msg)
    s = _drain(a)
    _drain(b)
    return s


def _open_room(client, a, b, length="squad"):
    code = client.post("/api/football/h2h/room",
                       json={"mode": "friend", "season": SEASON, "length": length},
                       headers=a["h"]).json()["room_code"]
    client.post(f"/api/football/h2h/room/{code}/join", headers=b["h"])
    return code


def _play_draft(w1, w2, s):
    """Çarktan seçip draft bitene kadar oyna (yedekler dahil: slots_of)."""
    from football import draft_rules as R
    socks = {1: w1, 2: w2}
    guard = 0
    while s["stage"] == "drafting" and guard < 80:
        guard += 1
        seat = s["activeSeat"]
        pool = (s.get("pool") or {}).get("players") or []
        squad = s["squads"][str(seat)]
        slots = R.slots_for(s["shapes"][str(seat)])
        if s.get("length") == "squad":
            slots = slots + [{"id": f"SUB{i}", "bench": True} for i in range(1, 8)]
        slots = [x for x in slots if x["id"] not in squad]
        taken = set(s.get("takenIds") or [])
        choice = None
        for p in pool:
            if p["PLAYER_ID"] in taken:
                continue
            sl = next((x for x in slots if R.can_place(p, x)), None)
            if sl is not None:
                choice = (p, sl["id"]); break
        assert choice, "seçilebilir kimse kalmadı"
        socks[seat].send_json({"type": "pick", "player_id": choice[0]["PLAYER_ID"],
                               "slot": choice[1]})
        s = _drain(socks[seat])
        _drain(socks[3 - seat])
    return s


def _start(w1, w2):
    w1.send_json({"type": "ready", "ready": True}); _drain(w1); _drain(w2)
    w2.send_json({"type": "ready", "ready": True})
    s = _drain(w2); _drain(w1)
    return s


@pytest.fixture
def review(client):
    """Draftı biten, iki tarafın da review ekranında beklediği bir tam-kadro odası."""
    a, b = _user("sq_alice"), _user("sq_bob")
    code = _open_room(client, a, b)
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _play_draft(w1, w2, _start(w1, w2))
        yield {"s": s, "w1": w1, "w2": w2, "a": a, "b": b, "code": code, "client": client}


def test_squad_draft_has_eighteen_picks_and_ends_in_review(review):
    s = review["s"]
    assert s["length"] == "squad"
    assert s["stage"] == "review", "draft bitince doğrudan eleme başladı"
    assert s["locked"] == {"1": False, "2": False}
    for seat in ("1", "2"):
        assert len(s["squads"][seat]) == 18
        assert sum(1 for k in s["squads"][seat] if k.startswith("SUB")) == 7
    assert s["result"] is None


def test_swap_moves_players_between_slots(review):
    f = review
    sq = f["s"]["squads"]["1"]
    def outfield(k):
        return str(sq[k].get("POSITION", "")).upper() != "GK"
    bench = next(k for k in sq if k.startswith("SUB") and outfield(k))
    pitch = next(k for k in sq if not k.startswith("SUB") and outfield(k))
    s = _both(f["w1"], f["w2"], {"type": "swap", "a": bench, "b": pitch})
    now = s["squads"]["1"]
    assert now[bench]["PLAYER_ID"] == sq[pitch]["PLAYER_ID"] \
        or now[pitch]["PLAYER_ID"] == sq[bench]["PLAYER_ID"], "takas oyuncuları taşımadı"
    assert len(now) == 18, "takas oyuncu kaybettirdi"


def test_a_locked_squad_cannot_be_rearranged(review):
    f = review
    _both(f["w1"], f["w2"], {"type": "lock"})
    sq = f["s"]["squads"]["1"]
    keys = list(sq)
    f["w1"].send_json({"type": "swap", "a": keys[0], "b": keys[-1]})
    assert "Unlock" in _expect_error(f["w1"])


def test_unlock_allows_swapping_again(review):
    f = review
    _both(f["w1"], f["w2"], {"type": "lock"})
    s = _both(f["w1"], f["w2"], {"type": "lock", "ready": False})
    assert s["locked"]["1"] is False and s["stage"] == "review"


def test_both_locked_moves_to_hire_with_four_options_each(review):
    f = review
    _both(f["w1"], f["w2"], {"type": "lock"})
    s = _both(f["w1"], f["w2"], {"type": "lock"}, sender=2)
    assert s["stage"] == "hire"
    for seat in ("1", "2"):
        opts = s["manager_options"][seat]
        assert len(opts) == 4 and len({m["name"] for m in opts}) == 4
    assert s["managers"] == {}


def _to_hire(f):
    _both(f["w1"], f["w2"], {"type": "lock"})
    return _both(f["w1"], f["w2"], {"type": "lock"}, sender=2)


def test_cannot_hire_a_manager_that_was_not_offered(review):
    f = review
    s = _to_hire(f)
    other = s["manager_options"]["2"][0]["name"]
    mine = {m["name"] for m in s["manager_options"]["1"]}
    if other in mine:                      # çekilişler çakışabilir; çakışmayanı bul
        other = next((m["name"] for m in s["manager_options"]["2"]
                      if m["name"] not in mine), None)
    if other is None:
        pytest.skip("iki liste de aynı dört menajer")
    f["w1"].send_json({"type": "hire", "manager": other})
    assert "not on your list" in _expect_error(f["w1"])


def test_hiring_twice_is_refused(review):
    f = review
    s = _to_hire(f)
    name = s["manager_options"]["1"][0]["name"]
    _both(f["w1"], f["w2"], {"type": "hire", "manager": name})
    f["w1"].send_json({"type": "hire", "manager": name})
    assert "already hired" in _expect_error(f["w1"])


def test_both_hired_finishes_with_manager_bonus_in_numbers(review):
    from football import draft_rules as R
    f = review
    s = _to_hire(f)
    n1 = s["manager_options"]["1"][0]["name"]
    n2 = s["manager_options"]["2"][0]["name"]
    _both(f["w1"], f["w2"], {"type": "hire", "manager": n1})
    f["w2"].send_json({"type": "hire", "manager": n2})
    s = _drain(f["w2"]); _drain(f["w1"])
    assert s["stage"] == "done" and s["result"], "iki menajer de seçilince eleme başlamadı"
    for seat, name in (("1", n1), ("2", n2)):
        num = s["numbers"][seat]
        expect = R.manager_bonus(R.MANAGER_BY_NAME[name], s["shapes"][seat])
        assert num["bonus"] == pytest.approx(expect["bonus"])
        assert num["quality"] == pytest.approx(
            max(0.25, min(0.95, num["mean"] - (1 - num["positionFit"]) + num["bonus"])))


def test_length_is_host_only_and_only_in_setup(client):
    a, b = _user("sq_len_a"), _user("sq_len_b")
    code = _open_room(client, a, b, length="xi")
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        w2.send_json({"type": "length", "length": "squad"})
        assert "opened the room" in _expect_error(w2)
        s = _both(w1, w2, {"type": "length", "length": "squad"})
        assert s["length"] == "squad"
        w1.send_json({"type": "length", "length": "bogus"})
        assert "Unknown" in _expect_error(w1)
        _start(w1, w2)
        w1.send_json({"type": "length", "length": "xi"})
        assert "already started" in _expect_error(w1)


def test_create_rejects_unknown_length(client):
    a = _user("sq_bad_len")
    r = client.post("/api/football/h2h/room",
                    json={"mode": "friend", "season": SEASON, "length": "huge"}, headers=a["h"])
    assert r.status_code == 400


def test_xi_rooms_still_skip_review(client):
    a, b = _user("sq_xi_a"), _user("sq_xi_b")
    code = _open_room(client, a, b, length="xi")
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _play_draft(w1, w2, _start(w1, w2))
        assert s["stage"] == "done" and s["result"] and s["numbers"]["1"]["bonus"] == 0


def test_rematch_keeps_the_length(review):
    f = review
    s = _to_hire(f)
    _both(f["w1"], f["w2"], {"type": "hire", "manager": s["manager_options"]["1"][0]["name"]})
    f["w2"].send_json({"type": "hire", "manager": s["manager_options"]["2"][0]["name"]})
    _drain(f["w2"]); _drain(f["w1"])
    f["w1"].send_json({"type": "rematch_ready"}); _drain(f["w1"]); _drain(f["w2"])
    f["w2"].send_json({"type": "rematch_ready"})
    s = _drain(f["w2"]); _drain(f["w1"])
    assert s["stage"] == "setup" and s["length"] == "squad"
