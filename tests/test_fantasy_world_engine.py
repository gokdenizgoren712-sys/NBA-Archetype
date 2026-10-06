# -*- coding: utf-8 -*-
"""Faz 6, aşama 1: sezon simülatörü oyuncu üretimini dünyadan okur — eski motorla uyum, tekrarlanabilirlik, geri dönüş."""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())
os.environ.setdefault("RANKIT_BACKGROUND_JOBS", "0")

from api.main import app  # noqa: E402  (önce main: döngüsel içe aktarma sırası)
from api import fantasy_draft as fd  # noqa: E402
from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import season_sim as ss  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402

client = TestClient(app)
LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
WK = ROOT / "data" / "2026-27__fantasy_weeks.parquet"
ok = LIVE.exists() and TW.exists() and WK.exists() and "SI_PTS" in pd.read_parquet(LIVE).columns
needs = pytest.mark.skipif(not ok, reason="SI_* girdileri yok (build gerekir)")


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from api import main as api_main
    api_main._RL.clear()
    yield


@pytest.fixture(scope="module")
def world():
    old_k = fd.WORLD_K
    fd.WORLD_K = 48
    with fd._world_lock:
        fd._world_state.update(mtime=None, world=None, building=False)
    w = fd.get_world(block=True)
    yield w
    fd.WORLD_K = old_k
    with fd._world_lock:
        fd._world_state.update(mtime=None, world=None, building=False)
    fd._sims.clear()


def _roster_body(key="yahoo_h2h_9cat", slot=5):
    proj = pd.read_parquet(LIVE)
    fmt = get_format(key)
    tw = pd.read_parquet(TW)
    b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    picks = [4, 19, 28, 43, 52, 67, 76, 91, 100, 115, 124, 139, 140][: b.rounds]
    return {"format": key, "slot": slot, "roster": [int(b.ids[i]) for i in np.argsort(b.adp)[picks]], "sims": 120, "seed": 4}


@needs
@pytest.mark.parametrize("key", ["yahoo_h2h_9cat", "yahoo_h2h_points", "yahoo_high_score"])
def test_api_uses_the_world_engine_when_ready_and_is_reproducible(world, key):
    body = _roster_body(key)
    a = client.post("/api/fantasy/season/simulate", json=body)
    assert a.status_code == 200, a.text
    assert a.json()["engine"] == "world"
    b = client.post("/api/fantasy/season/simulate", json=body).json()
    assert a.json()["me"]["rank_dist"] == b["me"]["rank_dist"]                            # aynı tohum → aynı sonuç
    assert abs(sum(a.json()["me"]["rank_dist"]) - 1.0) < 0.02
    assert sum(w["games"] for w in a.json()["me"]["weekly"]) > 300                         # takımın 13 oyuncusu haftalarca oynuyor


@needs
def test_falls_back_to_the_legacy_engine_when_the_world_is_off(world, monkeypatch):
    monkeypatch.setattr(fd, "_world_enabled", lambda: False)
    fd._sims.clear()
    r = client.post("/api/fantasy/season/simulate", json=_roster_body())
    assert r.status_code == 200 and r.json()["engine"] == "legacy"
    fd._sims.clear()


@needs
@pytest.mark.parametrize("key", ["yahoo_h2h_9cat", "yahoo_h2h_points", "yahoo_high_score"])
def test_world_and_legacy_agree_on_team_strength_when_the_market_shrink_is_off(world, key):
    proj, tw, wk = pd.read_parquet(LIVE), pd.read_parquet(TW), pd.read_parquet(WK)
    fmt = get_format(key)
    b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    body = _roster_body(key)
    ros = ss.complete_league(b, body["roster"], body["slot"], seed=1)
    teams = sorted(ros)
    ap = lambda r: np.array([r[t]["all_play_rate"] for t in teams])      # noqa: E731
    pp = lambda r: np.array([r[t]["playoff_prob"] for t in teams])       # noqa: E731
    for shrink, wshrink in ((1.0, False), (None, True)):                 # çekme kapalı / her iki motorda varsayılan çekme açık
        legacy = ss.SeasonSim(b, tw, shrink=shrink, playoff_weeks=list(fmt["playoff_weeks"]), weeks=wk)
        new = ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"]), weeks=wk, world=world, world_shrink=wshrink)
        a, c = legacy.simulate(ros, sims=300, seed=3), new.simulate(ros, sims=300, seed=3)
        assert legacy.last_engine == "legacy" and new.last_engine == "world"
        floor = 0.85 if shrink == 1.0 else 0.5                         # ağır çekmede (puan / High Score κ = 0.25) fark küçülür, gürültü baskın
        assert np.corrcoef(ap(a), ap(c))[0, 1] > floor
        assert np.abs(pp(a) - pp(c)).mean() < 0.12
        assert 0.5 < ap(c).std() / ap(a).std() < 2.0                   # yayılım aynı büyüklük sınıfında
        assert abs(ap(c).mean() - 0.5) < 0.01                              # herkes herkesle: ortalama 0.5
    # çekme dünyanın takım farklarını daraltır (eski motorun kalibre ettiği davranış)
    spread = lambda w_shrink: ap(ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"]), weeks=wk, world=world, world_shrink=w_shrink).simulate(ros, sims=300, seed=3)).std()   # noqa: E731
    assert spread(True) < spread(False)


@needs
def test_trade_analysis_runs_on_the_world_and_stays_reproducible(world):
    body = _roster_body()
    league = client.post("/api/fantasy/league/rosters", json=body).json()
    mine = [p["player_id"] for p in league["rosters"]["5"]]
    other = [p["player_id"] for p in league["rosters"]["6"]]
    t = {**body, "give": [mine[-1]], "get": [other[0]], "sims": 150}
    a = client.post("/api/fantasy/trade/analyze", json=t)
    assert a.status_code == 200, a.text
    assert a.json()["engine"] == "world"
    assert client.post("/api/fantasy/trade/analyze", json=t).json()["delta"] == a.json()["delta"]


@needs
def test_a_format_with_other_high_score_weights_keeps_the_legacy_engine(world):
    proj, tw, wk = pd.read_parquet(LIVE), pd.read_parquet(TW), pd.read_parquet(WK)
    fmt = {**get_format("yahoo_high_score"), "weights": {"PTS": 1.0, "REB": 1.5, "AST": 2.0, "STL": 3.0, "BLK": 3.0}}
    b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
    ros = ss.complete_league(b, [int(b.ids[i]) for i in np.argsort(b.adp)[:b.rounds]], 5, seed=1)
    sim = ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"]), weeks=wk, world=world)
    sim.simulate(ros, sims=60, seed=1)
    assert sim.last_engine == "legacy"
