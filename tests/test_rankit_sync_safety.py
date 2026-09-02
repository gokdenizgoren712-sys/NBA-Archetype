# -*- coding: utf-8 -*-
"""Katalog senkronizasyonu kullanıcının yazdığını SİLMEMELİ.

Neden bu test var
-----------------
`sync_football` UEFA/kupa turnuvalarında kura öncesi oluşan boş slot satırlarını
temizliyor:

    DELETE FROM rankit_matches WHERE provider='fotmob' AND competition_id=?
      AND (sezon penceresi dışı OR stage boş)

Bu temizliğin iki sessiz sonucu vardı:

1. `rankit_diary_entries.match_id` maça **ON DELETE CASCADE** ile bağlı. Yani
   silinen bir maç, o maça yazılmış kullanıcı puanlarını, yorumlarını, yorum
   beğenilerini ve cevaplarını da siliyordu. Üründe silme/geri alma yok —
   giden içerik geri gelmiyor.
2. Silme, sağlayıcıdan fikstür gelmese bile çalışıyordu. FotMob çöktüğünde
   satırlar gidiyor, yerine yenisi konmuyordu.

Aşağıdaki testler DELETE'in kendisini gerçek şema üzerinde koşturuyor: ağ yok,
sağlayıcı yok, sadece cümlenin doğru satırları seçip seçmediği.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

_TMP_DB = Path(tempfile.mkdtemp(prefix="rankit_sync_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)

from api.db import get_conn, init_db          # noqa: E402
from rankit_sync import USER_CONTENT_MATCH_IDS  # noqa: E402

START_YEAR = 2026

PRUNE_SQL = f"""DELETE FROM rankit_matches
    WHERE provider='fotmob' AND competition_id=?
      AND (substr(starts_at,1,10)<? OR substr(starts_at,1,10)>=?
           OR stage IS NULL OR stage='')
      AND id NOT IN ({USER_CONTENT_MATCH_IDS})"""


@pytest.fixture()
def fixture_db():
    """Bir turnuva, iki takım, üç maç: biri çöp, biri puanlanmış, biri geçerli."""
    init_db()
    with get_conn() as conn:
        # Fixture her testte sıfırdan kurulur; kalıntı bırakmaz.
        conn.execute("DELETE FROM rankit_matches WHERE provider='fotmob'")
        conn.execute("INSERT OR IGNORE INTO rankit_competitions(sport,name,country,season) "
                     "VALUES('Football','TEST UCL','Europe','2026-27')")
        comp = conn.execute("SELECT id FROM rankit_competitions WHERE sport='Football' "
                            "AND name='TEST UCL' AND season='2026-27'").fetchone()["id"]

        def team(name, short, color):
            conn.execute("INSERT OR IGNORE INTO rankit_teams(sport,name,short_name,color,country) "
                         "VALUES('Football',?,?,?,'Europe')", (name, short, color))
            return conn.execute("SELECT id FROM rankit_teams WHERE sport='Football' AND name=?",
                                (name,)).fetchone()["id"]

        home = team("Test Home", "THM", "#fff")
        away = team("Test Away", "TAW", "#000")

        def add(external_id, stage, starts_at):
            return conn.execute("""INSERT INTO rankit_matches
                (sport,competition_id,season,starts_at,status,home_team_id,away_team_id,
                 home_score,away_score,editorial,summary,cover_variant,provider,provider_match_id,stage)
                VALUES('Football',?,'2026-27',?, 'finished',?,?,1,0,0,'','crests','fotmob',?,?)""",
                (comp, starts_at, home, away, external_id, stage)).lastrowid

        junk = add("junk-1", None, f"{START_YEAR}-09-01T18:00:00Z")        # stage boş -> çöp
        rated = add("rated-1", None, f"{START_YEAR}-09-02T18:00:00Z")      # stage boş AMA puanlanmış
        keep = add("keep-1", "Round of 16", f"{START_YEAR}-09-03T18:00:00Z")  # geçerli

        conn.execute("INSERT OR IGNORE INTO users (username,email,hashed_password,role) "
                     "VALUES('sync_tester','sync_tester@test.invalid','x','user')")
        uid = conn.execute("SELECT id FROM users WHERE username='sync_tester'").fetchone()["id"]
        conn.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,review)
            VALUES(?,?,'2026-09-02',5,'Hayatimin maci')""", (uid, rated))

    yield {"comp": comp, "junk": junk, "rated": rated, "keep": keep}


def _alive(ids):
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT id FROM rankit_matches WHERE id IN ({','.join('?' * len(ids))})", ids).fetchall()
        return {r["id"] for r in rows}


def test_prune_spares_matches_that_carry_user_content(fixture_db):
    """Çöp satır gider, puanlanmış satır KALIR."""
    ids = [fixture_db["junk"], fixture_db["rated"], fixture_db["keep"]]
    with get_conn() as conn:
        conn.execute(PRUNE_SQL, (fixture_db["comp"], f"{START_YEAR}-07-01", f"{START_YEAR + 1}-07-01"))

    alive = _alive(ids)
    assert fixture_db["junk"] not in alive, "Cop satir temizlenmedi"
    assert fixture_db["rated"] in alive, "PUANLANMIS mac silindi -- kullanici icerigi yok oldu"
    assert fixture_db["keep"] in alive, "Gecerli mac silindi"


def test_user_review_survives_the_prune(fixture_db):
    """Asıl mesele satır değil içerik: yorum yerinde duruyor mu."""
    with get_conn() as conn:
        conn.execute(PRUNE_SQL, (fixture_db["comp"], f"{START_YEAR}-07-01", f"{START_YEAR + 1}-07-01"))
        row = conn.execute("SELECT review,rating FROM rankit_diary_entries WHERE match_id=?",
                           (fixture_db["rated"],)).fetchone()
    assert row is not None, "Gunluk kaydi CASCADE ile silindi"
    assert row["review"] == "Hayatimin maci"
    assert row["rating"] == 5


def test_sync_health_separates_last_run_from_last_success():
    """Sessizce bozulan job ile hic kurulmamis job ayirt edilebilmeli.

    /sync-health son calismayi ve son BASARILI calismayi ayri dondurmezse,
    "her 6 saatte bir kosuyor ama 3 gundur hata veriyor" durumu disaridan
    "her sey yolunda" gibi gorunur.
    """
    from fastapi.testclient import TestClient
    from api.main import app
    from rankit_sync import _record_run

    with get_conn() as conn:
        conn.execute("DELETE FROM rankit_sync_runs WHERE provider='football'")

    _record_run("football", "2026-27", True, {"matches": 120, "pruned": 3}, "", 1500)
    _record_run("football", "2026-27", False, {}, "HTTPError: 503", 400)

    with TestClient(app) as c:
        body = c.get("/api/rankit/sync-health").json()

    fb = body["providers"]["football"]
    assert fb["never_run"] is False
    assert fb["last_run"]["ok"] == 0, "Son calisma basarisizdi, saglik oyle demiyor"
    assert "503" in fb["last_run"]["error"]
    assert fb["last_success"]["matches"] == 120, "Son basarili calisma kaybedildi"
    # Hic kosmamis bir saglayici acikca 'never_run' demeli, sessizce bos degil.
    assert "nba" in body["providers"]
    assert "catalog" in body and "matches" in body["catalog"]


def test_cascade_is_real_so_the_guard_is_load_bearing(fixture_db):
    """Koruma olmasaydı gerçekten silinir miydi? Cascade'i doğrudan kanıtla.

    Bu test olmadan yukarıdaki ikisi, cascade hiç kurulu olmasa da geçerdi ve
    korumanın gereksiz olduğu sonucuna varılabilirdi.
    """
    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("DELETE FROM rankit_matches WHERE id=?", (fixture_db["rated"],))
        left = conn.execute("SELECT COUNT(*) n FROM rankit_diary_entries WHERE match_id=?",
                            (fixture_db["rated"],)).fetchone()["n"]
    assert left == 0, "Cascade beklendigi gibi calismadi -- tehdit modeli degismis olabilir"
