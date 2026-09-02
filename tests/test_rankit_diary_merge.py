# -*- coding: utf-8 -*-
"""RankIt günlük yazımı: gönderilmeyen alan DEĞİŞTİRİLMEMELİ.

Neden bu test var
-----------------
POST /diary tek uçtan hem "yeni kayıt" hem "güncelle" işini yapıyor. Alanların
hepsinin somut varsayılanı olduğu sürece (visibility="public", classic=False,
tags=[]) bu uç, ALAN ATLAYAN her istemci için sessiz bir veri yok ediciydi.

Web denetçisi yalnızca {match_id, rating, review} gönderiyor. Telefonda
Classic damgalanmış, üç etiket yazılmış ve GİZLİ işaretlenmiş bir kaydı
web'den bir yıldız değiştirmek şunları yapıyordu:
  - classic  -> False        (damga silinir)
  - tags     -> []           (DELETE FROM rankit_entry_tags)
  - spoiler  -> False        (spoiler perdesi kalkar)
  - visibility -> "public"   (GİZLİ yorum HERKESE AÇIK olur)
Son ikisi gizlilik geri adımı ve üründe geri alma/silme yok.

Aşağıdaki iki test bu davranışı iki yönden de çiviliyor: atlanan alan korunur,
AÇIKÇA gönderilen alan (telefonun yaptığı gibi) yazılır. İkincisi olmadan
"hiçbir şeyi güncelleme" gibi bir düzeltme de testi geçerdi.
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

# DB_PATH, api.db import edilirken okunuyor — client'tan ÖNCE kurulmalı.
_TMP_DB = Path(tempfile.mkdtemp(prefix="rankit_diary_test_")) / "test.db"
os.environ["DB_PATH"] = str(_TMP_DB)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    from api.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def actor(client):
    """Bir kullanıcı + token."""
    from api.auth import create_token
    from api.db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username=?", ("diary_tester",)).fetchone()
        uid = row["id"] if row else conn.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,'user')",
            ("diary_tester", "diary_tester@test.invalid", "x")).lastrowid
    return {"id": uid, "h": {"Authorization": "Bearer " + create_token(uid, "user")}}


@pytest.fixture(scope="module")
def match_id(client):
    """Puanlanabilmesi için BİTMİŞ bir maç gerekiyor."""
    from api.db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM rankit_matches WHERE status='finished' LIMIT 1").fetchone()
        if not row:
            pytest.skip("Bitmiş RankIt maçı yok — seed çalışmamış")
        return row["id"]


def _entry(uid, mid):
    """Kaydın ham hâli + etiketleri, doğrudan veritabanından."""
    from api.db import get_conn
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id,rating,review,classic,spoiler,visibility,watched_date "
            "FROM rankit_diary_entries WHERE user_id=? AND match_id=? ORDER BY id DESC LIMIT 1",
            (uid, mid)).fetchone()
        assert row is not None, "kayıt oluşmamış"
        tags = [r["tag"] for r in conn.execute(
            "SELECT tag FROM rankit_entry_tags WHERE entry_id=? ORDER BY tag", (row["id"],)).fetchall()]
        return dict(row), tags


def test_partial_update_preserves_untouched_fields(client, actor, match_id):
    """Telefon zengin kaydı yazar; web yalnız puanı değiştirir; gerisi durur."""
    # 1) Telefon: tam yük — bu istemci her alanı açıkça gönderiyor.
    r = client.post("/api/rankit/diary", headers=actor["h"], json={
        "match_id": match_id, "rating": 4, "review": "Telefondan yazildi",
        "classic": True, "tags": ["Comeback", "Nail-biter"],
        "visibility": "private", "spoiler": True,
        "watched_date": "2026-01-05",
    })
    assert r.status_code == 200, r.text

    row, tags = _entry(actor["id"], match_id)
    assert row["classic"] == 1 and row["visibility"] == "private" and row["spoiler"] == 1
    assert tags == ["Comeback", "Nail-biter"]

    # 2) Web denetçisi: SADECE bu üç alan. Diğerleri hiç gönderilmiyor.
    r = client.post("/api/rankit/diary", headers=actor["h"], json={
        "match_id": match_id, "rating": 5, "review": "Webden guncellendi",
    })
    assert r.status_code == 200, r.text
    assert r.json()["updated"] is True

    row, tags = _entry(actor["id"], match_id)
    # Gönderilenler değişti:
    assert row["rating"] == 5
    assert row["review"] == "Webden guncellendi"
    # Gönderilmeyenler AYNEN durdu — bu testin bütün amacı:
    assert row["classic"] == 1, "Classic damgasi silinmis"
    assert row["spoiler"] == 1, "Spoiler isareti silinmis"
    assert row["visibility"] == "private", "GIZLI yorum herkese acik yapilmis"
    assert tags == ["Comeback", "Nail-biter"], "Etiketler silinmis"
    assert row["watched_date"] == "2026-01-05", "Izlenme tarihi bugune cekilmis"


def test_explicit_values_still_win(client, actor, match_id):
    """None 'dokunma' demek; boş liste/False ise gerçek bir değer — yazılmalı.

    Bu olmasaydı telefonda etiket temizlemek ya da bir kaydı herkese açık
    yapmak imkânsız hâle gelirdi ve düzeltme hastalıktan kötü olurdu.
    """
    r = client.post("/api/rankit/diary", headers=actor["h"], json={
        "match_id": match_id, "rating": 3, "review": "",
        "classic": False, "tags": [], "visibility": "public", "spoiler": False,
    })
    assert r.status_code == 200, r.text

    row, tags = _entry(actor["id"], match_id)
    assert row["classic"] == 0
    assert row["spoiler"] == 0
    assert row["visibility"] == "public"
    assert row["review"] == ""
    assert tags == [], "Acikca gonderilen bos etiket listesi uygulanmadi"
