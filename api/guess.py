"""Guess — sezon öncesi tahmin odaları (link ile paylaşılan, hesapsız).

Bir oda = rastgele bir token (URL'deki sır). İçine yazılan isimler "üye"dir;
her üyeye oluşturulurken bir DÜZENLEME ANAHTARI verilir, yalnız o anahtarı
tutan tarayıcı o üyenin seçimlerini değiştirebilir (başkasının sütununa
yazılamaz). Hesap/giriş yok: link bilen okur, kendi adıyla katılan yazar.

Tahmin biçimi (picks), üç oyun:
  ou    : {"NYK": "O" | "U", ...}          takım galibiyet çizgisine over/under
  order : {"east": [15 abbr], "west": [15 abbr]}   konferansta bitiş sırası (1. → 15.)
  champ : "OKC"                            şampiyon

Kilit: GUESS_LOCK_AT (ISO, ör. 2026-10-21T23:00:00+00:00) geçince yazma kapanır.
Tanımsızsa kilit yok — sezon açılış gecesi BELİRLENİP ortam değişkenine konmalı.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .db import get_conn
from . import moderation_words

router = APIRouter(prefix="/api/guess", tags=["Guess"])

MAX_MEMBERS = 20
NAME_MAX = 16
TITLE_MAX = 40

EAST = ["NYK", "BOS", "PHI", "TOR", "BKN", "CLE", "DET", "IND", "CHI", "MIL",
        "ORL", "ATL", "MIA", "CHA", "WAS"]
WEST = ["OKC", "DEN", "MIN", "POR", "UTA", "LAL", "GSW", "PHX", "SAC", "LAC",
        "SAS", "HOU", "DAL", "NOP", "MEM"]
ALL_TEAMS = set(EAST) | set(WEST)

_ready = False
_lock = threading.Lock()


def _ensure_tables() -> None:
    global _ready
    if _ready:
        return
    with _lock:
        if _ready:
            return
        with get_conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS guess_rooms (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS guess_members (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id    TEXT NOT NULL REFERENCES guess_rooms(id) ON DELETE CASCADE,
                name       TEXT NOT NULL,
                key_hash   TEXT NOT NULL,
                picks      TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE (room_id, name COLLATE NOCASE)
            );
            CREATE INDEX IF NOT EXISTS idx_guess_members_room ON guess_members(room_id);
            """)
        _ready = True


def _locked() -> bool:
    raw = os.environ.get("GUESS_LOCK_AT", "").strip()
    if not raw:
        return False
    try:
        at = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= at


def _hash(key: str) -> str:
    import hashlib
    return hashlib.sha256(key.encode()).hexdigest()


def _clean_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", (raw or "").strip())
    name = "".join(ch for ch in name if ch.isprintable())[:NAME_MAX].strip()
    if not name:
        raise HTTPException(400, "Enter a name.")
    if moderation_words.blocked_word(name):
        raise HTTPException(400, "That name isn't allowed.")
    return name


def _clean_picks(raw: object) -> dict:
    """Beklenen şekle zorla; bilinmeyen anahtar/takım sessizce atılır."""
    if not isinstance(raw, dict):
        raise HTTPException(400, "picks must be an object.")
    out: dict = {}
    ou = raw.get("ou")
    if isinstance(ou, dict):
        out["ou"] = {k: v for k, v in ou.items() if k in ALL_TEAMS and v in ("O", "U")}
    order = raw.get("order")
    if isinstance(order, dict):
        clean_order = {}
        for conf, pool in (("east", EAST), ("west", WEST)):
            seq = order.get(conf)
            if isinstance(seq, list):
                seen: list = []
                for t in seq:
                    if isinstance(t, str) and t in pool and t not in seen:
                        seen.append(t)
                clean_order[conf] = seen
        out["order"] = clean_order
    champ = raw.get("champ")
    if isinstance(champ, str) and champ in ALL_TEAMS:
        out["champ"] = champ
    return out


def _member_row(r) -> dict:
    try:
        picks = json.loads(r["picks"])
    except (TypeError, ValueError):
        picks = {}
    return {"id": r["id"], "name": r["name"], "picks": picks, "updated_at": r["updated_at"]}


class MemberIn(BaseModel):
    name: str = Field(..., max_length=64)
    picks: Optional[dict] = None


class RoomIn(BaseModel):
    title: str = Field("", max_length=80)
    members: list[MemberIn] = Field(default_factory=list, max_length=MAX_MEMBERS)


class PicksIn(BaseModel):
    picks: dict


def _insert_member(c, room_id: str, name: str, picks: dict) -> tuple[int, str]:
    key = secrets.token_urlsafe(16)
    cur = c.execute(
        "INSERT INTO guess_members (room_id, name, key_hash, picks) VALUES (?,?,?,?)",
        (room_id, name, _hash(key), json.dumps(picks, separators=(",", ":"))),
    )
    return cur.lastrowid, key


@router.post("/rooms")
def create_room(body: RoomIn):
    _ensure_tables()
    if _locked():
        raise HTTPException(423, "Picks are locked for this season.")
    title = re.sub(r"\s+", " ", body.title.strip())[:TITLE_MAX]
    if title and moderation_words.blocked_word(title):
        raise HTTPException(400, "That title isn't allowed.")
    names = [_clean_name(m.name) for m in body.members]
    if len({n.lower() for n in names}) != len(names):
        raise HTTPException(400, "Names must be different.")
    room_id = secrets.token_urlsafe(6)
    members = []
    with get_conn() as c:
        c.execute("INSERT INTO guess_rooms (id, title) VALUES (?,?)", (room_id, title))
        for name, m in zip(names, body.members):
            mid, key = _insert_member(c, room_id, name, _clean_picks(m.picks or {}))
            members.append({"id": mid, "name": name, "key": key})
    return {"room_id": room_id, "title": title, "members": members}


@router.get("/rooms/{room_id}")
def get_room(room_id: str):
    _ensure_tables()
    with get_conn() as c:
        room = c.execute("SELECT id, title, created_at FROM guess_rooms WHERE id=?", (room_id,)).fetchone()
        if not room:
            raise HTTPException(404, "Room not found.")
        rows = c.execute(
            "SELECT id, name, picks, updated_at FROM guess_members WHERE room_id=? ORDER BY id", (room_id,)
        ).fetchall()
    return {
        "room_id": room["id"], "title": room["title"], "created_at": room["created_at"],
        "locked": _locked(), "max_members": MAX_MEMBERS,
        "members": [_member_row(r) for r in rows],
    }


@router.post("/rooms/{room_id}/members")
def join_room(room_id: str, body: MemberIn):
    _ensure_tables()
    if _locked():
        raise HTTPException(423, "Picks are locked for this season.")
    name = _clean_name(body.name)
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM guess_rooms WHERE id=?", (room_id,)).fetchone():
            raise HTTPException(404, "Room not found.")
        n = c.execute("SELECT COUNT(*) FROM guess_members WHERE room_id=?", (room_id,)).fetchone()[0]
        if n >= MAX_MEMBERS:
            raise HTTPException(409, f"This room is full ({MAX_MEMBERS} people).")
        if c.execute("SELECT 1 FROM guess_members WHERE room_id=? AND name=? COLLATE NOCASE",
                     (room_id, name)).fetchone():
            raise HTTPException(409, "That name is already taken in this room.")
        mid, key = _insert_member(c, room_id, name, _clean_picks(body.picks or {}))
    return {"id": mid, "name": name, "key": key}


def _auth_member(c, room_id: str, member_id: int, key: Optional[str]):
    row = c.execute("SELECT id, key_hash FROM guess_members WHERE id=? AND room_id=?",
                    (member_id, room_id)).fetchone()
    if not row:
        raise HTTPException(404, "Person not found.")
    if not key or not secrets.compare_digest(row["key_hash"], _hash(key)):
        raise HTTPException(403, "This pick sheet belongs to someone else.")
    return row


@router.put("/rooms/{room_id}/members/{member_id}")
def save_picks(room_id: str, member_id: int, body: PicksIn, x_guess_key: Optional[str] = Header(None)):
    _ensure_tables()
    if _locked():
        raise HTTPException(423, "Picks are locked for this season.")
    picks = _clean_picks(body.picks)
    with get_conn() as c:
        _auth_member(c, room_id, member_id, x_guess_key)
        c.execute("UPDATE guess_members SET picks=?, updated_at=datetime('now') WHERE id=?",
                  (json.dumps(picks, separators=(",", ":")), member_id))
    return {"ok": True, "picks": picks}


@router.delete("/rooms/{room_id}/members/{member_id}")
def remove_member(room_id: str, member_id: int, x_guess_key: Optional[str] = Header(None)):
    _ensure_tables()
    if _locked():
        raise HTTPException(423, "Picks are locked for this season.")
    with get_conn() as c:
        _auth_member(c, room_id, member_id, x_guess_key)
        c.execute("DELETE FROM guess_members WHERE id=?", (member_id,))
    return {"ok": True}
