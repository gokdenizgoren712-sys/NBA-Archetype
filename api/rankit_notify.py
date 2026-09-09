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


def _stored(conn, user_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT n.id,n.kind,n.created_at,n.read_at,n.detail,
                  u.username actor,
                  n.match_id, n.entry_id, n.list_id, de.match_id entry_match_id,
                  h.short_name home, a.short_name away,
                  l.title list_title
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
           ORDER BY n.created_at DESC, n.id DESC
           LIMIT ?""", (user_id, FEED_LIMIT)).fetchall()
    return [{
        "id": f"n{r['id']}", "kind": r["kind"], "created_at": r["created_at"],
        "unread": r["read_at"] is None, "actor": r["actor"], "detail": r["detail"],
        "match_id": r["match_id"] or r["entry_match_id"], "list_id": r["list_id"],
        "match": f"{r['home']} vs {r['away']}" if r["home"] else None,
        "list_title": r["list_title"],
    } for r in rows]


def _hot_match(conn, user_id: int, tz_offset: int) -> Optional[dict]:
    """Bu RankIt gununde oynanmis, kullaniciyi ilgilendiren ve HENUZ
    puanlanmamis en yuksek puanli mac.

    "Seni ilgilendiren" tanimi uydurulmuyor: ya izleme listesinde ya da takip
    ettigi bir turnuvada. 3f'in metni "You watched it" diyor ama bunu bilemeyiz
    -- arayuz gercek sebebi yaziyor (`reason`).
    """
    # RankIt gunu 11:00 -> 11:00 (§7.2), yani takvim gunu DEGIL. Pencereyi
    # burada hesaplayip SQL'e iki damga olarak veriyoruz; date() aritmetigiyle
    # yaklasmak gece yarisindan sonra oynanan maclari yanlis gune atiyor.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    day = rankit_rank.rankit_day(now, tz_offset)
    opens = (datetime.fromisoformat(day)
             + timedelta(hours=rankit_rank.RANKIT_DAY_START_HOUR, minutes=-tz_offset))
    closes = opens + timedelta(days=1)
    row = conn.execute(
        """SELECT m.id, h.short_name home, a.short_name away,
                  (SELECT ROUND(AVG(e.rating),1) FROM rankit_diary_entries e
                   WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
                                  WHERE match_id=m.id AND rating IS NOT NULL GROUP BY user_id)) rating,
                  EXISTS(SELECT 1 FROM rankit_watchlist w
                         WHERE w.match_id=m.id AND w.user_id=?) watching
           FROM rankit_matches m
           JOIN rankit_teams h ON h.id=m.home_team_id
           JOIN rankit_teams a ON a.id=m.away_team_id
           WHERE m.status='finished'
             AND m.starts_at >= ? AND m.starts_at < ?
             AND NOT EXISTS(SELECT 1 FROM rankit_diary_entries e
                            WHERE e.match_id=m.id AND e.user_id=? AND e.rating IS NOT NULL)
             AND (EXISTS(SELECT 1 FROM rankit_watchlist w WHERE w.match_id=m.id AND w.user_id=?)
                  OR EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=?
                            AND f.target_type='competition' AND f.target_id=m.competition_id))
           ORDER BY rating DESC
           LIMIT 1""",
        (user_id, opens.isoformat(sep="T"), closes.isoformat(sep="T"),
         user_id, user_id, user_id)).fetchone()
    if not row or row["rating"] is None or float(row["rating"]) < HOT_FLOOR:
        return None
    return {
        "id": f"hot{row['id']}", "kind": "hot_match", "unread": True, "state": True,
        "match_id": row["id"], "match": f"{row['home']} vs {row['away']}",
        "rating": float(row["rating"]),
        "reason": "watchlist" if row["watching"] else "competition",
    }


def _closing_list(conn, user_id: int) -> Optional[dict]:
    """Bir mac kala kapanacak koleksiyon. Sahibi ya da takipcisi olduklari."""
    row = conn.execute(
        """SELECT l.id, l.title,
                  (SELECT COUNT(*) FROM rankit_list_items i WHERE i.list_id=l.id) total,
                  (SELECT COUNT(DISTINCT i.match_id) FROM rankit_list_items i
                   JOIN rankit_diary_entries e ON e.match_id=i.match_id
                   WHERE i.list_id=l.id AND e.user_id=? AND e.rating IS NOT NULL) rated
           FROM rankit_lists l
           WHERE (l.user_id=? OR EXISTS(SELECT 1 FROM rankit_follows f
                  WHERE f.user_id=? AND f.target_type='list' AND f.target_id=l.id))
           ORDER BY l.updated_at DESC""", (user_id, user_id, user_id)).fetchall()
    for r in row:
        if r["total"] > 1 and r["total"] - r["rated"] == 1:
            left = conn.execute(
                """SELECT h.short_name home, a.short_name away, m.starts_at, m.id
                   FROM rankit_list_items i JOIN rankit_matches m ON m.id=i.match_id
                   JOIN rankit_teams h ON h.id=m.home_team_id
                   JOIN rankit_teams a ON a.id=m.away_team_id
                   WHERE i.list_id=? AND NOT EXISTS(
                     SELECT 1 FROM rankit_diary_entries e
                     WHERE e.match_id=i.match_id AND e.user_id=? AND e.rating IS NOT NULL)
                   LIMIT 1""", (r["id"], user_id)).fetchone()
            if not left:
                continue
            return {
                "id": f"list{r['id']}", "kind": "collection", "unread": True, "state": True,
                "list_id": r["id"], "list_title": r["title"],
                "match_id": left["id"], "match": f"{left['home']} vs {left['away']}",
                "starts_at": left["starts_at"],
                "rated": r["rated"], "total": r["total"],
            }
    return None


def feed(conn, user_id: int, tz_offset: int = 0) -> dict:
    """Durumlar once (her zaman TONIGHT), sonra olaylar kendi zamanlarinda."""
    states = [item for item in (_hot_match(conn, user_id, tz_offset),
                                _closing_list(conn, user_id)) if item]
    events = _stored(conn, user_id)
    unread = sum(1 for e in events if e["unread"])
    return {"items": states + events, "unread": unread, "states": len(states)}


def mark_read(conn, user_id: int) -> int:
    """Yalnizca OLAYLAR isaretlenir. Durumlarin "okundu"su yok -- kosul
    gecince zaten kaybolurlar."""
    cur = conn.execute(
        "UPDATE rankit_notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL",
        (user_id,))
    return cur.rowcount
