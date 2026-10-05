# -*- coding: utf-8 -*-
"""Takım simülasyonu: korunum, takım arkadaşı yokluğunun etkisi, SIM_* → projeksiyon dönüşümü, API."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from api.main import app  # noqa: E402
from src.fantasy import team_sim as ts  # noqa: E402

client = TestClient(app)


def _team(star_gp=82.0, n=9):
    mpg = [36.0, 34.0, 30.0, 28.0, 24.0, 20.0, 16.0, 12.0, 8.0][:n]
    gp = [star_gp] + [82.0] * (n - 1)
    df = pd.DataFrame({"PROJ_MPG": mpg, "PROJ_GP": gp}, index=range(1, n + 1))
    for s in ts.STATS:
        base = {"PTS": 0.55, "REB": 0.2, "OREB": 0.05, "DREB": 0.15, "AST": 0.15, "STL": 0.03, "BLK": 0.02, "TOV": 0.07,
                "FG3M": 0.07, "FG3A": 0.2, "FGA": 0.45, "FTA": 0.12, "PF": 0.08, "FGM": 0.2, "FTM": 0.1}[s]
        df[s] = base * df["PROJ_MPG"]
    return df


def _fits(theta=0.8):
    return {k: (pd.Series(1.0, index=range(1, 20)).mul([1.6] + [1.0] * 18), theta) for k in ("usg", "reb", "ast")}


def _healthy_load(df, fits):
    """Eski bağlam: yıldızın hep oynadığı kadro (her oyuncu için takım arkadaşlarının dakika ağırlıklı eğilimi)."""
    b = df["PROJ_MPG"].to_numpy(float)
    out = {}
    for k, (a, _t) in fits.items():
        a = a.reindex(df.index).to_numpy(float)
        out[k] = np.array([(np.sum(a * b) - a[i] * b[i]) / (np.sum(b) - b[i]) for i in range(len(df))])
    return out


def _run(df, theta=0.8, **kw):
    P = ts.SimParams(talent_on=False, scenarios=60, mover_delta=0.0, **kw)
    n = len(df)
    Lold = _healthy_load(_team(), _fits(theta))                       # geçmiş: yıldız sağlıklı kadro
    gpq = np.tile(np.ones(101), (n, 1))
    fpq = np.tile(np.ones(101), (n, 1))
    return ts.simulate_team(df, _fits(theta), Lold, gpq, fpq, P)


def test_healthy_team_reproduces_its_inputs():
    df = _team()
    out = _run(df, theta=0.0, budget_scale=1.0)                         # bütçe çarpanı 1: ortalama oyun yeniden ölçeklenmez
    for s in ("PTS", "REB", "AST"):
        assert np.allclose(np.nanmean(out[s], axis=0), df[s].to_numpy(), rtol=0.03), s
    assert np.allclose(out["GP"].mean(axis=0), 82.0, atol=0.5)


def test_a_missing_star_pushes_minutes_and_usage_to_teammates():
    healthy, hurt = _team(star_gp=82.0), _team(star_gp=30.0)
    a, b = _run(healthy), _run(hurt)
    # eski bağlam yıldızlı: yıldız 82 maçın 30'unda oynuyorsa takım arkadaşlarının kullanımı (şut denemesi) OYUN İÇİNDE yükselir
    assert np.nanmean(b["FGA"][:, 7]) > np.nanmean(a["FGA"][:, 7]) * 1.05
    assert np.nanmean(b["FGA"][:, 2]) > np.nanmean(a["FGA"][:, 2]) * 1.02
    assert np.nanmean(b["GP"][:, 0]) < 40


def test_context_elasticity_scales_the_usage_response():
    hurt = _team(star_gp=30.0)
    flat = np.nanmean(_run(hurt, theta=0.0)["FGA"][:, 7])
    steep = np.nanmean(_run(hurt, theta=1.0)["FGA"][:, 7])
    assert steep > flat


def test_with_sim_swaps_stats_and_keeps_model_rows_without_simulation():
    p = pd.DataFrame({"PLAYER_ID": [1, 2], "PROJ_MPG": [30.0, 20.0], "PROJ_GP": [70.0, 60.0], "PTS": [20.0, 10.0], "FGM": [7.0, 4.0], "FGA": [15.0, 9.0],
                      "FTM": [3.0, 1.0], "FTA": [4.0, 2.0], "FG%": [0.46, 0.44], "FT%": [0.75, 0.5],
                      "FP_RATIO_P10": [0.8, 0.8], "FP_RATIO_P90": [1.2, 1.2], "SIM_FP": [30.0, np.nan], "SIM_FP_P10": [24.0, np.nan], "SIM_FP_P90": [36.0, np.nan],
                      "SIM_MPG": [28.0, np.nan], "SIM_GP": [66.0, np.nan]})
    for s in ts.STATS:
        if s not in p.columns:
            p[s] = 1.0
        p[f"SIM_{s}"] = [p.loc[0, s] * 1.1, np.nan]
    out = ts.with_sim(p)
    assert out.loc[0, "PTS"] == pytest.approx(22.0) and out.loc[1, "PTS"] == 10.0          # simülasyonu olmayan satır model değerinde
    assert out.loc[0, "PROJ_MPG"] == 28.0 and out.loc[0, "PROJ_GP"] == 66.0
    assert out.loc[0, "FG%"] == pytest.approx(out.loc[0, "FGM"] / out.loc[0, "FGA"])
    assert out.loc[0, "FP_RATIO_P10"] == pytest.approx(0.8) and out.loc[1, "FP_RATIO_P10"] == 0.8


LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
needs_sim = pytest.mark.skipif(not LIVE.exists() or "SIM_FP" not in pd.read_parquet(LIVE).columns, reason="simülasyon sütunları yok")


@needs_sim
def test_live_projection_carries_simulation_columns_close_to_the_model():
    d = pd.read_parquet(LIVE)
    assert d["SIM_FP"].notna().mean() > 0.95
    rot = d[d["PROJ_MPG"] >= 15]
    fp = rot["PTS"] + 1.2 * rot["REB"] + 1.5 * rot["AST"] + 3 * rot["STL"] + 3 * rot["BLK"] - rot["TOV"]
    assert np.corrcoef(fp, rot["SIM_FP"])[0, 1] > 0.95                                    # iki yol büyük ölçüde aynı şeyi söylüyor
    assert (rot["SIM_FP_P10"] < rot["SIM_FP"]).all() and (rot["SIM_FP"] < rot["SIM_FP_P90"]).all()


@needs_sim
def test_api_serves_both_projection_sources():
    from api import main as api_main
    api_main._RL.clear()
    assert client.get("/api/fantasy/meta").json()["simulation"] is True
    m = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 40}).json()
    s = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 40, "source": "sim"}).json()
    assert m["source"] == "model" and s["source"] == "sim"
    pm = {p["player_id"]: p for p in m["players"]}
    diff = [abs(p["per_game"]["pts"] - pm[p["player_id"]]["per_game"]["pts"]) for p in s["players"] if p["player_id"] in pm]
    assert max(diff) > 0.05                                                                # simülasyon gerçekten farklı sayılar üretiyor
    pid = m["players"][0]["player_id"]
    prof = client.get(f"/api/fantasy/players/{pid}", params={"format": "yahoo_h2h_9cat"}).json()
    sim = prof["simulation"]
    assert sim and sim["per_game"]["pts"]["p10"] < sim["per_game"]["pts"]["mean"] < sim["per_game"]["pts"]["p90"]
    assert client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "source": "nope"}).status_code == 422
