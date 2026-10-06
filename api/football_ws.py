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
import collections
import json
import random
import secrets
import time
from datetime import datetime, timezone
from functools import lru_cache

from pydantic import BaseModel
from fastapi import (APIRouter, Depends, HTTPException, WebSocket,
                     WebSocketDisconnect, Query)

from .auth import verify_token, get_current_user
from .db import get_conn

router = APIRouter()

ROOM_STATES: dict[str, dict] = {}
ROOM_LOCKS: dict[str, asyncio.Lock] = {}
CONNS: dict[str, dict[int, WebSocket]] = {}

REMATCH_LIMIT = 5         # bir odada en fazla bu kadar rövanş
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


def _name(row, slot: str, fallback: str) -> str:
    """Oda satırındaki isim, yoksa hesabın kullanıcı adı, yoksa 'Player N'.
    create/join isim göndermediği için satırdaki isim çoğu zaman boş."""
    from .main import _h2h_name
    return _h2h_name(row, slot) or fallback


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

# Kendi jokerleri (Club/Year/Both/Pick 2/Discover) + karşı-jokerler (Ban/Force Club/
# Force Year — karşı-joker mesajları ayrı adım). Her taraf her birini bir kez kullanır.
JOKERS = ("reTeam", "reYear", "reBoth", "double", "discover")
COUNTER_JOKERS = ("ban", "forceTeam", "forceYear")


COUNTER_SECONDS = 15        # her seçim turu başında bekleyen tarafın karar süresi
_TASKS: set = set()         # zamanlayıcı görevleri (GC edilmesin)


def _fresh_jokers() -> dict:
    return {str(s): {k: True for k in JOKERS + COUNTER_JOKERS} for s in (1, 2)}


def _init_state(row, first: int | None = None, length: str | None = None) -> dict:
    R = _rules()
    if length is None:
        # Odanın açılışta seçtiği uzunluk. Eski satırlarda sütun yok / "xi".
        length = row["length"] if "length" in row.keys() and row["length"] else "xi"
    p1, p2 = row["p1_user_id"], row["p2_user_id"]
    if first is None:
        first = 1 if random.random() < 0.5 else 2
    d = R.create_draft(shapes={1: "4-3-3", 2: "4-3-3"}, wheel_mode="round", first=first,
                       length=length)
    d.update({
        "seats": {1: p1, 2: p2},
        "names": {"1": _name(row, "p1", "Player 1"), "2": _name(row, "p2", "Player 2")},
        "season": row["season"],
        # Diziliş seçilmeden çark dönmez: draft başlayınca diziliş
        # değiştirilemiyor, o yüzden ikisi de onaylamadan başlamamalı.
        "stage": "setup",           # setup | drafting | done
        "ready": {"1": False, "2": False},
        "result": None,
        # İlk seçen koltuk — rövanşta sıra diğerine geçsin diye saklanıyor.
        "first_seat": first,
        # Rövanş: user_id (string) -> hazır mı. Önceki sonuçlar history'de:
        # oda satırındaki result_json yeni elemede ÜZERİNE YAZILIYOR, bu yüzden
        # eski sonuçların tek kopyası burada.
        "rematch_ready": {},
        "rematches": 0,
        "history": [],
        # Tam kadro ("squad") akışı: draft → review (son slot takası, ikisi de
        # kilitleyince) → hire (menajer) → eleme.
        "locked": {"1": False, "2": False},
        "manager_options": {},      # {"1": [4 menajer], "2": [4 menajer]} — SUNUCU çeker
        "managers": {},             # {"1": {...}, "2": {...}} işe alınanlar
        "numbers": {},              # eleme motorunun gördüğü rakamlar, iki ekran aynısını göstersin
        "counters": bool(row["counters"]) if "counters" in row.keys() else False,
        "counter_deadline": None,   # UTC ms; pencere açıkken bekleyen taraf karar verir
        "counter_dismissed": False,
        "banned": None,             # Ban: bu turda seçilemeyen PLAYER_ID
        "jokers": _fresh_jokers(),  # {"1": {reTeam: bool, ...}, "2": {...}} — True = kullanılabilir
        "double": False,            # Pick 2 açık: sıradaki seçim sırayı bırakmaz
        "discover": False,          # Discover açık: bu turda OVR gösterilir
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
        # Rövanş. rematch_ready: {"<user_id>": bool} (docs/BACKEND_PROMPT_GAME_UI.md).
        "challenge": state.get("challenge"),
        "length": state.get("length", "xi"),
        "locked": state.get("locked") or {},
        "manager_options": state.get("manager_options") or {},
        "managers": state.get("managers") or {},
        "numbers": state.get("numbers") or {},
        "jokers": state.get("jokers") or _fresh_jokers(),
        "counters": bool(state.get("counters")),
        "counter_deadline": state.get("counter_deadline"),
        "counter_dismissed": bool(state.get("counter_dismissed")),
        "counter_pending": _counter_pending(state),
        "banned": state.get("banned"),
        "double": bool(state.get("double")),
        "discover": bool(state.get("discover")),
        "rematch_ready": state.get("rematch_ready") or {},
        "rematches": state.get("rematches", 0),
        "rematch_limit": REMATCH_LIMIT,
        "history": state.get("history") or [],
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


def _counter_pending(state: dict) -> bool:
    """Bekleyen taraf karar verirken aktif taraf seçemez / joker kullanamaz.
    Süre dolmuşsa bekleme biter (zamanlayıcı bayrağı geç koysa ya da sunucu yeniden
    başlayıp görevi kaybetse bile tur kilitli kalmasın)."""
    dl = state.get("counter_deadline")
    return (bool(state.get("counters")) and bool(dl) and not state.get("counter_dismissed")
            and _now_ms() < dl)


def _open_counter(state: dict) -> None:
    """Yeni bir seçim turu başladı: ban/pencere sıfırlanır; bekleyen tarafın elinde
    karşı-joker varsa 15 sn'lik pencere açılır."""
    R = _rules()
    state["banned"] = None
    state["counter_dismissed"] = False
    state["counter_deadline"] = None
    if not state.get("counters") or state["stage"] != "drafting":
        return
    other = 3 - R.active_seat(state)
    if R.is_complete(state, other):
        return
    mine = (state.get("jokers") or {}).get(str(other)) or {}
    if not any(mine.get(k) for k in COUNTER_JOKERS):
        return
    dl = _now_ms() + int(COUNTER_SECONDS * 1000)
    state["counter_deadline"] = dl
    state["_counter_arm"] = dl


async def _counter_timeout(code: str, deadline: int) -> None:
    """Süre dolunca (bekleyen taraf cevap vermediyse) pencereyi kapat ve yayınla.
    Bağlantısı kopmuş rakip için de işler: görev odaya değil süreye bağlı."""
    await asyncio.sleep(max(0.0, (deadline - _now_ms()) / 1000) + 0.05)
    async with _lock(code):
        state = ROOM_STATES.get(code)
        if (not state or state.get("counter_deadline") != deadline
                or state.get("counter_dismissed") or state["stage"] != "drafting"):
            return
        state["counter_dismissed"] = True
        _save(code, state)
    await _broadcast(code, _public(code, ROOM_STATES[code]))


def _spin(state: dict, lock_season: str | None = None,
          lock_team: str | None = None) -> bool:
    """Kullanılmamış bir kulüp-sezon seç ve kadrosunu yükle. SUNUCU seçiyor —
    çarkı istemciye bıraksak, istemci beğenmediği kulübü atabilirdi."""
    from .main import football_game_players
    R = _rules()
    used = set(state["usedPairs"])
    pool = [p for p in _pairs() if f"{p['team']}|{p['season']}" not in used
            and (not lock_season or p["season"] == lock_season)
            and (not lock_team or p["team"] == lock_team)]
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
    from .main import _score_squad, _resolve_h2h, _record_h2h_result
    R = _rules()

    payloads = {}
    numbers = {}
    for seat in (1, 2):
        sq = R.squad_of(state, seat)
        entries = [{"player_id": int(p["PLAYER_ID"]),
                    "season": p.get("SEASON") or state["season"],
                    "slot": p["_slot"]} for p in sq["players"]]
        side = _score_squad(entries, state["season"])
        if not side:
            print(f"[football_ws] {code}: koltuk {seat} skorlanamadı", flush=True)
            return
        # headToHead.buildSide ile AYNI formül: clamp(ortalama − ceza + menajer).
        # Menajer yalnız "squad" akışında var; "xi"de bonus 0.
        mgr = (state.get("managers") or {}).get(str(seat))
        mb = R.manager_bonus(mgr, sq["shape"])
        quality = float(max(0.25, min(0.95, side["quality_raw"] - sq["positionPenalty"]
                                    + mb["bonus"])))
        numbers[str(seat)] = {"quality": quality, "mean": side["quality_raw"],
                              "positionFit": 1 - sq["positionPenalty"],
                              "bonus": mb["bonus"], "matched": mb["matched"]}
        payloads[seat] = json.dumps({
            "entries": entries, "shape": sq["shape"],
            "manager": mgr["name"] if mgr else None,
            "position_penalty": sq["positionPenalty"],
            "side": {"quality": quality, "chemistry": side["chemistry"]},
            "players": side["players"]}, ensure_ascii=False)

    state["numbers"] = numbers
    with get_conn() as conn:
        conn.execute("UPDATE football_h2h_rooms SET p1_squad_json=?, p2_squad_json=?, "
                     "updated_at=datetime('now') WHERE room_code=?",
                     (payloads[1], payloads[2], code))
    row = _row(code)
    result = _resolve_h2h(row)
    if state.get("challenge"):
        _record_challenge_result(row, result, state["challenge"]["entry_id"])
    else:
        _record_h2h_result(row, result)
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
        _open_counter(state)
    return None


def _h_pick(state: dict, seat: int, msg: dict) -> str | None:
    R = _rules()
    if state["stage"] != "drafting":
        return "Not drafting right now"
    if seat != R.active_seat(state):
        return "It is not your turn"
    if _counter_pending(state):
        return "Your opponent is deciding on a counter-joker"
    pool = state.get("pool") or {}
    pid = msg.get("player_id")
    if state.get("banned") is not None and int(pid or -1) == int(state["banned"]):
        return "That player is banned this pick"
    player = next((p for p in (pool.get("players") or [])
                   if int(p.get("PLAYER_ID", -1)) == int(pid or -1)), None)
    if player is None:
        return "That player is not in the squad on the wheel"

    again = bool(state.get("double"))
    ok, res = R.pick(state, seat, player, str(msg.get("slot") or ""), again=again)
    if not ok:
        return str(res)
    state.clear()
    state.update(res)
    state["double"] = False                       # Pick 2 ilk seçimde harcanır
    # Discover yalnız aynı oyuncunun aynı havuzdaki turu için: sıra ya da havuz
    # değiştiyse kapanır (Pick 2'nin ikinci seçiminde açık kalır).
    kept = again and state["phase"] == "drafting" and R.active_seat(state) == seat
    if not kept:
        state["discover"] = False

    # Faz "spinning"e düştüyse yeni kulüp gerekiyor (round modunda tur sonu,
    # pick modunda her seçimden sonra).
    if state["phase"] == "spinning" and not _spin(state):
        return None            # havuz bitti; istemci "no clubs left" görür
    # Havuz aktif taraf için ölüyse yeniden çevir
    if state["phase"] == "drafting" and R.pool_is_dead(state):
        _spin(state)
    if not kept and state["phase"] == "drafting" and state.get("pool"):
        _open_counter(state)
    return None


def _h_joker(state: dict, seat: int, msg: dict) -> str | None:
    """Kendi jokerin: yalnız SIRA sende, havuz inmişken. Hak ancak joker gerçekten
    işlediyse harcanır — kilide uyan taze kulüp kalmadıysa hak yanmaz."""
    R = _rules()
    if state["stage"] != "drafting":
        return "Not drafting right now"
    if seat != R.active_seat(state):
        return "It is not your turn"
    if state["phase"] != "drafting" or not state.get("pool"):
        return "Jokers lock until the wheel lands"
    if _counter_pending(state):
        return "Your opponent is deciding on a counter-joker"
    kind = str(msg.get("joker") or "")
    if kind not in JOKERS:
        return f"Unknown joker: {kind}"
    jokers = state.setdefault("jokers", _fresh_jokers())
    if not jokers[str(seat)].get(kind):
        return "You have already used that joker"
    pool = state["pool"]

    if kind in ("reTeam", "reYear", "reBoth"):
        before = dict(state)
        lock = {"reTeam": {"lock_season": pool.get("season")},
                "reYear": {"lock_team": pool.get("team")}, "reBoth": {}}[kind]
        if not _spin(state, **lock):
            state.clear(); state.update(before)
            return "No fresh option left for that lock" if lock else "No fresh club-season left"
        state["discover"] = False                  # yeni havuz, eski Discover boşa gitti
    elif kind == "double":
        if state.get("double"):
            return "Pick 2 is already active"
        open_slots = [s for s in R.slots_of(state, seat) if s["id"] not in state["squads"][seat]]
        if len(open_slots) < 2:
            return "Pick 2 needs at least two open slots"
        state["double"] = True
    else:                                          # discover
        if state.get("discover"):
            return "Discover is already active"
        state["discover"] = True
    state["banned"] = None            # herhangi bir joker banı kaldırır
    jokers[str(seat)][kind] = False
    return None


def _h_counter(state: dict, seat: int, msg: dict) -> str | None:
    """Bekleyen tarafın karşı-hamlesi: ban (oyuncu yasakla) | forceTeam | forceYear | pass.
    Yalnız pencere açıkken ve yalnız BEKLEYEN taraf. Her biri tek mesaj: ban oyuncuyu
    da taşır (iki adımlı arayüz seçimi istemcide yapıp tek mesaj yollar)."""
    R = _rules()
    if not state.get("counters"):
        return "Counter-jokers are off in this room"
    if state["stage"] != "drafting" or not _counter_pending(state):
        return "There is no counter-joker window open"
    if seat == R.active_seat(state):
        return "Only the waiting player can counter"
    kind = str(msg.get("counter") or "")
    if kind == "pass":
        state["counter_dismissed"] = True
        return None
    if kind not in COUNTER_JOKERS:
        return f"Unknown counter-joker: {kind}"
    jokers = state.setdefault("jokers", _fresh_jokers())
    if not jokers[str(seat)].get(kind):
        return "You have already used that counter-joker"
    pool = state["pool"]
    if kind == "ban":
        pid = msg.get("player_id")
        target = next((p for p in (pool.get("players") or [])
                       if int(p.get("PLAYER_ID", -1)) == int(pid or -1)), None)
        if target is None:
            return "That player is not in the squad on the wheel"
        if int(target["PLAYER_ID"]) in {int(x) for x in state["takenIds"]}:
            return "That player is already taken"
        state["banned"] = int(target["PLAYER_ID"])
    else:
        lock = ({"lock_season": pool.get("season")} if kind == "forceTeam"
                else {"lock_team": pool.get("team")})
        if not _spin(state, **lock):
            return "No fresh option left for that lock"
        state["banned"] = None           # yeni havuzda eski ban anlamsız
        state["discover"] = False
    jokers[str(seat)][kind] = False
    state["counter_dismissed"] = True
    return None


def _h_rematch_ready(state: dict, seat: int, msg: dict) -> str | None:
    """Rövanş "ikisi de dokunmalı": biri hazır olunca bekler, ikisi olunca
    oda yeni drafta döner. Tek taraflı başlatılsaydı, sonucu henüz görmemiş
    rakibin ekranı altından çekilirdi."""
    if state.get("challenge"):
        return "A challenge has no rematch — pick another squad from the Board"
    if state["stage"] != "done":
        return "The tie is not over yet"
    if state.get("rematches", 0) >= REMATCH_LIMIT:
        return f"This room has reached its limit of {REMATCH_LIMIT} rematches"
    uid = state["seats"][seat]
    flags = state.setdefault("rematch_ready", {})
    flags[str(uid)] = bool(msg.get("ready", True))
    if all(flags.get(str(u)) for u in state["seats"].values()):
        state["_rematch_go"] = True      # döngü bunu görüp _start_rematch'i çağırır
    return None


def _start_rematch(code: str, state: dict) -> None:
    """Aynı odada yeni oyun. Koltuklar YER DEĞİŞTİRİR: önceki misafir host olur,
    ilk ayağı o oynar (p1 ilk ayakta ev sahibi), ilk seçen de öbür oyuncu olur.

    Yer değiştirme DB satırında da yapılıyor (p1/p2 kolonları), yalnız bellekte
    değil — _resolve_h2h, _h2h_public, leave ve _restore hep satırdan okuyor;
    yalnız state'te değiştirsek bunlar eski koltuğa göre karar verirdi."""
    old_seats = dict(state["seats"])
    a, b = old_seats[1], old_seats[2]
    prev_first_uid = old_seats.get(state.get("first_seat", 1))
    history = list(state.get("history") or [])
    if state.get("result"):
        history.append(state["result"])
    rematches = state.get("rematches", 0) + 1
    wheel = state.get("wheelMode", "round")

    row = _row(code)
    with get_conn() as conn:
        conn.execute(
            "UPDATE football_h2h_rooms SET p1_user_id=?, p2_user_id=?, "
            "p1_name=?, p2_name=?, p1_squad_json=NULL, p2_squad_json=NULL, "
            "result_json=NULL, status='building', draft_state_json=NULL, "
            "updated_at=datetime('now') WHERE room_code=?",
            (b, a, row["p2_name"], row["p1_name"], code))
    row = _row(code)          # artık p1=b, p2=a

    # Önceki turda İLK seçmeyen şimdi ilk seçsin.
    want_uid = a if prev_first_uid == b else b
    first_seat = 1 if want_uid == row["p1_user_id"] else 2
    fresh = _init_state(row, first=first_seat, length=state.get("length", "xi"))
    fresh.update({"history": history, "rematches": rematches, "wheelMode": wheel,
                  "counters": state.get("counters", False)})
    state.clear()
    state.update(fresh)


def _after_draft(code: str, state: dict) -> None:
    """Draft bitti. Kısa draft'ta doğrudan eleme; tam kadroda önce review → hire."""
    if state.get("length") == "squad":
        state["stage"] = "review"
        state["locked"] = {"1": False, "2": False}
        if state.get("challenge"):
            state["locked"]["2"] = True       # donmuş rakip kadrosunu düzenlemez
    else:
        _finish(code, state)


def _h_length(state: dict, seat: int, msg: dict) -> str | None:
    """Draft uzunluğu ("xi" | "squad"): odayı açan seçer, yalnız kurulumda.
    Havuz tek, çark tek: iki ayrı uzunluk olamaz."""
    R = _rules()
    if state["stage"] != "setup":
        return "The draft has already started"
    if state.get("challenge"):
        return "A challenge is played at the length it was opened with"
    if seat != 1:
        return "Only the player who opened the room sets the draft length"
    length = str(msg.get("length") or "")
    if length not in R.LENGTHS:
        return f"Unknown draft length: {length}"
    state["length"] = length
    return None


def _h_counters(state: dict, seat: int, msg: dict) -> str | None:
    """Karşı-jokerler + 15 sn pencere: odayı açan kurulumda açıp kapatır."""
    if state["stage"] != "setup":
        return "The draft has already started"
    if state.get("challenge"):
        return "Counter-jokers are not available in a challenge"
    if seat != 1:
        return "Only the player who opened the room sets counter-jokers"
    state["counters"] = bool(msg.get("on", True))
    return None


def _h_swap(state: dict, seat: int, msg: dict) -> str | None:
    """Kilitli kadro ekranındaki son düzenleme. Kilitliyken değişmez: iki taraf da
    "bitti" dedikten sonra bir tarafın kadrosunun oynaması rakibin gördüğüyle
    uyuşmazlık demek olurdu."""
    R = _rules()
    if state["stage"] != "review":
        return "There is nothing to rearrange right now"
    if state["locked"].get(str(seat)):
        return "Unlock your squad to rearrange it"
    ok, res = R.swap(state, seat, str(msg.get("a") or ""), str(msg.get("b") or ""))
    if not ok:
        return str(res)
    state.clear()
    state.update(res)
    return None


def _h_lock(state: dict, seat: int, msg: dict) -> str | None:
    R = _rules()
    if state["stage"] != "review":
        return "There is nothing to lock right now"
    state["locked"][str(seat)] = bool(msg.get("ready", True))
    if all(state["locked"].get(str(x)) for x in (1, 2)):
        if state.get("challenge"):
            state["_finish_go"] = True        # donmuş kadroların menajeri yok
        else:
            state["stage"] = "hire"
            # İki taraf AYNI ANDA işe alır (iki cihaz); seçenekleri sunucu çeker.
            state["manager_options"] = {"1": R.draw_managers(4), "2": R.draw_managers(4)}
            state["managers"] = {}
    return None


def _h_hire(state: dict, seat: int, msg: dict) -> str | None:
    if state["stage"] != "hire":
        return "It is not time to hire a manager"
    if str(seat) in state["managers"]:
        return "You have already hired a manager"
    name = str(msg.get("manager") or "")
    pick = next((m for m in (state["manager_options"].get(str(seat)) or [])
                 if m["name"] == name), None)
    if pick is None:
        return "That manager is not on your list"
    state["managers"][str(seat)] = pick
    if len(state["managers"]) == 2:
        state["_finish_go"] = True
    return None


HANDLERS = {"shape": _h_shape, "wheel": _h_wheel, "ready": _h_ready, "pick": _h_pick,
            "rematch_ready": _h_rematch_ready, "length": _h_length, "swap": _h_swap,
            "lock": _h_lock, "hire": _h_hire, "joker": _h_joker, "counter": _h_counter, "counters": _h_counters}


# ── Soket ────────────────────────────────────────────────────────────────────

@router.websocket("/ws/football/room/{room_code}")
async def football_room_socket(ws: WebSocket, room_code: str, token: str = Query(...)):
    try:
        # verify_token: imza + ban + token sürümü (şifre değişince düşer)
        uid = int(verify_token(token)["sub"])
    except Exception as e:   # bozuk token, DB hatası: hepsi temiz bir ret
        if getattr(e, "status_code", None) == 403:
            await _reject(ws, "banned", "This account can't use online play.")
        else:
            await _reject(ws, "invalid_token", "Your session expired — log in again.")
        return

    row = _row(room_code)
    if not row or uid not in (row["p1_user_id"], row["p2_user_id"]):
        await _reject(ws, "room_not_found",
                      "This room doesn't exist, or someone else already took your spot.")
        return
    if row["flow"] == "challenge" and uid != row["p1_user_id"]:
        # Kadronun sahibi (p2) o oyunda yok; koltuğu bir bağlantı değil bir kayıt.
        await _reject(ws, "room_not_found",
                      "This room doesn't exist, or someone else already took your spot.")
        return
    if row["status"] == "abandoned":
        # Kapanmış odaya bağlanmak, kimsenin gelmeyeceği bir drafta girmek.
        await _reject(ws, "room_closed", "This room was closed.")
        return
    if not row["p2_user_id"]:
        await _reject(ws, "waiting", "Nobody has joined this room yet.")
        return

    await ws.accept()
    CONNS.setdefault(room_code, {})[uid] = ws
    try:
        async with _lock(room_code):
            state = ROOM_STATES.get(room_code) or _restore(row)
            if state is None and row["flow"] == "challenge":
                # Donmuş kadro durumda saklanıyordu; kaybolduysa elimizdeki
                # taze bir _init_state RAKİPSİZ bir oyun kurardı.
                await ws.send_json({"type": "fatal", "reason": "room_closed",
                                    "message": "This challenge can't be resumed."})
                await ws.close(code=1000)
                return
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
                    _after_draft(room_code, state)
                arm = state.pop("_counter_arm", None)
                if state.pop("_finish_go", False):
                    _finish(room_code, state)
                if state.pop("_rematch_go", False):
                    _start_rematch(room_code, state)
                _save(room_code, state)
                if arm:
                    t = asyncio.create_task(_counter_timeout(room_code, arm))
                    _TASKS.add(t)
                    t.add_done_callback(_TASKS.discard)
            await _broadcast(room_code, _public(room_code, ROOM_STATES[room_code]))

    except WebSocketDisconnect:
        pass
    finally:
        conns = CONNS.get(room_code, {})
        if conns.get(uid) is ws:
            del conns[uid]
        if not conns:
            CONNS.pop(room_code, None)
        # Rövanş için "hazırım" demişti ve gitti: işareti düşür. Kalsaydı,
        # dönen rakip tıklayınca karşı ekranda kimse yokken yeni oyun başlardı.
        dropped = False
        st = ROOM_STATES.get(room_code)
        if st and (st.get("rematch_ready") or {}).get(str(uid)):
            async with _lock(room_code):
                st = ROOM_STATES.get(room_code)
                if st and st.get("rematch_ready"):
                    dropped = st["rematch_ready"].pop(str(uid), None) is not None
                    _save(room_code, st)
        # Karşı tarafa haber ver — sessizce düşmek, öbür ekranda sonsuz
        # "sıra rakipte" demek olurdu.
        await _broadcast(room_code, {"type": "opponent_left", "user_id": uid})
        # Yeni state YALNIZ bir hazır işareti gerçekten düştüyse: her kopmada
        # fazladan bir state yayınlamak mesaj akışını herkes için değiştirirdi.
        if dropped and ROOM_STATES.get(room_code):
            await _broadcast(room_code, _public(room_code, ROOM_STATES[room_code]))


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

# Kabul penceresi (docs/BACKEND_PROMPT_GAME_UI.md #4). Eşleşme artık odayı
# HEMEN açmıyor: iki taraf da kabul edene kadar yalnız bir "bekleyen eşleşme"
# var. Biri reddederse ya da süre dolarsa oda hiç açılmıyor — önceden oda
# açılıp, gelmeyecek rakibi bekleyen bir lobiye girilmiş oluyordu.
ACCEPT_SECONDS = 10       # her iki taraf bu sürede kabul etmeli
START_DELAY_MS = 3000     # iki kabulden sonra draft'ın birlikte başlayacağı an
QUEUE_STALE_S = 120       # WS'siz (yalnız REST) kuyruk girdisi bu kadar yaşayabilir
WAIT_SAMPLES: collections.deque = collections.deque(maxlen=20)   # bitmiş bekleme süreleri (sn)
PENDING_MATCHES: dict[str, dict] = {}
USER_MATCH: dict[int, str] = {}       # user_id -> bekleyen match_id
MM_PING: dict[int, int] = {}          # user_id -> son ölçülen gidiş-dönüş (ms)
MM_PROBED: dict[int, float] = {}      # user_id -> son prob zamanı (time.time())


def _now_ms() -> int:
    return int(time.time() * 1000)


def _user_in_open_room(uid: int) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM football_h2h_rooms WHERE status IN ('waiting','building') "
            "AND (p1_user_id=? OR (p2_user_id=? AND flow != 'challenge')) "
            f"AND updated_at > datetime('now', '-{STALE_HOURS} hours') LIMIT 1",
            (uid, uid)).fetchone()
    return bool(row)


def _make_room(uid_a: int, uid_b: int, season: str, length: str = "xi") -> str | None:
    from .main import _h2h_code, _h2h_username
    for _ in range(6):
        code = _h2h_code()
        try:
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO football_h2h_rooms "
                    "(room_code, mode, status, season, p1_user_id, p2_user_id, "
                    "p1_name, p2_name, flow, length) "
                    "VALUES (?, 'online', 'building', ?, ?, ?, ?, ?, 'draft', ?)",
                    (code, season, uid_a, uid_b,
                     _h2h_username(uid_a), _h2h_username(uid_b), length))
            return code
        except Exception as e:
            if "UNIQUE" not in str(e):
                return None
    return None


async def _mm_notify(uid: int, msg: dict, keep: bool = True) -> None:
    """keep=True: soket henüz bağlı değilse mesajı sakla (eşleşmeyi kaybetmektense
    bağlanınca teslim et). keep=False: geçici bilgi — kimse bağlı değilse at; saklanırsa
    oyuncu dakikalar sonra bağlanınca bayat bir 'reddedildi' görürdü."""
    ws = MM_WS.get(uid)
    if ws:
        try:
            await ws.send_json(msg)
            return
        except Exception:
            pass
    if keep:
        MM_PENDING[uid] = msg


def _avg_wait_s() -> float | None:
    """Son eşleşmelerin ortalama bekleme süresi. Veri yoksa None — uydurma
    bir varsayılan göstermek, hiç göstermemekten kötü."""
    return round(sum(WAIT_SAMPLES) / len(WAIT_SAMPLES), 1) if WAIT_SAMPLES else None


def _queue_msg() -> dict:
    # skill_band YOK: futbolda bir beceri puanı sistemi yok, uydurmuyoruz.
    by_length = {L: sum(1 for e in MM_QUEUE if e.get("length", "xi") == L)
                 for L in ("xi", "squad")}
    return {"type": "queue", "size": len(MM_QUEUE), "by_length": by_length,
            "avg_wait_s": _avg_wait_s()}


async def _mm_queue_size() -> None:
    msg = _queue_msg()
    for uid, ws in list(MM_WS.items()):
        try:
            await ws.send_json(msg)
        except Exception:
            pass


def _opponent_card(uid: int) -> dict:
    """Eşleşme kartının rakip bilgisi: ad, rekor, ping. Ölçülemeyen alan None."""
    from .main import _h2h_username, _h2h_record
    return {"user_id": uid, "username": _h2h_username(uid),
            "record": _h2h_record(uid), "ping_ms": MM_PING.get(uid)}


def _mm_purge() -> None:
    """Soketi OLMAYAN kuyruk girdilerini eskiyince at. REST ile kuyruğa girip
    WS'i hiç açmayan (ya da çıkışta DELETE atamayan) istemci aksi hâlde sonsuza
    dek kuyrukta kalır ve bir sonraki eşleşmeyi, gelmeyecek biriyle kurardı."""
    global MM_QUEUE
    now = datetime.now(timezone.utc)
    MM_QUEUE = [e for e in MM_QUEUE
                if e["user_id"] in MM_WS
                or (now - e["joined_at"]).total_seconds() < QUEUE_STALE_S]


async def _open_match(a: dict, b: dict) -> None:
    mid = secrets.token_hex(6)
    deadline = _now_ms() + int(ACCEPT_SECONDS * 1000)
    now = datetime.now(timezone.utc)
    m = {"id": mid, "users": [a["user_id"], b["user_id"]],
         "entries": {a["user_id"]: a, b["user_id"]: b},
         "accepted": set(), "deadline": deadline, "task": None,
         "length": a.get("length", "xi")}
    PENDING_MATCHES[mid] = m
    for e in (a, b):
        USER_MATCH[e["user_id"]] = mid
        WAIT_SAMPLES.append((now - e["joined_at"]).total_seconds())
    m["task"] = asyncio.create_task(_match_timeout(mid))
    for me, them in ((a["user_id"], b["user_id"]), (b["user_id"], a["user_id"])):
        await _mm_notify(me, {
            "type": "matched", "match_id": mid, "length": m["length"],
            "accept_deadline": deadline, "accept_seconds": ACCEPT_SECONDS,
            "opponent": _opponent_card(them),
            "opponent_user_id": them,          # eski alan, geriye dönük
        })


async def _try_pair() -> None:
    """FIFO, ama uzunluk başına: kısa draft isteyen, tam kadro isteyenle eşleşmez —
    biri on bir seçim bekler, öbürü on sekiz; ikisinden biri istemediği oyuna girerdi."""
    while True:
        pair = None
        for length in ("xi", "squad"):
            same = [e for e in MM_QUEUE if e.get("length", "xi") == length]
            if len(same) >= 2:
                pair = (same[0], same[1])
                break
        if pair is None:
            return
        MM_QUEUE.remove(pair[0])
        MM_QUEUE.remove(pair[1])
        await _open_match(*pair)


async def _match_timeout(mid: str) -> None:
    try:
        await asyncio.sleep(ACCEPT_SECONDS)
    except asyncio.CancelledError:
        return
    m = PENDING_MATCHES.get(mid)
    if not m:
        return
    # Cevap vermeyen DÜŞER (AFK), kabul eden geri döner.
    silent = {u for u in m["users"] if u not in m["accepted"]}
    await _break_match(mid, silent, "opponent_timed_out", culprit_msg="timed_out")


def _end_match(mid: str) -> dict | None:
    """Bekleyen eşleşmeyi kapat: kaydı, kullanıcı eşlemesini ve zamanlayıcıyı temizle."""
    m = PENDING_MATCHES.pop(mid, None)
    if not m:
        return None
    for u in m["users"]:
        if USER_MATCH.get(u) == mid:
            USER_MATCH.pop(u, None)
        MM_PENDING.pop(u, None)          # bayat "matched" mesajı kalmasın
    t = m.get("task")
    if t is not None and t is not asyncio.current_task():
        t.cancel()
    return m


async def _break_match(mid: str, culprits: set, reason: str,
                       culprit_msg: str = "declined") -> None:
    """Eşleşme bozuldu. culprits kuyruğa DÖNMEZ; diğerleri kuyruğun BAŞINA döner
    (özgün bekleme süreleriyle) — kusuru olmayan oyuncu yeniden sıranın sonuna
    gitmesin."""
    m = _end_match(mid)
    if not m:
        return
    keepers = [u for u in m["users"] if u not in culprits]
    for u in reversed(keepers):
        MM_QUEUE.insert(0, m["entries"][u])
    for u in culprits:
        await _mm_notify(u, {"type": culprit_msg, "match_id": mid}, keep=False)
    for u in keepers:
        await _mm_notify(u, {"type": "requeued", "reason": reason, "match_id": mid,
                             "size": len(MM_QUEUE)}, keep=False)
    await _mm_queue_size()
    await _try_pair()


async def _accept_match(uid: int) -> str | None:
    mid = USER_MATCH.get(uid)
    m = PENDING_MATCHES.get(mid) if mid else None
    if not m:
        return "You have no match to accept"
    m["accepted"].add(uid)
    other = next(u for u in m["users"] if u != uid)
    await _mm_notify(other, {"type": "opponent_accepted", "match_id": mid}, keep=False)
    if len(m["accepted"]) < 2:
        return None

    # İKİ KABUL: şimdi oda açılıyor.
    from .main import _football_default_season
    _end_match(mid)
    a, b = m["users"]
    code = _make_room(a, b, _football_default_season(), m["length"])
    if code is None:
        # Oda açılamadı: kimse sessizce düşmesin, ikisi de sıranın başına dönsün.
        for u in reversed(m["users"]):
            MM_QUEUE.insert(0, m["entries"][u])
        for u in m["users"]:
            await _mm_notify(u, {"type": "requeued", "reason": "room_error",
                                 "size": len(MM_QUEUE)}, keep=False)
        await _try_pair()
        return None
    starts_at = _now_ms() + START_DELAY_MS
    for u in m["users"]:
        await _mm_notify(u, {"type": "starting", "room_code": code,
                             "starts_at": starts_at,
                             "opponent_user_id": next(x for x in m["users"] if x != u)})
    return None


class QueueBody(BaseModel):
    length: str = "xi"          # "xi" | "squad" — yalnız aynısını isteyenle eşleşirsin


@router.post("/api/football/matchmaking/join")
async def football_matchmaking_join(body: QueueBody = QueueBody(),
                                    user=Depends(get_current_user)):
    if body.length not in ("xi", "squad"):
        raise HTTPException(400, "Invalid draft length: " + str(body.length))
    uid = int(user["sub"])
    _mm_purge()
    if uid in USER_MATCH:
        raise HTTPException(409, "You already have a match waiting for you")
    if _user_in_open_room(uid):
        raise HTTPException(409, "You are already in a room")
    if any(e["user_id"] == uid for e in MM_QUEUE):
        return {"queued": True, "queue_size": len(MM_QUEUE), "avg_wait_s": _avg_wait_s()}

    MM_QUEUE.append({"user_id": uid, "joined_at": datetime.now(timezone.utc),
                     "length": body.length})
    await _try_pair()
    mid = USER_MATCH.get(uid)
    if mid:
        return {"queued": False, "matched": True, "match_id": mid,
                "accept_deadline": PENDING_MATCHES[mid]["deadline"]}
    await _mm_queue_size()
    return {"queued": True, "queue_size": len(MM_QUEUE), "avg_wait_s": _avg_wait_s()}


@router.delete("/api/football/matchmaking")
async def football_matchmaking_leave(user=Depends(get_current_user)):
    global MM_QUEUE
    uid = int(user["sub"])
    mid = USER_MATCH.get(uid)
    if mid:
        # Eşleşme beklerken kuyruktan çıkmak = reddetmek.
        await _break_match(mid, {uid}, "opponent_declined")
    MM_QUEUE = [e for e in MM_QUEUE if e["user_id"] != uid]
    MM_PENDING.pop(uid, None)
    await _mm_queue_size()
    return {"left": True}


async def _probe(ws: WebSocket, uid: int) -> None:
    """Ping ölçümü: sunucu zaman damgalı bir prob yollar, istemci aynısını geri
    yollar, gidiş-dönüş süresi eşleşme kartındaki ping_ms olur. 5 sn'de bir
    prob yeter — her mesajda ölçmek ölçümü değil trafiği artırırdı."""
    if time.time() - MM_PROBED.get(uid, 0) < 5:
        return
    MM_PROBED[uid] = time.time()
    try:
        await ws.send_json({"type": "probe", "t": _now_ms()})
    except Exception:
        pass


@router.websocket("/ws/football/matchmaking")
async def football_matchmaking_socket(ws: WebSocket, token: str = Query(...)):
    global MM_QUEUE
    try:
        # verify_token: imza + ban + token sürümü (şifre değişince düşer)
        uid = int(verify_token(token)["sub"])
    except Exception as e:   # bozuk token, DB hatası: hepsi temiz bir ret
        if getattr(e, "status_code", None) == 403:
            await _reject(ws, "banned", "This account can't use online play.")
        else:
            await _reject(ws, "invalid_token", "Your session expired — log in again.")
        return

    await ws.accept()
    MM_WS[uid] = ws
    try:
        pending = MM_PENDING.pop(uid, None)
        await ws.send_json(pending or _queue_msg())
        await _probe(ws, uid)
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            t = msg.get("type")
            if t == "ping":
                await ws.send_json({"type": "pong"})
                await _probe(ws, uid)
            elif t == "probe_ack":
                try:
                    rtt = _now_ms() - int(msg.get("t"))
                except (TypeError, ValueError):
                    continue
                if 0 <= rtt < 60_000:               # saçma değerleri alma
                    MM_PING[uid] = rtt
            elif t == "accept":
                err = await _accept_match(uid)
                if err:
                    await ws.send_json({"type": "error", "message": err})
            elif t == "decline":
                mid = USER_MATCH.get(uid)
                if mid:
                    await _break_match(mid, {uid}, "opponent_declined")
                else:
                    await ws.send_json({"type": "error",
                                        "message": "You have no match to decline"})
    except WebSocketDisconnect:
        pass
    finally:
        if MM_WS.get(uid) is ws:
            del MM_WS[uid]
        # Eşleşme beklerken bağlantı koptu: kabul etmemiş sayılır, rakip kuyruğa döner.
        mid = USER_MATCH.get(uid)
        if mid:
            await _break_match(mid, {uid}, "opponent_disconnected")
        before = len(MM_QUEUE)
        MM_QUEUE = [e for e in MM_QUEUE if e["user_id"] != uid]
        if len(MM_QUEUE) != before:
            await _mm_queue_size()


# ── The Board + meydan okuma ─────────────────────────────────────────────────
# Başkasının kaydettiği 18'lik kadroya karşı draft et. Basketbolun /api/game/board
# ve /api/game/challenge'ının futbol karşılığı (docs/BACKEND_PROMPT_GAME_UI.md #4).
#
# KARARLAR
#   • Kaynak: saved_rosters (sport='football') — leaderboard'un okuduğu tablo.
#   • Skor tek bir sayı değil 0-1 arası kimya kesri; Board PERSANTİLE göre
#     gruplanıyor (leaderboard ile aynı _pct_of). Aynı persantilde birden çok
#     kadro varsa temsilci İLK kaydeden — o puana ilk ulaşan.
#   • Rakip kadro draft SIRASINDA GÖRÜNÜR. Basketboldaki "donmuş, sonra görürsün"
#     metni futbolda yok: Board listesi zaten her 18'liği herkese açıyor, draft
#     sırasında saklamak hiçbir şeyi saklamazdı.
#   • Meydan okuma H2H rekoruna YAZILMAZ: kadronun sahibi oyunda yoktu, onun
#     rekoruna galibiyet ya da mağlubiyet yazmak yanlış olurdu.

_BOARD_PLAYER_KEYS = ("PLAYER_ID", "PLAYER_NAME", "TEAM", "LEAGUE", "SEASON", "PHASE",
                      "POSITION", "primary_arch", "overall_score", "_slot")


class ChallengeBody(BaseModel):
    entry_id: int
    length: str = "xi"          # "xi" | "squad" (squad: yedekler + takas; menajer yok)


def _frozen_xi(roster, shape: str) -> dict | None:
    """Kayıtlı kadrodan {slot_id: oyuncu} (yalnız ilk 11). Geçersizse None.

    Tam 18 kişi, 11'i saha slotunda, kaleci kuralı dahil dizilişe uyan bir XI
    olmak zorunda — Board'da bozuk ya da eski bir kadro hiç görünmesin, meydan
    okunduğunda da elemeyi kuramayıp yarıda kalmasın."""
    R = _rules()
    if not isinstance(roster, list) or len(roster) != 18:
        return None
    xi = [p for p in roster if isinstance(p, dict)
          and not str(p.get("_slot", "")).startswith("SUB")]
    if len(xi) != 11:
        return None
    try:
        R.validate_xi([{"player_id": p["PLAYER_ID"], "slot": p["_slot"]} for p in xi],
                      shape, {int(p["PLAYER_ID"]): p for p in xi})
    except (R.InvalidXI, KeyError, TypeError, ValueError):
        return None
    return {p["_slot"]: p for p in xi}


def _board_entry(row, ref) -> dict | None:
    """saved_rosters satırı → Board kaydı. Geçersiz kadro ya da persantili
    hesaplanamayan (referans dosyası yok) kayıt None: yerleştirilemeyen birini
    sıralamaya sokmak, sıralamayı uydurmak olurdu."""
    from .main import _pct_of
    try:
        roster = json.loads(row["roster_json"] or "[]")
    except Exception:
        return None
    if _frozen_xi(roster, row["mode"]) is None:
        return None
    pct = _pct_of(ref, "score", row["overall_pct"])
    if pct is None:
        return None
    return {
        "id": row["id"],                       # challenge'a verilecek entry_id
        "username": row["username"], "name": row["name"], "shape": row["mode"],
        "pct": pct,
        "seasons": sorted({str(p["SEASON"]) for p in roster if p.get("SEASON")}),
        "leagues": sorted({p["LEAGUE"] for p in roster if p.get("LEAGUE")}),
        "created_at": row["created_at"],
        # Kırpılmış: tam oyuncu satırı 151 alan (~4 KB), 25 giriş ≈ 1,9 MB eder;
        # kartın çizmesi gereken alanlar ≈ 107 KB. Tam satırlar sunucuda kalıyor
        # (meydan okuma onlarla kuruluyor), istemciye gitmiyor.
        "roster": [{k: p.get(k) for k in _BOARD_PLAYER_KEYS} for p in roster],
    }


_BOARD_SQL = ("SELECT r.id, r.user_id, r.name, r.mode, r.overall_pct, r.roster_json, "
              "r.created_at, u.username FROM saved_rosters r "
              "JOIN users u ON r.user_id = u.id WHERE r.sport = 'football' ")


def _challenge_stats(ids: list[int]) -> dict:
    """entry_id -> {attempts, beaten}: kaç kişi meydan okudu, kaçı kazandı."""
    if not ids:
        return {}
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT entry_id, COUNT(*) AS n, SUM(won) AS w FROM football_challenge_results "
            f"WHERE entry_id IN ({','.join('?' * len(ids))}) GROUP BY entry_id", ids).fetchall()
    return {r["entry_id"]: {"attempts": r["n"], "beaten": int(r["w"] or 0)} for r in rows}


def _with_stats(entries: list[dict]) -> list[dict]:
    stats = _challenge_stats([e["id"] for e in entries])
    for e in entries:
        e["challenges"] = stats.get(e["id"], {"attempts": 0, "beaten": 0})
    return entries


@router.get("/api/football/board")
def football_board(limit: int = Query(25, ge=1, le=100)):
    """Persantil başına tek temsilci kadro, en yüksekten. İlk kaydeden kazanır."""
    from .main import _chem_reference
    ref = _chem_reference()
    with get_conn() as conn:
        rows = conn.execute(_BOARD_SQL + "ORDER BY r.id ASC").fetchall()
    best: dict[int, dict] = {}
    for r in rows:
        e = _board_entry(r, ref)
        if e and e["pct"] not in best:
            best[e["pct"]] = e
    entries = [best[k] for k in sorted(best, reverse=True)][:limit]
    return {"entries": _with_stats(entries), "reference_n": (ref or {}).get("n")}


@router.get("/api/football/board/at-score")
def football_board_at_score(pct: int = Query(..., ge=0, le=100),
                            limit: int = Query(50, ge=1, le=200)):
    """Belirli bir persantile ulaşmış TÜM kadrolar — Board'da başka bir kadroyla
    oynamak isteyenin seçim listesi. En yeni önce."""
    from .main import _chem_reference
    ref = _chem_reference()
    with get_conn() as conn:
        rows = conn.execute(_BOARD_SQL + "ORDER BY r.id DESC").fetchall()
    entries = []
    for r in rows:
        e = _board_entry(r, ref)
        if e and e["pct"] == pct:
            entries.append(e)
        if len(entries) >= limit:
            break
    return {"entries": _with_stats(entries)}


def _init_challenge_state(room_row, frozen: dict, entry: dict) -> dict:
    """Meydan okuma durumu: koltuk 2 (kadronun sahibi) baştan DOLU ve hazır,
    draft yalnız koltuk 1 için işliyor. Rakibin XI'i takenIds'te — çarktan aynı
    oyuncuyu çekemezsin."""
    st = _init_state(room_row, first=1)
    st["shapes"][2] = entry["shape"]
    st["squads"][2] = {slot: {**p, "_slot": slot} for slot, p in frozen.items()}
    st["takenIds"] = [int(p["PLAYER_ID"]) for p in frozen.values()]
    st["ready"]["2"] = True
    st["challenge"] = {"entry_id": entry["id"], "owner": entry["username"],
                       "name": entry["name"], "pct": entry["pct"],
                       "shape": entry["shape"]}
    return st


def _record_challenge_result(row, result: dict, entry_id: int) -> None:
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO football_challenge_results "
                "(challenger_id, entry_id, room_code, won, decided_by, agg) "
                "VALUES (?,?,?,?,?,?)",
                (row["p1_user_id"], entry_id, row["room_code"],
                 1 if result.get("winner") == "a" else 0,   # a = p1 = meydan okuyan
                 result.get("decidedBy"),
                 f"{result.get('aggA')}-{result.get('aggB')}"))
    except Exception as e:                                     # pragma: no cover
        print(f"[football_ws] meydan okuma sonucu kaydedilemedi: {e}", flush=True)


@router.post("/api/football/challenge")
async def football_challenge(body: ChallengeBody, user=Depends(get_current_user)):
    from .main import (_chem_reference, _h2h_code, _h2h_username,
                       _football_default_season)
    uid = int(user["sub"])
    with get_conn() as conn:
        row = conn.execute(_BOARD_SQL + "AND r.id = ?", (body.entry_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Challenge entry not found")
    if row["user_id"] == uid:
        raise HTTPException(400, "Cannot challenge your own squad")
    if body.length not in ("xi", "squad"):
        raise HTTPException(400, "Invalid draft length: " + str(body.length))
    roster = json.loads(row["roster_json"] or "[]")
    entry = _board_entry(row, _chem_reference())
    frozen = _frozen_xi(roster, row["mode"]) if entry else None
    if entry is None or frozen is None:
        raise HTTPException(409, "That squad can't be challenged")
    if body.length == "squad":
        # Tam kadro: rakibin yedekleri de donmuş kadrosuna girer (draft 18'e
        # ulaşınca biten taraf olarak sayılması için). Geçerli 7 yedek şart.
        bench = {p["_slot"]: p for p in roster if isinstance(p, dict)
                 and str(p.get("_slot", "")).startswith("SUB")}
        if sorted(bench) != [f"SUB{i}" for i in range(1, 8)]:
            raise HTTPException(409, "That squad can't be challenged")
        frozen = {**frozen, **bench}
    if uid in USER_MATCH or _user_in_open_room(uid):
        raise HTTPException(409, "You are already in a room")

    code = None
    for _ in range(6):
        c = _h2h_code()
        try:
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO football_h2h_rooms "
                    "(room_code, mode, status, season, p1_user_id, p2_user_id, "
                    "p1_name, p2_name, flow, challenge_entry_id, length) "
                    "VALUES (?, 'challenge', 'building', ?, ?, ?, ?, ?, 'challenge', ?, ?)",
                    (c, _football_default_season(), uid, row["user_id"],
                     _h2h_username(uid), row["username"], body.entry_id, body.length))
            code = c
            break
        except Exception as e:
            if "UNIQUE" not in str(e):
                break
    if code is None:
        raise HTTPException(500, "Could not open a room")

    # Donmuş durum ŞİMDİ kuruluyor ve diske yazılıyor, soket bağlanırken değil:
    # sahibi bu arada kadrosunu silerse meydan okuyanın odası altından çekilmesin.
    st = _init_challenge_state(_row(code), frozen, entry)
    _save(code, st)
    return {"room_code": code, "opponent": {
        "username": entry["username"], "name": entry["name"], "shape": entry["shape"],
        "pct": entry["pct"], "roster": entry["roster"]}}


# ── Odadan ayrılma ───────────────────────────────────────────────────────────
# Arayüz "Leave"e basınca yalnız kendi state'ini sıfırlıyordu; sunucudaki satır
# 'building' kalıyor, hem host hâlâ dolu bir oda görüyor hem de ayrılan kişi
# _user_in_open_room yüzünden 12 saat boyunca eşleştirmeye giremiyordu.
#
# Ne olacağı odanın türüne bağlı:
#   • friend + misafir ayrılıyor → koltuk BOŞALIYOR, oda 'waiting'e dönüyor.
#     Kod hâlâ paylaşılabilir, başka biri girebilir.
#   • online (eşleştirmeyle kurulmuş) ya da host ayrılıyor → oda 'abandoned'.
#     Eşleştirilmiş çiftte bekleyecek kimse yok; host giderse oda sahipsiz.
# Koltuklar değiştiği için draft durumu da (bellek + DB) siliniyor — yoksa yeni
# gelen eski koltuk atamasıyla devam ederdi.

@router.post("/api/football/h2h/room/{code}/leave")
async def leave_h2h_room(code: str, user=Depends(get_current_user)):
    uid = int(user["sub"])
    row = _row(code)
    if not row:
        raise HTTPException(404, "Room not found")
    if uid not in (row["p1_user_id"], row["p2_user_id"]):
        raise HTTPException(403, "You are not in this room")
    if row["status"] in ("resolved", "abandoned"):
        # Bitmiş sonuca ya da kapanmış odaya dokunma.
        return {"ok": True, "status": row["status"], "reopened": False}

    is_host = uid == row["p1_user_id"]
    reopen = (not is_host) and row["mode"] == "friend"
    async with _lock(code):
        with get_conn() as conn:
            if reopen:
                conn.execute(
                    "UPDATE football_h2h_rooms SET p2_user_id=NULL, p2_name=NULL, "
                    "p2_squad_json=NULL, status='waiting', draft_state_json=NULL, "
                    "updated_at=datetime('now') WHERE room_code=?", (code,))
            else:
                conn.execute(
                    "UPDATE football_h2h_rooms SET status='abandoned', "
                    "draft_state_json=NULL, updated_at=datetime('now') "
                    "WHERE room_code=?", (code,))
        ROOM_STATES.pop(code, None)
    new_status = "waiting" if reopen else "abandoned"

    # Ayrılanın soketini kapat, kalana haber ver.
    mine = CONNS.get(code, {}).pop(uid, None)
    if mine is not None:
        try:
            await mine.close(code=1000)
        except Exception:
            pass
    await _broadcast(code, {"type": "opponent_left", "user_id": uid,
                            "room_status": new_status}, exclude=uid)
    return {"ok": True, "status": new_status, "reopened": reopen}


def sweep_stale_football_rooms() -> int:
    """Açılıp unutulmuş odaları kapat. Basketbolun aynısı; kod tekrar
    kullanılamıyor çünkü tablo ayrı."""
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE football_h2h_rooms SET status='abandoned' "
            "WHERE status IN ('waiting','building') "
            f"AND updated_at < datetime('now', '-{STALE_HOURS} hours')")
        return cur.rowcount or 0
