# -*- coding: utf-8 -*-
"""Dünya (Faz 6, aşama 0): oyun gürültüsü, hafta eşlemesi, kendi kendine yeten girdi, tutarlılık ve bütçe."""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from src.fantasy import team_sim as ts  # noqa: E402
from src.fantasy import world as wd  # noqa: E402

LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
MODEL = ROOT / "data" / "2026-27__fantasy_context_model.json"
has_inputs = LIVE.exists() and TW.exists() and MODEL.exists() and "SI_PTS" in pd.read_parquet(LIVE).columns
needs_inputs = pytest.mark.skipif(not has_inputs, reason="SI_* girdileri yok (build gerekir)")


def test_week_of_game_covers_every_game_and_follows_the_schedule():
    rows = []
    for team, per in (("AAA", [3.0, 4.0, 3.5, 3.5, 4.0]), ("BBB", [4.0, 4.0, 4.0, 3.0, 3.0])):
        rows += [{"TEAM": team, "WEEK": w + 1, "GAMES_EXPECTED": g} for w, g in enumerate(per)]
    weeks, wog = wd.week_of_game(pd.DataFrame(rows), games=18)
    assert weeks == [1, 2, 3, 4, 5]
    for team, arr in wog.items():
        assert len(arr) == 18 and np.all(np.diff(arr) >= 0)
    assert np.bincount(wog["BBB"], minlength=5).tolist() == [4, 4, 4, 3, 3]
    assert abs(np.bincount(wog["AAA"], minlength=5)[2] - 3.5) <= 0.5               # kesirli hafta komşusuna yuvarlanır


def _lam(n=6, K=40, G=82, seed=0):
    r = np.random.default_rng(seed)
    base = {"FGA": 12.0, "FG3A": 5.0, "FTA": 4.0, "FGM": 5.4, "FG3M": 1.8, "FTM": 3.2, "REB": 6.0, "AST": 4.0, "STL": 1.0, "BLK": 0.6, "TOV": 2.5, "PTS": 16.0}
    lam = {s: np.full((K, G, n), v) * r.uniform(0.7, 1.3, (1, 1, n)) for s, v in base.items()}
    return lam, np.ones((K, G, n), dtype=bool)


def test_game_draws_keep_means_dispersion_and_the_scoring_identity():
    lam, present = _lam()
    d = wd.game_draws(lam, present, np.random.default_rng(1))
    assert np.array_equal(d["PTS"], 2 * d["FGM"] + d["FG3M"] + d["FTM"])            # puan kimliği tam
    for s in ("FGA", "FTA", "REB", "AST", "STL", "BLK", "TOV", "FGM", "FG3M", "FTM"):
        assert d[s].mean() == pytest.approx(lam[s].mean(), rel=0.05), s
    assert np.all(d["FG3M"] <= d["FGM"]) and np.all(d["FGM"] <= d["FGA"])
    reb = d["REB"][:, :, 0]
    assert reb.var() / reb.mean() == pytest.approx(wd.DISPERSION["REB"], rel=0.12)  # ölçülen aşırı yayılım
    assert d["FTA"][:, :, 0].var() / d["FTA"][:, :, 0].mean() > 1.7                  # serbest atış denemeleri belirgin aşırı yayılımlı


def test_absent_players_produce_nothing():
    lam, present = _lam()
    present[:, ::2, 0] = False
    d = wd.game_draws(lam, present, np.random.default_rng(2))
    assert all(np.all(d[s][:, ::2, 0] == 0) for s in d)


@needs_inputs
def test_simulation_from_the_self_contained_inputs_matches_the_published_columns():
    inp = pd.read_parquet(LIVE)
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    sim = ts.run_from_inputs(inp, model)
    pub = inp.set_index("PLAYER_ID")
    assert np.allclose(sim["SIM_FP"].to_numpy(), pub.loc[sim.index, "SIM_FP"].to_numpy(), atol=1e-6)      # maç logu olmadan aynı sayılar


@needs_inputs
def test_world_season_means_agree_with_the_team_simulation_and_are_deterministic():
    inp, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    w = wd.build_world(inp, tw, model, scenarios=48, seed=5)
    w2 = wd.build_world(inp, tw, model, scenarios=48, seed=5)
    assert np.array_equal(w.sums, w2.sums)
    pg = w.season_per_game()
    ref = inp.set_index("PLAYER_ID").loc[pg.index]
    rot = (ref["PROJ_MPG"] >= 15).to_numpy()
    for s in ("PTS", "REB", "AST", "FGA", "FTA", "FG3M", "STL", "BLK", "TOV"):
        a, b = ref[f"SIM_{s}"].to_numpy()[rot], pg[s].to_numpy()[rot]
        assert abs(b.mean() / a.mean() - 1) < 0.03, s
        assert np.corrcoef(a, b)[0, 1] > 0.97, s
    assert w.sums.min() >= 0 and w.games.max() <= 7
    assert (w.games.sum(axis=1) <= 82).all()


@needs_inputs
def test_world_memory_and_time_budget_at_the_planned_scenario_count():
    inp, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    w = wd.build_world(inp, tw, model, scenarios=16)
    per_scenario = w.nbytes / 16
    assert per_scenario * 128 < 120e6                                              # K=128 için ≲ 120 MB
    assert w.seconds * 8 < 90                                                      # K=128 için ≲ 90 sn (sunucu açılışında arka planda)


@needs_inputs
def test_teammates_compete_for_minutes_and_shots_but_other_teams_are_independent():
    """Aynı takımdaki oyuncular haftalık sayıda hafif NEGATİF ilişkili (dakika ve şut payı paylaşılıyor); farklı takımlar bağımsız."""
    inp, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    w = wd.build_world(inp, tw, model, scenarios=128, seed=9)
    ix = w.index()
    gi = wd.WSTATS.index("PTS")
    pid = lambda n: int(inp[inp.PLAYER_NAME.str.contains(n)].PLAYER_ID.iloc[0])      # noqa: E731

    def mean_corr(a, b):
        return np.nanmean([np.corrcoef(w.sums[:, k, ix[pid(a)], gi], w.sums[:, k, ix[pid(b)], gi])[0, 1] for k in range(1, 20)])

    same = np.mean([mean_corr("Tyrese Maxey", "Jaylen Brown"), mean_corr("Tyrese Maxey", "Joel Embiid")])
    cross = np.mean([mean_corr("Tyrese Maxey", "Jokić"), mean_corr("Jaylen Brown", "Stephen Curry")])
    assert same < cross - 0.05
    assert abs(cross) < 0.08
