# -*- coding: utf-8 -*-
"""Fantezi Faz 0: format şeması, maç puanı, hafta takvimi, pozisyon uygunluğu.

Ağ ya da data/ dosyası kullanmaz — hepsi sentetik girdiyle. Sabitlenen
davranışlar ve neden önemli oldukları:
  - Yahoo ön ayarlarının ağırlıkları kaynaktaki değerlerle birebir (yanlış bir
    katsayı tüm sıralamayı sessizce kaydırır).
  - 1. hafta açılış gününden başlar; All-Star haftası sonrakiyle birleşir.
  - Tarihsiz Cup maçları beklenen değerle dağıtılır, takım toplamı 82 kalır.
  - UTC gece yarısını geçen maç ET gününe yazılır.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config.fantasy_formats import FORMATS, FormatError, get_format, validate_format  # noqa: E402
from src.fantasy import calendar as cal  # noqa: E402
from src.fantasy.fetch import add_game_flags  # noqa: E402
from src.fantasy.positions import eligible_positions  # noqa: E402
from src.fantasy.scoring import fantasy_points, score_games  # noqa: E402


# ── Formatlar ────────────────────────────────────────────────────────────────

def test_yahoo_presets_match_published_defaults():
    assert FORMATS["yahoo_h2h_points"]["weights"] == {
        "PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0}
    assert FORMATS["yahoo_high_score"]["weights"] == {
        "PTS": 1.0, "REB": 1.0, "AST": 2.0, "STL": 3.0, "BLK": 3.0}
    assert FORMATS["yahoo_h2h_9cat"]["categories"] == [
        "FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"]
    assert FORMATS["yahoo_h2h_9cat"]["roster"]["starters"] == [
        "PG", "SG", "G", "SF", "PF", "F", "C", "C", "Util", "Util"]
    assert FORMATS["yahoo_h2h_9cat"]["playoff_weeks"] == (20, 21, 22)


def test_get_format_returns_independent_validated_copy():
    f = get_format("yahoo_h2h_9cat", teams=10)
    f["categories"].append("PTS")
    assert FORMATS["yahoo_h2h_9cat"]["categories"].count("PTS") == 1
    assert f["teams"] == 10 and f["key"] == "yahoo_h2h_9cat"


@pytest.mark.parametrize("patch", [
    {"kind": "categories", "categories": ["PTS", "DUNKS"]},
    {"kind": "categories", "categories": ["PTS", "PTS"]},
    {"kind": "points", "weights": {"PTS": 1, "VIBES": 2}},
    {"teams": 40},
    {"roster": {"starters": ["PG", "BN"], "bench": 3, "il": 1}},
])
def test_invalid_formats_are_rejected(patch):
    fmt = {**get_format("yahoo_h2h_9cat"), **patch}
    if fmt["kind"] == "points" and "weights" not in patch:
        fmt["weights"] = {"PTS": 1}
    with pytest.raises(FormatError):
        validate_format(fmt)


# ── Maç puanı ────────────────────────────────────────────────────────────────

def _game(**kw):
    base = {"PTS": 0, "REB": 0, "AST": 0, "STL": 0, "BLK": 0, "TOV": 0}
    base.update(kw)
    return pd.DataFrame([base])


def test_yahoo_points_line():
    # 30 PTS, 10 REB, 8 AST, 2 STL, 1 BLK, 4 TO → 30 + 12 + 12 + 6 + 3 - 4 = 59
    g = _game(PTS=30, REB=10, AST=8, STL=2, BLK=1, TOV=4)
    assert score_games(g, FORMATS["yahoo_h2h_points"]).iloc[0] == 59.0


def test_high_score_ignores_turnovers():
    # High Score'da TO yok, AST 2: 20 + 5 + 16 + 3 + 0 = 44
    g = _game(PTS=20, REB=5, AST=8, STL=1, TOV=9)
    assert score_games(g, FORMATS["yahoo_high_score"]).iloc[0] == 44.0


def test_missing_stat_column_is_an_error_not_zero():
    with pytest.raises(KeyError):
        fantasy_points(pd.DataFrame([{"PTS": 10}]), {"PTS": 1, "REB": 1.2})


def test_category_formats_have_no_single_game_score():
    with pytest.raises(ValueError):
        score_games(_game(PTS=10), FORMATS["yahoo_h2h_9cat"])


def test_double_and_triple_double_flags():
    g = pd.DataFrame([
        {"PTS": 25, "REB": 11, "AST": 3, "STL": 1, "BLK": 0},
        {"PTS": 12, "REB": 10, "AST": 10, "STL": 0, "BLK": 0},
        {"PTS": 40, "REB": 9, "AST": 9, "STL": 0, "BLK": 0},
    ])
    out = add_game_flags(g)
    assert out["DD2"].tolist() == [1, 1, 0]
    assert out["TD3"].tolist() == [0, 1, 0]


# ── Takvim ───────────────────────────────────────────────────────────────────

def _days(start: date, end: date, skip: set[date] = frozenset()):
    d, out = start, []
    while d <= end:
        if d not in skip:
            out.append(d)
        d += timedelta(days=1)
    return out


def test_first_week_starts_on_opening_day_and_weeks_run_monday_to_sunday():
    days = _days(date(2026, 10, 20), date(2026, 11, 15))   # açılış Salı
    w = cal.build_weeks(days, merge_all_star=False)
    assert (w.loc[0, "START"], w.loc[0, "END"], w.loc[0, "DAYS"]) == ("2026-10-20", "2026-10-25", 6)
    assert w.loc[1, "START"] == "2026-10-26" and w.loc[1, "END"] == "2026-11-01"
    assert date.fromisoformat(w.loc[1, "START"]).weekday() == 0


def test_all_star_week_merges_with_following_week():
    brk = set(_days(date(2027, 2, 19), date(2027, 2, 24)))
    days = _days(date(2027, 2, 1), date(2027, 3, 14), skip=brk)
    assert cal.find_all_star_break(days) == (date(2027, 2, 19), date(2027, 2, 24))
    w = cal.build_weeks(days)
    merged = w[w["ALL_STAR_MERGED"]]
    assert len(merged) == 1
    assert (merged["START"].iloc[0], merged["END"].iloc[0]) == ("2027-02-15", "2027-02-28")
    assert w["WEEK"].tolist() == list(range(1, len(w) + 1))   # numaralar boşluksuz


def test_late_tipoff_lands_on_eastern_date(tmp_path, monkeypatch):
    sched = pd.DataFrame({
        "GAME_ID": ["0022600001", "0022600002", "0062600001"],
        # 02:30Z = 22:30 ET önceki gün; Cup finali (0062) alınmamalı
        "GAME_DATE_TIME": ["2026-10-21T02:30:00Z", "2026-10-21T23:00:00Z", "2026-12-11T01:00:00Z"],
        "HOME_ABBREVIATION": ["LAL", "BOS", None],
        "AWAY_ABBREVIATION": ["GSW", "NYK", None],
        "GAME_STATUS": [1, 1, 1], "HOME_PTS": [0, 0, 0], "AWAY_PTS": [0, 0, 0],
    })
    sched.to_parquet(tmp_path / "2026-27__rankit_schedule.parquet", index=False)
    monkeypatch.setattr(cal, "DATA_DIR", tmp_path)
    known, tbd = cal.load_schedule("2026-27")
    assert known["DATE"].tolist() == [date(2026, 10, 20), date(2026, 10, 21)]
    assert tbd.empty


def test_pending_cup_games_keep_every_team_at_82():
    # 4 takım, her biri 80 bilinen maç yerine burada 1'er bilinen maç: bekleyen
    # = 81. Önemli olan dağılımın toplamı ve iki haftaya bölünmesi.
    known = pd.DataFrame({
        "GAME_ID": ["g1", "g2"],
        "DATE": [date(2026, 11, 30), date(2026, 12, 1)],
        "HOME_ABBREVIATION": ["AAA", "CCC"], "AWAY_ABBREVIATION": ["BBB", "DDD"],
    })
    tbd = pd.DataFrame({"GAME_ID": ["q1", "s1"], "DATE": [date(2026, 12, 4), date(2026, 12, 8)]})
    weeks = cal.build_weeks(_days(date(2026, 11, 30), date(2026, 12, 13)), merge_all_star=False)
    tw = cal.build_team_weeks(known, tbd, weeks, playoff_weeks=())
    totals = tw.groupby("TEAM")["GAMES_EXPECTED"].sum().round(6)
    assert set(totals) == {82.0}
    qf = tw[tw["WEEK"] == 1]["PENDING_EXPECTED"]
    assert qf.round(3).eq(round(cal.CUP_KNOCKOUT_TEAMS / 4, 3)).all()


def test_back_to_back_counts_second_night():
    known = pd.DataFrame({
        "GAME_ID": ["a", "b", "c"],
        "DATE": [date(2026, 10, 26), date(2026, 10, 27), date(2026, 10, 30)],
        "HOME_ABBREVIATION": ["AAA", "AAA", "AAA"], "AWAY_ABBREVIATION": ["BBB", "CCC", "BBB"],
    })
    weeks = cal.build_weeks(_days(date(2026, 10, 26), date(2026, 11, 1)), merge_all_star=False)
    tw = cal.build_team_weeks(known, pd.DataFrame(columns=["GAME_ID", "DATE"]), weeks, playoff_weeks=())
    a = tw[tw["TEAM"] == "AAA"].iloc[0]
    assert (a["GAMES"], a["B2B"]) == (3, 1)


# ── Pozisyonlar ──────────────────────────────────────────────────────────────

def _p(ast=0.12, reb=0.08, blk36=0.5, fg3a36=4.0):
    return {"AST_PCT": ast, "REB_PCT": reb, "BLK36": blk36, "FG3A36": fg3a36}


@pytest.mark.parametrize("raw,profile,expected", [
    ("G", _p(ast=0.35), ["PG"]),
    ("G", _p(ast=0.10), ["SG"]),
    ("G", _p(ast=0.18), ["PG", "SG"]),
    ("F-G", _p(ast=0.30), ["PG", "SG", "SF"]),
    ("F", _p(reb=0.14), ["PF"]),
    ("F", _p(reb=0.07, fg3a36=7.0), ["SF"]),
    ("F", _p(reb=0.10, fg3a36=4.0), ["SF", "PF"]),
    ("C", _p(fg3a36=4.7), ["C"]),            # Jokić profili: C kalmalı
    ("C", _p(fg3a36=7.0), ["PF", "C"]),       # gerçekten açılan uzun
    ("C-F", _p(), ["PF", "C"]),
    ("G", None, ["PG", "SG"]),                # profil yok → geniş atama
    (float("nan"), None, []),                 # NBA kodu yok
])
def test_position_rules(raw, profile, expected):
    assert eligible_positions(raw, profile) == expected
