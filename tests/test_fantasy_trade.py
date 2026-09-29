# -*- coding: utf-8 -*-
"""Faz 4 — takas analizi: ortak rastgele sayılar, kadro uydurma, API."""

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
from src.fantasy import trade as tr  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402

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
def live():
    proj, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    fmt = get_format("yahoo_h2h_9cat")
    b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    sim = ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"]))
    mine = [int(b.ids[i]) for i in np.argsort(b.adp)[[4, 19, 28, 43, 52, 67, 76, 91, 100, 115, 124, 139, 140]]]
    return b, sim, mine, ss.complete_league(b, mine, 5, seed=1)


@needs_live
def test_a_player_lives_the_same_season_in_every_roster(live):
    """Ortak rastgele sayılar: aynı tohumda bir oyuncunun sezon çarpanı ve maç oranı kadrodan bağımsız."""
    b, sim, mine, ros = live
    U = sim._uniforms(50, 3)
    a = sim._season_draws(np.array([b.row[p] for p in mine]), U)
    other = [b.row[p] for p in ros[8]][:3] + [b.row[mine[0]]]
    c = sim._season_draws(np.array(other), U)
    assert np.allclose(a[0][:, 0], c[0][:, 3]) and np.allclose(a[1][:, 0], c[1][:, 3])


@needs_live
def test_identity_and_direction_of_trades(live):
    b, sim, mine, ros = live
    best_other = max(ros[8], key=lambda p: b.value[b.row[p]])
    worst_other = min(ros[8], key=lambda p: b.value[b.row[p]])
    up = tr.analyze_trade(sim, ros, 5, [mine[0]], [best_other], sims=150, seed=2)
    down = tr.analyze_trade(sim, ros, 5, [mine[0]], [worst_other], sims=150, seed=2)
    assert down["delta"]["win_rate"] < -0.02 and down["verdict"] == "Bad for you"     # yıldızı scrub'a vermek
    assert up["delta"]["win_rate"] > down["delta"]["win_rate"]
    assert up["partner_slot"] == 8 and down["partner"]["slot"] == 8
    assert len(up["categories"]) == 9 and {"cat", "now", "after", "change"} <= set(up["categories"][0])


@needs_live
def test_unequal_trades_fill_or_trim_the_roster_and_say_so(live):
    b, sim, mine, ros = live
    target = max(ros[8], key=lambda p: b.value[b.row[p]])
    two_for_one = tr.analyze_trade(sim, ros, 5, mine[:2], [target], sims=100, seed=1)
    assert len(two_for_one["my_roster_after"]) == b.rounds and len(two_for_one["added"]) == 1
    assert any("free agency" in n for n in two_for_one["roster_notes"])
    one_for_two = tr.analyze_trade(sim, ros, 5, [mine[0]], sorted(ros[8], key=lambda p: -b.value[b.row[p]])[:2], sims=100, seed=1)
    assert len(one_for_two["my_roster_after"]) == b.rounds and len(one_for_two["dropped"]) == 1
    assert one_for_two["dropped"][0] not in set(sorted(ros[8], key=lambda p: -b.value[b.row[p]])[:2])   # taze alınan bırakılmaz


@needs_live
def test_rejects_players_from_two_teams(live):
    b, sim, mine, ros = live
    with pytest.raises(ValueError):
        tr.analyze_trade(sim, ros, 5, [mine[0]], [ros[8][0], ros[9][0]], sims=50, seed=1)


@needs_live
def test_api_league_rosters_and_trade():
    body = {"format": "yahoo_h2h_9cat", "slot": 5, "league_seed": 4}
    top = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 120}).json()["players"]
    mine = [p["player_id"] for p in top[4:120:8]][:13]
    lr = client.post("/api/fantasy/league/rosters", json={**body, "roster": mine})
    assert lr.status_code == 200, lr.text
    rosters = lr.json()["rosters"]
    assert len(rosters) == 12 and len(rosters["5"]) == 13
    assert rosters["5"][0]["player_id"] == mine[0]
    partner = rosters["8"]
    get = max(partner, key=lambda p: p["value"])["player_id"]
    r = client.post("/api/fantasy/trade/analyze", json={**body, "roster": mine, "give": [mine[0]], "get": [get], "sims": 100, "seed": 3})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["verdict"] in ("Good for you", "Bad for you", "About even") and j["partner_slot"] == 8
    assert j["give"][0]["player_id"] == mine[0] and j["get"][0]["player_id"] == get
    assert j["validation"]["status"] == "validated" and "why" in j
    bad = {**body, "roster": mine, "sims": 100}
    assert client.post("/api/fantasy/trade/analyze", json={**bad, "give": [999999999], "get": [get]}).status_code == 422
    assert client.post("/api/fantasy/trade/analyze", json={**bad, "give": [get], "get": [mine[0]]}).status_code == 422   # kendi oyuncun değil
    assert client.post("/api/fantasy/trade/analyze", json={**bad, "give": [mine[0]], "get": [mine[1]]}).status_code == 422
    assert client.post("/api/fantasy/trade/analyze", json={**bad, "give": [], "get": [get]}).status_code == 422
