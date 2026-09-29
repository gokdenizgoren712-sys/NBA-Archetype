# -*- coding: utf-8 -*-
"""Faz 2.5 #3 — ampirik gerçekleşme örneklemesi, sıfır maçlı oyuncular, piyasaya büzme."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import backtest as bt  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402


def test_draw_quantile_is_inverse_cdf_with_interpolation():
    q = np.tile(np.linspace(0.0, 2.0, 101), (3, 1))          # her satır: 0…2 eşit aralık
    assert np.allclose(dr._draw_quantile(q, np.array([0.0, 0.5, 0.999999])), [0.0, 1.0, 2.0], atol=1e-3)
    u = np.linspace(0, 0.999, 50)
    d = dr._draw_quantile(np.tile(q[0], (50, 1)), u)
    assert (np.diff(d) >= 0).all()                            # monoton


def _fold(fp, mpg, gp, hist):
    idx = range(len(fp))
    return {"fp_ratio": pd.Series(fp, index=idx), "mpg": pd.Series(mpg, index=idx),
            "gp_ratio": pd.Series(gp, index=idx), "hist_gp_rate": pd.Series(hist, index=idx)}


def test_ratio_tables_keep_zero_game_seasons_in_the_tail():
    rng = np.random.default_rng(1)
    n = 400
    gp = np.where(rng.random(n) < 0.06, 0.0, rng.normal(1.0, 0.15, n).clip(0.4, 1.3))   # %6 sezon boyu sakat
    t = bt.ratio_tables([_fold(rng.normal(1, .1, n), rng.uniform(10, 36, n), gp, rng.uniform(0.5, 1.0, n))])
    assert t["gp_all"][0] == 0.0 and len(t["gp_all"]) == 101
    assert t["gp_all"][3] < 0.1                              # p3 ≈ 0 (sıfır maçlar kuyrukta)
    fp_q, gp_q = bt.bucket_quantiles(t, [30.0, 12.0], [0.9, None])
    assert fp_q[0] == t["fp"]["25-32"] and gp_q[1] == t["gp_all"]   # kovaya eşleme, çaylak → genel


LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
needs_live = pytest.mark.skipif(not (LIVE.exists() and TW.exists()), reason="cache'lenmiş projeksiyon yok")


@needs_live
def test_empirical_sampling_reproduces_catastrophic_seasons():
    proj, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    assert {"FP_RATIO_Q", "GP_RATIO_Q"} <= set(proj.columns)
    fmt = get_format("yahoo_h2h_points")
    b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    assert b.fp_q is not None and b.fp_q.shape[1] == 101
    m = np.array([dr.sample_multipliers(b, np.random.default_rng(s)) for s in range(300)])
    assert (m >= 0).all() and np.isfinite(m).all()
    assert (m < 0.15).mean() > 0.003                          # sezonu tümden kaçıranlar artık örnekleniyor


@needs_live
def test_shrink_pulls_values_toward_market_and_is_identity_at_one():
    proj, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    for key in ("yahoo_h2h_9cat", "yahoo_h2h_points"):
        fmt = get_format(key)
        v = vl.value_players(proj, fmt, tw)
        raw, half = dr.make_board(v, fmt, shrink=1.0), dr.make_board(v, fmt, shrink=0.5)
        assert np.allclose(raw.value, v["VALUE"].to_numpy(float))
        assert half.value.std() < raw.value.std()             # ayrışma azalır
        assert np.corrcoef(raw.value, half.value)[0, 1] > 0.98   # sıralama büyük ölçüde korunur
    assert dr.SHRINK["categories"] == 0.5 and dr.SHRINK["points"] == 0.25
