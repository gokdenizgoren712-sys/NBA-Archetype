# -*- coding: utf-8 -*-
"""Basketbol fantezi — draft uç noktaları (/api/fantasy/...).

api/fantasy.py'nin router'ına dahil edilir (main.py'ye ayrı satır gerekmez).
Motor: src/fantasy/draft.py. Plan: docs/FANTASY_PLAN.md Faz 2.

  GET  /draft/plans          draft sırasına göre 3 alternatif plan (yaygın ligler önhesaplı)
  POST /draft/plans          aynısı, özel lig formatıyla
  POST /draft/recommend      canlı draft asistanı: alınanlar + benimkiler → öneri
  POST /mock/advance         mock draft: botlar sıra kullanıcıya gelene kadar seçer
  POST /draft/grade          biten draftın notu, lig tablosu, çalıntı/erken seçimler
  GET/POST/PUT/DELETE /drafts[/{id}]  kullanıcının kayıtlı draftları (giriş gerekli)

Durumsuz tasarım: mock draft ve asistan tüm durumu (pickler, tohum) istemciden
alır. Aynı tohum aynı bot tahtalarını verir; sunucu oturum tutmaz, ölçeklenir.
"""

from __future__ import annotations

import json
import threading
from collections import OrderedDict
from typing import Optional, Union

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config.fantasy_formats import FORMATS, LIMITS, FormatError, get_format, validate_format
from src.fantasy import draft as dr

from .auth import get_current_user
from .db import get_conn
from .fantasy import DATA_DIR, SEASON, _load, _num, _valued

router = APIRouter()

MAX_REC = 25
PLAN_SIMS_ON_DEMAND = 15
GRADE_SIMS = 150
MAX_DRAFTS_PER_USER = 100
MAX_STATE_BYTES = 64 * 1024
DRAFT_KINDS = ("mock", "assistant", "league")

_lock = threading.Lock()
_boards: "OrderedDict[str, dr.Board]" = OrderedDict()
_plans_cache: "OrderedDict[str, dict]" = OrderedDict()
_precomputed = {"mtime": None, "data": None}


# ── Format ve tahta ─────────────────────────────────────────────────────────

FormatIn = Union[str, dict]


def _resolve(fmt_in: FormatIn, teams: Optional[int]) -> dict:
    """Hazır format anahtarı ya da tam özel format sözlüğü → doğrulanmış format."""
    try:
        if isinstance(fmt_in, str):
            if fmt_in not in FORMATS:
                raise HTTPException(422, f"Unknown format '{fmt_in}'. Options: {', '.join(FORMATS)}")
            return get_format(fmt_in, **({"teams": teams} if teams else {}))
        fmt = {**fmt_in}
        if teams:
            fmt["teams"] = teams
        fmt.setdefault("matchup", "h2h")
        fmt["playoff_weeks"] = tuple(fmt.get("playoff_weeks", (20, 21, 22)))
        validate_format(fmt)
        if not all(isinstance(w, int) and 1 <= w <= 24 for w in fmt["playoff_weeks"]):
            raise HTTPException(422, "playoff_weeks must be week numbers between 1 and 24")
        fmt["key"] = "custom"
        return fmt
    except FormatError as e:
        raise HTTPException(422, str(e))


def _board(fmt: dict, basis: str) -> dr.Board:
    df = _valued(fmt, (), basis)
    # Anahtar projeksiyon dosyasının mtime'ı ile: id(df) Python'un yeniden
    # kullandığı bir kimlik, yenilenen veride eski tahtayı döndürebilirdi.
    key = json.dumps([fmt, basis, _load()["mtime"]], sort_keys=True, default=str)
    with _lock:
        if key in _boards:
            _boards.move_to_end(key)
            return _boards[key]
    b = dr.make_board(df, fmt)
    with _lock:
        _boards[key] = b
        while len(_boards) > 16:
            _boards.popitem(last=False)
    return b


def _player(b: dr.Board, pid: int) -> dict:
    r = b.df.iloc[b.row[pid]]
    return {"player_id": int(pid), "name": r["PLAYER_NAME"], "team": r["TEAM"],
            "eligible": list(b.elig[b.row[pid]]), "archetype": r["ARCHETYPE"] if isinstance(r["ARCHETYPE"], str) else None,
            "flags": [f for f in str(r["FLAGS"] or "").split(",") if f],
            "rank": int(r["RANK"]), "value": _num(r["VALUE"], 3), "adp": _num(r["ADP"], 1)}


def _check_ids(b: dr.Board, ids: list[int], what: str) -> None:
    unknown = [i for i in ids if i not in b.row]
    if unknown:
        raise HTTPException(422, f"{len(unknown)} {what} are not in the {SEASON} fantasy pool: {unknown[:5]}")
    if len(set(ids)) != len(ids):
        raise HTTPException(422, f"{what} contain duplicates")


def _check_slot(b: dr.Board, slot: int) -> None:
    if not 1 <= slot <= b.teams:
        raise HTTPException(422, f"slot must be between 1 and {b.teams}")


def _lineup(b: dr.Board, roster: list[int]) -> dict:
    slots, bench = dr.lineup_assignment([b.masks[b.row[p]] for p in roster], len(b.slots))
    return {"starters": [{"slot": b.slots[i], "player_id": (roster[p] if p is not None else None)}
                         for i, p in enumerate(slots)],
            "bench": [roster[p] for p in bench]}


# ── Planlar ─────────────────────────────────────────────────────────────────

def _precomputed_plans() -> dict | None:
    p = DATA_DIR / f"{SEASON}__fantasy_plans.json"
    if not p.exists():
        return None
    mtime = p.stat().st_mtime
    with _lock:
        if _precomputed["mtime"] != mtime:
            _precomputed.update(mtime=mtime, data=json.loads(p.read_text(encoding="utf-8")))
        return _precomputed["data"]


def _enrich_plans(b: dr.Board, plans: dict) -> dict:
    ids = {t["player_id"] for pl in plans["plans"] for r in pl["rounds"] for t in r["targets"]}
    return {**plans, "players": {str(i): _player(b, i) for i in ids if i in b.row}}


def _plans(fmt: dict, slot: int, basis: str) -> dict:
    b = _board(fmt, basis)
    _check_slot(b, slot)
    pre = _precomputed_plans()
    key = fmt.get("key")
    if (pre and basis == "total" and key in pre["formats"]
            and str(b.teams) in pre["formats"][key]
            and FORMATS.get(key, {}).get("roster") == fmt["roster"]):
        plans = pre["formats"][key][str(b.teams)][str(slot)]
        return {**_enrich_plans(b, plans), "source": "precomputed", "built_at": pre["built_at"]}
    ck = json.dumps([fmt, slot, basis], sort_keys=True, default=str)
    with _lock:
        hit = _plans_cache.get(ck)
    if hit is None:
        hit = dr.draft_plans(b, slot, sims=PLAN_SIMS_ON_DEMAND, seed=slot)
        with _lock:
            _plans_cache[ck] = hit
            while len(_plans_cache) > 64:
                _plans_cache.popitem(last=False)
    return {**_enrich_plans(b, hit), "source": "on_demand"}


@router.get("/draft/plans")
def draft_plans_preset(
    format: str = Query("yahoo_h2h_9cat"),
    teams: Optional[int] = Query(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1]),
    slot: int = Query(..., ge=1, le=LIMITS["teams"][1]),
    basis: str = Query("total", pattern="^(total|per_game)$"),
):
    return {"season": SEASON, **_plans(_resolve(format, teams), slot, basis)}


class PlansBody(BaseModel):
    format: FormatIn
    teams: Optional[int] = Field(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1])
    slot: int = Field(..., ge=1, le=LIMITS["teams"][1])
    basis: str = Field("total", pattern="^(total|per_game)$")


@router.post("/draft/plans")
def draft_plans_custom(body: PlansBody):
    return {"season": SEASON, **_plans(_resolve(body.format, body.teams), body.slot, body.basis)}


# ── Canlı draft asistanı ────────────────────────────────────────────────────

class RecommendBody(BaseModel):
    format: FormatIn = "yahoo_h2h_9cat"
    teams: Optional[int] = Field(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1])
    slot: int = Field(..., ge=1, le=LIMITS["teams"][1])
    taken: list[int] = Field(default_factory=list, max_length=400, description="Players drafted by others")
    mine: list[int] = Field(default_factory=list, max_length=20, description="Your players")
    current_pick: Optional[int] = Field(None, ge=1, le=400)
    punt: list[str] = Field(default_factory=list, max_length=8)
    basis: str = Field("total", pattern="^(total|per_game)$")
    n: int = Field(10, ge=1, le=MAX_REC)


def _recommend_response(b: dr.Board, taken: list[int], mine: list[int], current_pick: int,
                        slot: int, punt: tuple, n: int) -> dict:
    rec = dr.recommend(b, set(taken), list(mine), current_pick, slot, punt=punt, n=n)
    for r in rec.get("recommendations", []):
        r["player"] = _player(b, r["player_id"])
    rec["my_roster"] = [_player(b, p) for p in mine]
    rec["lineup"] = _lineup(b, list(mine))
    return rec


@router.post("/draft/recommend")
def draft_recommend(body: RecommendBody):
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    _check_ids(b, body.taken + body.mine, "players")
    if len(body.mine) > b.rounds:
        raise HTTPException(422, f"You can have at most {b.rounds} players in this format")
    punt = tuple(body.punt)
    if punt and not b.is_categories:
        raise HTTPException(422, "Punting only applies to category formats.")
    bad = [c for c in punt if c not in b.cats]
    if bad:
        raise HTTPException(422, f"cannot punt categories outside the format: {bad}")
    current = body.current_pick or len(body.taken) + len(body.mine) + 1
    if current > b.total_picks:
        raise HTTPException(422, "The draft is already complete")
    return {"season": SEASON, "format": fmt,
            **_recommend_response(b, body.taken, body.mine, current, body.slot, punt, body.n)}


# ── Mock draft ──────────────────────────────────────────────────────────────

class MockBody(BaseModel):
    format: FormatIn = "yahoo_h2h_9cat"
    teams: Optional[int] = Field(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1])
    slot: int = Field(..., ge=1, le=LIMITS["teams"][1])
    picks: list[int] = Field(default_factory=list, max_length=400, description="All picks so far, in order")
    seed: int = Field(..., ge=0, le=2**31 - 1)
    bot_style: str = Field("mixed", pattern="^(mixed|adp|value)$")
    basis: str = Field("total", pattern="^(total|per_game)$")
    n: int = Field(10, ge=1, le=MAX_REC)


def _bot_styles(b: dr.Board, slot: int, style: str) -> dict[int, str]:
    if style == "mixed":
        return dr.mixed_bot_styles(b.teams, slot)
    return {s: style for s in range(1, b.teams + 1) if s != slot}


def _picks_view(b: dr.Board, picks: list[int]) -> list[dict]:
    return [{"overall": i + 1, "round": i // b.teams + 1, "slot": dr.pick_owner(i + 1, b.teams),
             "player": _player(b, p)} for i, p in enumerate(picks)]


@router.post("/mock/advance")
def mock_advance(body: MockBody):
    """Botlar sıra kullanıcıya gelene (ya da draft bitene) kadar seçer."""
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    _check_ids(b, body.picks, "picks")
    if len(body.picks) > b.total_picks:
        raise HTTPException(422, f"A {b.teams}-team draft has {b.total_picks} picks")
    styles = _bot_styles(b, body.slot, body.bot_style)
    # Her botun tahtası yalnız (tohum, sıra) ile belirlenir — istekten isteğe aynı.
    orders = {s: dr._bot_order(b, st, np.random.default_rng([body.seed, s])) for s, st in styles.items()}

    picks = list(body.picks)
    rosters: dict[int, list[int]] = {s: [] for s in range(1, b.teams + 1)}
    for i, p in enumerate(picks):
        rosters[dr.pick_owner(i + 1, b.teams)].append(p)
    taken = set(picks)
    while len(picks) < b.total_picks:
        overall = len(picks) + 1
        owner = dr.pick_owner(overall, b.teams)
        if owner == body.slot:
            break
        left_after = b.rounds - len(rosters[owner]) - 1
        pid = dr._bot_pick(b, orders[owner], taken, rosters[owner], left_after)
        picks.append(pid)
        taken.add(pid)
        rosters[owner].append(pid)

    done = len(picks) >= b.total_picks
    mine = rosters[body.slot]
    out = {"season": SEASON, "format": fmt, "seed": body.seed, "bot_styles": {str(k): v for k, v in styles.items()},
           "picks": _picks_view(b, picks), "done": done,
           "on_the_clock": None if done else len(picks) + 1,
           "my_roster": [_player(b, p) for p in mine], "lineup": _lineup(b, mine)}
    if not done:
        others = [p for p in picks if p not in set(mine)]
        rec = _recommend_response(b, others, mine, len(picks) + 1, body.slot, (), body.n)
        out["recommendations"] = rec["recommendations"]
        out["next_pick"] = rec.get("next_pick")
        if b.is_categories:
            out["category_prob"] = rec["category_prob"]
            out["punt_suggestion"] = rec["punt_suggestion"]
    return out


# ── Draft notu ──────────────────────────────────────────────────────────────

class GradeBody(BaseModel):
    format: FormatIn = "yahoo_h2h_9cat"
    teams: Optional[int] = Field(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1])
    slot: int = Field(..., ge=1, le=LIMITS["teams"][1])
    picks: list[int] = Field(..., max_length=400)
    basis: str = Field("total", pattern="^(total|per_game)$")


@router.post("/draft/grade")
def draft_grade(body: GradeBody):
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    _check_ids(b, body.picks, "picks")
    if len(body.picks) != b.total_picks:
        raise HTTPException(422, f"A finished {b.teams}-team draft has {b.total_picks} picks, got {len(body.picks)}")
    rosters: dict[int, list[int]] = {s: [] for s in range(1, b.teams + 1)}
    for i, p in enumerate(body.picks):
        rosters[dr.pick_owner(i + 1, b.teams)].append(p)
    league = dr.evaluate_league_mc(b, rosters, sims=GRADE_SIMS, seed=len(body.picks), basis=body.basis)
    me = league[body.slot]
    if b.is_categories:
        # Kategori başına lig sırası (projeksiyonla): G'de yön zaten uygulanmış,
        # büyük = iyi (TO dahil).
        sums = {s: b.G[[b.row[p] for p in r]].sum(axis=0) for s, r in rosters.items()}
        me["category_rank"] = {
            c: 1 + sum(1 for s in sums if s != body.slot and sums[s][j] > sums[body.slot][j])
            for j, c in enumerate(b.cats)}
        weeks = int(fmt.get("regular_season_weeks", 19))
        wins = me["expected_category_wins"]
        me["expected_category_record"] = [round(wins * weeks), round((len(b.cats) - wins) * weeks)]

    my_picks = dr.snake_picks(b.teams, b.rounds, body.slot)
    moves = []
    for overall, pid in zip(my_picks, rosters[body.slot]):
        adp = float(b.adp[b.row[pid]])
        moves.append({"overall": overall, "player": _player(b, pid), "adp": round(adp, 1),
                      "value_vs_adp": round(overall - adp, 1)})   # + → ADP'sinden geç aldın (çalıntı)
    moves.sort(key=lambda m: -m["value_vs_adp"])
    return {
        "season": SEASON, "format": fmt, "slot": body.slot,
        "grade": dr.letter_grade(me["projected_rank"], b.teams),
        "me": me,
        "league": [{"slot": s, **league[s]} for s in sorted(league, key=lambda s: league[s]["projected_rank"])],
        "steals": moves[:3], "reaches": moves[::-1][:3],
        "my_roster": [_player(b, p) for p in rosters[body.slot]],
        "lineup": _lineup(b, rosters[body.slot]),
        "notes": ["Every team is scored with our projections, then each player's season is re-drawn "
                  f"{GRADE_SIMS} times from our measured projection error; rank is the average over draws."],
    }


# ── Kayıtlı draftlar ────────────────────────────────────────────────────────

class DraftSave(BaseModel):
    kind: str = Field(..., pattern="^(mock|assistant|league)$")
    name: str = Field(..., min_length=1, max_length=60)
    format: FormatIn
    teams: Optional[int] = Field(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1])
    slot: Optional[int] = Field(None, ge=1, le=LIMITS["teams"][1])
    state: dict
    result: Optional[dict] = None


class DraftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    state: Optional[dict] = None
    result: Optional[dict] = None


def _dump(obj, what: str) -> str:
    s = json.dumps(obj, separators=(",", ":"))
    if len(s.encode("utf-8")) > MAX_STATE_BYTES:
        raise HTTPException(413, f"{what} is too large (max {MAX_STATE_BYTES // 1024} KB)")
    return s


def _draft_row(r, full: bool) -> dict:
    fmt = json.loads(r["format_json"])
    out = {"id": r["id"], "kind": r["kind"], "name": r["name"], "season": r["season"],
           "format_key": fmt.get("key"), "format_label": fmt.get("label"), "teams": r["teams"],
           "slot": r["slot"], "created_at": r["created_at"], "updated_at": r["updated_at"]}
    result = json.loads(r["result_json"]) if r["result_json"] else None
    if full:
        out.update(format=fmt, state=json.loads(r["state_json"]), result=result)
    else:
        out["grade"] = (result or {}).get("grade")
    return out


def _own(conn, draft_id: int, uid: int):
    r = conn.execute("SELECT * FROM fantasy_drafts WHERE id=? AND user_id=?", (draft_id, uid)).fetchone()
    if not r:
        raise HTTPException(404, "Draft not found")   # başkasınınkiyle "var ama senin değil" ayrımı yapılmaz
    return r


@router.get("/drafts")
def list_drafts(user=Depends(get_current_user)):
    with get_conn() as conn:
        rows = conn.execute("""SELECT * FROM fantasy_drafts WHERE user_id=?
            ORDER BY updated_at DESC, id DESC""", (int(user["sub"]),)).fetchall()
    return {"drafts": [_draft_row(r, full=False) for r in rows], "limit": MAX_DRAFTS_PER_USER}


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: int, user=Depends(get_current_user)):
    with get_conn() as conn:
        return _draft_row(_own(conn, draft_id, int(user["sub"])), full=True)


@router.post("/drafts", status_code=201)
def save_draft(body: DraftSave, user=Depends(get_current_user)):
    fmt = _resolve(body.format, body.teams)
    if body.slot is not None and body.slot > fmt["teams"]:
        raise HTTPException(422, f"slot must be between 1 and {fmt['teams']}")
    uid = int(user["sub"])
    state, result = _dump(body.state, "state"), (_dump(body.result, "result") if body.result else None)
    with get_conn() as conn:
        n = conn.execute("SELECT COUNT(*) FROM fantasy_drafts WHERE user_id=?", (uid,)).fetchone()[0]
        if n >= MAX_DRAFTS_PER_USER:
            raise HTTPException(409, f"You can keep up to {MAX_DRAFTS_PER_USER} drafts — delete one first")
        cur = conn.execute("""INSERT INTO fantasy_drafts
            (user_id, kind, name, season, format_json, teams, slot, state_json, result_json)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (uid, body.kind, body.name.strip(), SEASON, json.dumps(fmt, default=list), fmt["teams"],
             body.slot, state, result))
        return _draft_row(_own(conn, cur.lastrowid, uid), full=True)


@router.put("/drafts/{draft_id}")
def update_draft(draft_id: int, body: DraftUpdate, user=Depends(get_current_user)):
    uid = int(user["sub"])
    sets, args = [], []
    if body.name is not None:
        sets.append("name=?"); args.append(body.name.strip())
    if body.state is not None:
        sets.append("state_json=?"); args.append(_dump(body.state, "state"))
    if body.result is not None:
        sets.append("result_json=?"); args.append(_dump(body.result, "result"))
    if not sets:
        raise HTTPException(422, "Nothing to update")
    with get_conn() as conn:
        _own(conn, draft_id, uid)
        conn.execute(f"UPDATE fantasy_drafts SET {','.join(sets)}, updated_at=datetime('now') "
                     "WHERE id=? AND user_id=?", (*args, draft_id, uid))
        return _draft_row(_own(conn, draft_id, uid), full=True)


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: int, user=Depends(get_current_user)):
    uid = int(user["sub"])
    with get_conn() as conn:
        _own(conn, draft_id, uid)
        conn.execute("DELETE FROM fantasy_drafts WHERE id=? AND user_id=?", (draft_id, uid))
    return {"ok": True}
