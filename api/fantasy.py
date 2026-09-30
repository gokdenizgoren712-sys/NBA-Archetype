# -*- coding: utf-8 -*-
"""Basketbol fantezi API'si — /api/fantasy/*

Okuduğu dosyalar (src/fantasy/build.py üretir, deploy için .gitignore
allowlist'inde):
  data/{season}__fantasy_projections.parquet
  data/{season}__fantasy_team_weeks.parquet
  data/{season}__fantasy_weeks.parquet
  data/fantasy_backtest.json

Değerleme istek anında yapılır (src/fantasy/valuation.py) ve format + punt +
basis anahtarıyla bellekte tutulur; projeksiyon dosyası değişince (mtime)
önbellek kendiliğinden boşalır.

Yanıt alanları Claude Design'a verilen sayfa listesiyle birebir (docs/FANTASY_PLAN.md).
"""

from __future__ import annotations

import json
import math
import sys
import threading
import unicodedata
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.fantasy_formats import (  # noqa: E402
    CATEGORIES, DEFAULT_FORMAT, FORMATS, LIMITS, FormatError, get_format, validate_format,
)
from src.fantasy.valuation import _tiers, pool_size, value_players  # noqa: E402

router = APIRouter(prefix="/api/fantasy", tags=["fantasy"])

SEASON = "2026-27"
DATA_DIR = ROOT / "data"
MAX_LIMIT = 300
_CACHE_MAX = 32

_lock = threading.Lock()
_state: dict = {"mtime": None}
_values: "OrderedDict[str, pd.DataFrame]" = OrderedDict()


# ── Veri yükleme ────────────────────────────────────────────────────────────

def _path(name: str) -> Path:
    return DATA_DIR / f"{SEASON}__{name}.parquet"


def _load() -> dict:
    """Artefaktları yükler; projeksiyon dosyası değiştiyse yeniden yükler."""
    p = _path("fantasy_projections")
    if not p.exists():
        raise HTTPException(503, "Fantasy projections are not built yet.")
    mtime = p.stat().st_mtime
    with _lock:
        if _state["mtime"] != mtime:
            bt = DATA_DIR / "fantasy_backtest.json"
            _state.update({
                "mtime": mtime,
                "proj": pd.read_parquet(p),
                "team_weeks": pd.read_parquet(_path("fantasy_team_weeks")),
                "weeks": pd.read_parquet(_path("fantasy_weeks")),
                "backtest": json.loads(bt.read_text(encoding="utf-8")) if bt.exists() else None,
            })
            _values.clear()
        return dict(_state)


def _valued(fmt: dict, punt: tuple[str, ...], basis: str) -> pd.DataFrame:
    st = _load()
    key = json.dumps([fmt, sorted(punt), basis], sort_keys=True, default=str)
    with _lock:
        if key in _values:
            _values.move_to_end(key)
            return _values[key]
    try:
        df = value_players(st["proj"], fmt, st["team_weeks"], punt=punt, basis=basis)
    except ValueError as e:
        raise HTTPException(422, str(e))
    with _lock:
        _values[key] = df
        while len(_values) > _CACHE_MAX:
            _values.popitem(last=False)
    return df


# ── Girdi çözümleme ─────────────────────────────────────────────────────────

def _preset(key: str, teams: Optional[int]) -> dict:
    if key not in FORMATS:
        raise HTTPException(422, f"Unknown format '{key}'. Options: {', '.join(FORMATS)}")
    try:
        return get_format(key, **({"teams": teams} if teams else {}))
    except FormatError as e:
        raise HTTPException(422, str(e))


def _punt(raw: Optional[str], fmt: dict) -> tuple[str, ...]:
    if not raw:
        return ()
    if fmt["kind"] != "categories":
        raise HTTPException(422, "Punting only applies to category formats.")
    return tuple(c.strip() for c in raw.split(",") if c.strip())


def _fold(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


# ── Serileştirme ────────────────────────────────────────────────────────────

def _num(v, nd: int = 2):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else round(f, nd)


def _flags(s) -> list[str]:
    return [f for f in str(s or "").split(",") if f]


def _per_game(r) -> dict:
    return {"pts": _num(r["PTS"]), "reb": _num(r["REB"]), "ast": _num(r["AST"]),
            "stl": _num(r["STL"]), "blk": _num(r["BLK"]), "tov": _num(r["TOV"]),
            "fg3m": _num(r["FG3M"]), "fgm": _num(r["FGM"]), "fga": _num(r["FGA"]),
            "ftm": _num(r["FTM"]), "fta": _num(r["FTA"]),
            "fg_pct": _num(r["FG%"], 3), "ft_pct": _num(r["FT%"], 3),
            "dd2": _num(r["DD2"], 3), "td3": _num(r["TD3"], 3)}


_Z90 = 1.2815516


def _season_multipliers(r, basis: str) -> tuple[float, float]:
    """Gerçekleşen sezon çarpanının p10/p90'ı: üretim (FP_RATIO) × maç (GP),
    ikisi de backtest artıklarından lognormal — draft simülasyonundaki
    örneklemeyle aynı model (src/fantasy/draft.py sample_multipliers)."""
    lo, hi = float(r["FP_RATIO_P10"]), float(r["FP_RATIO_P90"])
    mu, s = (math.log(lo) + math.log(hi)) / 2, (math.log(hi) - math.log(lo)) / (2 * _Z90)
    if basis == "total":
        gp = max(float(r["PROJ_GP"]), 1.0)
        glo, ghi = max(float(r["GP_P10"]), 1.0) / gp, max(float(r["GP_P90"]), 1.0) / gp
        mu += (math.log(glo) + math.log(ghi)) / 2
        s = math.hypot(s, (math.log(ghi) - math.log(glo)) / (2 * _Z90))
    return math.exp(mu - _Z90 * s), math.exp(mu + _Z90 * s)


def _value_range(r, fmt: dict, punt: tuple, basis: str, prefix: str) -> list:
    """Kategori değerinin p10/p90'ı. Değer, çarpan m'de doğrusal:
    değer(m) = değer + (m − 1)·Σ yön·mutlak_üretim (punt edilenler hariç)."""
    m10, m90 = _season_multipliers(r, basis)
    base = float(r["VALUE_G" if prefix == "GA_" else "VALUE_Z"])
    slope = sum((-1.0 if c == "TO" else 1.0) * float(r[f"{prefix}{c}"])
                for c in fmt["categories"] if c not in punt)
    a, b = base + (m10 - 1) * slope, base + (m90 - 1) * slope
    return [_num(min(a, b), 2), _num(max(a, b), 2)]


def _row(r, fmt: dict, punt: tuple = (), basis: str = "total") -> dict:
    lo, hi = r["FP_RATIO_P10"], r["FP_RATIO_P90"]
    out = {
        "rank": int(r["RANK"]), "tier": int(r["TIER"]),
        "player_id": int(r["PLAYER_ID"]), "name": r["PLAYER_NAME"], "team": r["TEAM"],
        "eligible": [p for p in str(r["ELIGIBLE"] or "").split(",") if p],
        "pos_group": r["POS_GROUP"], "archetype": r.get("ARCHETYPE") if isinstance(r.get("ARCHETYPE"), str) else None,
        "age": _num(r["AGE"], 1),
        "proj_gp": _num(r["PROJ_GP"], 1), "proj_gp_range": [_num(r["GP_P10"], 1), _num(r["GP_P90"], 1)],
        "proj_mpg": _num(r["PROJ_MPG"], 1),
        "range_factor": [_num(lo, 3), _num(hi, 3)],
        "per_game": _per_game(r),
        "value": _num(r["VALUE"], 3),
        "adp": _num(r["ADP"], 1), "adp_sd": _num(r["ADP_SD"], 1), "adp_diff": _num(r["ADP_DIFF"], 1),
        "flags": _flags(r["FLAGS"]), "source": r["SOURCE"],
    }
    if fmt["kind"] == "categories":
        out["value_z"] = _num(r["VALUE_Z"], 3)
        out["value_g"] = _num(r["VALUE_G"], 3)
        out["categories"] = {c: {"z": _num(r[f"Z_{c}"], 3), "g": _num(r[f"G_{c}"], 3)}
                             for c in fmt["categories"]}
        out["value_g_range"] = _value_range(r, fmt, punt, basis, "GA_")
        out["value_z_range"] = _value_range(r, fmt, punt, basis, "ZA_")
    elif fmt["kind"] == "points":
        out["fp_game"] = _num(r["FP_GAME"])
        out["fp_game_range"] = [_num(r["FP_GAME"] * lo), _num(r["FP_GAME"] * hi)]
        out["fp_total"] = _num(r["FP_TOTAL"], 1)
        m10, m90 = _season_multipliers(r, basis)
        out["fp_total_range"] = [_num(r["FP_TOTAL"] * m10, 0), _num(r["FP_TOTAL"] * m90, 0)]
        out["value_over_replacement"] = _num(r["VALUE"], 1)
    else:
        out["fp_game"] = _num(r["FP_GAME"])
        out["hs_week_avg"] = _num(r["HS_WEEK_AVG"])
        out["hs_playoff_avg"] = _num(r["HS_PLAYOFF_AVG"])
        out["ceiling_index"] = _num(r["CEILING_INDEX"], 3)
        out["four_game_weeks"] = int(r["FOUR_GAME_WEEKS"])
    return out


def _filter(df: pd.DataFrame, position, team, search, flag, archetype) -> pd.DataFrame:
    if position:
        pos = position.upper()
        df = df[df["ELIGIBLE"].fillna("").str.split(",").apply(lambda xs: pos in xs)]
    if team:
        df = df[df["TEAM"] == team.upper()]
    if archetype:
        df = df[df["ARCHETYPE"] == archetype]
    if flag:
        df = df[df["FLAGS"].fillna("").str.split(",").apply(lambda xs: flag in xs)]
    if search:
        q = _fold(search)
        df = df[df["PLAYER_NAME"].map(_fold).str.contains(q, regex=False)]
    return df


def _rankings_response(fmt, punt, basis, position, team, search, flag, archetype, limit, offset, metric=None):
    df = _valued(fmt, punt, basis)
    st = _state
    total = len(df)
    # Kategori formatında G/Z seçimi: sıra ve kademeler BÜTÜN havuzda yeniden
    # hesaplanır (sayfalı listenin yalnız yüklenen kısmını sıralamak yanlış olurdu).
    default_metric = "g" if fmt["kind"] == "categories" and fmt["matchup"] == "h2h" else "z"
    if fmt["kind"] == "categories" and metric and metric != default_metric:
        col = "VALUE_Z" if metric == "z" else "VALUE_G"
        df = df.sort_values(col, ascending=False).reset_index(drop=True).copy()
        df["RANK"] = range(1, len(df) + 1)
        df["TIER"] = _tiers(df[col], pool_size(fmt)).to_numpy()
        df["ADP_DIFF"] = df["ADP"] - df["RANK"]
    df = _filter(df, position, team, search, flag, archetype)
    page = df.iloc[offset: offset + limit]
    return {
        "season": SEASON, "format": fmt, "punt": list(punt), "basis": basis,
        "metric": (f"value_{metric or default_metric}" if fmt["kind"] == "categories" else "value"),
        "built_at": str(st["proj"]["BUILT_AT"].iloc[0]) if "BUILT_AT" in st["proj"].columns else None,
        "total_players": total, "matched": len(df), "offset": offset, "limit": limit,
        "players": [_row(r, fmt, punt, basis) for _, r in page.iterrows()],
    }


# ── Uç noktalar ─────────────────────────────────────────────────────────────

@router.get("/formats")
def fantasy_formats():
    return {"default": DEFAULT_FORMAT, "limits": LIMITS, "categories": list(CATEGORIES),
            "presets": [{"key": k, **v} for k, v in FORMATS.items()]}


@router.get("/meta")
def fantasy_meta():
    st = _load()
    proj = st["proj"]
    # Kadro tarihi projeksiyon dosyasının içinde: rosters.parquet deploy'a girmiyor.
    fetched = proj["ROSTERS_FETCHED_AT"].iloc[0] if "ROSTERS_FETCHED_AT" in proj.columns else None
    return {"season": SEASON, "players": len(proj),
            "built_at": str(proj["BUILT_AT"].iloc[0]) if "BUILT_AT" in proj.columns else None,
            "rosters_fetched_at": fetched, "opening_night": str(st["weeks"]["START"].iloc[0]),
            "inseason_as_of": (str(proj["INSEASON_AS_OF"].iloc[0]) if "INSEASON_AS_OF" in proj.columns else None),
            "weeks": int(st["weeks"]["WEEK"].max())}


@router.get("/rankings")
def fantasy_rankings(
    format: str = Query(DEFAULT_FORMAT),
    teams: Optional[int] = Query(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1]),
    punt: Optional[str] = Query(None, description="Comma-separated categories, e.g. FT%,TO"),
    basis: str = Query("total", pattern="^(total|per_game)$"),
    position: Optional[str] = Query(None, pattern="^(PG|SG|SF|PF|C|pg|sg|sf|pf|c)$"),
    team: Optional[str] = Query(None, max_length=4),
    search: Optional[str] = Query(None, max_length=60),
    flag: Optional[str] = Query(None, max_length=30),
    archetype: Optional[str] = Query(None, max_length=30),
    metric: Optional[str] = Query(None, pattern="^(g|z)$", description="Category formats: sort by G- or Z-score"),
    limit: int = Query(200, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
):
    fmt = _preset(format, teams)
    return _rankings_response(fmt, _punt(punt, fmt), basis, position, team, search, flag, archetype,
                              limit, offset, metric)


class CustomRankingsBody(BaseModel):
    format: dict = Field(..., description="Full format definition (see /api/fantasy/formats)")
    punt: list[str] = Field(default_factory=list, max_length=8)
    basis: str = Field("total", pattern="^(total|per_game)$")
    position: Optional[str] = Field(None, pattern="^(PG|SG|SF|PF|C)$")
    search: Optional[str] = Field(None, max_length=60)
    flag: Optional[str] = Field(None, max_length=30)
    archetype: Optional[str] = Field(None, max_length=30)
    metric: Optional[str] = Field(None, pattern="^(g|z)$")
    limit: int = Field(200, ge=1, le=MAX_LIMIT)
    offset: int = Field(0, ge=0)


def _custom_format(raw: dict) -> dict:
    """İstemcinin gönderdiği tam format tanımı → doğrulanmış format (422'li)."""
    fmt = {**raw}
    fmt.setdefault("matchup", "h2h")
    fmt.setdefault("playoff_weeks", (20, 21, 22))
    fmt["playoff_weeks"] = tuple(fmt["playoff_weeks"])
    try:
        validate_format(fmt)
    except FormatError as e:
        raise HTTPException(422, str(e))
    if not all(isinstance(w, int) and 1 <= w <= 24 for w in fmt["playoff_weeks"]):
        raise HTTPException(422, "playoff_weeks must be week numbers between 1 and 24")
    fmt["key"] = "custom"
    return fmt


@router.post("/rankings")
def fantasy_rankings_custom(body: CustomRankingsBody):
    fmt = _custom_format(body.format)
    punt = tuple(body.punt)
    if punt and fmt["kind"] != "categories":
        raise HTTPException(422, "Punting only applies to category formats.")
    return _rankings_response(fmt, punt, body.basis, body.position, None, body.search, body.flag,
                              body.archetype, body.limit, body.offset, body.metric)


@router.get("/players/{player_id}")
def fantasy_player(
    player_id: int,
    format: str = Query(DEFAULT_FORMAT),
    teams: Optional[int] = Query(None, ge=LIMITS["teams"][0], le=LIMITS["teams"][1]),
    punt: Optional[str] = Query(None),
    basis: str = Query("total", pattern="^(total|per_game)$"),
):
    fmt = _preset(format, teams)
    return _player_response(player_id, fmt, _punt(punt, fmt), basis)


class CustomPlayerBody(BaseModel):
    format: dict
    punt: list[str] = Field(default_factory=list, max_length=8)
    basis: str = Field("total", pattern="^(total|per_game)$")


@router.post("/players/{player_id}")
def fantasy_player_custom(player_id: int, body: CustomPlayerBody):
    """Özel lig formatıyla oyuncu profili (POST /rankings ile aynı doğrulama)."""
    fmt = _custom_format(body.format)
    punt = tuple(body.punt)
    if punt and fmt["kind"] != "categories":
        raise HTTPException(422, "Punting only applies to category formats.")
    return _player_response(player_id, fmt, punt, body.basis)


def _player_response(player_id: int, fmt: dict, punt: tuple, basis: str) -> dict:
    df = _valued(fmt, punt, basis)
    hit = df[df["PLAYER_ID"] == player_id]
    if hit.empty:
        raise HTTPException(404, "Player not found in the 2026-27 fantasy pool.")
    r = hit.iloc[0]
    st = _state

    tw = st["team_weeks"]
    wk = st["weeks"].set_index("WEEK")
    sched = [{"week": int(x.WEEK), "start": wk.at[x.WEEK, "START"], "end": wk.at[x.WEEK, "END"],
              "games": int(x.GAMES), "games_expected": _num(x.GAMES_EXPECTED, 2),
              "back_to_backs": int(x.B2B), "light_day_games": int(x.LIGHT_DAY_GAMES),
              "is_playoff": bool(x.IS_PLAYOFF)}
             for x in tw[tw["TEAM"] == r["TEAM"]].sort_values("WEEK").itertuples()]

    def _dist(col, weights):
        q = r.get(col)
        if q is None or len(q) == 0:
            return None
        mean = sum(r[k] * v for k, v in weights.items())
        return [_num(x * mean) for x in q]

    last = None
    if not pd.isna(r.get("LAST_GP")):
        last = {"gp": int(r["LAST_GP"]),
                **{k.lower(): _num(r[f"LAST_{k}"]) for k in
                   ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "FGM", "FGA", "FTM", "FTA"]}}

    rookie = None
    if r["SOURCE"] == "rookie_baseline":
        from src.fantasy.projections import pick_bucket
        rookie = {"draft_year": _num(r["DRAFT_YEAR"], 0), "draft_pick": _num(r["DRAFT_NUMBER"], 0),
                  "baseline_bucket": pick_bucket(r["DRAFT_NUMBER"])}

    return {
        "season": SEASON, "format": fmt,
        "player": _row(r, fmt, punt, basis),
        "last_season_per_game": last,
        "rookie_baseline": rookie,
        # Maç puanı dağılımı (41 quantile, 0..1): Yahoo Points ve High Score
        # ağırlıklarıyla, bu sezonun projeksiyon ortalamasına ölçeklenmiş.
        "game_distribution": {
            "quantiles": [round(i / 40, 3) for i in range(41)],
            "points": _dist("Q_POINTS", FORMATS["yahoo_h2h_points"]["weights"]),
            "high_score": _dist("Q_HIGH_SCORE", FORMATS["yahoo_high_score"]["weights"]),
        },
        "schedule": sched,
        "playoff_games": sum(s["games"] for s in sched if s["is_playoff"]),
    }


@router.get("/schedule")
def fantasy_schedule():
    st = _load()
    weeks = st["weeks"]
    tw = st["team_weeks"]
    return {
        "season": SEASON,
        "weeks": [{"week": int(w.WEEK), "start": w.START, "end": w.END, "days": int(w.DAYS),
                   "all_star_merged": bool(w.ALL_STAR_MERGED), "is_playoff": bool(w.IS_PLAYOFF)}
                  for w in weeks.itertuples()],
        "teams": {team: [{"week": int(x.WEEK), "games": int(x.GAMES),
                          "games_expected": _num(x.GAMES_EXPECTED, 2),
                          "pending_expected": _num(x.PENDING_EXPECTED, 3),
                          "back_to_backs": int(x.B2B), "light_day_games": int(x.LIGHT_DAY_GAMES)}
                         for x in sub.sort_values("WEEK").itertuples()]
                  for team, sub in tw.groupby("TEAM")},
        "notes": ["Week 1 runs from opening night to the first Sunday.",
                  "The All-Star break week is merged with the following week.",
                  "Each team has 2 NBA Cup games without a date yet; they are spread as expected games over the Cup knockout weeks."],
    }


@router.get("/backtest")
def fantasy_backtest():
    st = _load()
    if not st.get("backtest"):
        raise HTTPException(503, "Backtest report is not built yet.")
    return st["backtest"]


# Draft uç noktaları (api/fantasy_draft.py) bu router'a eklenir; main.py'de ayrı
# satır yok. Dosyanın SONUNDA olmalı: fantasy_draft bu modülün yardımcılarını
# (_load, _valued, _num) import ediyor.
from .fantasy_draft import router as _draft_router  # noqa: E402

router.include_router(_draft_router)
