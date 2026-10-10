# -*- coding: utf-8 -*-
"""Ödül hattı mekaniği (çevrimdışı): oy tablosu ayrıştırma, slug çıkarma, ölçüt, hype'ın zaman sızıntısı olmaması."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())
sys.path.insert(0, (ROOT / "src").as_posix())

import fetch_awards as fa  # noqa: E402
from src.awards import mip_hype as mh  # noqa: E402
from src.awards import mip_model as mm  # noqa: E402

TABLE = """
<table id="mip"><thead><tr><th data-stat="rank">Rank</th></tr></thead><tbody>
<tr><th data-stat="rank">1</th><td data-stat="player" data-append-csv="daniedy01">Dyson Daniels</td><td data-stat="age">21</td>
<td data-stat="team_id">ATL</td><td data-stat="votes_first">44</td><td data-stat="points_won">332.0</td><td data-stat="points_max">500</td><td data-stat="award_share">0.664</td></tr>
<tr><th data-stat="rank">T2</th><td data-stat="player" data-append-csv="zubaciv01">Ivica Zubac</td><td data-stat="age">27</td>
<td data-stat="team_id">LAC</td><td data-stat="votes_first">23</td><td data-stat="points_won">186</td><td data-stat="points_max">500</td><td data-stat="award_share">0.372</td></tr>
<tr><th data-stat="rank"></th><td data-stat="player"></td></tr>
</tbody></table>"""


def test_award_table_is_parsed_with_slug_rank_and_winner_flag():
    t = BeautifulSoup(TABLE, "lxml").find("table", {"id": "mip"})
    df = fa._parse_award_table(t, "2024-25")
    assert list(df["PLAYER_NAME"]) == ["Dyson Daniels", "Ivica Zubac"]                      # boş satır atılır
    assert list(df["BREF_SLUG"]) == ["daniedy01", "zubaciv01"] and list(df["WINNER"]) == [1, 0]
    assert df.loc[0, "SHARE"] == pytest.approx(0.664) and df.loc[1, "RANK"] == "T2"


def test_draft_slug_comes_from_the_link_when_the_attribute_is_missing():
    cell = BeautifulSoup('<td data-stat="player"><a href="/players/d/doncilu01.html">Luka Doncic</a></td>', "lxml").td
    assert fa._slug_from_cell(cell) == "doncilu01"
    cell2 = BeautifulSoup('<td data-stat="player" data-append-csv="x01">A</td>', "lxml").td
    assert fa._slug_from_cell(cell2) == "x01"
    assert fa._slug_from_cell(BeautifulSoup('<td data-stat="player">No Link</td>', "lxml").td) is None


def test_season_labels_and_award_start_years():
    assert fa.season_label(2026) == "2025-26" and fa.season_label(1984) == "1983-84"
    assert fa.AWARD_START["mip"] == 1986 and fa.AWARD_START["clutch_poy"] == 2023


def _toy(n_seasons=12, n=60, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for t in range(2000, 2000 + n_seasons):
        for i in range(n):
            rows.append({"T": t, "pid": i, "L": rng.normal(), "LABELED": 1,
                         "RANK_N": float(i + 1) if i < 8 else np.nan, "SHARE": 0.0})
    d = pd.DataFrame(rows)
    for c in mh.H_FEATS:
        if c not in d.columns:
            d[c] = rng.normal(size=len(d))
    d["SEASONS"] = rng.integers(1, 6, len(d)).astype(float)
    d["VORP_pct"] = rng.random(len(d))
    return d


def test_finisher_hits_counts_top_n_finishers_in_the_models_top_k():
    d = pd.DataFrame({"T": [2020] * 6, "LABELED": 1, "S": [6, 5, 4, 3, 2, 1], "RANK_N": [np.nan, 1.0, np.nan, 3.0, 12.0, 2.0]})
    assert mm.finisher_hits(d, "S", range(2020, 2021), topn=10, k=4)[0] == 2           # ilk 4 tahmin: 1.0 ve 3.0 top-10
    assert mm.finisher_hits(d, "S", range(2020, 2021), topn=2, k=6)[0] == 2            # top-2 finisher: sıra 1 ve 2
    assert mm.finisher_hits(d, "S", range(2020, 2021), topn=10, k=6)[0] == 3           # 12. sıra sayılmaz


def test_hype_for_a_season_never_sees_that_season_or_later_outcomes():
    d = _toy()
    d["L_B2sh"] = d["L"]
    a = mh.hype_walk_forward(d.copy(), first=2004, last=2011)
    t = 2008
    b = d.copy()
    later = b["T"] >= t                                   # t ve sonrasının sonuçlarını alt üst et
    b.loc[later, "RANK_N"] = np.where(later[later], 999.0, np.nan)
    b.loc[later, "SHARE"] = 0.5
    r = mh.hype_walk_forward(b, first=2004, last=2011)
    ha = a.loc[a["T"] == t, "hype"].reset_index(drop=True)
    hb = r.loc[r["T"] == t, "hype"].reset_index(drop=True)
    pd.testing.assert_series_equal(ha, hb)                # t'nin hype'ı yalnız t'den ÖNCEKİ sonuçlara bağlı
    earlier = a.loc[a["T"] < t, "hype"].dropna().reset_index(drop=True)
    earlier_b = r.loc[r["T"] < t, "hype"].dropna().reset_index(drop=True)
    pd.testing.assert_series_equal(earlier, earlier_b)


def test_rerank_default_lambda_is_point_four_and_unknown_hype_goes_to_the_back():
    assert mh.DEFAULT_LAMBDA == 0.4
    d = pd.DataFrame({"L_B2sh": [1.0, 0.9, 0.8], "hype": [2.0, np.nan, -1.0]})
    s = mh.rerank(d)
    assert s.iloc[0] == pytest.approx(1.0 - 0.4 * 2.0) and s.iloc[2] == pytest.approx(0.8 + 0.4)
    assert s.iloc[1] < -90                                   # ilk-30 dışı: listenin arkasında
