# -*- coding: utf-8 -*-
"""Faz 4 — kalan sezon görünümü: simülatör, takas ve hafta analizi yalnız oynanmamış haftaları oynatır."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from api.main import app  # noqa: E402  (önce main: döngüsel içe aktarma sırası)
from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import season_sim as ss  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402
from src.fantasy.trade import analyze_trade  # noqa: E402

client = TestClient(app)
LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
WK = ROOT / "data" / "2026-27__fantasy_weeks.parquet"
needs_live = pytest.mark.skipif(not (LIVE.exists() and TW.exists() and WK.exists()), reason="cache'lenmiş projeksiyon yok")
AS_OF = "2026-12-06"        # hafta 7 bitişi (Pazar); sonraki tam oynanmamış hafta 8 olmalı


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from api import main as api_main
    api_main._RL.clear()
    yield


@pytest.fixture(scope="module")
def env():
    proj, tw, wk = pd.read_parquet(LIVE), pd.read_parquet(TW), pd.read_parquet(WK)
    if "INSEASON_AS_OF" in proj.columns:
        pytest.skip("yayındaki dosya zaten güncellenmiş")
    fmt = get_format("yahoo_h2h_9cat")
    # Sezon içi taklit: herkes takım maçlarının ~%40'ını oynadı, %90'ına çıktı
    ip = proj.copy()
    ip["INSEASON_GP"] = (ip["PROJ_GP"] * 0.4 * 0.9).round().astype(int)
    b0 = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    b1 = dr.make_board(vl.value_players(ip, fmt, tw), fmt)
    return {"fmt": fmt, "tw": tw, "wk": wk, "pre": b0, "ins": b1,
            "sim_pre": ss.SeasonSim(b0, tw, playoff_weeks=list(fmt["playoff_weeks"]), weeks=wk),
            "sim_in": ss.SeasonSim(b1, tw, playoff_weeks=list(fmt["playoff_weeks"]), weeks=wk, as_of=AS_OF)}


def _league(b, slot=5, seed=1):
    picks = [4, 19, 28, 43, 52, 67, 76, 91, 100, 115, 124, 139, 140][: b.rounds]
    mine = [int(b.ids[i]) for i in np.argsort(b.adp)[picks]]
    return ss.complete_league(b, mine, slot, seed=seed)


@needs_live
def test_default_from_week_is_the_first_unplayed_week(env):
    assert env["sim_pre"].default_from_week() is None                       # sezon öncesi: tam sezon
    wk = env["wk"]
    expected = int(wk[pd.to_datetime(wk["START"]) > pd.Timestamp(AS_OF)]["WEEK"].min())
    assert env["sim_in"].default_from_week() == expected


@needs_live
def test_rest_view_plays_only_the_remaining_weeks(env):
    sim, b = env["sim_in"], env["ins"]
    fw = sim.default_from_week()
    res = sim.simulate(_league(b), sims=60, seed=3, from_week=fw)
    weeks = [w["week"] for w in res[5]["weekly"]]
    assert weeks[0] == fw and weeks == sorted(weeks) and weeks[-1] == max(sim.playoff_weeks)
    assert all(w >= fw for w in weeks)
    full = sim.simulate(_league(b), sims=60, seed=3)
    assert len(full[5]["weekly"]) > len(res[5]["weekly"])
    # kalan maç, projeksiyonun oynanmamış payıyla uyumlu: 0.6·0.9… tam sezon oyuncu-maçından belirgin küçük
    assert sum(w["games"] for w in res[5]["weekly"]) < 0.75 * sum(w["games"] for w in full[5]["weekly"])


@needs_live
def test_from_week_one_and_none_are_the_same_full_season(env):
    sim, b = env["sim_pre"], env["pre"]
    ros = _league(b)
    a = sim.simulate(ros, sims=60, seed=2)
    c = sim.simulate(ros, sims=60, seed=2, from_week=1)
    assert a[5]["rank_mean"] == c[5]["rank_mean"] and a[5]["expected_wins"] == c[5]["expected_wins"]


@needs_live
def test_player_with_no_games_left_adds_no_games(env):
    sim, b = env["sim_in"], env["ins"]
    ros = _league(b)
    fw = sim.default_from_week()
    row = b.row[ros[5][0]]
    sim.insea_gp[row], sim.gp[row] = sim.gp[row], sim.gp[row]                # oynadıkları = projeksiyon → kalan 0
    sim._views.clear()
    try:
        v = sim.view(fw)
        assert v.gp[row] == 0.0
        assert sim.availability(row, fw) == 0.0
    finally:
        sim.insea_gp[row] = np.floor(sim.gp[row] * 0.4 * 0.9)
        sim._views.clear()


@needs_live
def test_uncertainty_narrows_and_market_shrink_relaxes_as_the_season_goes(env):
    sim = env["sim_in"]
    v1, v2 = sim.view(sim.default_from_week()), sim.view(sim.weeks[-3])
    assert 0.0 < v2.spread < v1.spread < 1.0
    assert np.abs(v2.mean - sim._raw_mean).sum() <= np.abs(v1.mean - sim._raw_mean).sum() + 1e-9   # kanıt arttıkça büzme gevşer


@needs_live
def test_records_shift_the_standings_by_the_wins_already_banked(env):
    sim, b = env["sim_in"], env["ins"]
    ros = _league(b)
    fw = sim.default_from_week()
    base = sim.simulate(ros, sims=80, seed=4, from_week=fw)
    up = sim.simulate(ros, sims=80, seed=4, from_week=fw, base_wins={5: 9.0})
    assert abs((up[5]["expected_wins"] - base[5]["expected_wins"]) - 9.0) < 1e-6
    assert up[5]["rank_mean"] <= base[5]["rank_mean"]


@needs_live
def test_trade_and_week_accept_the_rest_view(env):
    sim, b = env["sim_in"], env["ins"]
    ros = _league(b)
    fw = sim.default_from_week()
    mine = ros[5]
    other = ros[6]
    out = analyze_trade(sim, ros, 5, [mine[0]], [other[0]], sims=60, seed=1, from_week=fw)
    assert out["verdict"] in ("Good for you", "Bad for you", "About even")
    from src.fantasy.week import analyze_week
    w = analyze_week(sim, ros, 5, 6, fw, sims=60, seed=1, from_week=fw)
    assert w["matchup"]["win_prob"] is not None and len(w["players"]) == len(mine)


@needs_live
def test_api_scope_and_records_validation(monkeypatch, env):
    from api import fantasy_draft as fd
    ros = _league(env["pre"])
    body = {"format": "yahoo_h2h_9cat", "slot": 5, "roster": ros[5], "sims": 40, "seed": 1}
    pre = client.post("/api/fantasy/season/simulate", json=body)
    assert pre.status_code == 200, pre.text
    assert pre.json()["scope"]["mode"] == "full"                              # sezon öncesi: rest istense de tam sezon
    assert client.post("/api/fantasy/season/simulate", json={**body, "scope": "nope"}).status_code == 422
    monkeypatch.setattr(fd, "_season_sim", lambda b, fmt: env["sim_in"])
    r = client.post("/api/fantasy/season/simulate", json=body)
    assert r.status_code == 200, r.text
    js = r.json()
    fw = env["sim_in"].default_from_week()
    assert js["scope"]["mode"] == "rest" and js["scope"]["from_week"] == fw and js["me"]["weekly"][0]["week"] == fw
    full = client.post("/api/fantasy/season/simulate", json={**body, "scope": "full"}).json()
    assert full["scope"]["mode"] == "full" and len(full["me"]["weekly"]) > len(js["me"]["weekly"])
    ok = client.post("/api/fantasy/season/simulate", json={**body, "records": {str(t): 4 + (t == 5) for t in range(1, 13)}})
    assert ok.status_code == 200 and ok.json()["records_used"] is True
    assert client.post("/api/fantasy/season/simulate", json={**body, "records": {"99": 8}}).status_code == 422
    assert client.post("/api/fantasy/season/simulate", json={**body, "records": {"5": 99}}).status_code == 422
    assert client.post("/api/fantasy/season/simulate", json={**body, "records": {"5": 8}}).status_code == 422      # yalnız bir takım: eksik


# ── High Score ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def hs():
    proj, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    fmt = get_format("yahoo_high_score")
    b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    return b, ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"])), ss.SeasonSim(b, tw, shrink=1.0, playoff_weeks=list(fmt["playoff_weeks"]))


@needs_live
def test_high_score_sim_matches_the_analytic_weekly_ceiling(hs):
    """Piyasa büzmesi kapalıyken (shrink=1) simüle haftalık skor, week.py'nin analitik tavan toplamıyla uyumlu."""
    from src.fantasy.week import best_lineup, hs_ceiling
    b, _, sim = hs
    ros = _league(b)
    teams = sorted(ros)
    rows = np.array([b.row[p] for t in teams for p in ros[t]])
    sizes = [len(ros[t]) for t in teams]
    v = sim.view(None)
    U = sim._uniforms(400, 3)
    mult, frac = sim._season_draws(rows, U, v)
    V = sim._hs_scores(v, rows, sizes, sim._weekly_games(rows, frac, U, v), mult, np.random.default_rng(1))
    assert V.shape == (400, len(teams), len(sim.weeks))
    wk = sim.weeks.index(5)
    for t in teams:
        ceil = {p: hs_ceiling(b, sim, b.row[p], 5)[0] for p in ros[t]}
        analytic = sum(ceil[p] for p in best_lineup(b, ros[t], ceil))
        assert abs(V[:, teams.index(t), wk].mean() / analytic - 1) < 0.07, t


@needs_live
def test_high_score_simulation_is_a_coherent_league(hs):
    b, sim, _ = hs
    ros = _league(b)
    a = sim.simulate(ros, sims=80, seed=7)
    c = sim.simulate(ros, sims=80, seed=7)
    assert a[5]["rank_mean"] == c[5]["rank_mean"]
    assert abs(sum(o["champion_prob"] for o in a.values()) - 1.0) < 0.01
    assert abs(np.mean([o["rank_mean"] for o in a.values()]) - (b.teams + 1) / 2) < 0.01
    ceil = sim._hs_ceilings(sim.view(None))[:, :22].mean(axis=1)                          # simülatörün kendi (büzülmüş) tavanları
    strength = lambda t: sum(sorted((ceil[b.row[p]] for p in ros[t]), reverse=True)[:6])   # noqa: E731  yedekler sayılmaz
    strong, weak = max(ros, key=strength), min(ros, key=strength)
    assert a[strong]["rank_mean"] < a[weak]["rank_mean"]


@needs_live
def test_high_score_trade_and_rest_view_run(hs):
    b, sim, _ = hs
    ros = _league(b)
    top = max(ros[6], key=lambda p: b.value[b.row[p]])
    worst = min(ros[5], key=lambda p: b.value[b.row[p]])
    out = analyze_trade(sim, ros, 5, [worst], [top], sims=100, seed=2)
    assert out["verdict"] in ("Good for you", "Bad for you", "About even") and out["delta"]["win_rate"] > -0.01
    res = sim.simulate(ros, sims=60, seed=1, from_week=8)
    assert res[5]["weekly"][0]["week"] == 8
