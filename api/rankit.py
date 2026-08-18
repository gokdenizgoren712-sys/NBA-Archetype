"""RankIt by Primary Arch - sosyal mac gunlugu API'si.

MVP bilincli olarak mevcut kullanici/JWT ve SQLite altyapisini paylasir; spor
scouting tablolarina baglanmaz. Mac katalogu ileride veri saglayicidan dolacak,
yerel gelistirmede ise seed_rankit() deterministik bir demo katalogu kurar.
"""
from __future__ import annotations

import os
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .auth import get_optional_user
from .db import get_conn

router = APIRouter(prefix="/api/rankit", tags=["RankIt"])
IS_PROD = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") == "true" or os.environ.get("IS_PROD") == "true")


class DiaryIn(BaseModel):
    match_id: int
    watched_date: str = Field(default_factory=lambda: date.today().isoformat())
    rating: Optional[float] = None
    review: str = ""
    is_rewatch: bool = False
    visibility: Literal["public", "followers", "private"] = "public"
    classic: bool = False
    spoiler: bool = False
    tags: list[str] = []


class VoteIn(BaseModel):
    player_id: int


class RespectIn(BaseModel):
    player_ids: list[int]


class FollowIn(BaseModel):
    target_type: Literal["user", "team", "player", "competition"]
    target_id: int
    notify: bool = False


class ListIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    ranked: bool = False
    visibility: Literal["public", "followers", "private"] = "public"
    match_ids: list[int] = []


class ReviewCommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class TargetIn(BaseModel):
    target_type: Literal["match", "team", "player", "competition"]
    target_id: int


class ListItemIn(BaseModel):
    match_id: int
    note: str = Field(default="", max_length=300)


WATCHALONG_CONNECTIONS: dict[tuple[int, str], list[WebSocket]] = {}


def _demo_user_id(conn) -> int:
    row = conn.execute("SELECT id FROM users WHERE username = 'rankit_demo'").fetchone()
    if not row:
        conn.execute(
            "INSERT INTO users(email, username, hashed_password) VALUES(?,?,?)",
            ("rankit-demo@localhost.invalid", "rankit_demo", "!"),
        )
        row = conn.execute("SELECT id FROM users WHERE username = 'rankit_demo'").fetchone()
    return int(row["id"])


def _actor_id(user, conn) -> int:
    if user:
        return int(user["sub"])
    if not IS_PROD:
        return _demo_user_id(conn)
    raise HTTPException(status_code=401, detail="Sign in to use RankIt")


def seed_rankit() -> None:
    """Bos DB'de yerel prototip icin kucuk ama iliskisel bir katalog kur."""
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM rankit_matches LIMIT 1").fetchone():
            return

        for username, email in [
            ("rankit_demo", "rankit-demo@localhost.invalid"),
            ("ece", "ece-rankit@localhost.invalid"),
            ("mert", "mert-rankit@localhost.invalid"),
            ("deniz", "deniz-rankit@localhost.invalid"),
        ]:
            conn.execute("INSERT OR IGNORE INTO users(email,username,hashed_password) VALUES(?,?,?)", (email, username, "!"))

        competitions = [
            ("Basketball", "NBA", "USA", "2025-26"),
            ("Basketball", "EuroLeague", "Europe", "2025-26"),
            ("Football", "UEFA Champions League", "Europe", "2025-26"),
            ("Football", "Premier League", "England", "2025-26"),
        ]
        conn.executemany("INSERT OR IGNORE INTO rankit_competitions(sport,name,country,season) VALUES(?,?,?,?)", competitions)

        teams = [
            ("Basketball", "New York Knicks", "NYK", "#F58426", "USA"),
            ("Basketball", "Boston Celtics", "BOS", "#007A33", "USA"),
            ("Basketball", "Denver Nuggets", "DEN", "#FEC524", "USA"),
            ("Basketball", "Oklahoma City Thunder", "OKC", "#007AC1", "USA"),
            ("Football", "Arsenal", "ARS", "#EF0107", "England"),
            ("Football", "Real Madrid", "RMA", "#FEBE10", "Spain"),
            ("Football", "Barcelona", "BAR", "#A50044", "Spain"),
            ("Football", "Inter", "INT", "#00529F", "Italy"),
        ]
        conn.executemany("INSERT OR IGNORE INTO rankit_teams(sport,name,short_name,color,country) VALUES(?,?,?,?,?)", teams)

        def comp(name):
            return conn.execute("SELECT id FROM rankit_competitions WHERE name=?", (name,)).fetchone()["id"]

        def team(name):
            return conn.execute("SELECT id FROM rankit_teams WHERE name=?", (name,)).fetchone()["id"]

        fixtures = [
            ("Basketball", comp("NBA"), "2025-26", "2026-08-17T21:30:00", "finished", team("New York Knicks"), team("Boston Celtics"), 118, 114, "S Sport Plus", 1, "A fourth-quarter comeback, a packed Garden and one final possession that decided everything.", "potm"),
            ("Football", comp("UEFA Champions League"), "2025-26", "2026-08-18T22:00:00", "upcoming", team("Arsenal"), team("Real Madrid"), None, None, "tabii Spor", 1, "A knockout night in North London.", "editorial"),
            ("Football", comp("UEFA Champions League"), "2025-26", "2026-08-15T22:00:00", "finished", team("Barcelona"), team("Inter"), 3, 3, "TRT 1", 1, "Six goals and no safe moment. A European night built for the diary.", "potm"),
            ("Basketball", comp("NBA"), "2025-26", "2026-08-19T04:30:00", "upcoming", team("Denver Nuggets"), team("Oklahoma City Thunder"), None, None, "NBA League Pass", 0, "A Western Conference matchup.", "crests"),
        ]
        conn.executemany("""INSERT INTO rankit_matches
            (sport,competition_id,season,starts_at,status,home_team_id,away_team_id,home_score,away_score,broadcaster,editorial,summary,cover_variant)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""", fixtures)

        players = [
            ("Basketball", team("New York Knicks"), "Jalen Brunson", "11"),
            ("Basketball", team("New York Knicks"), "Josh Hart", "3"),
            ("Basketball", team("Boston Celtics"), "Jayson Tatum", "0"),
            ("Basketball", team("Boston Celtics"), "Derrick White", "9"),
            ("Football", team("Barcelona"), "Lamine Yamal", "10"),
            ("Football", team("Inter"), "Lautaro Martínez", "10"),
            ("Football", team("Arsenal"), "Declan Rice", "41"),
            ("Football", team("Real Madrid"), "Vinícius Jr.", "7"),
        ]
        conn.executemany("INSERT OR IGNORE INTO rankit_players(sport,team_id,name,shirt_no) VALUES(?,?,?,?)", players)

        def match(home):
            return conn.execute("SELECT m.id FROM rankit_matches m JOIN rankit_teams t ON t.id=m.home_team_id WHERE t.name=?", (home,)).fetchone()["id"]

        for player_name in [p[2] for p in players]:
            p = conn.execute("SELECT id,team_id FROM rankit_players WHERE name=?", (player_name,)).fetchone()
            mids = conn.execute("SELECT id FROM rankit_matches WHERE home_team_id=? OR away_team_id=?", (p["team_id"], p["team_id"])).fetchall()
            for m in mids:
                conn.execute("INSERT OR IGNORE INTO rankit_match_players(match_id,player_id,team_id) VALUES(?,?,?)", (m["id"], p["id"], p["team_id"]))

        nyk = match("New York Knicks")
        bar = match("Barcelona")
        seed_entries = [
            ("rankit_demo", nyk, "2026-08-17", 4.0, "The fourth quarter made this feel bigger than August.", 0, 1, "public"),
            ("ece", nyk, "2026-08-17", 4.5, "That final Brunson possession was pure theatre.", 0, 1, "public"),
            ("mert", nyk, "2026-08-17", 4.5, "Garden noise through the screen.", 0, 1, "public"),
            ("deniz", nyk, "2026-08-17", 4.0, "A proper comeback.", 0, 0, "public"),
            ("rankit_demo", bar, "2026-08-15", 5.0, "The kind of match you remember by where you watched it.", 0, 1, "public"),
            ("ece", bar, "2026-08-15", 4.5, "Six goals and no quiet minute.", 0, 1, "public"),
            ("mert", bar, "2026-08-15", 5.0, "Instant classic.", 0, 1, "public"),
            ("deniz", bar, "2026-08-15", 4.5, "European football at its best.", 0, 1, "public"),
        ]
        for username, mid, watched, rating, review, rewatch, classic, visibility in seed_entries:
            uid = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()["id"]
            cur = conn.execute("""INSERT INTO rankit_diary_entries
                (user_id,match_id,watched_date,rating,review,is_rewatch,classic,visibility)
                VALUES(?,?,?,?,?,?,?,?)""", (uid, mid, watched, rating, review, rewatch, classic, visibility))
            for tag in (["Comeback", "Great Atmosphere"] if mid == nyk else ["Goal Fest", "Nail-biter"]):
                conn.execute("INSERT INTO rankit_entry_tags(entry_id,tag) VALUES(?,?)", (cur.lastrowid, tag))

        brunson = conn.execute("SELECT id FROM rankit_players WHERE name='Jalen Brunson'").fetchone()["id"]
        yamal = conn.execute("SELECT id FROM rankit_players WHERE name='Lamine Yamal'").fetchone()["id"]
        for username in ["rankit_demo", "ece", "mert", "deniz"]:
            uid = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()["id"]
            conn.execute("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,?,?)", (uid, nyk, brunson))
            conn.execute("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,?,?)", (uid, bar, yamal))


def _team(row, prefix: str) -> dict:
    return {
        "id": row[f"{prefix}_id"], "name": row[f"{prefix}_name"],
        "short": row[f"{prefix}_short"], "color": row[f"{prefix}_color"],
        "crest_url": row[f"{prefix}_crest"],
    }


def _match_dict(conn, row, uid: Optional[int] = None) -> dict:
    mid = row["id"]
    rating = conn.execute("SELECT AVG(rating) avg, COUNT(rating) n FROM rankit_diary_entries WHERE match_id=? AND rating IS NOT NULL", (mid,)).fetchone()
    review_count = conn.execute("SELECT COUNT(*) n FROM rankit_diary_entries WHERE match_id=? AND review<>''", (mid,)).fetchone()["n"]
    classics = conn.execute("SELECT SUM(classic) c, COUNT(*) n FROM rankit_diary_entries WHERE match_id=?", (mid,)).fetchone()
    potm = conn.execute("""SELECT p.id,p.name,p.shirt_no,p.image_url,COUNT(*) votes
        FROM rankit_potm_votes v JOIN rankit_players p ON p.id=v.player_id
        WHERE v.match_id=? GROUP BY p.id ORDER BY votes DESC,p.name LIMIT 1""", (mid,)).fetchone()
    tags = conn.execute("""SELECT t.tag,COUNT(*) count FROM rankit_entry_tags t
        JOIN rankit_diary_entries e ON e.id=t.entry_id WHERE e.match_id=?
        GROUP BY t.tag ORDER BY count DESC,t.tag""", (mid,)).fetchall()
    mine = None
    watchlisted = False
    favorited = False
    if uid:
        mine = conn.execute("SELECT rating,classic FROM rankit_diary_entries WHERE user_id=? AND match_id=? ORDER BY watched_date DESC,id DESC LIMIT 1", (uid, mid)).fetchone()
        watchlisted = bool(conn.execute("SELECT 1 FROM rankit_watchlist WHERE user_id=? AND match_id=?", (uid, mid)).fetchone())
        favorited = bool(conn.execute("SELECT 1 FROM rankit_favorites WHERE user_id=? AND target_type='match' AND target_id=?", (uid, mid)).fetchone())
    score = None if row["home_score"] is None else f'{row["home_score"]} – {row["away_score"]}'
    c, n = int(classics["c"] or 0), int(classics["n"] or 0)
    return {
        "id": mid, "sport": row["sport"], "competition": row["competition_name"],
        "competition_id": row["competition_id"], "season": row["season"],
        "provider": row["provider"],
        "status": row["status"], "starts_at": row["starts_at"],
        "home": _team(row, "home"), "away": _team(row, "away"), "score": score,
        "broadcaster": row["broadcaster"], "editorial": bool(row["editorial"]),
        "summary": row["summary"], "cover_variant": row["cover_variant"],
        "community_rating": round(float(rating["avg"]), 1) if rating["avg"] is not None else None,
        "rating_count": int(rating["n"] or 0), "review_count": int(review_count or 0),
        "classic_count": c, "instant_classic": n >= 4 and c / n >= .65,
        "potm": dict(potm) if potm else None,
        "tags": [dict(t) for t in tags], "dominant_tag": tags[0]["tag"] if tags else None,
        "my_rating": mine["rating"] if mine else None, "my_classic": bool(mine["classic"]) if mine else False,
        "watchlisted": watchlisted, "favorited": favorited,
    }


MATCH_SELECT = """SELECT m.*,c.name competition_name,
    h.id home_id,h.name home_name,h.short_name home_short,h.color home_color,h.crest_url home_crest,
    a.id away_id,a.name away_name,a.short_name away_short,a.color away_color,a.crest_url away_crest
    FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
    JOIN rankit_teams h ON h.id=m.home_team_id JOIN rankit_teams a ON a.id=m.away_team_id"""


@router.get("/home")
def rankit_home(sport: str = "All", user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        has_synced = bool(conn.execute("SELECT 1 FROM rankit_matches WHERE provider IS NOT NULL LIMIT 1").fetchone())
        sql, args, where = MATCH_SELECT, [], []
        if has_synced:
            where.append("m.provider IS NOT NULL")
        if sport != "All":
            where.append("m.sport=?")
            args.append(sport)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY m.starts_at DESC LIMIT 30"
        if has_synced and sport == "All":
            by_sport = []
            for selected_sport in ("Basketball", "Football"):
                by_sport.append(conn.execute(MATCH_SELECT + " WHERE m.provider IS NOT NULL AND m.sport=? ORDER BY m.starts_at DESC LIMIT 15", (selected_sport,)).fetchall())
            rows = [row for pair in zip(*by_sport) for row in pair]
        else:
            rows = conn.execute(sql, args).fetchall()
        cards = [_match_dict(conn, r, uid) for r in rows]
        activity_rows = conn.execute("""SELECT e.id,e.review,e.rating,e.created_at,u.username,m.id match_id,
            h.short_name home_short,h.name home_name,a.short_name away_short,a.name away_name
            FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id
            JOIN rankit_matches m ON m.id=e.match_id JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id
            WHERE e.visibility='public' AND e.review<>'' ORDER BY e.id DESC LIMIT 8""").fetchall()
        return {"matches": cards, "activity": [dict(r) for r in activity_rows]}


@router.get("/catalog")
def rankit_catalog(
    sport: str = "All",
    competition: str = "All",
    status: str = "All",
    limit: int = Query(60, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_optional_user),
):
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        where, args = ["m.provider IS NOT NULL"], []
        if sport != "All":
            where.append("m.sport=?"); args.append(sport)
        if competition != "All":
            where.append("c.name=?"); args.append(competition)
        if status != "All":
            where.append("m.status=?"); args.append(status)
        base = " WHERE " + " AND ".join(where)
        total = conn.execute("""SELECT COUNT(*) n FROM rankit_matches m
            JOIN rankit_competitions c ON c.id=m.competition_id""" + base, args).fetchone()["n"]
        rows = conn.execute(MATCH_SELECT + base + " ORDER BY m.starts_at DESC LIMIT ? OFFSET ?", (*args, limit, offset)).fetchall()
        return {"matches": [_match_dict(conn, row, uid) for row in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/meta")
def rankit_meta():
    with get_conn() as conn:
        competitions = [dict(r) for r in conn.execute("""SELECT c.name,c.sport,c.country,c.season,COUNT(m.id) match_count
            FROM rankit_competitions c JOIN rankit_matches m ON m.competition_id=c.id
            WHERE m.provider IS NOT NULL GROUP BY c.id ORDER BY c.sport,c.name""").fetchall()]
        return {"competitions": competitions, "matches": sum(c["match_count"] for c in competitions)}


@router.get("/matches/{match_id}")
def rankit_match(match_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        row = conn.execute(MATCH_SELECT + " WHERE m.id=?", (match_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Match not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        result = _match_dict(conn, row, uid)
        result["players"] = [dict(r) for r in conn.execute("""SELECT p.id,p.name,p.shirt_no,p.image_url,t.short_name team
            FROM rankit_match_players mp JOIN rankit_players p ON p.id=mp.player_id
            JOIN rankit_teams t ON t.id=mp.team_id WHERE mp.match_id=? ORDER BY t.short_name,p.name""", (match_id,)).fetchall()]
        result["reviews"] = [dict(r) for r in conn.execute("""SELECT e.id,e.rating,e.review,e.watched_date,e.classic,u.username,
            (SELECT COUNT(*) FROM rankit_review_likes l WHERE l.entry_id=e.id) likes,
            EXISTS(SELECT 1 FROM rankit_review_likes l WHERE l.entry_id=e.id AND l.user_id=?) liked,
            (SELECT COUNT(*) FROM rankit_review_comments c WHERE c.entry_id=e.id) comments
            FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id
            WHERE e.match_id=? AND e.visibility='public' AND e.review<>'' ORDER BY likes DESC,e.id DESC""", (uid or -1, match_id)).fetchall()]
        return result


@router.get("/search")
def rankit_search(q: str = Query(default="", max_length=80), kind: str = "All"):
    term = f"%{q.strip()}%"
    with get_conn() as conn:
        matches = []
        if kind in ("All", "Matches"):
            rows = conn.execute(MATCH_SELECT + " WHERE h.name LIKE ? OR a.name LIKE ? OR c.name LIKE ? ORDER BY m.starts_at DESC LIMIT 20", (term, term, term)).fetchall()
            matches = [_match_dict(conn, r) for r in rows]
        players = [dict(r) for r in conn.execute("SELECT id,name,sport,team_id FROM rankit_players WHERE name LIKE ? LIMIT 20", (term,)).fetchall()] if kind in ("All", "Players") else []
        teams = [dict(r) for r in conn.execute("SELECT id,name,short_name,sport,color,crest_url FROM rankit_teams WHERE name LIKE ? OR short_name LIKE ? LIMIT 20", (term, term)).fetchall()] if kind in ("All", "Teams") else []
        members = [dict(r) for r in conn.execute("SELECT id,username FROM users WHERE username LIKE ? AND username NOT LIKE 'rankit_demo' LIMIT 20", (term,)).fetchall()] if kind in ("All", "Members") else []
        lists = [dict(r) for r in conn.execute("SELECT id,title,description,ranked FROM rankit_lists WHERE visibility='public' AND title LIKE ? LIMIT 20", (term,)).fetchall()] if kind in ("All", "Lists") else []
        return {"matches": matches, "players": players, "teams": teams, "members": members, "lists": lists}


@router.get("/players/{player_id}")
def rankit_player_detail(player_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        player = conn.execute("""SELECT p.id,p.name,p.sport,p.shirt_no,p.image_url,p.team_id,
            t.name team_name,t.short_name team_short,t.color team_color,t.crest_url team_crest
            FROM rankit_players p LEFT JOIN rankit_teams t ON t.id=p.team_id WHERE p.id=?""", (player_id,)).fetchone()
        if not player:
            raise HTTPException(404, "Player not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        stats = conn.execute("""SELECT
            (SELECT COUNT(*) FROM rankit_potm_votes WHERE player_id=?) potm_votes,
            (SELECT COUNT(*) FROM rankit_respect_votes WHERE player_id=?) respect_votes,
            (SELECT COUNT(DISTINCT match_id) FROM rankit_match_players WHERE player_id=?) appearances""",
            (player_id, player_id, player_id)).fetchone()
        rows = conn.execute(MATCH_SELECT + """ JOIN rankit_match_players mp ON mp.match_id=m.id
            WHERE mp.player_id=? ORDER BY m.starts_at DESC LIMIT 30""", (player_id,)).fetchall()
        followed = bool(uid and conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='player' AND target_id=?", (uid, player_id)).fetchone())
        favorited = bool(uid and conn.execute("SELECT 1 FROM rankit_favorites WHERE user_id=? AND target_type='player' AND target_id=?", (uid, player_id)).fetchone())
        return {"player": dict(player), "stats": dict(stats), "following": followed, "favorited": favorited,
                "matches": [_match_dict(conn, row, uid) for row in rows]}


@router.get("/teams/{team_id}")
def rankit_team_detail(team_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        team = conn.execute("SELECT id,name,short_name,sport,color,country,crest_url FROM rankit_teams WHERE id=?", (team_id,)).fetchone()
        if not team:
            raise HTTPException(404, "Team not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        players = [dict(r) for r in conn.execute("""SELECT p.id,p.name,p.shirt_no,p.image_url,
            (SELECT COUNT(*) FROM rankit_potm_votes v WHERE v.player_id=p.id) potm_votes,
            (SELECT COUNT(*) FROM rankit_respect_votes v WHERE v.player_id=p.id) respect_votes
            FROM rankit_players p WHERE p.team_id=? ORDER BY p.name""", (team_id,)).fetchall()]
        rows = conn.execute(MATCH_SELECT + " WHERE m.home_team_id=? OR m.away_team_id=? ORDER BY m.starts_at DESC LIMIT 30", (team_id, team_id)).fetchall()
        followed = bool(uid and conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='team' AND target_id=?", (uid, team_id)).fetchone())
        favorited = bool(uid and conn.execute("SELECT 1 FROM rankit_favorites WHERE user_id=? AND target_type='team' AND target_id=?", (uid, team_id)).fetchone())
        return {"team": dict(team), "players": players, "following": followed, "favorited": favorited,
                "matches": [_match_dict(conn, row, uid) for row in rows]}


@router.get("/members/{member_id}")
def rankit_member_detail(member_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        member = conn.execute("SELECT id,username,created_at FROM users WHERE id=?", (member_id,)).fetchone()
        if not member:
            raise HTTPException(404, "Member not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        stats = conn.execute("""SELECT COUNT(*) diary_count,COUNT(DISTINCT match_id) matches,
            COALESCE(SUM(classic),0) classics,AVG(rating) avg_rating FROM rankit_diary_entries WHERE user_id=?""", (member_id,)).fetchone()
        entries = [dict(r) for r in conn.execute("""SELECT e.id,e.match_id,e.rating,e.review,e.watched_date,e.classic,
            h.short_name home_short,a.short_name away_short FROM rankit_diary_entries e
            JOIN rankit_matches m ON m.id=e.match_id JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id WHERE e.user_id=? AND e.visibility='public'
            ORDER BY e.watched_date DESC,e.id DESC LIMIT 30""", (member_id,)).fetchall()]
        followed = bool(uid and conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (uid, member_id)).fetchone())
        return {"member": dict(member), "stats": dict(stats), "following": followed, "entries": entries}


@router.get("/diary")
def rankit_diary(view: str = "watched", user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        rows = conn.execute("""SELECT e.*,m.sport,m.status,m.home_score,m.away_score,c.name competition,
            h.name home_name,h.short_name home_short,h.color home_color,
            a.name away_name,a.short_name away_short,a.color away_color
            FROM rankit_diary_entries e JOIN rankit_matches m ON m.id=e.match_id
            JOIN rankit_competitions c ON c.id=m.competition_id JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id WHERE e.user_id=? ORDER BY e.watched_date DESC,e.id DESC""", (uid,)).fetchall()
        return {"entries": [dict(r) for r in rows]}


@router.post("/diary")
def rankit_log(body: DiaryIn, user=Depends(get_optional_user)):
    if body.rating is not None and round(body.rating * 2) != body.rating * 2:
        raise HTTPException(422, "Rating must use 0.5 steps")
    if len(body.tags) > 3:
        raise HTTPException(422, "Choose at most three tags")
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if not conn.execute("SELECT 1 FROM rankit_matches WHERE id=?", (body.match_id,)).fetchone():
            raise HTTPException(404, "Match not found")
        cur = conn.execute("""INSERT INTO rankit_diary_entries
            (user_id,match_id,watched_date,rating,review,is_rewatch,visibility,classic,spoiler)
            VALUES(?,?,?,?,?,?,?,?,?)""", (uid, body.match_id, body.watched_date, body.rating, body.review.strip(), int(body.is_rewatch), body.visibility, int(body.classic), int(body.spoiler)))
        for tag in dict.fromkeys(t.strip() for t in body.tags if t.strip()):
            conn.execute("INSERT INTO rankit_entry_tags(entry_id,tag) VALUES(?,?)", (cur.lastrowid, tag[:40]))
        return {"ok": True, "entry_id": cur.lastrowid}


def _require_watched(conn, uid: int, match_id: int):
    if not conn.execute("SELECT 1 FROM rankit_diary_entries WHERE user_id=? AND match_id=?", (uid, match_id)).fetchone():
        raise HTTPException(403, "Log this match as watched first")


@router.post("/matches/{match_id}/potm")
def vote_potm(match_id: int, body: VoteIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn); _require_watched(conn, uid, match_id)
        if not conn.execute("SELECT 1 FROM rankit_match_players WHERE match_id=? AND player_id=?", (match_id, body.player_id)).fetchone():
            raise HTTPException(422, "Player is not in this match")
        conn.execute("""INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,?,?)
            ON CONFLICT(user_id,match_id) DO UPDATE SET player_id=excluded.player_id,updated_at=datetime('now')""", (uid, match_id, body.player_id))
        return {"ok": True}


@router.put("/matches/{match_id}/respect")
def vote_respect(match_id: int, body: RespectIn, user=Depends(get_optional_user)):
    if len(set(body.player_ids)) > 2:
        raise HTTPException(422, "Choose at most two players")
    with get_conn() as conn:
        uid = _actor_id(user, conn); _require_watched(conn, uid, match_id)
        potm = conn.execute("SELECT player_id FROM rankit_potm_votes WHERE user_id=? AND match_id=?", (uid, match_id)).fetchone()
        if potm and potm["player_id"] in body.player_ids:
            raise HTTPException(422, "POTM cannot also receive Respect")
        valid = {r["player_id"] for r in conn.execute("SELECT player_id FROM rankit_match_players WHERE match_id=?", (match_id,)).fetchall()}
        if not set(body.player_ids).issubset(valid):
            raise HTTPException(422, "Player is not in this match")
        conn.execute("DELETE FROM rankit_respect_votes WHERE user_id=? AND match_id=?", (uid, match_id))
        conn.executemany("INSERT INTO rankit_respect_votes(user_id,match_id,player_id) VALUES(?,?,?)", [(uid, match_id, p) for p in dict.fromkeys(body.player_ids)])
        return {"ok": True}


@router.post("/follow")
def rankit_follow(body: FollowIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        existing = conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id)).fetchone()
        if existing:
            conn.execute("DELETE FROM rankit_follows WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id))
            return {"following": False}
        conn.execute("INSERT INTO rankit_follows(user_id,target_type,target_id,notify) VALUES(?,?,?,?)", (uid, body.target_type, body.target_id, int(body.notify)))
        return {"following": True}


@router.get("/lists")
def rankit_lists():
    with get_conn() as conn:
        rows = conn.execute("""SELECT l.*,u.username,(SELECT COUNT(*) FROM rankit_list_items i WHERE i.list_id=l.id) match_count
            FROM rankit_lists l JOIN users u ON u.id=l.user_id WHERE l.visibility='public' ORDER BY l.updated_at DESC""").fetchall()
        return {"lists": [dict(r) for r in rows]}


@router.post("/lists")
def create_rankit_list(body: ListIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        cur = conn.execute("INSERT INTO rankit_lists(user_id,title,description,ranked,visibility) VALUES(?,?,?,?,?)", (uid, body.title.strip(), body.description.strip(), int(body.ranked), body.visibility))
        for pos, mid in enumerate(dict.fromkeys(body.match_ids), 1):
            conn.execute("INSERT INTO rankit_list_items(list_id,match_id,position) VALUES(?,?,?)", (cur.lastrowid, mid, pos))
        return {"ok": True, "list_id": cur.lastrowid}


@router.get("/lists/{list_id}")
def rankit_list_detail(list_id: int):
    with get_conn() as conn:
        row = conn.execute("""SELECT l.*,u.username FROM rankit_lists l
            JOIN users u ON u.id=l.user_id WHERE l.id=?""", (list_id,)).fetchone()
        if not row:
            raise HTTPException(404, "List not found")
        items = conn.execute(MATCH_SELECT + """ JOIN rankit_list_items li ON li.match_id=m.id
            WHERE li.list_id=? ORDER BY li.position""", (list_id,)).fetchall()
        return {"list": dict(row), "matches": [_match_dict(conn, m) for m in items]}


@router.post("/lists/{list_id}/items")
def add_rankit_list_item(list_id: int, body: ListItemIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        owner = conn.execute("SELECT user_id FROM rankit_lists WHERE id=?", (list_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "List not found")
        if int(owner["user_id"]) != uid:
            raise HTTPException(403, "You can only edit your own list")
        pos = conn.execute("SELECT COALESCE(MAX(position),0)+1 p FROM rankit_list_items WHERE list_id=?", (list_id,)).fetchone()["p"]
        conn.execute("""INSERT INTO rankit_list_items(list_id,match_id,position,note) VALUES(?,?,?,?)
            ON CONFLICT(list_id,match_id) DO UPDATE SET note=excluded.note""", (list_id, body.match_id, pos, body.note.strip()))
        return {"ok": True}


@router.post("/matches/{match_id}/watchlist")
def toggle_watchlist(match_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if not conn.execute("SELECT 1 FROM rankit_matches WHERE id=?", (match_id,)).fetchone():
            raise HTTPException(404, "Match not found")
        exists = conn.execute("SELECT 1 FROM rankit_watchlist WHERE user_id=? AND match_id=?", (uid, match_id)).fetchone()
        if exists:
            conn.execute("DELETE FROM rankit_watchlist WHERE user_id=? AND match_id=?", (uid, match_id))
            return {"watchlisted": False}
        conn.execute("INSERT INTO rankit_watchlist(user_id,match_id) VALUES(?,?)", (uid, match_id))
        return {"watchlisted": True}


@router.get("/watchlist")
def get_watchlist(user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        rows = conn.execute(MATCH_SELECT + """ JOIN rankit_watchlist w ON w.match_id=m.id
            WHERE w.user_id=? ORDER BY m.starts_at""", (uid,)).fetchall()
        return {"matches": [_match_dict(conn, row, uid) for row in rows]}


@router.post("/favorite")
def toggle_favorite(body: TargetIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        exists = conn.execute("SELECT 1 FROM rankit_favorites WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id)).fetchone()
        if exists:
            conn.execute("DELETE FROM rankit_favorites WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id))
            return {"favorited": False}
        conn.execute("INSERT INTO rankit_favorites(user_id,target_type,target_id) VALUES(?,?,?)", (uid, body.target_type, body.target_id))
        return {"favorited": True}


@router.post("/reviews/{entry_id}/like")
def toggle_review_like(entry_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if not conn.execute("SELECT 1 FROM rankit_diary_entries WHERE id=?", (entry_id,)).fetchone():
            raise HTTPException(404, "Review not found")
        exists = conn.execute("SELECT 1 FROM rankit_review_likes WHERE user_id=? AND entry_id=?", (uid, entry_id)).fetchone()
        if exists:
            conn.execute("DELETE FROM rankit_review_likes WHERE user_id=? AND entry_id=?", (uid, entry_id))
        else:
            conn.execute("INSERT INTO rankit_review_likes(user_id,entry_id) VALUES(?,?)", (uid, entry_id))
        likes = conn.execute("SELECT COUNT(*) n FROM rankit_review_likes WHERE entry_id=?", (entry_id,)).fetchone()["n"]
        return {"liked": not bool(exists), "likes": likes}


@router.get("/reviews/{entry_id}/comments")
def review_comments(entry_id: int):
    with get_conn() as conn:
        rows = conn.execute("""SELECT c.id,c.content,c.created_at,u.username FROM rankit_review_comments c
            JOIN users u ON u.id=c.user_id WHERE c.entry_id=? ORDER BY c.id""", (entry_id,)).fetchall()
        return {"comments": [dict(r) for r in rows]}


@router.post("/reviews/{entry_id}/comments")
def add_review_comment(entry_id: int, body: ReviewCommentIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if not conn.execute("SELECT 1 FROM rankit_diary_entries WHERE id=?", (entry_id,)).fetchone():
            raise HTTPException(404, "Review not found")
        cur = conn.execute("INSERT INTO rankit_review_comments(user_id,entry_id,content) VALUES(?,?,?)", (uid, entry_id, body.content.strip()))
        return {"ok": True, "comment_id": cur.lastrowid}


@router.get("/matches/{match_id}/watchalong")
def watchalong_history(match_id: int, room: str = "community"):
    with get_conn() as conn:
        rows = conn.execute("""SELECT w.id,w.content,w.created_at,u.username FROM rankit_watchalong_messages w
            JOIN users u ON u.id=w.user_id WHERE w.match_id=? AND w.room=? ORDER BY w.id DESC LIMIT 100""", (match_id, room)).fetchall()
        return {"messages": [dict(r) for r in reversed(rows)]}


@router.websocket("/ws/watchalong/{match_id}")
async def rankit_watchalong_socket(ws: WebSocket, match_id: int, room: str = "community"):
    await ws.accept()
    key = (match_id, room[:40])
    WATCHALONG_CONNECTIONS.setdefault(key, []).append(ws)
    try:
        with get_conn() as conn:
            uid = _demo_user_id(conn)
            username = conn.execute("SELECT username FROM users WHERE id=?", (uid,)).fetchone()["username"]
        while True:
            payload = await ws.receive_json()
            content = str(payload.get("content", "")).strip()[:300]
            if not content:
                continue
            with get_conn() as conn:
                cur = conn.execute("INSERT INTO rankit_watchalong_messages(match_id,user_id,room,content) VALUES(?,?,?,?)", (match_id, uid, key[1], content))
                message = {"id": cur.lastrowid, "username": username, "content": content, "created_at": "now"}
            for peer in list(WATCHALONG_CONNECTIONS.get(key, [])):
                try:
                    await peer.send_json({"type": "message", "message": message})
                except Exception:
                    if peer in WATCHALONG_CONNECTIONS.get(key, []):
                        WATCHALONG_CONNECTIONS[key].remove(peer)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WATCHALONG_CONNECTIONS.get(key, []):
            WATCHALONG_CONNECTIONS[key].remove(ws)


@router.get("/profile")
def rankit_profile(user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        u = conn.execute("SELECT id,username,created_at FROM users WHERE id=?", (uid,)).fetchone()
        stats = conn.execute("""SELECT COUNT(*) diary_count,COUNT(DISTINCT match_id) matches,
            SUM(classic) classics,AVG(rating) avg_rating FROM rankit_diary_entries WHERE user_id=?""", (uid,)).fetchone()
        extra = {
            "following": conn.execute("SELECT COUNT(*) n FROM rankit_follows WHERE user_id=?", (uid,)).fetchone()["n"],
            "favorites": conn.execute("SELECT COUNT(*) n FROM rankit_favorites WHERE user_id=?", (uid,)).fetchone()["n"],
            "watchlist": conn.execute("SELECT COUNT(*) n FROM rankit_watchlist WHERE user_id=?", (uid,)).fetchone()["n"],
            "lists": conn.execute("SELECT COUNT(*) n FROM rankit_lists WHERE user_id=?", (uid,)).fetchone()["n"],
        }
        favorite_rows = conn.execute(MATCH_SELECT + """ JOIN rankit_favorites f ON f.target_id=m.id
            WHERE f.user_id=? AND f.target_type='match' ORDER BY f.created_at DESC LIMIT 4""", (uid,)).fetchall()
        return {"user": dict(u), "stats": {**dict(stats), **extra},
                "favorite_matches": [_match_dict(conn, row, uid) for row in favorite_rows]}
