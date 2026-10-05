# -*- coding: utf-8 -*-
"""Sıralamalar: sütuna göre sıralama (tüm havuzda, sayfalamadan önce)."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from api.main import app  # noqa: E402

client = TestClient(app)
LIVE = ROOT / "data" / "2026-27__fantasy_projections.parquet"
pytestmark = pytest.mark.skipif(not LIVE.exists(), reason="cache'lenmiş projeksiyon yok")


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from api import main as api_main
    api_main._RL.clear()
    yield


def _get(**params):
    r = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "limit": 300, **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_default_order_is_value_best_first_and_value_asc_reverses_it():
    d = _get()
    assert d["sort"] == "value" and d["direction"] == "desc"
    vals = [p["value_g"] for p in d["players"]]
    assert vals == sorted(vals, reverse=True)
    a = _get(sort="value", dir="asc")
    ranks = [p["rank"] for p in a["players"]]
    assert ranks[0] == a["total_players"] and ranks == sorted(ranks, reverse=True)       # havuzun SON oyuncusundan başlar


def test_sorts_the_whole_pool_not_just_the_loaded_page():
    top = _get(sort="cat:PTS", limit=5)["players"]
    pts = [p["categories"]["PTS"]["g"] for p in top]
    assert pts == sorted(pts, reverse=True)
    best = max(p["categories"]["PTS"]["g"] for p in _get()["players"])
    assert pts[0] == best                                       # 5'lik sayfa bile havuzun gerçek en iyisiyle başlar


def test_adp_defaults_to_ascending_and_directions_flip():
    d = _get(sort="adp")
    adps = [p["adp"] for p in d["players"] if p["adp"] is not None]
    assert d["direction"] == "asc" and adps == sorted(adps)
    r = _get(sort="adp", dir="desc")
    radps = [p["adp"] for p in r["players"] if p["adp"] is not None]
    assert radps == sorted(radps, reverse=True)
    gap = [p["adp_diff"] for p in _get(sort="adp_diff")["players"] if p["adp_diff"] is not None]
    assert gap == sorted(gap, reverse=True)                     # en büyük "bizim sıramız ADP'den iyi" önce


def test_sort_composes_with_filters_and_paging():
    first = _get(sort="games", limit=10, position="C")
    second = _get(sort="games", limit=10, offset=10, position="C")
    gp = [p["proj_gp"] for p in first["players"] + second["players"]]
    assert gp == sorted(gp, reverse=True)
    assert all("C" in p["eligible"] for p in first["players"])


def test_unknown_or_foreign_sort_keys_are_rejected():
    for bad in ("nope", "cat:XYZ"):
        assert client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "sort": bad}).status_code == 422
    # kategori anahtarı puan formatında geçersiz
    assert client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_points", "sort": "cat:PTS"}).status_code == 422
    assert client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_9cat", "dir": "sideways"}).status_code == 422


def test_points_and_high_score_columns_sort():
    p = client.get("/api/fantasy/rankings", params={"format": "yahoo_h2h_points", "sort": "fp_total", "limit": 40}).json()["players"]
    tot = [x["fp_total"] for x in p]
    assert tot == sorted(tot, reverse=True)
    h = client.get("/api/fantasy/rankings", params={"format": "yahoo_high_score", "sort": "ceiling", "limit": 40}).json()["players"]
    ci = [x["ceiling_index"] for x in h]
    assert ci == sorted(ci, reverse=True)
