# -*- coding: utf-8 -*-
"""Oda içi canlı draft — futbol (WebSocket).

Same Screen'de iki oyuncu aynı ekrana bakıyor, sıra ve havuz istemcide
durabilir. İki cihazda duramaz: sıranın kimde olduğuna, çarkın neye düştüğüne
ve bir seçimin geçerli olup olmadığına karar veren taraf sunucu olmalı, yoksa
"sıra bende" demek istemcinin elinde olur.

BASKETBOLDAN FARK (api/game_ws.py, 1249 satır)
──────────────────────────────────────────────
Basketbolda sunucu ince: rastgele kararları çözüp yayınlıyor, skoru/uygunluğu
istemciye bırakıyor ("her iki taraf da aynı senkron veriden deterministik
hesaplar"). Futbolda kuralların sunucu kopyası ZATEN var (draft_rules.py, oda
gönderimini doğrulamak için yazıldı), o yüzden burada seçim geçerliliğini de
sunucu karara bağlıyor — istemciye güvenmek için bir sebep yokken güvenmiyoruz.
Sonuç yine tek yerde çözülüyor: draft bitince kadrolar oda satırına yazılıyor
ve main.py'deki _resolve_h2h aynı elemeyi oynatıyor (submit akışıyla ortak).

DURUM: bellekte ROOM_STATES + her değişiklikte DB'ye (draft_state_json).
Deploy/çökme aktif draftı silmesin diye — basketbolda bu ders zaten alınmıştı.
"""

from __future__ import annotations

import asyncio
import json
import random
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import (APIRouter, Depends, HTTPException, WebSocket,
                     WebSocketDisconnect, Query)

from .auth import _decode, _is_banned, get_current_user
from .db import get_conn

router = APIRouter()

ROOM_STATES: dict[str, dict] = {}
ROOM_LOCKS: dict[str, asyncio.Lock] = {}
CONNS: dict[str, dict[int, WebSocket]] = {}

SPIN_MIN_PLAYERS = 13     # bu kadar oyuncusu olmayan kulüp-sezon çarka girmez
STALE_HOURS = 12


# ── Yardımcılar ──────────────────────────────────────────────────────────────

def _rules():
    from .main import _draft_rules
    return _draft_rules()


def _lock(code: str) -> asyncio.Lock:
    if code not in ROOM_LOCKS:
        ROOM_LOCKS[code] = asyncio.Lock()
    return ROOM_LOCKS[code]


async def _reject(ws: WebSocket, reason: str, message: str) -> None:
    """Kalıcı red. accept()'TEN SONRA gerçek bir mesajla — handshake
    tamamlanmadan kapatılan bağlantıda tarayıcı close code'u güvenilir
    iletmiyor (çoğu yerde düz 1006), istemci bunu geçici kopma sanıp sonsuza
    dek yeniden deniyor. Basketbolda tam olarak bu yaşandı (game_ws._reject)."""
    await ws.accept()
    try:
        await ws.send_json({"type": "fatal", "reason": reason, "message": message})
    except Exception:
        pass
    await ws.close(code=1000)


def _row(code: str):
    with get_conn() as conn:
        return conn.execute("SELECT * FROM football_h2h_rooms WHERE room_code=?",
                            (code,)).fetchone()


async def _broadcast(code: str, msg: dict, exclude: int | None = None) -> None:
    for uid, ws in list(CONNS.get(code, {}).items()):
        if uid == exclude:
            continue
        try:
            await ws.send_json(msg)
        except Exception:
            pass


def _save(code: str, state: dict) -> None:
    state["_updated"] = datetime.now(timezone.utc).isoformat()
    ROOM_STATES[code] = state
    try:
        with get_conn() as conn:
            conn.execute("UPDATE football_h2h_rooms SET draft_state_json=?, "
                         "updated_at=datetime('now') WHERE room_code=?",
                         (json.dumps(state, ensure_ascii=False), code))
    except Exception as e:                                  # pragma: no cover
        print(f"[football_ws] state kaydedilemedi {code}: {e}", flush=True)


def _restore(row) -> dict | None:
    raw = row["draft_state_json"] if "draft_state_json" in row.keys() else None
    if not raw:
        return None
    try:
        st = json.loads(raw)
    except Exception:
        return None
    # JSON anahtarları string'e dönüyor — draft_rules int koltuk bekliyor
    st["shapes"] = {int(k): v for k, v in st.get("shapes", {}).items()}
    st["squads"] = {int(k): v for k, v in st.get("squads", {}).items()}
    st["seats"] = {int(k): v for k, v in st.get("seats", {}).items()}
    return st


# ── Durum ────────────────────────────────────────────────────────────────────

def _init_state(row) -> dict:
    R = _rules()
    p1, p2 = row["p1_user_id"], row["p2_user_id"]
    first = 1 if random.random() < 0.5 else 2
    d = R.create_draft(shapes={1: "4-3-3", 2: "4-3-3"}, wheel_mode="round", first=first)
    d.update({
        "seats": {1: p1, 2: p2},
        "names": {"1": row["p1_name"] or "Player 1", "2": row["p2_name"] or "Player 2"},
        "season": row["season"],
        # Diziliş seçilmeden çark dönmez: draft başlayınca diziliş
        # değiştirilemiyor, o yüzden ikisi de onaylamadan başlamamalı.
        "stage": "setup",           # setup | drafting | done
        "ready": {"1": False, "2": False},
        "result": None,
    })
    return d


def _seat_of(state: dict, uid: int) -> int | None:
    for seat, owner in state["seats"].items():
        if owner == uid:
            return int(seat)
    return None


def _public(code: str, state: dict) -> dict:
    """İstemciye giden görünüm.

    Rakibin kadrosu GİZLENMİYOR — Same Screen'de de iki saha da ekranda,
    draftın yarısı karşının neyi aldığını görmek. Gizli olan tek şey havuzdaki
    puanlar değil; onlar zaten herkese açık."""
    R = _rules()
    seat_done = {s: R.is_complete(state, s) for s in (1, 2)}
    return {
        "type": "state",
        "room_code": code,
        "stage": state["stage"],
        "phase": state["phase"],
        "round": state["round"],
        "wheelMode": state["wheelMode"],
        "shapes": {str(k): v for k, v in state["shapes"].items()},
        "names": state["names"],
        "ready": state["ready"],
        "seats": {str(k): v for k, v in state["seats"].items()},
        "activeSeat": R.active_seat(state) if state["stage"] == "drafting" else None,
        "squads": {str(k): v for k, v in state["squads"].items()},
        "filled": {str(s): R.filled(state, s) for s in (1, 2)},
        "needed": {str(s): len(R.slots_of(state, s)) for s in (1, 2)},
        "complete": {str(s): seat_done[s] for s in (1, 2)},
        "pool": state.get("pool"),
        # Alınmış oyuncular. İstemci bunu iki kadroyu tarayarak kendi de
        # çıkarabilirdi, ama o zaman "seçilebilir mi" sorusunun cevabı iki
        # yerde durur ve biri kayabilir — havuzu gri gösteren taraf istemci,
        # seçimi reddeden taraf sunucu.
        "takenIds": [int(x) for x in state.get("takenIds", [])],
        "connected": list(CONNS.get(code, {})),
        "result": state.get("result"),
    }


# ── Çark ─────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _pairs_cached() -> tuple:
    """Çark havuzu: TÜM sezonların geçerli kulüp-sezon çiftleri.

    Odanın kendi `season`'ı burada kullanılmıyor — o yalnız skorlama için
    yedek. Çarkı odanın sezonuna kısmak, Same Screen'in aynı oyunu on yıl
    üzerinden oynatmasına karşılık odayı tek yıla hapsederdi.

    Önbellekli: on sezonun tamamını gruplayıp 974 çift üretmek ~0.5s sürüyor ve
    her turda bir kez çağrılıyordu. Havuz yalnız yeni sezon çekilince değişir,
    o da /api/admin/clear-cache ile temizleniyor."""
    from .main import football_game_teams
    data = football_game_teams(season=None, league=None, min_players=SPIN_MIN_PLAYERS)
    return tuple(data.get("pairs") or [])


def _pairs() -> list[dict]:
    return list(_pairs_cached())


def _spin(state: dict) -> bool:
    """Kullanılmamış bir kulüp-sezon seç ve kadrosunu yükle. SUNUCU seçiyor —
    çarkı istemciye bıraksak, istemci beğenmediği kulübü atabilirdi."""
    from .main import football_game_players
    R = _rules()
    used = set(state["usedPairs"])
    pool = [p for p in _pairs() if f"{p['team']}|{p['season']}" not in used]
    random.shuffle(pool)

    # Havuz aktif taraf için ölü çıkabilir (kaleci slotu dolu + elde yalnız
    # kaleci). Sessizce kilitlenmektense birkaç kulüp deneyip devam ediyoruz.
    for cand in pool[:12]:
        got = football_game_players(team=cand["team"], season=cand["season"], phase=None)
        players = got.get("players") or []
        if not players:
            continue
        trial = R.set_pool(state, {**cand, "players": players})
        if not R.pool_is_dead(trial):
            state.clear()
            state.update(trial)
            return True
    return False


# ── Eleme ────────────────────────────────────────────────────────────────────

def _finish(code: str, state: dict) -> None:
    """İki kadro da tamamlandı: oda satırına yaz ve elemeyi çöz.

    Kadroları submit akışının beklediği biçimde yazıyoruz, sonucu da onun
    çözücüsü üretiyor — iki yol aynı sonucu vermeli, ikinci bir eleme
    uygulaması tutmak onları ayırmanın en kolay yolu olurdu."""
    from .main import _score_squad, _resolve_h2h
    R = _rules()

    payloads = {}
    for seat in (1, 2):
        sq = R.squad_of(state, seat)
        entries = [{"player_id": int(p["PLAYER_ID"]),
                    "season": p.get("SEASON") or state["season"],
                    "slot": p["_slot"]} for p in sq["players"]]
        side = _score_squad(entries, state["season"])
        if not side:
            print(f"[football_ws] {code}: koltuk {seat} skorlanamadı", flush=True)
            return
        quality = float(max(0.25, min(0.95, side["quality_raw"] - sq["positionPenalty"])))
        payloads[seat] = json.dumps({
            "entries": entries, "shape": sq["shape"],
            "position_penalty": sq["positionPenalty"],
            "side": {"quality": quality, "chemistry": side["chemistry"]},
            "players": side["players"]}, ensure_ascii=False)

    with get_conn() as conn:
        conn.execute("UPDATE football_h2h_rooms SET p1_squad_json=?, p2_squad_json=?, "
                     "updated_at=datetime('now') WHERE room_code=?",
                     (payloads[1], payloads[2], code))
    row = _row(code)
    result = _resolve_h2h(row)
    with get_conn() as conn:
        conn.execute("UPDATE football_h2h_rooms SET result_json=?, status='resolved', "
                     "updated_at=datetime('now') WHERE room_code=?",
                     (json.dumps(result, ensure_ascii=False), code))
    state["result"] = result
    state["stage"] = "done"


# ── Mesaj işleyicileri ───────────────────────────────────────────────────────
# Her biri (state, seat, msg) alıp hata metni ya da None döndürüyor.

def _h_shape(state: dict, seat: int, msg: dict) -> str | None:
    R = _rules()
    if state["stage"] != "setup":
        return "The draft has already started"
    shape = str(msg.get("shape") or "")
    if shape not in R.FORMATIONS:
        return f"Unknown formation: {shape}"
    state["shapes"][seat] = shape
    state["ready"][str(seat)] = False      # diziliş değişti, yeniden onayla
    return None


def _h_wheel(state: dict, seat: int, msg: dict) -> str | None:
    """Çark modunu ODAYI AÇAN belirliyor — ikisi ayrı ayrı seçemez, tek bir
    havuz üstünde oynanıyor."""
    if state["stage"] != "setup":
        return "The draft has already started"
    if seat != 1:
        return "Only the player who opened the room sets the wheel"
    mode = str(msg.get("wheelMode") or "")
    if mode not in ("round", "pick"):
        return f"Unknown wheel mode: {mode}"
    state["wheelMode"] = mode
    return None


def _h_ready(state: dict, seat: int, msg: dict) -> str | None:
    if state["stage"] != "setup":
        return "The draft has already started"
    state["ready"][str(seat)] = bool(msg.get("ready", True))
    if state["ready"]["1"] and state["ready"]["2"]:
        state["stage"] = "drafting"
        if not _spin(state):
            state["stage"] = "setup"
            state["ready"] = {"1": False, "2": False}
            return "No club-season left to spin"
    return None


def _h_pick(state: dict, seat: int, msg: dict) -> str | None:
    R = _rules()
    if state["stage"] != "drafting":
        return "Not drafting right now"
    if seat != R.active_seat(state):
        return "It is not your turn"
    pool = state.get("pool") or {}
    pid = msg.get("player_id")
    player = next((p for p in (pool.get("players") or [])
                   if int(p.get("PLAYER_ID", -1)) == int(pid or -1)), None)
    if player is None:
        return "That player is not in the squad on the wheel"

    ok, res = R.pick(state, seat, player, str(msg.get("slot") or ""))
    if not ok:
        return str(res)
    state.clear()
    state.update(res)

    # Faz "spinning"e düştüyse yeni kulüp gerekiyor (round modunda tur sonu,
    # pick modunda her seçimden sonra).
    if state["phase"] == "spinning" and not _spin(state):
        return None            # havuz bitti; istemci "no clubs left" görür
    # Havuz aktif taraf için ölüyse yeniden çevir
    if state["phase"] == "drafting" and R.pool_is_dead(state):
        _spin(state)
    return None


HANDLERS = {"shape": _h_shape, "wheel": _h_wheel, "ready": _h_ready, "pick": _h_pick}


# ── Soket ────────────────────────────────────────────────────────────────────

@router.websocket("/ws/football/room/{room_code}")
async def football_room_socket(ws: WebSocket, room_code: str, token: str = Query(...)):
    try:
        uid = int(_decode(token)["sub"])
    except Exception:
        await _reject(ws, "invalid_token", "Your session expired — log in again.")
        return
    if _is_banned(uid):
        await _reject(ws, "banned", "This account can't use online play.")
        return

    row = _row(room_code)
    if not row or uid not in (row["p1_user_id"], row["p2_user_id"]):
        await _reject(ws, "room_not_found",
                      "This room doesn't exist, or someone else already took your spot.")
        return
    if not row["p2_user_id"]:
        await _reject(ws, "waiting", "Nobody has joined this room yet.")
        return

    await ws.accept()
    CONNS.setdefault(room_code, {})[uid] = ws
    try:
        async with _lock(room_code):
            state = ROOM_STATES.get(room_code) or _restore(row)
            if state is None:
                state = _init_state(row)
                with get_conn() as conn:
                    conn.execute("UPDATE football_h2h_rooms SET flow='draft' "
                                 "WHERE room_code=?", (room_code,))
            _save(room_code, state)
        # Tam durum YALNIZ bağlanana; karşı tarafa hafif bir haber gidiyor.
        # İkisine birden state yayınlarsak "her eylem = her sokete bir state"
        # sözleşmesi bozuluyor: karşı taraf sıradan bir bağlanmadan dolayı
        # fazladan bir mesaj alıyor, mesaj sayıları kayıyor ve senkron kuran
        # her istemci (ve test) bir mesaj ileri/geri düşüyor.
        await ws.send_json(_public(room_code, ROOM_STATES[room_code]))
        await _broadcast(room_code, {"type": "peer", "user_id": uid,
                                     "connected": list(CONNS.get(room_code, {}))},
                         exclude=uid)

        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
                continue
            handler = HANDLERS.get(msg.get("type"))
            if not handler:
                continue

            async with _lock(room_code):
                state = ROOM_STATES.get(room_code)
                if state is None:
                    await ws.send_json({"type": "error", "message": "Room is not ready"})
                    continue
                seat = _seat_of(state, uid)
                if seat is None:
                    await ws.send_json({"type": "error", "message": "You are not in this room"})
                    continue
                err = handler(state, seat, msg)
                if err:
                    await ws.send_json({"type": "error", "message": err})
                    continue
                R = _rules()
                if (state["stage"] == "drafting" and state["phase"] == "done"
                        and not state.get("result")):
                    _finish(room_code, state)
                _save(room_code, state)
            await _broadcast(room_code, _public(room_code, ROOM_STATES[room_code]))

    except WebSocketDisconnect:
        pass
    finally:
        conns = CONNS.get(room_code, {})
        if conns.get(uid) is ws:
            del conns[uid]
        if not conns:
            CONNS.pop(room_code, None)
        # Karşı tarafa haber ver — sessizce düşmek, öbür ekranda sonsuz
        # "sıra rakipte" demek olurdu.
        await _broadcast(room_code, {"type": "opponent_left", "user_id": uid})


# ── Online: eşleştirme kuyruğu ───────────────────────────────────────────────
# Online modu bugüne kadar "kodu kendin ilet" friend odasıydı — yani Online
# diye ayrı bir mod yoktu. FIFO kuyruk: iki kişi birikince oda açılıp ikisi de
# içine konuyor, kodu kimse elle taşımıyor.
#
# Bellekte, tek process (Railway tek konteyner çalıştırıyor). Çok instance'a
# ölçeklenirse ortak bir kuyruk (Redis vb.) gerekir — basketbolda da aynı sınır.

MM_QUEUE: list[dict] = []
MM_WS: dict[int, WebSocket] = {}
MM_PENDING: dict[int, dict] = {}      # WS bağlanmadan eşleşenlerin bekleyen mesajı


def _user_in_open_room(uid: int) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM football_h2h_rooms WHERE status IN ('waiting','building') "
            "AND (p1_user_id=? OR p2_user_id=?) "
            f"AND updated_at > datetime('now', '-{STALE_HOURS} hours') LIMIT 1",
            (uid, uid)).fetchone()
    return bool(row)


def _make_room(uid_a: int, uid_b: int, season: str) -> str | None:
    from .main import _h2h_code
    for _ in range(6):
        code = _h2h_code()
        try:
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO football_h2h_rooms "
                    "(room_code, mode, status, season, p1_user_id, p2_user_id, flow) "
                    "VALUES (?, 'online', 'building', ?, ?, ?, 'draft')",
                    (code, season, uid_a, uid_b))
            return code
        except Exception as e:
            if "UNIQUE" not in str(e):
                return None
    return None


async def _mm_notify(uid: int, msg: dict) -> None:
    ws = MM_WS.get(uid)
    if ws:
        try:
            await ws.send_json(msg)
            return
        except Exception:
            pass
    # Soket henüz bağlanmadıysa mesajı sakla — eşleşmeyi kaybetmektense
    # bağlandığında teslim etmek doğru.
    MM_PENDING[uid] = msg


async def _mm_queue_size() -> None:
    for uid, ws in list(MM_WS.items()):
        try:
            await ws.send_json({"type": "queue", "size": len(MM_QUEUE)})
        except Exception:
            pass


@router.post("/api/football/matchmaking/join")
async def football_matchmaking_join(user=Depends(get_current_user)):
    from .main import _football_default_season
    uid = int(user["sub"])
    if _user_in_open_room(uid):
        raise HTTPException(409, "You are already in a room")
    if any(e["user_id"] == uid for e in MM_QUEUE):
        return {"queued": True, "queue_size": len(MM_QUEUE)}

    MM_QUEUE.append({"user_id": uid, "joined_at": datetime.now(timezone.utc)})
    if len(MM_QUEUE) >= 2:
        a, b = MM_QUEUE.pop(0), MM_QUEUE.pop(0)
        code = _make_room(a["user_id"], b["user_id"], _football_default_season())
        if code is None:
            # Oda açılamadı: ikisini de kuyruğun başına geri koy, kimse
            # sessizce düşmesin.
            MM_QUEUE.insert(0, b)
            MM_QUEUE.insert(0, a)
            raise HTTPException(500, "Could not open a room")
        for me, them in ((a, b), (b, a)):
            await _mm_notify(me["user_id"], {"type": "matched", "room_code": code,
                                             "opponent_user_id": them["user_id"]})
        return {"queued": True, "queue_size": 0, "room_code": code}

    await _mm_queue_size()
    return {"queued": True, "queue_size": len(MM_QUEUE)}


@router.delete("/api/football/matchmaking")
async def football_matchmaking_leave(user=Depends(get_current_user)):
    global MM_QUEUE
    uid = int(user["sub"])
    MM_QUEUE = [e for e in MM_QUEUE if e["user_id"] != uid]
    MM_PENDING.pop(uid, None)
    await _mm_queue_size()
    return {"left": True}


@router.websocket("/ws/football/matchmaking")
async def football_matchmaking_socket(ws: WebSocket, token: str = Query(...)):
    global MM_QUEUE
    try:
        uid = int(_decode(token)["sub"])
    except Exception:
        await _reject(ws, "invalid_token", "Your session expired — log in again.")
        return
    if _is_banned(uid):
        await _reject(ws, "banned", "This account can't use online play.")
        return

    await ws.accept()
    MM_WS[uid] = ws
    try:
        pending = MM_PENDING.pop(uid, None)
        await ws.send_json(pending or {"type": "queue", "size": len(MM_QUEUE)})
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        if MM_WS.get(uid) is ws:
            del MM_WS[uid]
        before = len(MM_QUEUE)
        MM_QUEUE = [e for e in MM_QUEUE if e["user_id"] != uid]
        if len(MM_QUEUE) != before:
            await _mm_queue_size()


def sweep_stale_football_rooms() -> int:
    """Açılıp unutulmuş odaları kapat. Basketbolun aynısı; kod tekrar
    kullanılamıyor çünkü tablo ayrı."""
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE football_h2h_rooms SET status='abandoned' "
            "WHERE status IN ('waiting','building') "
            f"AND updated_at < datetime('now', '-{STALE_HOURS} hours')")
        return cur.rowcount or 0
