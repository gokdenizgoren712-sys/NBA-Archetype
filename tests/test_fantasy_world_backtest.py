# -*- coding: utf-8 -*-
"""Faz 6, aşama 2: karar kapısı ölçüleri (world_backtest) doğru çalışıyor mu — sentetik veriyle."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from src.fantasy import world_backtest as wb  # noqa: E402


def test_spread_slope_reads_overconfidence():
    rng = np.random.default_rng(0)
    truth = rng.normal(0.5, 0.05, 4000)
    actual = truth + rng.normal(0, 0.15, 4000)                   # gerçek sonuç = güç + büyük gürültü
    assert wb._slope_x_to_y(truth, actual) == np.float64(wb._slope_x_to_y(truth, actual))
    assert abs(wb._slope_x_to_y(truth, actual) - 1.0) < 0.15       # doğru yayılım → eğim ≈ 1
    assert wb._slope_x_to_y(0.5 + 2.0 * (truth - 0.5), actual) < 0.65   # tahmin 2× fazla yayılmış → eğim ≈ 0.5


def test_logit_slope_is_one_for_calibrated_probabilities():
    rng = np.random.default_rng(1)
    p = np.clip(rng.beta(4, 4, 6000), 0.05, 0.95)
    y = (rng.random(6000) < p).astype(float)
    assert abs(wb._logit_slope(p, y) - 1.0) < 0.12
    z = np.log(p / (1 - p))
    over = 1 / (1 + np.exp(-2.5 * z))                                # aşırı emin tahmin
    assert wb._logit_slope(over, y) < 0.6


def test_summarize_reports_every_engine_and_weekly_metrics():
    rng = np.random.default_rng(2)
    n = 60
    base = {"act_playoff": (rng.random(n) < 0.5).astype(float), "act_rank": rng.integers(1, 13, n).astype(float), "act_wr": rng.random(n)}
    for e in ("legacy", "world"):
        base[f"{e}_pp"], base[f"{e}_rank"], base[f"{e}_wr"] = rng.random(n), rng.random(n) * 11 + 1, rng.random(n)
        base[f"{e}_wk_pred"] = [list(rng.random(18)) for _ in range(n)]
        base[f"{e}_wk_act"] = [list(rng.random(18)) for _ in range(n)]
    out = wb.summarize(pd.DataFrame(base), engines=("legacy", "world"))
    assert out["n"] == n and set(out["world"]) >= {"brier", "slope", "rank_corr", "spread_slope", "week_mse", "week_slope", "week_corr"}
    assert 0 < out["world"]["week_mse"] < 0.5
