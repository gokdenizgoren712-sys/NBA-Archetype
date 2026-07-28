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
import json
import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from pydantic import BaseModel

from .db import get_conn
from .auth import get_current_user, _decode

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
    _vcol = "score_Versatile" if "score_Versatile" in full.columns else (
        "versatility_score" if "versatility_score" in full.columns else None)
    v_cut = float(full[_vcol].quantile(0.85)) if _vcol and full[_vcol].notna().any() else None

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
    if _vcol and v_cut is not None and _vcol in df.columns:
        df["is_versatile"] = (df[_vcol].fillna(-1) >= v_cut).astype(bool)

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


class CreateRoomBody(BaseModel):
    mode: str = "friend"          # 'friend' | 'online' — Faz 4'te matchmaking 'online' ile oda açacak
    wheel_mode: str = "round"     # 'round' | 'pick' — Same Screen'deki çark alt-modunun aynısı


@router.post("/api/game/room")
def create_room(body: CreateRoomBody, user=Depends(get_current_user)):
    """Oda açar — oda kurucusunun kararı: mod + çark alt-modu. Sezon/takım
    ARTIK burada seçilmiyor; Same Screen'deki gibi her round/pick canlı spin
    ediliyor (bkz. _spin_round, Faz3-M2). season/team_a/team_b kolonları eski
    (tek-seferlik-havuz) modelden kalma, boş placeholder ile dolduruluyor —
    şemayı bozmadan (NOT NULL) ölü alan olarak bırakıldı."""
    if body.wheel_mode not in ("round", "pick"):
        raise HTTPException(400, "Geçersiz wheel_mode")

    room_code = _gen_room_code()
    user_id = int(user["sub"])
    with get_conn() as conn:
        for _ in range(5):
            try:
                conn.execute(
                    """INSERT INTO game_rooms
                       (room_code, mode, status, season, team_a, team_b, wheel_mode,
                        player1_user_id, turn_user_id, pick_number)
                       VALUES (?, ?, 'waiting', '', '', '', ?, ?, ?, 0)""",
                    (room_code, body.mode, body.wheel_mode, user_id, user_id),
                )
                break
            except Exception:
                room_code = _gen_room_code()  # çakışma — yeni kod dene
        else:
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

        conn.execute(
            """UPDATE game_rooms SET player2_user_id = ?, status = 'drafting',
               updated_at = datetime('now') WHERE room_code = ?""",
            (user_id, room_code),
        )
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


@router.websocket("/ws/game/room/{room_code}")
async def room_socket(ws: WebSocket, room_code: str, token: str = Query(...)):
    try:
        payload = _decode(token)
        user_id = int(payload["sub"])
    except Exception:
        await ws.close(code=4401)
        return

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
        ).fetchone()
    if not row or user_id not in (row["player1_user_id"], row["player2_user_id"]):
        await ws.close(code=4403)
        return

    await manager.connect(room_code, user_id, ws)
    try:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM game_rooms WHERE room_code = ?", (room_code,)
            ).fetchone()
            picks = conn.execute(
                "SELECT * FROM game_room_picks WHERE room_id = ? ORDER BY pick_number",
                (row["id"],),
            ).fetchall()

        pool = json.loads(row["pool_json"]) if row["pool_json"] else []
        await ws.send_json({
            "type": "state",
            "room": _room_to_dict(row),
            "usernames": _fetch_usernames([row["player1_user_id"], row["player2_user_id"]]),
            "pool": pool,
            "picks": [dict(p) for p in picks],
            "connected_user_ids": manager.connected_user_ids(room_code),
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
            # Faz 3: pick mesaj tipi burada işlenecek (sıra/havuz/slot doğrulaması).
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_code, user_id)
        await manager.broadcast(room_code, {"type": "opponent_left", "user_id": user_id})
