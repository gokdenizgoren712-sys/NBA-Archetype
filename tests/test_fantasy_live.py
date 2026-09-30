# -*- coding: utf-8 -*-
"""Faz 4 — sunucu tarafı sezon içi güncelleme worker'ı (api/fantasy_live.py) ve run_update çekirdeği."""

import datetime as dt
import os
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())
os.environ.setdefault("RANKIT_BACKGROUND_JOBS", "0")

import api.main  # noqa: E402,F401  (dairesel import sırası: önce api.main)
from api import fantasy_live as fl  # noqa: E402
from src.fantasy import update as upd  # noqa: E402
from tests.test_fantasy_inseason import _base, _logs  # noqa: E402


def test_season_started_window():
    opening = dt.date(2026, 10, 20)
    assert not fl.season_started(dt.date(2026, 10, 1), opening)
    assert fl.season_started(dt.date(2026, 10, 19), opening)       # bir gün pay
    assert fl.season_started(dt.date(2027, 1, 5), opening)


def test_worker_is_off_when_background_jobs_disabled(monkeypatch):
    monkeypatch.setenv("RANKIT_BACKGROUND_JOBS", "0")
    assert not fl.enabled()
    monkeypatch.setenv("RANKIT_BACKGROUND_JOBS", "1")
    monkeypatch.setenv("FANTASY_LIVE_UPDATES", "0")
    assert not fl.enabled()
    monkeypatch.delenv("FANTASY_LIVE_UPDATES")
    assert fl.enabled()


def test_tick_does_nothing_before_the_season(monkeypatch):
    monkeypatch.setattr(fl, "_claim", lambda: pytest.fail("sezon öncesi claim alınmamalı"))
    assert fl.tick(today=dt.date(2020, 1, 1)) is None


def _dirs(tmp_path):
    base = _base()
    base.to_parquet(tmp_path / "2026-27__fantasy_projections.parquet", index=False)
    return tmp_path


def test_run_update_writes_pre_snapshot_then_updates_idempotently(tmp_path):
    d = _dirs(tmp_path)
    cur = pd.concat([_logs(1, "AAA", 12, 33, 22), _logs(2, "AAA", 12, 18, 6)])
    r1 = upd.run_update(d, fetcher=lambda s: cur, log=lambda m: None)
    assert r1["status"] == "updated" and (d / "2026-27__fantasy_projections_pre.parquet").exists()
    a = pd.read_parquet(d / "2026-27__fantasy_projections.parquet")
    assert "INSEASON_AS_OF" in a.columns and a.set_index("PLAYER_ID").loc[1, "PTS"] > 18.0
    r2 = upd.run_update(d, fetcher=lambda s: cur, log=lambda m: None)          # ikinci tur: aynı sonuç, üst üste binmez
    b = pd.read_parquet(d / "2026-27__fantasy_projections.parquet")
    cols = [c for c in a.columns if c != "BUILT_AT"]
    pd.testing.assert_frame_equal(a[cols], b[cols])
    assert r2["status"] == "updated"
    assert not list(d.glob("*.tmp"))


def test_run_update_leaves_file_untouched_on_fetch_failure_or_no_games(tmp_path):
    d = _dirs(tmp_path)
    before = (d / "2026-27__fantasy_projections.parquet").read_bytes()

    def boom(_s):
        raise RuntimeError("blocked")
    assert upd.run_update(d, fetcher=boom, log=lambda m: None)["status"] == "fetch_failed"
    assert upd.run_update(d, fetcher=lambda s: pd.DataFrame({"MIN": [], "GAME_DATE": []}), log=lambda m: None)["status"] == "no_games"
    assert (d / "2026-27__fantasy_projections.parquet").read_bytes() == before


def test_run_update_refuses_an_already_updated_file_without_a_snapshot(tmp_path):
    d = tmp_path
    x = _base()
    x["INSEASON_AS_OF"] = "2026-11-01"
    x.to_parquet(d / "2026-27__fantasy_projections.parquet", index=False)
    assert upd.run_update(d, fetcher=lambda s: pd.DataFrame(), log=lambda m: None)["status"] == "no_base"
    assert upd.run_update(tmp_path / "empty", fetcher=lambda s: pd.DataFrame(), log=lambda m: None)["status"] == "no_base"


def test_claim_allows_one_worker_per_interval(tmp_path, monkeypatch):
    from api import db
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "app.db")
    db.init_db()
    assert fl._claim() is True
    assert fl._claim() is False                                     # aynı saat içinde ikinci worker alamaz
    with db.get_conn() as conn:
        conn.execute("UPDATE rankit_sync_state SET last_attempt=datetime('now','-61 minutes') WHERE job_name=?", (fl.JOB_NAME,))
    assert fl._claim() is True
