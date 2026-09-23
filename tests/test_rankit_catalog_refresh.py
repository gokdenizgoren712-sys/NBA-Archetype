# -*- coding: utf-8 -*-
"""Katalog DUZENLI calismali: sonradan yayimlanan fikstur canli DB'ye gelmeli.

Production'da olculen hata (2026-09-15): katalog aktarimi tek seferlikti,
canli guncelleyici ise yalnizca var olan satirlari guncelliyordu. UEFA lig
asamasi fiksturleri ilk aktarimdan SONRA yayimlandigi icin hic eklenmedi
(UCL 2026-27: production 90 mac, saglayicida 234). Bu testler ag kullanmaz;
saglayici sahte bir `fetch_fotmob` modulu.
"""
from __future__ import annotations

import sqlite3
import sys
import types
from datetime import datetime
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import api.db as db                        # noqa: E402
import api.rankit_catalog_sync as catalog  # noqa: E402


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    path = tmp_path / "catalog.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    db.init_db()
    return path


LEAGUE_PHASE = {"fixtures": {"allMatches": [{
    "id": 990001, "round": "1", "roundName": "",
    "home": {"id": 1, "name": "Catalog Home FC", "shortName": "CHF"},
    "away": {"id": 2, "name": "Catalog Away FC", "shortName": "CAF"},
    "status": {"utcTime": "2026-10-13T19:00:00Z", "started": False, "finished": False},
}]}}


def _fake_fotmob(monkeypatch, on_call=None):
    """Yalnizca UCL lig asamasi (FotMob 42) fikstur dondurur; gerisi bos."""
    fake = types.ModuleType("fetch_fotmob")

    def api(path, tries=3):
        if on_call:
            on_call(path)
        return LEAGUE_PHASE if path.startswith("leagues?id=42&") else {}

    fake.api = api
    monkeypatch.setitem(sys.modules, "fetch_fotmob", fake)


def _age(column: str, modifier: str) -> None:
    with db.get_conn() as conn:
        conn.execute(f"UPDATE rankit_sync_state SET {column}=datetime('now',?) WHERE job_name=?",
                     (modifier, catalog.REFRESH_JOB))


def _seed_match(conn, *, season: str, starts_at: str, status: str, external_id: str) -> None:
    conn.execute("INSERT OR IGNORE INTO rankit_competitions(sport,name,country,season) "
                 "VALUES('Football','Seed Cup','Europe',?)", (season,))
    comp = conn.execute("SELECT id FROM rankit_competitions WHERE name='Seed Cup' AND season=?",
                        (season,)).fetchone()["id"]
    for name in ("Seed Home", "Seed Away"):
        conn.execute("INSERT OR IGNORE INTO rankit_teams(sport,name,short_name,color,country) "
                     "VALUES('Football',?,?,'#fff','Europe')", (name, name[:3]))
    home = conn.execute("SELECT id FROM rankit_teams WHERE name='Seed Home'").fetchone()["id"]
    away = conn.execute("SELECT id FROM rankit_teams WHERE name='Seed Away'").fetchone()["id"]
    conn.execute("""INSERT INTO rankit_matches
        (sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
         home_score,away_score,editorial,summary,cover_variant,provider,provider_match_id,stage)
        VALUES('Football',?,?,?,?,?,?,NULL,NULL,0,'','crests','fotmob',?,'Final')""",
        (comp, season, starts_at, status, home, away, external_id))


# ── Hatanin kendisi ──────────────────────────────────────────────────────────

def test_worker_starts_even_after_the_first_import(fresh_db, monkeypatch):
    """Ilk aktarim bir kez basarili olunca worker hic baslamiyordu."""
    with db.get_conn() as conn:
        conn.execute("""INSERT INTO rankit_sync_state(job_name,last_attempt,last_success,last_error)
                        VALUES(?,datetime('now'),datetime('now'),'')""", (catalog.JOB_NAME,))
    started = []

    class FakeThread:
        def __init__(self, target=None, name=None, daemon=None):
            self.target = target

        def start(self):
            started.append(self.target)

    monkeypatch.setattr(catalog.threading, "Thread", FakeThread)
    monkeypatch.setenv("RANKIT_BACKGROUND_JOBS", "1")   # conftest kapatiyor
    catalog.start_rankit_catalog_sync()
    assert started == [catalog._worker]


def test_background_jobs_stay_off_when_the_switch_is_off(monkeypatch):
    """Testler (conftest) ve bakim icin tek anahtar: hicbir is baslamaz."""
    import api.rankit_live_sync as live

    started = []

    class FakeThread:
        def __init__(self, target=None, name=None, daemon=None):
            self.target = target

        def start(self):
            started.append(self.target)

    monkeypatch.setattr(catalog.threading, "Thread", FakeThread)
    monkeypatch.setattr(live.threading, "Thread", FakeThread)
    monkeypatch.setenv("RANKIT_BACKGROUND_JOBS", "0")
    catalog.start_rankit_catalog_sync()
    live.start_rankit_live_sync()
    assert started == []
    monkeypatch.setenv("RANKIT_BACKGROUND_JOBS", "1")
    live.start_rankit_live_sync()
    assert len(started) == 2                 # olay dongusu + canli skor


def test_catalog_run_inserts_league_phase_fixtures(fresh_db, monkeypatch):
    import rankit_sync

    _fake_fotmob(monkeypatch)
    rankit_sync.sync_football("2026-27")
    with db.get_conn() as conn:
        row = conn.execute("""SELECT m.stage, c.name FROM rankit_matches m
            JOIN rankit_competitions c ON c.id=m.competition_id
            WHERE m.provider='fotmob' AND m.provider_match_id='990001'""").fetchone()
    assert row is not None
    assert row["name"] == "UEFA Champions League"
    assert row["stage"] == "League phase · Matchday 1"


def test_refresh_records_runs_and_success(fresh_db, monkeypatch):
    import src.rankit_sync as rs

    _fake_fotmob(monkeypatch)
    monkeypatch.setattr(rs, "sync_euroleague", lambda season: {"matches": 0})
    out = catalog.refresh_catalog(datetime(2026, 9, 15, 12, 0))
    assert out == {"seasons": ["2026-27"], "ok": True}
    with db.get_conn() as conn:
        runs = [tuple(r) for r in conn.execute(
            "SELECT provider, season, ok FROM rankit_sync_runs ORDER BY id").fetchall()]
        state = conn.execute("SELECT last_success FROM rankit_sync_state WHERE job_name=?",
                             (catalog.REFRESH_JOB,)).fetchone()
    assert runs == [("euroleague", "2026-27", 1), ("football", "2026-27", 1)]
    assert state["last_success"]


# ── Kilit: katalog artik periyodik ───────────────────────────────────────────

def test_provider_calls_happen_outside_the_write_lock(fresh_db, monkeypatch):
    """Ag istegi yazma kilidi altinda yapilirsa, tur boyunca (saglayici geri
    cekilirse dakikalarca) kullanicinin puan kaydi 'database is locked' ile
    duser. Tek seferlik aktarimda fark edilmiyordu; her 6 saatte bir edilir."""
    import rankit_sync

    locked = []

    def probe(path):
        other = sqlite3.connect(str(fresh_db), timeout=0)
        try:
            other.execute("BEGIN IMMEDIATE")
            other.execute("ROLLBACK")
        except sqlite3.OperationalError as exc:
            locked.append((path, str(exc)))
        finally:
            other.close()

    _fake_fotmob(monkeypatch, on_call=probe)
    rankit_sync.sync_football("2026-27")
    assert locked == []


# ── Zamanlama ────────────────────────────────────────────────────────────────

def test_season_rolls_over_in_july():
    assert catalog.season_for(datetime(2026, 6, 30, 23, 59)) == "2025-26"
    assert catalog.season_for(datetime(2026, 7, 1, 0, 0)) == "2026-27"
    assert catalog.season_for(datetime(2027, 1, 20)) == "2026-27"


def test_previous_season_only_while_it_still_has_matches_to_play(fresh_db):
    now = datetime(2026, 9, 15, 12, 0)
    with db.get_conn() as conn:
        assert catalog.seasons_to_refresh(conn, now) == ["2026-27"]
        # Durumu guncellenmemis gecmis bir "upcoming" biten sezonu geri acmaz.
        _seed_match(conn, season="2025-26", starts_at="2026-08-18T22:00:00",
                    status="upcoming", external_id="stale-1")
        assert catalog.seasons_to_refresh(conn, now) == ["2026-27"]
        # Hala oynanacak ertelenmis bir mac acar.
        _seed_match(conn, season="2025-26", starts_at="2026-09-20T18:00:00Z",
                    status="upcoming", external_id="late-1")
        assert catalog.seasons_to_refresh(conn, now) == ["2025-26", "2026-27"]


def test_refresh_claim_spacing(fresh_db):
    assert catalog.claim_refresh() is True       # hic calismamis: hemen
    assert catalog.claim_refresh() is False      # ayni anda ikinci process
    catalog._mark_refresh(True)
    _age("last_attempt", "-2 hours")
    assert catalog.claim_refresh() is False      # REFRESH_HOURS dolmadi
    _age("last_success", f"-{catalog.REFRESH_HOURS + 1} hours")
    assert catalog.claim_refresh() is True


def test_failed_refresh_retries_but_not_immediately(fresh_db):
    assert catalog.claim_refresh() is True
    catalog._mark_refresh(False, "provider down")
    assert catalog.claim_refresh() is False
    _age("last_attempt", f"-{catalog.REFRESH_RETRY_MINUTES + 1} minutes")
    assert catalog.claim_refresh() is True
