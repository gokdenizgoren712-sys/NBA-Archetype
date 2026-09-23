# -*- coding: utf-8 -*-
"""Bildirimler — HANDOFF ekran 3f.

Ayrimi bir cumle tasiyor: **olaylar yazilir, durumlar turetilir.**

Bir olay olur ve biter — biri respect verdi, biri yanitladi, biri takip etti.
Onun bir zamani ve bir failleri var, gecmise donuk dogru kalir, ve "okundu"
isaretlenebilir. Satir olarak yazilir.

Bir durum ise su an dogrudur: bu gece oynanip puanlanmamis sicak mac, bir mac
kala kapanacak koleksiyon. Yazilsaydi yarin YALAN olurdu ("gece yarisindan
once puanla" -- hangi gece?). O yuzden okuma aninda hesaplanir ve kosul
gecince kendiliginden kaybolur. "Okundu" isaretlenmezler cunku isaretlenecek
bir sey yok: durum ya vardir ya yoktur.

Metin de burada uretilmiyor. Satirlar yalnizca REFERANS tasiyor (kim, hangi
mac, hangi liste); cumleyi arayuz kuruyor. Kayitli ingilizce cumleler ifadeyi
donduruyor ve veri degisince sessizce eskiyor.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from . import rankit_rank
from . import rankit_hunt

# Bir maci "sicak" sayan taban. 3f'in etiketi "RUNNING HOT - 4.6"; her maca
# bunu demek uyariyi degersizlestirir.
HOT_FLOOR = 4.0
FEED_LIMIT = 40


def notify(conn, user_id: Optional[int], kind: str, *, actor_id: Optional[int] = None,
           match_id: Optional[int] = None, entry_id: Optional[int] = None,
           list_id: Optional[int] = None, detail: Optional[str] = None) -> None:
    """Bir olayi yaz. Kendine bildirim yok; ayni olay iki kez yazilmaz.

    Sessizce basarisiz olmasi KASITLI: bir bildirimin yazilamamasi respect
    vermeyi ya da yorum birakmayi dusurmemeli.
    """
    if not user_id or user_id == actor_id:
        return
    try:
        conn.execute(
            """INSERT OR IGNORE INTO rankit_notifications
               (user_id,kind,actor_id,match_id,entry_id,list_id,detail)
               VALUES(?,?,?,?,?,?,?)""",
            (user_id, kind, actor_id, match_id, entry_id, list_id, detail))
    except Exception:
        pass


# 14b bildirim acilir menusu dort kanal grubunda (HANDOFF: Heat alerts,
# Streak, Social, Collections). Yayinci eklendi bildirimi izleme istegine
# dair -- isi uyarilariyla ayni grupta.
CHANNELS = {"hot_match": "heat", "broadcast": "heat", "classic": "social", "reply": "social",
            "respect": "social", "follow": "social", "list_respect": "social", "collection": "collections"}


def _stored(conn, user_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT n.id,n.kind,n.created_at,n.read_at,n.detail,
                  u.username actor,
                  n.match_id, n.entry_id, n.list_id, de.match_id entry_match_id,
                  h.short_name home, a.short_name away,
                  h.name home_name, a.name away_name,
                  l.title list_title,
                  -- 13a'nin uc spoiler derecesi istemcide secilir; bunun icin
                  -- izleyenin o maci puanlayip puanlamadigini bilmesi gerekir.
                  EXISTS(SELECT 1 FROM rankit_diary_entries v WHERE v.user_id=n.user_id
                         AND v.match_id=COALESCE(n.match_id, de.match_id) AND v.rating IS NOT NULL) viewer_rated
           FROM rankit_notifications n
           LEFT JOIN users u ON u.id=n.actor_id
           -- Mac ya dogrudan bagli (classic, broadcast) ya da KAYIT
           -- uzerinden (respect, reply). Ikinci yol olmadan "respected your
           -- review of ..." cumlesinin maci bos kaliyordu.
           LEFT JOIN rankit_diary_entries de ON de.id=n.entry_id
           LEFT JOIN rankit_matches m ON m.id=COALESCE(n.match_id, de.match_id)
           LEFT JOIN rankit_teams h ON h.id=m.home_team_id
           LEFT JOIN rankit_teams a ON a.id=m.away_team_id
           LEFT JOIN rankit_lists l ON l.id=n.list_id
           WHERE n.user_id=?
             -- Classic bir HUKUM: puanlamadigin maca dair olani hic gosterme
             -- (BUILD §15). Yazim aninda da suzuluyor; bu, suzgecten once
             -- yazilmis satirlari ve sonradan kaldirilmis puanlari kapsar.
             AND NOT (n.kind='classic' AND NOT EXISTS(
                 SELECT 1 FROM rankit_diary_entries r
                 WHERE r.user_id=n.user_id AND r.match_id=n.match_id AND r.rating IS NOT NULL))
           ORDER BY n.created_at DESC, n.id DESC
           LIMIT ?""", (user_id, FEED_LIMIT + 1)).fetchall()
    return [{
        "id": f"n{r['id']}", "kind": r["kind"], "channel": CHANNELS.get(r["kind"], "social"),
        "created_at": r["created_at"],
        "unread": r["read_at"] is None, "actor": r["actor"], "detail": r["detail"],
        # "Every row opens the exact surface, never Home": yanit / respect
        # olayinin dizisi (4a) icin inceleme kimligi.
        "entry_id": r["entry_id"],
        "match_id": r["match_id"] or r["entry_match_id"], "list_id": r["list_id"],
        # 3f: "Arsenal vs Tottenham is the highest-rated match..." -- metin
        # TAM adlarla (ekran okuyucu "A R S vs T O T" okumasin); kart gibi dar
        # yerler icin kisa bicim ayri alanda.
        "match": f"{r['home_name']} vs {r['away_name']}" if r["home"] else None,
        "match_short": f"{r['home']} vs {r['away']}" if r["home"] else None,
        "list_title": r["list_title"],
        "viewer_rated": bool(r["viewer_rated"]) if (r["match_id"] or r["entry_match_id"]) else None,
    } for r in rows]


def _hot_match(conn, user_id: int, tz_offset: int) -> Optional[dict]:
    """Bu RankIt gununde oynanmis, kullaniciyi ilgilendiren ve HENUZ
    puanlanmamis en yuksek puanli mac.

    "Seni ilgilendiren" tanimi uydurulmuyor: ya izleme listesinde ya da takip
    ettigi bir turnuvada. 3f'in metni "You watched it" diyor ama bunu bilemeyiz
    -- arayuz gercek sebebi yaziyor (`reason`).
    """
    # 3g'deki "Running hot" anahtari. Kapaliysa uyari HIC uretilmiyor --
    # istemcide gizlemek yetmez, cunku dogum yeri burasi.
    off = conn.execute(
        """SELECT 1 FROM rankit_user_settings
           WHERE user_id=? AND key='alerts_running_hot' AND value='0'""", (user_id,)).fetchone()
    if off:
        return None
    # RankIt gunu 11:00 -> 11:00 (§7.2), yani takvim gunu DEGIL. Pencereyi
    # burada hesaplayip SQL'e iki damga olarak veriyoruz; date() aritmetigiyle
    # yaklasmak gece yarisindan sonra oynanan maclari yanlis gune atiyor.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    day = rankit_rank.rankit_day(now, tz_offset)
    opens = (datetime.fromisoformat(day)
             + timedelta(hours=rankit_rank.RANKIT_DAY_START_HOUR, minutes=-tz_offset))
    closes = opens + timedelta(days=1)
    row = conn.execute(
        """SELECT * FROM (SELECT m.id, h.short_name home, a.short_name away,
                  h.name home_name, a.name away_name,
                  (SELECT ROUND(AVG(e.rating),1) FROM rankit_diary_entries e
                   WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
                                  WHERE match_id=m.id AND rating IS NOT NULL GROUP BY user_id)) rating,
                  (SELECT COUNT(DISTINCT e.user_id) FROM rankit_diary_entries e
                   WHERE e.match_id=m.id AND e.rating IS NOT NULL) ratings,
                  EXISTS(SELECT 1 FROM rankit_watchlist w
                         WHERE w.match_id=m.id AND w.user_id=?) watching
           FROM rankit_matches m
           JOIN rankit_teams h ON h.id=m.home_team_id
           JOIN rankit_teams a ON a.id=m.away_team_id
           JOIN rankit_competitions mc ON mc.id=m.competition_id
           WHERE m.status='finished'
             AND m.starts_at >= ? AND m.starts_at < ?
             AND NOT EXISTS(SELECT 1 FROM rankit_diary_entries e
                            WHERE e.match_id=m.id AND e.user_id=? AND e.rating IS NOT NULL)
             AND (EXISTS(SELECT 1 FROM rankit_watchlist w WHERE w.match_id=m.id AND w.user_id=?)
                  -- Turnuva takibi SEZONDAN bagimsiz (rankit_rank.FOLLOWED_COMPETITION_SQL).
                  OR """ + rankit_rank.FOLLOWED_COMPETITION_SQL + """))
           -- BUILD §5.5: 20 gercek puan olmadan isi yok -- "running hot" de
           -- bir isi degeri. Tek puanli bir mac sicak sayilmaz.
           WHERE ratings >= ? AND rating >= ?
           ORDER BY rating DESC
           LIMIT 1""",
        (user_id, opens.isoformat(sep="T"), closes.isoformat(sep="T"),
         user_id, user_id, user_id,
         rankit_rank.MIN_COMMUNITY_RATINGS, HOT_FLOOR)).fetchone()
    if not row:
        return None
    return {
        "id": f"hot{row['id']}", "kind": "hot_match", "channel": "heat", "unread": True, "state": True,
        # Puan YOK: bu mac kullanicinin puanlamadigi bir mac (sorgunun kosulu)
        # ve BUILD §15 "no notification spoils an unrated match". "Running hot"
        # cumlesi sayisiz da dogru; 4.6'yi yanitta tasimak onu sizdirmakti.
        "match_id": row["id"], "match": f"{row['home_name']} vs {row['away_name']}",
        "match_short": f"{row['home']} vs {row['away']}",
        "reason": "watchlist" if row["watching"] else "competition",
        "viewer_rated": False,
    }


def _closing_collection(conn, user_id: int) -> Optional[dict]:
    """3f "Every London Derby is one match from closing. Crystal Palace vs
    Arsenal, Sunday." -- The Hunt koleksiyonu (§24: koleksiyon URUNUN).

    Eskiden bu durum kullanicinin kendi LISTELERINDEN uretiliyordu; liste bir
    raf, tamamlanacak bir sey degil. Yalnizca kapanabilen koleksiyonlar:
    secki ve kulup sezonu (yilin Classic'leri dinamik, "kapanmaz"); tarihi
    aciklanmamis fikstur kaldiysa "bir mac kala" denmez.
    """
    for col in rankit_hunt.hunt_for(conn, user_id):
        if (col["kind"] == "classics_year" or col["status"] != "active"
                or col["remaining"] != 1 or col["unscheduled"]):
            continue
        detail = rankit_hunt.summarize(conn, rankit_hunt.get(conn, col["id"]), user_id, with_members=True)
        left_ids = detail["open_ids"] + detail["upcoming_ids"]
        if not left_ids:
            continue
        left = rankit_hunt._match_line(conn, left_ids[0])
        return {
            "id": f"col{col['id']}", "kind": "collection", "channel": "collections", "unread": True, "state": True,
            "collection_id": col["id"], "collection_title": col["title"],
            # Gecis uyumu: mevcut arayuz (Alerts.jsx) bu durumu hala liste
            # alanlariyla okuyor. Yanlis yere goturecegi icin `list_id` YOK --
            # satir mac'a duser. Codex `collection_id` / `collected`e gecince
            # bu iki takma ad kaldirilacak.
            "list_title": col["title"], "rated": col["collected"],
            "match_id": left["match_id"], "match": f"{left['home_name']} vs {left['away_name']}",
            "match_short": f"{left['home_short']} vs {left['away_short']}",
            "starts_at": left["starts_at"], "collected": col["collected"], "total": col["total"],
            "viewer_rated": False,
        }
    return None


def feed(conn, user_id: int, tz_offset: int = 0) -> dict:
    """Durumlar once (her zaman TONIGHT), sonra olaylar kendi zamanlarinda."""
    states = [item for item in (_hot_match(conn, user_id, tz_offset),
                                _closing_collection(conn, user_id)) if item]
    events = _stored(conn, user_id)
    # "That's all" yalnizca liste GERCEKTEN bittiyse (HANDOFF §4.10): akis
    # FEED_LIMIT'te kesiliyor, bir fazlasi okunup kesildigi soyleniyor.
    has_more = len(events) > FEED_LIMIT
    events = events[:FEED_LIMIT]
    unread = sum(1 for e in events if e["unread"])
    return {"items": states + events, "unread": unread, "states": len(states), "has_more": has_more}


def mark_read(conn, user_id: int) -> int:
    """Yalnizca OLAYLAR isaretlenir. Durumlarin "okundu"su yok -- kosul
    gecince zaten kaybolurlar."""
    cur = conn.execute(
        "UPDATE rankit_notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL",
        (user_id,))
    return cur.rowcount
