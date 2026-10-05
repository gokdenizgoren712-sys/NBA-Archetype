# -*- coding: utf-8 -*-
"""Fantezi Faz 1: projeksiyon, değerleme, API sözleşmesi.

Sabitlenen davranışlar:
  - G-score makaledeki formülle birebir (Rosenof 2307.02188, Tablo 5):
    (μ − μ̄) / √(σ² + κτ²), κ = 2N/(2N−1). Z-score τ'suz hâli.
  - TO ters yönlü; punt edilen kategori toplam değere girmez.
  - Yüzde kategorisi hacimle: havuz yüzdesinde atan oyuncunun katkısı ~0,
    hacmi ne olursa olsun.
  - High Score'un "k maçın en iyisi" hesabı analitik sonuçla aynı
    (Uniform(0,2) için E[max_k] = 2k/(k+1)).
  - Projeksiyon hedef sezonun verisini GÖRMEZ (backtest'in dürüstlüğü buna bağlı).
  - Ağırlıklı oran ve ortalamaya çekme formülü.
  - API: her formatın satır alanları (Claude Design'a verilen sözleşme),
    hatalı girdide 422, bilinmeyen oyuncuda 404.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import projections as pj  # noqa: E402
from src.fantasy import valuation as val  # noqa: E402


# ── Değerleme ────────────────────────────────────────────────────────────────

def _pool(n=40, seed=7):
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        "PLAYER_ID": range(n), "PLAYER_NAME": [f"P{i}" for i in range(n)], "TEAM": "AAA",
        "PTS": rng.uniform(8, 30, n), "REB": rng.uniform(2, 12, n), "AST": rng.uniform(1, 9, n),
        "STL": rng.uniform(0.4, 2, n), "BLK": rng.uniform(0.1, 2, n), "TOV": rng.uniform(0.8, 4, n),
        "FG3M": rng.uniform(0, 4, n), "FGA": rng.uniform(6, 20, n), "FTA": rng.uniform(1, 8, n),
        "PROJ_GP": np.full(n, 82.0), "PROJ_MPG": np.full(n, 30.0),
    })
    df["FGM"] = df["FGA"] * rng.uniform(0.40, 0.60, n)
    df["FTM"] = df["FTA"] * rng.uniform(0.65, 0.90, n)
    for c in ("PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M"):
        df[f"SD_{c}"] = df[c] * 0.4
    df["SD_FG_IMP"] = 1.5
    df["SD_FT_IMP"] = 0.8
    return df


def _fmt(**kw):
    return get_format("yahoo_h2h_9cat", teams=6, **kw)   # havuz 78 > 40 → herkes havuzda


def test_g_score_matches_paper_formula():
    df = _pool()
    fmt = _fmt()
    g = pd.Series(3.5, index=df.index)
    out = val.category_values(df, fmt, g)
    n = val.roster_size(fmt)
    kappa = 2 * n / (2 * n - 1)
    mu = df["PTS"] * 3.5
    tau = df["SD_PTS"] * math.sqrt(3.5)
    sigma = mu.std(ddof=0)
    tau_rms = math.sqrt((tau ** 2).mean())
    expected_g = (mu - mu.mean()) / math.sqrt(sigma ** 2 + kappa * tau_rms ** 2)
    expected_z = (mu - mu.mean()) / sigma
    assert np.allclose(out["G_PTS"], expected_g)
    assert np.allclose(out["Z_PTS"], expected_z)


def test_turnovers_are_negative_and_punt_is_excluded():
    df = _pool()
    fmt = _fmt()
    g = pd.Series(3.5, index=df.index)
    out = val.category_values(df, fmt, g)
    worst_to = df["TOV"].idxmax()
    assert out.loc[worst_to, "Z_TO"] < 0
    punted = val.category_values(df, fmt, g, punt=("TO", "FT%"))
    active = [c for c in fmt["categories"] if c not in ("TO", "FT%")]
    assert np.allclose(punted["VALUE_Z"], punted[[f"Z_{c}" for c in active]].sum(axis=1))


def test_percentage_impact_scales_with_volume_not_just_rate():
    df = _pool()
    p_bar = df["FGM"].sum() / df["FGA"].sum()
    df.loc[0, ["FGA", "FGM"]] = [20.0, 20.0 * p_bar]          # tam havuz yüzdesi, yüksek hacim
    df.loc[1, ["FGA", "FGM"]] = [20.0, 20.0 * (p_bar + 0.08)]  # iyi yüzde, yüksek hacim
    df.loc[2, ["FGA", "FGM"]] = [4.0, 4.0 * (p_bar + 0.08)]    # iyi yüzde, düşük hacim
    out = val.category_values(df, _fmt(), pd.Series(3.5, index=df.index))
    assert abs(out.loc[0, "Z_FG%"]) < abs(out.loc[1, "Z_FG%"])
    assert out.loc[1, "Z_FG%"] > out.loc[2, "Z_FG%"] > 0


def test_expected_max_matches_uniform_closed_form():
    table = val.expected_max_table(list(np.linspace(0, 2, 41)))   # Uniform(0, 2)
    for k in (1, 2, 3, 5):
        assert table[k] == pytest.approx(2 * k / (k + 1), abs=0.01)
    assert table[0] == 0


def test_points_replacement_level_and_value(monkeypatch):
    monkeypatch.setattr(val, "REPL_CREDIT", 0.0)        # saf toplam semantiği; kredi ayrı test edilir (test_fantasy_valuation_credit)
    df = _pool(n=100)
    df["PROJ_GP"] = 70.0
    fmt = get_format("yahoo_h2h_points", teams=6)   # havuz 6 × 13 = 78
    out = val.points_values(df, fmt, "total")
    ranked = out["FP_TOTAL"].sort_values(ascending=False)
    assert out["REPLACEMENT"].iloc[0] == pytest.approx(ranked.iloc[78:84].mean())
    assert (out["VALUE"] == out["FP_TOTAL"] - out["REPLACEMENT"]).all()


def test_tiers_break_on_large_local_gaps():
    vals = pd.Series([10, 9.9, 9.8, 7.0, 6.9, 6.8, 6.7, 3.0, 2.9])
    tiers = val._tiers(vals, n_pool=9, window=3)
    assert tiers.tolist() == [1, 1, 1, 2, 2, 2, 2, 3, 3]


# ── Projeksiyon ──────────────────────────────────────────────────────────────

def _logs(season, players):
    """players: {pid: (games, min_per_game, pts_per_game)} — diğer stat'lar sabit."""
    rows = []
    y = int(season[:4])
    for pid, (games, mpg, pts) in players.items():
        for gnum in range(games):
            rows.append({"PLAYER_ID": pid, "PLAYER_NAME": f"P{pid}", "TEAM_ABBREVIATION": "AAA",
                         "GAME_DATE": f"{y}-11-{1 + gnum % 28:02d}", "MIN": mpg, "PTS": pts,
                         "REB": 5, "OREB": 1, "DREB": 4, "AST": 3, "STL": 1, "BLK": 0.5, "TOV": 2,
                         "FG3M": 1, "FG3A": 3, "FGM": 6, "FGA": 13, "FTM": 3, "FTA": 4, "PF": 2,
                         "DD2": 0, "TD3": 0})
    return pd.DataFrame(rows)


@pytest.fixture
def synth(monkeypatch, tmp_path):
    # Gerçek data/ dosyalarına (yaş, bios) dokunmasın: boş klasör.
    monkeypatch.setattr(pj, "DATA_DIR", tmp_path)
    pj.age_curve.cache_clear()
    roster = pd.DataFrame({"PLAYER_ID": [1, 2, 3, 4], "PLAYER_NAME": ["P1", "P2", "P3", "P4"],
                           "TEAM_ABBREVIATION": "AAA", "POSITION_RAW": "G",
                           "DRAFT_YEAR": [2080, 2080, 2080, 2092], "DRAFT_NUMBER": [5, 5, 5, 2],
                           "FROM_YEAR": [2090, 2090, 2091, 2093]})
    base = {1: (60, 30, 30.0), 2: (60, 30, 12.0), 3: (60, 30, 18.0)}
    logs = {
        "2090-91": _logs("2090-91", {1: (60, 30, 10.0), 2: (60, 30, 12.0)}),
        "2091-92": _logs("2091-92", {1: (60, 30, 20.0), 2: (60, 30, 12.0), 3: (60, 30, 20.0)}),
        "2092-93": _logs("2092-93", base),
    }
    return roster, logs


def test_projection_never_sees_the_target_season(synth):
    roster, logs = synth
    a = pj.project("2093-94", logs, roster, players=[1, 2, 3])
    leaky = {**logs, "2093-94": _logs("2093-94", {1: (80, 40, 99.0)})}
    b = pj.project("2093-94", leaky, roster, players=[1, 2, 3])
    pd.testing.assert_frame_equal(a, b)


def test_weighted_rate_formula_without_regression(synth):
    roster, logs = synth
    out = pj.project("2093-94", logs, roster, players=[1], k_scale=1e-12).set_index("PLAYER_ID")
    # Oyuncu 1: son sezon 30 sayı/30 dk, önceki 20, ondan önce 10; ağırlık 7/2/1.
    rate = (7 * 30 + 2 * 20 + 1 * 10) / (7 * 30 + 2 * 30 + 1 * 30)
    assert out.loc[1, "PTS"] / out.loc[1, "PROJ_MPG"] == pytest.approx(rate, rel=1e-6)


def test_small_samples_are_pulled_toward_league_mean(synth):
    roster, logs = synth
    logs = {**logs, "2092-93": pd.concat([logs["2092-93"], _logs("2092-93", {9: (2, 5, 30.0)})])}
    out = pj.project("2093-94", logs, roster, players=[9, 1]).set_index("PLAYER_ID")
    raw_rate = 30.0 / 5
    assert out.loc[9, "PTS"] / out.loc[9, "PROJ_MPG"] < raw_rate * 0.5


def test_rookie_uses_earlier_draft_class_baseline(synth):
    roster, logs = synth
    out = pj.project("2093-94", logs, roster, players=[4]).set_index("PLAYER_ID")
    assert out.loc[4, "SOURCE"] == "rookie_baseline"
    assert out.loc[4, "PROJ_MPG"] > 0


# ── API sözleşmesi (commitli artefaktlarla) ──────────────────────────────────

PROJ_FILE = ROOT / "data" / "2026-27__fantasy_projections.parquet"


@pytest.fixture(scope="module")
def client():
    if not PROJ_FILE.exists():
        pytest.skip("fantasy artefacts not built")
    from fastapi.testclient import TestClient
    from api.main import app
    return TestClient(app)


COMMON = {"rank", "tier", "player_id", "name", "team", "eligible", "archetype", "age", "proj_gp",
          "proj_gp_range", "proj_mpg", "range_factor", "per_game", "value", "adp", "adp_sd",
          "adp_diff", "flags", "source"}


@pytest.mark.parametrize("fmt,extra", [
    ("yahoo_h2h_9cat", {"value_z", "value_g", "categories"}),
    ("yahoo_roto_9cat", {"value_z", "value_g", "categories"}),
    ("yahoo_h2h_points", {"fp_game", "fp_game_range", "fp_total", "value_over_replacement"}),
    ("yahoo_high_score", {"fp_game", "hs_week_avg", "hs_playoff_avg", "ceiling_index", "four_game_weeks"}),
])
def test_rankings_row_contract(client, fmt, extra):
    r = client.get(f"/api/fantasy/rankings?format={fmt}&limit=5")
    assert r.status_code == 200
    body = r.json()
    assert len(body["players"]) == 5
    assert COMMON | extra <= set(body["players"][0])
    assert [p["rank"] for p in body["players"]] == [1, 2, 3, 4, 5]


def test_roto_uses_z_and_h2h_uses_g(client):
    assert client.get("/api/fantasy/rankings?format=yahoo_roto_9cat&limit=1").json()["metric"] == "value_z"
    assert client.get("/api/fantasy/rankings?limit=1").json()["metric"] == "value_g"


@pytest.mark.parametrize("url", [
    "/api/fantasy/rankings?format=nope",
    "/api/fantasy/rankings?punt=DUNKS",
    "/api/fantasy/rankings?format=yahoo_h2h_points&punt=TO",
    "/api/fantasy/rankings?teams=40",
    "/api/fantasy/rankings?basis=weekly",
    "/api/fantasy/rankings?limit=5000",
])
def test_bad_rankings_input_is_422(client, url):
    assert client.get(url).status_code == 422


def test_custom_format_is_validated(client):
    body = {"format": {"kind": "categories", "categories": ["PTS", "REB"], "teams": 40,
                       "roster": {"starters": ["PG", "C", "Util"], "bench": 3, "il": 1}}}
    assert client.post("/api/fantasy/rankings", json=body).status_code == 422
    body["format"]["teams"] = 10
    body["format"]["roster"]["starters"] = ["PG", "SG", "SF", "PF", "C"]
    r = client.post("/api/fantasy/rankings", json={**body, "limit": 3})
    assert r.status_code == 200 and len(r.json()["players"]) == 3


def test_player_profile_and_missing_player(client):
    top = client.get("/api/fantasy/rankings?limit=1").json()["players"][0]
    r = client.get(f"/api/fantasy/players/{top['player_id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["player"]["player_id"] == top["player_id"]
    assert len(body["schedule"]) == 24 and body["playoff_games"] > 0
    assert len(body["game_distribution"]["high_score"]) == 41
    assert client.get("/api/fantasy/players/1").status_code == 404
