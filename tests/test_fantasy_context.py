# -*- coding: utf-8 -*-
"""Takım bağlamı katmanı: yapısal θ'nın sentetik veriden geri kazanımı, özellikler, düzeltmenin güvenlik sınırları."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from src.fantasy import context as cx  # noqa: E402


def _synthetic_stints(theta=0.6, seed=0):
    """Oyuncu eğilimi a_p ve takım yükü L ile hız = a·L^(−θ) üreten, göçleri olan küçük lig."""
    rng = np.random.default_rng(seed)
    n_players, n_teams, seasons = 150, 10, ["2021-22", "2022-23", "2023-24", "2024-25"]
    a = pd.Series(np.exp(rng.normal(0, 0.35, n_players)), index=range(n_players))
    rows = []
    team_of = {p: rng.integers(n_teams) for p in range(n_players)}
    for s in seasons:
        for p in range(n_players):
            if rng.random() < 0.3:
                team_of[p] = rng.integers(n_teams)
        mins = {p: float(rng.uniform(500, 2500)) for p in range(n_players)}
        for t in range(n_teams):
            mem = [p for p in range(n_players) if team_of[p] == t]
            tot = sum(mins[q] for q in mem)
            for p in mem:
                L = sum(a[q] * mins[q] for q in mem if q != p) / max(tot - mins[p], 1)
                r = a[p] * L ** (-theta) * float(np.exp(rng.normal(0, 0.03)))
                rows.append({"PLAYER_ID": p, "TEAM_ABBREVIATION": f"T{t}", "SEASON": s, "MIN": mins[p], "usg": r * mins[p]})
    return pd.DataFrame(rows)


def test_structural_elasticity_is_recovered_from_movers():
    st = _synthetic_stints(theta=0.6)
    a, theta = cx.fit_propensity(st, "usg")
    assert abs(theta - 0.6) < 0.12
    assert abs(float(np.average(a.reindex(st["PLAYER_ID"]).to_numpy(), weights=st["MIN"].to_numpy())) - 1.0) < 1e-6


def _proj():
    return pd.DataFrame({
        "PLAYER_ID": [1, 2, 3, 4], "PROJ_MPG": [34.0, 28.0, 20.0, 10.0], "PROJ_GP": [70.0, 60.0, 60.0, 50.0], "AGE": [27.0, 24.0, 30.0, 22.0],
        "TEAM": ["AAA", "AAA", "AAA", "AAA"],
        "PTS": [22.0, 14.0, 8.0, 3.0], "REB": [6.0, 5.0, 3.0, 1.0], "AST": [5.0, 3.0, 2.0, 1.0], "STL": [1.0, .8, .5, .2], "BLK": [.5, .4, .3, .1],
        "TOV": [2.5, 1.5, 1.0, .5], "FGA": [16.0, 10.0, 6.0, 2.0], "FTA": [5.0, 3.0, 2.0, 1.0], "FG3A": [6.0, 4.0, 3.0, 1.0], "FG3M": [2.2, 1.4, 1.0, .3],
        "FGM": [8.0, 4.5, 2.5, .8], "FTM": [4.0, 2.4, 1.5, .8], "OREB": [1.0, 1.0, .6, .2], "DREB": [5.0, 4.0, 2.4, .8], "PF": [2.0, 2.0, 1.5, 1.0],
        "SD_PTS": [6.0, 4.0, 3.0, 2.0],
    })


def _model(min_beta0=1.0, **over):
    m = {"minutes": {"cols": cx.MINUTE_COLS, "beta": [min_beta0] + [0.0] * len(cx.MINUTE_COLS)},
         "rates": {g: {"cols": cx.RATE_COLS, "beta": [1.0] + [0.0] * len(cx.RATE_COLS)} for g in cx.SPLIT}}
    m["minutes"]["beta"][1] = over.get("mover", 0.0)            # [c, mover, ...]
    return m


def _feat(proj, mover=(0, 0, 0, 0)):
    f = pd.DataFrame(index=proj["PLAYER_ID"])
    f["mover"] = list(mover)
    f["S_team"] = 272.0
    f["rank_in_team"] = [1.0, 2.0, 3.0, 4.0]
    f["cum_before"] = [0.0, 60.0, 100.0, 130.0]
    f["ex_frac"] = 0.0
    f["age"], f["mpg"] = proj["AGE"].to_numpy(), proj["PROJ_MPG"].to_numpy()
    for k in ("usg", "reb", "ast"):
        f[f"mu_{k}"] = 1.0
    return f


def test_identity_model_changes_nothing_and_mover_discount_applies_only_to_movers():
    p = _proj()
    same = cx.adjust(p, _feat(p), _model())
    for s in ("PTS", "REB", "AST", "PROJ_MPG"):
        assert np.allclose(same[s], p[s])
    mv = cx.adjust(p, _feat(p, mover=(1, 0, 1, 1)), _model(mover=-0.10))
    assert np.allclose(mv["CTX_MIN_RATIO"], [0.9, 1.0, 0.9, 1.0])       # ≥15 dk olmayan (4. oyuncu) hiç değişmez
    assert mv.loc[0, "PTS"] == pytest.approx(22.0 * 0.9) and mv.loc[1, "PTS"] == 14.0
    assert mv.loc[0, "SD_PTS"] == pytest.approx(6.0 * 0.9)
    assert mv.loc[3, "PTS"] == 3.0 and mv.loc[3, "PROJ_MPG"] == 10.0


def test_ratios_are_clipped_to_safe_bounds():
    p = _proj()
    out = cx.adjust(p, _feat(p, mover=(1, 1, 1, 1)), _model(mover=-5.0))
    assert out["CTX_MIN_RATIO"].min() >= cx.MIN_RATIO_CLIP[0] - 1e-9
    out2 = cx.adjust(p, _feat(p), _model(min_beta0=9.0))
    assert out2["CTX_MIN_RATIO"].max() <= cx.MIN_RATIO_CLIP[1] + 1e-9


LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"


@pytest.mark.skipif(not LIVE.exists(), reason="cache'lenmiş projeksiyon yok")
def test_live_projection_carries_the_context_columns_and_trims_rotation_minutes():
    d = pd.read_parquet(LIVE)
    assert {"CTX_MIN_RATIO", "CTX_RATE_USG", "CTX_RATE_REB", "CTX_RATE_AST"} <= set(d.columns)
    rot = d[d["PROJ_MPG"] >= 14]
    assert 0.9 < rot["CTX_MIN_RATIO"].median() < 1.0                      # backtest: rotasyon ~%5 fazla tahmin ediliyordu
    assert d.loc[d["PROJ_MPG"] < 12, "CTX_MIN_RATIO"].eq(1.0).mean() > 0.9
