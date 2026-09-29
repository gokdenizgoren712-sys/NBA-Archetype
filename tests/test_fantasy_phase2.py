# -*- coding: utf-8 -*-
"""Fantezi Faz 2: draft motoru ve draft API'si.

Sabitlenen davranışlar:
  - Snake sırası (12 takım, 7. sıra → 7, 18, 31, 42 …) ve pick sahibi.
  - Kadro doldurulabilirliği: hızlı (maskeli, önbellekli) eşleştirme, yavaş
    genel sürümle birebir aynı sonucu verir; botlar ve kullanıcı hiçbir zaman
    starter slotu boş kalacak bir kadroya sürüklenmez.
  - Öneri alınmış oyuncuyu asla önermez; punt edilen kategoriyi "boost" diye göstermez.
  - Plan sonuçları beklenen sıraya göre sıralı, gürültü içindeki farklar "berabere".
  - API: mock draft durumsuz ve tohumla tekrarlanabilir, tam draft biter;
    hatalı girdi 422; kayıtlı draftlar yalnız sahibine görünür, hesap silinince gider.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DB_PATH", str(Path(tempfile.mkdtemp(prefix="fantasy_p2_")) / "t.db"))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402

CATS = ["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"]
ELIG_CYCLE = ["PG", "PG,SG", "SG", "SG,SF", "SF", "SF,PF", "PF", "PF,C", "C", "C"]


def _board(kind="categories", n=120, teams=6, seed=1):
    rng = np.random.default_rng(seed)
    value = np.sort(rng.normal(0, 2, n))[::-1]
    df = pd.DataFrame({
        "PLAYER_ID": np.arange(1000, 1000 + n), "PLAYER_NAME": [f"P{i}" for i in range(n)],
        "TEAM": "AAA", "ARCHETYPE": None, "FLAGS": "",
        "ELIGIBLE": [ELIG_CYCLE[i % len(ELIG_CYCLE)] for i in range(n)],
        "VALUE": value, "RANK": np.arange(1, n + 1),
        "ADP": np.arange(1, n + 1) + rng.normal(0, 3, n), "ADP_SD": 0.12 * np.arange(1, n + 1) + 2,
        "FP_RATIO_P10": 0.7, "FP_RATIO_P90": 1.25, "PROJ_GP": 70.0, "GP_P10": 45.0, "GP_P90": 80.0,
        "FP_TOTAL": 2000 + value * 300, "HS_WEEK_AVG": 40 + value * 3,
    })
    for j, c in enumerate(CATS):
        g = value / 3 + rng.normal(0, 0.6, n)
        df[f"G_{c}"] = g
        df[f"Z_{c}"] = g * 1.3
        df[f"GA_{c}"] = np.abs(g) + 1
        df[f"ZA_{c}"] = np.abs(g) * 1.3 + 1
    fmt = get_format("yahoo_h2h_9cat" if kind == "categories" else "yahoo_h2h_points", teams=teams)
    return dr.make_board(df, fmt)


# ── Snake ────────────────────────────────────────────────────────────────────

def test_snake_picks_and_owner():
    assert dr.snake_picks(12, 4, 7) == [7, 18, 31, 42]
    assert dr.snake_picks(12, 3, 12) == [12, 13, 36]
    for slot in range(1, 13):
        for overall in dr.snake_picks(12, 13, slot):
            assert dr.pick_owner(overall, 12) == slot
    with pytest.raises(ValueError):
        dr.snake_picks(12, 13, 13)


# ── Kadro doldurulabilirliği ─────────────────────────────────────────────────

SLOTS = ["PG", "SG", "G", "SF", "PF", "F", "C", "C", "Util", "Util"]


def test_matching_counts_util_and_unknown_positions():
    three_centers = [("C",), ("C",), ("C",)]
    assert dr.max_filled(three_centers, ["PG", "C", "C", "Util"]) == 3
    assert dr.max_filled([(), ()], ["PG", "Util"]) == 1          # pozisyonu bilinmeyen yalnız Util'e


def test_fast_matching_equals_generic_matching():
    rng = np.random.default_rng(0)
    pool = [tuple(e.split(",")) for e in ELIG_CYCLE] + [()]
    for _ in range(300):
        roster = [pool[i] for i in rng.integers(0, len(pool), rng.integers(1, 14))]
        masks = tuple(sorted(dr.slot_mask(e, SLOTS) for e in roster))
        assert dr._max_filled_masks(masks, len(SLOTS)) == dr.max_filled(roster, SLOTS)


def test_lineup_assignment_is_valid():
    roster = [("PG",), ("PG", "SG"), ("C",), ("SF", "PF"), ("C",), ("PF", "C"), ("SG", "SF"), ("PG",)]
    masks = [dr.slot_mask(e, SLOTS) for e in roster]
    slots, bench = dr.lineup_assignment(masks, len(SLOTS))
    used = [p for p in slots if p is not None]
    assert len(used) == len(set(used)) == dr.max_filled(roster, SLOTS)
    for s, p in enumerate(slots):
        if p is not None:
            assert masks[p] >> s & 1
    assert sorted(used + bench) == list(range(len(roster)))


def test_simulated_rosters_always_fill_every_starter_slot():
    b = _board()
    rosters = dr.simulate_draft(b, 3, {"punt": ()}, np.random.default_rng(5), dr.mixed_bot_styles(b.teams, 3))
    all_ids = [p for r in rosters.values() for p in r]
    assert len(all_ids) == len(set(all_ids)) == b.total_picks
    for r in rosters.values():
        assert len(r) == b.rounds
        assert dr.max_filled([b.elig[b.row[p]] for p in r], b.slots) == len(b.slots)


# ── Öneri ve değerlendirme ───────────────────────────────────────────────────

def test_recommend_skips_taken_and_respects_punt():
    b = _board()
    taken = set(int(x) for x in b.ids[:5])
    mine = [int(b.ids[5])]
    rec = dr.recommend(b, taken, mine, current_pick=8, slot=4, punt=("FT%",), n=8)
    ids = [r["player_id"] for r in rec["recommendations"]]
    assert not (set(ids) & (taken | set(mine)))
    assert all("FT%" not in r["boosts"] for r in rec["recommendations"])
    assert all(0 <= r["available_next_pick"] <= 1 for r in rec["recommendations"])


def test_availability_edges():
    b = _board()
    best = int(np.argmin(b.adp))
    assert dr.availability(b, set(), [best], 0)[0] == 1.0
    assert dr.availability(b, set(), [best], 30)[0] < 0.05


def test_poisson_binomial_majority():
    assert dr._poisson_binomial_win(np.full(9, 0.5)) == pytest.approx(0.5)
    assert dr._poisson_binomial_win(np.ones(9)) == pytest.approx(1.0)
    assert dr._poisson_binomial_win(np.array([1.0, 0.0])) == pytest.approx(0.5)   # beraberlik yarım


def test_letter_grade_ends():
    assert dr.letter_grade(1, 12) == "A+"
    assert dr.letter_grade(12, 12) == "D"


@pytest.mark.parametrize("kind", ["categories", "points"])
def test_plans_are_sorted_by_expected_rank_with_tie_flags(kind):
    b = _board(kind)
    out = dr.draft_plans(b, 2, sims=6, seed=1)
    ranks = [p["expected_rank"] for p in out["plans"]]
    assert ranks == sorted(ranks)
    assert out["plans"][0]["tied_with_best"] is True
    assert out["picks"] == dr.snake_picks(b.teams, b.rounds, 2)
    assert all(len(p["rounds"]) == b.rounds for p in out["plans"])


# ── API ─────────────────────────────────────────────────────────────────────

PROJ_FILE = ROOT / "data" / "2026-27__fantasy_projections.parquet"


@pytest.fixture(scope="module")
def client():
    if not PROJ_FILE.exists():
        pytest.skip("fantasy artefacts not built")
    from fastapi.testclient import TestClient
    from api.main import app
    return TestClient(app)


def _mock_to_end(client, seed, slot=7):
    picks = []
    while True:
        r = client.post("/api/fantasy/mock/advance",
                        json={"format": "yahoo_h2h_9cat", "slot": slot, "picks": picks, "seed": seed})
        assert r.status_code == 200, r.text
        j = r.json()
        picks = [p["player"]["player_id"] for p in j["picks"]]
        if j["done"]:
            return picks, j
        assert j["on_the_clock"] == len(picks) + 1
        picks.append(j["recommendations"][0]["player_id"])


def test_mock_draft_completes_and_is_reproducible(client):
    picks, last = _mock_to_end(client, seed=11)
    assert len(picks) == len(set(picks)) == 12 * 13
    assert all(s["player_id"] is not None for s in last["lineup"]["starters"])
    again = client.post("/api/fantasy/mock/advance",
                        json={"format": "yahoo_h2h_9cat", "slot": 7, "picks": [], "seed": 11}).json()
    assert [p["player"]["player_id"] for p in again["picks"]] == picks[:6]


def test_grade_contract(client):
    picks, _ = _mock_to_end(client, seed=3)
    r = client.post("/api/fantasy/draft/grade", json={"format": "yahoo_h2h_9cat", "slot": 7, "picks": picks})
    assert r.status_code == 200
    g = r.json()
    assert g["grade"] in {grade for _, grade in dr.GRADES}
    assert len(g["league"]) == 12 and {"rank_mean", "top_half_prob", "first_place_prob"} <= set(g["me"])
    assert client.post("/api/fantasy/draft/grade", json={"slot": 7, "picks": picks[:20]}).status_code == 422


@pytest.mark.parametrize("body", [
    {"slot": 13},
    {"slot": 3, "taken": [1]},
    {"slot": 3, "taken": [203999], "mine": [203999]},
    {"slot": 3, "format": "yahoo_h2h_points", "punt": ["TO"]},
    {"slot": 3, "punt": ["DUNKS"]},
])
def test_recommend_rejects_bad_input(client, body):
    assert client.post("/api/fantasy/draft/recommend", json=body).status_code == 422


def test_plans_endpoint_precomputed_and_custom(client):
    r = client.get("/api/fantasy/draft/plans?format=yahoo_h2h_points&teams=10&slot=1")
    assert r.status_code == 200
    j = r.json()
    assert len(j["plans"]) == 3 and j["picks"][:2] == [1, 20]
    tid = str(j["plans"][0]["rounds"][0]["targets"][0]["player_id"])
    assert "name" in j["players"][tid]
    assert client.get("/api/fantasy/draft/plans?slot=15&teams=12").status_code == 422


@pytest.fixture(scope="module")
def users():
    from api.auth import create_token
    from api.db import get_conn
    out = []
    with get_conn() as conn:
        for name in ("fantasy_p2_a", "fantasy_p2_b"):
            conn.execute("DELETE FROM users WHERE username=?", (name,))
            uid = conn.execute("INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
                               (name, f"{name}@test.invalid", "x")).lastrowid
            out.append((uid, {"Authorization": "Bearer " + create_token(uid, "user")}))
    return out


def test_saved_drafts_are_private_and_bounded(client, users):
    (uid_a, ha), (_, hb) = users
    body = {"kind": "mock", "name": "Slot 7", "format": "yahoo_h2h_9cat", "slot": 7, "state": {"picks": [1, 2]}}
    assert client.post("/api/fantasy/drafts", json=body).status_code == 401
    r = client.post("/api/fantasy/drafts", json=body, headers=ha)
    assert r.status_code == 201
    did = r.json()["id"]
    assert [d["id"] for d in client.get("/api/fantasy/drafts", headers=ha).json()["drafts"]] == [did]
    assert client.get("/api/fantasy/drafts", headers=hb).json()["drafts"] == []
    assert client.get(f"/api/fantasy/drafts/{did}", headers=hb).status_code == 404
    assert client.delete(f"/api/fantasy/drafts/{did}", headers=hb).status_code == 404
    assert client.put(f"/api/fantasy/drafts/{did}", json={"name": "Mine"}, headers=ha).json()["name"] == "Mine"
    big = {**body, "state": {"x": "a" * 70_000}}
    assert client.post("/api/fantasy/drafts", json=big, headers=ha).status_code == 413
    assert client.post("/api/fantasy/drafts", json={**body, "kind": "other"}, headers=ha).status_code == 422


def test_account_deletion_removes_saved_drafts(client, users):
    from api.db import get_conn
    uid, h = users[0]
    client.post("/api/fantasy/drafts", headers=h,
                json={"kind": "assistant", "name": "Live", "format": "yahoo_h2h_9cat", "state": {}})
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (uid,))
        left = conn.execute("SELECT COUNT(*) FROM fantasy_drafts WHERE user_id=?", (uid,)).fetchone()[0]
    assert left == 0


# ── Frontend entegrasyonu için eklenen alanlar (2026-09-29) ─────────────────

def test_z_metric_resorts_the_whole_pool(client):
    body = client.get("/api/fantasy/rankings?metric=z&limit=60").json()
    vals = [p["value_z"] for p in body["players"]]
    assert body["metric"] == "value_z"
    assert vals == sorted(vals, reverse=True)
    assert [p["rank"] for p in body["players"]] == list(range(1, 61))


def test_value_ranges_bracket_the_point_estimate(client):
    cats = client.get("/api/fantasy/rankings?limit=30").json()["players"]
    for p in cats:
        lo, hi = p["value_g_range"]
        assert lo <= p["value_g"] + 1e-6 and p["value_g"] <= hi + 1e-6
    pts = client.get("/api/fantasy/rankings?format=yahoo_h2h_points&limit=30").json()["players"]
    for p in pts:
        lo, hi = p["fp_total_range"]
        assert lo <= p["fp_total"] <= hi


def test_custom_format_player_profile(client):
    fmt = {"kind": "points", "teams": 10, "weights": {"PTS": 1, "REB": 1, "AST": 1},
           "roster": {"starters": ["PG", "SG", "SF", "PF", "C"], "bench": 3, "il": 1}}
    pid = client.get("/api/fantasy/rankings?limit=1").json()["players"][0]["player_id"]
    r = client.post(f"/api/fantasy/players/{pid}", json={"format": fmt})
    assert r.status_code == 200
    p = r.json()["player"]
    pg = p["per_game"]
    assert p["fp_game"] == pytest.approx(pg["pts"] + pg["reb"] + pg["ast"], abs=0.05)
    assert client.post(f"/api/fantasy/players/{pid}", json={"format": {**fmt, "teams": 40}}).status_code == 422


def test_grade_has_rank_distribution_and_playoff_odds(client):
    picks, _ = _mock_to_end(client, seed=5)
    me = client.post("/api/fantasy/draft/grade", json={"slot": 7, "picks": picks}).json()["me"]
    assert len(me["rank_dist"]) == 12 and sum(me["rank_dist"]) == pytest.approx(1, abs=0.01)
    assert 0 <= me["playoff_prob"] <= 1
    assert set(me["category_rank"]) == {"FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"}


def test_plan_targets_carry_availability(client):
    plans = client.get("/api/fantasy/draft/plans?format=yahoo_h2h_9cat&teams=12&slot=7").json()["plans"]
    for pl in plans:
        for r in pl["rounds"]:
            for t in r["targets"]:
                assert 0 <= t["available"] <= 1
    # Birinci turda senin pickin 7: listenin tepesindeki oyuncunun kalma şansı düşük olmalı
    assert plans[0]["rounds"][0]["targets"][0]["available"] < 1
