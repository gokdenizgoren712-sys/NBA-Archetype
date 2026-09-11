# -*- coding: utf-8 -*-
"""Liste gorunurlugu ve zevk ortakligi — ekranlar 3h ve 3i.

Ikisi de sessizce SIZDIRABILIR ve ekranda hicbir sey yanlis gorunmez:
  * /lists/{id} gorunurluge bakmadan her listeyi donuyordu (IDOR).
  * "57 macta 41 uyum" cumlesi, gizli kayitlarla hesaplanirsa o puanlari
    dolayli olarak ele verir.
Bu yuzden davranis testi, gorsel kontrol degil.
"""
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException

import api.db as DB
from api import rankit as RK


@pytest.fixture()
def db(monkeypatch):
    path = Path(tempfile.mkdtemp(prefix="rankit_social_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    with DB.get_conn() as c:
        for i, name in enumerate(("owner", "friend", "stranger"), start=1):
            c.execute("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      (i, f"{name}@t", name))
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(1,'Football','L','2026-27')")
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(1,'Football','A','A'),(2,'Football','B','B')")
        for mid in range(1, 11):
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,1,0)""",
                      (mid, f"2026-08-{mid:02d}T20:00:00"))
    return path


def who(uid):
    return {"sub": str(uid)}


def _list(visibility):
    with DB.get_conn() as c:
        cur = c.execute("INSERT INTO rankit_lists(user_id,title,visibility) VALUES(1,'L',?)", (visibility,))
        return cur.lastrowid


# ── 3h: liste gorunurlugu ────────────────────────────────────────────────────

def test_ozel_liste_yabanciya_404(db):
    """IDOR: gizli liste kimligi tahmin edene ACILMAMALI — ve 403 degil 404,
    cunku 403 listenin VAR OLDUGUNU soyler."""
    lid = _list("private")
    with pytest.raises(HTTPException) as err:
        RK.rankit_list_detail(lid, who(3))
    assert err.value.status_code == 404
    assert RK.rankit_list_detail(lid, who(1))["is_owner"] is True


def test_takipci_listesi_yalnizca_takipciye(db):
    lid = _list("followers")
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'user',1)")
    assert RK.rankit_list_detail(lid, who(2))["list"]["id"] == lid
    with pytest.raises(HTTPException):
        RK.rankit_list_detail(lid, who(3))


def test_gizli_listeye_respect_de_verilemez(db):
    """Okunamayan bir listeye respect vermek, varligini dogrulamanin
    ikinci yolu olurdu."""
    lid = _list("private")
    with pytest.raises(HTTPException):
        RK.rankit_list_respect(lid, who(3))


def test_liste_respect_acilir_kapanir_ve_sahibine_bildirir(db):
    lid = _list("public")
    first = RK.rankit_list_respect(lid, who(2))
    assert first == {"respected": True, "respect": 1}
    assert RK.rankit_list_respect(lid, who(2)) == {"respected": False, "respect": 0}
    with DB.get_conn() as c:
        kinds = [r["kind"] for r in c.execute("SELECT kind FROM rankit_notifications WHERE user_id=1")]
    assert kinds == ["list_respect"]


# ── 3i: zevk ortakligi ───────────────────────────────────────────────────────

def _rate(uid, mid, rating, visibility="public"):
    with DB.get_conn() as c:
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                     VALUES(?,?,'2026-08-20',?,?)""", (uid, mid, rating, visibility))


def test_ortaklik_taban_altinda_yuzde_vermez(db):
    """Iki ortak macta "%100 uyum" gurultudur."""
    for mid in (1, 2):
        _rate(1, mid, 4.0); _rate(2, mid, 4.0)
    ov = RK.rankit_member_detail(1, who(2))["overlap"]
    assert ov["shared"] == 2 and ov["pct"] is None and ov["bias"] is None


def test_ortaklik_yarim_yildiz_tolerans_ve_egilim(db):
    # 6 ortak mac: 4'u yarim yildiz icinde, 2'si uzak. Sahip hep daha SOGUK.
    pairs = [(4.0, 4.5), (3.0, 3.5), (2.5, 3.0), (4.0, 4.0), (1.0, 3.0), (2.0, 4.0)]
    for mid, (theirs, mine) in enumerate(pairs, start=1):
        _rate(1, mid, theirs); _rate(2, mid, mine)
    ov = RK.rankit_member_detail(1, who(2))["overlap"]
    assert ov["shared"] == 6 and ov["agree"] == 4
    assert ov["pct"] == round(4 / 6, 3)
    assert ov["bias"] < 0, "sahip izleyenden soguk puanliyor; egilim negatif olmali"


def test_gizli_puan_ortakliga_sizmaz(db):
    """Sahibin GIZLI kaydi ortaklikta sayilirsa "57'de 41" o puani ele verir."""
    for mid in range(1, 6):
        _rate(1, mid, 4.0); _rate(2, mid, 4.0)
    _rate(1, 6, 1.0, visibility="private")
    _rate(2, 6, 5.0)
    ov = RK.rankit_member_detail(1, who(2))["overlap"]
    assert ov["shared"] == 5 and ov["agree"] == 5


def test_rewatch_iki_kez_sayilmaz(db):
    """Mac basina SON puan. Ayni maci iki kez puanlamak ortakligi sisirmemeli."""
    for mid in range(1, 6):
        _rate(1, mid, 4.0); _rate(2, mid, 4.0)
    _rate(1, 1, 1.0)   # sahip ayni maci sonra 1 yildizla yeniden puanladi
    ov = RK.rankit_member_detail(1, who(2))["overlap"]
    assert ov["shared"] == 5 and ov["agree"] == 4


def test_ortalama_gizli_kayitlari_disarida_birakir(db):
    _rate(1, 1, 5.0)
    _rate(1, 2, 1.0, visibility="private")
    assert RK.rankit_member_detail(1, who(3))["stats"]["avg_rating"] == 5.0
    # Sahibin kendisi hepsini gorur.
    assert RK.rankit_member_detail(1, who(1))["stats"]["avg_rating"] == 3.0


def test_liste_kaydedilir_ve_geri_alinir(db):
    """3h "38 saved". rankit_follows'a yazilamaz (CHECK kisiti 'list'i
    reddediyor -- bu test ilk hâlinde tam onu yakaladi), kendi tablosu var."""
    lid = _list("public")
    assert RK.rankit_list_save(lid, who(2)) == {"saved": True, "saves": 1}
    assert RK.rankit_list_detail(lid, who(2))["saved"] is True
    assert RK.rankit_list_save(lid, who(2)) == {"saved": False, "saves": 0}


def test_gizli_liste_kaydedilemez(db):
    lid = _list("private")
    with pytest.raises(HTTPException):
        RK.rankit_list_save(lid, who(3))


def test_raf_rewatch_i_tekrarlamaz(db):
    """Ayni maci iki kez loglamak rafta iki ayni kart ve iki ayni React
    anahtari demekti (konsolda "two children with the same key")."""
    _rate(1, 1, 4.0); _rate(1, 1, 4.5); _rate(1, 2, 3.0)
    shelf = RK.rankit_member_detail(1, who(3))["shelf"]
    assert [m["id"] for m in shelf].count(1) == 1
    assert len({m["entry_id"] for m in shelf}) == len(shelf)
    assert [m for m in shelf if m["id"] == 1][0]["their_rating"] == 4.5, "SON kayit gosterilmeli"
