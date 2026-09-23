# -*- coding: utf-8 -*-
"""Web yuzeylerinin API sozlesmesi -- izole kabul (frontend_code.md gecis
kapisi: "mobil kapanana kadar web uygulama dosyalarina baslamadan izole
test ... uret").

Iki is yapar:
  1. Her web ekraninin (7a, 8a, 8c, 7g, 7f, 7h, 11c, 12a, 12b, 14a, 14b, 11d,
     12c) okudugu alanlari tek tek dogrular -- dolu hesapta VE bos hesapta
     (8d durumlari: bos liste, null isi, has_more false).
  2. Yanitlari `tests/fixtures/web/{dolu,bos}/*.json` altina altin ornek
     olarak yazar; frontend izole gorunum testlerinde bunlari okuyabilir
     (sunucu ayaga kaldirmadan, uydurma veri olmadan).

Gecici DB; ag yok.
"""
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.db as DB
from api import rankit as RK
from api import rankit_notify
from api import rankit_rank
from api.auth import get_optional_user, require_admin

FIXTURES = Path(__file__).parent / "fixtures" / "web"
ME, FRIEND, STRANGER = 1, 2, 3
ARS, CHE, TOT, EVE = 1, 2, 3, 4
PL = 1


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def fresh_db(monkeypatch, name):
    path = Path(tempfile.mkdtemp(prefix=f"rankit_web_{name}_")) / "t.db"
    monkeypatch.setattr(DB, "DB_PATH", path)
    DB.init_db()
    now = utcnow()
    with DB.get_conn() as c:
        c.executemany("INSERT INTO users(id,email,username,hashed_password) VALUES(?,?,?,'x')",
                      [(i, f"u{i}@t", f"user{i}") for i in range(1, 61)])
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(?,'Football','Premier League','2026-27')", (PL,))
        c.execute("INSERT INTO rankit_competitions(id,sport,name,season) VALUES(2,'Basketball','NBA','2026-27')")
        c.executemany("INSERT INTO rankit_teams(id,sport,name,short_name,color) VALUES(?,'Football',?,?,?)",
                      [(ARS, "Arsenal", "ARS", "#C8102E"), (CHE, "Chelsea", "CHE", "#0B3D91"),
                       (TOT, "Tottenham", "TOT", "#1D2D5C"), (EVE, "Everton", "EVE", "#00843D")])
        c.execute("INSERT INTO rankit_teams(id,sport,name,short_name,color) VALUES(20,'Basketball','Knicks','NYK','#F58426'),(21,'Basketball','Celtics','BOS','#007A33')")
        games = [  # id, comp, stage, home, away, gun, durum, skor
            (1, PL, "Matchday 1", ARS, CHE, -21, "finished", (2, 0)),
            (2, PL, "Matchday 1", TOT, EVE, -21, "finished", (2, 1)),
            (3, PL, "Matchday 2", CHE, TOT, -14, "finished", (1, 1)),
            (4, PL, "Matchday 2", EVE, ARS, -14, "finished", (0, 3)),
            (5, PL, "Matchday 3", ARS, TOT, 2, "upcoming", None),
            (6, PL, "Matchday 3", CHE, EVE, -1, "live", (1, 1)),
            (7, 2, None, 20, 21, -3, "finished", (110, 104)),
        ]
        for mid, comp, stage, home, away, days, status, score in games:
            c.execute("""INSERT INTO rankit_matches(id,sport,competition_id,season,starts_at,status,stage,
                         home_team_id,away_team_id,home_score,away_score,provider,live_minute)
                         VALUES(?,?,?,'2026-27',?,?,?,?,?,?,?,'fotmob',?)""",
                      (mid, "Basketball" if comp == 2 else "Football", comp,
                       iso(now + timedelta(days=days)), status, stage, home, away,
                       score[0] if score else None, score[1] if score else None,
                       "73'" if status == "live" else None))
        c.execute("INSERT INTO rankit_players(id,sport,team_id,name) VALUES(10,'Football',?,'Saka')", (ARS,))
        c.execute("INSERT INTO rankit_match_players(match_id,player_id,team_id) VALUES(1,10,?)", (ARS,))
        rankit_rank.seed_rules(c)
    return path


def client(uid=ME, admin=False):
    app = FastAPI()
    app.include_router(RK.router)
    app.dependency_overrides[get_optional_user] = lambda: {"sub": str(uid)}
    if admin:
        app.dependency_overrides[require_admin] = lambda: {"sub": str(uid)}
    return TestClient(app)


def crowd(match_id, rating, voters=20, start=20, classic=0):
    with DB.get_conn() as c:
        c.executemany("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,classic,visibility)
                         VALUES(?,?,'2026-09-01',?,?,'public')""",
                      [(u, match_id, rating, classic) for u in range(start, start + voters)])


def capture(scenario: str, name: str, payload) -> None:
    """Altin ornek: frontend izole gorunum testleri bunu okuyabilir."""
    folder = FIXTURES / scenario
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")


def has(payload: dict, *keys) -> bool:
    return all(k in payload for k in keys)


# ── Dolu hesap: her web ekraninin okudugu alanlar ───────────────────────────

@pytest.fixture()
def rich(monkeypatch):
    fresh_db(monkeypatch, "rich")
    api, admin = client(), client(admin=True)
    crowd(1, 4.6, classic=1); crowd(2, 3.0); crowd(3, 4.9, voters=19); crowd(4, 4.2)
    with DB.get_conn() as c:
        c.executemany("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,?,?)",
                      [(ME, "team", ARS), (ME, "user", FRIEND), (FRIEND, "user", ME),
                       (ME, "competition", PL)])
        c.executemany("INSERT INTO rankit_watchlist(user_id,match_id,appetite) VALUES(?,5,?)",
                      [(u, 4) for u in range(20, 41)])
        c.execute("INSERT INTO rankit_potm_votes(user_id,match_id,player_id) SELECT user_id,1,10 FROM rankit_diary_entries WHERE match_id=1 GROUP BY user_id")
    api.post("/api/rankit/diary", json={"match_id": 1, "rating": 5.0, "classic": True,
                                        "review": "Stayed on my feet from the 70th minute.",
                                        "tags": ["Atmosphere", "End-to-end"], "skin": "ember"})
    api.post("/api/rankit/diary", json={"match_id": 4, "rating": 3.5})
    client(FRIEND).post("/api/rankit/diary", json={"match_id": 1, "rating": 4.0, "review": "The away end never sat down."})
    admin.post("/api/rankit/admin/collections", json={"title": "Every London Derby", "subtitle": "Rate all four this season.",
                                                      "declared_total": 4, "reward": "TURF", "match_ids": [1, 3, 5]})
    lid = api.post("/api/rankit/lists", json={"title": "Nights I'd watch again", "ranked": True, "match_ids": [1, 4]}).json()["list_id"]
    client(FRIEND).post(f"/api/rankit/lists/{lid}/respect")
    theirs = client(FRIEND).post("/api/rankit/lists", json={"title": "The 38", "match_ids": [2]}).json()["list_id"]
    api.post(f"/api/rankit/lists/{theirs}/save")
    with DB.get_conn() as c:
        rankit_notify.notify(c, ME, "broadcast", match_id=5, detail="GB · Sky Sports")
    return api


def test_web_surfaces_carry_every_field_the_screens_read(rich):
    api = rich

    # 7a Home — ray (standing, koleksiyonlar, takipler) + gece + akis
    home = api.get("/api/rankit/home?tz_offset=0&country=GB").json()
    assert has(home, "matches", "activity", "day")
    assert has(home["day"], "start", "end", "matches")
    card = next(m for m in home["matches"] if m["id"] == 1)
    assert has(card, "community_rating", "rating_count", "instant_classic", "home", "away", "score", "my_rating", "my_skin")
    capture("dolu", "home", home)

    rank = api.get("/api/rankit/rank?tz_offset=0").json()
    assert has(rank, "rank", "streak", "breakdown", "matches")
    assert {r["kind"] for r in rank["breakdown"]} >= {"rate_same_day", "rate_late", "respect", "companion", "season"}
    assert has(rank["streak"], "current", "best", "tonight_counted")
    capture("dolu", "rank", rank)

    activity = api.get("/api/rankit/activity?scope=following").json()
    assert has(activity, "scope", "items", "has_more")
    entry = next(i for i in activity["items"] if i["kind"] == "entry")
    assert has(entry, "user", "match", "rating", "review", "review_withheld", "viewer_rated", "respect", "replies", "on_the_night")
    assert has(entry["match"], "home_name", "home_short", "away_name", "away_short", "home_score", "status")
    capture("dolu", "activity", activity)

    # 8a Discover — rayda sayilarla filtreler + siralar
    catalog = api.get("/api/rankit/catalog?facets=true&sort=hottest&limit=10").json()
    assert has(catalog, "matches", "total", "sort", "facets")
    assert set(catalog["facets"]) == {"sport", "status", "competition", "season"}
    assert all(has(f, "value", "count") for f in catalog["facets"]["sport"])
    heats = [m["community_rating"] for m in catalog["matches"] if m["community_rating"] is not None]
    assert heats == sorted(heats, reverse=True)
    capture("dolu", "catalog_facets", catalog)

    # 8c Competition — tablo + AVG HEAT, hafta listesi
    comp = api.get(f"/api/rankit/competitions/{PL}").json()
    assert has(comp, "competition", "standings", "fixtures", "matchweeks", "popular_players")
    row = comp["standings"][0]
    assert has(row, "team_id", "name", "short_name", "played", "won", "drawn", "lost", "gf", "ga", "gd", "points",
               "avg_heat", "heat_matches", "crest_url", "color")
    capture("dolu", "competition", comp)

    # 7g Season heat map
    heatmap = api.get(f"/api/rankit/competitions/{PL}/heatmap").json()
    assert heatmap["available"] is True and has(heatmap, "weeks", "clubs", "summary", "min_ratings")
    cell = heatmap["clubs"][0]["cells"][0]
    assert has(cell, "week", "match_id", "state", "heat", "ratings", "logged")
    assert {c["state"] for club in heatmap["clubs"] for c in club["cells"]} <= {"heat", "too_few", "unplayed", "none"}
    assert has(heatmap["summary"], "hot_weeks", "best_week", "logged", "week_heat")
    capture("dolu", "heatmap", heatmap)
    assert api.get("/api/rankit/competitions/2/heatmap").json()["available"] is False   # NBA'de mac haftasi yok

    # 7f Shelf
    shelf = api.get("/api/rankit/shelf?sort=newest&limit=50").json()
    assert has(shelf, "owner_id", "sort", "cards", "total", "counts", "next_offset")
    assert has(shelf["counts"], "cards", "classic_cards")
    assert has(shelf["cards"][0], "entry", "competition")
    assert has(shelf["cards"][0]["entry"], "id", "rating", "classic", "skin", "watched_date", "rewatch")
    capture("dolu", "shelf", shelf)

    # 7h Review reading
    reviews = api.get("/api/rankit/matches/1/reviews?sort=respected").json()
    assert has(reviews, "total", "sort", "scope", "followed", "everyone", "next_offset",
               "top_tags", "spread", "rating_count", "community_rating")
    assert all(has(t, "tag", "count") for t in reviews["top_tags"])
    assert set(reviews["spread"]) == {"1", "2", "3", "4", "5"}
    listed = (reviews["followed"] + reviews["everyone"])[0]
    assert has(listed, "id", "user_id", "is_mine", "username", "rating", "review", "respect", "replies", "on_the_night")
    capture("dolu", "reviews", reviews)
    assert api.get("/api/rankit/matches/1/reviews?scope=following").json()["total"] == 1

    # 11c Search
    search = api.get("/api/rankit/search?q=Arsenal&match_sort=hottest").json()
    assert has(search, "matches", "players", "teams", "members", "lists", "collections", "counts", "truncated")
    assert set(search["counts"]) >= {"matches", "teams", "players", "members", "lists"}
    club = search["teams"][0]
    assert has(club, "id", "name", "short_name", "crest_url", "rated", "competition",
               "season_competition", "season_avg_heat", "season_heat_matches", "following")
    capture("dolu", "search", search)

    # 12a Entity drawer (kulup)
    team = api.get(f"/api/rankit/teams/{ARS}").json()
    assert has(team, "team", "players", "following", "favorited", "matches", "season", "logged", "venue", "hottest", "next")
    assert has(team["season"], "season_competition", "season_avg_heat", "season_heat_matches", "played", "classics", "position")
    assert team["next"] is None or has(team["next"], "id", "collections")
    capture("dolu", "team", team)

    # 12b Lists
    lists = api.get("/api/rankit/lists/mine").json()
    assert has(lists, "owned", "saved")
    assert has(lists["owned"][0], "id", "title", "visibility", "ranked", "match_count", "rated", "respect", "saves")
    assert has(lists["saved"][0], "id", "title", "username", "match_count")
    capture("dolu", "lists_mine", lists)

    # 12c The Hunt
    hunt = api.get("/api/rankit/collections").json()
    assert has(hunt, "summary", "collections")
    assert has(hunt["summary"], "collected", "total", "pct", "active", "one_left")
    curated = next(c for c in hunt["collections"] if c["kind"] == "curated")
    assert has(curated, "id", "kind", "title", "subtitle", "collected", "total", "known", "unscheduled",
               "remaining", "status", "opens_note", "reward", "next")
    detail = api.get(f"/api/rankit/collections/{curated['id']}").json()
    assert has(detail, "collected_matches", "open_matches", "upcoming_matches", "unscheduled")
    capture("dolu", "collections", hunt)
    capture("dolu", "collection_detail", detail)

    # 14a First run
    onboarding = api.get("/api/rankit/onboarding").json()
    assert has(onboarding, "done", "account", "primary_arch_connections", "competitions", "clubs",
               "followed_clubs", "followed_competition_ids")
    assert has(onboarding["account"], "username", "email")
    capture("dolu", "onboarding", onboarding)

    # 14b Notifications
    alerts = api.get("/api/rankit/notifications").json()
    assert has(alerts, "items", "unread", "states", "has_more")
    for item in alerts["items"]:
        assert item["channel"] in {"heat", "social", "collections"}
        assert "viewer_rated" in item
    capture("dolu", "notifications", alerts)

    # 11a Quick-rate + 11b skins (web diyaloglari ayni uclari kullanir)
    quick = api.get("/api/rankit/quick-rate?tz_offset=0").json()
    assert has(quick, "tonight", "catchup", "catchup_total", "streak", "tonight_counted", "at_risk")
    capture("dolu", "quick_rate", quick)
    skins = api.get("/api/rankit/skins").json()
    assert has(skins, "skins", "selected", "floodlight_nights")
    assert all(has(s, "id", "name", "rule", "locked", "available") for s in skins["skins"])
    capture("dolu", "skins", skins)

    # 8b Profile
    profile = api.get("/api/rankit/profile").json()
    assert has(profile, "user", "stats", "owned_lists", "favorite_matches")
    assert has(profile["stats"], "matches", "classics", "diary_count", "avg_rating", "reviews",
               "following_people", "followers", "following_sources", "lists")
    capture("dolu", "profile", profile)

    # 10a People
    people = api.get("/api/rankit/people?kind=following").json()
    assert has(people, "owner", "counts", "people", "total", "next_offset")
    assert has(people["people"][0], "id", "username", "following", "follows_you", "matches", "classics", "overlap")
    assert has(people["people"][0]["overlap"], "shared", "agree", "pct", "bias", "min_shared")
    capture("dolu", "people", people)


# ── Bos hesap: 8d durumlari (uydurma yok, dogru bos) ────────────────────────

@pytest.fixture()
def empty(monkeypatch):
    fresh_db(monkeypatch, "empty")
    return client(STRANGER)


def test_empty_account_gets_honest_empties(empty):
    api = empty

    home = api.get("/api/rankit/home?tz_offset=0").json()
    assert home["activity"] == [] and isinstance(home["matches"], list)
    assert all(m["community_rating"] is None and m["rating_count"] == 0 for m in home["matches"])
    capture("bos", "home", home)

    catalog = api.get("/api/rankit/catalog?facets=true&min_heat=4.0").json()
    assert catalog["total"] == 0 and catalog["matches"] == []
    capture("bos", "catalog_facets", catalog)

    comp = api.get(f"/api/rankit/competitions/{PL}").json()
    assert all(row["avg_heat"] is None and row["heat_matches"] == 0 for row in comp["standings"])
    capture("bos", "competition", comp)

    heatmap = api.get(f"/api/rankit/competitions/{PL}/heatmap").json()
    assert heatmap["summary"]["hot_weeks"] == 0 and heatmap["summary"]["logged"] == 0
    assert heatmap["summary"]["best_week"] is None
    assert all(c["state"] in {"too_few", "unplayed", "none"} and c["logged"] is False
               for club in heatmap["clubs"] for c in club["cells"])
    capture("bos", "heatmap", heatmap)

    shelf = api.get("/api/rankit/shelf").json()
    assert shelf["cards"] == [] and shelf["counts"] == {"cards": 0, "classic_cards": 0} and shelf["next_offset"] is None
    capture("bos", "shelf", shelf)

    reviews = api.get("/api/rankit/matches/1/reviews").json()
    assert reviews["total"] == 0 and reviews["spread"] is None and reviews["community_rating"] is None
    assert reviews["top_tags"] == [] and reviews["next_offset"] is None
    capture("bos", "reviews", reviews)

    search = api.get("/api/rankit/search?q=zzzz").json()
    assert all(search[key] == [] for key in ("matches", "players", "teams", "members", "lists", "collections"))
    assert all(v is False for v in search["truncated"].values())
    capture("bos", "search", search)

    team = api.get(f"/api/rankit/teams/{ARS}").json()
    assert team["logged"] == 0 and team["hottest"] == [] and team["season"]["season_avg_heat"] is None
    capture("bos", "team", team)

    lists = api.get("/api/rankit/lists/mine").json()
    assert lists == {"owned": [], "saved": []}
    capture("bos", "lists_mine", lists)

    hunt = api.get("/api/rankit/collections").json()
    assert hunt["summary"]["total"] == 0 and hunt["summary"]["pct"] is None
    assert [c["status"] for c in hunt["collections"]] == ["not_open"]          # yalniz bu yilin Classic'leri
    capture("bos", "collections", hunt)

    alerts = api.get("/api/rankit/notifications").json()
    assert alerts["items"] == [] and alerts["unread"] == 0 and alerts["has_more"] is False
    capture("bos", "notifications", alerts)

    quick = api.get("/api/rankit/quick-rate?tz_offset=0").json()
    assert quick["streak"] == 0 and quick["at_risk"] is False and quick["tonight_counted"] is False
    capture("bos", "quick_rate", quick)

    activity = api.get("/api/rankit/activity").json()
    assert activity["items"] == [] and activity["has_more"] is False
    capture("bos", "activity", activity)

    people = api.get("/api/rankit/people?kind=following").json()
    assert people["people"] == [] and people["total"] == 0
    capture("bos", "people", people)


def test_fixtures_are_written_for_isolated_frontend_tests(rich):
    """Altin ornekler diske yazildi: frontend sunucu ayaga kaldirmadan
    gercek yanit sekliyle gorunum testi yazabilir."""
    rich.get("/api/rankit/home?tz_offset=0&country=GB")
    written = sorted(p.name for p in (FIXTURES / "dolu").glob("*.json"))
    assert {"home.json", "catalog_facets.json", "competition.json", "heatmap.json", "shelf.json",
            "reviews.json", "search.json", "team.json", "lists_mine.json", "collections.json",
            "onboarding.json", "notifications.json"} <= set(written)
    sample = json.loads((FIXTURES / "dolu" / "heatmap.json").read_text(encoding="utf-8"))
    assert sample["available"] is True
