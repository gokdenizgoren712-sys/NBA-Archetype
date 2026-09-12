# -*- coding: utf-8 -*-
"""Rank ve Streak mekanigi — HANDOFF §7.

Bu kurallarin hepsi sessizce yanlis calisabilir: bir gun kaymasi seriyi
kirar, eksik bir UNIQUE puani iki kez oder, dinlenme gunu mantigi ters
donerse milli arada herkesin serisi silinir. O yuzden davranis testi.
"""
import sqlite3
from datetime import datetime, timedelta, timezone


def utcnow():
    """utcnow() kullanimdan kalkti; testler de uyari uretmesin."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

import pytest

from api import rankit_rank as R


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(
        """
        CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT);
        CREATE TABLE rankit_competitions(id INTEGER PRIMARY KEY, sport TEXT, name TEXT, season TEXT);
        CREATE TABLE rankit_matches(id INTEGER PRIMARY KEY, starts_at TEXT, competition_id INTEGER);
        CREATE TABLE rankit_diary_entries(id INTEGER PRIMARY KEY, user_id INTEGER,
                                          match_id INTEGER, watched_date TEXT,
                                          created_at TEXT);
        CREATE TABLE rankit_follows(user_id INTEGER, target_type TEXT, target_id INTEGER);
        CREATE TABLE rankit_points(
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            kind TEXT NOT NULL, points INTEGER NOT NULL,
            subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL,
            variant TEXT NOT NULL DEFAULT 'A', created_at TEXT,
            UNIQUE(user_id, kind, subject_type, subject_id));
        CREATE TABLE rankit_point_rules(kind TEXT, variant TEXT, points INTEGER, note TEXT,
                                        PRIMARY KEY(kind, variant));
        """
    )
    c.execute("INSERT INTO users(id,username) VALUES(1,'deniz')")
    c.execute("INSERT INTO rankit_competitions VALUES(1,'Football','League','2026-27')")
    c.execute("INSERT INTO rankit_competitions VALUES(2,'Football','League','2025-26')")
    R.seed_rules(c)
    # Iki kol da ayni degeri alsin ki testler kol atamasina bagli olmasin;
    # A/B'nin kendisi ayri testte dogrulaniyor.
    for kind, _v, pts, _n in R.DEFAULT_RULES:
        c.execute("INSERT OR REPLACE INTO rankit_point_rules(kind,variant,points) VALUES(?,'B',?)",
                  (kind, pts))
    return c


# ── Defter ───────────────────────────────────────────────────────────────────

def test_ayni_odul_iki_kez_odenmez(conn):
    """§7.1: puan mac basina BIR KEZ odenir, duzenlemek yeniden odemez."""
    first = R.award(conn, 1, "rate_same_day", "match", 10)
    second = R.award(conn, 1, "rate_same_day", "match", 10)
    assert first == 15
    assert second == 0, "ikinci odeme UNIQUE tarafindan engellenmeliydi"
    assert R.total_points(conn, 1) == 15


def test_silmek_puani_geri_alir(conn):
    """§7.1: kaydi silmek puanlarini da siler."""
    R.award(conn, 1, "rate_same_day", "match", 10)
    R.award(conn, 1, "companion", "match", 10)
    assert R.total_points(conn, 1) == 35
    taken = R.revoke(conn, 1, "match", 10)
    assert taken == 35
    assert R.total_points(conn, 1) == 0


def test_tanimsiz_odul_puan_uretmez(conn):
    """Tabloda karsiligi olmayan bir tur sessizce puan basmamali."""
    assert R.award(conn, 1, "not_a_real_kind", "match", 1) == 0
    assert R.total_points(conn, 1) == 0


def test_ab_kolu_kullanici_basina_kararli(conn):
    """Ayni kullanici hep ayni kolu gormeli; yeniden baslatma degistirmemeli."""
    a = [R.variant_for(7, "rate_same_day") for _ in range(5)]
    assert len(set(a)) == 1
    # Farkli odul turleri bagimsiz atanir.
    kinds = {R.variant_for(7, k) for k in ("rate_same_day", "companion", "collection")}
    assert kinds <= {"A", "B"}


# ── Kademeler ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("points,tier,name", [
    (0, 1, "New Voice"),
    (249, 1, "New Voice"),
    (250, 2, "Regular"),
    (3499, 4, "Terrace Regular"),
    (15000, 7, "Archivist"),
    (99999, 7, "Archivist"),
])
def test_kademe_esikleri(points, tier, name):
    t = R.tier_for(points)
    assert (t["tier"], t["name"]) == (tier, name)


def test_son_kademede_ilerleme_tam(conn):
    """Archivist'te "sonsuza kadar %99" gostermek yanlis olur."""
    assert R.tier_for(20000)["progress"] == 1.0
    assert R.tier_for(20000)["next_name"] is None


# ── RankIt gunu ──────────────────────────────────────────────────────────────

def test_rankit_gunu_11de_baslar():
    """10:59 hala dunun RankIt gunu; 11:00 yeni gun."""
    assert R.rankit_day(datetime(2026, 9, 8, 10, 59)) == "2026-09-07"
    assert R.rankit_day(datetime(2026, 9, 8, 11, 0)) == "2026-09-08"
    # Gece yarisindan sonra oynanan mac hala ayni RankIt gunune ait —
    # takvim gunu kullanilsaydi 02:00'deki mac "ertesi gun" olurdu.
    assert R.rankit_day(datetime(2026, 9, 9, 2, 0)) == "2026-09-08"


def test_saat_dilimi_gunu_kaydirir():
    """§7.2 "kendi saat diliminde" — sunucunun UTC'si tek basina yetmez."""
    utc = datetime(2026, 9, 8, 9, 30)          # UTC'de 09:30 -> dun
    assert R.rankit_day(utc, 0) == "2026-09-07"
    assert R.rankit_day(utc, 180) == "2026-09-08"   # UTC+3'te 12:30 -> bugun


# ── Streak ───────────────────────────────────────────────────────────────────

def _seed_match(conn, mid, day_iso, hour=20, comp=1):
    conn.execute("INSERT INTO rankit_matches(id,starts_at,competition_id) VALUES(?,?,?)",
                 (mid, f"{day_iso}T{hour:02d}:00:00", comp))


def _seed_rating(conn, mid, night_iso, hour=22):
    """Puanlama ANI olarak yazar (created_at), takvim gunu olarak degil.

    night_iso bir RankIt GUNU etiketi; saat varsayilan 22:00, yani o gunun
    11:00'inden sonrasi — ayni RankIt gecesi. Takvim gunu yetmiyordu cunku
    RankIt gunu 11:00'de basliyor ve iki takvim gunune yayiliyor.
    """
    stamp = f"{night_iso}T{hour:02d}:00:00"
    conn.execute(
        "INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,created_at) VALUES(1,?,?,?)",
        (mid, night_iso, stamp))


def test_ayni_gecede_iki_mac_tek_gece_sayilir(conn):
    """§7.2: uc mac puanlamak bir gecedir, uc degil."""
    today = R.rankit_day(utcnow())
    _seed_match(conn, 1, today); _seed_match(conn, 2, today)
    _seed_rating(conn, 1, today); _seed_rating(conn, 2, today)
    assert R.streak_for(conn, 1)["current"] == 1


def test_dinlenme_gecesi_seriyi_kirmaz(conn):
    """§7.2: "Nobody loses a streak to an international break."

    Takip edilen turnuvada mac OLMAYAN bir gun araya girse bile seri devam
    etmeli. Bu kural ters donerse her milli arada herkesin serisi silinir.
    """
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',1)")
    today = utcnow()
    d0 = R.rankit_day(today)
    d1 = R.rankit_day(today - timedelta(days=1))   # mac yok -> dinlenme
    d2 = R.rankit_day(today - timedelta(days=2))
    _seed_match(conn, 1, d0); _seed_rating(conn, 1, d0)
    _seed_match(conn, 2, d2); _seed_rating(conn, 2, d2)
    # d1'de takip edilen turnuvada hic mac yok
    assert R.streak_for(conn, 1)["current"] == 2


def test_kacirilan_mac_seriyi_kirar(conn):
    """Takip edilen turnuvada mac vardi ve puanlanmadi -> seri kirilir."""
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',1)")
    today = utcnow()
    d0 = R.rankit_day(today)
    d1 = R.rankit_day(today - timedelta(days=1))
    d2 = R.rankit_day(today - timedelta(days=2))
    _seed_match(conn, 1, d0); _seed_rating(conn, 1, d0)
    _seed_match(conn, 2, d1)                        # oynandi, PUANLANMADI
    _seed_match(conn, 3, d2); _seed_rating(conn, 3, d2)
    assert R.streak_for(conn, 1)["current"] == 1


def test_takip_yoksa_dinlenme_kurali_uygulanmaz(conn):
    """Hicbir turnuva takip edilmiyorsa hangi gecenin "kacirildigi"
    bilinemez; arayuz bunu soyleyebilsin diye bayrak doner."""
    today = R.rankit_day(utcnow())
    _seed_match(conn, 1, today); _seed_rating(conn, 1, today)
    out = R.streak_for(conn, 1)
    assert out["rest_nights_enforced"] is False
    assert out["followed_competitions"] == 0


def test_gec_puanlama_seriyi_kurtarmaz(conn):
    """§7.2: dunku maci bugun puanlamak puan verir ama DUNUN serisini
    kurtarmaz."""
    today = utcnow()
    d0 = R.rankit_day(today)
    d1 = R.rankit_day(today - timedelta(days=1))
    _seed_match(conn, 1, d1)       # dun 20:00 oynandi
    _seed_rating(conn, 1, d0)      # BUGUN 22:00 puanladi -> farkli RankIt gunu
    assert R.streak_for(conn, 1)["current"] == 0


# ── Puanlama oduelu ──────────────────────────────────────────────────────────

def test_gecesinde_puanlama_daha_cok_oder(conn):
    """§7.1: 15 vs 5 — urunun tesvik ettigi davranis."""
    now = utcnow()
    _seed_match(conn, 1, R.rankit_day(now), hour=max(11, now.hour))
    out = R.award_for_rating(conn, 1, 1)
    assert out["same_day"] is True and out["points"] == 15


def test_gec_puanlama_az_oder_ve_yukseltilemez(conn):
    """Gec puanlayip sonra ayni maci "gecesinde" gibi tekrar odetmek
    mumkun olmamali."""
    old = utcnow() - timedelta(days=5)
    _seed_match(conn, 1, R.rankit_day(old))
    first = R.award_for_rating(conn, 1, 1)
    assert first["same_day"] is False and first["points"] == 5
    again = R.award_for_rating(conn, 1, 1)
    assert again["points"] == 0
    assert R.total_points(conn, 1) == 5


def test_sezon_donunce_takip_dusmez(conn):
    """Takip GECEN sezonun satirinda (2); bu sezonun maclari 1'de. Dinlenme
    kurali yine uygulanmali ve kacirilan mac yine seriyi kirmali -- sezon
    turnuvadan bagimsiz (sahibin karari, 2026-09-12)."""
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',2)")
    today = utcnow()
    d0 = R.rankit_day(today)
    d1 = R.rankit_day(today - timedelta(days=1))
    d2 = R.rankit_day(today - timedelta(days=2))
    _seed_match(conn, 1, d0); _seed_rating(conn, 1, d0)
    _seed_match(conn, 2, d1)                        # oynandi, PUANLANMADI
    _seed_match(conn, 3, d2); _seed_rating(conn, 3, d2)
    out = R.streak_for(conn, 1)
    assert out["rest_nights_enforced"] is True
    assert out["current"] == 1, "gecen sezonu takip etmek bu sezonun macini da kapsamali"
    assert out["followed_competitions"] == 1


def test_iki_sezon_satiri_tek_turnuva_sayilir(conn):
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',1)")
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',2)")
    assert R.followed_competition_count(conn, 1) == 1


# ── Cevrimdisi puanlama (ekran 3l) ───────────────────────────────────────────

def test_cevrimdisi_an_dar_pencerede_kabul(conn):
    now = utcnow()
    started = now - timedelta(hours=10)
    ok = now - timedelta(hours=6)
    assert R.accepted_rated_at(ok, started, now) == ok
    # gelecekte (saat kaymasi payini asan)
    assert R.accepted_rated_at(now + timedelta(minutes=30), started, now) is None
    # mac baslamadan once
    assert R.accepted_rated_at(started - timedelta(minutes=1), started, now) is None
    # pencerenin siniri: 24 saat (sahibin karari, 2026-09-12)
    assert R.accepted_rated_at(now - timedelta(hours=23), now - timedelta(hours=30), now) is not None
    assert R.accepted_rated_at(now - timedelta(hours=25), now - timedelta(hours=30), now) is None


def test_gece_puanlanip_ertesi_gun_yuklenen_puan_gecesinde_sayilir(conn):
    """"Your rating from tonight is saved on this phone. It uploads when
    you're back." Yukleme ani sayilsaydi 15 yerine 5 odenirdi."""
    now = utcnow()
    night = R.rankit_day(now - timedelta(days=1))
    _seed_match(conn, 1, night, hour=20)
    rated = datetime.fromisoformat(f"{night}T22:30:00")
    out = R.award_for_rating(conn, 1, 1, at=rated)
    assert out["same_day"] is True and out["points"] == 15
