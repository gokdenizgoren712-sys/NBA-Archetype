# -*- coding: utf-8 -*-
"""Futbol odası — karşı-jokerler (Ban / Force Club / Force Year) ve 15 sn pencere.

Pencere her seçim turu başında bekleyen tarafa açılır; o karar verene (ya da süre
dolana) kadar aktif taraf seçemez, joker kullanamaz. Varsayılan KAPALI — pencereyi
bilmeyen istemci takılmasın.
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbcounter_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

from test_football_squad_flow import (  # noqa: E402
    SEASON, _drain, _expect_error, _start, _user,
)


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


def _room_code(client, a, b, counters=True):
    code = client.post("/api/football/h2h/room",
                       json={"mode": "friend", "season": SEASON, "counters": counters},
                       headers=a["h"]).json()["room_code"]
    client.post(f"/api/football/h2h/room/{code}/join", headers=b["h"])
    return code


def _make(client, tag, counters=True):
    a, b = _user(f"cj_{tag}_a"), _user(f"cj_{tag}_b")
    return a, b, _room_code(client, a, b, counters)


@pytest.fixture
def room(client, request):
    a, b, code = _make(client, request.node.name[:18])
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _start(w1, w2)
        act = s["activeSeat"]
        yield {"s": s, "socks": {1: w1, 2: w2}, "act": act, "wait": 3 - act,
               "code": code, "client": client}


def _send(r, seat, msg):
    """Mesajı yolla, iki tarafın yayınını oku, gönderenin yayınını döndür."""
    r["socks"][seat].send_json(msg)
    s = _drain(r["socks"][seat])
    _drain(r["socks"][3 - seat])
    return s


def _err(r, seat, msg):
    r["socks"][seat].send_json(msg)
    return _expect_error(r["socks"][seat])


def _pick_msg(s, seat, skip=()):
    from football import draft_rules as R
    squad = s["squads"][str(seat)]
    slots = [x for x in R.slots_for(s["shapes"][str(seat)]) if x["id"] not in squad]
    taken = set(s["takenIds"]) | set(skip)
    for p in s["pool"]["players"]:
        if p["PLAYER_ID"] in taken:
            continue
        sl = next((x for x in slots if R.can_place(p, x)), None)
        if sl:
            return {"type": "pick", "player_id": p["PLAYER_ID"], "slot": sl["id"]}
    raise AssertionError("seçilebilir oyuncu yok")


def test_counters_are_off_by_default_and_the_turn_is_never_blocked(client):
    a, b, code = _make(client, "off", counters=False)
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _start(w1, w2)
        assert s["counters"] is False and s["counter_pending"] is False
        act = s["activeSeat"]
        socks = {1: w1, 2: w2}
        socks[3 - act].send_json({"type": "counter", "counter": "pass"})
        assert "off in this room" in _expect_error(socks[3 - act])
        socks[act].send_json(_pick_msg(s, act))
        assert _drain(socks[act])["squads"][str(act)]


def test_a_turn_opens_a_fifteen_second_window(room):
    s = room["s"]
    assert s["counters"] is True and s["counter_pending"] is True
    left = s["counter_deadline"] - int(time.time() * 1000)
    assert 13_000 < left <= 15_100, f"pencere {left} ms"
    assert s["banned"] is None


def test_the_active_player_cannot_pick_or_joker_while_the_window_is_open(room):
    act = room["act"]
    assert "deciding" in _err(room, act, _pick_msg(room["s"], act))
    assert "deciding" in _err(room, act, {"type": "joker", "joker": "reBoth"})


def test_passing_opens_the_turn(room):
    s = _send(room, room["wait"], {"type": "counter", "counter": "pass"})
    assert s["counter_pending"] is False and s["counter_dismissed"] is True
    out = _send(room, room["act"], _pick_msg(s, room["act"]))
    assert out["squads"][str(room["act"])]


def test_only_the_waiting_player_can_counter(room):
    assert "waiting player" in _err(room, room["act"], {"type": "counter", "counter": "pass"})


def test_unknown_counter_is_refused(room):
    assert "Unknown counter" in _err(room, room["wait"], {"type": "counter", "counter": "reBoth"})


def test_ban_blocks_that_player_only_and_spends_the_hak(room):
    s0 = room["s"]
    target = next(p for p in s0["pool"]["players"])
    s = _send(room, room["wait"], {"type": "counter", "counter": "ban",
                                   "player_id": target["PLAYER_ID"]})
    assert s["banned"] == target["PLAYER_ID"] and s["counter_pending"] is False
    assert s["jokers"][str(room["wait"])]["ban"] is False
    assert s["jokers"][str(room["act"])]["ban"] is True, "hak aktif tarafın hanesinden düştü"

    bad = {"type": "pick", "player_id": target["PLAYER_ID"],
           "slot": _pick_msg(s, room["act"])["slot"]}
    assert "banned" in _err(room, room["act"], bad)
    out = _send(room, room["act"], _pick_msg(s, room["act"], skip={target["PLAYER_ID"]}))
    assert out["banned"] is None, "ban sonraki tura taştı"


def test_ban_rejects_a_player_who_is_not_on_the_wheel(room):
    assert "not in the squad" in _err(room, room["wait"],
                                      {"type": "counter", "counter": "ban", "player_id": -5})


def test_using_any_own_joker_lifts_the_ban(room):
    target = room["s"]["pool"]["players"][0]
    _send(room, room["wait"], {"type": "counter", "counter": "ban",
                               "player_id": target["PLAYER_ID"]})
    s = _send(room, room["act"], {"type": "joker", "joker": "discover"})
    assert s["banned"] is None


def test_force_club_keeps_the_season_and_spends_the_hak(room):
    old = room["s"]["pool"]
    s = _send(room, room["wait"], {"type": "counter", "counter": "forceTeam"})
    assert s["pool"]["season"] == old["season"] and s["pool"]["team"] != old["team"]
    assert s["jokers"][str(room["wait"])]["forceTeam"] is False
    assert s["counter_pending"] is False and s["banned"] is None


def test_force_year_keeps_the_club(room):
    old = room["s"]["pool"]
    s = _send(room, room["wait"], {"type": "counter", "counter": "forceYear"})
    assert s["pool"]["team"] == old["team"] and s["pool"]["season"] != old["season"]


def test_a_failed_force_does_not_burn_the_hak(room, monkeypatch):
    import api.football_ws as W
    monkeypatch.setattr(W, "_spin", lambda state, **kw: False)
    assert "No fresh option" in _err(room, room["wait"], {"type": "counter", "counter": "forceTeam"})
    monkeypatch.undo()
    st = W.ROOM_STATES[room["code"]]
    assert st["jokers"][str(room["wait"])]["forceTeam"] is True
    assert st["counter_pending"] if "counter_pending" in st else True


def test_the_window_closes_by_itself_when_time_runs_out(client, monkeypatch):
    import api.football_ws as W
    monkeypatch.setattr(W, "COUNTER_SECONDS", 0.4)
    a, b, code = _make(client, "timer")
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _start(w1, w2)
        assert s["counter_pending"] is True
        act = s["activeSeat"]
        socks = {1: w1, 2: w2}
        # Bekleyen hiçbir şey yapmıyor: sunucu kendi yayınlamalı.
        t = _drain(socks[act])
        assert t["counter_dismissed"] is True and t["counter_pending"] is False
        assert t["banned"] is None
        socks[act].send_json(_pick_msg(t, act))
        assert _drain(socks[act])["squads"][str(act)], "süre dolduktan sonra seçim açılmadı"


def test_a_counter_before_the_deadline_is_not_undone_by_the_timer(client, monkeypatch):
    import api.football_ws as W
    monkeypatch.setattr(W, "COUNTER_SECONDS", 0.6)
    a, b, code = _make(client, "cancel")
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _start(w1, w2)
        act, wait = s["activeSeat"], 3 - s["activeSeat"]
        socks = {1: w1, 2: w2}
        target = s["pool"]["players"][0]
        socks[wait].send_json({"type": "counter", "counter": "ban",
                               "player_id": target["PLAYER_ID"]})
        _drain(socks[wait]); _drain(socks[act])
        time.sleep(1.0)
        st = W.ROOM_STATES[code]
        assert st["banned"] == target["PLAYER_ID"], "zamanlayıcı banı bozdu"
        assert st["counter_dismissed"] is True


def test_every_new_turn_opens_a_fresh_window_for_the_new_waiting_player(room):
    s = _send(room, room["wait"], {"type": "counter", "counter": "pass"})
    out = _send(room, room["act"], _pick_msg(s, room["act"]))
    assert out["activeSeat"] == room["wait"]
    assert out["counter_pending"] is True and out["banned"] is None


def test_no_window_when_the_waiting_player_has_no_counter_left(room):
    import api.football_ws as W
    s = _send(room, room["wait"], {"type": "counter", "counter": "pass"})
    st = W.ROOM_STATES[room["code"]]
    for k in ("ban", "forceTeam", "forceYear"):
        st["jokers"][str(room["act"])][k] = False       # sıradaki bekleyen = şimdiki aktif
    out = _send(room, room["act"], _pick_msg(s, room["act"]))
    assert out["counter_pending"] is False and out["counter_deadline"] is None


def test_pick_two_second_pick_does_not_reopen_the_window(room):
    s = _send(room, room["wait"], {"type": "counter", "counter": "pass"})
    s = _send(room, room["act"], {"type": "joker", "joker": "double"})
    s = _send(room, room["act"], _pick_msg(s, room["act"]))
    assert s["activeSeat"] == room["act"] and s["counter_pending"] is False
    s = _send(room, room["act"], _pick_msg(s, room["act"]))
    assert s["counter_pending"] is True, "ikinci seçimden sonra yeni tur penceresi açılmadı"


def test_counters_setting_is_host_only_and_setup_only(client):
    a, b, code = _make(client, "host", counters=False)
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        w2.send_json({"type": "counters", "on": True})
        assert "opened the room" in _expect_error(w2)
        w1.send_json({"type": "counters", "on": True})
        assert _drain(w1)["counters"] is True
        _drain(w2)
        _start(w1, w2)
        w1.send_json({"type": "counters", "on": False})
        assert "already started" in _expect_error(w1)


def test_the_rematch_keeps_counters_and_refills_the_haks(room):
    import api.football_ws as W
    st = W.ROOM_STATES[room["code"]]
    st["jokers"][str(room["wait"])]["ban"] = False
    st["jokers"][str(room["act"])]["reBoth"] = False
    W._start_rematch(room["code"], st)                 # gerçek rövanş yolu
    assert st["stage"] == "setup" and st["counters"] is True
    assert all(v for seat in st["jokers"].values() for v in seat.values()), "haklar geri gelmedi"
    assert st["counter_deadline"] is None and st["banned"] is None


def test_an_expired_window_never_locks_the_turn_even_if_the_timer_was_lost(room):
    """Sunucu yeniden başlayıp zamanlayıcı görevi kaybolsa da tur kilitli kalmamalı."""
    import api.football_ws as W
    st = W.ROOM_STATES[room["code"]]
    st["counter_deadline"] = int(time.time() * 1000) - 1000      # geçmiş, bayrak hâlâ false
    assert st["counter_dismissed"] is False
    out = _send(room, room["act"], _pick_msg(room["s"], room["act"]))
    assert out["squads"][str(room["act"])]
