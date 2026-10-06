# -*- coding: utf-8 -*-
"""Futbol Board + meydan okuma (docs/BACKEND_PROMPT_GAME_UI.md #4).

Başkasının kaydettiği 18'lik kadroya karşı draft et. Kadronun sahibi oyunda
YOK: rakibi donmuş bir XI, sonuç ona değil meydan okuyanın kaydına yazılıyor.
Gerçek oyuncularla (parquet) kurulmuş gerçek kadrolar kullanılıyor.
"""

from __future__ import annotations

import itertools
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbboard_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

SEASON = "2023-2024"
_n = itertools.count(1)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    if not (ROOT / "data" / f"football__{SEASON}__scores.parquet").exists():
        pytest.skip("futbol skor verisi yok")
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _fresh_rate_window():
    import api.main as M
    M._RL.clear()
    yield
    M._RL.clear()


def _user():
    from api.auth import create_token
    from api.db import get_conn
    name = f"bd_user_{next(_n)}"
    with get_conn() as conn:
        uid = conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            (name, f"{name}@test.invalid", "x")).lastrowid
    tok = create_token(uid, "user")
    return {"id": uid, "name": name, "token": tok, "h": {"Authorization": "Bearer " + tok}}


@pytest.fixture(scope="module")
def pool():
    """Kulüp başına oyuncu listesi (JSON-güvenli: NaN → null)."""
    import pandas as pd
    df = pd.read_parquet(ROOT / "data" / f"football__{SEASON}__scores.parquet")
    df = df[df["primary_arch"].notna()].sort_values("MINUTES_TOTAL", ascending=False)
    df = df.drop_duplicates("PLAYER_ID")
    out = {}
    for team, g in df.groupby("TEAM"):
        if len(g) >= 18:
            out[team] = json.loads(g.to_json(orient="records"))
    assert out, "18 oyunculu kulüp yok"
    return out


def _roster(pool, team, shape="4-3-3"):
    """Gerçek oyunculardan geçerli bir 18'lik: 11 saha (kaleci kuralına uyan) + 7 yedek."""
    from football import draft_rules as R
    players = pool[team]
    used, roster = set(), []
    for s in R.slots_for(shape):
        p = next((x for x in players if x["PLAYER_ID"] not in used and R.can_place(x, s)), None)
        assert p, f"{team} için {s['id']} slotu doldurulamadı"
        used.add(p["PLAYER_ID"])
        roster.append({**p, "_slot": s["id"]})
    bench = [x for x in players if x["PLAYER_ID"] not in used][:7]
    assert len(bench) == 7
    roster += [{**p, "_slot": f"SUB{i + 1}"} for i, p in enumerate(bench)]
    return roster


def _score_for(pct: int) -> float:
    """Gerçek referans dağılımında o persantile denk gelen ham kimya skoru."""
    from api.main import _chem_reference
    q = _chem_reference()["components"]["score"]["q"]
    return float(q[pct])


def _save(owner, pool, team, pct, shape="4-3-3", roster=None, name=None):
    from api.db import get_conn
    r = roster if roster is not None else _roster(pool, team, shape)
    with get_conn() as conn:
        return conn.execute(
            "INSERT INTO saved_rosters (user_id, name, source_mode, mode, roster_json, "
            "overall_pct, sport) VALUES (?,?,'single',?,?,?, 'football')",
            (owner["id"], name or f"sq{next(_n)}", shape, json.dumps(r),
             _score_for(pct))).lastrowid


def _assert_throwaway_db():
    """Bu dosya `DELETE FROM saved_rosters` çalıştırıyor. Gerçek bir veritabanına
    karşı bu, birinin kayıtlı kadrolarını silmek demek — ve bir keresinde tam bunu
    yaptı (tam suite, geliştiricinin data/app.db'sine düştü). Geçici olduğu
    KANITLANMADAN hiçbir şey silinmez."""
    from api.db import DB_PATH
    tmp = Path(tempfile.gettempdir()).resolve()
    here = Path(DB_PATH).resolve()
    if tmp not in here.parents:
        pytest.fail(f"Yıkıcı test gerçek bir veritabanına yöneliyor: {here}")


@pytest.fixture(autouse=True)
def _wipe_rosters():
    """Board TÜM futbol kadrolarını okuyor; testler birbirinin kadrosunu görmesin."""
    _assert_throwaway_db()
    from api.db import get_conn
    with get_conn() as conn:
        conn.execute("DELETE FROM saved_rosters WHERE sport='football'")
    yield


def _drain(ws, want="state", tries=14):
    for _ in range(tries):
        m = ws.receive_json()
        if m.get("type") == want:
            return m
        if m.get("type") in ("error", "fatal"):
            raise AssertionError(f"sunucu {m['type']}: {m.get('message') or m.get('reason')}")
    raise AssertionError(f"{want} gelmedi")


# ── Board listesi ────────────────────────────────────────────────────────────

def test_the_board_lists_one_squad_per_percentile_best_first(client, pool):
    teams = list(pool)
    a, b, c = _user(), _user(), _user()
    first = _save(a, pool, teams[0], 80)          # 80'e İLK ulaşan
    _save(b, pool, teams[1], 80)                  # aynı persantil, sonradan
    low = _save(c, pool, teams[2], 55)

    es = client.get("/api/football/board").json()["entries"]
    assert [e["pct"] for e in es] == [80, 55], "persantil başına tek, yüksekten düşüğe"
    assert [e["id"] for e in es] == [first, low], "temsilci İLK kaydeden olmalı"
    e = es[0]
    assert e["username"] == a["name"] and e["shape"] == "4-3-3"
    assert len(e["roster"]) == 18
    assert set(e["roster"][0]) == {"PLAYER_ID", "PLAYER_NAME", "TEAM", "LEAGUE", "SEASON",
                                   "PHASE", "POSITION", "primary_arch", "overall_score", "_slot"}, \
        "istemciye tam oyuncu satırı (151 alan) gitmemeli"
    assert e["challenges"] == {"attempts": 0, "beaten": 0}
    assert e["seasons"] and e["leagues"]


def test_the_payload_stays_small(client, pool):
    teams = list(pool)
    for i in range(5):
        _save(_user(), pool, teams[i % len(teams)], 50 + i)
    raw = client.get("/api/football/board").content
    assert len(raw) < 60_000, f"5 kadro {len(raw)} bayt — satır kırpılmamış"


def test_unusable_squads_never_appear(client, pool):
    t = list(pool)[0]
    good = _roster(pool, t)
    owner = _user()
    _save(owner, pool, t, 70, roster=good[:17], name="eksik")                    # 17 kişi
    no_keeper = [dict(p) for p in good]
    gk = next(p for p in no_keeper if p["_slot"] == "GK")
    gk["POSITION"] = "ST"                                                         # kalede forvet
    _save(owner, pool, t, 65, roster=no_keeper, name="kalecisiz")
    twice = [dict(p) for p in good]
    twice[1]["PLAYER_ID"] = twice[2]["PLAYER_ID"]                                 # aynı oyuncu iki kez
    _save(owner, pool, t, 60, roster=twice, name="ikiz")
    ok = _save(owner, pool, t, 50, roster=good, name="saglam")

    es = client.get("/api/football/board").json()["entries"]
    assert [e["id"] for e in es] == [ok], "bozuk kadro Board'a girdi"


def test_at_score_returns_every_squad_at_that_percentile(client, pool):
    teams = list(pool)
    ids = [_save(_user(), pool, teams[i], 72) for i in range(3)]
    _save(_user(), pool, teams[3], 40)
    es = client.get("/api/football/board/at-score", params={"pct": 72}).json()["entries"]
    assert [e["id"] for e in es] == sorted(ids, reverse=True), "hepsi, en yeni önce"
    assert client.get("/api/football/board/at-score", params={"pct": 101}).status_code == 422


# ── Meydan okuma ─────────────────────────────────────────────────────────────

def _challenge(client, who, entry):
    return client.post("/api/football/challenge", json={"entry_id": entry}, headers=who["h"])


def test_challenge_builds_a_frozen_room(client, pool):
    from api.db import get_conn
    import api.football_ws as fws
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    r = _challenge(client, me, entry)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["opponent"]["username"] == owner["name"] and len(body["opponent"]["roster"]) == 18

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM football_h2h_rooms WHERE room_code=?",
                           (body["room_code"],)).fetchone()
    assert row["flow"] == "challenge" and row["mode"] == "challenge"
    assert row["challenge_entry_id"] == entry
    assert (row["p1_user_id"], row["p2_user_id"]) == (me["id"], owner["id"])

    st = fws.ROOM_STATES[body["room_code"]]
    assert len(st["squads"][2]) == 11 and st["ready"]["2"] is True
    assert len(st["takenIds"]) == 11, "rakibin XI'i çarktan çekilebilir kalmış"
    assert st["challenge"]["entry_id"] == entry


def test_challenge_refusals(client, pool):
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    assert _challenge(client, owner, entry).status_code == 400          # kendi kadron
    assert _challenge(client, me, 999999).status_code == 404            # yok
    bad = _save(owner, pool, list(pool)[0], 70, roster=_roster(pool, list(pool)[0])[:17], name="x")
    assert _challenge(client, me, bad).status_code == 409               # kullanılamaz kadro
    assert client.post("/api/football/challenge", json={"entry_id": entry}).status_code == 401
    # bir meydan okuma sürerken ikincisi açılamaz
    assert _challenge(client, me, entry).status_code == 200
    assert _challenge(client, me, entry).status_code == 409


def test_the_squad_owner_is_not_trapped_by_being_challenged(client, pool):
    """Sahibi o oyunda yok, haberi bile yok: açık oda sayılıp eşleştirmeye
    girmesi engellenmemeli."""
    import api.football_ws as fws
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    assert _challenge(client, me, entry).status_code == 200
    assert fws._user_in_open_room(me["id"]) is True
    assert fws._user_in_open_room(owner["id"]) is False


def test_only_the_challenger_can_connect(client, pool):
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    code = _challenge(client, me, entry).json()["room_code"]
    with client.websocket_connect(f"/ws/football/room/{code}?token={owner['token']}") as ws:
        m = ws.receive_json()
    assert m["type"] == "fatal" and m["reason"] == "room_not_found"


def test_squad_submission_is_refused_in_a_challenge_room(client, pool):
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    code = _challenge(client, me, entry).json()["room_code"]
    r = client.post(f"/api/football/h2h/room/{code}/squad", headers=me["h"],
                    json={"entries": [], "shape": "4-3-3"})
    assert r.status_code == 409


def _play_solo(ws, s):
    """Yalnız koltuk 1 draft ediyor; rakip dondurulmuş."""
    from football import draft_rules as R
    guard = 0
    while s["stage"] == "drafting" and guard < 40:
        guard += 1
        assert s["activeSeat"] == 1, "sıra donmuş rakibe geçti"
        taken = set(s["takenIds"])
        squad = s["squads"]["1"]
        slots = [x for x in R.slots_for(s["shapes"]["1"]) if x["id"] not in squad]
        pick = next(((p, sl["id"]) for p in (s["pool"] or {}).get("players", [])
                     if p["PLAYER_ID"] not in taken
                     for sl in slots if R.can_place(p, sl)), None)
        assert pick, "seçilebilir kimse yok"
        ws.send_json({"type": "pick", "player_id": pick[0]["PLAYER_ID"], "slot": pick[1]})
        s = _drain(ws)
    assert s["stage"] == "done", f"draft bitmedi (guard={guard})"
    return s


def test_a_challenge_plays_out_against_the_frozen_squad(client, pool):
    from api.db import get_conn
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    code = _challenge(client, me, entry).json()["room_code"]

    with client.websocket_connect(f"/ws/football/room/{code}?token={me['token']}") as ws:
        s = _drain(ws)
        assert s["stage"] == "setup" and s["ready"]["2"] is True
        assert s["names"]["2"] == owner["name"] and s["challenge"]["entry_id"] == entry
        frozen_ids = set(s["takenIds"])

        ws.send_json({"type": "ready", "ready": True})        # rakibi BEKLEMEZ
        s = _drain(ws)
        assert s["stage"] == "drafting", "meydan okuma rakibin hazır olmasını bekledi"

        s = _play_solo(ws, s)
        mine = {p["PLAYER_ID"] for p in s["squads"]["1"].values()}
        assert not (mine & frozen_ids), "rakibin dondurulmuş oyuncusu draft edildi"
        assert s["result"]["winner"] in ("a", "b")

        # Meydan okumada rövanş yok
        ws.send_json({"type": "rematch_ready"})
        m = ws.receive_json()
        assert m["type"] == "error" and "no rematch" in m["message"]

    with get_conn() as conn:
        res = conn.execute("SELECT * FROM football_challenge_results WHERE room_code=?",
                           (code,)).fetchall()
        h2h = conn.execute("SELECT COUNT(*) FROM football_h2h_results WHERE room_code=?",
                           (code,)).fetchone()[0]
    assert len(res) == 1
    assert (res[0]["challenger_id"], res[0]["entry_id"]) == (me["id"], entry)
    assert res[0]["won"] == (1 if s["result"]["winner"] == "a" else 0)
    assert h2h == 0, "meydan okuma H2H rekoruna yazıldı (sahibi oyunda yoktu)"

    # Board artık bu girişte bir deneme gösteriyor
    es = client.get("/api/football/board").json()["entries"]
    assert es[0]["challenges"] == {"attempts": 1, "beaten": res[0]["won"]}


def test_deleting_the_squad_mid_challenge_does_not_pull_the_room_away(client, pool):
    """Dondurulmuş durum meydan okunduğu ANDA diske yazılıyor; sahibi sonradan
    kadrosunu silerse meydan okuyanın odası düşmemeli."""
    from api.db import get_conn
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    code = _challenge(client, me, entry).json()["room_code"]
    with get_conn() as conn:
        conn.execute("DELETE FROM saved_rosters WHERE id=?", (entry,))
    with client.websocket_connect(f"/ws/football/room/{code}?token={me['token']}") as ws:
        s = _drain(ws)
    assert s["stage"] == "setup" and len(s["squads"]["2"]) == 11


# ── tam kadro (11 + 7 yedek) meydan okuması ──────────────────────────────────
def test_squad_challenge_rejects_an_unknown_length(client, pool):
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    r = client.post("/api/football/challenge", json={"entry_id": entry, "length": "huge"},
                    headers=me["h"])
    assert r.status_code == 400


def test_squad_challenge_needs_a_full_bench(client, pool):
    owner, me = _user(), _user()
    short = [p for p in _roster(pool, list(pool)[0]) if p["_slot"] != "SUB7"]
    entry = _save(owner, pool, list(pool)[0], 75, roster=short)
    r = client.post("/api/football/challenge", json={"entry_id": entry, "length": "squad"},
                    headers=me["h"])
    assert r.status_code == 409, "7 yedeği olmayan kadro tam-kadro meydan okumasına girdi"


def test_squad_challenge_freezes_the_bench_and_skips_hiring(client, pool):
    import api.football_ws as fws
    from football import draft_rules as R
    owner, me = _user(), _user()
    entry = _save(owner, pool, list(pool)[0], 75)
    code = client.post("/api/football/challenge", json={"entry_id": entry, "length": "squad"},
                       headers=me["h"]).json()["room_code"]
    st = fws.ROOM_STATES[code]
    assert st["length"] == "squad"
    assert len(st["squads"][2]) == 18 and len(st["takenIds"]) == 18

    with client.websocket_connect(f"/ws/football/room/{code}?token={me['token']}") as ws:
        s = _drain(ws)
        ws.send_json({"type": "ready", "ready": True})
        s = _drain(ws)
        guard = 0
        while s["stage"] == "drafting" and guard < 60:
            guard += 1
            taken = set(s["takenIds"])
            squad = s["squads"]["1"]
            slots = [x for x in R.slots_for(s["shapes"]["1"])
                     + [{"id": f"SUB{i}", "bench": True} for i in range(1, 8)]
                     if x["id"] not in squad]
            pick = next(((p, sl["id"]) for p in (s["pool"] or {}).get("players", [])
                         if p["PLAYER_ID"] not in taken
                         for sl in slots if R.can_place(p, sl)), None)
            assert pick, "seçilebilir kimse yok"
            ws.send_json({"type": "pick", "player_id": pick[0]["PLAYER_ID"], "slot": pick[1]})
            s = _drain(ws)
        assert s["stage"] == "review" and s["locked"]["2"] is True, \
            "donmuş rakip review'da kilitli başlamadı"
        assert len(s["squads"]["1"]) == 18

        ws.send_json({"type": "lock"})
        s = _drain(ws)
        assert s["stage"] == "done" and s["result"], "meydan okumada menajer aşaması açıldı"
        assert s["manager_options"] == {}
