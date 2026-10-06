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
import os
import threading
from collections import OrderedDict
from typing import Optional, Union

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config.fantasy_formats import FORMATS, LIMITS, FormatError, get_format, validate_format
from src.fantasy import draft as dr
from src.fantasy.season_sim import SeasonSim, complete_league
from src.fantasy.trade import analyze_trade
from src.fantasy.week import analyze_week

from .auth import get_current_user
from .db import get_conn
from .rankit_live_sync import background_jobs_enabled
from .fantasy import DATA_DIR, SEASON, _load, _num, _valued

router = APIRouter()

MAX_REC = 25
MAX_SIMS = 500
PLAN_SIMS_ON_DEMAND = 15
GRADE_SIMS = 150
MAX_DRAFTS_PER_USER = 100
MAX_STATE_BYTES = 64 * 1024
DRAFT_KINDS = ("mock", "assistant", "league")

_lock = threading.Lock()
_boards: "OrderedDict[str, dr.Board]" = OrderedDict()
_plans_cache: "OrderedDict[str, dict]" = OrderedDict()
_precomputed = {"mtime": None, "data": None}
_sims: "OrderedDict[str, SeasonSim]" = OrderedDict()
_sim_slots = threading.Semaphore(2)          # aynı anda en çok 2 sezon simülasyonu (tek worker, 512MB)


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


def strategy_validation(fmt: dict) -> dict:
    """Bu formatta draft ÖNERİLERİMİZİN gerçek sezonlarda doğrulanıp doğrulanmadığı.
    Kaynak: src/fantasy/strategy_backtest.py (2024-25 ve 2025-26, gerçekçi piyasa varsayımı) —
    kategori/H2H: piyasadan +0.098 haftalık eşleşme oranı (karışık botlara karşı; tüm piyasa varsayımlarında pozitif);
    puan: karışık botlara karşı +0.04, hepsi-ADP botlarına karşı −0.04 (kanıtlanmadı); High Score ve roto hiç test edilmedi. Öneri her durumda verilir, yalnızca
    güven düzeyi söylenir. Sonuçlar değişirse burası ve docs/FANTASY_MODEL_IMPROVEMENTS.md birlikte güncellenir."""
    kind, matchup = fmt.get("kind"), fmt.get("matchup")
    if kind == "categories" and matchup == "h2h":
        return {"status": "validated"}
    if kind == "points":
        return {"status": "unvalidated", "title": "Picks not yet proven for points leagues",
                "body": "In our test on the 2024-25 and 2025-26 seasons, drafting by our points ranking finished about level "
                        "with drafting by average draft position: slightly ahead in some leagues, behind in others. "
                        "Treat these picks as a starting point and trust your own read."}
    if kind == "high_score":
        return {"status": "unvalidated", "title": "Picks not yet tested for High Score leagues",
                "body": "We have not yet checked this format against real seasons. The season simulator, trade analyzer and This week all score a team by each "
                        "starter's best game of the week, but the draft picks themselves are untested. Treat them as a starting point."}
    return {"status": "unvalidated", "title": "Picks not yet tested for roto leagues",
            "body": "Our real-season test covers head-to-head leagues only. Treat these picks as a starting point."}


def _plans(fmt: dict, slot: int, basis: str) -> dict:
    b = _board(fmt, basis)
    _check_slot(b, slot)
    pre = _precomputed_plans()
    key = fmt.get("key")
    if (pre and basis == "total" and key in pre["formats"]
            and str(b.teams) in pre["formats"][key]
            and FORMATS.get(key, {}).get("roster") == fmt["roster"]):
        plans = pre["formats"][key][str(b.teams)][str(slot)]
        return {**_enrich_plans(b, plans), "source": "precomputed", "built_at": pre["built_at"],
                "validation": strategy_validation(fmt)}
    ck = json.dumps([fmt, slot, basis], sort_keys=True, default=str)
    with _lock:
        hit = _plans_cache.get(ck)
    if hit is None:
        hit = dr.draft_plans(b, slot, sims=PLAN_SIMS_ON_DEMAND, seed=slot)
        with _lock:
            _plans_cache[ck] = hit
            while len(_plans_cache) > 64:
                _plans_cache.popitem(last=False)
    return {**_enrich_plans(b, hit), "source": "on_demand", "validation": strategy_validation(fmt)}


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
    plan: Optional[str] = Field(None, max_length=30, description="Draft plan key (see /draft/plans); overrides punt")


def _plan_args(b: dr.Board, plan: Optional[str], punt: tuple) -> tuple[tuple, Optional[np.ndarray], Optional[dict]]:
    """Plan anahtarı → (punt, oyuncu skoru, {key,label}). Anahtar bu formatta yoksa 422."""
    if not plan:
        return punt, None, None
    strat = dr.plan_strategy(b, plan)
    if strat is None:
        raise HTTPException(422, f"Unknown plan '{plan}'. Options: {', '.join(s['key'] for s in dr.plan_pool(b))}")
    return tuple(strat.get("punt", ())) or punt, strat.get("score"), {"key": strat["key"], "label": strat["label"]}


def _recommend_response(b: dr.Board, taken: list[int], mine: list[int], current_pick: int,
                        slot: int, punt: tuple, n: int, score: Optional[np.ndarray] = None) -> dict:
    rec = dr.recommend(b, set(taken), list(mine), current_pick, slot, punt=punt, n=n, score=score)
    for r in rec.get("recommendations", []):
        r["player"] = _player(b, r["player_id"])
    rec["my_roster"] = [_player(b, p) for p in mine]
    rec["lineup"] = _lineup(b, list(mine))
    rec["validation"] = strategy_validation(b.fmt)
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
    punt, score, plan = _plan_args(b, body.plan, punt)
    current = body.current_pick or len(body.taken) + len(body.mine) + 1
    if current > b.total_picks:
        raise HTTPException(422, "The draft is already complete")
    return {"season": SEASON, "format": fmt, "plan": plan,
            **_recommend_response(b, body.taken, body.mine, current, body.slot, punt, body.n, score)}


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
    plan: Optional[str] = Field(None, max_length=30, description="Draft plan key the recommendations follow")
    humans: Optional[list[int]] = Field(None, max_length=4, description="Human slots for a same-screen mock (must include `slot`)")
    plans: Optional[dict[str, str]] = Field(None, description="Human slot -> plan key (same-screen mock)")


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
    humans = sorted(set(body.humans or [body.slot]))
    if body.slot not in humans or any(not 1 <= h <= b.teams for h in humans):
        raise HTTPException(422, "humans must be valid slots and include your own slot")
    plans_by_slot = {int(k): v for k, v in (body.plans or {}).items() if str(k).isdigit()}
    if body.plan and body.slot not in plans_by_slot:
        plans_by_slot[body.slot] = body.plan
    styles = {s: st for s, st in _bot_styles(b, body.slot, body.bot_style).items() if s not in humans}
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
        if owner in humans:
            break
        left_after = b.rounds - len(rosters[owner]) - 1
        pid = dr._bot_pick(b, orders[owner], taken, rosters[owner], left_after)
        picks.append(pid)
        taken.add(pid)
        rosters[owner].append(pid)

    done = len(picks) >= b.total_picks
    clock_slot = None if done else dr.pick_owner(len(picks) + 1, b.teams)
    who = clock_slot if clock_slot in humans else body.slot        # kadro / öneri sırası gelen insanın
    mine = rosters[who]
    out = {"season": SEASON, "format": fmt, "seed": body.seed, "bot_styles": {str(k): v for k, v in styles.items()},
           "picks": _picks_view(b, picks), "done": done,
           "on_the_clock": None if done else len(picks) + 1, "on_the_clock_slot": clock_slot,
           "humans": humans, "plan_options": [{"key": s["key"], "label": s["label"]} for s in dr.plan_pool(b)],
           "human_rosters": {str(h): {"roster": [_player(b, p) for p in rosters[h]], "lineup": _lineup(b, rosters[h])}
                             for h in humans},
           "my_roster": [_player(b, p) for p in mine], "lineup": _lineup(b, mine),
           "validation": strategy_validation(fmt)}
    if not done:
        others = [p for p in picks if p not in set(mine)]
        punt, score, plan = _plan_args(b, plans_by_slot.get(who), ())
        out["plan"] = plan
        rec = _recommend_response(b, others, mine, len(picks) + 1, who, punt, body.n, score)
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
        "season": SEASON, "format": fmt, "slot": body.slot, "validation": strategy_validation(fmt),
        "grade": dr.letter_grade(me["projected_rank"], b.teams),
        "me": me,
        "league": [{"slot": s, **league[s], "letter": dr.letter_grade(league[s]["projected_rank"], b.teams)}
                   for s in sorted(league, key=lambda s: league[s]["projected_rank"])],
        "steals": moves[:3], "reaches": moves[::-1][:3],
        "my_roster": [_player(b, p) for p in rosters[body.slot]],
        "lineup": _lineup(b, rosters[body.slot]),
        "notes": ["Every team is scored with our projections, blended with the market where we disagree "
                  "(our picks did worse than raw projections implied in past seasons), then each player's season is "
                  f"re-drawn {GRADE_SIMS} times from measured projection errors; rank is the average over draws."],
    }


# ── Sezon simülatörü ────────────────────────────────────────────────────────

class SimBody(BaseModel):
    format: FormatIn = "yahoo_h2h_9cat"
    teams: Optional[int] = Field(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1])
    slot: int = Field(..., ge=1, le=LIMITS["teams"][1])
    picks: Optional[list[int]] = Field(None, max_length=400)     # biten draftın tüm pickleri (mock) ya da
    roster: Optional[list[int]] = Field(None, max_length=40)     # yalnız kullanıcının kadrosu (rakipler simüle edilir)
    sims: int = Field(200, ge=20, le=MAX_SIMS)
    seed: int = Field(0, ge=0, le=2_000_000_000)
    league_seed: Optional[int] = Field(None, ge=0, le=2_000_000_000, description="Which simulated rival set (roster mode); defaults to seed")
    basis: str = Field("total", pattern="^(total|per_game)$")
    scope: str = Field("rest", pattern="^(rest|full)$",
                       description="rest = only the weeks still to play (in season); full = the whole season")
    records: Optional[dict[str, float]] = Field(None, max_length=LIMITS["teams"][1],
                                                description="Head-to-head wins so far by team slot (rest scope only)")


def _scope(sim: SeasonSim, body, week: int | None = None) -> tuple[int | None, dict | None]:
    """(from_week, base_wins). Sezon öncesinde ya da scope=full iken (None, None). `week`: tek hafta analizi — görünüm o haftadan başlar."""
    fw = sim.default_from_week() if body.scope == "rest" else None
    if fw is None:
        return None, None
    base = None
    if body.records:
        base = {}
        for k, v in body.records.items():
            if not k.isdigit() or not 1 <= int(k) <= sim.b.teams:
                raise HTTPException(422, "records keys must be team slots")
            if not 0 <= v <= 60:
                raise HTTPException(422, "records must be between 0 and 60 wins")
            base[int(k)] = float(v)
        if set(base) != set(range(1, sim.b.teams + 1)):
            raise HTTPException(422, "records must cover every team, or be left out")
    return (week if week is not None else fw), base


def _scope_info(sim: SeasonSim, from_week: int | None) -> dict:
    left = [w for w in sim.reg_weeks if from_week is not None and w >= from_week]
    return {"mode": "rest" if from_week is not None else "full", "from_week": from_week, "as_of": sim.as_of,
            "regular_weeks_left": len(left) if from_week is not None else len(sim.reg_weeks)}


def _league_rosters(b: dr.Board, body) -> tuple[dict[int, list[int]], str]:
    """Tam draft (picks) ya da yalnız kullanıcının kadrosu (roster) → 12 takımın kadrosu.
    `roster` modunda diğer takımlar botlarla tamamlanır; `league_seed` (yoksa `seed`) hangi rakip setini verir."""
    if body.picks is not None:
        _check_ids(b, body.picks, "picks")
        if len(body.picks) != b.total_picks:
            raise HTTPException(422, f"A finished {b.teams}-team draft has {b.total_picks} picks, got {len(body.picks)}")
        rosters: dict[int, list[int]] = {s: [] for s in range(1, b.teams + 1)}
        for i, p in enumerate(body.picks):
            rosters[dr.pick_owner(i + 1, b.teams)].append(p)
        return rosters, "draft"
    if body.roster is not None:
        _check_ids(b, body.roster, "roster")
        if len(body.roster) != b.rounds:
            raise HTTPException(422, f"A roster has {b.rounds} players in this format, got {len(body.roster)}")
        seed = body.league_seed if getattr(body, "league_seed", None) is not None else body.seed
        return complete_league(b, list(body.roster), body.slot, seed=seed), "simulated_rivals"
    raise HTTPException(422, "Send either the finished draft's picks or your roster")


# ── Dünya (Faz 6): NBA'nin oyun düzeyindeki simülasyonu — sezon simülatörünün oyuncu üretim kaynağı ──────────
# Projeksiyon dosyası değişince bellekte yeniden kurulur (K=128 ≈ 12 sn, ≈ 100 MB). Hazır olana ya da kapalıyken eski motor çalışır.
_world_state: dict = {"mtime": None, "world": None, "building": False, "event": threading.Event()}
WORLD_WAIT = float(os.environ.get("FANTASY_WORLD_WAIT", "25"))      # dünya kurulurken ilk istekler en çok bu kadar bekler, sonra eski motor
_world_lock = threading.Lock()
WORLD_K = int(os.environ.get("FANTASY_WORLD_K", "128"))


def _world_enabled() -> bool:
    return os.environ.get("FANTASY_WORLD", "1") != "0"


def _build_world_now(st: dict):
    from src.fantasy.world import build_world
    model_path = DATA_DIR / f"{SEASON}__fantasy_context_model.json"
    if not model_path.exists():
        return None
    return build_world(st["proj"], st["team_weeks"], json.loads(model_path.read_text(encoding="utf-8")), scenarios=WORLD_K)


def get_world(block: bool = False, wait: float = 0.0):
    """Hazır dünya ya da None (eski motor). Sezon içinde (INSEASON_AS_OF) ve SI_* girdisi yoksa her zaman None.
    block=False: kurulmamışsa arka planda başlatır, şimdilik None döner. wait>0: kurulum sürüyorsa en çok o kadar saniye bekler
    (açılıştan hemen sonraki ilk isteklerin eski / yeni motor arasında gidip gelmemesi için)."""
    if not _world_enabled():
        return None
    st = _load()
    proj = st["proj"]
    if "SI_PTS" not in proj.columns or "INSEASON_AS_OF" in proj.columns:
        return None
    mt = st["mtime"]
    with _world_lock:
        if _world_state["mtime"] == mt and _world_state["world"] is not None:
            return _world_state["world"]
        if _world_state["building"] and not block:
            ev = _world_state["event"]
            if wait > 0:
                pass
            else:
                return None
            ev_wait = ev
        else:
            ev_wait = None
        if ev_wait is None:
            if not block and not background_jobs_enabled():       # testler (RANKIT_BACKGROUND_JOBS=0) kendiliğinden arka plan iş parçacığı başlatmaz
                return None
            _world_state["building"] = True
            _world_state["event"].clear()
    if ev_wait is not None:                                       # kurulum sürüyor: bekle
        ev_wait.wait(wait)
        with _world_lock:
            return _world_state["world"] if _world_state["mtime"] == mt else None

    def work():
        try:
            w = _build_world_now(st)
            with _world_lock:
                _world_state.update(mtime=mt, world=w)
        except Exception as e:      # noqa: BLE001 — dünya kurulamazsa eski motor devam eder
            print(f"[fantasy-world] build failed: {e}", flush=True)
        finally:
            with _world_lock:
                _world_state["building"] = False
            _world_state["event"].set()

    if block:
        work()
        return _world_state["world"]
    threading.Thread(target=work, name="fantasy-world", daemon=True).start()
    if wait > 0:                                                  # bu çağrı kurulumu başlattıysa onu da bekle
        _world_state["event"].wait(wait)
        with _world_lock:
            return _world_state["world"] if _world_state["mtime"] == mt else None
    return None


def start_fantasy_world() -> None:
    """Açılışta dünyayı arka planda kur (ilk istek beklemesin)."""
    if _world_enabled():
        try:
            get_world(block=False)
        except Exception as e:      # noqa: BLE001
            print(f"[fantasy-world] start failed: {e}", flush=True)


def _season_sim(b: dr.Board, fmt: dict) -> SeasonSim:
    world = get_world(wait=WORLD_WAIT)
    key = json.dumps([fmt, _load()["mtime"], world is not None], sort_keys=True, default=str)
    with _lock:
        if key in _sims:
            _sims.move_to_end(key)
            return _sims[key]
    st = _load()
    as_of = str(st["proj"]["INSEASON_AS_OF"].iloc[0]) if "INSEASON_AS_OF" in st["proj"].columns else None
    sim = SeasonSim(b, st["team_weeks"], playoff_weeks=list(fmt.get("playoff_weeks") or ()), weeks=st["weeks"], as_of=as_of, world=world)
    with _lock:
        _sims[key] = sim
        while len(_sims) > 8:
            _sims.popitem(last=False)
    return sim


@router.post("/season/simulate")
def season_simulate(body: SimBody):
    """Kadroyu 2026-27 fikstürüyle hafta hafta oynatır. Yanıt `sims` sayısıyla birlikte gelir: istemci
    birden çok partiyi (farklı `seed`) sims-ağırlıklı ortalayarak canlı ilerleme / iptalde kısmi sonuç gösterir."""
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    rosters, mode = _league_rosters(b, body)
    sim = _season_sim(b, fmt)
    fw, base = _scope(sim, body)
    try:
        with _sim_slots:
            res = sim.simulate(rosters, sims=body.sims, seed=body.seed, from_week=fw, base_wins=base)
    except ValueError as e:
        raise HTTPException(422, str(e))
    me = res[body.slot]
    nteams = len(res)
    for k, w in enumerate(me["weekly"]):   # ligin haftalık ortalaması: "ortalama takıma göre" çubuk / işaret için
        w["league_games"] = round(sum(res[t]["weekly"][k]["games"] for t in res) / nteams, 2)
        if "cats_won" in w:
            w["league_cats_won"] = round(sum(res[t]["weekly"][k]["cats_won"] for t in res) / nteams, 2)
    return {"season": SEASON, "format": fmt, "slot": body.slot, "sims": body.sims, "seed": body.seed, "mode": mode,
            "teams": b.teams, "playoff_teams": min(int(fmt.get("playoff_teams", 6)), b.teams),
            "categories": list(b.cats) if b.is_categories else [],
            "validation": strategy_validation(fmt), "scope": _scope_info(sim, fw), "records_used": bool(base),
            "engine": getattr(sim, "last_engine", "legacy"), "me": me,
            "league": [{"slot": t, **{k: v for k, v in res[t].items() if k != "weekly"}}
                       for t in sorted(res, key=lambda t: res[t]["projected_rank"])],
            "my_roster": [_player(b, p) for p in rosters[body.slot]]}


class TradeBody(SimBody):
    give: list[int] = Field(..., min_length=1, max_length=5, description="Players you send (on your roster)")
    get: list[int] = Field(..., min_length=1, max_length=5, description="Players you receive")
    sims: int = Field(300, ge=50, le=MAX_SIMS)


@router.post("/league/rosters")
def league_rosters(body: SimBody):
    """Bir kaynağın (tam draft ya da kendi kadron) 12 takımlık kadroları, oyuncu ayrıntısıyla — takas sayfası
    iki tarafı buradan kurar. `roster` modunda `league_seed` aynı rakip setini yeniden verir."""
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    rosters, mode = _league_rosters(b, body)
    return {"season": SEASON, "format": fmt, "slot": body.slot, "mode": mode, "teams": b.teams,
            "rosters": {str(t): [_player(b, p) for p in r] for t, r in rosters.items()}}


@router.post("/trade/analyze")
def trade_analyze(body: TradeBody):
    """Takas öncesi / sonrası kadroyla AYNI sezonları (ortak rastgele sayılar) oynatıp farkı verir."""
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    _check_ids(b, body.give + body.get, "players")
    rosters, mode = _league_rosters(b, body)
    mine = set(rosters[body.slot])
    if not set(body.give) <= mine:
        raise HTTPException(422, "You can only give players who are on your roster")
    if set(body.get) & mine or set(body.give) & set(body.get):
        raise HTTPException(422, "You cannot get a player you already have")
    sim = _season_sim(b, fmt)
    fw, base = _scope(sim, body)
    try:
        with _sim_slots:
            out = analyze_trade(sim, rosters, body.slot, list(body.give), list(body.get), sims=body.sims, seed=body.seed,
                                from_week=fw, base_wins=base)
    except ValueError as e:
        raise HTTPException(422, str(e))
    out["my_roster_after"] = [_player(b, p) for p in out["my_roster_after"]]
    out["dropped"] = [_player(b, p) for p in out["dropped"]]
    out["added"] = [_player(b, p) for p in out["added"]]
    return {"season": SEASON, "format": fmt, "slot": body.slot, "sims": body.sims, "mode": mode,
            "categories_in_format": list(b.cats) if b.is_categories else [],
            "give": [_player(b, p) for p in body.give], "get": [_player(b, p) for p in body.get],
            "validation": strategy_validation(fmt), "scope": _scope_info(sim, fw), "records_used": bool(base),
            "engine": getattr(sim, "last_engine", "legacy"), **out}


class WeekBody(SimBody):
    week: int = Field(1, ge=1, le=24)
    opponent: int = Field(..., ge=1, le=LIMITS["teams"][1], description="Slot of this week's opponent")
    sims: int = Field(300, ge=50, le=MAX_SIMS)


@router.post("/week/analyze")
def week_analyze(body: WeekBody):
    """Bu hafta: rakibe karşı beklenen kategoriler / puan, High Score haftalık kadro ve serbest oyuncu (streamer) listesi."""
    fmt = _resolve(body.format, body.teams)
    b = _board(fmt, body.basis)
    _check_slot(b, body.slot)
    if not 1 <= body.opponent <= b.teams or body.opponent == body.slot:
        raise HTTPException(422, "opponent must be another team in the league")
    rosters, mode = _league_rosters(b, body)
    sim = _season_sim(b, fmt)
    if body.week not in sim.weeks:
        raise HTTPException(422, f"Week {body.week} is not on the 2026-27 fantasy calendar")
    fw, _ = _scope(sim, body, week=body.week)
    with _sim_slots:
        out = analyze_week(sim, rosters, body.slot, body.opponent, body.week, sims=body.sims, seed=body.seed, from_week=fw)
    wk = _load()["weeks"]
    row = wk[wk["WEEK"] == body.week].iloc[0]
    out["players"] = [{**r, **_player(b, r["player_id"])} for r in out["players"]]
    out["free_agents"] = [{**r, **_player(b, r["player_id"])} for r in out["free_agents"]]
    return {"season": SEASON, "format": fmt, "slot": body.slot, "mode": mode, "sims": body.sims,
            "week_info": {"week": body.week, "start": str(row["START"]), "end": str(row["END"]),
                          "playoff": body.week in sim.playoff_weeks},
            "categories_in_format": list(b.cats) if b.is_categories else [],
            "validation": strategy_validation(fmt), **out}


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
