# -*- coding: utf-8 -*-
"""Ödül hattı ek parçaları (çevrimdışı): takım etiketi biçimleri, franchise takma adları, GS, kolej eşleme, olasılık hesabı, koç adı katlama."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from src.awards import award_run as ar  # noqa: E402
from src.awards import coy as coy_mod  # noqa: E402
from src.awards import mip_data as md  # noqa: E402
from src.awards import roy as roy_mod  # noqa: E402
from src.awards import team_awards as ta  # noqa: E402


def test_team_labels_in_both_historical_formats_count_as_made():
    s = pd.Series(["1st", "2nd", "3rd", "1T", "2T", "3T", "", "TT", "4th", "bogus"])
    assert list(ta.made_flags(s, 3)) == [1, 1, 1, 1, 1, 1, 0, 0, 0, 0]
    assert list(ta.made_flags(s, 2)) == [1, 1, 0, 1, 1, 0, 0, 0, 0, 0]               # All-Defense: yalnız 1. ve 2. takım


def test_franchise_aliases_join_relocated_and_renamed_teams():
    assert md.franchise("NJN") == "BRK" and md.franchise("NOH") == "NOP" and md.franchise("SEA") == "OKC"
    assert md.franchise("CHA") == md.franchise("CHH") == "CHO"
    assert md.franchise("LAL") == "LAL" and md.franchise(None) is None


def test_games_started_share_uses_last_season_and_career_and_marks_unknown_as_nan(tmp_path, monkeypatch):
    monkeypatch.setattr(md, "DATA", tmp_path)
    pd.DataFrame({"BREF_SLUG": ["a01", "b01"], "G": [80.0, 60.0], "GS": [10.0, 60.0]}).to_parquet(tmp_path / "2023-24__bref_gs.parquet")
    pd.DataFrame({"BREF_SLUG": ["a01", "b01"], "G": [70.0, 50.0], "GS": [7.0, 0.0]}).to_parquet(tmp_path / "2022-23__bref_gs.parquet")
    f = md.gs_features(2024, pd.Series(["a01", "b01", "zzz01"]))
    assert f.loc[0, "GS_FRAC"] == pytest.approx(10 / 80) and f.loc[0, "GS_FRAC_P1"] == pytest.approx(0.1)
    assert f.loc[1, "GS_FRAC"] == pytest.approx(1.0) and f.loc[1, "GS_FRAC_P1"] == pytest.approx(0.0)
    assert f.loc[0, "GS_CAREER"] == pytest.approx(17 / 150)                              # iki sezonun toplamı
    assert f.loc[2].isna().all()                                                         # bilinmeyen oyuncu NaN, sıfır değil


def test_college_features_match_by_folded_name_and_scale_to_forty_minutes(tmp_path, monkeypatch):
    monkeypatch.setattr(roy_mod, "DATA", tmp_path)
    pd.DataFrame({"PLAYER_NAME": ["Alperen Şengün", "Someone Else"], "MIN": [20.0, 30.0], "PTS": [10.0, 5.0], "REB": [8.0, 2.0], "AST": [2.0, 1.0],
                  "STL": [1.0, 0.5], "BLK": [1.0, 0.0], "TS_PCT": [0.6, 0.5], "USG_PCT": [0.25, 0.15], "BPM": [5.0, 0.0], "OBPM": [3.0, 0.0],
                  "DBPM": [2.0, 0.0], "AGE": [19.0, 21.0], "CONF_ADJEM": [10.0, 5.0], "overall_score": [8.0, 3.0],
                  "PLAYER_HEIGHT_INCHES": [83.0, 75.0]}).to_parquet(tmp_path / "ncaa__2020-21__player_scores.parquet")
    d = pd.DataFrame({"PLAYER_NAME": ["Alperen Sengun", "Nobody Known"], "DRAFT_YEAR": [2021, 2021]})
    f = roy_mod.college_features(d)
    assert f.loc[0, "C_PTS40"] == pytest.approx(20.0) and f.loc[0, "C_REB40"] == pytest.approx(16.0)       # 10 sayı / 20 dk × 40
    assert f.loc[0, "C_BPM"] == 5.0 and f.loc[0, "C_AGE"] == 19.0
    assert f.loc[1].isna().all()                                                                          # eşleşmeyen: bilinmiyor
    far = roy_mod.college_features(pd.DataFrame({"PLAYER_NAME": ["Alperen Sengun"], "DRAFT_YEAR": [1999]}))
    assert far.isna().all().all()                                                                         # o yılın kolej dosyası yok → NaN


def test_plackett_luce_probabilities_are_coherent():
    logits = np.array([2.0, 1.0, 0.0, -1.0, -2.0])
    p = ar.plackett_luce(logits, beta=1.0, ks=(1, 3, 5), n=40000, seed=1)
    assert p[1].sum() == pytest.approx(1.0) and p[3].sum() == pytest.approx(3.0) and p[5].sum() == pytest.approx(5.0)
    soft = np.exp(logits) / np.exp(logits).sum()
    assert np.allclose(p[1], soft, atol=0.01)                                                              # P(1) softmax ile aynı
    assert (np.diff(p[3]) <= 1e-9).all() and (p[3] >= p[1] - 1e-9).all()                                   # skor arttıkça olasılık; ilk 3 ≥ kazanır
    flat = ar.plackett_luce(logits, beta=0.0, ks=(1,), n=20000, seed=1)[1]
    assert np.allclose(flat, 0.2, atol=0.02)                                                               # sıcaklık sıfır: herkes eşit


def test_coach_names_fold_accents_and_punctuation():
    assert coy_mod.fold("Mark Daigneault") == coy_mod.fold("mark  daigneault")
    assert coy_mod.fold("Nenad Krstić") == coy_mod.fold("Nenad Krstic")
    assert coy_mod.fold("J.B. Bickerstaff") == "jbbickerstaff"
