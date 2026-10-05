# -*- coding: utf-8 -*-
"""Canlı projeksiyon tablosunu üretir — API'nin okuduğu TEK fantezi dosyası.

  data/{season}__fantasy_projections.parquet

İçerik: projections.project() çıktısı + kadro takımı + Yahoo pozisyon
uygunluğu + arketip + bayraklar + belirsizlik aralıkları + kendi ADP modelimiz.

ADP (kendi modelimiz) formata bağlı olduğu için burada değil,
src/fantasy/valuation.py market_adp()'de hesaplanır; burada yalnızca onun
girdisi olan geçen sezon maç başı istatistikleri (LAST_*) saklanır.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.fantasy.backtest import bucket_quantiles  # noqa: E402
from src.fantasy.context import apply_to_projection as apply_context  # noqa: E402
from src.fantasy.trends import add_trends  # noqa: E402
from src.fantasy.projections import (  # noqa: E402
    SEASON_WEIGHTS, load_gamelogs, prev_season, project,
)

DATA_DIR = ROOT / "data"

INJURY_RISK_GP_RATE = 0.65
AGE_DECLINE = 33
MPG_BUCKETS = [(0, 15, "<15"), (15, 25, "15-25"), (25, 32, "25-32"), (32, 99, "32+")]


def _backtest() -> dict:
    p = DATA_DIR / "fantasy_backtest.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _archetypes(season: str) -> dict[int, str]:
    p = DATA_DIR / f"{season}__player_scores.parquet"
    if not p.exists():
        return {}
    s = pd.read_parquet(p, columns=["PLAYER_ID", "primary_arch"])
    return {int(a): b for a, b in zip(s["PLAYER_ID"], s["primary_arch"]) if isinstance(b, str) and b}


def _mpg_bucket(mpg: float) -> str:
    return next(name for lo, hi, name in MPG_BUCKETS if lo <= mpg < hi)


def last_season_per_game(last_logs: pd.DataFrame) -> pd.DataFrame:
    """Geçen sezonun maç başı istatistikleri — ADP modelinin "piyasa" girdisi."""
    cols = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "FGM", "FGA", "FTM", "FTA"]
    g = last_logs.groupby("PLAYER_ID")
    last = g[cols].sum().astype(float)
    gp = g.size().astype(float)
    last = last.div(gp, axis=0).add_prefix("LAST_")
    last["LAST_GP"] = gp
    return last.reset_index()


def build_projections(target: str = "2026-27", write: bool = True) -> pd.DataFrame:
    roster = pd.read_parquet(DATA_DIR / f"{target}__rosters.parquet")
    positions = pd.read_parquet(DATA_DIR / f"{target}__fantasy_positions.parquet")
    logs = load_gamelogs([prev_season(target, i) for i in range(1, 6)])
    bt = _backtest()
    chosen = bt.get("chosen", {})
    weights = tuple(chosen.get("weights", SEASON_WEIGHTS))
    k_scale = float(chosen.get("k_scale", 1.0))

    proj = project(target, logs, roster, weights=weights, k_scale=k_scale)
    info = roster.set_index("PLAYER_ID")
    proj["PLAYER_NAME"] = proj["PLAYER_ID"].map(info["PLAYER_NAME"])
    proj["TEAM"] = proj["PLAYER_ID"].map(info["TEAM_ABBREVIATION"])
    proj["DRAFT_YEAR"] = proj["PLAYER_ID"].map(info["DRAFT_YEAR"])
    proj["DRAFT_NUMBER"] = proj["PLAYER_ID"].map(info["DRAFT_NUMBER"])
    elig = positions.set_index("PLAYER_ID")["ELIGIBLE"]
    proj["ELIGIBLE"] = proj["PLAYER_ID"].map(elig).fillna("")
    last_stats = prev_season(target)
    proj["ARCHETYPE"] = proj["PLAYER_ID"].map(_archetypes(last_stats))
    proj = apply_context(proj, logs, target)        # takım bağlamı: yeni kadro, dakika bütçesi, kullanım yükü (bkz. context.py)

    # Belirsizlik: backtest artıklarından, dakika kovasına göre çarpan.
    ranges = bt.get("fp_ratio_ranges_by_mpg", {})
    lo_hi = [ranges.get(_mpg_bucket(m), {"p10": 0.6, "p90": 1.4}) for m in proj["PROJ_MPG"]]
    proj["FP_RATIO_P10"] = [r["p10"] for r in lo_hi]
    proj["FP_RATIO_P90"] = [r["p90"] for r in lo_hi]
    gp_all = bt.get("gp_ratio_range", {"p10": 0.4, "p90": 1.4})
    gp_by = bt.get("gp_ratio_ranges_by_history", {})

    def _gp_band(rate):
        if rate is None or np.isnan(rate):
            return gp_all                       # çaylak: geçmiş yok, genel bant
        name = "<60%" if rate < 0.6 else "60-80%" if rate < 0.8 else "80%+"
        return gp_by.get(name, gp_all)

    bands = [_gp_band(r) for r in proj["HIST_GP_RATE"]]
    tables = bt.get("ratio_tables")
    if tables:
        proj["FP_RATIO_Q"], proj["GP_RATIO_Q"] = bucket_quantiles(tables, proj["PROJ_MPG"], proj["HIST_GP_RATE"])
    proj["GP_P10"] = (proj["PROJ_GP"] * [b["p10"] for b in bands]).clip(0, 82).round(1)
    proj["GP_P90"] = (proj["PROJ_GP"] * [b["p90"] for b in bands]).clip(0, 82).round(1)
    roster_fetched = roster["FETCHED_AT"].iloc[0] if "FETCHED_AT" in roster.columns else None

    flags = []
    for r in proj.itertuples(index=False):
        f = []
        if r.SOURCE == "rookie_baseline":
            f.append("rookie")
        if isinstance(r.LAST_TEAM, str) and r.LAST_TEAM != r.TEAM:
            f.append("new_team")
        if r.HIST_GP_RATE is not None and not np.isnan(r.HIST_GP_RATE) and r.HIST_GP_RATE < INJURY_RISK_GP_RATE:
            f.append("injury_risk")
        if r.SEASONS_USED == 1:
            f.append("limited_history")
        if r.AGE is not None and not np.isnan(r.AGE) and r.AGE >= AGE_DECLINE:
            f.append("age_decline")
        if not r.ELIGIBLE:
            f.append("unknown_position")
        flags.append(",".join(f))
    proj["FLAGS"] = flags
    proj = add_trends(proj, logs, target)           # TREND / TREND_PCT / TREND_SERIES + FLAGS'e rising | steady | declining

    proj = proj.merge(last_season_per_game(logs[last_stats]), on="PLAYER_ID", how="left")
    proj["SEASON"] = target
    proj["BUILT_AT"] = pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")
    proj["ROSTERS_FETCHED_AT"] = roster_fetched
    if write:
        proj.to_parquet(DATA_DIR / f"{target}__fantasy_projections.parquet", index=False)
        # Sezon öncesi anlık görüntü: sezon içi güncelleme HER ZAMAN buradan başlar (idempotent; bkz. inseason.py).
        proj.to_parquet(DATA_DIR / f"{target}__fantasy_projections_pre.parquet", index=False)
        print(f"[build] {target} projeksiyon: {len(proj)} oyuncu "
              f"({(proj['SOURCE'] == 'rookie_baseline').sum()} çaylak tabanı), weights={weights} k_scale={k_scale}")
    return proj
