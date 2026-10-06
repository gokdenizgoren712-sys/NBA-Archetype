# -*- coding: utf-8 -*-
"""UI v3 futbol uçları: oyuncu profili (B8/B13/B16/B17/B18), career per-90 (B15),
best-XI birim çubukları ve en yakın gerçek 11 (B19/B20).

Gerçek skor parquet'leriyle çalışır (diğer futbol API testleriyle aynı); veritabanına
yazmaz, yalnız okur.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

DATA = ROOT / "data"
FILES = sorted(DATA.glob("football__*__scores.parquet"))
pytestmark = pytest.mark.skipif(not FILES, reason="futbol skor verisi yok")


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def latest():
    season = FILES[-1].name.split("__")[1]
    return season, pd.read_parquet(FILES[-1])


def _strict(resp):
    """NaN/Infinity sızarsa patla: JSON standardı bunları taşımıyor."""
    def bad(c):
        raise AssertionError(f"yanıtta {c} var")
    return json.loads(resp.text, parse_constant=bad)


def _top(df, phase):
    d = df[(df["PHASE"] == phase) & df["primary_arch"].notna()]
    return int(d.sort_values("MINUTES_TOTAL").iloc[-1]["PLAYER_ID"])


# ── B8 / B13 ────────────────────────────────────────────────────────────────
def test_player_payload_matches_a_list_entry_and_adds_rank(client, latest):
    season, df = latest
    pid = _top(df, "fwd")
    one = _strict(client.get(f"/api/football/players/{pid}"))
    lst = _strict(client.get("/api/football/players",
                             params={"season": season, "limit": 800}))["players"]
    entry = next(p for p in lst if p["PLAYER_ID"] == pid and p["MINUTES_TOTAL"] == one["MINUTES_TOTAL"])
    for k, v in entry.items():
        assert one[k] == v, f"{k}: tek oyuncu uçu liste satırından ayrıldı"
    assert one["season"] == season


def test_rank_is_one_based_within_the_phase_pool(client, latest):
    season, df = latest
    pid = _top(df, "def")
    j = _strict(client.get(f"/api/football/players/{pid}"))
    ph = df[df["PHASE"] == "def"]["overall_score"].dropna()
    assert j["pool"] == len(ph)
    assert j["rank"] == int((ph > j["overall_score"]).sum()) + 1
    assert 1 <= j["rank"] <= j["pool"]
    best = df[df["PHASE"] == "def"].dropna(subset=["overall_score"]).sort_values("overall_score").iloc[-1]
    top = _strict(client.get(f"/api/football/players/{int(best['PLAYER_ID'])}"))
    assert top["rank"] == 1


def test_unknown_player_is_404_on_the_new_endpoints(client):
    # /career dönmeye devam ediyor: boş liste (mevcut istemci buna güveniyor).
    for path in ("", "/similar"):
        r = client.get(f"/api/football/players/999999999{path}")
        assert r.status_code == 404, path


def test_unknown_season_for_a_real_player_is_404(client, latest):
    pid = _top(latest[1], "fwd")
    assert client.get(f"/api/football/players/{pid}", params={"season": "1999-2000"}).status_code == 404


def test_default_season_is_the_latest_one_that_has_the_player(client):
    # Yalnız eski bir sezonda olan oyuncu: 404 değil, o sezon.
    seasons = [(f.name.split("__")[1], pd.read_parquet(f, columns=["PLAYER_ID"])) for f in FILES]
    last_ids = set(seasons[-1][1]["PLAYER_ID"])
    for s, ids in seasons[:-1][::-1]:
        gone = set(ids["PLAYER_ID"]) - last_ids
        if gone:
            pid = int(next(iter(gone)))
            j = _strict(client.get(f"/api/football/players/{pid}"))
            assert j["season"] != seasons[-1][0]
            return
    pytest.skip("her oyuncu son sezonda da var")


def test_one_season_player_has_a_single_career_row_and_a_profile(client):
    counts = {}
    for f in FILES:
        for pid in pd.read_parquet(f, columns=["PLAYER_ID"])["PLAYER_ID"].unique():
            counts[pid] = counts.get(pid, 0) + 1
    one = next((int(p) for p, n in counts.items() if n == 1), None)
    if one is None:
        pytest.skip("tek sezonluk oyuncu yok")
    assert client.get(f"/api/football/players/{one}").status_code == 200
    assert len(_strict(client.get(f"/api/football/players/{one}/career"))["seasons"]) >= 1


def test_the_row_with_most_minutes_wins_when_a_season_has_several(client, latest):
    season, df = latest
    dup = df[df.duplicated("PLAYER_ID", keep=False)]
    if dup.empty:
        pytest.skip("çift satırlı oyuncu yok")
    spread = dup.groupby("PLAYER_ID")["MINUTES_TOTAL"].agg(lambda x: x.max() - x.min())
    spread = spread[spread > 0]
    if spread.empty:
        pytest.skip("dakikaları farklı çift satır yok")
    pid = int(spread.index[0])
    want = dup[dup["PLAYER_ID"] == pid]["MINUTES_TOTAL"].max()
    got = _strict(client.get(f"/api/football/players/{pid}", params={"season": season}))
    assert got["MINUTES_TOTAL"] == want


# ── B16 / B17 ───────────────────────────────────────────────────────────────
EXPECT_KEYS = {
    "GK": {"shot_stopping", "goals_prevented", "distribution", "claiming", "sweeping"},
    "CB": {"tackling", "interceptions", "aerial_duels", "clearances", "progression"},
    "W": {"dribbling", "chance_creation", "crossing", "aerial_duels", "pressing"},
}


@pytest.mark.parametrize("pos", ["GK", "CB", "W"])
def test_role_profile_fits_the_position(client, latest, pos):
    _, df = latest
    d = df[(df["POSITION"] == pos) & df["primary_arch"].notna()]
    pid = int(d.sort_values("MINUTES_TOTAL").iloc[-1]["PLAYER_ID"])
    j = _strict(client.get(f"/api/football/players/{pid}"))
    got = {i["key"] for i in j["role_profile"]}
    assert got == EXPECT_KEYS[pos], f"{pos}: {got}"
    for i in j["role_profile"]:
        assert isinstance(i["pct"], int) and 0 <= i["pct"] <= 100
        assert i["label"] and i["short"] and i["unit"] in ("per_90", "ratio")
    assert j["peer_group"].startswith("vs ") and "·" in j["peer_group"]


def test_peer_group_caption_names_position_league_and_season(client, latest):
    _, df = latest
    d = df[(df["POSITION"] == "W") & (df["LEAGUE"] == "bundesliga") & df["primary_arch"].notna()]
    pid = int(d.sort_values("MINUTES_TOTAL").iloc[-1]["PLAYER_ID"])
    j = _strict(client.get(f"/api/football/players/{pid}"))
    assert j["peer_group"] == "vs wingers · Bundesliga · " + j["season"][:4] + "-" + j["season"][-2:]


def test_percentile_is_computed_against_same_league_and_position_only():
    from football import profile as P
    df = pd.DataFrame({
        "LEAGUE": ["a"] * 10 + ["b"] * 10, "SEASON": ["2025-2026"] * 20,
        "POSITION": ["W"] * 20, "PHASE": ["fwd"] * 20, "qualified": [True] * 20,
        "dribbles_succeeded_90": list(range(10)) + [100 + i for i in range(10)],
    })
    row = df.iloc[9]                      # lig a'nın en iyisi, b'nin en düşüğünden küçük
    out = P.role_profile(df, row)
    drib = next(i for i in out["role_profile"] if i["key"] == "dribbling")
    assert drib["pct"] == 95, "başka ligin oyuncuları persantile karıştı"


def test_description_is_deterministic_and_matches_the_profile(client, latest):
    pid = _top(latest[1], "fwd")
    a = _strict(client.get(f"/api/football/players/{pid}"))
    b = _strict(client.get(f"/api/football/players/{pid}"))
    assert a["description"] == b["description"]
    d = a["description"]
    assert set(d) == {"headline", "summary", "evidence", "confidence_note", "updated_at"}
    by_label = {i["short"]: i for i in a["role_profile"]}
    assert 1 <= len(d["evidence"]) <= 3
    for e in d["evidence"]:
        assert by_label[e["label"]]["pct"] == e["pct"] and by_label[e["label"]]["value"] == e["value"]
    pcts = [e["pct"] for e in d["evidence"]]
    assert pcts == sorted(pcts, reverse=True)
    assert d["updated_at"] and len(d["updated_at"]) == 10


@pytest.mark.parametrize("minutes,needle", [
    (3405, "Played 3,405 minutes, so the read is solid."),
    (1500, "a fair sample"), (800, "indicative"), (200, "Only 200 minutes"),
    (None, "nothing to read"), (float("nan"), "nothing to read"),
])
def test_confidence_note_is_driven_by_minutes(minutes, needle):
    from football import profile as P
    assert needle in P.confidence_note(minutes)


# ── B15 ─────────────────────────────────────────────────────────────────────
def test_career_rows_carry_per_90_columns(client, latest):
    pid = _top(latest[1], "fwd")
    j = _strict(client.get(f"/api/football/players/{pid}/career"))
    assert j["per_90"] == ["goals_90", "assists_90", "xg_xa_90", "dribbles_90", "crosses_90"]
    row = j["seasons"][0]
    for k in j["per_90"] + ["MINUTES_TOTAL", "SEASON", "TEAM", "primary_arch"]:
        assert k in row
    assert any(r["xg_xa_90"] is not None for r in j["seasons"])


# ── B18 ─────────────────────────────────────────────────────────────────────
def test_similar_players_same_phase_sorted_and_excludes_self(client, latest):
    season, df = latest
    pid = _top(df, "mid")
    sim = _strict(client.get(f"/api/football/players/{pid}/similar", params={"limit": 5}))
    assert isinstance(sim, list) and len(sim) == 5
    phase_of = df.drop_duplicates("PLAYER_ID").set_index("PLAYER_ID")["PHASE"]
    assert all(s["player_id"] != pid for s in sim)
    assert {phase_of[s["player_id"]] for s in sim} == {"mid"}
    m = [s["match_pct"] for s in sim]
    assert m == sorted(m, reverse=True) and all(isinstance(x, int) and 0 <= x <= 100 for x in m)
    assert set(sim[0]) == {"player_id", "name", "primary_arch", "match_pct"}
    assert len({s["player_id"] for s in sim}) == 5


def test_similar_default_limit_is_three_and_limit_is_bounded(client, latest):
    pid = _top(latest[1], "gk")
    assert len(_strict(client.get(f"/api/football/players/{pid}/similar"))) == 3
    assert client.get(f"/api/football/players/{pid}/similar", params={"limit": 0}).status_code == 422
    assert client.get(f"/api/football/players/{pid}/similar", params={"limit": 99}).status_code == 422


def test_a_clone_scores_one_hundred():
    from football import profile as P
    cols = ["score_A", "score_B", "score_C"]
    df = pd.DataFrame({"PLAYER_ID": [1, 2, 3], "PLAYER_NAME": ["a", "b", "c"], "PHASE": ["mid"] * 3,
                       "primary_arch": ["A", "A", "C"], "MINUTES_TOTAL": [900, 900, 900],
                       "score_A": [0.9, 0.9, 0.1], "score_B": [0.2, 0.2, 0.2], "score_C": [0.1, 0.1, 0.9]})
    out = P.similar_players(df, df.iloc[0], 2)
    assert out[0]["player_id"] == 2 and out[0]["match_pct"] == 100
    assert out[1]["match_pct"] == 0, "zıt biçim negatif kosinüs → 0'a kırpılmalı"


# ── B20 / B19 ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def best(client):
    return _strict(client.get("/api/football/best-xi"))


def test_best_xi_has_unit_bars_in_unit_range(best):
    u = best["fit"]["units"]
    assert set(u) == {"goalkeeper", "defence", "midfield", "attack"}
    assert all(v is not None and 0.0 <= v <= 1.0 for v in u.values())
    assert best["goalkeeper"]["overall_score"] == pytest.approx(u["goalkeeper"], abs=1e-3)


def test_best_xi_keeps_its_existing_fit_fields(best):
    for k in ("score", "slots", "pairs", "shape", "diversity", "slot_scores", "reference"):
        assert k in best["fit"]


def test_unit_formula_agrees_with_lineup_fit_slots():
    """Tüm oyuncular tek fazda ise birim işleri lineup_fit'in slot skoruyla birebir aynı."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("aff_t", ROOT / "src" / "football" / "affinity.py")
    aff = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(aff)
    rows = [{"PHASE": "fwd", "primary_arch": a, "primary_score": 0.8}
            for a in ["Poacher", "Touchline Winger", "Creator", "Complete Forward", "Pressing Forward",
                      "Take-On Merchant", "Inside Forward", "Target Man", "Late Runner", "Mezzala"]]
    fit = aff.lineup_fit(rows)
    for job in ("Finishing", "Width", "Chance creation"):
        assert aff._job_value(rows, job) == pytest.approx(fit["slot_scores"][job], abs=1e-3)


def test_units_for_a_lopsided_xi_show_the_weak_line():
    import importlib.util
    spec = importlib.util.spec_from_file_location("aff_u", ROOT / "src" / "football" / "affinity.py")
    aff = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(aff)
    rows = ([{"PHASE": "fwd", "primary_arch": a, "primary_score": 0.9}
             for a in ("Poacher", "Creator", "Touchline Winger")]
            + [{"PHASE": "def", "primary_arch": "Defensive Fullback", "primary_score": 0.5}] * 2)
    u = aff.unit_bars(rows, {"overall_score": 0.7})
    assert u["attack"] > u["defence"] > u["midfield"] == 0.0
    assert u["goalkeeper"] == 0.7
    assert aff.unit_bars(rows)["goalkeeper"] is None, "kaleci yokken değer uydurulmamalı"


def test_closest_real_is_a_real_team_from_the_same_season(best):
    c = best["closest_real"]
    assert c is not None
    assert set(c) >= {"team", "season", "match_pct", "reason"}
    assert 0 <= c["match_pct"] <= 100 and isinstance(c["match_pct"], int)
    n = int(c["reason"].split(" in ")[1].split(" of ")[0])
    assert c["match_pct"] == round(100 * n / 11) and c["reason"].endswith("of 11 slots.")
    real = pd.read_parquet(DATA / f"football__{best['season']}__real_xi.parquet")
    assert c["team"] in set(real["team"])


def test_closest_real_picks_the_best_overlap():
    import importlib.util
    spec = importlib.util.spec_from_file_location("aff_c", ROOT / "src" / "football" / "affinity.py")
    aff = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(aff)
    base = ["Shot Stopper"] + ["Stopper"] * 4 + ["Regista"] * 3 + ["Poacher"] * 3
    other = ["Shot Stopper"] + ["Stopper"] * 2 + ["Creator"] * 8
    real = pd.DataFrame({
        "team": ["Far", "Near"], "season": ["2025-2026"] * 2, "formation": ["4-3-3"] * 2,
        "known_players": [11, 11], "chemistry": [0.9, 0.5], "match_id": ["1", "2"],
        "archetypes": [json.dumps(other), json.dumps(base[:10] + ["Creator"])],
    })
    got = aff.closest_real(base, real, "4-3-3")
    assert got["team"] == "Near" and got["match_pct"] == round(100 * 10 / 11)
    assert aff.closest_real(base, None) is None


def test_lineup_fit_returns_units_for_a_hand_built_xi(client, latest):
    _, df = latest
    d = df[df["primary_arch"].notna() & df["qualified"].fillna(False)]
    ids = []
    for ph, n in (("gk", 1), ("def", 4), ("mid", 3), ("fwd", 3)):
        ids += [int(x) for x in d[d["PHASE"] == ph].sort_values("overall_score").tail(n)["PLAYER_ID"]]
    j = _strict(client.post("/api/football/lineup-fit", json={"player_ids": ids}))
    assert set(j["units"]) == {"goalkeeper", "defence", "midfield", "attack"}
    assert j["units"]["goalkeeper"] is not None
    assert "score" in j and "slots" in j


def test_similar_never_returns_another_phase_even_with_an_identical_vector():
    from football import profile as P
    df = pd.DataFrame({
        "PLAYER_ID": [1, 2, 3], "PLAYER_NAME": ["a", "b", "c"], "PHASE": ["mid", "fwd", "mid"],
        "primary_arch": ["A", "A", "C"], "MINUTES_TOTAL": [900, 900, 900],
        "score_A": [0.9, 0.9, 0.1], "score_C": [0.1, 0.1, 0.9]})
    out = P.similar_players(df, df.iloc[0], 5)
    assert [o["player_id"] for o in out] == [3], "başka fazın kopyası listeye girdi"


def test_closest_real_without_a_keeper_compares_outfield_only():
    import importlib.util
    spec = importlib.util.spec_from_file_location("aff_d", ROOT / "src" / "football" / "affinity.py")
    aff = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(aff)
    outfield = ["Stopper"] * 4 + ["Regista"] * 3 + ["Poacher"] * 3
    real = pd.DataFrame({
        "team": ["T"], "season": ["2025-2026"], "formation": ["4-3-3"], "known_players": [11],
        "chemistry": [0.5], "match_id": ["1"],
        "archetypes": [json.dumps(["Shot Stopper"] + outfield)]})
    got = aff.closest_real(outfield, real, "4-3-3")
    assert got["match_pct"] == 100 and got["reason"] == "Same shape of roles in 10 of 10 slots."


def test_best_xi_goalkeeper_is_the_top_rated_one_in_the_pool(best, latest):
    _, df = latest
    d = df[df["primary_arch"].notna() & df["qualified"].fillna(False) & (df["PHASE"] == "gk")]
    assert best["goalkeeper"]["overall_score"] == pytest.approx(float(d["overall_score"].max()))
