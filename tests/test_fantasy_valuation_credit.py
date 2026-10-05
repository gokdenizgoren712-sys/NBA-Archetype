# -*- coding: utf-8 -*-
"""Kaçırılan maçın yerine gelen yedek üretimi (valuation.REPL_CREDIT): sakatlık cezasını yumuşatır, sağlamları bozmaz."""

import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402

PROJ = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
pytestmark = pytest.mark.skipif(not (PROJ.exists() and TW.exists()), reason="cache'lenmiş projeksiyon yok")


@pytest.fixture(scope="module")
def data():
    return pd.read_parquet(PROJ), pd.read_parquet(TW)


def _rank(proj, tw, key, credit, name):
    old = vl.REPL_CREDIT
    vl.REPL_CREDIT = credit
    try:
        v = vl.value_players(proj, get_format(key), tw)
    finally:
        vl.REPL_CREDIT = old
    r = v[v["PLAYER_NAME"] == name].iloc[0]
    return int(r["RANK"]), float(r["VALUE"])


@pytest.mark.parametrize("key", ["yahoo_h2h_9cat", "yahoo_h2h_points"])
def test_credit_lifts_injury_prone_players_and_is_monotone(data, key):
    proj, tw = data
    row = proj.sort_values("PROJ_GP").query("PROJ_MPG >= 28").iloc[0]               # çok maç kaçırması beklenen rotasyon oyuncusu
    name = row["PLAYER_NAME"]
    ranks = [_rank(proj, tw, key, c, name)[0] for c in (0.0, 0.5, 1.0)]
    assert ranks[0] > ranks[1] >= ranks[2] or ranks[0] > ranks[2]                     # kredi arttıkça sıra iyileşir (küçük sayı)
    assert ranks == sorted(ranks, reverse=True)


def test_credit_barely_moves_a_fully_healthy_player(data):
    proj, tw = data
    healthy = proj.sort_values("PROJ_GP", ascending=False).query("PROJ_MPG >= 30").iloc[0]["PLAYER_NAME"]
    r0, r1 = _rank(proj, tw, "yahoo_h2h_9cat", 0.0, healthy)[0], _rank(proj, tw, "yahoo_h2h_9cat", 0.75, healthy)[0]
    assert abs(r0 - r1) <= max(8, 0.35 * r0)


def test_credit_zero_reproduces_the_old_valuation(data):
    proj, tw = data
    fmt = get_format("yahoo_h2h_9cat")
    g = vl.games_per_week(proj.reset_index(drop=True), tw, fmt, "total")
    a = vl.category_values(proj.reset_index(drop=True), fmt, g)
    b = vl.category_values(proj.reset_index(drop=True), fmt, g, g_full=vl._team_games(proj.reset_index(drop=True), tw, fmt), repl_credit=0.0)
    pd.testing.assert_frame_equal(a, b)


def test_per_game_basis_ignores_the_credit(data):
    proj, tw = data
    old = vl.REPL_CREDIT
    try:
        vl.REPL_CREDIT = 0.0
        a = vl.value_players(proj, get_format("yahoo_h2h_9cat"), tw, basis="per_game")["VALUE"].to_numpy()
        vl.REPL_CREDIT = 1.0
        b = vl.value_players(proj, get_format("yahoo_h2h_9cat"), tw, basis="per_game")["VALUE"].to_numpy()
    finally:
        vl.REPL_CREDIT = old
    assert (a == b).all()
