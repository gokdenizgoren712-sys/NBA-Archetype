# -*- coding: utf-8 -*-
"""Eşzamanlı istekler 500 vermemeli (ONARIM Aşama 10'da bulundu).

`GET /collections` koleksiyonları TEMBEL oluşturuyor: `INSERT OR IGNORE`
çağrıları bir GET'in içinde. İki istek üst üste geldiğinde -- React
StrictMode'un çift çağrısı bile yeter -- SQLite `database is locked` atıyor ve
uç **500** dönüyordu. Ekranda Discover'ın The Hunt bloğu bu yüzden hiç
çizilmiyordu; hata sessizce yutulmuştu.

Düzeltme rollback-journal yerine WAL + busy_timeout (api/db.py).
"""
from __future__ import annotations

import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_TMP_DB = Path(tempfile.mkdtemp(prefix="rankit_conc_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    with TestClient(app) as c:
        yield c


def test_wal_is_on(client):
    """WAL olmadan okuyan yazanı bloklar ve düzeltme geri gelir."""
    from api.db import get_conn
    with get_conn() as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert str(mode).lower() == "wal", f"journal_mode={mode}"


def _seed_club_seasons():
    """Gercek senaryo: izleyici kulup takip ediyor, yani hunt_for her istekte
    BIRDEN FAZLA club_season satirini tembel olusturmaya calisiyor. Ilk
    surumdeki test takipsiz kostugu icin tek bir INSERT'le yarisiyor ve
    kusuru HIC yeniden uretmiyordu -- yesil kaldi, hata yasamaya devam etti."""
    from api.db import get_conn
    import api.rankit as RK
    with get_conn() as conn:
        uid = RK._demo_user_id(conn)
        comp = conn.execute(
            "INSERT INTO rankit_competitions(sport,name,season,country) VALUES('Football','Premier League','2026-27','England')"
        ).lastrowid
        teams = []
        for name in ("Arsenal", "Chelsea", "Fulham", "Brentford", "Everton", "Burnley"):
            tid = conn.execute("INSERT OR IGNORE INTO rankit_teams(sport,name,short_name,color,country) VALUES('Football',?,?,'#123456','England')",
                               (name, name[:3].upper())).lastrowid or conn.execute(
                "SELECT id FROM rankit_teams WHERE name=?", (name,)).fetchone()["id"]
            teams.append(tid)
        for i, h in enumerate(teams):
            for a in teams[i + 1:]:
                conn.execute("""INSERT INTO rankit_matches(sport,competition_id,season,starts_at,status,home_team_id,away_team_id,provider,provider_match_id)
                                VALUES('Football',?,'2026-27',datetime('now','-3 days'),'finished',?,?,'fotmob',?)""",
                             (comp, h, a, f"t{h}-{a}"))
        for tid in teams:
            conn.execute("INSERT OR IGNORE INTO rankit_follows(user_id,target_type,target_id) VALUES(?,?,?)",
                         (uid, "team", tid))


def test_concurrent_collections_never_500(client):
    """Aynı anda on altı istek, alti kulup takip edilirken: hepsi 200."""
    _seed_club_seasons()

    def hit(_):
        return client.get("/api/rankit/collections")

    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(hit, range(16)))

    codes = [r.status_code for r in results]
    assert codes == [200] * 16, codes
    # Her yanıt aynı özeti taşımalı: tembel oluşturma tekrar tekrar
    # koleksiyon üretmemeli.
    summaries = {tuple(sorted((r.json()["summary"] or {}).items())) for r in results}
    assert len(summaries) == 1, f"eszamanli istekler farkli ozet dondurdu: {summaries}"
