# -*- coding: utf-8 -*-
"""Trend etiketleri: sentetik loglarla doğru yön, eşikler, etiketsizler ve API."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from api.main import app  # noqa: E402
from src.fantasy import trends as tr  # noqa: E402
from src.fantasy.projections import PTS_WEIGHTS  # noqa: E402

client = TestClient(app)


def _season(rows):
    """rows: {pid: (maç, dakika/maç, 36 dakikadaki puan)} → maç logu; tüm puan PTS'ten gelir."""
    out = []
    for pid, (gp, mpg, per36) in rows.items():
        for g in range(gp):
            rec = {k: 0.0 for k in PTS_WEIGHTS}
            rec.update({"PLAYER_ID": pid, "MIN": mpg, "PTS": per36 * mpg / 36})
            out.append(rec)
    return pd.DataFrame(out)


def _logs(per36_by_player, gp=60, mpg=30):
    seasons = ["2022-23", "2023-24", "2024-25", "2025-26"]
    return {s: _season({pid: (gp, mpg, vals[i]) for pid, vals in per36_by_player.items() if vals[i] is not None})
            for i, s in enumerate(seasons)}


def test_labels_follow_the_direction_and_threshold():
    logs = _logs({1: [30, 32, 34, 36],        # ~ +6.5%/sezon
                  2: [40, 40, 40, 40],        # düz
                  3: [40, 38, 36, 34],        # ~ −5%/sezon
                  4: [30, 30.3, 30.6, 30.9],  # +%1 → sabit
                  5: [None, None, None, 33]}) # tek sezon → etiketsiz
    t = tr.trend_table(logs, "2026-27").set_index("PLAYER_ID")
    assert t.loc[1, "TREND"] == "rising" and t.loc[1, "TREND_PCT"] > 4
    assert t.loc[2, "TREND"] == "steady" and abs(t.loc[2, "TREND_PCT"]) < 0.5
    assert t.loc[3, "TREND"] == "declining" and t.loc[3, "TREND_PCT"] < -4
    assert t.loc[4, "TREND"] == "steady"
    assert 5 not in t.index


def test_short_seasons_do_not_count():
    logs = _logs({1: [30, 32, 34, 36]}, gp=10, mpg=20)                                # 200 dk/sezon < 400
    assert tr.trend_table(logs, "2026-27").empty


def test_add_trends_merges_columns_and_replaces_old_trend_flags():
    logs = _logs({1: [30, 32, 34, 36], 2: [40, 40, 40, 40]})
    proj = pd.DataFrame({"PLAYER_ID": [1, 2, 9], "FLAGS": ["injury_risk,declining", "", None]})
    out = tr.add_trends(proj, logs, "2026-27")
    assert out["FLAGS"].tolist() == ["injury_risk,rising", "steady", ""]
    assert set(["TREND", "TREND_PCT", "TREND_SERIES"]) <= set(out.columns)
    assert out["TREND"].isna().tolist() == [False, False, True]
    again = tr.add_trends(out, logs, "2026-27")
    assert again["FLAGS"].tolist() == out["FLAGS"].tolist()                            # tekrar çalışınca bayrak çoğalmaz


LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"


@pytest.mark.skipif(not LIVE.exists(), reason="cache'lenmiş projeksiyon yok")
def test_api_exposes_trend_and_filters_on_it():
    from api import main as api_main
    api_main._RL.clear()
    r = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 300, "flag": "rising"}).json()
    assert r["matched"] > 20
    assert all(p["trend"] == "rising" and p["trend_pct"] >= 4 and "rising" in p["flags"] for p in r["players"])
    d = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 300, "flag": "declining"}).json()
    assert d["matched"] > 10 and all(p["trend_pct"] <= -4 for p in d["players"])
    top = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 1}).json()["players"][0]
    prof = client.get(f"/api/fantasy/players/{top['player_id']}", params={"format": "yahoo_h2h_9cat"}).json()
    assert prof["trend_series"] is None or all(isinstance(v, float) for v in prof["trend_series"].values())
    rookies = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 300, "flag": "rookie"}).json()["players"]
    assert all(p["trend"] is None for p in rookies)
