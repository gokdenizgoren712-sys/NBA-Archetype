# -*- coding: utf-8 -*-
"""Öneri güven düzeyi (strategy_validation): kanıtlanmamış formatlarda öneri VERİLİR, uyarı eklenir."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.main import app  # noqa: E402  (önce main: fantasy ↔ fantasy_draft döngüsel içe aktarma sırası)
from api.fantasy_draft import strategy_validation  # noqa: E402
from config.fantasy_formats import get_format  # noqa: E402

client = TestClient(app)


def test_h2h_categories_is_validated_others_are_flagged():
    assert strategy_validation(get_format("yahoo_h2h_9cat"))["status"] == "validated"
    assert strategy_validation(get_format("yahoo_h2h_8cat"))["status"] == "validated"
    for key in ("yahoo_h2h_points", "yahoo_high_score", "yahoo_roto_9cat"):
        v = strategy_validation(get_format(key))
        assert v["status"] == "unvalidated" and v["title"] and v["body"]


@pytest.mark.parametrize("key,status", [("yahoo_h2h_9cat", "validated"), ("yahoo_h2h_points", "unvalidated")])
def test_plans_carry_validation_and_still_recommend(key, status):
    r = client.get("/api/fantasy/draft/plans", params={"format": key, "slot": 5})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["validation"]["status"] == status
    assert len(body["plans"]) >= 1                      # uyarı öneriyi engellemez


def test_recommend_and_mock_carry_validation_for_points():
    body = {"format": "yahoo_h2h_points", "taken": [], "mine": [], "current_pick": 1, "slot": 1}
    r = client.post("/api/fantasy/draft/recommend", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["validation"]["status"] == "unvalidated" and r.json()["recommendations"]
    m = client.post("/api/fantasy/mock/advance", json={"format": "yahoo_h2h_points", "slot": 3, "picks": [], "seed": 1})
    assert m.status_code == 200, m.text
    assert m.json()["validation"]["status"] == "unvalidated" and m.json()["recommendations"]
