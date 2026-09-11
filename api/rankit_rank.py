# -*- coding: utf-8 -*-
"""Rank ve Streak — HANDOFF.md §7.

Iki AYRI sistem, karistirilmasi kolay:

  Rank   birikimli, ASLA dusmez (yalnizca silme ile), yedi kademe.
  Streak kirilgan, sifirlanir.

Bu zitlik tasarimin kendisi (§7), o yuzden ikisi tek bir "skor"a
katlanmiyor ve ayni bilesende yan yana gosterilmiyor.

Sahibin verdigi kararlar (2026-09-08):
  * Puanlar DEFTERDE tutulur, toplam degil.
  * "Gecesinde puanlama" RankIt gunune gore olculur, takvim gunune degil.
  * Dinlenme gecesi TAKIP EDILEN TURNUVALARA bakar.
  * Companion esigi: futbolda 45 dakika, baskette iki ceyrek.
  * Puan degerleri A/B testi ile belirlenecek -> kodda sabit degil, tabloda.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from .db import get_conn

# ── RankIt gunu ───────────────────────────────────────────────────────────────
# Istemci bunu rankitDayContext() icinde 11:00 olarak tanimliyor
# (RankItPrototype.jsx). Sunucu ayni siniri kullanmak ZORUNDA, yoksa gece
# 23:00'te puanlanan bir mac istemcide "bu RankIt gunu", sunucuda "dun" olur
# ve 15 puanlik odul sessizce 5 puana duser.
RANKIT_DAY_START_HOUR = 11

# §7.1 kademeleri. Esikler sabit; PUANLAR degil.
TIERS = [
    (0, "New Voice"),
    (250, "Regular"),
    (750, "Home End"),
    (1750, "Terrace Regular"),
    (3500, "Season Ticket"),
    (7000, "Club Historian"),
    (15000, "Archivist"),
]

# Varsayilan A kolu — §7.1'in yazdigi degerler. B kolu A/B testinde eklenir.
DEFAULT_RULES = [
    ("rate_same_day", "A", 15, "Rated within the RankIt day the match was played"),
    ("rate_late", "A", 5, "Rated after that RankIt day closed"),
    ("respect", "A", 2, "A review of yours earned a respect (capped per review)"),
    ("companion", "A", 20, "Sat the match in the companion past the presence threshold"),
    ("collection", "A", 100, "Closed a collection"),
    ("season", "A", 300, "Followed a competition end to end for a season"),
]

# §7.1: tek bir viral yorum kademe satin alamasin diye inceleme basina tavan.
RESPECT_CAP_PER_REVIEW = 50

# Sahibin kurali. Futbol yarisi 45 dakika; NBA ceyregi 12 dakika, iki ceyrek 24.
PRESENCE_SECONDS = {"Football": 45 * 60, "Basketball": 24 * 60}
PRESENCE_DEFAULT = 45 * 60


def seed_rules(conn) -> None:
    """Varsayilan kollari yazar. Idempotent — mevcut degerleri EZMEZ, cunku
    A/B testi sirasinda degistirilmis bir puani her acilista geri almak
    testin kendisini bozar."""
    conn.executemany(
        "INSERT OR IGNORE INTO rankit_point_rules(kind,variant,points,note) VALUES(?,?,?,?)",
        DEFAULT_RULES,
    )


def variant_for(user_id: int, kind: str) -> str:
    """Kullaniciyi deterministik olarak bir kola atar.

    Rastgele degil hash: ayni kullanici her istekte ayni kolu gorur, ve
    sunucu yeniden baslayinca kol degismez. Kind'i de karistiriyoruz ki
    kollar odul turleri arasinda bagimsiz olsun.
    """
    digest = hashlib.sha256(f"{user_id}:{kind}".encode()).hexdigest()
    return "A" if int(digest[:8], 16) % 2 == 0 else "B"


def points_for(conn, kind: str, user_id: int) -> tuple[int, str]:
    """(puan, kol). Kullanicinin kolu tabloda yoksa A'ya duser; A da yoksa 0 —
    tanimsiz bir odul sessizce puan uretmemeli."""
    wanted = variant_for(user_id, kind)
    row = conn.execute(
        "SELECT points,variant FROM rankit_point_rules WHERE kind=? AND variant=?",
        (kind, wanted),
    ).fetchone()
    if row is None:
        row = conn.execute(
            "SELECT points,variant FROM rankit_point_rules WHERE kind=? AND variant='A'",
            (kind,),
        ).fetchone()
    if row is None:
        return 0, wanted
    return int(row["points"]), str(row["variant"])


def award(conn, user_id: int, kind: str, subject_type: str, subject_id: int) -> int:
    """Defterе bir odul yazar. Zaten yazilmissa 0 doner (hic odenmedi).

    §7.1 "puan mac basina bir kez odenir": idempotensi UNIQUE kisitindan
    geliyor, uygulama kodundan degil — iki es zamanli kayit da ikinci kez
    odeyemez.
    """
    points, variant = points_for(conn, kind, user_id)
    if points <= 0:
        return 0
    cur = conn.execute(
        """INSERT OR IGNORE INTO rankit_points
             (user_id,kind,points,subject_type,subject_id,variant)
           VALUES(?,?,?,?,?,?)""",
        (user_id, kind, points, subject_type, subject_id, variant),
    )
    return points if cur.rowcount else 0


def revoke(conn, user_id: int, subject_type: str, subject_id: int) -> int:
    """§7.1: "kaydi silmek puanlarini da siler." Kac puan geri alindigini doner."""
    rows = conn.execute(
        "SELECT COALESCE(SUM(points),0) n FROM rankit_points WHERE user_id=? AND subject_type=? AND subject_id=?",
        (user_id, subject_type, subject_id),
    ).fetchone()
    conn.execute(
        "DELETE FROM rankit_points WHERE user_id=? AND subject_type=? AND subject_id=?",
        (user_id, subject_type, subject_id),
    )
    return int(rows["n"] or 0)


# ── Turnuva kimligi: sezondan BAGIMSIZ ──────────────────────────────────────
# Sahibin karari (2026-09-12): "Season is a season whether it's 15-16 or
# 26-27, only the competition changes." rankit_competitions sezon basina bir
# satir tutuyor (Premier League 2025-26 ve 2026-27 iki satir), ama bir turnuva
# BIR sey: onu takip etmek her sezonunu takip etmek demek. Satir kimligi yeni
# sezonda degisiyor ve id esitligiyle kurulan bir takip sezon donunce SESSIZCE
# dusuyordu. Kimlik (sport, name).
#
# Tek bir `?` (kullanici) bekler; icinde `mc` maçin turnuva satiri olmali.
FOLLOWED_COMPETITION_SQL = """EXISTS(SELECT 1 FROM rankit_follows f
    JOIN rankit_competitions fc ON fc.id=f.target_id
    WHERE f.user_id=? AND f.target_type='competition'
      AND fc.sport=mc.sport AND fc.name=mc.name)"""


def followed_competition_ids(conn, user_id: int) -> list[int]:
    """Takip edilen turnuvalarin TUM sezon satirlari."""
    return [int(r[0]) for r in conn.execute(
        """SELECT DISTINCT c2.id FROM rankit_follows f
           JOIN rankit_competitions c1 ON c1.id=f.target_id
           JOIN rankit_competitions c2 ON c2.sport=c1.sport AND c2.name=c1.name
           WHERE f.user_id=? AND f.target_type='competition'""", (user_id,))]


def followed_competition_count(conn, user_id: int) -> int:
    """Takip edilen turnuva SAYISI -- satir degil aile. Eski bir sezon satirini
    ve yenisini birlikte takip eden biri iki turnuva takip etmiyor."""
    row = conn.execute(
        """SELECT COUNT(DISTINCT c.sport || '|' || c.name) n FROM rankit_follows f
           JOIN rankit_competitions c ON c.id=f.target_id
           WHERE f.user_id=? AND f.target_type='competition'""", (user_id,)).fetchone()
    return int(row["n"] or 0)


def total_points(conn, user_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(points),0) n FROM rankit_points WHERE user_id=?", (user_id,)
    ).fetchone()
    return int(row["n"] or 0)


def tier_for(points: int) -> dict:
    """Kademe + bir sonrakine ilerleme. §7.3: profilde kademe VE ilerleme
    gosteriliyor, incelemenin yaninda yalnizca kademe adi."""
    index = 0
    for i, (floor, _name) in enumerate(TIERS):
        if points >= floor:
            index = i
    floor, name = TIERS[index]
    nxt = TIERS[index + 1] if index + 1 < len(TIERS) else None
    return {
        "tier": index + 1,
        "name": name,
        "points": points,
        "floor": floor,
        "next_name": nxt[1] if nxt else None,
        "next_at": nxt[0] if nxt else None,
        # Son kademede ilerleme 1.0; "sonsuza kadar %99" gostermek yanlis olur.
        "progress": 1.0 if not nxt else round((points - floor) / (nxt[0] - floor), 4),
    }


# ── RankIt gunu yardimcilari ─────────────────────────────────────────────────

def _as_dt(value) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def rankit_day(moment: datetime, tz_offset_minutes: int = 0) -> str:
    """Bir ana denk gelen RankIt gununun etiketi (YYYY-MM-DD).

    tz_offset_minutes kullanicinin saat dilimi (JS getTimezoneOffset'in
    ISARETI TERS, istemci duzeltip gonderir). §7.2 "kendi saat diliminde"
    diyor, yani sunucunun UTC'si tek basina yeterli degil.
    """
    local = moment + timedelta(minutes=tz_offset_minutes)
    if local.hour < RANKIT_DAY_START_HOUR:
        local -= timedelta(days=1)
    return local.date().isoformat()


# Cevrimdisi puanlama (ekran 3l): "Your rating is saved on this phone. It
# uploads when you're back." Yukleme anini puanlama ani saymak, gece
# puanlayip ertesi ogleden sonra baglanan birinin serisini ve "gecesinde"
# odulunu sessizce silerdi -- ekranin verdigi soz bosa cikardi. O yuzden
# telefonun damgasi kabul ediliyor, ama DAR bir pencerede: gelecekte olamaz
# (5 dk saat kaymasi payi), mac baslamadan once olamaz, ve en fazla 36 saat
# eski olabilir. Pencere disindaysa puan YINE kaydedilir, yalnizca an sunucu
# saati olur -- kullanicinin verisi damgadan onemli.
OFFLINE_GRACE_HOURS = 36
CLOCK_SKEW_MINUTES = 5


def accepted_rated_at(claimed, match_started, now=None):
    """Telefonun bildirdigi puanlama anini kabul et ya da None don."""
    if claimed is None:
        return None
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    moment = _as_dt(claimed)
    started = _as_dt(match_started)
    if moment is None:
        return None
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc).replace(tzinfo=None)
    if moment > now + timedelta(minutes=CLOCK_SKEW_MINUTES):
        return None
    if moment < now - timedelta(hours=OFFLINE_GRACE_HOURS):
        return None
    if started is not None and moment < started:
        return None
    return moment


def award_for_rating(conn, user_id: int, match_id: int, tz_offset_minutes: int = 0,
                     at: Optional[datetime] = None) -> dict:
    """Bir maci puanlamanin oduelu.

    §7.1 iki oran veriyor: oynandigi RankIt gununde 15, sonra 5. Hangisi
    oldugu maçin baslangicina ve puanlamanin ANINA bakilarak belirlenir.
    `at`: cevrimdisi yapilip sonra yuklenen puanin kabul edilmis ani
    (bkz. accepted_rated_at); verilmezse simdi.
    """
    row = conn.execute("SELECT starts_at FROM rankit_matches WHERE id=?", (match_id,)).fetchone()
    started = _as_dt(row["starts_at"]) if row else None
    now = at or datetime.now(timezone.utc).replace(tzinfo=None)
    same_day = bool(
        started
        and rankit_day(started, tz_offset_minutes) == rankit_day(now, tz_offset_minutes)
    )
    kind = "rate_same_day" if same_day else "rate_late"
    # Iki tur ayni maca odenemez: once digerini temizle ki bir kullanici
    # gec puanlayip sonra silip yeniden puanlayarak 15'e yukselemesin.
    other = "rate_late" if same_day else "rate_same_day"
    conn.execute(
        "DELETE FROM rankit_points WHERE user_id=? AND kind=? AND subject_type='match' AND subject_id=?",
        (user_id, other, match_id),
    )
    gained = award(conn, user_id, kind, "match", match_id)
    return {"kind": kind, "points": gained, "same_day": same_day}


# ── Streak ───────────────────────────────────────────────────────────────────

def streak_for(conn, user_id: int, tz_offset_minutes: int = 0) -> dict:
    """Ardisik geceler (§7.2).

    Bir gece SAYILIR: o RankIt gununde oynanan en az bir maci ayni RankIt
    gununde puanladiysan.
    Bir gece DINLENME: takip ettigin hicbir turnuvada o gun mac yoksa —
    seriyi ne uzatir ne kirar. "Kimse milli araya seri kaptirmaz."
    Bir gece KIRAR: takip ettigin bir macin oynandigi gunde puanlamadiysan.
    """
    rated_days: set[str] = set()
    for row in conn.execute(
        """SELECT e.created_at, m.starts_at
           FROM rankit_diary_entries e JOIN rankit_matches m ON m.id=e.match_id
           WHERE e.user_id=?""",
        (user_id,),
    ):
        started = _as_dt(row["starts_at"])
        logged = _as_dt(row["created_at"])
        if not started or not logged:
            continue
        # watched_date DEGIL created_at: watched_date bir TAKVIM gunu ve
        # RankIt gunu iki takvim gunune yayiliyor (11:00 -> 11:00). Gece
        # 02:00'de yapilan puanlama ile ertesi ogleden sonra yapilan ayni
        # takvim gununu tasiyor, ama biri ayni RankIt gecesi digeri degil.
        # Zaman damgasi bu ayrimi yapabilen tek alan.
        if rankit_day(logged, tz_offset_minutes) == rankit_day(started, tz_offset_minutes):
            rated_days.add(rankit_day(started, tz_offset_minutes))

    # Takip edilen turnuvalarin HER sezonu (bkz. followed_competition_ids):
    # gecen sezonun satirini takip eden birinin bu sezonki dinlenme geceleri
    # de sayilmali.
    followed = followed_competition_ids(conn, user_id)
    # Takip edilen turnuvalarda mac olan gunler. Hicbiri takip edilmiyorsa
    # her gun dinlenme gunudur ve seri yalnizca puanlanan gunlerden orulur.
    active_days: set[str] = set()
    if followed:
        marks = ",".join("?" * len(followed))
        for row in conn.execute(
            f"SELECT starts_at FROM rankit_matches WHERE competition_id IN ({marks})",
            followed,
        ):
            started = _as_dt(row["starts_at"])
            if started and started <= datetime.now(timezone.utc).replace(tzinfo=None):
                active_days.add(rankit_day(started, tz_offset_minutes))

    today = rankit_day(datetime.now(timezone.utc).replace(tzinfo=None), tz_offset_minutes)
    current = _walk(today, rated_days, active_days)
    best = _best(rated_days, active_days)
    return {
        "current": current,
        "best": max(best, current),
        "rated_nights": len(rated_days),
        "followed_competitions": followed_competition_count(conn, user_id) if followed else 0,
        # Takip yoksa dinlenme kurali uygulanamaz; arayuz bunu soyleyebilsin.
        "rest_nights_enforced": bool(followed),
    }


def _next_day(day: str) -> str:
    return (datetime.fromisoformat(day) + timedelta(days=1)).date().isoformat()


def _prev_day(day: str) -> str:
    return (datetime.fromisoformat(day) - timedelta(days=1)).date().isoformat()


def _walk(from_day: str, rated: set[str], active: set[str], limit: int = 400) -> int:
    """Bugunden geriye yuruyerek seriyi say. Dinlenme gunleri atlanir."""
    count = 0
    day = from_day
    # Bugun henuz puanlanmamis olabilir; seri dun'den de baslayabilir.
    if day not in rated:
        day = _prev_day(day)
    for _ in range(limit):
        if day in rated:
            count += 1
        elif day in active:
            break          # oynanan mac vardi, puanlanmadi -> kirildi
        # aksi halde dinlenme gunu: ne say ne kir, geriye devam et
        day = _prev_day(day)
    return count


def _best(rated: set[str], active: set[str]) -> int:
    if not rated:
        return 0
    best = 0
    for start in rated:
        # Her puanlanan gunu bir serinin sonu kabul edip geriye yuru.
        best = max(best, _walk(start, rated, active))
    return best
