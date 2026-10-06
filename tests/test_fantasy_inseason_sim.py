# -*- coding: utf-8 -*-
"""Faz 6, aşama 5: sezon içi — kalan maçlar için takım simülasyonu ve kalan-sezon dünyası."""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())
os.environ.setdefault("RANKIT_BACKGROUND_JOBS", "0")

from api.main import app  # noqa: E402,F401  (önce main: döngüsel içe aktarma sırası)
from api import fantasy as fz_api  # noqa: E402
from api import fantasy_draft as fd  # noqa: E402
from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import inseason_sim as isim  # noqa: E402
from src.fantasy import season_sim as ss  # noqa: E402
from src.fantasy import update as upd  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402
from src.fantasy.world import build_world, rest_from_week, rest_games  # noqa: E402

D = ROOT / "data"
LIVE, TW, WK, MODEL = (D / "2026-27__fantasy_projections.parquet", D / "2026-27__fantasy_team_weeks.parquet",
                       D / "2026-27__fantasy_weeks.parquet", D / "2026-27__fantasy_context_model.json")
LOGS = D / "2025-26__player_gamelogs.parquet"
ok = all(p.exists() for p in (LIVE, TW, WK, MODEL, LOGS)) and "SI_A_usg" in pd.read_parquet(LIVE).columns
needs = pytest.mark.skipif(not ok, reason="sezon öncesi simülasyon girdileri / maç logları yok")


@pytest.fixture(scope="module")
def season():
    """2025-26'nın her takım için ilk 20 maçı, bir yıl ileri kaydırılmış: 2026-27'nin 20. maçında yapılmış bir güncelleme gibi."""
    logs = pd.read_parquet(LOGS).copy()
    logs["GAME_DATE"] = pd.to_datetime(logs["GAME_DATE"])
    first = logs.groupby("TEAM_ABBREVIATION")["GAME_DATE"].transform(lambda s: s.rank(method="dense"))
    cur = logs[first <= 20].copy()
    cur["GAME_DATE"] = (cur["GAME_DATE"] + pd.Timedelta(days=365)).dt.strftime("%Y-%m-%d")
    base = pd.read_parquet(LIVE)
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    new = upd.refresh_projections(cur, base, model=model)
    tw, wk = pd.read_parquet(TW), pd.read_parquet(WK)
    as_of = str(new["INSEASON_AS_OF"].iloc[0])
    fw = rest_from_week(wk, as_of)
    world = build_world(new, tw, model, scenarios=32, from_week=fw, weeks_table=wk, as_of=as_of)
    return dict(cur=cur, new=new, tw=tw, wk=wk, as_of=as_of, fw=fw, world=world, model=model)


@needs
def test_refresh_adds_a_rest_of_season_simulation(season):
    new, as_of = season["new"], season["as_of"]
    assert (new["SIM_AS_OF"] == as_of).all() and "SI_PTS" in new.columns
    rot = new[new["PROJ_MPG"] >= 18]
    assert rot["SIM_FP"].notna().all()
    assert (rot["SIM_GP"] >= rot["INSEASON_GP"] - 1e-6).all()                      # toplam sezon maçı: oynanan + kalan
    assert (rot["SIM_GP"] <= 82.0 + 1e-6).all()
    fp = rot["PTS"] + 1.2 * rot["REB"] + 1.5 * rot["AST"] + 3 * rot["STL"] + 3 * rot["BLK"] - rot["TOV"]
    assert np.corrcoef(fp, rot["SIM_FP"])[0, 1] > 0.95                              # güncel model ile simülasyon büyük ölçüde aynı şeyi söylüyor
    assert new[[c for c in new.columns if c.startswith("SI_L_")]].isna().all().all()    # eski takım yükü yok: bağlam ikinci kez uygulanmaz
    left = isim.games_left(season["cur"])
    assert set(left.values()) == {62}                                               # 82 − 20


@needs
def test_a_failed_simulation_never_blocks_the_model_update(season, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("sim down")
    monkeypatch.setattr(isim, "attach_inseason_sim", boom)
    logs = []
    new = upd.refresh_projections(season["cur"], pd.read_parquet(LIVE), model=season["model"], log=logs.append)
    assert "INSEASON_AS_OF" in new.columns and not any(c.startswith(("SIM_", "SI_")) for c in new.columns)
    assert logs and "sim down" in logs[0]


@needs
def test_the_rest_world_plays_only_the_remaining_weeks(season):
    w, fw = season["world"], season["fw"]
    assert w.from_week == fw and fw > 1
    assert float(np.abs(w.sums[:, : fw - 1]).sum()) == 0.0 and float(w.games[:, : fw - 1].sum()) == 0.0   # geçmiş haftalar boş
    assert w.games[:, fw - 1 :].sum() > 0
    games_by, skipped = rest_games(season["tw"], season["wk"], season["as_of"], fw)
    per_team = {}
    new = season["new"].set_index("PLAYER_ID")
    for j, pid in enumerate(w.player_ids):
        per_team.setdefault(new.at[pid, "TEAM"], []).append(w.games[:, :, j].sum(axis=1).max())
    assert all(max(v) <= games_by[t] for t, v in per_team.items())                  # kimse takımının kalan maçından fazla oynayamaz
    ix = w.index()
    star = int(season["new"].sort_values("PTS", ascending=False)["PLAYER_ID"].iloc[0])
    assert w.games[:, :, ix[star]].sum(axis=1).mean() > 25                          # yıldız kalan ~55 maçın büyük kısmında oynar


@needs
def test_full_world_is_unchanged_when_no_from_week_is_given(season):
    w = build_world(season["new"], season["tw"], season["model"], scenarios=8)       # sezon öncesi çağrı biçimi
    assert w.from_week is None and w.games.shape[1] == len(season["wk"]["WEEK"])


def _board(season, key):
    fmt = get_format(key)
    b = dr.make_board(vl.value_players(season["new"], fmt, season["tw"]), fmt)
    picks = [4, 19, 28, 43, 52, 67, 76, 91, 100, 115, 124, 139, 140][: b.rounds]
    mine = [int(b.ids[i]) for i in np.argsort(b.adp)[picks]]
    return fmt, b, ss.complete_league(b, mine, 5, seed=1)


@needs
@pytest.mark.parametrize("key", ["yahoo_h2h_9cat", "yahoo_h2h_points", "yahoo_high_score"])
def test_season_sim_reads_the_rest_world_only_for_the_rest_scope(season, key):
    fmt, b, ros = _board(season, key)
    sim = ss.SeasonSim(b, season["tw"], playoff_weeks=list(fmt["playoff_weeks"]), weeks=season["wk"], as_of=season["as_of"], world=season["world"])
    fw = sim.default_from_week()
    assert fw == season["fw"]
    r = sim.simulate(ros, sims=120, seed=3, from_week=fw)
    assert sim.last_engine == "world"
    assert abs(sum(r[5]["rank_dist"]) - 1.0) < 0.02
    sim.simulate(ros, sims=60, seed=3)                                               # tam sezon istemi: dünya yalnız kalan haftaları bilir
    assert sim.last_engine == "legacy"
    again = sim.simulate(ros, sims=120, seed=3, from_week=fw)
    assert again[5]["rank_dist"] == r[5]["rank_dist"]                                # aynı tohum → aynı sonuç
    legacy = ss.SeasonSim(b, season["tw"], playoff_weeks=list(fmt["playoff_weeks"]), weeks=season["wk"], as_of=season["as_of"])
    lg = legacy.simulate(ros, sims=120, seed=3, from_week=fw)
    assert legacy.last_engine == "legacy"
    teams = sorted(ros)
    ap = lambda x: np.array([x[t]["all_play_rate"] for t in teams])                  # noqa: E731
    assert np.corrcoef(ap(r), ap(lg))[0, 1] > 0.5                                    # kalan sezonda iki motor aynı takım gücü sıralamasını görür


@needs
def test_single_week_analysis_uses_the_world_from_the_first_rest_week_on(season):
    fmt, b, ros = _board(season, "yahoo_h2h_points")
    sim = ss.SeasonSim(b, season["tw"], playoff_weeks=list(fmt["playoff_weeks"]), weeks=season["wk"], as_of=season["as_of"], world=season["world"])
    fw = season["fw"]
    mine = ros[5]
    assert sim.world_week_values([mine, ros[6]], fw, 50, 1, from_week=fw) is not None
    assert sim.world_week_values([mine, ros[6]], fw - 1, 50, 1, from_week=fw - 1) is None      # kısmen oynanmış / oynanmış hafta: eski motor
    assert sim.world_player_week(mine, fw) is not None and sim.world_player_week(mine, fw - 1) is None


@needs
def test_api_scope_follows_the_inseason_state(season, monkeypatch):
    st = {"proj": season["new"], "team_weeks": season["tw"], "weeks": season["wk"], "mtime": 1.0, "backtest": None}
    assert fz_api._sim_available(st) is True
    ok_, fw, as_of = fd._world_scope(st)
    assert ok_ and fw == season["fw"] and as_of == season["as_of"]
    stale = {**st, "proj": season["new"].assign(SIM_AS_OF="2026-01-01")}                    # SIM_* eski güncellemeden kalmış
    assert fz_api._sim_available(stale) is False and fd._world_scope(stale)[0] is False
    pre = {**st, "proj": pd.read_parquet(LIVE)}                                              # sezon öncesi dosya
    assert fz_api._sim_available(pre) is True and fd._world_scope(pre) == (True, None, None)
    over = {**st, "weeks": season["wk"].assign(START="2020-01-01")}                         # hiç oynanmamış hafta kalmadı
    assert fd._world_scope(over)[0] is False


@needs
def test_get_world_serves_the_previous_hours_world_while_the_new_one_builds(season, monkeypatch):
    import threading
    st = {"proj": season["new"], "team_weeks": season["tw"], "weeks": season["wk"], "mtime": 2.0, "backtest": None}
    monkeypatch.setattr(fd, "_load", lambda: st)
    monkeypatch.setattr(fd, "_world_enabled", lambda: True)
    monkeypatch.setattr(fd, "background_jobs_enabled", lambda: True)
    gate = threading.Event()
    built = []

    def slow_build(s):
        gate.wait(5)
        built.append(1)
        return season["world"]
    monkeypatch.setattr(fd, "_build_world_now", slow_build)
    with fd._world_lock:
        fd._world_state.update(mtime=1.0, world=season["world"], building=False)             # bir önceki saatin dünyası
    got = fd.get_world(wait=0.0)
    assert got is season["world"]                                                             # beklemeden eski dünya
    gate.set()
    fd._world_state["event"].wait(5)
    assert built and fd.get_world() is season["world"]
    with fd._world_lock:
        fd._world_state.update(mtime=None, world=None, building=False)
