# -*- coding: utf-8 -*-
"""Tüm planlar sıralı döner ve seçilen plan mock / öneri motoruna gerçekten uygulanır."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from api.main import app  # noqa: E402  (önce main: fantasy ↔ fantasy_draft döngüsel içe aktarma sırası)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Tek TestClient IP'si dakikada 120 istek sınırını doldurur; her test temiz sayaçla başlasın."""
    from api import main as api_main
    api_main._RL.clear()
    yield
needs_live = pytest.mark.skipif(not (ROOT / "data" / "2026-27__fantasy_projections.parquet").exists(),
                                reason="cache'lenmiş projeksiyon yok")


@needs_live
def test_categories_return_every_tried_plan_ranked_best_to_worst():
    j = client.get("/api/fantasy/draft/plans", params={"format": "yahoo_h2h_9cat", "teams": 12, "slot": 7}).json()
    keys = [p["key"] for p in j["plans"]]
    assert set(keys) == {"balanced", "punt_ft", "punt_fg", "punt_to", "punt_ast", "punt_3pm"}
    ranks = [p["expected_rank"] for p in j["plans"]]
    assert ranks == sorted(ranks)                             # en iyiden en kötüye
    assert j["plans"][0]["tied_with_best"] is True
    assert all(len(p["rounds"]) == 13 for p in j["plans"])


@needs_live
def test_plan_changes_what_the_mock_recommends():
    base = {"format": "yahoo_h2h_9cat", "slot": 7, "picks": [], "seed": 11, "n": 10}
    a = client.post("/api/fantasy/mock/advance", json={**base, "plan": "balanced"}).json()
    b = client.post("/api/fantasy/mock/advance", json={**base, "plan": "punt_ft"}).json()
    assert a["plan"] == {"key": "balanced", "label": "Balanced"} and b["plan"]["key"] == "punt_ft"
    # Aynı tohum aynı botlar: tek fark plan → öneri sırası değişmeli (punt FT% farklı oyuncuları öne çıkarır)
    ids_a = [r["player_id"] for r in a["recommendations"]]
    ids_b = [r["player_id"] for r in b["recommendations"]]
    assert ids_a != ids_b
    assert client.post("/api/fantasy/mock/advance", json={**base, "plan": "nope"}).status_code == 422


@needs_live
def test_value_plans_apply_a_score_in_points_formats():
    base = {"format": "yahoo_h2h_points", "slot": 5, "picks": [], "seed": 3, "n": 12}
    up = client.post("/api/fantasy/mock/advance", json={**base, "plan": "upside"}).json()
    lr = client.post("/api/fantasy/mock/advance", json={**base, "plan": "low_risk"}).json()
    assert up["plan"]["key"] == "upside" and lr["plan"]["key"] == "low_risk"
    assert [r["player_id"] for r in up["recommendations"]] != [r["player_id"] for r in lr["recommendations"]]
    # punt kategori dışı formatta yine reddedilir; plan anahtarı 9-cat'e özgü ise 422
    assert client.post("/api/fantasy/mock/advance", json={**base, "plan": "punt_ft"}).status_code == 422


@needs_live
def test_recommend_endpoint_accepts_plan():
    r = client.post("/api/fantasy/draft/recommend", json={"format": "yahoo_h2h_9cat", "slot": 7, "taken": [], "mine": [],
                                                           "current_pick": 7, "plan": "punt_ast", "n": 5})
    assert r.status_code == 200 and r.json()["plan"]["key"] == "punt_ast"


@needs_live
def test_same_screen_mock_stops_at_each_human_and_recommends_by_their_plan():
    base = {"format": "yahoo_h2h_9cat", "slot": 2, "humans": [2, 5, 9], "seed": 4, "n": 8,
            "plans": {"2": "balanced", "5": "punt_ft", "9": "punt_ast"}}
    m = client.post("/api/fantasy/mock/advance", json={**base, "picks": []}).json()
    # 1. tur: yalnız 1. sıradaki bot seçti, 2. sıra (insan) saatte
    assert len(m["picks"]) == 1 and m["on_the_clock"] == 2 and m["on_the_clock_slot"] == 2
    assert m["plan"]["key"] == "balanced" and m["humans"] == [2, 5, 9]
    picks = [p["player"]["player_id"] for p in m["picks"]]
    picks.append(m["recommendations"][0]["player_id"])
    m2 = client.post("/api/fantasy/mock/advance", json={**base, "picks": picks}).json()
    # 3. ve 4. sıra botlar, sonra 5. sıra: ikinci insan, kendi planıyla
    assert m2["on_the_clock_slot"] == 5 and m2["on_the_clock"] == 5 and m2["plan"]["key"] == "punt_ft"
    assert set(m2["human_rosters"]) == {"2", "5", "9"} and len(m2["human_rosters"]["2"]["roster"]) == 1
    assert m2["my_roster"] == m2["human_rosters"]["5"]["roster"]         # saatteki insanın kadrosu
    assert {"key": "punt_ast", "label": "Punt AST"} in m2["plan_options"]
    bad = client.post("/api/fantasy/mock/advance", json={**base, "humans": [3, 5], "picks": []})
    assert bad.status_code == 422                                          # kendi sırası humans içinde değil
    assert client.post("/api/fantasy/mock/advance", json={**base, "humans": [2, 99], "picks": []}).status_code == 422


@needs_live
def test_grade_league_rows_carry_letters():
    m = client.post("/api/fantasy/mock/advance", json={"format": "yahoo_h2h_9cat", "slot": 3, "picks": [], "seed": 2}).json()
    picks = [p["player"]["player_id"] for p in m["picks"]]
    while not m["done"]:
        picks.append(m["recommendations"][0]["player_id"])
        m = client.post("/api/fantasy/mock/advance", json={"format": "yahoo_h2h_9cat", "slot": 3, "picks": picks, "seed": 2}).json()
        picks = [p["player"]["player_id"] for p in m["picks"]]
    g = client.post("/api/fantasy/draft/grade", json={"format": "yahoo_h2h_9cat", "slot": 3, "picks": picks}).json()
    assert all("letter" in r for r in g["league"]) and g["league"][0]["letter"] in ("A+", "A", "A-")
