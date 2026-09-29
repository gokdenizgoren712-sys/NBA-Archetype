# -*- coding: utf-8 -*-
"""Faz 4 — bu hafta: eşleşme, High Score haftalık kadro, streamer listesi."""

import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from api.main import app  # noqa: E402  (önce main: fantasy ↔ fantasy_draft döngüsel içe aktarma sırası)
from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import season_sim as ss  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402
from src.fantasy import week as wk  # noqa: E402

client = TestClient(app)
LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
needs_live = pytest.mark.skipif(not (LIVE.exists() and TW.exists()), reason="cache'lenmiş projeksiyon yok")


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from api import main as api_main
    api_main._RL.clear()
    yield


@pytest.fixture(scope="module")
def boards():
    proj, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    out = {}
    for key in ("yahoo_h2h_9cat", "yahoo_h2h_points", "yahoo_high_score"):
        fmt = get_format(key)
        b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
        sim = ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"]))
        picks = [4, 19, 28, 43, 52, 67, 76, 91, 100, 115, 124, 139, 140][: b.rounds]
        mine = [int(b.ids[i]) for i in np.argsort(b.adp)[picks]]
        out[key] = (b, sim, ss.complete_league(b, mine, 5, seed=1))
    return out


@needs_live
def test_category_matchup_is_consistent_and_symmetric(boards):
    b, sim, ros = boards["yahoo_h2h_9cat"]
    a = wk.analyze_week(sim, ros, 5, 8, 2, sims=1500, seed=1)
    c = wk.analyze_week(sim, ros, 8, 5, 2, sims=1500, seed=1)
    ca, cc = {x["cat"]: x for x in a["matchup"]["categories"]}, {x["cat"]: x for x in c["matchup"]["categories"]}
    assert set(ca) == set(b.cats)
    for cat in ca:
        assert 0.0 <= ca[cat]["win"] <= 1.0
        assert abs(ca[cat]["win"] + cc[cat]["win"] - 1.0) < 0.06          # aynı maç, iki bakış (1500 simülasyonda ölçülen sapma ≤ 0.03)
    assert abs(a["matchup"]["exp_cats"][0] + a["matchup"]["exp_cats"][1] - len(b.cats)) < 0.01
    assert len(a["matchup"]["swing"]) <= wk.MAX_SWING
    assert all(0.35 <= ca[c_]["win"] <= 0.65 for c_ in a["matchup"]["swing"])


@needs_live
def test_free_agents_are_unrostered_and_have_games(boards):
    for key, (b, sim, ros) in boards.items():
        r = wk.analyze_week(sim, ros, 5, 8, 3, sims=100, seed=1)
        rostered = {p for team in ros.values() for p in team}
        assert r["free_agents"] and all(x["player_id"] not in rostered and x["games"] >= 1 for x in r["free_agents"])
        vals = [x["week_value"] for x in r["free_agents"]]
        assert vals == sorted(vals, reverse=True)


@needs_live
def test_high_score_best_lineup_is_feasible_and_optimal(boards):
    b, sim, ros = boards["yahoo_high_score"]
    r = wk.analyze_week(sim, ros, 5, 8, 2, sims=100, seed=1)
    best = r["lineup"]["best"]
    n_slots = len(b.slots)
    assert len(best) <= n_slots
    assert dr._max_filled_masks(tuple(b.masks[b.row[p]] for p in best), n_slots) == len(best)   # hepsi bir slota oturuyor
    ceil = {p["player_id"]: p["ceiling"] for p in r["players"]}
    total = sum(ceil[p] for p in best)
    # Kaba kuvvet: kadrodan uygun tüm n_slots'luk alt kümeler içinde en iyisi
    top = 0.0
    for comb in itertools.combinations(ros[5], min(n_slots, len(ros[5]))):
        if dr._max_filled_masks(tuple(b.masks[b.row[p]] for p in comb), n_slots) == len(comb):
            top = max(top, sum(ceil[p] for p in comb))
    assert abs(total - top) < 0.6                                          # ceiling değerleri 1 basamağa yuvarlanmış


@needs_live
def test_high_score_matchup_counts_each_starters_best_game_only(boards):
    b, sim, ros = boards["yahoo_high_score"]
    r = wk.analyze_week(sim, ros, 5, 8, 2, sims=600, seed=1)
    exp_me, exp_opp = r["matchup"]["exp_points"]
    ceil_total = r["lineup"]["best_total"]
    # Toplam puanlar (tüm maçlar) yüzlerce olurdu; en iyi maç toplamı kadronun tavan toplamına yakın olmalı
    assert 0.6 * ceil_total < exp_me < 1.15 * ceil_total
    assert exp_opp > 100 and 0.0 < r["matchup"]["win_prob"] < 1.0
    stronger = wk.hs_matchup(sim, ros[5], ros[8], 2, 600, 1)
    swapped = wk.hs_matchup(sim, ros[8], ros[5], 2, 600, 1)
    assert abs(stronger["win_prob"] + swapped["win_prob"] - 1.0) < 0.08


@needs_live
def test_more_games_raise_the_weekly_ceiling(boards):
    b, sim, ros = boards["yahoo_high_score"]
    row = b.row[ros[5][0]]
    by_games = sorted(((sim.G[row][i], w) for i, w in enumerate(sim.weeks)), key=lambda t: t[0])
    lo_w, hi_w = by_games[2][1], by_games[-1][1]
    assert by_games[-1][0] > by_games[2][0]
    assert wk.hs_ceiling(b, sim, row, hi_w)[0] > wk.hs_ceiling(b, sim, row, lo_w)[0]


@needs_live
def test_api_week_analyze_all_formats_and_validation():
    top = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 120}).json()["players"]
    mine = [p["player_id"] for p in top[4:120:8]][:13]
    body = {"format": "yahoo_h2h_9cat", "slot": 5, "roster": mine, "league_seed": 1, "week": 3, "opponent": 8, "sims": 100}
    r = client.post("/api/fantasy/week/analyze", json=body)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["kind"] == "categories" and j["week_info"]["week"] == 3 and j["week_info"]["start"] < j["week_info"]["end"]
    assert len(j["players"]) == 13 and j["players"][0]["name"] and j["free_agents"][0]["name"]
    assert j["validation"]["status"] == "validated" and len(j["matchup"]["categories"]) == 9
    assert client.post("/api/fantasy/week/analyze", json={**body, "opponent": 5}).status_code == 422
    assert client.post("/api/fantasy/week/analyze", json={**body, "week": 24 + 1}).status_code == 422
    assert client.post("/api/fantasy/week/analyze", json={k: v for k, v in body.items() if k != "roster"}).status_code == 422
    # High Score: kadro 10 kişi, lineup dönüyor
    hs = client.get("/api/fantasy/rankings", params={"format": "yahoo_high_score", "limit": 120}).json()["players"]
    hs_mine = [p["player_id"] for p in hs[4:120:12]][:10]
    h = client.post("/api/fantasy/week/analyze", json={"format": "yahoo_high_score", "slot": 5, "roster": hs_mine, "league_seed": 1,
                                                       "week": 2, "opponent": 8, "sims": 100})
    assert h.status_code == 200, h.text
    assert h.json()["kind"] == "high_score" and h.json()["lineup"]["best"] and h.json()["players"][0]["ceiling"] > 0
    assert h.json()["validation"]["status"] == "unvalidated"
