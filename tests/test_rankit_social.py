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
            # provider dolu: secici yalnizca senkronlanmis turnuvalari gosterir
            # (tohum-yalnizca bir turnuva gercek degil).
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                         home_team_id,away_team_id,home_score,away_score,provider)
                         VALUES(?,'Football',1,'2026-27',?,'finished',1,2,1,0,'fotmob')""",
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


# ── 4g / 4h: ilk kurulum ─────────────────────────────────────────────────────

def test_kurulum_takipleri_yazar_ve_kapanir(db):
    out = RK.rankit_onboarding("", who(2))
    assert out["done"] is False and [c["id"] for c in out["competitions"]] == [1]
    res = RK.rankit_onboarding_save(RK.OnboardIn(competitions=[1], clubs=[1, 2]), who(2))
    assert res["following_sources"] == 3
    assert RK.rankit_onboarding("", who(2))["done"] is True


def test_skip_bir_daha_sormaz_ve_takip_yazmaz(db):
    RK.rankit_onboarding_save(RK.OnboardIn(competitions=[1], skipped=True), who(2))
    out = RK.rankit_onboarding("", who(2))
    assert out["done"] is True
    assert not any(c["followed"] for c in out["competitions"])


def test_kurulum_var_olan_takibi_dusurmez_ve_uydurma_kimligi_yazmaz(db):
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'team',2)")
    RK.rankit_onboarding_save(RK.OnboardIn(competitions=[999], clubs=[1]), who(2))
    with DB.get_conn() as c:
        rows = {(r["target_type"], r["target_id"]) for r in
                c.execute("SELECT target_type,target_id FROM rankit_follows WHERE user_id=2")}
    assert rows == {("team", 1), ("team", 2)}, "999 yok sayilmali, var olan takip durmali"


def test_turnuva_seciciye_bir_kez_girer(db):
    """Sezon basina satir var; secici "L"yi iki kez gostermemeli, en yenisini."""
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Football','L','2025-26')")
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,provider) VALUES(50,'Football',2,'2025-26',
                     '2025-08-01T20:00:00','finished',1,2,'fotmob')""")
    comps = RK.rankit_onboarding("", who(2))["competitions"]
    assert [(x["name"], x["season"]) for x in comps] == [("L", "2026-27")]


def test_ana_ekran_takipleri_once_getirir(db):
    """4h'nin sozu "Build my home": takip edilen kulubun maci, simdiye daha
    uzak olsa bile once gelir. Filtre degil, sira."""
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(3,'Football','C','C')")
        # takip edilen kulubun maci UZAK, digerleri yakin
        c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,
                     home_team_id,away_team_id,provider) VALUES(60,'Football',1,'2026-27',
                     '2027-05-01T20:00:00','upcoming',3,1,'fotmob')""")
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'team',3)")
    ids = [m["id"] for m in RK.rankit_home("All", None, None, who(2))["matches"]]
    assert ids[0] == 60
    assert len(ids) > 1, "takip edilmeyen maclar da gorunmeli -- filtre degil"


def test_duzenleyici_birakir_kisi_takibine_dokunmaz(db):
    """Settings'teki duzenleyici gonderilen kumeyi TAM kume sayar: secimi
    kaldirilan takip birakilir. Ilk kurulum ise yalnizca ekler."""
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'team',1)")
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'team',2)")
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'user',1)")
    RK.rankit_set_sources(RK.OnboardIn(competitions=[1], clubs=[2]), who(2))
    with DB.get_conn() as c:
        rows = {(r["target_type"], r["target_id"]) for r in
                c.execute("SELECT target_type,target_id FROM rankit_follows WHERE user_id=2")}
    assert rows == {("competition", 1), ("team", 2), ("user", 1)}


def test_duzenleyici_oneri_disi_takibi_gosterir(db):
    """Takip edilen ama onerilmeyen kulup de listede olmali; yoksa birakilamaz."""
    with DB.get_conn() as c:
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name) VALUES(9,'Football','Far','FAR')")
        c.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(2,'team',9)")
    out = RK.rankit_onboarding("", who(2))
    assert 9 in [c["id"] for c in out["followed_clubs"]]
