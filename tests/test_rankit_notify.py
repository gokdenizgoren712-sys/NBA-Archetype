# -*- coding: utf-8 -*-
"""Bildirim kurallari — HANDOFF ekran 3f.

Bunlarin hepsi sessizce yanlis calisabilir: kendine bildirim gonderen bir
kanca kimseyi uyarmaz ama akisi cope cevirir, eksik bir UNIQUE ayni respect'i
her acip kapatista tekrar bildirir, ve "durum" olarak yazilmis bir satir
ertesi gun yalan soyler. O yuzden davranis testi.
"""
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from api import rankit_notify as N
from api import rankit_rank as R


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(
        """
        CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT);
        CREATE TABLE rankit_teams(id INTEGER PRIMARY KEY, short_name TEXT);
        CREATE TABLE rankit_competitions(id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE rankit_matches(id INTEGER PRIMARY KEY, competition_id INTEGER,
                                    starts_at TEXT, status TEXT,
                                    home_team_id INTEGER, away_team_id INTEGER);
        CREATE TABLE rankit_diary_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          user_id INTEGER, match_id INTEGER, rating REAL);
        CREATE TABLE rankit_watchlist(user_id INTEGER, match_id INTEGER);
        CREATE TABLE rankit_follows(user_id INTEGER, target_type TEXT, target_id INTEGER);
        CREATE TABLE rankit_lists(id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT,
                                  updated_at TEXT);
        CREATE TABLE rankit_list_items(list_id INTEGER, match_id INTEGER);
        CREATE TABLE rankit_list_saves(list_id INTEGER, user_id INTEGER);
        CREATE TABLE rankit_user_settings(user_id INTEGER, key TEXT, value TEXT,
                                          PRIMARY KEY(user_id,key));
        CREATE TABLE rankit_notifications(
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            kind TEXT NOT NULL, actor_id INTEGER, match_id INTEGER, entry_id INTEGER,
            list_id INTEGER, detail TEXT, created_at TEXT DEFAULT (datetime('now')),
            read_at TEXT);
        -- Sutun UNIQUE'i degil IFADE INDEKSI: SQLite'ta NULL'lar birbirinden
        -- farkli sayilir ve bir respect bildiriminin match_id/list_id'si NULL.
        CREATE UNIQUE INDEX idx_rankit_notify_once ON rankit_notifications(
            user_id, kind, COALESCE(actor_id,-1), COALESCE(entry_id,-1),
            COALESCE(match_id,-1), COALESCE(list_id,-1));
        """
    )
    c.execute("INSERT INTO users VALUES(1,'deniz')")
    c.execute("INSERT INTO users VALUES(2,'mara')")
    c.execute("INSERT INTO rankit_teams VALUES(10,'ARS')")
    c.execute("INSERT INTO rankit_teams VALUES(11,'TOT')")
    c.execute("INSERT INTO rankit_competitions VALUES(5,'Premier League')")
    return c


# ── Olaylar ──────────────────────────────────────────────────────────────────

def test_kendine_bildirim_yok(conn):
    """Kendi incelemene respect vermek seni uyarmamali."""
    N.notify(conn, 1, "respect", actor_id=1, entry_id=7)
    assert N.feed(conn, 1)["items"] == []


def test_ayni_olay_iki_kez_bildirilmez(conn):
    """Respect geri alinip tekrar verilirse ikinci bir satir dogmamali."""
    N.notify(conn, 1, "respect", actor_id=2, entry_id=7)
    N.notify(conn, 1, "respect", actor_id=2, entry_id=7)
    assert len(N.feed(conn, 1)["items"]) == 1


def test_farkli_kisiler_ayri_satir(conn):
    N.notify(conn, 1, "respect", actor_id=2, entry_id=7)
    conn.execute("INSERT INTO users VALUES(3,'ece')")
    N.notify(conn, 1, "respect", actor_id=3, entry_id=7)
    assert len(N.feed(conn, 1)["items"]) == 2


def test_okundu_yalnizca_olaylari_kapatir(conn):
    N.notify(conn, 1, "respect", actor_id=2, entry_id=7)
    assert N.feed(conn, 1)["unread"] == 1
    assert N.mark_read(conn, 1) == 1
    out = N.feed(conn, 1)
    assert out["unread"] == 0
    # Satir SILINMIYOR — okundu bir gecmis, bir temizlik degil.
    assert len(out["items"]) == 1


def test_bildirim_yazilamamasi_cagirani_dusurmez(conn):
    """Kanca respect vermeyi ya da yorum birakmayi asla bozmamali."""
    conn.execute("DROP TABLE rankit_notifications")
    N.notify(conn, 1, "respect", actor_id=2, entry_id=7)   # patlamamali


# ── Durumlar ─────────────────────────────────────────────────────────────────

def _tonight():
    """Bu RankIt gunu icinde, gecmiste kalan bir an.

    "Iki saat once" YETMIYOR: RankIt gunu 11:00'de basliyor, yani her gun
    11:00-13:00 UTC arasinda "iki saat once" DUNUN RankIt gunune dusuyor ve
    sicak mac testleri o iki saat boyunca kirmizi yaniyordu (2026-09-11
    11:11'de yakalandi). Gunun acilisina kenetleniyor.
    """
    now = utcnow()
    day = R.rankit_day(now, 0)
    opens = datetime.fromisoformat(day) + timedelta(hours=R.RANKIT_DAY_START_HOUR)
    return max(opens, now - timedelta(hours=2))


def _seed_hot(conn, *, rating, watchlisted=True, when=None, rated_by_user=False):
    at = when or _tonight()
    conn.execute("""INSERT INTO rankit_matches
        VALUES(100,5,?, 'finished',10,11)""", (at.isoformat(sep="T"),))
    # Toplulugun puani: baska kullanicilardan.
    conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(2,100,?)", (rating,))
    if rated_by_user:
        conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,100,4.0)")
    if watchlisted:
        conn.execute("INSERT INTO rankit_watchlist VALUES(1,100)")


def test_sicak_mac_uyarisi_esik_ustunde(conn):
    _seed_hot(conn, rating=4.6)
    out = N.feed(conn, 1)
    assert out["states"] == 1
    hot = out["items"][0]
    assert hot["kind"] == "hot_match" and hot["rating"] == 4.6
    assert hot["reason"] == "watchlist"


def test_soguk_mac_uyari_uretmez(conn):
    """Her maca "RUNNING HOT" demek uyariyi degersizlestirir."""
    _seed_hot(conn, rating=3.2)
    assert N.feed(conn, 1)["states"] == 0


def test_puanladiysan_uyari_yok(conn):
    """Uyarinin isi puanlatmak; puanladiysan isi bitmistir."""
    _seed_hot(conn, rating=4.8, rated_by_user=True)
    assert N.feed(conn, 1)["states"] == 0


def test_ilgilenmedigin_mac_uyari_uretmez(conn):
    """Izleme listesinde de degil, takip edilen turnuvada da degil."""
    _seed_hot(conn, rating=4.9, watchlisted=False)
    assert N.feed(conn, 1)["states"] == 0


def test_takip_edilen_turnuva_da_sayilir(conn):
    _seed_hot(conn, rating=4.9, watchlisted=False)
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',5)")
    out = N.feed(conn, 1)
    assert out["states"] == 1 and out["items"][0]["reason"] == "competition"


def test_dunku_mac_bu_gecenin_uyarisi_degil(conn):
    """§7.2 penceresi: RankIt gunu 11:00 -> 11:00. Iki gun onceki mac
    bu gecenin "gece yarisindan once puanla" uyarisini uretemez."""
    _seed_hot(conn, rating=4.9, when=utcnow() - timedelta(days=2))
    assert N.feed(conn, 1)["states"] == 0


def test_running_hot_kapatilabilir(conn):
    """3g'deki anahtar uyariyi SUNUCUDA susturmali; istemcide gizlemek
    yetmez, cunku uyarinin dogdugu yer burasi."""
    _seed_hot(conn, rating=4.6)
    assert N.feed(conn, 1)["states"] == 1
    conn.execute("INSERT INTO rankit_user_settings VALUES(1,'alerts_running_hot','0')")
    assert N.feed(conn, 1)["states"] == 0


def test_durumlar_yazilmaz(conn):
    """Durumlar TURETILIYOR: akisi okumak tabloya satir birakmamali,
    yoksa yarin ayni uyari yanlis olarak durur."""
    _seed_hot(conn, rating=4.6)
    N.feed(conn, 1)
    assert conn.execute("SELECT COUNT(*) n FROM rankit_notifications").fetchone()["n"] == 0


def test_durum_okundu_sayilmaz(conn):
    """"Mark read" bir durumu susturmamali — kosul hala dogru."""
    _seed_hot(conn, rating=4.6)
    N.mark_read(conn, 1)
    assert N.feed(conn, 1)["states"] == 1


# ── Kapanmaya bir mac kalan koleksiyon ───────────────────────────────────────

def _seed_list(conn, total, rated, owner=1):
    conn.execute("INSERT INTO rankit_lists VALUES(3,?,'Every London Derby','2026-09-01')", (owner,))
    for i in range(total):
        mid = 200 + i
        conn.execute("INSERT INTO rankit_matches VALUES(?,5,?,'finished',10,11)",
                     (mid, (utcnow() - timedelta(days=30)).isoformat(sep="T")))
        conn.execute("INSERT INTO rankit_list_items VALUES(3,?)", (mid,))
        if i < rated:
            conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,?,4.0)", (mid,))


def test_bir_mac_kala_uyari(conn):
    _seed_list(conn, total=12, rated=11)
    out = N.feed(conn, 1)
    item = [i for i in out["items"] if i["kind"] == "collection"][0]
    assert item["rated"] == 11 and item["total"] == 12
    assert item["match"]            # kalan macin adi yazilabilmeli


def test_kaydedilen_liste_de_uyarir(conn):
    """Baskasinin listesi, KAYDETTIYSEN. Bu dal once olu idi: rankit_follows'ta
    target_type='list' araniyordu ama o tablonun CHECK kisiti 'list'i hic
    kabul etmiyordu."""
    _seed_list(conn, total=4, rated=3, owner=2)
    assert not [i for i in N.feed(conn, 1)["items"] if i["kind"] == "collection"]
    conn.execute("INSERT INTO rankit_list_saves VALUES(3,1)")
    assert [i for i in N.feed(conn, 1)["items"] if i["kind"] == "collection"]


def test_iki_mac_kala_uyari_yok(conn):
    """"Bir mac kala" tam olarak BIR demek; yoksa liste hep uyarir."""
    _seed_list(conn, total=12, rated=10)
    assert [i for i in N.feed(conn, 1)["items"] if i["kind"] == "collection"] == []


def test_kapanmis_koleksiyon_uyarmaz(conn):
    _seed_list(conn, total=12, rated=12)
    assert [i for i in N.feed(conn, 1)["items"] if i["kind"] == "collection"] == []
