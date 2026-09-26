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
        CREATE TABLE rankit_competitions(id INTEGER PRIMARY KEY, sport TEXT, name TEXT, season TEXT);
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
        CREATE TABLE rankit_blocks(blocker_id INTEGER, blocked_id INTEGER,
                                   PRIMARY KEY(blocker_id, blocked_id));
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
    c.execute("INSERT INTO rankit_competitions VALUES(5,'Football','Premier League','2026-27')")
    # Ayni turnuvanin GECEN sezonu: sezon turnuvadan bagimsiz (sahibin karari).
    c.execute("INSERT INTO rankit_competitions VALUES(4,'Football','Premier League','2025-26')")
    # The Hunt (api/rankit_hunt.py) bu sutunlari ve tablolari okuyor: 3f'nin
    # "bir mac kala kapaniyor" durumu artik koleksiyondan (§24), listeden degil.
    c.executescript(
        """
        ALTER TABLE rankit_diary_entries ADD COLUMN classic INTEGER DEFAULT 0;
        ALTER TABLE rankit_teams ADD COLUMN name TEXT;
        ALTER TABLE rankit_teams ADD COLUMN color TEXT;
        CREATE TABLE rankit_collections(
            id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT, subtitle TEXT,
            sport TEXT, season TEXT, competition_id INTEGER, team_id INTEGER, year INTEGER,
            declared_total INTEGER, opens_note TEXT, reward TEXT, active INTEGER NOT NULL DEFAULT 1,
            updated_by INTEGER, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE rankit_collection_items(collection_id INTEGER, match_id INTEGER,
                                             PRIMARY KEY(collection_id, match_id));
        CREATE UNIQUE INDEX idx_c_club ON rankit_collections(competition_id, team_id) WHERE kind='club_season';
        CREATE UNIQUE INDEX idx_c_year ON rankit_collections(year) WHERE kind='classics_year';
        UPDATE rankit_teams SET name = CASE id WHEN 10 THEN 'Arsenal' WHEN 11 THEN 'Tottenham' END;
        """
    )
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


def test_classic_puanlamadigin_maca_dair_gosterilmez(conn):
    """Classic damgasi bir HUKUM (BUILD §3). Maci puanlamamis birine dair
    olan olay akista gorunmez (BUILD §15); puanladiktan sonra gorunur."""
    conn.execute("INSERT INTO rankit_matches VALUES(200,5,'2026-09-10T19:00:00','finished',10,11)")
    N.notify(conn, 1, "classic", actor_id=2, match_id=200)
    assert N.feed(conn, 1)["items"] == []
    # Yildizsiz izleme kaydi da puan degil.
    conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,200,NULL)")
    assert N.feed(conn, 1)["items"] == []
    conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,200,4.5)")
    items = N.feed(conn, 1)["items"]
    assert [i["kind"] for i in items] == ["classic"]


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


def _seed_hot(conn, *, rating, watchlisted=True, when=None, rated_by_user=False, raters=20):
    at = when or _tonight()
    conn.execute("""INSERT INTO rankit_matches
        VALUES(100,5,?, 'finished',10,11)""", (at.isoformat(sep="T"),))
    # Toplulugun puani: baska kullanicilardan. BUILD §5.5 -- isi ancak 20
    # gercek puanla var; eskiden TEK puan sicak sayiliyordu.
    conn.executemany("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(?,100,?)",
                     [(2 + i, rating) for i in range(raters)])
    if rated_by_user:
        conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,100,4.0)")
    if watchlisted:
        conn.execute("INSERT INTO rankit_watchlist VALUES(1,100)")


def test_sicak_mac_uyarisi_esik_ustunde(conn):
    _seed_hot(conn, rating=4.6)
    out = N.feed(conn, 1)
    assert out["states"] == 1
    hot = out["items"][0]
    assert hot["kind"] == "hot_match"
    # BUILD §15: puanlamadigin maca dair bildirim puani TASIMAZ. "Running hot"
    # sayisiz da dogru; 4.6 yanitta olsaydi arayuz gizlese bile sizardi.
    assert "rating" not in hot
    assert hot["reason"] == "watchlist"
    # 3f metni tam adlarla ("Arsenal vs Tottenham is the highest-rated...").
    assert hot["match"] == "Arsenal vs Tottenham" and hot["match_short"] == "ARS vs TOT"


def test_yirmi_puan_olmadan_sicak_mac_yok(conn):
    """BUILD §5.5: 19 puanla isi yok, dolayisiyla "running hot" da yok."""
    _seed_hot(conn, rating=4.9, raters=19)
    assert N.feed(conn, 1)["states"] == 0


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

def _seed_collection(conn, total, rated, declared=None):
    """Sahibin seckisi (The Hunt): `total` bilinen mac, `rated`'i puanli."""
    cur = conn.execute("""INSERT INTO rankit_collections(kind,title,declared_total)
                          VALUES('curated','Every London Derby',?)""", (declared,))
    for i in range(total):
        mid = 200 + i
        conn.execute("INSERT INTO rankit_matches VALUES(?,5,?,'finished',10,11)",
                     (mid, (utcnow() - timedelta(days=30)).isoformat(sep="T")))
        conn.execute("INSERT INTO rankit_collection_items VALUES(?,?)", (cur.lastrowid, mid))
        if i < rated:
            conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,?,4.0)", (mid,))
    return cur.lastrowid


def _closing(conn):
    return [i for i in N.feed(conn, 1)["items"] if i["kind"] == "collection"]


def test_bir_mac_kala_uyari(conn):
    cid = _seed_collection(conn, total=12, rated=11)
    item = _closing(conn)[0]
    assert item["collected"] == 11 and item["total"] == 12
    assert item["collection_id"] == cid and item["collection_title"] == "Every London Derby"
    assert item["match"] == "Arsenal vs Tottenham" and item["match_short"] == "ARS vs TOT"
    assert item["viewer_rated"] is False                                     # kalan mac, puansiz


def test_liste_bir_mac_kala_uyarmaz(conn):
    """§24: liste kullanicinin rafi, tamamlanacak bir sey degil. Eskiden bu
    durum listelerden uretiliyordu."""
    conn.execute("INSERT INTO rankit_lists VALUES(3,1,'My derbies','2026-09-01')")
    for i in range(4):
        conn.execute("INSERT INTO rankit_matches VALUES(?,5,?,'finished',10,11)",
                     (300 + i, (utcnow() - timedelta(days=30)).isoformat(sep="T")))
        conn.execute("INSERT INTO rankit_list_items VALUES(3,?)", (300 + i,))
        if i < 3:
            conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,?,4.0)", (300 + i,))
    assert _closing(conn) == []


def test_iki_mac_kala_uyari_yok(conn):
    """"Bir mac kala" tam olarak BIR demek; yoksa koleksiyon hep uyarir."""
    _seed_collection(conn, total=12, rated=10)
    assert _closing(conn) == []


def test_kapanmis_koleksiyon_uyarmaz(conn):
    _seed_collection(conn, total=12, rated=12)
    assert _closing(conn) == []


def test_planlanmamis_fikstur_kaldiysa_bir_mac_kala_denmez(conn):
    """12'lik seckinin 11 maci biliniyor ve hepsi puanli: kalan tek mac henuz
    tarihsiz -- "Crystal Palace vs Arsenal, Sunday" diye bir satir kurulamaz."""
    _seed_collection(conn, total=11, rated=11, declared=12)
    assert _closing(conn) == []


def test_olaylar_izleyenin_puanini_tasir(conn):
    """13a'nin spoiler derecesi istemcide: puanladigin maca dair olay tam
    metin, puanlamadigina dair olan skor saklanarak."""
    conn.execute("INSERT INTO rankit_matches VALUES(400,5,'2026-09-01T19:00:00Z','finished',10,11)")
    conn.execute("INSERT INTO rankit_diary_entries(user_id,match_id,rating) VALUES(1,400,4.0)")
    N.notify(conn, 1, "broadcast", match_id=400)
    N.notify(conn, 1, "follow", actor_id=2)
    items = {i["kind"]: i for i in N.feed(conn, 1)["items"]}
    assert items["broadcast"]["viewer_rated"] is True and items["follow"]["viewer_rated"] is None


def test_gecen_sezonu_takip_eden_bu_sezon_da_uyarilir(conn):
    """Takip gecen sezonun satirinda (4), mac bu sezonun satirinda (5). Sezon
    turnuvadan bagimsiz: "Premier League"i takip etmek her sezonunu takip
    etmek. Id esitligiyle bu uyari sezon donunce sessizce dusuyordu."""
    _seed_hot(conn, rating=4.6, watchlisted=False)
    assert N.feed(conn, 1)["states"] == 0
    conn.execute("INSERT INTO rankit_follows VALUES(1,'competition',4)")
    assert N.feed(conn, 1)["states"] == 1
