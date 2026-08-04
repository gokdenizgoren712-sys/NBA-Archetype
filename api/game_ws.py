"""
Çok-oyunculu draft odaları — REST (oluştur/katıl) + WebSocket (canlı senkron).

Faz 3 (With a Friend): "ince sunucu, istemci deterministik hesaplar" mimarisi
— bkz. .claude/plans/fancy-cooking-gizmo.md. Sunucu rastgele/otoriter kararları
(spin sonucu, koç örneklemi) çözüp yayınlıyor, yapısal doğrulama + relay
yapıyor (sıra/havuz/joker durumu), ama Same Screen'in zaten SAF olan skor/
fiyat/uygunluk/simülasyon mantığını (game/positions.js, game/salary.js,
game/lineupScore.js, game/seasonSim.js, game/headToHead.js) Python'a PORT
ETMİYOR — bu mantık istemcide (her iki tarafta da, aynı senkronize veriden)
deterministik olarak yeniden hesaplanıyor. Seri maçları da aynı ilkeyle:
"Simulate Game N"e tıklayan istemci sonucu KENDİSİ hesaplayıp relay için
sunucuya gönderiyor, sunucu simülasyonu çalıştırmıyor.

main.py'deki oyun/skor fonksiyonlarına (döngüsel import'tan kaçınmak için)
FONKSİYON İÇİNDE import edilir — main.py'nin geri kalanının zaten kullandığı
örüntü (bkz. main.py'deki `from score_compat import ...` çağrıları).
"""
import asyncio
import json
import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from pydantic import BaseModel

from .db import get_conn
from .auth import get_current_user, _decode, _is_banned

router = APIRouter()

_ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # I/1/O/0 karışmasın


def _gen_room_code(n: int = 6) -> str:
    return "".join(random.choices(_ROOM_CODE_ALPHABET, k=n))


class ConnectionManager:
    """room_code -> {user_id: WebSocket}. Tek process, in-memory (Railway tek
    container çalıştırıyor — çoklu instance'a ölçeklenirse bir mesaj kuyruğu
    (Redis pub/sub vb.) gerekir, MVP kapsamı dışında)."""

    def __init__(self):
        self.rooms: dict[str, dict[int, WebSocket]] = {}

    async def connect(self, room_code: str, user_id: int, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_code, {})[user_id] = ws

    def disconnect(self, room_code: str, user_id: int):
        conns = self.rooms.get(room_code)
        if conns and user_id in conns:
            del conns[user_id]
        if room_code in self.rooms and not self.rooms[room_code]:
            del self.rooms[room_code]

    async def broadcast(self, room_code: str, message: dict, exclude: int | None = None):
        for uid, ws in list(self.rooms.get(room_code, {}).items()):
            if uid == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def send_to(self, room_code: str, user_id: int, message: dict):
        ws = self.rooms.get(room_code, {}).get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    def connected_user_ids(self, room_code: str) -> list[int]:
        return list(self.rooms.get(room_code, {}).keys())


manager = ConnectionManager()


def _build_multiplayer_pool(season: str, team_a: str, team_b: str) -> list[dict]:
    """İki takımın GP-filtreli birleşik roster havuzu. game_players() (api/main.py)
    ile aynı POS5/is_timeless/is_versatile alanlarını üretir, ama tek-takım
    top-20 kırpması YOK — multiplayer 18 pick'e kadar ihtiyaç duyabilir.
    NOT: game_players() ile bir miktar mantık tekrarı var (kasıtlı — canlı
    single-player yolunu bu yeni özellik için riske atmamak için ayrıldı)."""
    from .main import (
        _load_scores, _load_historical, _gp_filter,
        _fill_position_from_components, _assign_pos5, _assign_secondary_pos,
        _timeless_cutoff,
    )
    import pandas as pd

    if season == "2025-26":
        full = _load_scores().copy()
        full = _gp_filter(full, 20)
    else:
        full = _load_historical().copy()
        full = full[full["SEASON"] == season]
        _multi = {"2TM", "3TM", "4TM", "TOT"}
        if "TEAM_ABBREVIATION" in full.columns:
            full = full[~full["TEAM_ABBREVIATION"].str.upper().isin(_multi)]
        full = _gp_filter(full, 10)

    if full.empty or "TEAM_ABBREVIATION" not in full.columns:
        return []

    tl_cutoff = _timeless_cutoff(full["overall_score"]) if "overall_score" in full.columns else 1.0

    df = full[full["TEAM_ABBREVIATION"].str.upper().isin([team_a.upper(), team_b.upper()])].copy()
    if df.empty:
        return []

    df = _fill_position_from_components(df)
    df["POS5"] = _assign_pos5(df)
    _sec_heur = _assign_secondary_pos(df, df["POS5"])
    if "POS_SECONDARY" in df.columns:
        _bref_sec = df["POS_SECONDARY"].astype(str).str.strip().str.upper()
        _valid = _bref_sec.isin(["PG", "SG", "SF", "PF", "C"])
        df["POS5_SECONDARY"] = _bref_sec.where(_valid, _sec_heur)
    else:
        df["POS5_SECONDARY"] = _sec_heur
    df.loc[df["POS5_SECONDARY"] == df["POS5"], "POS5_SECONDARY"] = ""

    if "overall_score" in df.columns:
        df["is_timeless"] = (df["overall_score"] >= tl_cutoff).astype(bool)
    # is_versatile: artık burada yeniden hesaplanmıyor — _load_scores()
    # (2025-26 için) zaten doğru is_versatile'ı sağlıyor, df bunu `full`'dan
    # kopyalıyor (2026-07: eski score_Versatile fallback'i buradaydı, o kolon
    # kaldırıldığı için sessizce çalışmıyordu, ayrıca game_players()'la
    # gereksiz mantık tekrarıydı — bkz. versatility.py'nin yeniden yazımı).

    score_cols = [c for c in df.columns if c.startswith("score_")]
    keep = ["PLAYER_ID", "PLAYER_NAME", "primary_arch", "overall_score", "POSITION", "POS5",
            "POS5_SECONDARY", "TEAM_ABBREVIATION", "GP", "G", "MIN", "PTS", "REB", "AST",
            "STL", "BLK", "TOV", "FG3_PCT", "is_timeless", "is_versatile"] + score_cols
    keep = [c for c in keep if c in df.columns]
    df = df[keep].copy()
    if "overall_score" in df.columns:
        df = df.sort_values("overall_score", ascending=False, na_position="last")

    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    records = df.to_dict(orient="records")
    # NaN'ları JSON-güvenli None'a çevir
    for r in records:
        for k, v in r.items():
            if isinstance(v, float) and v != v:  # NaN
                r[k] = None
    return records


def _room_to_dict(row) -> dict:
    return {
        "room_code":       row["room_code"],
        "mode":            row["mode"],
        "status":          row["status"],
        "wheel_mode":      row["wheel_mode"],
        "player1_user_id": row["player1_user_id"],
        "player2_user_id": row["player2_user_id"],
        "turn_user_id":    row["turn_user_id"],
        "pick_number":     row["pick_number"],
    }


def _fetch_usernames(user_ids: list[int]) -> dict[int, str]:
    ids = [uid for uid in user_ids if uid]
    if not ids:
        return {}
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT id, username FROM users WHERE id IN ({','.join('?' * len(ids))})", ids
        ).fetchall()
    return {r["id"]: r["username"] for r in rows}


# ── Faz3-M2+: With a Friend oyun state makinesi ──────────────────────────────
# "İnce sunucu, istemci deterministik hesaplar" mimarisi (bkz. dosya başı
# docstring). Sunucu burada sadece: (a) rastgele spin/koç kararlarını çözüp
# yayınlar, (b) sıra/havuz/joker durumunu yapısal doğrulayıp relay eder.
# Fiyat/uygunluk/skor/simülasyon YENİDEN HESAPLANMIYOR — Same Screen'in aynı
# saf JS fonksiyonları istemcide (senkronize ham veriden) çalışıyor.
POSITIONS = ["PG", "SG", "SF", "PF", "C"]
BENCH_SLOTS = ["B1", "B2", "B3", "B4"]
ALL_SLOTS = POSITIONS + BENCH_SLOTS
EMPTY_JOKERS = {
    "reTeam": True, "reYear": True, "reBoth": True, "double": True,
    "discover": True, "ban": True, "forceTeam": True, "forceYear": True,
}

ROOM_STATES: dict[str, dict] = {}
ROOM_LOCKS: dict[str, asyncio.Lock] = {}

ROOM_ABANDON_HOURS = 2   # bu kadar saat aktivitesiz odalar temizlik sırasında silinir


def _lock_for(room_code: str) -> asyncio.Lock:
    lock = ROOM_LOCKS.get(room_code)
    if lock is None:
        lock = ROOM_LOCKS[room_code] = asyncio.Lock()
    return lock


def _save_state(room_code: str, state: dict) -> None:
    """Canlı state'i game_rooms.state_json'a yazar — 2026-07 dayanıklılık
    (bkz. modül başındaki not). Her başarılı state mutasyonundan sonra
    çağrılır; sunucu restart olursa _restore_state() bunu geri okur.
    Yazma başarısız olursa (DB kilitli vb.) sessizce vazgeçilir — bellekteki
    ROOM_STATES zaten güncel, bu sadece bir yedekleme katmanı."""
    state["_last_activity"] = datetime.now(timezone.utc).isoformat()
    try:
        with get_conn() as conn:
            conn.execute(
                "UPDATE game_rooms SET state_json = ?, updated_at = datetime('now') WHERE room_code = ?",
                (json.dumps(state, default=str), room_code),
            )
    except Exception as e:
        print(f"[game_ws] _save_state başarısız ({room_code}): {e}")


def _restore_state(row) -> dict | None:
    """DB'deki state_json'dan canlı state'i geri yükler (sunucu restart
    sonrası ROOM_STATES'te yoksa). Bozuk/eksik JSON ise None döner —
    çağıran taraf _init_room_state() ile taze başlatır."""
    raw = row["state_json"] if "state_json" in row.keys() else None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception as e:
        print(f"[game_ws] _restore_state başarısız ({row['room_code']}): {e}")
        return None


def _cleanup_stale_rooms() -> None:
    """Tamamlanmış veya uzun süre aktivitesiz odaları ROOM_STATES'ten
    düşürür — 2026-07 dayanıklılık: önceden hiç temizlik yoktu, terk
    edilen her oda süresiz bellekte kalıyordu. Gerçek bir periyodik
    arka plan task'ı yerine (ekstra lifecycle karmaşıklığı) her yeni
    WS bağlantısında fırsatçı şekilde çağrılır — aktif kullanımda
    yeterince sık tetiklenir."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=ROOM_ABANDON_HOURS)
    stale = []
    for code, state in ROOM_STATES.items():
        if state.get("phase") == "complete":
            stale.append(code)
            continue
        last = state.get("_last_activity")
        if last:
            try:
                if datetime.fromisoformat(last) < cutoff:
                    stale.append(code)
            except Exception:
                pass
    for code in stale:
        ROOM_STATES.pop(code, None)
        ROOM_LOCKS.pop(code, None)


def _other_uid(uid: int, state: dict) -> int:
    p1, p2 = state["player1_user_id"], state["player2_user_id"]
    return p2 if uid == p1 else p1


def _init_room_state(row, usernames: dict) -> dict:
    p1, p2 = row["player1_user_id"], row["player2_user_id"]
    return {
        "mode": row["mode"],   # 'friend' | 'online' | 'challenge' — Faz 4: challenge tek taraflı akış
        "wheel_mode": row["wheel_mode"],
        "phase": "era",   # era|drafting|placing|review|coach1|coach2|series|complete
        "usernames": usernames,
        "player1_user_id": p1, "player2_user_id": p2,
        "sim_era_id": None,
        "round": 0,
        "turn_queue": [p1, p2],
        "turn_pos": 0,
        "spin_seq": 0,     # istemci "yeni bir spin oldu" tespiti için — kozmetik animasyon tetikler
        "chosen_season": None, "chosen_team": None,
        "pool": [],
        "picked_player": None,
        "double_active": False, "discover_active": False,
        "banned_player_id": None, "ban_voided": False, "ban_picking": False,
        "counter_dismissed": False,
        "lineups": {p1: {s: None for s in ALL_SLOTS}, p2: {s: None for s in ALL_SLOTS}},
        "jokers": {p1: dict(EMPTY_JOKERS), p2: dict(EMPTY_JOKERS)},
        "ready_for_coaches": {p1: False, p2: False},
        "coach_seed": None,
        "coaches": {p1: None, p2: None},
        "series_games": [],
        "series_wins": {p1: 0, p2: 0},
        "counter_jokers_enabled": True,
    }


def _taken_names(state: dict) -> set:
    names = set()
    for uid in (state["player1_user_id"], state["player2_user_id"]):
        for p in state["lineups"][uid].values():
            if p:
                names.add(p.get("PLAYER_NAME"))
    return names


def _do_spin(state: dict, keep_season: bool, keep_team: bool) -> bool:
    """Same Screen'in beginRound/spinForPick/respinWithin'inin sunucu eşdeğeri
    — gerçek game_teams/game_players fonksiyonlarını (main.py, zaten REST
    endpoint'lerinin arkasındaki fonksiyonlar) tekrar tekrar çağırır."""
    from .main import game_seasons, game_teams, game_players
    seasons = game_seasons().get("seasons", [])
    if not seasons:
        return False
    for _ in range(8):
        season = state["chosen_season"] if (keep_season and state["chosen_season"]) else random.choice(seasons)
        teams = game_teams(season).get("teams", [])
        if not teams:
            continue
        if keep_team and state["chosen_team"] in teams:
            team = state["chosen_team"]
        else:
            team = random.choice(teams)
        players = game_players(season, team).get("players", [])
        taken = _taken_names(state)
        pool = [p for p in players if p.get("PLAYER_NAME") not in taken]
        if len(pool) >= 2:
            state["chosen_season"] = season
            state["chosen_team"] = team
            state["pool"] = pool
            state["spin_seq"] += 1
            return True
    return False


def _begin_round(state: dict, round_num: int, participants: list, first: int):
    other = _other_uid(first, state)
    queue = [u for u in (first, other) if u in participants]
    state["round"] = round_num
    state["turn_queue"] = queue
    state["turn_pos"] = 0
    state["picked_player"] = None
    state["double_active"] = False
    state["discover_active"] = False
    state["banned_player_id"] = None
    state["ban_voided"] = False
    state["ban_picking"] = False
    state["counter_dismissed"] = False
    state["phase"] = "drafting"
    _do_spin(state, keep_season=False, keep_team=False)


def _spin_for_pick(state: dict):
    state["picked_player"] = None
    state["double_active"] = False
    state["discover_active"] = False
    state["phase"] = "drafting"
    _do_spin(state, keep_season=False, keep_team=False)


def _pick_era(state: dict, uid: int, era_id: str) -> str | None:
    if uid != state["player1_user_id"]:
        return "Only the room creator picks the era"
    if state["phase"] != "era":
        return "Era already chosen"
    if not era_id:
        return "Missing era_id"
    state["sim_era_id"] = era_id
    _begin_round(state, 1, [state["player1_user_id"], state["player2_user_id"]], state["player1_user_id"])
    return None


def _pick_player(state: dict, uid: int, player: dict) -> str | None:
    if state["phase"] != "drafting":
        return "Not in drafting phase"
    if not player:
        return "Missing player"
    if state["turn_queue"][state["turn_pos"]] != uid:
        return "Not your turn"
    name = player.get("PLAYER_NAME")
    if state["banned_player_id"] == name and not state["ban_voided"]:
        return "Player is banned"
    if not any(p.get("PLAYER_NAME") == name for p in state["pool"]):
        return "Player not in pool"
    state["picked_player"] = player
    state["discover_active"] = False
    state["phase"] = "placing"
    return None


def _cancel_pick(state: dict, uid: int) -> str | None:
    if state["turn_queue"][state["turn_pos"]] != uid:
        return "Not your turn"
    state["picked_player"] = None
    state["phase"] = "drafting"
    return None


def _place_pos(state: dict, uid: int, pos: str, player: dict) -> str | None:
    """Same Screen'in placePos'unun sunucu eşdeğeri. Fiyat/pozisyon puanlaması
    YENİDEN HESAPLANMIYOR — istemci zaten hesaplayıp player objesine gömdü,
    sunucu sadece yapısal doğrulama yapıp yazıyor."""
    if state["phase"] != "placing":
        return "Not in placing phase"
    if state["turn_queue"][state["turn_pos"]] != uid:
        return "Not your turn"
    if not state["picked_player"] or not player or state["picked_player"].get("PLAYER_NAME") != player.get("PLAYER_NAME"):
        return "No matching pending pick"
    if pos not in ALL_SLOTS:
        return "Invalid slot"
    if state["lineups"][uid][pos] is not None:
        return "Slot already filled"

    state["lineups"][uid][pos] = player
    state["picked_player"] = None
    state["pool"] = [p for p in state["pool"] if p.get("PLAYER_NAME") != player.get("PLAYER_NAME")]

    still_open = any(state["lineups"][uid][s] is None for s in ALL_SLOTS)
    if state["double_active"] and still_open:
        state["double_active"] = False
        state["phase"] = "drafting"
        return None
    state["double_active"] = False

    next_pos = state["turn_pos"] + 1
    if next_pos < len(state["turn_queue"]):
        state["turn_pos"] = next_pos
        state["banned_player_id"] = None
        state["ban_voided"] = False
        state["counter_dismissed"] = False
        if state["wheel_mode"] == "pick":
            _spin_for_pick(state)
        else:
            state["phase"] = "drafting"
        return None

    p1, p2 = state["player1_user_id"], state["player2_user_id"]
    participants = [u for u in (p1, p2) if any(state["lineups"][u][s] is None for s in ALL_SLOTS)]
    if not participants:
        state["phase"] = "review"
        # Challenge modunda p2 donmuş — hiç bağlanmayacağı için "ready" bekletmek
        # oyunu sonsuza dek review'da kilitler. Init'teki ön-hazır bayrağını
        # (bkz. _init_challenge_state) burada da koru (bu satır onu eziyordu).
        p2_ready = state.get("mode") == "challenge"
        state["ready_for_coaches"] = {p1: False, p2: p2_ready}
        return None
    first_next = _other_uid(state["turn_queue"][0], state)
    _begin_round(state, state["round"] + 1, participants, first_next)
    return None


def _rearrange_slot(state: dict, uid: int, slot_a: str, slot_b: str) -> str | None:
    if state["phase"] in ("era", "series", "complete"):
        return "Cannot rearrange now"
    if slot_a not in ALL_SLOTS or slot_b not in ALL_SLOTS:
        return "Invalid slot"
    lu = state["lineups"][uid]
    lu[slot_a], lu[slot_b] = lu[slot_b], lu[slot_a]
    return None


def _use_joker(state: dict, uid: int, jtype: str) -> str | None:
    if state["phase"] != "drafting":
        return "Not in drafting phase"
    if state["turn_queue"][state["turn_pos"]] != uid:
        return "Not your turn"
    if jtype not in ("reTeam", "reYear", "reBoth", "double", "discover"):
        return "Invalid joker"
    if not state["jokers"][uid].get(jtype):
        return "Joker already used"
    if state["banned_player_id"] and not state["ban_voided"]:
        state["ban_voided"] = True
    state["jokers"][uid][jtype] = False
    if jtype == "reTeam":
        _do_spin(state, keep_season=True, keep_team=False)
    elif jtype == "reYear":
        _do_spin(state, keep_season=False, keep_team=True)
    elif jtype == "reBoth":
        _do_spin(state, keep_season=False, keep_team=False)
    elif jtype == "double":
        state["double_active"] = True
    elif jtype == "discover":
        state["discover_active"] = True
    return None


def _use_counter_joker(state: dict, uid: int, ctype: str) -> str | None:
    if not state.get("counter_jokers_enabled", True):
        return "Counter-jokers are disabled against a frozen board roster"
    if state["phase"] not in ("drafting", "placing"):
        return "Not a draftable phase"
    active_uid = state["turn_queue"][state["turn_pos"]]
    waiting_uid = _other_uid(active_uid, state)
    if uid != waiting_uid:
        return "Not your counter"
    if state["counter_dismissed"]:
        return "Already acted this turn"
    if ctype not in ("ban", "forceTeam", "forceYear"):
        return "Invalid counter joker"
    if not state["jokers"][uid].get(ctype):
        return "Counter joker already used"
    state["jokers"][uid][ctype] = False
    state["counter_dismissed"] = True
    if ctype == "ban":
        state["ban_picking"] = True
        return None
    state["banned_player_id"] = None
    state["ban_voided"] = False
    if ctype == "forceTeam":
        _do_spin(state, keep_season=True, keep_team=False)
    elif ctype == "forceYear":
        _do_spin(state, keep_season=False, keep_team=True)
    return None


def _confirm_ban(state: dict, uid: int, player_name: str) -> str | None:
    active_uid = state["turn_queue"][state["turn_pos"]]
    waiting_uid = _other_uid(active_uid, state)
    if uid != waiting_uid or not state["ban_picking"]:
        return "Not your ban to confirm"
    if not player_name:
        return "Missing player_name"
    state["banned_player_id"] = player_name
    state["ban_picking"] = False
    return None


def _dismiss_counter(state: dict, uid: int) -> str | None:
    active_uid = state["turn_queue"][state["turn_pos"]]
    waiting_uid = _other_uid(active_uid, state)
    if uid != waiting_uid:
        return "Not your turn to dismiss"
    state["counter_dismissed"] = True
    return None


def _ready_for_coaches(state: dict, uid: int) -> str | None:
    if state["phase"] != "review":
        return "Not in review phase"
    state["ready_for_coaches"][uid] = True
    if all(state["ready_for_coaches"].values()):
        state["coach_seed"] = random.randint(0, 2**31 - 1)
        state["phase"] = "coach1"
    return None


def _pick_coach(state: dict, uid: int, coach_name: str) -> str | None:
    p1, p2 = state["player1_user_id"], state["player2_user_id"]
    if not coach_name:
        return "Missing coach_name"
    if state["phase"] == "coach1" and uid == p1:
        state["coaches"][p1] = coach_name
        # Challenge modunda p2 donmuş kadro — hiç bağlanmıyor, koçu init'te
        # zaten atandı (bkz. _init_challenge_state). coach2'yi hiç beklemeden
        # doğrudan seriye geç.
        if state.get("mode") == "challenge":
            state["phase"] = "series"
            state["series_games"] = []
            state["series_wins"] = {p1: 0, p2: 0}
        else:
            state["coach_seed"] = random.randint(0, 2**31 - 1)
            state["phase"] = "coach2"
        return None
    if state["phase"] == "coach2" and uid == p2:
        state["coaches"][p2] = coach_name
        state["phase"] = "series"
        state["series_games"] = []
        state["series_wins"] = {p1: 0, p2: 0}
        return None
    return "Not your coach pick"


def _advance_series(state: dict, uid: int, game: dict) -> str | None:
    """Rakip cihazın bilgisayarına GÜVENMİYORUZ diye değil (aksine — mimari
    kararı buydu, bkz. dosya başı docstring), ama en az bir yapısal kontrol:
    seri zaten bitmişse yeni maç kabul etme."""
    if state["phase"] != "series":
        return "Not in series phase"
    if not game or "winner_user_id" not in game:
        return "Malformed game result"
    if state["series_wins"] and max(state["series_wins"].values()) >= 4:
        return "Series already over"
    state["series_games"].insert(0, game)
    winner = game.get("winner_user_id")
    if winner in state["series_wins"]:
        state["series_wins"][winner] += 1
    if state["series_wins"] and max(state["series_wins"].values()) >= 4:
        state["phase"] = "complete"
    return None


HANDLERS = {
    "pick_era":          lambda s, uid, m: _pick_era(s, uid, m.get("era_id")),
    "pick_player":       lambda s, uid, m: _pick_player(s, uid, m.get("player")),
    "cancel_pick":       lambda s, uid, m: _cancel_pick(s, uid),
    "place_pos":         lambda s, uid, m: _place_pos(s, uid, m.get("pos"), m.get("player")),
    "use_joker":         lambda s, uid, m: _use_joker(s, uid, m.get("joker")),
    "use_counter_joker": lambda s, uid, m: _use_counter_joker(s, uid, m.get("joker")),
    "confirm_ban":       lambda s, uid, m: _confirm_ban(s, uid, m.get("player_name")),
    "dismiss_counter":   lambda s, uid, m: _dismiss_counter(s, uid),
    "rearrange_slot":    lambda s, uid, m: _rearrange_slot(s, uid, m.get("slot_a"), m.get("slot_b")),
    "ready_for_coaches": lambda s, uid, m: _ready_for_coaches(s, uid),
    "pick_coach":        lambda s, uid, m: _pick_coach(s, uid, m.get("coach_name")),
    "advance_series":    lambda s, uid, m: _advance_series(s, uid, m.get("game")),
}


def _envelope(room_code: str, state: dict) -> dict:
    return {
        "type": "state",
        "room": {
            "room_code": room_code,
            "wheel_mode": state["wheel_mode"],
            "status": "drafting",
            "player1_user_id": state["player1_user_id"],
            "player2_user_id": state["player2_user_id"],
        },
        "usernames": state["usernames"],
        "connected_user_ids": manager.connected_user_ids(room_code),
        "game": state,
    }


class CreateRoomBody(BaseModel):
    mode: str = "friend"          # 'friend' | 'online' | 'challenge' — bkz. _create_room_row
    wheel_mode: str = "round"     # 'round' | 'pick' — Same Screen'deki çark alt-modunun aynısı


def _create_room_row(mode: str, wheel_mode: str, creator_user_id: int) -> str:
    """Oda satırını açar, oluşturulan room_code'u döner. create_room() (REST)
    VE matchmaking eşleşmesi (Faz 4) bunu paylaşır — kopyalama yerine ortak
    fonksiyon (bkz. docs/online-mode-backend-prompt.md). season/team_a/team_b
    kolonları eski (tek-seferlik-havuz) modelden kalma, boş placeholder ile
    dolduruluyor — şemayı bozmadan (NOT NULL) ölü alan olarak bırakıldı."""
    room_code = _gen_room_code()
    with get_conn() as conn:
        for _ in range(5):
            try:
                conn.execute(
                    """INSERT INTO game_rooms
                       (room_code, mode, status, season, team_a, team_b, wheel_mode,
                        player1_user_id, turn_user_id, pick_number)
                       VALUES (?, ?, 'waiting', '', '', '', ?, ?, ?, 0)""",
                    (room_code, mode, wheel_mode, creator_user_id, creator_user_id),
                )
                return room_code
            except Exception:
                room_code = _gen_room_code()  # çakışma — yeni kod dene
    raise RuntimeError("Oda kodu üretilemedi")


def _finalize_join(room_code: str, user_id: int) -> None:
    """İkinci oyuncuyu odaya ekler, drafting'e açar. join_room() (REST) VE
    matchmaking eşleşmesi (Faz 4) bunu paylaşır."""
    with get_conn() as conn:
        conn.execute(
            """UPDATE game_rooms SET player2_user_id = ?, status = 'drafting',
               updated_at = datetime('now') WHERE room_code = ?""",
            (user_id, room_code),
        )


@router.post("/api/game/room")
def create_room(body: CreateRoomBody, user=Depends(get_current_user)):
    """Oda açar — oda kurucusunun kararı: mod + çark alt-modu. Sezon/takım
    ARTIK burada seçilmiyor; Same Screen'deki gibi her round/pick canlı spin
    ediliyor (bkz. _spin_round, Faz3-M2)."""
    if body.wheel_mode not in ("round", "pick"):
        raise HTTPException(400, "Geçersiz wheel_mode")
    try:
        room_code = _create_room_row(body.mode, body.wheel_mode, int(user["sub"]))
    except RuntimeError:
        raise HTTPException(500, "Oda kodu üretilemedi")
    return {"room_code": room_code}


@router.post("/api/game/room/{room_code}/join")
def join_room(room_code: str, user=Depends(get_current_user)):
    user_id = int(user["sub"])
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Oda bulunamadı")
        if row["player1_user_id"] == user_id:
            d = _room_to_dict(row)  # oda sahibi tekrar açtı — no-op
            d["usernames"] = _fetch_usernames([row["player1_user_id"], row["player2_user_id"]])
            return d
        if row["player2_user_id"] and row["player2_user_id"] != user_id:
            raise HTTPException(409, "Oda dolu")
        if row["status"] != "waiting":
            raise HTTPException(409, f"Oda katılıma kapalı (status={row['status']})")

    _finalize_join(room_code, user_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
        ).fetchone()
    d = _room_to_dict(row)
    d["usernames"] = _fetch_usernames([row["player1_user_id"], row["player2_user_id"]])
    return d


@router.get("/api/game/room/{room_code}")
def get_room(room_code: str, user=Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Oda bulunamadı")
    d = _room_to_dict(row)
    d["usernames"] = _fetch_usernames([row["player1_user_id"], row["player2_user_id"]])
    return d


# ── Faz 4 (Online Opponent): FIFO matchmaking kuyruğu ────────────────────────
# ROOM_STATES gibi bellekte, tek process — bkz. docs/online-mode-backend-prompt.md.
# Kalıcılık gerekmiyor: süreç yeniden başlarsa kuyruk boşalır, istemci Idle'a döner.
MM_QUEUE: list[dict] = []          # [{user_id, wheel_mode, joined_at}], FIFO
MM_WS: dict[int, WebSocket] = {}   # user_id -> matchmaking WS
MM_PENDING: dict[int, dict] = {}   # user_id -> henüz WS bağlanmadan önce eşleşmişse bekleyen "matched" mesajı


def sweep_stale_rooms_at_startup() -> int:
    """Deploy'da HER başlangıçta otomatik çağrılır (bkz. api/main.py startup
    bloğu) — 2026-08 düzeltmesinden ÖNCE 'drafting' durumunda terk edilmiş
    odalar DB'de süresiz kalmıştı (bkz. _user_in_active_game'in yukarıdaki
    notu). Bu, o birikmiş eski odaları TEK SEFERDE temizler; kullanıcının
    kendi başına bir endpoint çağırmasına gerek kalmaz — yeni terk edilen
    odalar zaten _user_in_active_game'in updated_at eşiğiyle otomatik
    çözülüyor, bu sadece geçmiş birikimi temizliyor."""
    n = 0
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT room_code FROM game_rooms WHERE status = 'drafting' AND updated_at <= datetime('now', ?)",
            (f"-{ROOM_ABANDON_HOURS} hours",),
        ).fetchall()
        for r in rows:
            conn.execute(
                "UPDATE game_rooms SET status = 'abandoned' WHERE room_code = ?",
                (r["room_code"],),
            )
            n += 1
    return n


def _mm_opponent_info(user_id: int) -> dict:
    with get_conn() as conn:
        u = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
        stats = conn.execute(
            "SELECT COUNT(*) AS n, MAX(pct) AS best FROM lineup_games WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return {
        "username": u["username"] if u else "Player",
        "games": stats["n"] or 0,
        "best": stats["best"],
    }


def _user_in_active_game(user_id: int) -> bool:
    """2026-08 düzeltme: _cleanup_stale_rooms() sadece bellekteki ROOM_STATES'i
    temizliyor, game_rooms.status DB'de hiç güncellenmiyordu — terk edilmiş
    (ör. tek kişi With a Friend/Live'a girip hiç bitirmediği) bir oda süresiz
    'drafting' kalıp kullanıcıyı matchmaking'e sonsuza dek sokmuyordu. updated_at
    (_save_state her mutasyonda günceller) ROOM_ABANDON_HOURS'tan eskiyse artık
    "aktif" sayılmıyor — aynı terk edilmişlik eşiği, tek noktadan."""
    with get_conn() as conn:
        row = conn.execute(
            """SELECT 1 FROM game_rooms WHERE status = 'drafting'
               AND (player1_user_id = ? OR player2_user_id = ?)
               AND updated_at > datetime('now', ?) LIMIT 1""",
            (user_id, user_id, f"-{ROOM_ABANDON_HOURS} hours"),
        ).fetchone()
    return row is not None


async def _mm_notify(user_id: int, message: dict) -> None:
    """WS bağlıysa hemen gönder; değilse mailbox'a koy — bağlandığında okunur.
    Sıralama garantisi yok (POST /join, sonra istemci WS'e bağlanıyor) ama bu
    ikisi arasında eşleşme olursa mesaj kaybolmasın diye (bkz. prompt notu)."""
    ws = MM_WS.get(user_id)
    if ws:
        try:
            await ws.send_json(message)
            return
        except Exception:
            pass
    MM_PENDING[user_id] = message


async def _mm_broadcast_queue_size() -> None:
    size = len(MM_QUEUE)
    for uid, ws in list(MM_WS.items()):
        try:
            await ws.send_json({"type": "queue", "size": size})
        except Exception:
            pass


class MatchmakingJoinBody(BaseModel):
    wheel_mode: str = "round"


@router.post("/api/game/matchmaking/join")
async def matchmaking_join(body: MatchmakingJoinBody, user=Depends(get_current_user)):
    if body.wheel_mode not in ("round", "pick"):
        raise HTTPException(400, "Geçersiz wheel_mode")
    user_id = int(user["sub"])
    if _user_in_active_game(user_id):
        raise HTTPException(409, "already in a game")
    if any(e["user_id"] == user_id for e in MM_QUEUE):
        return {"queued": True, "queue_size": len(MM_QUEUE)}

    MM_QUEUE.append({"user_id": user_id, "wheel_mode": body.wheel_mode,
                      "joined_at": datetime.now(timezone.utc)})

    if len(MM_QUEUE) >= 2:
        a = MM_QUEUE.pop(0)
        b = MM_QUEUE.pop(0)
        wheel_mode = a["wheel_mode"]  # kuyruğa ilk giren oyuncununki
        try:
            room_code = _create_room_row("friend", wheel_mode, a["user_id"])
        except RuntimeError:
            # Oda açılamadı — ikisini de kuyruğun başına geri koy, istemciler yeniden dener.
            MM_QUEUE.insert(0, b)
            MM_QUEUE.insert(0, a)
            raise HTTPException(500, "Oda kodu üretilemedi")
        _finalize_join(room_code, b["user_id"])
        await _mm_notify(a["user_id"], {"type": "matched", "room_code": room_code,
                                         "opponent": _mm_opponent_info(b["user_id"])})
        await _mm_notify(b["user_id"], {"type": "matched", "room_code": room_code,
                                         "opponent": _mm_opponent_info(a["user_id"])})
        return {"queued": True, "queue_size": 0}

    await _mm_broadcast_queue_size()
    return {"queued": True, "queue_size": len(MM_QUEUE)}


@router.delete("/api/game/matchmaking")
def matchmaking_leave(user=Depends(get_current_user)):
    global MM_QUEUE
    user_id = int(user["sub"])
    MM_QUEUE = [e for e in MM_QUEUE if e["user_id"] != user_id]
    return {"left": True}


@router.post("/api/game/matchmaking/clear-stuck")
def clear_my_stuck_rooms(user=Depends(get_current_user)):
    """Acil çıkış: kullanıcının 'drafting' durumundaki TÜM odalarını terk eder.
    _user_in_active_game()'in updated_at eşiği (bkz. yukarıdaki not) yeni
    kilitlenmeleri zamanla kendiliğinden çözer, ama YENİ deploy edilmeden önce
    zaten kilitlenmiş kullanıcılar için anlık bir çıkış kapısı bu."""
    user_id = int(user["sub"])
    cleared = []
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT room_code FROM game_rooms WHERE status = 'drafting' AND (player1_user_id = ? OR player2_user_id = ?)",
            (user_id, user_id),
        ).fetchall()
        for r in rows:
            conn.execute(
                "UPDATE game_rooms SET status = 'abandoned', updated_at = datetime('now') WHERE room_code = ?",
                (r["room_code"],),
            )
            cleared.append(r["room_code"])
    for code in cleared:
        ROOM_STATES.pop(code, None)
        ROOM_LOCKS.pop(code, None)
    return {"cleared": cleared}


@router.websocket("/ws/game/matchmaking")
async def matchmaking_socket(ws: WebSocket, token: str = Query(...)):
    global MM_QUEUE
    try:
        payload = _decode(token)
        user_id = int(payload["sub"])
    except Exception:
        await ws.close(code=4401)
        return
    if _is_banned(user_id):
        await ws.close(code=4403)
        return

    await ws.accept()
    MM_WS[user_id] = ws
    try:
        pending = MM_PENDING.pop(user_id, None)
        if pending:
            await ws.send_json(pending)
        else:
            await ws.send_json({"type": "queue", "size": len(MM_QUEUE)})
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
        if MM_WS.get(user_id) is ws:
            del MM_WS[user_id]
        before = len(MM_QUEUE)
        MM_QUEUE = [e for e in MM_QUEUE if e["user_id"] != user_id]
        if len(MM_QUEUE) != before:
            await _mm_broadcast_queue_size()


# ── Faz 4 (Online Opponent): Board Challenge ─────────────────────────────────
# Donmuş kadroya karşı tek taraflı draft — bkz. docs/online-mode-backend-prompt.md
# "Yapılacak 2". Rakip (board sahibi) hiç bağlanmaz; kadrosu roster_json'dan
# baştan dolu gelir, koçu init'te otomatik atanır, counter-joker'lar kapalı.
_CHALLENGE_COACH_POOL = [
    "Gregg Popovich", "Phil Jackson", "Steve Kerr", "Erik Spoelstra",
    "Pat Riley", "Rick Carlisle", "Nick Nurse", "Mike Budenholzer",
    "Tyronn Lue", "Joe Mazzulla",
]


def _init_challenge_state(p1: int, p2: int, usernames: dict, roster: list, sim_era_id: str) -> dict:
    lineup_p2 = {s: None for s in ALL_SLOTS}
    for i, slot in enumerate(ALL_SLOTS):
        if i < len(roster):
            lineup_p2[slot] = roster[i]
    state = {
        "mode": "challenge",
        "wheel_mode": "round",
        "phase": "drafting",   # _begin_round aşağıda hemen üzerine yazıyor — "era" fazı hiç yok
        "usernames": usernames,
        "player1_user_id": p1, "player2_user_id": p2,
        "sim_era_id": sim_era_id or None,
        "round": 0,
        "turn_queue": [p1], "turn_pos": 0,
        "spin_seq": 0,
        "chosen_season": None, "chosen_team": None,
        "pool": [],
        "picked_player": None,
        "double_active": False, "discover_active": False,
        "banned_player_id": None, "ban_voided": False, "ban_picking": False,
        "counter_dismissed": False,
        "lineups": {p1: {s: None for s in ALL_SLOTS}, p2: lineup_p2},
        "jokers": {p1: dict(EMPTY_JOKERS), p2: dict(EMPTY_JOKERS)},
        "ready_for_coaches": {p1: False, p2: True},
        "coach_seed": None,
        "coaches": {p1: None, p2: random.choice(_CHALLENGE_COACH_POOL)},
        "series_games": [],
        "series_wins": {p1: 0, p2: 0},
        "counter_jokers_enabled": False,
    }
    # Era meydan okuyanı seçmiyor (donmuş kadronun era'sı) — "era" fazını atla,
    # doğrudan round 1'i SADECE p1 için başlat (p2'nin lineup'ı zaten dolu,
    # sonraki round'larda _place_pos'un participants filtresi p2'yi otomatik
    # dışlar — bkz. _place_pos içindeki boş-slot kontrolü).
    _begin_round(state, 1, [p1], p1)
    return state


class ChallengeBody(BaseModel):
    entry_id: int


# Board Challenge, Single Player'da o ana kadar oynanmış TÜM Salary Cap
# oyunlarının (aynı lineup_games tablosu, iki ayrı bağımsız sistem DEĞİL —
# bkz. 2026-08 kullanıcı kararı) puan-bazlı bir görünümüdür. Aynı puana (pct)
# ulaşmış onlarca neredeyse-aynı kadro yerine, HER PUAN için tek bir temsilci
# kadro gösterilir; o puandaki diğer kadrolar /api/game/board/at-score ile
# görülebilir. Temsilci seçimi: en iyi sezon sonucuna sahip olan kazanır
# (kullanıcı kararı) — sezon hiç simüle edilmemişse (season_result=NULL) en
# düşük öncelikte kalır.
_SEASON_RESULT_RANK = {
    "THREEPEAT": 0, "REPEAT": 1, "CHAMPION": 2, "FINALS": 3,
    "CF": 4, "SEMI": 5, "R1": 6, "MISSED": 7,
}

def _season_result_rank(season_result):
    return _SEASON_RESULT_RANK.get(season_result, 8)

def _board_row_to_entry(r):
    try:
        roster = json.loads(r["roster_json"])
    except Exception:
        return None
    if not isinstance(roster, list) or len(roster) != 9:
        return None
    return {
        "id": r["id"], "username": r["username"], "pct": r["pct"], "grade": r["grade"],
        "wins": r["wins"], "season_result": r["season_result"], "sim_era": r["sim_era"],
        "created_at": r["created_at"], "roster": roster,
    }

@router.get("/api/game/board")
def get_board(limit: int = Query(25, ge=1, le=100)):
    """Puan başına tek temsilci kadro — bkz. yukarıdaki modül notu.
    roster_json'ı olmayan (eski) kayıtlar hiç görünmez (bkz. db.py migration
    notu, isim eşleştirmeye asla düşülmesin diye kasıtlı)."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT lg.id, lg.pct, lg.grade, lg.roster_json, lg.created_at,
                      lg.wins, lg.season_result, lg.sim_era, u.username
               FROM lineup_games lg JOIN users u ON lg.user_id = u.id
               WHERE lg.mode = 'salarycap' AND lg.roster_json IS NOT NULL
               ORDER BY lg.pct DESC"""
        ).fetchall()
    best_by_pct = {}
    for r in rows:
        cur = best_by_pct.get(r["pct"])
        if cur is None or _season_result_rank(r["season_result"]) < _season_result_rank(cur["season_result"]):
            best_by_pct[r["pct"]] = r
    entries = []
    for pct in sorted(best_by_pct, reverse=True):
        entry = _board_row_to_entry(best_by_pct[pct])
        if entry:
            entries.append(entry)
        if len(entries) >= limit:
            break
    return {"entries": entries}


@router.get("/api/game/board/at-score")
def get_board_at_score(pct: int = Query(..., ge=0, le=100), limit: int = Query(50, ge=1, le=200)):
    """Belirli bir puana (pct) ulaşmış TÜM Salary Cap kadroları — Board'un
    puan-başına-tek-temsilci görünümünde başka bir kadroyla oynamak
    isteyenler için filtreleme/seçim listesi (bkz. 2026-08 kullanıcı kararı)."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT lg.id, lg.pct, lg.grade, lg.roster_json, lg.created_at,
                      lg.wins, lg.season_result, lg.sim_era, u.username
               FROM lineup_games lg JOIN users u ON lg.user_id = u.id
               WHERE lg.mode = 'salarycap' AND lg.roster_json IS NOT NULL AND lg.pct = ?
               ORDER BY lg.id DESC LIMIT ?""",
            (pct, limit),
        ).fetchall()
    entries = [e for e in (_board_row_to_entry(r) for r in rows) if e]
    return {"entries": entries}


@router.post("/api/game/challenge")
def challenge_board(body: ChallengeBody, user=Depends(get_current_user)):
    user_id = int(user["sub"])
    with get_conn() as conn:
        row = conn.execute(
            """SELECT * FROM lineup_games
               WHERE id = ? AND mode = 'salarycap' AND roster_json IS NOT NULL""",
            (body.entry_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Challenge entry not found")
        opponent_user_id = row["user_id"]
        if opponent_user_id == user_id:
            raise HTTPException(400, "Cannot challenge your own roster")
        try:
            roster = json.loads(row["roster_json"])
        except Exception:
            raise HTTPException(500, "Corrupt roster data")
        if not isinstance(roster, list) or len(roster) != 9:
            raise HTTPException(500, "Invalid roster data")
        usernames = _fetch_usernames([user_id, opponent_user_id])

    try:
        room_code = _create_room_row("challenge", "round", user_id)
    except RuntimeError:
        raise HTTPException(500, "Oda kodu üretilemedi")
    _finalize_join(room_code, opponent_user_id)

    sim_era = row["sim_era"] or ""
    ROOM_STATES[room_code] = _init_challenge_state(user_id, opponent_user_id, usernames, roster, sim_era)
    _save_state(room_code, ROOM_STATES[room_code])

    return {
        "room_code": room_code,
        "sim_era": sim_era,
        "wheel_mode": "round",
        "opponent": {
            "username": usernames.get(opponent_user_id, "Opponent"),
            "pct": row["pct"], "grade": row["grade"], "roster": roster,
        },
    }


@router.websocket("/ws/game/room/{room_code}")
async def room_socket(ws: WebSocket, room_code: str, token: str = Query(...)):
    try:
        payload = _decode(token)
        user_id = int(payload["sub"])
    except Exception:
        await ws.close(code=4401)
        return
    if _is_banned(user_id):
        await ws.close(code=4403)
        return

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
        ).fetchone()
    if not row or user_id not in (row["player1_user_id"], row["player2_user_id"]):
        await ws.close(code=4403)
        return

    await manager.connect(room_code, user_id, ws)
    _cleanup_stale_rooms()
    try:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
            ).fetchone()

        if room_code not in ROOM_STATES and row["player2_user_id"]:
            # Önce DB'den geri yüklemeyi dene (sunucu restart olduysa maç
            # devam etsin) — bozuk/eksik olursa taze başlat.
            restored = _restore_state(row)
            if restored is not None:
                ROOM_STATES[room_code] = restored
            else:
                usernames = _fetch_usernames([row["player1_user_id"], row["player2_user_id"]])
                ROOM_STATES[room_code] = _init_room_state(row, usernames)
                _save_state(room_code, ROOM_STATES[room_code])

        state = ROOM_STATES.get(room_code)
        if state:
            # Kendine gönder + KARŞI tarafa da tam state broadcast et — oda
            # state'i az önce ilk kez kurulmuş olabilir, karşı taraf henüz
            # hiç görmemiş olabilir (sadece "opponent_joined" yetmez).
            await ws.send_json(_envelope(room_code, state))
            if row["player2_user_id"]:
                await manager.broadcast(room_code, _envelope(room_code, state), exclude=user_id)
        else:
            await ws.send_json({
                "type": "state",
                "room": _room_to_dict(row),
                "usernames": _fetch_usernames([row["player1_user_id"], row["player2_user_id"]]),
                "connected_user_ids": manager.connected_user_ids(room_code),
                "game": None,
            })
            if row["player2_user_id"]:
                await manager.broadcast(room_code, {"type": "opponent_joined", "user_id": user_id},
                                         exclude=user_id)

        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            mtype = msg.get("type")
            if mtype == "ping":
                await ws.send_json({"type": "pong"})
                continue
            handler = HANDLERS.get(mtype)
            if not handler:
                continue
            async with _lock_for(room_code):
                state = ROOM_STATES.get(room_code)
                if not state:
                    await ws.send_json({"type": "error", "message": "Room not ready — waiting for both players"})
                    continue
                err = handler(state, user_id, msg)
                if err:
                    await ws.send_json({"type": "error", "message": err})
                    continue
                _save_state(room_code, state)
                await manager.broadcast(room_code, _envelope(room_code, state))
    except WebSocketDisconnect:
        # Karşı tarafa bildir — önceden sessizce düşüyordu, diğer oyuncunun
        # ekranında UI sonsuza kadar "rakip bekleniyor" gösteriyordu, hiçbir
        # toast/uyarı yoktu (2026-07 dayanıklılık denetimi, Faz3-M6).
        # "opponent_left" ismi kasıtlı — frontend (WithAFriendGame.jsx)
        # bunu zaten bekliyordu, hiç tetikleyen bir backend event'i yoktu.
        # State ROOM_STATES'te (ve artık DB'de) hayatta kalır — reconnect
        # olursa aynı maça geri döner, bu sadece bir bildirim.
        await manager.broadcast(room_code, {"type": "opponent_left", "user_id": user_id},
                                 exclude=user_id)
    finally:
        manager.disconnect(room_code, user_id)
        await manager.broadcast(room_code, {"type": "opponent_left", "user_id": user_id})
