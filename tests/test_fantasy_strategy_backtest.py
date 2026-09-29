# -*- coding: utf-8 -*-
"""Faz 2.5 #1 — strateji backtest'i: sızıntısızlık, ortak botlar, puanlama, kalibrasyon."""

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.fantasy import strategy_backtest as sb  # noqa: E402

DATA = ROOT / "data"
needs_data = pytest.mark.skipif(
    not all((DATA / f).exists() for f in ("2025-26__player_gamelogs.parquet", "2024-25__player_gamelogs.parquet",
                                          "2023-24__player_gamelogs.parquet", "2025-26__schedule.parquet",
                                          "2026-27__rosters.parquet")),
    reason="cache'lenmiş sezon verisi yok")


def test_calibration_fit_recovers_overconfidence():
    """Gerçek olasılık tahminin yarısı kadar uçlaşıyorsa b ≈ 0.5 bulunmalı."""
    rng = np.random.default_rng(0)
    n = 6000
    true_logit = rng.normal(0, 1.0, n)
    pred = 1 / (1 + np.exp(-2 * true_logit))                  # ürün 2× fazla emin
    actual = (rng.random(n) < 1 / (1 + np.exp(-true_logit))).astype(float)
    calib = {"pred_playoff": pred.tolist(), "act_playoff": actual.tolist(),
             "pred_rank": (12 - 11 * pred).tolist(), "act_rank": (rng.integers(1, 13, n)).tolist()}
    fit = sb.fit_calibration(calib, 12)
    assert 0.4 < fit["playoff_logit"]["b"] < 0.6
    assert abs(fit["playoff_logit"]["a"]) < 0.15


def test_apply_calibration_shrinks_toward_middle_and_stays_in_range():
    fit = {"teams": 12, "playoff_logit": {"a": 0.0, "b": 0.4}, "rank_linear": {"c": 3.0, "d": 0.5}}
    p, r = sb.apply_calibration(fit, 0.95, 1.0)
    assert 0.5 < p < 0.95 and 1.0 <= r <= 12.0
    p2, r2 = sb.apply_calibration(fit, 0.0, 99.0)             # uç girdiler kırpılır
    assert 0.0 < p2 < 0.5 and r2 == 12.0


@needs_data
def test_calendar_marks_last_three_weeks_as_playoffs():
    weeks, tw = sb.season_calendar("2025-26")
    po = weeks.loc[weeks["IS_PLAYOFF"], "WEEK"].tolist()
    assert po == list(weeks["WEEK"].iloc[-3:])
    assert set(tw.loc[tw["IS_PLAYOFF"], "WEEK"]) == set(po)
    assert tw["GAMES"].sum() == 2460                          # 30 takım × 82 maç


@needs_data
def test_board_uses_only_seasons_before_target():
    """2024-25 tahtası 2024-25/2025-26 verisi silinse de aynı çıkmalı (sızıntı yok)."""
    from src.fantasy.projections import load_gamelogs
    roster = pd.read_parquet(DATA / "2026-27__rosters.parquet")
    logs = load_gamelogs(["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"])
    full = sb.historical_projections("2024-25", logs, roster)
    trimmed = sb.historical_projections("2024-25", {k: v for k, v in logs.items() if k < "2024-25"}, roster)
    cols = ["PLAYER_ID", "PROJ_MPG", "PROJ_GP", "PTS", "REB", "AST", "FP_RATIO_P10", "FP_RATIO_P90"]
    a, b = full[cols].sort_values("PLAYER_ID").reset_index(drop=True), trimmed[cols].sort_values("PLAYER_ID").reset_index(drop=True)
    pd.testing.assert_frame_equal(a, b)
    assert full["ELIGIBLE"].ne("").all()


@pytest.fixture(scope="module")
def board_2526():
    from config.fantasy_formats import get_format
    from src.fantasy import draft as dr
    from src.fantasy.projections import load_gamelogs
    from src.fantasy.valuation import value_players
    roster = pd.read_parquet(DATA / "2026-27__rosters.parquet")
    logs = load_gamelogs(["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"])
    proj = sb.historical_projections("2025-26", logs, roster)
    weeks, tw = sb.season_calendar("2025-26")
    out = {}
    for key in ("yahoo_h2h_9cat", "yahoo_h2h_points"):
        fmt = get_format(key)
        b = dr.make_board(value_players(proj, fmt, tw), fmt)
        out[key] = (b, sb.ActualSeason(logs["2025-26"], weeks, fmt, b))
    return out


@needs_data
def test_bots_are_identical_across_user_strategies(board_2526):
    """Ortak rastgele sayılar: kullanıcı ne seçerse seçsin botların TAHTASI (sıralaması) aynı."""
    b, _ = board_2526["yahoo_h2h_9cat"]
    from src.fantasy import draft as dr
    orders = []
    for _ in range(2):
        styles = dr.mixed_bot_styles(b.teams, 5)
        orders.append({s: dr._bot_order(b, st, np.random.default_rng([5005, s])).tolist() for s, st in styles.items()})
    assert orders[0] == orders[1]
    r1 = sb.run_draft(b, 5, sb.strategy_pickers(b)["market_adp"], 5005, "mixed")
    assert sorted(len(v) for v in r1.values()) == [b.rounds] * b.teams
    flat = [p for v in r1.values() for p in v]
    assert len(flat) == len(set(flat))                        # kimse iki kez alınmadı


@needs_data
def test_actual_season_scoring_is_a_valid_all_play(board_2526):
    for key, (b, season) in board_2526.items():
        rosters = sb.run_draft(b, 3, sb.strategy_pickers(b)["market_adp"], 3003, "mixed")
        res = season.score_league(rosters)
        assert sorted(v["rank"] for v in res.values()) == list(range(1, b.teams + 1))
        # All-play: tüm takımların ortalama galibiyet oranı 0.5 (sıfır toplamlı)
        assert math.isclose(np.mean([v["matchup_win_rate"] for v in res.values()]), 0.5, abs_tol=1e-9)
        assert season.weeks[0] == 1 and season.weeks[-1] < 22  # playoff haftaları dışarıda


@needs_data
def test_daily_cap_limits_team_to_starting_slots(board_2526):
    b, season = board_2526["yahoo_h2h_9cat"]
    rosters = sb.run_draft(b, 1, sb.strategy_pickers(b)["market_adp"], 1001, "mixed")
    daily = season.team_daily(rosters[1])
    uncapped = season.stats[[season.pid_ix[p] for p in rosters[1]]].sum(axis=0)
    assert (daily <= uncapped + 1e-9).all()
    season.cap = 2                                            # dar sınır: kesinlikle devreye girer
    try:
        tight = season.team_daily(rosters[1])
    finally:
        season.cap = len(b.slots)
    assert tight.sum() < daily.sum()


@needs_data
def test_actual_values_rank_stars_above_replacement(board_2526):
    for _, (b, season) in board_2526.items():
        act = sb.actual_values(season)
        assert np.isfinite(act).all()
        top = np.argsort(-act)[:20]
        assert act[top].mean() > np.median(act)
