# -*- coding: utf-8 -*-
"""Yahoo referans verisi (config/reference/): yükleyici, ADP güvenilirliği, piyasa modelinde kullanımı."""

import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import reference as ref  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402


def test_norm_name_handles_accents_suffixes_and_punctuation():
    assert ref.norm_name("Nikola Jokić") == ref.norm_name("Nikola Jokic")
    assert ref.norm_name("Jaren Jackson Jr.") == ref.norm_name("Jaren Jackson")
    assert ref.norm_name("Trey Murphy III") == "trey murphy"
    assert ref.norm_name("Nickeil Alexander-Walker") == "nickeil alexander walker"
    assert ref.norm_name("Kristaps Porziņģis") == ref.norm_name("Kristaps Porzingis")


def test_adp_file_shape_and_reliability_rule():
    a = ref.load_adp("2026-27")
    assert a is not None and len(a) >= 200
    assert a["key"].is_unique
    # Az draftın ortalaması (Bronny James %4, ADP ~105) ADP olarak kullanılmaz
    bronny = a[a["key"] == ref.norm_name("Bronny James")].iloc[0]
    assert bronny["adp"] < 110 and not bronny["reliable"]
    assert a[a["reliable"]]["pct_drafted"].min() >= ref.MIN_PCT_DRAFTED
    # Sıralı: güvenilir ADP'ler yaklaşık artan (en iyi = Wembanyama/Jokić)
    top = a[a["reliable"]].nsmallest(2, "adp")["key"].tolist()
    assert set(top) == {"victor wembanyama", "nikola jokic"}


def test_rank_files_and_positions():
    for fmt in ref.RANK_KINDS:
        d = ref.load_rank(fmt, "2026-27")
        assert d is not None and d["rank"].tolist()[:2] == [1, 2]
        assert d["key"].is_unique
    pos = ref.yahoo_positions("2026-27")
    assert pos[ref.norm_name("Nikola Jokic")] == ["C"]
    assert pos[ref.norm_name("Luka Doncic")] == ["PG", "SG"]
    assert all(set(v) <= set(ref.POSITION_ORDER) for v in pos.values())


def test_team_abbreviations_are_normalized():
    d = ref.load_rank("yahoo_h2h_9cat", "2026-27")
    assert not set(d["team"]) & {"NOR", "PHO", "UTH"}


PROJ = ROOT / "data" / "2026-27__fantasy_projections.parquet"
TW = ROOT / "data" / "2026-27__fantasy_team_weeks.parquet"


@pytest.mark.skipif(not (PROJ.exists() and TW.exists()), reason="cache'lenmiş projeksiyon yok")
def test_market_uses_real_adp_where_reliable_and_model_after():
    proj, tw = pd.read_parquet(PROJ), pd.read_parquet(TW)
    m = vl.market_adp(proj, get_format("yahoo_h2h_9cat"), tw)
    real = m[m["ADP_SOURCE"] == "yahoo"]
    assert len(real) > 100
    # Gerçek ADP'liler aynen; model satırları hepsinin ARKASINDA
    assert m.loc[m["ADP_SOURCE"] == "model", "ADP"].min() > real["ADP"].max()
    names = proj.set_index(proj.index)["PLAYER_NAME"]
    kawhi = m.loc[names[names == "Kawhi Leonard"].index[0]]
    assert abs(kawhi["ADP"] - 31.8) < 0.11 and kawhi["ADP_SOURCE"] == "yahoo"


@pytest.mark.skipif(not (PROJ.exists() and TW.exists()), reason="cache'lenmiş projeksiyon yok")
def test_historical_boards_without_season_column_fall_back_to_model():
    proj, tw = pd.read_parquet(PROJ), pd.read_parquet(TW)
    m = vl.market_adp(proj.drop(columns=["SEASON"]), get_format("yahoo_h2h_9cat"), tw)
    assert (m["ADP_SOURCE"] == "model").all()
