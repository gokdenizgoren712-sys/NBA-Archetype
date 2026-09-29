# -*- coding: utf-8 -*-
"""Faz 3 — sezon simülatörü: birim özellikleri + API."""

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

client = TestClient(app)
LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"
needs_live = pytest.mark.skipif(not (LIVE.exists() and TW.exists()), reason="cache'lenmiş projeksiyon yok")


def test_round_robin_covers_every_pair_once():
    rr = ss._round_robin(12)
    assert rr.shape == (11, 12)
    seen = set()
    for row in rr:
        assert (row[row] == np.arange(12)).all()          # karşılıklı eşleşme
        seen |= {tuple(sorted((i, int(o)))) for i, o in enumerate(row)}
    assert len(seen) == 12 * 11 // 2


def test_bracket_gives_byes_to_top_seeds():
    first = ss._bracket(6)
    assert (0, None) in first and (1, None) in first       # 1. ve 2. tohum bay
    assert (2, 5) in first and (3, 4) in first
    assert len(ss._bracket(4)) == 2 and all(b is not None for _, b in ss._bracket(4))


def test_draw_q_interpolates_between_quantiles():
    q = np.tile(np.linspace(0, 2, 101), (2, 1))
    assert np.allclose(ss._draw_q(q, np.array([[0.0, 0.5], [0.25, 0.999999]])), [[0.0, 1.0], [0.5, 2.0]], atol=1e-3)


@pytest.fixture(scope="module")
def live():
    proj, tw = pd.read_parquet(LIVE), pd.read_parquet(TW)
    out = {}
    for key in ("yahoo_h2h_9cat", "yahoo_h2h_points"):
        fmt = get_format(key)
        b = dr.make_board(vl.value_players(proj, fmt, tw), fmt)
        out[key] = (b, ss.SeasonSim(b, tw, playoff_weeks=list(fmt["playoff_weeks"])))
    return out


def _league(b, slot=5, seed=1):
    picks = [4, 19, 28, 43, 52, 67, 76, 91, 100, 115, 124, 139, 140][: b.rounds]
    mine = [int(b.ids[i]) for i in np.argsort(b.adp)[picks]]
    return ss.complete_league(b, mine, slot, seed=seed)


@needs_live
@pytest.mark.parametrize("key", ["yahoo_h2h_9cat", "yahoo_h2h_points"])
def test_simulation_conserves_totals_and_is_reproducible(live, key):
    b, sim = live[key]
    ros = _league(b)
    assert sorted(len(v) for v in ros.values()) == [b.rounds] * b.teams
    assert len({p for v in ros.values() for p in v}) == b.teams * b.rounds
    a = sim.simulate(ros, sims=80, seed=7)
    c = sim.simulate(ros, sims=80, seed=7)
    assert a[5]["rank_mean"] == c[5]["rank_mean"]
    assert abs(sum(o["champion_prob"] for o in a.values()) - 1.0) < 0.01     # takım başına 3 basamak yuvarlama
    assert abs(sum(o["playoff_prob"] for o in a.values()) - b.fmt["playoff_teams"]) < 0.01
    assert abs(np.mean([o["rank_mean"] for o in a.values()]) - (b.teams + 1) / 2) < 0.01
    for o in a.values():
        assert abs(sum(o["rank_dist"]) - 1.0) < 0.01
    wk = a[5]["weekly"]
    assert [w["week"] for w in wk] == list(range(1, 23)) and wk[-1]["playoff"] and not wk[0]["playoff"]


@needs_live
def test_better_roster_ranks_better_and_absences_only_remove_games(live):
    b, sim = live["yahoo_h2h_9cat"]
    ros = _league(b)
    res = sim.simulate(ros, sims=80, seed=1)
    weakest = min(ros, key=lambda t: sum(b.value[b.row[p]] for p in ros[t]))
    strongest = max(ros, key=lambda t: sum(b.value[b.row[p]] for p in ros[t]))
    assert res[strongest]["rank_mean"] < res[weakest]["rank_mean"]
    # Sakatlık yalnız maç eksiltir: beklenen maçın altında, makul bir oranda
    used = set(range(1, 23))
    exp = sum(b.df["PROJ_GP"].iloc[b.row[p]] / 82.0 * sum(g for w, g in zip(sim.weeks, sim.G[b.row[p]]) if w in used)
              for p in ros[1])
    got = sum(w["games"] for w in res[1]["weekly"])
    assert 0.6 * exp < got < 1.1 * exp


@needs_live
def test_api_simulate_from_roster_and_full_draft():
    body = {"format": "yahoo_h2h_9cat", "slot": 4, "sims": 60, "seed": 3}
    top = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 200}).json()["players"]
    ids = [p["player_id"] for p in top[:13]]
    r = client.post("/api/fantasy/season/simulate", json={**body, "roster": ids})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mode"] == "simulated_rivals" and j["sims"] == 60 and len(j["league"]) == 12
    assert j["me"]["weekly"][0]["cat_win"] and len(j["categories"]) == 9
    assert j["validation"]["status"] == "validated" and j["my_roster"]
    assert all("league_games" in w for w in j["me"]["weekly"])
    assert client.post("/api/fantasy/season/simulate", json={**body, "roster": ids[:5]}).status_code == 422
    assert client.post("/api/fantasy/season/simulate", json=body).status_code == 422
    assert client.post("/api/fantasy/season/simulate", json={**body, "roster": [999999999] * 13}).status_code == 422
    assert client.post("/api/fantasy/season/simulate", json={**body, "roster": ids, "sims": 5000}).status_code == 422
    # Tam draft (mock'tan): her turda önerilen oyuncuyu seç
    m = client.post("/api/fantasy/mock/advance", json={"format": "yahoo_h2h_9cat", "slot": 4, "picks": [], "seed": 1}).json()
    picks = [p["player"]["player_id"] for p in m["picks"]]
    while not m["done"]:
        picks.append(m["recommendations"][0]["player_id"])
        m = client.post("/api/fantasy/mock/advance", json={"format": "yahoo_h2h_9cat", "slot": 4, "picks": picks, "seed": 1}).json()
        picks = [p["player"]["player_id"] for p in m["picks"]]
    full = client.post("/api/fantasy/season/simulate", json={**body, "picks": picks})
    assert full.status_code == 200 and full.json()["mode"] == "draft"
