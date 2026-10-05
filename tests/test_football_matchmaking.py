# -*- coding: utf-8 -*-
"""Futbol Online eşleştirmesi: kabul penceresi, geri sayım, eşleşme kartı.

docs/BACKEND_PROMPT_GAME_UI.md madde 4. Eskiden iki kişi kuyrukta birikince oda
HEMEN açılıyordu — rakip gelmeyecek olsa bile, onu bekleyen bir lobiye girilmiş
oluyordu. Şimdi önce bir "bekleyen eşleşme" var; oda ancak iki taraf da kabul
edince açılıyor.

HER TEST ÖNCE SUNUCU DURUMUNU BEKLER, soketi sonra okur. receive_json zaman aşımı
tanımıyor: bir gerileme yayını hiç göndermezse soket okuması testi başarısız
etmek yerine sonsuza dek bloke eder (pytest-timeout Windows'ta tüm süreci
öldürüyor, hiçbir sonuç basılmıyor). _wait net bir mesajla düşer.
"""

from __future__ import annotations

import contextlib
import itertools
import os
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

_TMP_DB = Path(tempfile.mkdtemp(prefix="fbmm_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

SEASON = "2023-2024"
_ids = itertools.count(1)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    with TestClient(app) as c:
        yield c


def _reset(fws):
    fws.MM_QUEUE.clear()
    fws.MM_PENDING.clear()
    fws.WAIT_SAMPLES.clear()
    for m in list(fws.PENDING_MATCHES.values()):
        t = m.get("task")
        if t is not None:
            t.get_loop().call_soon_threadsafe(t.cancel)
    fws.PENDING_MATCHES.clear()
    fws.USER_MATCH.clear()
    fws.MM_PING.clear()
    fws.MM_PROBED.clear()


@pytest.fixture(autouse=True)
def _clean():
    """Eşleştirme durumu modül düzeyinde ve süreç boyunca paylaşılıyor; hız sınırı
    penceresi de. İkisini de her testin önünde ve ardında boşalt."""
    import api.main as M
    import api.football_ws as fws
    M._RL.clear(); _reset(fws)
    yield
    _reset(fws); M._RL.clear()


def _user():
    """Her test KENDİ kullanıcılarını alır: açık odası olan biri eşleştirmeye
    girmez (409), önceki testin bıraktığı oda bunu kirletirdi."""
    from api.auth import create_token
    from api.db import get_conn
    name = f"mm_user_{next(_ids)}"
    with get_conn() as conn:
        uid = conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            (name, f"{name}@test.invalid", "x")).lastrowid
    tok = create_token(uid, "user")
    return {"id": uid, "name": name, "token": tok, "h": {"Authorization": "Bearer " + tok}}


def _wait(cond, secs=3.0, what=""):
    end = time.time() + secs
    while time.time() < end:
        if cond():
            return
        time.sleep(0.03)
    raise AssertionError(f"beklenen durum oluşmadı: {what}")


def _recv(ws, want, tries=12, ack=True):
    """Beklenen tipe kadar oku; probları cevapla (istemci gibi), gürültüyü atla."""
    for _ in range(tries):
        m = ws.receive_json()
        if m["type"] == "probe" and ack:
            ws.send_json({"type": "probe_ack", "t": m["t"]})
        if m["type"] == want:
            return m
        if m["type"] == "fatal":
            raise AssertionError(m)
    raise AssertionError(f"{want} gelmedi")


@contextlib.contextmanager
def _two(client):
    """İki kullanıcı, ikisinin de eşleştirme soketi açık."""
    a, b = _user(), _user()
    with contextlib.ExitStack() as st:
        wa = st.enter_context(client.websocket_connect(f"/ws/football/matchmaking?token={a['token']}"))
        wb = st.enter_context(client.websocket_connect(f"/ws/football/matchmaking?token={b['token']}"))
        import api.football_ws as fws
        _wait(lambda: a["id"] in fws.MM_WS and b["id"] in fws.MM_WS, what="soketler bağlanmadı")
        yield a, b, wa, wb


def _join(client, u):
    return client.post("/api/football/matchmaking/join", headers=u["h"])


def _match(client, a, b):
    import api.football_ws as fws
    assert _join(client, a).status_code == 200
    assert _join(client, b).status_code == 200
    _wait(lambda: len(fws.PENDING_MATCHES) == 1, what="eşleşme kurulmadı")
    return next(iter(fws.PENDING_MATCHES))


def _rooms_for(*ids):
    from api.db import get_conn
    q = ",".join("?" * len(ids))
    with get_conn() as conn:
        return conn.execute(
            f"SELECT * FROM football_h2h_rooms WHERE p1_user_id IN ({q}) OR p2_user_id IN ({q})",
            ids + ids).fetchall()


# ── Kuyruk ───────────────────────────────────────────────────────────────────

def test_first_player_just_waits(client):
    import api.football_ws as fws
    a = _user()
    r = _join(client, a)
    assert r.status_code == 200 and r.json()["queued"] is True and r.json()["queue_size"] == 1
    assert [e["user_id"] for e in fws.MM_QUEUE] == [a["id"]]
    assert not fws.PENDING_MATCHES


def test_queue_message_never_invents_numbers(client):
    """Veri yokken avg_wait_s None; skill_band futbolda YOK (puan sistemi yok)."""
    a = _user()
    with client.websocket_connect(f"/ws/football/matchmaking?token={a['token']}") as w:
        q = _recv(w, "queue")
    assert q["avg_wait_s"] is None
    assert "skill_band" not in q


# ── Kabul penceresi ──────────────────────────────────────────────────────────

def test_a_pairing_opens_no_room_until_both_accept(client):
    import api.football_ws as fws
    with _two(client) as (a, b, wa, wb):
        mid = _match(client, a, b)
        t0 = int(time.time() * 1000)

        ma, mb = _recv(wa, "matched"), _recv(wb, "matched")
        for m, me, them in ((ma, a, b), (mb, b, a)):
            assert m["match_id"] == mid
            assert "room_code" not in m, "eşleşme kabulden önce oda adresi sızdırdı"
            assert t0 < m["accept_deadline"] <= t0 + fws.ACCEPT_SECONDS * 1000 + 1500
            assert m["accept_seconds"] == fws.ACCEPT_SECONDS
            card = m["opponent"]
            assert card["user_id"] == them["id"] and card["username"] == them["name"]
            assert set(card["record"]) == {"wins", "losses", "played"}
            assert "ping_ms" in card
        assert _rooms_for(a["id"], b["id"]) == [], "kabul edilmemiş eşleşme için oda açıldı"


def test_both_accepting_opens_the_room_and_a_shared_start_time(client):
    import api.football_ws as fws
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _recv(wa, "matched"); _recv(wb, "matched")

        wa.send_json({"type": "accept"})
        _wait(lambda: len(next(iter(fws.PENDING_MATCHES.values()))["accepted"]) == 1,
              what="ilk kabul işlenmedi")
        assert _recv(wb, "opponent_accepted")
        assert _rooms_for(a["id"], b["id"]) == [], "tek kabulle oda açıldı"

        t0 = int(time.time() * 1000)
        wb.send_json({"type": "accept"})
        _wait(lambda: not fws.PENDING_MATCHES, what="iki kabulden sonra eşleşme kapanmadı")
        sa, sb = _recv(wa, "starting"), _recv(wb, "starting")

        assert sa["room_code"] == sb["room_code"]
        assert sa["starts_at"] == sb["starts_at"], "iki taraf farklı başlangıç anı aldı"
        assert t0 < sa["starts_at"] <= t0 + fws.START_DELAY_MS + 1500
        rooms = _rooms_for(a["id"], b["id"])
        assert len(rooms) == 1 and rooms[0]["room_code"] == sa["room_code"]
        assert rooms[0]["mode"] == "online" and rooms[0]["status"] == "building"
        assert {rooms[0]["p1_user_id"], rooms[0]["p2_user_id"]} == {a["id"], b["id"]}
        assert rooms[0]["p1_name"] and rooms[0]["p2_name"]
        assert not fws.USER_MATCH


def test_declining_requeues_the_other_and_drops_the_decliner(client):
    import api.football_ws as fws
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _recv(wa, "matched"); _recv(wb, "matched")
        b_entry = fws.PENDING_MATCHES[next(iter(fws.PENDING_MATCHES))]["entries"][b["id"]]

        wa.send_json({"type": "decline"})
        _wait(lambda: not fws.PENDING_MATCHES, what="red sonrası eşleşme kapanmadı")
        _wait(lambda: [e["user_id"] for e in fws.MM_QUEUE] == [b["id"]],
              what="karşı taraf kuyruğa dönmedi")

        assert _recv(wa, "declined")
        rq = _recv(wb, "requeued")
        assert rq["reason"] == "opponent_declined"
        # Özgün bekleme süresi korunuyor: yeniden SIRANIN SONUNA gitmedi.
        assert fws.MM_QUEUE[0]["joined_at"] == b_entry["joined_at"]
        assert not any(e["user_id"] == a["id"] for e in fws.MM_QUEUE), "reddeden geri döndü"
        assert _rooms_for(a["id"], b["id"]) == []
        assert not fws.USER_MATCH


def test_the_requeued_player_is_paired_with_whoever_is_next(client):
    """Geri dönen oyuncu bekleyip durmasın: sıradaki biri varsa hemen eşleşsin."""
    import api.football_ws as fws
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _recv(wa, "matched"); _recv(wb, "matched")
        wa.send_json({"type": "decline"})
        _wait(lambda: [e["user_id"] for e in fws.MM_QUEUE] == [b["id"]], what="b dönmedi")

        c = _user()
        with client.websocket_connect(f"/ws/football/matchmaking?token={c['token']}") as wc:
            _wait(lambda: c["id"] in fws.MM_WS, what="c bağlanmadı")
            assert _join(client, c).status_code == 200
            _wait(lambda: len(fws.PENDING_MATCHES) == 1, what="b ile c eşleşmedi")
            mc = _recv(wc, "matched")
            assert mc["opponent"]["user_id"] == b["id"]


def test_silence_drops_the_player_who_did_not_answer(client, monkeypatch):
    import api.football_ws as fws
    monkeypatch.setattr(fws, "ACCEPT_SECONDS", 0.4)
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _recv(wa, "matched"); _recv(wb, "matched")
        wa.send_json({"type": "accept"})              # a kabul etti, b sustu
        _wait(lambda: not fws.PENDING_MATCHES, what="süre dolunca eşleşme kapanmadı")
        _wait(lambda: [e["user_id"] for e in fws.MM_QUEUE] == [a["id"]],
              what="kabul eden kuyruğa dönmedi")

        assert _recv(wb, "timed_out"), "cevap vermeyen bilgilendirilmedi"
        assert _recv(wa, "requeued")["reason"] == "opponent_timed_out"
        assert _rooms_for(a["id"], b["id"]) == []


def test_if_nobody_answers_nobody_is_requeued(client, monkeypatch):
    import api.football_ws as fws
    monkeypatch.setattr(fws, "ACCEPT_SECONDS", 0.3)
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _wait(lambda: not fws.PENDING_MATCHES, what="süre dolunca eşleşme kapanmadı")
        assert fws.MM_QUEUE == []
        assert _recv(wa, "timed_out") and _recv(wb, "timed_out")


def test_a_dropped_connection_counts_as_declining(client):
    import api.football_ws as fws
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _recv(wa, "matched"); _recv(wb, "matched")
        wb.close()
        _wait(lambda: not fws.PENDING_MATCHES, what="kopma eşleşmeyi bozmadı")
        _wait(lambda: [e["user_id"] for e in fws.MM_QUEUE] == [a["id"]],
              what="kalan oyuncu kuyruğa dönmedi")
        assert _recv(wa, "requeued")["reason"] == "opponent_disconnected"
        assert not any(e["user_id"] == b["id"] for e in fws.MM_QUEUE)


def test_leaving_the_queue_while_matched_declines(client):
    import api.football_ws as fws
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        _recv(wa, "matched"); _recv(wb, "matched")
        assert client.delete("/api/football/matchmaking", headers=a["h"]).status_code == 200
        _wait(lambda: [e["user_id"] for e in fws.MM_QUEUE] == [b["id"]],
              what="DELETE reddetme sayılmadı")
        assert _recv(wb, "requeued")["reason"] == "opponent_declined"


def test_a_player_with_a_waiting_match_cannot_join_again(client):
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        r = _join(client, a)
        assert r.status_code == 409


def test_accepting_with_nothing_to_accept_is_an_error(client):
    a = _user()
    with client.websocket_connect(f"/ws/football/matchmaking?token={a['token']}") as w:
        _recv(w, "queue")
        w.send_json({"type": "accept"})
        assert "no match" in _recv(w, "error")["message"].lower()


# ── Eşleşme kartı ────────────────────────────────────────────────────────────

def test_the_opponent_card_carries_a_measured_ping(client):
    """İstemci probu cevaplayınca ping_ms ölçülmüş bir sayı olur; cevaplamayan
    için None kalır — uydurulmaz."""
    import api.football_ws as fws
    a, b = _user(), _user()
    with client.websocket_connect(f"/ws/football/matchmaking?token={a['token']}") as wa, \
         client.websocket_connect(f"/ws/football/matchmaking?token={b['token']}") as wb:
        _wait(lambda: a["id"] in fws.MM_WS and b["id"] in fws.MM_WS, what="bağlanmadı")
        _recv(wa, "probe", ack=True)                       # a probu cevaplar
        _wait(lambda: a["id"] in fws.MM_PING, what="a'nın ping'i ölçülmedi")
        # b hiçbir probu cevaplamadı
        assert b["id"] not in fws.MM_PING

        _join(client, a); _join(client, b)
        _wait(lambda: len(fws.PENDING_MATCHES) == 1, what="eşleşme kurulmadı")
        mb = _recv(wb, "matched", ack=False)               # b, a'yı görür
        assert isinstance(mb["opponent"]["ping_ms"], int) and mb["opponent"]["ping_ms"] >= 0
        ma = _recv(wa, "matched")                          # a, b'yi görür
        assert ma["opponent"]["ping_ms"] is None


def test_the_opponent_card_shows_the_real_record(client):
    from api.main import _record_h2h_result
    a, b = _user(), _user()
    rival = _user()
    # a: 2 galibiyet, 1 mağlubiyet — gerçek kayıt yoluyla yazıldı
    for code, winner in (("R1", "a"), ("R2", "a"), ("R3", "b")):
        _record_h2h_result({"room_code": code, "p1_user_id": a["id"], "p2_user_id": rival["id"]},
                           {"winner": winner, "decidedBy": "aggregate"})
    import api.football_ws as fws
    with client.websocket_connect(f"/ws/football/matchmaking?token={a['token']}") as wa, \
         client.websocket_connect(f"/ws/football/matchmaking?token={b['token']}") as wb:
        _wait(lambda: a["id"] in fws.MM_WS and b["id"] in fws.MM_WS, what="bağlanmadı")
        _join(client, a); _join(client, b)
        _wait(lambda: len(fws.PENDING_MATCHES) == 1, what="eşleşme kurulmadı")
        mb = _recv(wb, "matched")
        assert mb["opponent"]["record"] == {"wins": 2, "losses": 1, "played": 3}
        ma = _recv(wa, "matched")
        assert ma["opponent"]["record"] == {"wins": 0, "losses": 0, "played": 0}


def test_average_wait_appears_only_after_a_match_has_happened(client):
    import api.football_ws as fws
    assert fws._queue_msg()["avg_wait_s"] is None
    with _two(client) as (a, b, wa, wb):
        _match(client, a, b)
        avg = fws._queue_msg()["avg_wait_s"]
        assert isinstance(avg, float) and avg >= 0


# ── Kuyruktan düşme ──────────────────────────────────────────────────────────

def test_closing_the_socket_removes_you_from_the_queue(client):
    """Sayfadan çıkınca arama biter (docs #4.4 — davranış belgelendi ve sınandı)."""
    import api.football_ws as fws
    a = _user()
    with client.websocket_connect(f"/ws/football/matchmaking?token={a['token']}") as w:
        _wait(lambda: a["id"] in fws.MM_WS, what="bağlanmadı")
        _join(client, a)
        assert [e["user_id"] for e in fws.MM_QUEUE] == [a["id"]]
    _wait(lambda: not fws.MM_QUEUE, what="soket kapanınca kuyrukta kaldı")


def test_a_rest_only_entry_expires(client):
    """REST ile girip soketi hiç açmayan istemci sonsuza dek kuyrukta kalıp bir
    sonraki eşleşmeyi gelmeyecek biriyle kurmasın."""
    import api.football_ws as fws
    ghost, real = _user(), _user()
    fws.MM_QUEUE.append({"user_id": ghost["id"],
                         "joined_at": datetime.now(timezone.utc) - timedelta(seconds=fws.QUEUE_STALE_S + 30)})
    r = _join(client, real)
    assert r.status_code == 200 and r.json()["queue_size"] == 1, "bayat girdi kuyrukta kaldı"
    assert [e["user_id"] for e in fws.MM_QUEUE] == [real["id"]]


def test_a_fresh_rest_only_entry_is_kept_while_its_socket_may_still_connect(client):
    """Yeni girmiş ve soketi biraz sonra açacak istemciyi atmamalı (yarış)."""
    import api.football_ws as fws
    early, real = _user(), _user()
    fws.MM_QUEUE.append({"user_id": early["id"], "joined_at": datetime.now(timezone.utc)})
    _join(client, real)
    assert early["id"] in [e["user_id"] for e in fws.MM_QUEUE] or fws.PENDING_MATCHES


def test_a_requeued_player_keeps_their_place_in_line(client):
    """Kusuru olmayan oyuncu, rakibi reddetti diye sıranın SONUNA gitmemeli.

    Bunu ancak arkada bir üçüncü oyuncu varken görebiliriz: b geri döner ve c ile
    eşleşir; kim ev sahibi (p1) olur? Önde bekleyen — yani b. Sona atılsaydı c
    olurdu. (Tek kişilik kuyrukta ön ile son aynı şey, bu yüzden önceki testler
    bunu yakalayamıyordu.)"""
    import api.football_ws as fws
    a, b, c = _user(), _user(), _user()
    with contextlib.ExitStack() as st:
        w = {u["id"]: st.enter_context(client.websocket_connect(
                f"/ws/football/matchmaking?token={u['token']}")) for u in (a, b, c)}
        _wait(lambda: all(u["id"] in fws.MM_WS for u in (a, b, c)), what="bağlanmadı")

        _join(client, a); _join(client, b)               # a+b eşleşir
        _wait(lambda: len(fws.PENDING_MATCHES) == 1, what="a+b eşleşmedi")
        _join(client, c)                                  # c arkada bekler
        assert [e["user_id"] for e in fws.MM_QUEUE] == [c["id"]]

        w[a["id"]].send_json({"type": "decline"})
        # b öne döner → c ile hemen yeni eşleşme
        _wait(lambda: len(fws.PENDING_MATCHES) == 1
              and set(next(iter(fws.PENDING_MATCHES.values()))["users"]) == {b["id"], c["id"]},
              what="b ile c eşleşmedi")

        w[b["id"]].send_json({"type": "accept"})
        w[c["id"]].send_json({"type": "accept"})
        # Eşleşme kaydı oda satırından ÖNCE siliniyor; "eşleşme kapandı"yı
        # beklemek yetmez, satırın kendisini bekle (yoksa o aradaki an okunur).
        _wait(lambda: len(_rooms_for(b["id"], c["id"])) == 1, what="b+c odayı açmadı")
        rooms = _rooms_for(b["id"], c["id"])
        assert len(rooms) == 1
        assert rooms[0]["p1_user_id"] == b["id"], \
            "daha önce bekleyen b host olmalıydı; geri dönen sıranın sonuna atılmış"


def test_deleting_an_account_anonymises_results_but_keeps_the_survivors_record(client):
    """Kalıcı sonuç tablosu kullanıcı kimliği taşıyor; hesap silinince o kimlik
    gitmeli (gizlilik) — ama rakibin REKORU bozulmamalı: sağ kalanın galibiyetleri
    yerinde durur, yalnız silinen kullanıcı anonimleşir."""
    from api.db import get_conn
    from api.main import _record_h2h_result, _h2h_record, _delete_account
    survivor, leaving = _user(), _user()
    for code, winner in (("D1", "a"), ("D2", "a"), ("D3", "b")):
        _record_h2h_result({"room_code": code, "p1_user_id": survivor["id"],
                            "p2_user_id": leaving["id"]},
                           {"winner": winner, "decidedBy": "aggregate"})
    assert _h2h_record(survivor["id"]) == {"wins": 2, "losses": 1, "played": 3}

    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        _delete_account(conn, leaving["id"])
    with get_conn() as conn:
        leaked = conn.execute(
            "SELECT COUNT(*) FROM football_h2h_results WHERE p1_user_id=? OR p2_user_id=? "
            "OR winner_user_id=?", (leaving["id"],) * 3).fetchone()[0]
        kept = conn.execute("SELECT COUNT(*) FROM football_h2h_results "
                            "WHERE p1_user_id=?", (survivor["id"],)).fetchone()[0]
    assert leaked == 0, "silinen hesabın kimliği sonuç tablosunda kaldı"
    assert kept == 3, "sağ kalanın satırları silindi"
    assert _h2h_record(survivor["id"]) == {"wins": 2, "losses": 1, "played": 3}, \
        "rakibin hesabı silinince sağ kalanın rekoru bozuldu"
