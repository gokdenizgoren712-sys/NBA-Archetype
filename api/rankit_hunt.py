# -*- coding: utf-8 -*-
"""The Hunt (2m / 2n): koleksiyonlar -- urunun, kullanicinin degil (BUILD §24).

Sahibin karari (2026-09-22): kural + admin. Uc tur:
  curated        sahibin admin ucundan tanimladigi secki (ör. "Every London
                 Derby"). Maclar elle, toplam (declared_total) elle: tarihi
                 henuz aciklanmamis fikstur SAYIYA girer ama uydurulmaz.
  club_season    bir kulubun bir lig sezonundaki TUM maclari ("The 38").
                 Veriden kurulur; beklenen mac sayisi lig biciminden: cift
                 devreli liglerde 2 x (takim - 1), NBA'de 82. Bilinen fikstur
                 bundan azsa fark "planlanmamis" (NBA Cup eleme maclari gibi).
  classics_year  bir takvim yilinin Instant Classic'leri (topluluk oyu, §5.5
                 esigi + Classic payi). Toplam dinamik; planlanmamis kavrami yok.

Toplanan = kullanicinin PUANLADIGI uye maclar (yildizsiz izleme kaydi puan
degil, §12.1). Tamamlama odulu: yalnizca club_season -- takip ettigin kulubun
lig sezonunun her macini puanlamak "A season followed end to end" (300,
sahibin karari 2026-09-22). Kilitli skin acilisi kapsam disi (§29): `reward`
yalnizca metin.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from . import rankit_rank
from .rankit_live_sync import FOTMOB_LEAGUES

# Cift devreli ligler: senkronun "league" dedigi futbol ligleri + EuroLeague
# normal sezonu. Kupalar ve UEFA turnuvalari kulup sezonu degil.
ROUND_ROBIN_LEAGUES = {name for name, sources in FOTMOB_LEAGUES.items()
                       if any(kind == "league" for _id, kind in sources)} | {"EuroLeague"}
FIXED_SEASON_GAMES = {"NBA": 82}
# EuroLeague'de normal sezon "Round N" asamasi (tablo da bu filtreyi kullaniyor);
# play-in / playoff / Final Four "her mac" hedefini uzatmaz.
STAGE_FILTER = {"EuroLeague": "Round %"}
KINDS = ("curated", "club_season", "classics_year")


def is_league(name: str) -> bool:
    return name in ROUND_ROBIN_LEAGUES or name in FIXED_SEASON_GAMES


def _stage(name: str, alias: str = "m") -> tuple[str, list]:
    pattern = STAGE_FILTER.get(name)
    return (f" AND {alias}.stage LIKE ?", [pattern]) if pattern else ("", [])


def expected_games(conn, competition) -> Optional[int]:
    """Bir kulubun bu lig sezonunda oynamasi gereken mac sayisi, ya da None."""
    name = competition["name"]
    if name in FIXED_SEASON_GAMES:
        return FIXED_SEASON_GAMES[name]
    if name not in ROUND_ROBIN_LEAGUES:
        return None
    extra, args = _stage(name)
    teams = conn.execute(
        f"""SELECT COUNT(*) FROM (
                SELECT m.home_team_id t FROM rankit_matches m WHERE m.competition_id=?{extra}
                UNION SELECT m.away_team_id FROM rankit_matches m WHERE m.competition_id=?{extra})""",
        (competition["id"], *args, competition["id"], *args)).fetchone()[0]
    return 2 * (teams - 1) if teams > 1 else None


# ── Koleksiyon satirlari ────────────────────────────────────────────────────

def club_season(conn, competition_id: int, team_id: int):
    """Kulup sezonu satirini getir; yoksa kur (kural koleksiyonu, idempotent)."""
    comp = conn.execute("SELECT id,name,sport,season FROM rankit_competitions WHERE id=?",
                        (competition_id,)).fetchone()
    if not comp or not is_league(comp["name"]):
        return None
    extra, args = _stage(comp["name"])
    if not conn.execute(f"""SELECT 1 FROM rankit_matches m WHERE m.competition_id=?
            AND ? IN (m.home_team_id, m.away_team_id){extra} LIMIT 1""",
            (competition_id, team_id, *args)).fetchone():
        return None
    found = conn.execute("""SELECT * FROM rankit_collections
        WHERE kind='club_season' AND competition_id=? AND team_id=?""", (competition_id, team_id)).fetchone()
    if found:
        # Kararli durum: koleksiyon zaten var, GET istegi hic YAZMAZ -- boylece
        # eszamanli okumalar yazma kilidi icin yarismaz.
        return found
    conn.execute("""INSERT OR IGNORE INTO rankit_collections(kind,sport,season,competition_id,team_id)
                    VALUES('club_season',?,?,?,?)""", (comp["sport"], comp["season"], competition_id, team_id))
    return conn.execute("""SELECT * FROM rankit_collections
        WHERE kind='club_season' AND competition_id=? AND team_id=?""", (competition_id, team_id)).fetchone()


def classics_year(conn, year: int):
    found = conn.execute("SELECT * FROM rankit_collections WHERE kind='classics_year' AND year=?",
                         (year,)).fetchone()
    if found:
        return found
    conn.execute("INSERT OR IGNORE INTO rankit_collections(kind,year) VALUES('classics_year',?)", (year,))
    return conn.execute("SELECT * FROM rankit_collections WHERE kind='classics_year' AND year=?",
                        (year,)).fetchone()


def get(conn, collection_id: int):
    return conn.execute("SELECT * FROM rankit_collections WHERE id=?", (collection_id,)).fetchone()


def _club_seasons_for_team(conn, team_id: int) -> list:
    """Kulubun her lig ailesindeki EN GUNCEL sezonu."""
    rows = conn.execute(
        """SELECT c.id, c.name, c.season FROM rankit_competitions c
           WHERE EXISTS(SELECT 1 FROM rankit_matches m WHERE m.competition_id=c.id
                        AND ? IN (m.home_team_id, m.away_team_id))
           ORDER BY c.name, c.season DESC""", (team_id,)).fetchall()
    latest = {}
    for r in rows:
        if is_league(r["name"]) and r["name"] not in latest:
            latest[r["name"]] = r["id"]
    return [c for c in (club_season(conn, cid, team_id) for cid in latest.values()) if c]


# ── Uyeler ve ozet ──────────────────────────────────────────────────────────

def _classic_ids_sql() -> str:
    # _match_dict ile ayni kural: kullanici basina mac basina SON puanli kayit,
    # en az MIN_COMMUNITY_RATINGS puan ve Classic payi >= CLASSIC_SHARE.
    return """SELECT l.match_id FROM rankit_diary_entries l
        WHERE l.id IN (SELECT MAX(id) FROM rankit_diary_entries
                       WHERE rating IS NOT NULL GROUP BY user_id, match_id)
        GROUP BY l.match_id
        HAVING COUNT(*) >= ? AND 1.0 * SUM(l.classic) / COUNT(*) >= ?"""


def members(conn, col) -> list:
    """Koleksiyonun bilinen maclari (id, status, starts_at), tarih sirasiyla."""
    if col["kind"] == "curated":
        return conn.execute("""SELECT m.id,m.status,m.starts_at FROM rankit_collection_items i
            JOIN rankit_matches m ON m.id=i.match_id WHERE i.collection_id=?
            ORDER BY m.starts_at, m.id""", (col["id"],)).fetchall()
    if col["kind"] == "club_season":
        comp = conn.execute("SELECT name FROM rankit_competitions WHERE id=?",
                            (col["competition_id"],)).fetchone()
        extra, args = _stage(comp["name"] if comp else "")
        return conn.execute(f"""SELECT m.id,m.status,m.starts_at FROM rankit_matches m
            WHERE m.competition_id=? AND ? IN (m.home_team_id, m.away_team_id){extra}
            ORDER BY m.starts_at, m.id""", (col["competition_id"], col["team_id"], *args)).fetchall()
    return conn.execute(f"""SELECT m.id,m.status,m.starts_at FROM rankit_matches m
        WHERE m.id IN ({_classic_ids_sql()}) AND substr(m.starts_at,1,4)=?
        ORDER BY m.starts_at, m.id""",
        (rankit_rank.MIN_COMMUNITY_RATINGS, rankit_rank.CLASSIC_SHARE, str(col["year"]))).fetchall()


def _rated(conn, uid: Optional[int], ids: list[int]) -> set:
    if not uid or not ids:
        return set()
    marks = ",".join("?" * len(ids))
    return {r[0] for r in conn.execute(
        f"""SELECT DISTINCT match_id FROM rankit_diary_entries
            WHERE user_id=? AND rating IS NOT NULL AND match_id IN ({marks})""", (uid, *ids))}


def _match_line(conn, match_id: int) -> dict:
    row = conn.execute("""SELECT m.id match_id, m.starts_at, m.status,
            h.name home_name, h.short_name home_short, a.name away_name, a.short_name away_short
        FROM rankit_matches m JOIN rankit_teams h ON h.id=m.home_team_id
        JOIN rankit_teams a ON a.id=m.away_team_id WHERE m.id=?""", (match_id,)).fetchone()
    return dict(row) if row else {"match_id": match_id}


def summarize(conn, col, uid: Optional[int], with_members: bool = False) -> dict:
    rows = members(conn, col)
    ids = [r["id"] for r in rows]
    rated = _rated(conn, uid, ids)
    known = len(ids)
    comp = team = None
    if col["kind"] == "club_season":
        comp = conn.execute("SELECT id,name,sport,season FROM rankit_competitions WHERE id=?",
                            (col["competition_id"],)).fetchone()
        team = conn.execute("SELECT id,name,short_name,color FROM rankit_teams WHERE id=?",
                            (col["team_id"],)).fetchone()
        total = max(expected_games(conn, comp) or known, known)
        title = f"The {total}"
        subtitle = f"Every {team['name']} match in the {comp['name']}"
    elif col["kind"] == "curated":
        total = max(col["declared_total"] or 0, known)
        title, subtitle = col["title"], col["subtitle"]
    else:
        total = known
        title, subtitle = f"Classics of {col['year']}", "Community-voted"
    collected = len(rated)
    # Siradaki: henuz oynanmamis (ya da suren) ilk uye mac.
    nxt = next((r for r in rows if r["status"] in ("live", "upcoming")), None)
    status = "not_open" if total == 0 else "complete" if collected >= total else "active"
    out = {
        "id": col["id"], "kind": col["kind"], "title": title, "subtitle": subtitle,
        "sport": comp["sport"] if comp else col["sport"],
        "season": comp["season"] if comp else col["season"], "year": col["year"],
        "competition": dict(comp) if comp else None, "team": dict(team) if team else None,
        "collected": collected, "total": total, "known": known,
        "unscheduled": total - known, "remaining": total - collected,
        "status": status, "opens_note": col["opens_note"], "reward": col["reward"],
        "next": _match_line(conn, nxt["id"]) if nxt else None,
    }
    if with_members:
        out["collected_ids"] = [r["id"] for r in rows if r["id"] in rated]
        out["open_ids"] = [r["id"] for r in rows if r["id"] not in rated and r["status"] == "finished"]
        out["upcoming_ids"] = [r["id"] for r in rows if r["status"] in ("live", "upcoming")]
    return out


def _order(item: dict):
    rank = {"active": 0, "complete": 1, "not_open": 2}[item["status"]]
    return (rank, item["remaining"] if item["status"] == "active" else 0, item["title"] or "")


def hunt_for(conn, uid: Optional[int]) -> list[dict]:
    """2m: sahibin aktif seckileri + takip ettigin kulublerin lig sezonlari +
    bu yilin Classic'leri."""
    cols = list(conn.execute("SELECT * FROM rankit_collections WHERE kind='curated' AND active=1 ORDER BY id"))
    if uid:
        # fetchall: dongu icinde club_season YAZABILIR. Canli bir SELECT
        # imleci uzerinde dolasirken yazmak, o imlecin sabitledigi eski okuma
        # goruntusunden yazmaya yukseltmeye calismak demek; baska bir istek
        # arada commit ettiyse SQLite SQLITE_BUSY_SNAPSHOT doner ve bu hata
        # busy_timeout'u beklemeden atlar -> "database is locked" -> 500.
        # (2026-09-23: alti kulup takip eden izleyicide olculdu.)
        follows = conn.execute("SELECT target_id FROM rankit_follows WHERE user_id=? AND target_type='team'",
                               (uid,)).fetchall()
        for r in follows:
            cols.extend(_club_seasons_for_team(conn, int(r["target_id"])))
    cols.append(classics_year(conn, datetime.now(timezone.utc).year))
    seen, items = set(), []
    for col in cols:
        if col["id"] in seen:
            continue
        seen.add(col["id"])
        items.append(summarize(conn, col, uid))
    return sorted(items, key=_order)


def index_summary(items: list[dict]) -> dict:
    """2m ust satiri: "38% · 4 collections active · 21 of 55 collected. Two
    are one night from closing." Acilmamis koleksiyon toplama girmez."""
    counted = [i for i in items if i["status"] != "not_open"]
    collected = sum(i["collected"] for i in counted)
    total = sum(i["total"] for i in counted)
    return {"collected": collected, "total": total,
            "pct": round(collected / total, 3) if total else None,
            "active": sum(i["status"] == "active" for i in items),
            # "One night from closing" yalniz kalan mac TARIHLIYSE dogru. Kalan
            # tek fikstur planlanmamissa kapanacak bir gece yok -- bildirim
            # (_closing_collection) bu kurali zaten uyguluyordu, ozet
            # uygulamiyordu: Discover "one is one night from closing" derken
            # alerts ayni koleksiyon icin hicbir sey demiyordu (olculdu).
            "one_left": sum(i["status"] == "active" and i["remaining"] == 1 and not i["unscheduled"]
                            for i in items)}


def collections_for_match(conn, uid: int, match_id: int) -> list:
    """Bu maci iceren, kullanicinin avinda olan koleksiyonlar (6a karosu icin)."""
    match = conn.execute("""SELECT id,competition_id,home_team_id,away_team_id,starts_at
        FROM rankit_matches WHERE id=?""", (match_id,)).fetchone()
    if not match:
        return []
    cols = list(conn.execute("""SELECT c.* FROM rankit_collections c
        JOIN rankit_collection_items i ON i.collection_id=c.id
        WHERE c.kind='curated' AND c.active=1 AND i.match_id=?""", (match_id,)))
    followed = {r[0] for r in conn.execute(
        "SELECT target_id FROM rankit_follows WHERE user_id=? AND target_type='team'", (uid,))}
    for team_id in (match["home_team_id"], match["away_team_id"]):
        if team_id in followed:
            col = club_season(conn, match["competition_id"], team_id)
            if col and any(r["id"] == match_id for r in members(conn, col)):
                cols.append(col)
    year = str(match["starts_at"] or "")[:4]
    if year.isdigit() and conn.execute(
            f"SELECT 1 FROM ({_classic_ids_sql()}) WHERE match_id=?",
            (rankit_rank.MIN_COMMUNITY_RATINGS, rankit_rank.CLASSIC_SHARE, match_id)).fetchone():
        cols.append(classics_year(conn, int(year)))
    return cols


def tile_for(conn, uid: int, match_id: int, newly_rated: bool) -> Optional[dict]:
    """6a "8/12 London Derby +1": bu kaydin ilerlettigi en dolu koleksiyon."""
    best = None
    for col in collections_for_match(conn, uid, match_id):
        s = summarize(conn, col, uid)
        if not s["total"]:
            continue
        key = (s["collected"] / s["total"], -s["remaining"])
        if best is None or key > best[0]:
            best = (key, s)
    if best is None:
        return None
    s = best[1]
    return {"id": s["id"], "kind": s["kind"], "title": s["title"], "collected": s["collected"],
            "total": s["total"], "delta": 1 if newly_rated else 0, "status": s["status"]}


def sync_season_awards(conn, uid: int, match_id: int) -> tuple[int, int]:
    """"A season followed end to end" (300): takip ettigin kulubun lig
    sezonundaki HER maci puanladiysan (sahibin karari 2026-09-22). Puan
    kaldirilip sezon eksik kalirsa odul geri alinir -- puanlama odulundeki
    kararla ayni (odul puanin karsiligi). Doner: (verilen, geri alinan)."""
    match = conn.execute("SELECT competition_id,home_team_id,away_team_id FROM rankit_matches WHERE id=?",
                         (match_id,)).fetchone()
    if not match:
        return 0, 0
    followed = {r[0] for r in conn.execute(
        "SELECT target_id FROM rankit_follows WHERE user_id=? AND target_type='team'", (uid,))}
    gained = revoked = 0
    for team_id in (match["home_team_id"], match["away_team_id"]):
        col = club_season(conn, match["competition_id"], team_id)
        if not col:
            continue
        s = summarize(conn, col, uid)
        complete = s["status"] == "complete" and s["unscheduled"] == 0
        if complete and team_id in followed:
            gained += rankit_rank.award(conn, uid, "season", "collection", col["id"])
        elif not complete:
            row = conn.execute("""SELECT points FROM rankit_points WHERE user_id=? AND kind='season'
                AND subject_type='collection' AND subject_id=?""", (uid, col["id"])).fetchone()
            if row:
                conn.execute("""DELETE FROM rankit_points WHERE user_id=? AND kind='season'
                    AND subject_type='collection' AND subject_id=?""", (uid, col["id"]))
                revoked += int(row["points"])
    return gained, revoked


def sync_completions(conn, uid: int, match_id: int) -> None:
    """Bu macin ilerlettigi koleksiyonlarin kapanma olayi (7a / 2q akisi).
    Tamamlandiysa yazilir (ilk an kalir), eksik kaldiysa silinir. Yilin
    Classic'leri dinamik -- "kapatilmaz"."""
    for col in collections_for_match(conn, uid, match_id):
        if col["kind"] == "classics_year":
            continue
        s = summarize(conn, col, uid)
        if s["status"] == "complete" and s["unscheduled"] == 0:
            conn.execute("""INSERT OR IGNORE INTO rankit_collection_completions(user_id,collection_id)
                            VALUES(?,?)""", (uid, col["id"]))
        else:
            conn.execute("DELETE FROM rankit_collection_completions WHERE user_id=? AND collection_id=?",
                         (uid, col["id"]))


def search(conn, uid: Optional[int], term: str, limit: int = 10) -> list[dict]:
    """3e COLLECTIONS: baslikla ya da ICERDIGI kulupten ("includes Arsenal")."""
    out = []
    for col in conn.execute("""SELECT c.*, (SELECT t.name FROM rankit_collection_items i
            JOIN rankit_matches m ON m.id=i.match_id
            JOIN rankit_teams t ON t.id IN (m.home_team_id, m.away_team_id)
            WHERE i.collection_id=c.id AND t.name LIKE ? ESCAPE '\\' LIMIT 1) matched_team
        FROM rankit_collections c WHERE c.kind='curated' AND c.active=1
          AND (c.title LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM rankit_collection_items i
               JOIN rankit_matches m ON m.id=i.match_id
               JOIN rankit_teams t ON t.id IN (m.home_team_id, m.away_team_id)
               WHERE i.collection_id=c.id AND t.name LIKE ? ESCAPE '\\'))
        LIMIT ?""", (term, term, term, limit)):
        out.append({**summarize(conn, col, uid), "matched_team": col["matched_team"]})
    for team in conn.execute("""SELECT id,name FROM rankit_teams
            WHERE name LIKE ? ESCAPE '\\' OR short_name LIKE ? ESCAPE '\\' LIMIT 5""", (term, term)):
        for col in _club_seasons_for_team(conn, int(team["id"])):
            out.append({**summarize(conn, col, uid), "matched_team": team["name"]})
    return out[:limit]
