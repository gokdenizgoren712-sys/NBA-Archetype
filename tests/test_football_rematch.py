# -*- coding: utf-8 -*-
"""Futbol odası rövanşı — "ikisi de dokunmalı" (docs/BACKEND_PROMPT_GAME_UI.md #2).

Final ekranı yalnız "Back to modes" veriyordu: yeni oyun için yeni oda kurmak
gerekiyordu. Rövanş aynı odada başlar, ama ancak İKİ taraf da hazırsa — biri
tek başına başlatsa, sonucu henüz görmemiş rakibin ekranı altından çekilirdi.

Testler gerçek draftları iki soketle sonuna kadar oynatıyor: rövanş, biten bir
eleme olmadan var olmayan bir şey.
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

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbrematch_test_")) / "test.db"
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
    """Beklenen mesaja kadar oku. Hata gelirse orada patlat — sessizce beklemek
    bir sonraki receive'i sonsuza dek bloke eder ve nedeni gizler."""
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


def _play_full_draft(w1, w2, s):
    """Çarktan seçip 22 seçimi bitir. s: draft başlamış state."""
    from football import draft_rules as R
    socks = {1: w1, 2: w2}
    guard = 0
    while s["stage"] == "drafting" and guard < 60:
        guard += 1
        seat = s["activeSeat"]
        pool = (s.get("pool") or {}).get("players") or []
        squad = s["squads"][str(seat)]
        slots = [x for x in R.slots_for(s["shapes"][str(seat)]) if x["id"] not in squad]
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
    assert s["stage"] == "done", f"draft bitmedi (guard={guard})"
    return s


def _begin(w1, w2):
    """İki taraf hazır → draft başlar."""
    w1.send_json({"type": "ready", "ready": True}); _drain(w1); _drain(w2)
    w2.send_json({"type": "ready", "ready": True})
    s = _drain(w2); _drain(w1)
    return s


@pytest.fixture
def finished(client):
    """İki bağlı istemci, ELEMESİ BİTMİŞ bir oda."""
    alice, bob = _user("rm_alice"), _user("rm_bob")
    r = client.post("/api/football/h2h/room", json={"mode": "friend", "season": SEASON},
                    headers=alice["h"])
    code = r.json()["room_code"]
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with client.websocket_connect(f"/ws/football/room/{code}?token={alice['token']}") as w1, \
         client.websocket_connect(f"/ws/football/room/{code}?token={bob['token']}") as w2:
        _drain(w1); _drain(w2)
        s0 = _begin(w1, w2)
        first_uid = s0["seats"][str(s0["activeSeat"])]
        s = _play_full_draft(w1, w2, s0)
        yield {"code": code, "w1": w1, "w2": w2, "alice": alice, "bob": bob,
               "done": s, "first_uid": first_uid, "client": client}


def _row(code):
    from api.db import get_conn
    with get_conn() as conn:
        return conn.execute("SELECT * FROM football_h2h_rooms WHERE room_code=?",
                            (code,)).fetchone()


def test_rematch_is_refused_before_the_tie_is_over(client):
    alice, bob = _user("rm_early_a"), _user("rm_early_b")
    code = client.post("/api/football/h2h/room", json={"mode": "friend", "season": SEASON},
                       headers=alice["h"]).json()["room_code"]
    client.post(f"/api/football/h2h/room/{code}/join", headers=bob["h"])
    with client.websocket_connect(f"/ws/football/room/{code}?token={alice['token']}") as w1:
        _drain(w1)
        w1.send_json({"type": "rematch_ready"})
        assert "not over" in _expect_error(w1)


def test_one_player_ready_changes_nothing_but_the_flag(finished):
    f = finished
    f["w1"].send_json({"type": "rematch_ready"})
    s = _drain(f["w1"]); _drain(f["w2"])
    assert s["stage"] == "done", "tek taraf hazırken oyun yeniden başladı"
    assert s["rematch_ready"] == {str(f["alice"]["id"]): True}
    assert s["seats"] == f["done"]["seats"]
    assert s["result"] == f["done"]["result"], "sonuç silindi"


def test_ready_can_be_taken_back(finished):
    f = finished
    f["w1"].send_json({"type": "rematch_ready", "ready": True}); _drain(f["w1"]); _drain(f["w2"])
    f["w1"].send_json({"type": "rematch_ready", "ready": False})
    s = _drain(f["w1"]); _drain(f["w2"])
    assert s["rematch_ready"] == {str(f["alice"]["id"]): False}
    # Hazır olan tek kişi vazgeçti; öbürü hazır olunca oyun BAŞLAMAMALI.
    f["w2"].send_json({"type": "rematch_ready"})
    s = _drain(f["w2"]); _drain(f["w1"])
    assert s["stage"] == "done"


def test_both_ready_restarts_the_room_with_seats_swapped(finished):
    f = finished
    old = f["done"]
    f["w1"].send_json({"type": "rematch_ready"}); _drain(f["w1"]); _drain(f["w2"])
    f["w2"].send_json({"type": "rematch_ready"})
    s = _drain(f["w2"]); _drain(f["w1"])

    assert s["stage"] == "setup" and s["phase"] == "spinning"
    # Koltuklar yer değiştirdi: önceki misafir artık host.
    assert s["seats"]["1"] == old["seats"]["2"] and s["seats"]["2"] == old["seats"]["1"]
    assert s["names"]["1"] == old["names"]["2"]
    # Temiz sayfa
    assert s["squads"] == {"1": {}, "2": {}} and s["takenIds"] == []
    assert s["filled"] == {"1": 0, "2": 0} and s["pool"] is None and s["result"] is None
    assert s["rematch_ready"] == {}
    # Geçmiş ve sayaç
    assert s["rematches"] == 1 and len(s["history"]) == 1
    assert s["history"][0] == old["result"], "önceki sonuç kayboldu"

    # DB satırı da değişti — yalnız bellek değil
    row = _row(f["code"])
    assert row["p1_user_id"] == f["bob"]["id"] and row["p2_user_id"] == f["alice"]["id"]
    assert row["status"] == "building" and row["result_json"] is None
    assert row["p1_squad_json"] is None and row["p2_squad_json"] is None


def test_the_other_player_picks_first_in_the_rematch(finished):
    f = finished
    f["w1"].send_json({"type": "rematch_ready"}); _drain(f["w1"]); _drain(f["w2"])
    f["w2"].send_json({"type": "rematch_ready"}); _drain(f["w2"]); _drain(f["w1"])
    # Rövanşta socket'ler yeni koltuklarla aynı; draft'ı başlat
    s = _begin(f["w1"], f["w2"])
    second_first_uid = s["seats"][str(s["activeSeat"])]
    assert second_first_uid != f["first_uid"], \
        "ilk seçen rövanşta da aynı kişi — sıra değişmedi"


def test_the_rematch_plays_out_and_resolves_a_new_tie(finished):
    f = finished
    first_result = f["done"]["result"]
    f["w1"].send_json({"type": "rematch_ready"}); _drain(f["w1"]); _drain(f["w2"])
    f["w2"].send_json({"type": "rematch_ready"}); _drain(f["w2"]); _drain(f["w1"])
    s = _begin(f["w1"], f["w2"])

    # Soketler aynı kullanıcıya bağlı; koltuk numaraları takas edildi ama
    # _play_full_draft koltuğa göre değil aktif koltuğa göre gönderiyor —
    # doğru soketi seçmek için user_id → soket eşlemesi gerek.
    from football import draft_rules as R
    by_uid = {f["alice"]["id"]: f["w1"], f["bob"]["id"]: f["w2"]}
    guard = 0
    while s["stage"] == "drafting" and guard < 60:
        guard += 1
        seat = s["activeSeat"]
        me = by_uid[s["seats"][str(seat)]]
        other = f["w2"] if me is f["w1"] else f["w1"]
        pool = (s.get("pool") or {}).get("players") or []
        squad = s["squads"][str(seat)]
        slots = [x for x in R.slots_for(s["shapes"][str(seat)]) if x["id"] not in squad]
        taken = set(s.get("takenIds") or [])
        pick = next(((p, sl["id"]) for p in pool if p["PLAYER_ID"] not in taken
                     for sl in slots if R.can_place(p, sl)), None)
        assert pick, "seçilebilir kimse yok"
        me.send_json({"type": "pick", "player_id": pick[0]["PLAYER_ID"], "slot": pick[1]})
        s = _drain(me); _drain(other)

    assert s["stage"] == "done"
    assert s["result"] and s["result"]["winner"] in ("a", "b")
    assert s["rematches"] == 1
    assert s["history"] == [first_result], "ilk sonuç geçmişte korunmadı"
    assert _row(f["code"])["status"] == "resolved"


def test_a_ready_flag_does_not_survive_the_player_leaving(finished):
    """Hazır deyip giden oyuncunun işareti kalırsa, dönen rakip tıklayınca karşı
    ekranda kimse yokken yeni oyun başlardı."""
    f = finished
    f["w1"].send_json({"type": "rematch_ready"}); _drain(f["w1"]); _drain(f["w2"])
    assert _row(f["code"]) is not None
    import time
    import api.football_ws as fws
    f["w1"].close()

    # ÖNCE sunucu durumuna bak, soketi sonra oku. receive_json zaman aşımı
    # tanımıyor: işaret düşmediyse yayın da gelmez ve soket okuması testi
    # başarısız etmek yerine sonsuza dek bloke ederdi (pytest-timeout Windows'ta
    # tüm süreci öldürüyor, hiçbir sonuç basılmıyor). Burada net bir mesajla düşer.
    end = time.time() + 4
    while time.time() < end and (fws.ROOM_STATES[f["code"]].get("rematch_ready") or {}):
        time.sleep(0.05)
    assert fws.ROOM_STATES[f["code"]].get("rematch_ready") == {},         "giden oyuncunun hazır işareti kaldı"

    # İşaret düştüyse kalan oyuncuya da güncel state gitmiş olmalı.
    seen = None
    for _ in range(6):
        m = f["w2"].receive_json()
        if m.get("type") == "state":
            seen = m
            break
    assert seen is not None, "kalan oyuncuya güncel state gelmedi"
    assert seen["rematch_ready"] == {}


def test_the_room_stops_offering_rematches_at_the_limit(finished):
    import api.football_ws as fws
    f = finished
    fws.ROOM_STATES[f["code"]]["rematches"] = fws.REMATCH_LIMIT
    f["w1"].send_json({"type": "rematch_ready"})
    assert "limit" in _expect_error(f["w1"]).lower()


def test_every_finished_tie_is_written_to_the_permanent_record(finished):
    """Eşleşme kartındaki rakip rekoru bu tablodan geliyor. Oda satırındaki
    result_json yalnız SON elemeyi tutar (rövanş üzerine yazar), o yüzden
    kalıcı kayıt ayrı bir tabloda: her biten eleme bir satır bırakmalı."""
    from api.db import get_conn
    f = finished

    def rows():
        with get_conn() as conn:
            return conn.execute(
                "SELECT * FROM football_h2h_results WHERE room_code=? ORDER BY id",
                (f["code"],)).fetchall()

    first = rows()
    assert len(first) == 1, "biten eleme kalıcı kayda yazılmadı"
    w = f["done"]["result"]["winner"]
    expect = f["done"]["seats"]["1" if w == "a" else "2"]
    assert first[0]["winner_user_id"] == expect, "galip yanlış kullanıcıya yazıldı"

    # Rövanş ikinci bir satır bırakmalı: ilk sonuç oda satırından silinse bile
    # rekor korunur.
    f["w1"].send_json({"type": "rematch_ready"}); _drain(f["w1"]); _drain(f["w2"])
    f["w2"].send_json({"type": "rematch_ready"}); _drain(f["w2"]); _drain(f["w1"])
    assert len(rows()) == 1, "rövanş başlayınca eski kayıt silindi"
