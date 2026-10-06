# -*- coding: utf-8 -*-
"""Futbol odası — kendi jokerleri (Club / Year / Both / Pick 2 / Discover).

Sunucu otoriter: hak sunucuda tutulur, çarkı sunucu yeniden çevirir, Pick 2'nin
"sıra değişmez" kuralını sunucu uygular. İstemci yalnız mesaj yollar.
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
sys.path.insert(0, str(Path(__file__).resolve().parent))

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbjoker_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

from test_football_squad_flow import (  # noqa: E402
    SEASON, _drain, _expect_error, _open_room, _start, _user,
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


@pytest.fixture
def room(client):
    """Draftın başladığı, havuzun indiği oda. active/waiting: aktif ve bekleyen soket."""
    a, b = _user("jk_alice"), _user("jk_bob")
    code = _open_room(client, a, b, length="xi")
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={b['token']}") as w2:
        _drain(w1); _drain(w2)
        s = _start(w1, w2)
        socks = {1: w1, 2: w2}
        act = s["activeSeat"]
        yield {"s": s, "socks": socks, "act": act, "wait": 3 - act,
               "client": client, "code": code}


def _joker(r, kind, seat=None):
    """Joker yolla; iki tarafın da yayınını oku; yayını döndür."""
    seat = seat or r["act"]
    r["socks"][seat].send_json({"type": "joker", "joker": kind})
    s = _drain(r["socks"][seat])
    _drain(r["socks"][3 - seat])
    return s


def _key(s):
    return (s["pool"]["team"], s["pool"]["season"])


def test_every_seat_starts_with_every_joker(room):
    j = room["s"]["jokers"]
    for seat in ("1", "2"):
        assert all(j[seat][k] for k in ("reTeam", "reYear", "reBoth", "double", "discover"))
    assert room["s"]["double"] is False and room["s"]["discover"] is False


def test_only_the_active_seat_may_use_a_joker(room):
    w = room["socks"][room["wait"]]
    w.send_json({"type": "joker", "joker": "reBoth"})
    assert "not your turn" in _expect_error(w)


def test_unknown_joker_is_refused(room):
    w = room["socks"][room["act"]]
    w.send_json({"type": "joker", "joker": "ban"})       # karşı-joker kendi joker değil
    assert "Unknown joker" in _expect_error(w)


def test_re_both_spins_a_fresh_pool_and_spends_the_joker(room):
    old = _key(room["s"])
    s = _joker(room, "reBoth")
    assert _key(s) != old
    assert s["jokers"][str(room["act"])]["reBoth"] is False
    assert s["jokers"][str(room["wait"])]["reBoth"] is True, "joker iki tarafa birden harcandı"
    assert s["activeSeat"] == room["act"] and s["phase"] == "drafting"


def test_a_joker_can_be_used_only_once(room):
    _joker(room, "reBoth")
    w = room["socks"][room["act"]]
    w.send_json({"type": "joker", "joker": "reBoth"})
    assert "already used" in _expect_error(w)


def test_re_club_keeps_the_season(room):
    old = room["s"]["pool"]
    s = _joker(room, "reTeam")
    assert s["pool"]["season"] == old["season"] and s["pool"]["team"] != old["team"]


def test_re_year_keeps_the_club(room):
    old = room["s"]["pool"]
    s = _joker(room, "reYear")
    assert s["pool"]["team"] == old["team"] and s["pool"]["season"] != old["season"]


def test_a_failed_respin_does_not_burn_the_joker(room, monkeypatch):
    import api.football_ws as W
    monkeypatch.setattr(W, "_spin", lambda state, **kw: False)
    w = room["socks"][room["act"]]
    w.send_json({"type": "joker", "joker": "reTeam"})
    assert "No fresh option" in _expect_error(w)
    monkeypatch.undo()
    st = W.ROOM_STATES[room["code"]]
    assert st["jokers"][str(room["act"])]["reTeam"] is True
    assert st["pool"]["team"] == room["s"]["pool"]["team"], "çark yine de değişti"


def _pick(r, seat, nth=0):
    """Havuzdan seat için seçilebilir nth oyuncuyu ilk uygun slota koy."""
    from football import draft_rules as R
    s = r["last"]
    squad = s["squads"][str(seat)]
    slots = [x for x in R.slots_for(s["shapes"][str(seat)]) if x["id"] not in squad]
    taken = set(s["takenIds"])
    found = 0
    for p in s["pool"]["players"]:
        if p["PLAYER_ID"] in taken:
            continue
        sl = next((x for x in slots if R.can_place(p, x)), None)
        if sl is None:
            continue
        if found == nth:
            r["socks"][seat].send_json({"type": "pick", "player_id": p["PLAYER_ID"],
                                        "slot": sl["id"]})
            out = _drain(r["socks"][seat]); _drain(r["socks"][3 - seat])
            r["last"] = out
            return out
        found += 1
    raise AssertionError("seçilebilir oyuncu yok")


def test_pick_two_keeps_the_turn_for_a_second_pick(room):
    room["last"] = room["s"]
    s = _joker(room, "double")
    room["last"] = s
    assert s["double"] is True and s["activeSeat"] == room["act"]

    s = _pick(room, room["act"])
    assert s["activeSeat"] == room["act"], "ilk seçimde sıra rakibe geçti"
    assert s["phase"] == "drafting" and s["double"] is False
    assert s["jokers"][str(room["act"])]["double"] is False

    s = _pick(room, room["act"])
    assert s["activeSeat"] != room["act"] or s["phase"] != "drafting" or s["round"] > 1, \
        "ikinci seçimden sonra da sıra aynı oyuncuda kaldı"
    assert len(s["squads"][str(room["act"])]) == 2


def test_without_pick_two_one_pick_passes_the_turn(room):
    room["last"] = room["s"]
    s = _pick(room, room["act"])
    assert not (s["activeSeat"] == room["act"] and s["phase"] == "drafting")


def test_discover_turns_on_and_clears_after_the_pick(room):
    room["last"] = room["s"]
    s = _joker(room, "discover")
    room["last"] = s
    assert s["discover"] is True
    s = _pick(room, room["act"])
    assert s["discover"] is False, "Discover bir sonraki tura taştı"


def test_discover_survives_the_second_pick_of_pick_two(room):
    room["last"] = room["s"]
    _joker(room, "double")
    s = _joker(room, "discover")
    room["last"] = s
    s = _pick(room, room["act"])
    assert s["discover"] is True and s["activeSeat"] == room["act"]


def test_a_respin_drops_discover(room):
    s = _joker(room, "discover")
    assert s["discover"] is True
    s = _joker(room, "reBoth")
    assert s["discover"] is False, "eski havuz için açılan Discover yeni havuza geçti"


def test_jokers_are_locked_outside_drafting(client):
    a, b = _user("jk_lock_a"), _user("jk_lock_b")
    code = _open_room(client, a, b, length="xi")
    with client.websocket_connect(f"/ws/football/room/{code}?token={a['token']}") as w1:
        _drain(w1)
        w1.send_json({"type": "joker", "joker": "reBoth"})
        assert "Not drafting" in _expect_error(w1)


def test_rematch_gives_every_joker_back(room):
    from test_football_squad_flow import _play_draft
    s = _play_draft(room["socks"][1], room["socks"][2], room["s"])
    assert s["stage"] == "done"
    for seat in (1, 2):
        room["socks"][seat].send_json({"type": "rematch_ready"})
        _drain(room["socks"][seat]); _drain(room["socks"][3 - seat])
    import api.football_ws as W
    st = W.ROOM_STATES[room["code"]]
    assert st["stage"] == "setup"
    assert all(v for seat in st["jokers"].values() for v in seat.values())
