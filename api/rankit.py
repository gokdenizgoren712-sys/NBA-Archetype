"""RankIt by Primary Arch - sosyal mac gunlugu API'si.

MVP bilincli olarak mevcut kullanici/JWT ve SQLite altyapisini paylasir; spor
scouting tablolarina baglanmaz. Mac katalogu ileride veri saglayicidan dolacak,
yerel gelistirmede ise seed_rankit() deterministik bir demo katalogu kurar.
"""
from __future__ import annotations

import os
import time
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .auth import get_optional_user, require_admin, verify_token
from .db import get_conn
from . import rankit_rank
from . import rankit_notify
from . import rankit_hunt
from .rankit_live_sync import clean_minute

router = APIRouter(prefix="/api/rankit", tags=["RankIt"])
IS_PROD = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") == "true" or os.environ.get("IS_PROD") == "true")

FOTMOB_LEAGUE_IDS = {
    "Premier League": [47],
    "La Liga": [87],
    "Serie A": [55],
    "Bundesliga": [54],
    "Ligue 1": [53],
    "FA Cup": [132],
    "Copa del Rey": [138],
    "Coppa Italia": [141],
    "DFB-Pokal": [209],
    "Coupe de France": [134],
    "UEFA Champions League": [42, 10611],
    "UEFA Europa League": [73, 10613],
    "UEFA Conference League": [10216, 10615],
}


def _team_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def _save_team_logo(conn, team_id: int, url: str, source: str) -> None:
    conn.execute("""INSERT INTO rankit_team_logos(team_id,logo_url,source,updated_at)
        VALUES(?,?,?,datetime('now'))
        ON CONFLICT(team_id) DO UPDATE SET
          logo_url=excluded.logo_url,source=excluded.source,updated_at=datetime('now')""",
        (team_id, url, source))


def backfill_rankit_team_logos() -> dict:
    """Eksik canlı armaları sağlayıcı kimliklerinden bir kez tamamla.

    Idempotenttir: yalnızca logosu olmayan takımlar için sağlayıcıya gider.
    Deploy başlangıcını bloklamaması için main.py bunu arka planda çalıştırır.
    """
    added_nba = added_football = 0
    with get_conn() as conn:
        # Yalniz NBA'de oynayan takimlar: EuroLeague takimlari da 'Basketball' ve
        # kisa ad eslemesi (ör. "MIL") bir NBA kisaltmasiyla carpisirsa baska bir
        # kulubun armasini alirdi. EuroLeague armalari kendi senkronundan gelir.
        missing_nba = conn.execute("""SELECT t.id,t.name,t.short_name FROM rankit_teams t
            LEFT JOIN rankit_team_logos l ON l.team_id=t.id
            WHERE t.sport='Basketball' AND l.id IS NULL
              AND EXISTS(SELECT 1 FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
                         WHERE c.name='NBA' AND t.id IN (m.home_team_id, m.away_team_id))""").fetchall()
        if missing_nba:
            from nba_api.stats.static import teams as nba_teams
            nba_meta = nba_teams.get_teams()
            by_key = {_team_key(t["full_name"]): t for t in nba_meta}
            by_abbr = {t["abbreviation"].upper(): t for t in nba_meta}
            for row in missing_nba:
                item = by_abbr.get(row["short_name"].upper()) or by_key.get(_team_key(row["name"]))
                if not item:
                    continue
                url = f"https://cdn.nba.com/logos/nba/{item['id']}/primary/L/logo.svg"
                _save_team_logo(conn, row["id"], url, "nba")
                added_nba += 1

        missing_football = conn.execute("""SELECT t.id,t.name FROM rankit_teams t
            LEFT JOIN rankit_team_logos l ON l.team_id=t.id
            WHERE t.sport='Football' AND l.id IS NULL""").fetchall()
        missing_by_key = {_team_key(r["name"]): r["id"] for r in missing_football}
        if missing_by_key:
            from curl_cffi import requests as curl_requests
            scopes = conn.execute("""SELECT DISTINCT c.name,c.season FROM rankit_competitions c
                JOIN rankit_matches m ON m.competition_id=c.id
                WHERE c.sport='Football'""").fetchall()
            for scope in scopes:
                league_ids = FOTMOB_LEAGUE_IDS.get(scope["name"])
                if not league_ids:
                    continue
                start = str(scope["season"]).split("-")[0]
                season = f"{start}/{int(start) + 1}"
                for league_id in league_ids:
                    try:
                        response = curl_requests.get(
                            "https://www.fotmob.com/api/data/leagues",
                            params={"id": league_id, "season": season},
                            impersonate="chrome124", timeout=20,
                        )
                        if response.status_code != 200:
                            continue
                        fixtures = ((response.json().get("fixtures") or {}).get("allMatches") or [])
                    except Exception:
                        continue
                    for match in fixtures:
                        for side in (match.get("home") or {}, match.get("away") or {}):
                            team_id = missing_by_key.get(_team_key(side.get("name", "")))
                            provider_id = side.get("id")
                            if not team_id or not provider_id:
                                continue
                            url = f"https://images.fotmob.com/image_resources/logo/teamlogo/{provider_id}.png"
                            _save_team_logo(conn, team_id, url, "fotmob")
                            missing_by_key.pop(_team_key(side.get("name", "")), None)
                            added_football += 1
                if not missing_by_key:
                    break
    return {"nba": added_nba, "football": added_football}


# BUILD §4.2: skin YALNIZCA koleksiyon kartini ve paylasim gorselini boyar,
# uygulama kabugu asla. Kilitler urun kurali, uydurma esik degil (HANDOFF):
# Turf "finish a collection" (The Hunt), Floodlight "a 7-night streak"
# (HANDOFF: "7 nights -> Floodlight"; en iyi seri sayilir, kirilmasi kilidi
# geri almaz). Gilt kilit degil: yalniz Classic damgali kartta.
#
# Sahibin karari (2026-09-23), BUILD §4.2'deki "Seven"i genisletir:
#  - Yeni kayit olan herkesin elinde 10 serbest skin var (Gilt bunlardan
#    biri degil -- o maca gore acilir). Ilk altisi 4d/2j tahtasindan; Chalk,
#    Scarf, Scoreboard, Rain yeni.
#  - Her Hunt liginin kendi skini: o ligde bir kulup sezonunu ("The 38")
#    bitiren o ligin skinini acar. La Liga'yi bitiren La Liga'yi, baskasini
#    degil. Kilitli baslar; Turf gibi bir kez acilan kalir.
LEAGUE_SKINS = (("premier", "Premier League"), ("laliga", "La Liga"), ("seriea", "Serie A"),
                ("bundesliga", "Bundesliga"), ("ligue1", "Ligue 1"), ("euroleague", "EuroLeague"),
                ("nba", "NBA"))
SKINS = (("default", "Default", None), ("broadsheet", "Broadsheet", None),
         ("holofoil", "Holofoil", None), ("ember", "Ember", None), ("ink", "Ink", None),
         ("stub", "Stub", None), ("chalk", "Chalk", None), ("scarf", "Scarf", None),
         ("scoreboard", "Scoreboard", None), ("rain", "Rain", None),
         ("gilt", "Gilt", "classic"),
         ("turf", "Turf", "collection"), ("floodlight", "Floodlight", "streak"),
         *((sid, league, f"league:{league}") for sid, league in LEAGUE_SKINS))
SKIN_RULES = {sid: rule for sid, _name, rule in SKINS}
SKIN_NAMES = {sid: name for sid, name, _rule in SKINS}
SKIN_FOR_LEAGUE = {league: sid for sid, league in LEAGUE_SKINS}
FLOODLIGHT_NIGHTS = 7


def _is_earned(rule: Optional[str]) -> bool:
    """Kazanilarak acilan (kilitli baslayan) skin mi? Gilt degil: o kilit degil, kart kurali."""
    return rule in ("collection", "streak") or str(rule or "").startswith("league:")


def _completed_leagues(conn, uid: int, hunt_items: list) -> set:
    """Kullanicinin bir kulup sezonunu bitirdigi ligler. Iki kaynak: avdaki
    tamamlanmis kulup sezonlari (takip edilen kulupler) ve tamamlanma kaydi
    (kulup sonradan takipten cikarilsa da bitirilmis sayilir)."""
    done = {i["competition"]["name"] for i in hunt_items
            if i["kind"] == "club_season" and i["status"] == "complete" and i.get("competition")}
    done |= {r["name"] for r in conn.execute(
        """SELECT DISTINCT comp.name FROM rankit_collection_completions cc
           JOIN rankit_collections c ON c.id=cc.collection_id AND c.kind='club_season'
           JOIN rankit_competitions comp ON comp.id=c.competition_id
           WHERE cc.user_id=?""", (uid,)).fetchall()}
    return done


def _unlocked_skins(conn, uid: int, tz_offset: int = 0) -> set:
    """Kazanilmis kilitli skinler. Bir kez kazanilan KALIR (hesap ayari olarak
    yazilir): seri kirilinca ya da bir puan kaldirilinca kart geri kilitlenmez."""
    kept = {r["key"][5:] for r in conn.execute(
        "SELECT key FROM rankit_user_settings WHERE user_id=? AND key LIKE 'skin:%' AND value='1'",
        (uid,)).fetchall()}
    earned = set()
    if "floodlight" not in kept and rankit_rank.streak_for(conn, uid, tz_offset)["best"] >= FLOODLIGHT_NIGHTS:
        earned.add("floodlight")
    open_leagues = {sid for sid, _league in LEAGUE_SKINS if sid not in kept}
    if "turf" in kept and not open_leagues:
        hunt_items = []
    else:
        hunt_items = rankit_hunt.hunt_for(conn, uid)
    # Yilin Classic'leri dinamik bir liste; onu "bitirmek" bir koleksiyonu
    # tamamlamak sayilmaz (tek Classic'li bir Ocak'ta bedava olurdu).
    if "turf" not in kept and any(c["status"] == "complete" and c["kind"] != "classics_year"
                                  for c in hunt_items):
        earned.add("turf")
    if open_leagues:
        earned |= {SKIN_FOR_LEAGUE[name] for name in _completed_leagues(conn, uid, hunt_items)
                   if name in SKIN_FOR_LEAGUE} & open_leagues
    for sid in earned:
        conn.execute("""INSERT INTO rankit_user_settings(user_id,key,value) VALUES(?,?,'1')
                        ON CONFLICT(user_id,key) DO UPDATE SET value='1'""", (uid, f"skin:{sid}"))
    return kept | earned


def _newly_unlocked(conn, uid: int, tz_offset: int = 0) -> list[dict]:
    """6a dorduncu satir ("TURF UNLOCKED ... Use it", 4i: "the unlock is a
    row, not a modal"): BU puanlamanin actigi skinler. Onceden kazanilip
    yazilmis olanlar sayilmaz."""
    before = {r["key"][5:] for r in conn.execute(
        "SELECT key FROM rankit_user_settings WHERE user_id=? AND key LIKE 'skin:%' AND value='1'",
        (uid,)).fetchall()}
    fresh = _unlocked_skins(conn, uid, tz_offset) - before
    return [{"id": sid, "name": name, "rule": rule} for sid, name, rule in SKINS if sid in fresh]


class DiaryIn(BaseModel):
    """Kısmi güncelleme sözleşmesi: GÖNDERİLMEYEN alan DEĞİŞTİRİLMEZ.

    Eskiden bu alanların hepsinin somut bir varsayılanı vardı (visibility
    "public", classic False, tags []). Web denetçisi yalnızca {match_id,
    rating, review} gönderdiği için, telefonda yazılmış bir kaydı web'den
    puanlamak sessizce: Classic damgasını siliyor, tüm etiketleri siliyor,
    izlenme tarihini bugüne çekiyor ve en ağırı — GİZLİ bir yorumu HERKESE
    AÇIK yapıyor, spoiler işaretini kaldırıyordu. Bu bir gizlilik geri
    adımıydı ve geri alınamıyordu (silme/undo yok). Artık None = "dokunma".
    """
    match_id: int
    entry_id: Optional[int] = Field(default=None, gt=0)
    # §7.2 "kendi saat diliminde": sunucunun UTC'si tek basina RankIt
    # gununu belirleyemez. Istemci dakika cinsinden ofset gonderir
    # (JS getTimezoneOffset'in isareti ters, istemci duzeltir).
    tz_offset: int = Field(default=0, ge=-840, le=840)
    watched_date: Optional[date] = None
    rating: Optional[float] = None
    review: Optional[str] = Field(default=None, max_length=4000)
    is_rewatch: bool = False
    visibility: Optional[Literal["public", "followers", "private"]] = None
    classic: Optional[bool] = None
    spoiler: Optional[bool] = None
    tags: Optional[list[str]] = None
    # Cevrimdisi kuyruktan gelen puanin telefondaki ANI (ekran 3l). Dar bir
    # pencerede kabul ediliyor -- bkz. rankit_rank.accepted_rated_at.
    rated_at: Optional[datetime] = None
    # Istemcinin bu kayit icin urettigi kimlik (UUID gibi). Ayni kimlikle gelen
    # tekrar YENI satir dogurmaz, ayni kaydi gunceller: cevrimdisi kuyruk sonucu
    # belirsiz bir yeniden izlemeyi guvenle tekrar gonderebilir (HANDOFF
    # §4.10). Gonderilmezse eski davranis.
    client_entry_id: Optional[str] = Field(default=None, min_length=8, max_length=64,
                                           pattern=r"^[A-Za-z0-9_-]+$")
    # 2j: kartin skini. None = dokunma, "default" = varsayilana don.
    # Kimlikler SKINS'ten: yeni bir skin iki yerde tanimlanmasin.
    skin: Optional[Literal[tuple(SKIN_RULES)]] = None


class VoteIn(BaseModel):
    player_id: int


class RespectIn(BaseModel):
    player_ids: list[int] = Field(default_factory=list)


class FollowIn(BaseModel):
    # 'list' YOK: rankit_follows'un CHECK kisiti onu reddediyor. Liste
    # kaydetme kendi tablosunda (rankit_list_saves) -- gercek takipleri
    # tasiyan bir tabloyu CHECK degistirmek icin yeniden kurmak yerine.
    target_type: Literal["user", "team", "player", "competition"]
    target_id: int
    notify: bool = False
    on: Optional[bool] = None


class ListIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    ranked: bool = False
    visibility: Literal["public", "followers", "private"] = "public"
    match_ids: list[int] = Field(default_factory=list, max_length=500)


class ListUpdateIn(BaseModel):
    """3h duzenleme. Gonderilmeyen alan degismez."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    ranked: Optional[bool] = None
    visibility: Optional[Literal["public", "followers", "private"]] = None


class ListOrderIn(BaseModel):
    match_ids: list[int] = Field(max_length=500)


class ToggleIn(BaseModel):
    """Tekrar guvenli toggle (§5.4 "never discard work the user already did").
    `on` gonderilirse istenen DURUM yazilir; sonucu belirsiz bir istegin
    tekrari durumu geri cevirmez. Gonderilmezse eski davranis: tersine cevir."""
    on: Optional[bool] = None


def _want(exists, body) -> bool:
    on = getattr(body, "on", None) if body is not None else None
    return (not exists) if on is None else bool(on)


class ReviewCommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    # Sonucu belirsiz gonderimin tekrari ikinci yanit dogurmasin.
    client_id: Optional[str] = Field(default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    # §6.1: onek YAZILMAZ, yanit eylemi uretir. Istemci kime yanit
    # verdigini gonderir; sunucu handle'i kendisi cozer.
    reply_to: Optional[int] = None


class TargetIn(BaseModel):
    target_type: Literal["match", "team", "player", "competition"]
    target_id: int
    on: Optional[bool] = None


class ListItemIn(BaseModel):
    match_id: int
    note: str = Field(default="", max_length=300)


WATCHALONG_CONNECTIONS: dict[tuple[int, str], list[WebSocket]] = {}
# Companion odasinda SU AN kim var: mac -> {kullanici: acik baglanti sayisi}.
# 15d "312 in the room" bundan; ayni kullanicinin iki sekmesi bir kisidir.
# Surec ici bellek: tek surec (Railway) icin dogru; cok surecte her surec
# kendi odasini sayar (bilinen sinir).
ROOM_USERS: dict[int, dict[int, int]] = {}


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
        uid = int(user["sub"])
        # Imzasi gecerli ama hesabi silinmis bir token (token TOKEN_EXPIRE_DAYS
        # boyunca kendi basina gecerli): yazmalar FK hatasiyla 500 donuyor,
        # /profile bos kullanicida cokuyordu. Hesap yoksa yeniden giris.
        if not conn.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
            raise HTTPException(status_code=401, detail="Sign in again")
        return uid
    if not IS_PROD:
        return _demo_user_id(conn)
    raise HTTPException(status_code=401, detail="Sign in to use RankIt")


def seed_rankit() -> None:
    """Bos DB'de YEREL prototip icin kucuk ama iliskisel bir katalog kur.

    PRODUCTION'DA CALISMAZ. Onceden tek koruma "tabloda mac var mi" idi; canli
    veritabani bos oldugu ilk aciliste bu yetmedi ve 4 demo mac + 4 demo
    kullanici gercek veritabanina yazildi. Gercek katalog yuklendikten sonra
    zararsiz gorunuyorlar ama gercek degiller: kullanici onlari puanlayabilir,
    yorumlayabilir, listeye ekleyebilir.

    Bos-DB kontrolu de kaliyor — ikisi birden, ciftbasli koruma.
    """
    if IS_PROD:
        return
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


def _mask_spoiler_text(item: dict, uid: Optional[int]) -> dict:
    """Ozet listelerde spoiler isaretli inceleme METNI yanita girmez.

    CODE.md Adim 4 / BUILD §3: ana ekran akisi ve uye profili gibi OZETLER,
    yazarin "spoiler icerir" dedigi metni tasimaz -- yalnizca arayuzde
    gizlemek yetmez. Istisna: izleyen yazarin kendisi ya da o maci zaten
    puanlamis (bozulacak bir sey kalmamis). Metnin tamami incelemenin kendi
    yuzeyinde (4a/5c) kendi TAP TO SHOW kapisiyla duruyor.
    Beklenen alanlar: spoiler, user_id, viewer_rated (sonuncusu cikarilir).
    """
    viewer_rated = bool(item.pop("viewer_rated", 0))
    item["spoiler"] = bool(item.get("spoiler"))
    withheld = item["spoiler"] and not viewer_rated and item.get("user_id") != uid
    item["review_withheld"] = withheld
    if withheld:
        item["review"] = ""
    return item


# Yazarin bu mactaki puanlama odulunun turu (rate_same_day / rate_late).
# Odul puanin verildigi anda YAZARIN kendi saat dilimiyle hesaplandi.
NIGHT_AWARD_SQL = """(SELECT p.kind FROM rankit_points p WHERE p.user_id=e.user_id
    AND p.subject_type='match' AND p.subject_id=e.match_id
    AND p.kind IN ('rate_same_day','rate_late') LIMIT 1) night_award"""


def _on_the_night(row, tz_offset: int) -> bool:
    """4a "rated on the night" / 5c "on the night": YAZARIN gecesi.

    Eskiden kaydin created_at'i IZLEYENIN ofsetiyle mac gunune kiyaslaniyordu:
    ayni inceleme Istanbul'dan bakana "on the night", New York'tan bakana
    degil gorunebiliyordu; yildizsiz kaydedilip ertesi gun puanlanan kayit da
    kayit ani yuzunden "gecesinde puanlandi" sayiliyordu. Olcu artik yazarin
    puanlama odulu (serinin de dayandigi kural, §7.2). Odul satiri yoksa (eski
    kayit) ya da kayit yeniden izlemeyse puanin ANI (rated_at, yoksa
    created_at) mac gunuyle kiyaslanir. Puansiz kayit gecesinde puanlanmis
    sayilmaz.
    """
    if row["rating"] is None:
        return False
    if row["night_award"] is not None and not row["is_rewatch"]:
        return row["night_award"] == "rate_same_day"
    logged = rankit_rank._as_dt(row["rated_at"] or row["created_at"])
    played = rankit_rank._as_dt(row["starts_at"])
    return bool(logged and played
                and rankit_rank.rankit_day(logged, tz_offset) == rankit_rank.rankit_day(played, tz_offset))


def _match_dict(conn, row, uid: Optional[int] = None) -> dict:
    mid = row["id"]
    # Topluluk puaninda her kullanicinin yalnizca en son puani sayilir. Rewatch
    # gunlukleri sosyal akista kalir ama tek bir kullanici ortalamayi sisiremez.
    rating = conn.execute("""SELECT AVG(e.rating) avg,COUNT(*) n FROM rankit_diary_entries e
        WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
            WHERE match_id=? AND rating IS NOT NULL GROUP BY user_id)""", (mid,)).fetchone()
    # "318 reviews >" 5c listesine gider ve o liste yalnizca HERKESE ACIK
    # incelemeleri gosterir (rankit_match_reviews). Gizli/takipci incelemeleri
    # saymak, linkin acmadigi bir sayi vaat ediyordu.
    # Banli hesabin incelemesi 5c'de listelenmiyor; sayi da onu vaat etmez.
    review_count = conn.execute("""SELECT COUNT(*) n FROM rankit_diary_entries e
        JOIN users u ON u.id=e.user_id
        WHERE e.match_id=? AND e.visibility='public' AND e.review<>'' AND u.is_banned=0""", (mid,)).fetchone()["n"]
    # Classic yuzdesi PUANLAYANLAR uzerinden: yildizsiz izleme kaydi bir hukum
    # degil, paydayi sulandirmamali (sahibin karari, 2026-09-21). n boylece
    # rating_count ile ayni kume.
    classics = conn.execute("""SELECT SUM(e.classic) c,COUNT(*) n FROM rankit_diary_entries e
        WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
            WHERE match_id=? AND rating IS NOT NULL GROUP BY user_id)""", (mid,)).fetchone()
    potm = conn.execute("""SELECT p.id,p.name,p.shirt_no,p.image_url,COUNT(*) votes
        FROM rankit_potm_votes v JOIN rankit_players p ON p.id=v.player_id
        WHERE v.match_id=? GROUP BY p.id ORDER BY votes DESC,p.name LIMIT 1""", (mid,)).fetchone()
    # "Kim aldi" bir topluluk hukmu: BUILD §5.5 "player share below 20 votes
    # reads TOO FEW VOTES" -- sahibin karari (2026-09-21) Instant Classic'teki
    # gibi 20 oy. Toplam oy sayisi kalir: TOO FEW VOTES'u o soyletir.
    potm_votes = int(conn.execute("SELECT COUNT(*) n FROM rankit_potm_votes WHERE match_id=?",
                                  (mid,)).fetchone()["n"] or 0)
    tags = conn.execute("""SELECT t.tag,COUNT(*) count FROM rankit_entry_tags t
        JOIN rankit_diary_entries e ON e.id=t.entry_id WHERE e.match_id=?
        GROUP BY t.tag ORDER BY count DESC,t.tag""", (mid,)).fetchall()
    mine = None
    my_tags, my_respect, my_potm_id = [], [], None
    watchlisted = False
    my_appetite = None
    favorited = False
    if uid:
        mine = conn.execute("""SELECT id,rating,review,classic,spoiler,visibility,is_rewatch,watched_date,skin
            FROM rankit_diary_entries WHERE user_id=? AND match_id=?
            ORDER BY watched_date DESC,id DESC LIMIT 1""", (uid, mid)).fetchone()
        if mine:
            my_tags = [r["tag"] for r in conn.execute("SELECT tag FROM rankit_entry_tags WHERE entry_id=? ORDER BY tag", (mine["id"],)).fetchall()]
        my_respect = [r["player_id"] for r in conn.execute("SELECT player_id FROM rankit_respect_votes WHERE user_id=? AND match_id=?", (uid, mid)).fetchall()]
        my_potm = conn.execute("SELECT player_id FROM rankit_potm_votes WHERE user_id=? AND match_id=?", (uid, mid)).fetchone()
        my_potm_id = my_potm["player_id"] if my_potm else None
        watch = conn.execute("SELECT appetite FROM rankit_watchlist WHERE user_id=? AND match_id=?", (uid, mid)).fetchone()
        watchlisted = bool(watch)
        my_appetite = watch["appetite"] if watch else None
        favorited = bool(conn.execute("SELECT 1 FROM rankit_favorites WHERE user_id=? AND target_type='match' AND target_id=?", (uid, mid)).fetchone())
    # Beklenen isi (2h/16c): "From 1,204 members who want this one. Not a
    # prediction -- an appetite reading." Kaynak: izleme listesine ekleyenlerin
    # 1-5 okumasi (rankit_watchlist.appetite). Yalnizca baslamamis macta; mac
    # basladiktan sonra tek isi topluluk isisidir ve o AYRI alan
    # (community_rating). §5.5: 20 okuma olmadan sayi yok; sayaclar kalir.
    # Alan adlari frontend adaptorunun okuduklari (heat.js expectedHeat /
    # expectedInterestCount): expected_rating_count = sayinin dayandigi OKUMA
    # sayisi (tahtadaki "N members"), watchlist_count = listedeki herkes.
    expected_heat = expected_rating_count = watchlist_count = None
    if row["status"] == "upcoming":
        pull = conn.execute("""SELECT COUNT(*) watchers, COUNT(appetite) readings, AVG(appetite) avg
            FROM rankit_watchlist WHERE match_id=?""", (mid,)).fetchone()
        expected_rating_count = int(pull["readings"] or 0)
        watchlist_count = int(pull["watchers"] or 0)
        if pull["avg"] is not None and expected_rating_count >= rankit_rank.MIN_COMMUNITY_RATINGS:
            expected_heat = round(float(pull["avg"]), 1)
    score = None if row["home_score"] is None else f'{row["home_score"]} – {row["away_score"]}'
    c, n = int(classics["c"] or 0), int(classics["n"] or 0)
    return {
        "id": mid, "sport": row["sport"], "competition": row["competition_name"],
        "competition_id": row["competition_id"], "season": row["season"],
        "stage": row["stage"] if "stage" in row.keys() else None,
        "provider": row["provider"],
        "status": row["status"], "starts_at": row["starts_at"],
        # 2a: "LIVE · 73'". Canli olay dongusu (rankit_live_sync) yaziyor;
        # yalnizca canli macta anlamli -- bitmis macin son dakikasi "canli"
        # gibi okunmasin.
        # Yazilirken temizleniyor; eski satirlar icin okurken de (bkz.
        # rankit_live_sync.clean_minute: gorunmez yon isaretleri yok).
        "live_minute": (clean_minute(row["live_minute"]) if row["status"] == "live"
                        and "live_minute" in row.keys() else None),
        # Canli skorun tazeligi: canli olay dongusu her yoklamada damgalar
        # (45 sn). Dongu durursa damga eskir; istemci "LIVE 73'"u bayat diye
        # isaretleyebilir (3l "stale/cache"), yalan bir canli skor gostermez.
        "live_updated_at": (row["events_polled_at"] if row["status"] == "live"
                            and "events_polled_at" in row.keys() else None),
        "home": _team(row, "home"), "away": _team(row, "away"), "score": score,
        # Ekran 3c skoru iki SATIRDA yaziyor, tek dizede degil: kaybeden
        # taraf sonmus renkte. Dizeyi ayristirmak yerine iki alan.
        "home_score": row["home_score"], "away_score": row["away_score"],
        # Eski serbest metin sutunu: hicbir senkron yazmiyor, yalnizca demo
        # tohumunun UYDURMA kanallari ("TRT 1", "S Sport Plus") duruyor ve kart
        # bunu "Watch on ..." diye gosteriyordu -- canlidaki demo maclarinda da.
        # Dogrulanmis yayin bilgisi ulkeye gore `broadcast` alaninda (kural /
        # kesin kayit, dogrulanma tarihiyle). Canlida bu metin yanita girmez.
        "broadcaster": None if IS_PROD else row["broadcaster"], "editorial": bool(row["editorial"]),
        "summary": row["summary"], "cover_variant": row["cover_variant"],
        # BUILD §5.5: 20 gercek puan olmadan topluluk isisi YOK -- sayi yaniti
        # hic terk etmemeli, arayuzde gizlemek yetmez. Sayac (rating_count)
        # kalir: TOO FEW RATINGS'i o soyletiyor.
        "community_rating": (round(float(rating["avg"]), 1)
                             if rating["avg"] is not None
                             and int(rating["n"] or 0) >= rankit_rank.MIN_COMMUNITY_RATINGS
                             else None),
        "rating_count": int(rating["n"] or 0), "review_count": int(review_count or 0),
        # Instant Classic de bir topluluk hukmu: 20 puan esigi ona da uygulanir
        # (BUILD §5.5, sahibin karari 2026-09-21). Eskiden 4 oy yetiyordu.
        "classic_count": c,
        "instant_classic": n >= rankit_rank.MIN_COMMUNITY_RATINGS and c / n >= rankit_rank.CLASSIC_SHARE,
        "potm": dict(potm) if potm and potm_votes >= rankit_rank.MIN_COMMUNITY_RATINGS else None,
        "potm_votes": potm_votes,
        "tags": [dict(t) for t in tags], "dominant_tag": tags[0]["tag"] if tags else None,
        "my_rating": mine["rating"] if mine else None, "my_classic": bool(mine["classic"]) if mine else False,
        "my_review": mine["review"] if mine else "", "my_tags": my_tags,
        "my_spoiler": bool(mine["spoiler"]) if mine else False,
        "my_visibility": mine["visibility"] if mine else "public",
        "my_rewatch": bool(mine["is_rewatch"]) if mine else False,
        "my_watched_date": mine["watched_date"] if mine else None,
        "my_skin": (mine["skin"] or "default") if mine else None,
        "my_potm_id": my_potm_id, "my_respect_ids": my_respect,
        # 15z panelde "saves as you type": otomatik kayit PUT /diary/{id} ile
        # YALNIZ inceleme metnini yazar (rating alani gitmez, puan korunur).
        # Kimlik olmadan istemci "maçin son kaydi"na yazmak zorunda kalirdi;
        # yeniden izleme varken bu yanlis kayit olabilir.
        "my_entry_id": mine["id"] if mine else None,
        "watchlisted": watchlisted, "favorited": favorited,
        "expected_heat": expected_heat, "expected_rating_count": expected_rating_count,
        "watchlist_count": watchlist_count, "my_appetite": my_appetite,
    }


MATCH_SELECT = """SELECT m.*,c.name competition_name,
    h.id home_id,h.name home_name,h.short_name home_short,h.color home_color,
    COALESCE((SELECT logo_url FROM rankit_team_logos WHERE team_id=h.id),h.crest_url) home_crest,
    a.id away_id,a.name away_name,a.short_name away_short,a.color away_color,
    COALESCE((SELECT logo_url FROM rankit_team_logos WHERE team_id=a.id),a.crest_url) away_crest
    FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
    JOIN rankit_teams h ON h.id=m.home_team_id JOIN rankit_teams a ON a.id=m.away_team_id"""

NEAREST_MATCH_ORDER = " ORDER BY ABS(julianday(m.starts_at)-julianday('now')),m.starts_at"

# Kartin isisi SQL'de: kullanici basina son puan, en az 20 puan (§5.5); esik
# altinda NULL. "Hottest" siralari (katalog 8a, arama 11c) bunu okur.
MATCH_HEAT_SQL = """(SELECT CASE WHEN COUNT(*) >= 20 THEN ROUND(AVG(rating),1) END
    FROM rankit_diary_entries WHERE id IN (SELECT MAX(id) FROM rankit_diary_entries
                                          WHERE match_id=m.id AND rating IS NOT NULL GROUP BY user_id))"""


def _rankit_day_window(tz_offset: int = 0) -> tuple[str, str]:
    """Bu RankIt gununun UTC sinirlari: yerel 11:00 -> ertesi 11:00 (§7.2).

    rankit_notify._hot_match ile ayni hesap; tz_offset dakika, UTC'nin
    dogusu pozitif (JS getTimezoneOffset'in tersi).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    day = rankit_rank.rankit_day(now, tz_offset)
    opens = datetime.fromisoformat(day) + timedelta(
        hours=rankit_rank.RANKIT_DAY_START_HOUR, minutes=-tz_offset)
    return opens.isoformat(), (opens + timedelta(days=1)).isoformat()


@router.get("/home")
def rankit_home(
    sport: str = "All",
    window_start: Optional[str] = None,
    window_end: Optional[str] = None,
    user=Depends(get_optional_user),
    # Sona ekli: rankit_home'u sirayla cagiran yerler (testler) bozulmasin.
    tz_offset: int = 0,
    country: Optional[str] = None,
):
    if not -840 <= tz_offset <= 840:
        raise HTTPException(422, "Invalid timezone offset")
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        has_synced = bool(conn.execute("SELECT 1 FROM rankit_matches WHERE provider IS NOT NULL LIMIT 1").fetchone())
        sql, args, where = MATCH_SELECT, [], []
        if has_synced:
            where.append("m.provider IS NOT NULL")
        if sport != "All":
            where.append("m.sport=?")
            args.append(sport)
        if window_start:
            where.append("datetime(m.starts_at)>=datetime(?)")
            args.append(window_start)
        if window_end:
            where.append("datetime(m.starts_at)<datetime(?)")
            args.append(window_end)
        if where:
            sql += " WHERE " + " AND ".join(where)
        # Ana ekran yalnızca birkaç hero kart gösteriyor. Küçük bir yedek havuz,
        # 60 kartın sosyal özet sorgularını boşuna çalıştırmadan yeterli çeşit sağlar.
        #
        # Sıralama ŞİMDİYE YAKINLIK olmalı, artan tarih değil: düz `ORDER BY
        # starts_at` katalogun EN ESKİ maçlarını veriyordu, yani "Tonight on
        # RankIt" başlığının altında bir yıl önceki eleme maçları duruyordu.
        # /catalog zaten bu sabiti kullanıyor; ana ekranın kullanmaması gözden
        # kaçmış.
        # Ana ekranin sirasi -- sahibin karari (2026-09-12), UC kademe:
        #   1. takip ettigin KULUPLERIN o RankIt gunundeki maclari,
        #   2. takip ettigin LIGLERIN maclari,
        #   3. geri kalan her sey.
        # Her kademenin icinde simdiye yakinlik. Filtre DEGIL, sira: sessiz
        # bir gecede yalnizca takiplerle sinirli bir ana ekran BOS kalirdi.
        #
        # "O RankIt gunu" yukaridaki pencere (day_from/day_to) -- gelecek
        # haftaki bir kulup maci bu gecenin maclarinin ustune cikmasin.
        # Bu RankIt gunu (11:00 -> 11:00 yerel). Telefon pencereyi kendisi
        # gonderiyor; gondermeyen istemci (web) icin sunucu tz_offset ile
        # hesapliyor. Eskiden UTC sabitti: Turkiye'de gun 3 saat kayiyordu.
        if window_start and window_end:
            day_from, day_to = window_start, window_end
        else:
            day_from, day_to = _rankit_day_window(tz_offset)
        # 2a "TONIGHT · 4 MATCHES": gecenin GERCEK mac sayisi, gosterilen kart
        # sayisi degil (kartlar 12 ile sinirli).
        count_where = ["datetime(m.starts_at)>=datetime(?)", "datetime(m.starts_at)<datetime(?)"]
        count_args = [day_from, day_to]
        if has_synced:
            count_where.append("m.provider IS NOT NULL")
        if sport != "All":
            count_where.append("m.sport=?")
            count_args.append(sport)
        day_matches = conn.execute("SELECT COUNT(*) FROM rankit_matches m WHERE "
                                   + " AND ".join(count_where), count_args).fetchone()[0]
        follows_any = bool(uid and conn.execute(
            """SELECT 1 FROM rankit_follows WHERE user_id=?
               AND target_type IN ('competition','team') LIMIT 1""", (uid,)).fetchone())
        if follows_any:
            on_day = "datetime(m.starts_at)>=datetime(?) AND datetime(m.starts_at)<datetime(?)"
            # MATCH_SELECT'te turnuva satiri `c`; aile kurali `mc` bekliyor.
            league = rankit_rank.FOLLOWED_COMPETITION_SQL.replace("mc.", "c.")
            sql += f""" ORDER BY CASE
                  WHEN {on_day} AND EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=?
                       AND f.target_type='team' AND f.target_id IN (m.home_team_id, m.away_team_id)) THEN 0
                  WHEN {on_day} AND {league} THEN 1
                  ELSE 2 END,
                ABS(julianday(m.starts_at)-julianday('now')), m.starts_at LIMIT 12"""
            args += [day_from, day_to, uid, day_from, day_to, uid]
        else:
            sql += NEAREST_MATCH_ORDER + " LIMIT 12"
        rows = conn.execute(sql, args).fetchall()
        cards = [_match_dict(conn, r, uid) for r in rows]
        # Kart ayagindaki yayinci: izleyenin ulkesi verilirse, baslamamis ve
        # canli maclarda ulke bazli kesin kayit ya da kural (_broadcasts_for:
        # "confirmed" / "typical"). Bilinmiyorsa kanal listesi bos -- uydurulmaz.
        # Desteklenmeyen ulke ana ekrani dusurmez, yalnizca alan gelmez. Eski
        # `broadcaster` sutunu yalnizca demo verisinde dolu, senkronlu macta null.
        wanted = (country or "").upper()
        if wanted in BROADCAST_COUNTRIES:
            for card in cards:
                if card["status"] in ("upcoming", "live"):
                    card["broadcast"] = _broadcasts_for(conn, card["id"], wanted)
        # Akis bir OZET: spoiler isaretli metin burada tasinmaz (bkz. _mask_spoiler_text).
        activity_rows = conn.execute("""SELECT e.id,e.review,e.spoiler,e.rating,e.created_at,u.username,u.id user_id,m.id match_id,
            EXISTS(SELECT 1 FROM rankit_diary_entries v WHERE v.user_id=? AND v.match_id=e.match_id
                   AND v.rating IS NOT NULL) viewer_rated,
            h.short_name home_short,h.name home_name,a.short_name away_short,a.name away_name
            FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id
            JOIN rankit_matches m ON m.id=e.match_id JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id
            WHERE e.visibility='public' AND e.review<>'' AND u.is_banned=0
            ORDER BY e.id DESC LIMIT 8""", (uid or -1,)).fetchall()
        return {"matches": cards, "activity": [_mask_spoiler_text(dict(r), uid) for r in activity_rows],
                "day": {"start": day_from, "end": day_to, "matches": day_matches}}


@router.get("/sync-health")
def rankit_sync_health():
    """Katalog senkronizasyonunun dışarıdan görünen tek sağlık göstergesi.

    Sağlayıcı başına EN SON çalışma ve EN SON BAŞARILI çalışma ayrı ayrı
    dönüyor: ikisinin arası açılmışsa job koşuyor ama başarısız oluyor demektir
    — sessizce bozulan bir job ile hiç kurulmamış bir job'ı ayıran tek şey bu.
    """
    with get_conn() as conn:
        providers = ["nba", "euroleague", "football"]
        out = {}
        for name in providers:
            last = conn.execute("""SELECT ok,matches,players,links,pruned,stale,error,duration_ms,created_at,
                CAST((julianday('now')-julianday(created_at))*24 AS REAL) age_hours
                FROM rankit_sync_runs WHERE provider=? ORDER BY id DESC LIMIT 1""", (name,)).fetchone()
            ok_row = conn.execute("""SELECT created_at,matches,
                CAST((julianday('now')-julianday(created_at))*24 AS REAL) age_hours
                FROM rankit_sync_runs WHERE provider=? AND ok=1 ORDER BY id DESC LIMIT 1""", (name,)).fetchone()
            out[name] = {
                "last_run": dict(last) if last else None,
                "last_success": dict(ok_row) if ok_row else None,
                "never_run": last is None,
            }
        totals = conn.execute("""SELECT COUNT(*) matches,
            SUM(status='finished') finished, SUM(status='upcoming') upcoming, SUM(status='live') live
            FROM rankit_matches""").fetchone()
        return {"providers": out, "catalog": dict(totals)}


@router.get("/catalog")
def rankit_catalog(
    sport: str = "All",
    competition: str = "All",
    season: str = "All",
    status: str = "All",
    limit: int = Query(60, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_optional_user),
    # 6c "MINIMUM HEAT -- only matches the community rated Good or better.
    # Show 62 matches": filtre TUM katalogda sunucuda uygulanir (total dogru
    # sayi verir), yuklu sayfada degil. Kart ile ayni kural: son puani sayilan
    # kullanici basina bir puan, en az 20 puan (§5.5), gosterilen deger 1 hane.
    min_heat: Optional[float] = Query(None, ge=0, le=5),
    # 8a "Hottest / Soonest / Most reviewed". Varsayilan onceki sira (simdiye
    # en yakin) -- mevcut cagiranlar etkilenmez.
    sort: Literal["nearest", "hottest", "soonest", "reviewed"] = "nearest",
    # 8a: web rayi filtreleri kalici gosterir, her secenegin yaninda sayi.
    facets: bool = False,
):
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        filters: dict[str, tuple[str, list]] = {}
        if min_heat is not None:
            latest = """(SELECT MAX(id) FROM rankit_diary_entries
                         WHERE match_id=m.id AND rating IS NOT NULL GROUP BY user_id)"""
            filters["heat"] = (f"""(SELECT COUNT(*) FROM rankit_diary_entries WHERE id IN {latest}) >= ?
                AND (SELECT ROUND(AVG(rating),1) FROM rankit_diary_entries WHERE id IN {latest}) >= ?""",
                [rankit_rank.MIN_COMMUNITY_RATINGS, min_heat])
        if sport != "All":
            filters["sport"] = ("m.sport=?", [sport])
        if competition != "All":
            filters["competition"] = ("c.name=?", [competition])
        if season != "All":
            filters["season"] = ("m.season=?", [season])
        if status != "All":
            filters["status"] = ("m.status=?", [status])

        def where_without(skip=None):
            parts, values = ["m.provider IS NOT NULL"], []
            for name, (sql, vals) in filters.items():
                if name != skip:
                    parts.append(sql)
                    values += vals
            return " WHERE " + " AND ".join(parts), values

        base, args = where_without()
        total = conn.execute("""SELECT COUNT(*) n FROM rankit_matches m
            JOIN rankit_competitions c ON c.id=m.competition_id""" + base, args).fetchone()["n"]
        # Isi karttakiyle ayni: kullanici basina son puan, en az 20 puan (§5.5);
        # esik altindaki mac "Hottest"ta en sona duser, sifir sayilmaz.
        heat = MATCH_HEAT_SQL
        order = {
            "nearest": NEAREST_MATCH_ORDER,
            "hottest": f" ORDER BY {heat} IS NULL, {heat} DESC, m.starts_at DESC, m.id",
            "soonest": """ ORDER BY CASE m.status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
                          CASE WHEN m.status IN ('live','upcoming') THEN julianday(m.starts_at) END ASC,
                          julianday(m.starts_at) DESC, m.id""",
            "reviewed": """ ORDER BY (SELECT COUNT(*) FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id
                          WHERE e.match_id=m.id AND e.visibility='public' AND e.review<>'' AND u.is_banned=0) DESC,
                          m.starts_at DESC, m.id""",
        }[sort]
        rows = conn.execute(MATCH_SELECT + base + order + " LIMIT ? OFFSET ?", (*args, limit, offset)).fetchall()
        out = {"matches": [_match_dict(conn, row, uid) for row in rows], "total": total,
               "limit": limit, "offset": offset, "sort": sort}
        if facets:
            # Disarlayici facet: bir boyutun sayilari O boyutun filtresi
            # disindaki tum filtrelerle ("Football 148 · Basketball 62" sport
            # secili olsa da iki secenegi de sayar).
            out["facets"] = {}
            for dim, col in (("sport", "m.sport"), ("status", "m.status"),
                             ("competition", "c.name"), ("season", "m.season")):
                where, values = where_without(dim)
                out["facets"][dim] = [{"value": r["value"], "count": r["n"]} for r in conn.execute(
                    f"""SELECT {col} value, COUNT(*) n FROM rankit_matches m
                        JOIN rankit_competitions c ON c.id=m.competition_id{where}
                        GROUP BY {col} ORDER BY n DESC, value""", values)]
        return out


# ── Yayıncı katmanı (TASLAK) ─────────────────────────────────────────────────
# "Bu maçı bende hangi kanaldan izlerim?" İlk kapsam GB / US / TR.
#
# OKUMA HERKESE AÇIK, YAZMA ADMIN'E: veri primaryarch.net admin panelinden
# giriliyor (frontend/src/pages/admin/RankItBroadcasts.jsx), RankIt de aynı
# uçtan çekiyor. Sağlayıcıdan gelen bir veri DEĞİL, elle yönetilen bir tablo.
#
# ÇÖZÜMLEME SIRASI: maç başına kesin kayıt → turnuva+ülke kuralı → BOŞ.
# Üçüncü basamak kasıtlı: elimizde kayıt yoksa tahmin üretmiyoruz. Yanlış kanal
# göstermek, hiç göstermemekten kötü — kullanıcı maçı kaçırır ve bir daha
# güvenmez. Kural katmanı 'typical', maç kaydı 'confirmed' diye işaretli
# dönüyor; arayüz ikisini aynı dille sunmamalı.

BROADCAST_COUNTRIES = ("GB", "US", "TR")


class CollectionIn(BaseModel):
    """Sahibin seckisi. declared_total: tarihi henuz aciklanmamis fiksturler
    dahil TOPLAM ("Three fixtures are unscheduled"); verilmezse mac sayisi."""
    id: Optional[int] = Field(default=None, gt=0)
    title: str = Field(min_length=1, max_length=80)
    subtitle: str = Field(default="", max_length=160)
    sport: Optional[Literal["Football", "Basketball"]] = None
    season: Optional[str] = Field(default=None, max_length=16)
    declared_total: Optional[int] = Field(default=None, ge=0, le=500)
    opens_note: Optional[str] = Field(default=None, max_length=160)
    reward: Optional[str] = Field(default=None, max_length=40)
    active: bool = True
    match_ids: list[int] = Field(default_factory=list, max_length=500)


@router.get("/collections")
def rankit_collections(user=Depends(get_optional_user)):
    """2m — The Hunt dizini: seckiler, takip ettigin kulublerin lig sezonlari,
    bu yilin Classic'leri. Toplanan = puanladigin uye maclar."""
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        items = rankit_hunt.hunt_for(conn, uid)
        return {"summary": rankit_hunt.index_summary(items), "collections": items}


@router.get("/collections/{collection_id}")
def rankit_collection_detail(collection_id: int, user=Depends(get_optional_user)):
    """2n — tek koleksiyon, bosluklar hakkinda durust: toplananlar sezon
    sirasiyla, puanlanmamis oynanmislar, siradakiler ve planlanmamis sayisi
    (fikstur uydurulmaz)."""
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        col = rankit_hunt.get(conn, collection_id)
        if not col or (col["kind"] == "curated" and not col["active"]):
            raise HTTPException(404, "Collection not found")
        detail = rankit_hunt.summarize(conn, col, uid, with_members=True)

        def cards(ids):
            out = []
            for mid in ids:
                row = conn.execute(MATCH_SELECT + " WHERE m.id=?", (mid,)).fetchone()
                if row:
                    out.append(_match_dict(conn, row, uid))
            return out
        detail["collected_matches"] = cards(detail.pop("collected_ids"))
        detail["open_matches"] = cards(detail.pop("open_ids"))
        detail["upcoming_matches"] = cards(detail.pop("upcoming_ids"))
        # Lig skini (sahibin karari 2026-09-23): bu kulup sezonunu bitirmek o
        # ligin skinini acar. Zaten aciksa "unlocks" denmez.
        sid = (SKIN_FOR_LEAGUE.get((detail.get("competition") or {}).get("name"))
               if detail["kind"] == "club_season" else None)
        detail["skin_reward"] = {"id": sid, "name": SKIN_NAMES[sid], "unlocked": bool(uid) and (
            detail["status"] == "complete" or conn.execute(
                "SELECT 1 FROM rankit_user_settings WHERE user_id=? AND key=? AND value='1'",
                (uid, f"skin:{sid}")).fetchone() is not None)} if sid else None
        return detail


@router.get("/admin/collections")
def rankit_admin_collections(user=Depends(require_admin)):
    with get_conn() as conn:
        rows = conn.execute("""SELECT c.*, (SELECT COUNT(*) FROM rankit_collection_items i
            WHERE i.collection_id=c.id) items FROM rankit_collections c
            WHERE c.kind='curated' ORDER BY c.active DESC, c.id""").fetchall()
        return {"collections": [dict(r) for r in rows]}


@router.post("/admin/collections")
def rankit_admin_set_collection(body: CollectionIn, user=Depends(require_admin)):
    """Seckiyi kur ya da guncelle. Mac listesi TAM kume (gonderilmeyen cikar)."""
    match_ids = list(dict.fromkeys(body.match_ids))
    if body.declared_total is not None and body.declared_total < len(match_ids):
        raise HTTPException(422, "declared_total cannot be smaller than the number of matches")
    with get_conn() as conn:
        if match_ids:
            marks = ",".join("?" * len(match_ids))
            found = {r[0] for r in conn.execute(f"SELECT id FROM rankit_matches WHERE id IN ({marks})", match_ids)}
            missing = [m for m in match_ids if m not in found]
            if missing:
                raise HTTPException(404, f"Match not found: {missing[0]}")
        values = (body.title.strip(), body.subtitle.strip(), body.sport, body.season, body.declared_total,
                  body.opens_note, body.reward, int(body.active), int(user["sub"]))
        if body.id is not None:
            if not conn.execute("SELECT 1 FROM rankit_collections WHERE id=? AND kind='curated'", (body.id,)).fetchone():
                raise HTTPException(404, "Collection not found")
            conn.execute("""UPDATE rankit_collections SET title=?,subtitle=?,sport=?,season=?,declared_total=?,
                opens_note=?,reward=?,active=?,updated_by=? WHERE id=?""", (*values, body.id))
            cid = body.id
        else:
            cid = conn.execute("""INSERT INTO rankit_collections
                (kind,title,subtitle,sport,season,declared_total,opens_note,reward,active,updated_by)
                VALUES('curated',?,?,?,?,?,?,?,?,?)""", values).lastrowid
        conn.execute("DELETE FROM rankit_collection_items WHERE collection_id=?", (cid,))
        conn.executemany("INSERT INTO rankit_collection_items(collection_id,match_id) VALUES(?,?)",
                         [(cid, m) for m in match_ids])
        return {"ok": True, "id": cid}


@router.delete("/admin/collections/{collection_id}")
def rankit_admin_delete_collection(collection_id: int, user=Depends(require_admin)):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM rankit_collections WHERE id=? AND kind='curated'", (collection_id,))
        if not cur.rowcount:
            raise HTTPException(404, "Collection not found")
        return {"ok": True}


class BroadcastIn(BaseModel):
    match_id: Optional[int] = None          # maç başına kesin kayıt
    competition_id: Optional[int] = None    # ya da turnuva+ülke kuralı
    country: str
    broadcaster_id: int
    note: str = ""


@router.get("/broadcasters")
def rankit_broadcasters(country: Optional[str] = None):
    """Kanal listesi. Yönetim ekranı bunu seçim kutusunda kullanıyor."""
    with get_conn() as conn:
        sql = "SELECT id,country,name,kind,url FROM rankit_broadcasters"
        args: list = []
        if country:
            sql += " WHERE country=?"
            args.append(country.upper())
        sql += " ORDER BY country,name"
        return {"broadcasters": [dict(r) for r in conn.execute(sql, args).fetchall()],
                "countries": list(BROADCAST_COUNTRIES)}


def _broadcasts_for(conn, match_id: int, country: str) -> dict:
    country = (country or "").upper()
    exact = conn.execute("""SELECT b.name,b.kind,b.url,x.source,x.verified_at
        FROM rankit_broadcasts x JOIN rankit_broadcasters b ON b.id=x.broadcaster_id
        WHERE x.match_id=? AND x.country=? ORDER BY b.name""", (match_id, country)).fetchall()
    if exact:
        return {"country": country, "confidence": "confirmed",
                "channels": [dict(r) for r in exact]}

    rule = conn.execute("""SELECT b.name,b.kind,b.url,r.note
        FROM rankit_broadcast_rules r JOIN rankit_broadcasters b ON b.id=r.broadcaster_id
        JOIN rankit_matches m ON m.competition_id=r.competition_id
        WHERE m.id=? AND r.country=? ORDER BY b.name""", (match_id, country)).fetchall()
    if rule:
        return {"country": country, "confidence": "typical",
                "channels": [dict(r) for r in rule]}

    # Bilmiyoruz. Uydurmuyoruz.
    return {"country": country, "confidence": None, "channels": []}


@router.get("/matches/{match_id}/broadcasts")
def rankit_match_broadcasts(match_id: int, country: str = "TR"):
    if country.upper() not in BROADCAST_COUNTRIES:
        raise HTTPException(400, "Unsupported country: " + country)
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM rankit_matches WHERE id=?", (match_id,)).fetchone():
            raise HTTPException(404, "Match not found")
        return _broadcasts_for(conn, match_id, country)


@router.get("/admin/broadcasts")
def rankit_list_broadcasts(country: Optional[str] = None, user=Depends(require_admin)):
    """Panelin tablosu: girilmiş her kural ve her kesin kayıt.

    Turnuva listesi de aynı yanıtta — panel bunu seçim kutusunda kullanıyor ve
    ayrı bir istek atmasına gerek kalmıyor."""
    with get_conn() as conn:
        where, args = "", []
        if country:
            where, args = " WHERE r.country=?", [country.upper()]
        rules = [dict(r) for r in conn.execute(f"""SELECT r.id,r.country,r.note,r.updated_at,
            c.id competition_id,c.name competition,c.season,c.sport,
            b.id broadcaster_id,b.name broadcaster,b.kind
            FROM rankit_broadcast_rules r
            JOIN rankit_competitions c ON c.id=r.competition_id
            JOIN rankit_broadcasters b ON b.id=r.broadcaster_id{where}
            ORDER BY r.country,c.sport,c.name,b.name""", args).fetchall()]

        where = " WHERE x.country=?" if country else ""
        exact = [dict(r) for r in conn.execute(f"""SELECT x.id,x.country,x.match_id,x.verified_at,
            x.source,b.id broadcaster_id,b.name broadcaster,b.kind,
            m.starts_at,c.name competition,c.season,
            h.short_name home,a.short_name away
            FROM rankit_broadcasts x
            JOIN rankit_broadcasters b ON b.id=x.broadcaster_id
            JOIN rankit_matches m ON m.id=x.match_id
            JOIN rankit_competitions c ON c.id=m.competition_id
            JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id{where}
            ORDER BY x.country,m.starts_at""", args).fetchall()]

        comps = [dict(r) for r in conn.execute("""SELECT c.id,c.name,c.season,c.sport,
            COUNT(m.id) match_count FROM rankit_competitions c
            LEFT JOIN rankit_matches m ON m.competition_id=c.id AND m.provider IS NOT NULL
            GROUP BY c.id HAVING match_count > 0
            ORDER BY c.sport,c.name,c.season DESC""").fetchall()]
    return {"rules": rules, "matches": exact, "competitions": comps,
            "countries": list(BROADCAST_COUNTRIES)}


@router.post("/admin/broadcasts")
def rankit_set_broadcast(body: BroadcastIn, user=Depends(require_admin)):
    """Eşleme gir. match_id verilirse kesin kayıt, competition_id verilirse kural."""
    country = body.country.upper()
    if country not in BROADCAST_COUNTRIES:
        raise HTTPException(400, "Unsupported country: " + body.country)
    if bool(body.match_id) == bool(body.competition_id):
        raise HTTPException(400, "Give either match_id or competition_id, not both")
    uid = int(user["sub"])
    with get_conn() as conn:
        b = conn.execute("SELECT country FROM rankit_broadcasters WHERE id=?",
                         (body.broadcaster_id,)).fetchone()
        if not b:
            raise HTTPException(404, "Broadcaster not found")
        # Kanal başka ülkeye aitse eşleme anlamsız: "TR maçına Sky Sports (GB)".
        if b["country"] != country:
            raise HTTPException(400, f"That broadcaster belongs to {b['country']}, not {country}")
        if body.match_id:
            if not conn.execute("SELECT 1 FROM rankit_matches WHERE id=?", (body.match_id,)).fetchone():
                raise HTTPException(404, "Match not found")
            conn.execute("""INSERT INTO rankit_broadcasts
                (match_id,country,broadcaster_id,source,verified_at,updated_by)
                VALUES(?,?,?,'editorial',datetime('now'),?)
                ON CONFLICT(match_id,country,broadcaster_id) DO UPDATE SET
                verified_at=datetime('now'),updated_by=excluded.updated_by,
                updated_at=datetime('now')""",
                (body.match_id, country, body.broadcaster_id, uid))
            # 3f: "Chelsea vs Sporting CP now has a UK broadcaster listed."
            # Yalnizca o maci izleme listesine almis olanlara.
            name = conn.execute("SELECT name FROM rankit_broadcasters WHERE id=?",
                                (body.broadcaster_id,)).fetchone()
            for w in conn.execute("SELECT user_id FROM rankit_watchlist WHERE match_id=?",
                                  (body.match_id,)).fetchall():
                rankit_notify.notify(conn, int(w["user_id"]), "broadcast",
                                     match_id=body.match_id,
                                     detail=f"{country} · {name['name']}" if name else country)
            return {"ok": True, "kind": "confirmed"}
        if not conn.execute("SELECT 1 FROM rankit_competitions WHERE id=?", (body.competition_id,)).fetchone():
            raise HTTPException(404, "Competition not found")
        conn.execute("""INSERT INTO rankit_broadcast_rules
            (competition_id,country,broadcaster_id,note,updated_by)
            VALUES(?,?,?,?,?)
            ON CONFLICT(competition_id,country,broadcaster_id) DO UPDATE SET
            note=excluded.note,updated_by=excluded.updated_by,updated_at=datetime('now')""",
            (body.competition_id, country, body.broadcaster_id, body.note.strip()[:120], uid))
        return {"ok": True, "kind": "typical"}


@router.delete("/admin/broadcasts")
def rankit_clear_broadcast(match_id: Optional[int] = None, competition_id: Optional[int] = None,
                           country: str = "TR", broadcaster_id: Optional[int] = None,
                           user=Depends(require_admin)):
    country = country.upper()
    with get_conn() as conn:
        if match_id:
            sql = "DELETE FROM rankit_broadcasts WHERE match_id=? AND country=?"
            args: list = [match_id, country]
        elif competition_id:
            sql = "DELETE FROM rankit_broadcast_rules WHERE competition_id=? AND country=?"
            args = [competition_id, country]
        else:
            raise HTTPException(400, "Give match_id or competition_id")
        if broadcaster_id:
            sql += " AND broadcaster_id=?"
            args.append(broadcaster_id)
        n = conn.execute(sql, args).rowcount
    return {"ok": True, "removed": n}


@router.get("/meta")
def rankit_meta():
    with get_conn() as conn:
        competitions = [dict(r) for r in conn.execute("""SELECT c.name,c.sport,c.country,c.season,COUNT(m.id) match_count
            FROM rankit_competitions c JOIN rankit_matches m ON m.competition_id=c.id
            WHERE m.provider IS NOT NULL GROUP BY c.id ORDER BY c.sport,c.name""").fetchall()]
        seasons = [r["season"] for r in conn.execute("""SELECT m.season FROM rankit_matches m
            WHERE m.provider IS NOT NULL GROUP BY m.season ORDER BY m.season DESC""").fetchall()]
        sync_row = conn.execute("SELECT * FROM rankit_sync_state WHERE job_name='rankit_live_scores'").fetchone()
        return {"competitions": competitions, "seasons": seasons,
                "matches": sum(c["match_count"] for c in competitions),
                "live_sync": dict(sync_row) if sync_row else None}


def _competition_heats(conn, competition_id: int) -> dict[int, tuple[float, int]]:
    """Turnuvanin bitmis maclarinin topluluk isisi: mac -> (ortalama, puan
    sayisi). Kart kurali: kullanici basina SON puanli kayit."""
    return {r["match_id"]: (float(r["avg"]), int(r["n"])) for r in conn.execute(
        """SELECT e.match_id, AVG(e.rating) avg, COUNT(*) n FROM rankit_diary_entries e
           WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
                          WHERE rating IS NOT NULL AND match_id IN (
                              SELECT id FROM rankit_matches WHERE competition_id=? AND status='finished')
                          GROUP BY user_id, match_id)
           GROUP BY e.match_id""", (competition_id,))}


def _club_league_season(conn, team_id: int):
    """Kulubun en guncel LIG sezonu (kupa / UEFA degil); yoksa None."""
    for r in conn.execute("""SELECT c.* FROM rankit_competitions c
            WHERE EXISTS(SELECT 1 FROM rankit_matches m WHERE m.competition_id=c.id
                         AND ? IN (m.home_team_id, m.away_team_id))
            ORDER BY c.season DESC, c.id DESC""", (team_id,)):
        if rankit_hunt.is_league(r["name"]):
            return r
    return None


def _club_season_heat(conn, team_id: int) -> dict:
    """11c / 12a "AVG HEAT THIS SEASON": kulubun guncel lig sezonundaki bitmis
    maclarindan yalniz en az 20 puanli olanlarin isisi (§5.5)."""
    comp = _club_league_season(conn, team_id)
    if not comp:
        return {"season_competition": None, "season_avg_heat": None, "season_heat_matches": 0}
    heats = _competition_heats(conn, comp["id"])
    ids = [r[0] for r in conn.execute("""SELECT id FROM rankit_matches WHERE competition_id=? AND status='finished'
        AND ? IN (home_team_id, away_team_id)""", (comp["id"], team_id))]
    values = [heats[i][0] for i in ids if i in heats and heats[i][1] >= rankit_rank.MIN_COMMUNITY_RATINGS]
    return {"season_competition": {"id": comp["id"], "name": comp["name"], "season": comp["season"]},
            "season_avg_heat": round(sum(values) / len(values), 1) if values else None,
            "season_heat_matches": len(values)}


def _standings(conn, competition) -> list[dict]:
    """Puan durumu (2i / 8c) -- turnuva sayfasi ve sezon isi haritasi (7g,
    kulup satirlari tablo sirasiyla) ayni hesabi kullanir."""
    competition_id = competition["id"]
    # Avrupa kupalarında yalnızca lig aşaması tabloya girer; eleme ve
    # knockout maçları puan durumunu yapay biçimde değiştirmez.
    table_sql = """SELECT m.id match_id,m.home_team_id,m.away_team_id,m.home_score,m.away_score,
        h.name home_name,h.short_name home_short,h.color home_color,COALESCE(hl.logo_url,h.crest_url) home_crest,
        a.name away_name,a.short_name away_short,a.color away_color,COALESCE(al.logo_url,a.crest_url) away_crest
        FROM rankit_matches m JOIN rankit_teams h ON h.id=m.home_team_id
        JOIN rankit_teams a ON a.id=m.away_team_id
        LEFT JOIN rankit_team_logos hl ON hl.team_id=h.id LEFT JOIN rankit_team_logos al ON al.team_id=a.id
        WHERE m.competition_id=? AND m.status='finished' AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL"""
    table_args: list = [competition_id]
    competition_name = str(competition["name"])
    knockout_only = competition_name in {"FA Cup", "Copa del Rey", "Coppa Italia", "DFB-Pokal", "Coupe de France"}
    if competition_name.startswith("UEFA "):
        table_sql += " AND m.stage LIKE 'League phase%'"
    elif competition_name == "EuroLeague":
        table_sql += " AND m.stage LIKE 'Round %'"
    played = [] if knockout_only else conn.execute(table_sql, table_args).fetchall()
    table = {}
    for game in played:
        for side in ("home", "away"):
            tid = game[f"{side}_team_id"]
            table.setdefault(tid, {"team_id": tid, "name": game[f"{side}_name"],
                "short_name": game[f"{side}_short"], "color": game[f"{side}_color"],
                "crest_url": game[f"{side}_crest"], "played": 0, "won": 0, "drawn": 0,
                "lost": 0, "gf": 0, "ga": 0, "points": 0})
        home, away = table[game["home_team_id"]], table[game["away_team_id"]]
        hs, aws = int(game["home_score"]), int(game["away_score"])
        home["played"] += 1; away["played"] += 1
        home["gf"] += hs; home["ga"] += aws; away["gf"] += aws; away["ga"] += hs
        win_points = 1 if competition["sport"] == "Basketball" else 3
        if hs > aws:
            home["won"] += 1; home["points"] += win_points; away["lost"] += 1
        elif aws > hs:
            away["won"] += 1; away["points"] += win_points; home["lost"] += 1
        else:
            home["drawn"] += 1; away["drawn"] += 1; home["points"] += 1; away["points"] += 1
    # 8c AVG HEAT: "the community's average across that club's matches".
    # §5.5 tablo ortalamasina da uygulanir: yalniz en az 20 puanli maclarin
    # isisi girer; hic yoksa null (TOO FEW RATINGS), sayac heat_matches.
    heats = _competition_heats(conn, competition_id)
    per_team: dict[int, list[float]] = {}
    for game in played:
        avg_n = heats.get(game["match_id"])
        if avg_n and avg_n[1] >= rankit_rank.MIN_COMMUNITY_RATINGS:
            for side in ("home", "away"):
                per_team.setdefault(game[f"{side}_team_id"], []).append(avg_n[0])
    for tid, row in table.items():
        values = per_team.get(tid, [])
        row["avg_heat"] = round(sum(values) / len(values), 1) if values else None
        row["heat_matches"] = len(values)
    standings = sorted(({**row, "gd": row["gf"] - row["ga"]} for row in table.values()),
                       key=lambda row: (-row["points"], -row["gd"], -row["gf"], row["name"]))

    return standings


@router.get("/competitions/{competition_id}")
def rankit_competition_detail(competition_id: int, user=Depends(get_optional_user)):
    """Karttan açılan hafif turnuva yüzeyi: fikstür, tablo ve popüler oyuncular."""
    with get_conn() as conn:
        competition = conn.execute("SELECT * FROM rankit_competitions WHERE id=?", (competition_id,)).fetchone()
        if not competition:
            raise HTTPException(404, "Competition not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        fixture_rows = conn.execute(MATCH_SELECT + """ WHERE m.competition_id=?
            AND (m.status='live' OR (m.status='upcoming' AND datetime(m.starts_at)>=datetime('now')))
            ORDER BY CASE m.status WHEN 'live' THEN 0 ELSE 1 END,m.starts_at LIMIT 60""",
            (competition_id,)).fetchall()

        standings = _standings(conn, competition)

        popular = [dict(row) for row in conn.execute("""SELECT p.id,p.name,p.image_url,t.name team_name,t.short_name team_short,
            COUNT(DISTINCT mp.match_id) appearances,
            COUNT(DISTINCT pv.user_id || '-' || pv.match_id) potm_votes,
            COUNT(DISTINCT rv.user_id || '-' || rv.match_id) respect_votes
            FROM rankit_match_players mp JOIN rankit_matches m ON m.id=mp.match_id
            JOIN rankit_players p ON p.id=mp.player_id LEFT JOIN rankit_teams t ON t.id=p.team_id
            LEFT JOIN rankit_potm_votes pv ON pv.match_id=m.id AND pv.player_id=p.id
            LEFT JOIN rankit_respect_votes rv ON rv.match_id=m.id AND rv.player_id=p.id
            WHERE m.competition_id=? GROUP BY p.id
            ORDER BY (COUNT(DISTINCT pv.user_id || '-' || pv.match_id)*3 +
                      COUNT(DISTINCT rv.user_id || '-' || rv.match_id)) DESC,
                     appearances DESC,p.name LIMIT 30""", (competition_id,)).fetchall()]
        # Hafta ozeti: 380 macin tamamini gondermek yerine hangi haftalar var,
        # her birinde kac mac ve durumu ne. Bir haftanin maclari ayri uctan
        # istenir (/competitions/{id}/matches?stage=...).
        week_rows = conn.execute(
            """SELECT m.stage, COUNT(*) n,
                      SUM(m.status='finished') finished,
                      MIN(m.starts_at) first_at, MAX(m.starts_at) last_at
               FROM rankit_matches m
               WHERE m.competition_id=? AND m.stage IS NOT NULL AND m.stage<>''
               GROUP BY m.stage""", (competition_id,)).fetchall()

        def week_order(row):
            # "Matchday 10" string olarak "Matchday 2"den once gelir; sayiyi
            # cikarip dogal siraya sokuyoruz, sayi yoksa tarihe duseriz.
            digits = "".join(c for c in (row["stage"] or "") if c.isdigit())
            return (0, int(digits)) if digits else (1, row["first_at"] or "")

        matchweeks = [{
            "stage": row["stage"], "matches": row["n"],
            "finished": row["finished"] or 0,
            "first_at": row["first_at"], "last_at": row["last_at"],
        } for row in sorted(week_rows, key=week_order)]

        return {"competition": dict(competition),
                "fixtures": [_match_dict(conn, row, uid) for row in fixture_rows],
                "standings": standings, "popular_players": popular,
                "matchweeks": matchweeks}


@router.get("/competitions/{competition_id}/heatmap")
def rankit_competition_heatmap(competition_id: int, user=Depends(get_optional_user)):
    """7g "The season, by heat": kulup satirlari x mac haftasi sutunlari.

    Hucre = kulubun o haftaki maci: `unplayed` (oynanmadi), `too_few` (20
    puan altinda -- kesikli hucre, uydurma renk yok, §5.5) ya da `heat`
    (topluluk isisi). `logged`: izleyen o maci defterine yazmis ("A gold
    diamond marks a night you logged"). Satirlar tablo sirasiyla. Mac haftasi
    asama adindaki sayidan ("Matchday 14"); sayisiz asama (play-in, final)
    haritaya girmez. Hafta numarasi olmayan turnuvada `available: false`.
    """
    with get_conn() as conn:
        competition = conn.execute("SELECT * FROM rankit_competitions WHERE id=?", (competition_id,)).fetchone()
        if not competition:
            raise HTTPException(404, "Competition not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        games = conn.execute("""SELECT m.id, m.stage, m.status, m.starts_at, m.home_team_id, m.away_team_id
            FROM rankit_matches m WHERE m.competition_id=? AND m.stage IS NOT NULL AND m.stage<>''
            ORDER BY m.starts_at, m.id""", (competition_id,)).fetchall()
        by_week: dict[int, list] = {}
        for g in games:
            number = re.search(r"\d+", g["stage"] or "")
            if number:
                by_week.setdefault(int(number.group(0)), []).append(g)
        if not by_week:
            return {"available": False, "competition": dict(competition), "weeks": [], "clubs": [], "summary": None}
        weeks = sorted(by_week)
        heats = _competition_heats(conn, competition_id)
        logged = {r[0] for r in conn.execute(
            """SELECT DISTINCT e.match_id FROM rankit_diary_entries e JOIN rankit_matches m ON m.id=e.match_id
               WHERE e.user_id=? AND m.competition_id=?""", (uid or -1, competition_id))}
        minimum = rankit_rank.MIN_COMMUNITY_RATINGS

        def cell(game):
            if game is None:
                return None
            avg_n = heats.get(game["id"])
            if game["status"] != "finished":
                state, value = "unplayed", None
            elif avg_n and avg_n[1] >= minimum:
                state, value = "heat", round(avg_n[0], 1)
            else:
                state, value = "too_few", None
            return {"match_id": game["id"], "state": state, "heat": value,
                    "ratings": avg_n[1] if avg_n else 0, "logged": game["id"] in logged}

        order = [row["team_id"] for row in _standings(conn, competition)]
        teams = {r["id"]: r for r in conn.execute(
            """SELECT t.id, t.name, t.short_name, t.color, COALESCE(l.logo_url, t.crest_url) crest_url
               FROM rankit_teams t LEFT JOIN rankit_team_logos l ON l.team_id=t.id
               WHERE t.id IN (SELECT home_team_id FROM rankit_matches WHERE competition_id=?
                              UNION SELECT away_team_id FROM rankit_matches WHERE competition_id=?)""",
            (competition_id, competition_id))}
        order += sorted((tid for tid in teams if tid not in order), key=lambda tid: teams[tid]["name"])
        clubs = []
        for tid in order:
            if tid not in teams:
                continue
            cells = []
            for week in weeks:
                game = next((g for g in by_week[week] if tid in (g["home_team_id"], g["away_team_id"])), None)
                cells.append({"week": week, **(cell(game) or {"match_id": None, "state": "none",
                                                              "heat": None, "ratings": 0, "logged": False})})
            clubs.append({"team": dict(teams[tid]), "cells": cells})

        week_heat = {}
        for week in weeks:
            values = [heats[g["id"]][0] for g in by_week[week]
                      if g["status"] == "finished" and g["id"] in heats and heats[g["id"]][1] >= minimum]
            if values:
                week_heat[week] = round(sum(values) / len(values), 1)
        best = max(week_heat.items(), key=lambda kv: (kv[1], -kv[0])) if week_heat else None
        return {"available": True, "competition": dict(competition), "weeks": weeks, "clubs": clubs,
                "min_ratings": minimum,
                "summary": {
                    # "9 weeks that ran hot league-wide": haftanin esigi gecen
                    # maclarinin ortalamasi "running hot" tabaninin (4.0) ustunde.
                    "hot_weeks": sum(v >= rankit_notify.HOT_FLOOR for v in week_heat.values()),
                    "best_week": {"week": best[0], "heat": best[1]} if best else None,
                    "logged": len({g["id"] for week in weeks for g in by_week[week] if g["id"] in logged}),
                    "week_heat": week_heat,
                }}


@router.get("/competitions/{competition_id}/matches")
def rankit_competition_matches(competition_id: int, stage: str = Query(default="", max_length=80),
                               user=Depends(get_optional_user)):
    """Bir turnuvanin TEK bir haftasindaki maclar.

    Turnuva detayi yalnizca hafta ozetini tasiyor; bir sezon 380 mac olabiliyor
    ve hepsini pesinen gondermek hem yavas hem gereksiz.
    """
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        if stage:
            rows = conn.execute(MATCH_SELECT + """ WHERE m.competition_id=? AND m.stage=?
                ORDER BY m.starts_at LIMIT 200""", (competition_id, stage)).fetchall()
        else:
            rows = conn.execute(MATCH_SELECT + """ WHERE m.competition_id=?
                ORDER BY m.starts_at LIMIT 200""", (competition_id,)).fetchall()
        return {"stage": stage, "matches": [_match_dict(conn, row, uid) for row in rows]}


def _potm_leaders(conn, competition_id: int) -> list[dict]:
    """3d POTM tablosu (§10.3): WON ve SHARE, yalnizca izleyenlerin oyundan.

    Yalniz POTM oyu en az 20 olan maclar sayilir (§5.5 -- mac kartindaki
    "potm" ile ayni esik ve ayni kazanan kurali: en cok oy, esitlikte ad).
      won    bu oyuncunun macin POTM'u oldugu mac sayisi
      share  o maclarin seçmenlerinden onu secenlerin ORTALAMA payi; oyuncunun
             sayilan maclari: kadroda oynadigi (ilk 11 / oyuna girdi) ya da oy
             aldigi esigi gecmis maclar -- oynayip oy almadigi mac 0 sayilir.
      matches share'in kac mactan geldigi (orneklem)
    Hic oy almamis oyuncu listelenmez.
    """
    minimum = rankit_rank.MIN_COMMUNITY_RATINGS
    voters = {r["match_id"]: r["n"] for r in conn.execute(
        """SELECT v.match_id, COUNT(*) n FROM rankit_potm_votes v
           JOIN rankit_matches m ON m.id=v.match_id
           WHERE m.competition_id=? GROUP BY v.match_id HAVING COUNT(*) >= ?""",
        (competition_id, minimum))}
    if not voters:
        return []
    marks = ",".join("?" * len(voters))
    votes: dict[tuple[int, int], int] = {}
    winners: dict[int, int] = {}
    for r in conn.execute(
            f"""SELECT v.match_id, v.player_id, COUNT(*) n FROM rankit_potm_votes v
                JOIN rankit_players p ON p.id=v.player_id
                WHERE v.match_id IN ({marks}) GROUP BY v.match_id, v.player_id
                ORDER BY v.match_id, n DESC, p.name""", tuple(voters)):
        votes[(r["match_id"], r["player_id"])] = r["n"]
        winners.setdefault(r["match_id"], r["player_id"])
    appearances = set(votes)
    for r in conn.execute(
            f"""SELECT match_id, player_id FROM rankit_match_lineup_players
                WHERE match_id IN ({marks}) AND player_id IS NOT NULL
                  AND (role='start' OR sub_in IS NOT NULL)""", tuple(voters)):
        appearances.add((r["match_id"], r["player_id"]))
    per_player: dict[int, dict] = {}
    for match_id, player_id in appearances:
        row = per_player.setdefault(player_id, {"won": 0, "shares": [], "votes": 0})
        got = votes.get((match_id, player_id), 0)
        row["shares"].append(got / voters[match_id])
        row["votes"] += got
        row["won"] += int(winners.get(match_id) == player_id)
    ids = [pid for pid, row in per_player.items() if row["votes"] > 0]
    if not ids:
        return []
    info = {r["id"]: r for r in conn.execute(
        f"""SELECT p.id, p.name, p.image_url, t.short_name team_short, t.name team_name,
                   t.color team_color, COALESCE(tl.logo_url, t.crest_url) crest_url
            FROM rankit_players p LEFT JOIN rankit_teams t ON t.id=p.team_id
            LEFT JOIN rankit_team_logos tl ON tl.team_id=t.id
            WHERE p.id IN ({",".join("?" * len(ids))})""", ids)}
    rows = []
    for pid in ids:
        row, meta = per_player[pid], info.get(pid)
        if meta is None:
            continue
        rows.append({"player_id": pid, "name": meta["name"], "image_url": meta["image_url"],
                     "team_short": meta["team_short"], "team_name": meta["team_name"],
                     "team_color": meta["team_color"], "crest_url": meta["crest_url"],
                     "won": row["won"], "votes": row["votes"], "matches": len(row["shares"]),
                     "share": round(sum(row["shares"]) / len(row["shares"]), 3)})
    rows.sort(key=lambda r: (-r["won"], -r["share"], -r["matches"], r["name"]))
    for i, row in enumerate(rows, 1):
        row["rank"] = i
    return rows


@router.get("/competitions/{competition_id}/players")
def rankit_competition_players(competition_id: int, stat: str = Query(default="potm", max_length=16)):
    """Ekran 3d - sezon cetveli.

    Bu liste TOPLULUK verisi degil, saglayicinin sezon siralamasi (bkz.
    rankit_live_sync.refresh_player_stats). Ayri durmasinin sebebi ekranin
    kendi notu: "Players are a reference list. RankIt rates matches, not
    performances." Yani buradaki sira bizim oylarimizla oynanmaz.

    `available` bos donebilir: basketbol turnuvalarinda cetvel yayimlayan bir
    kaynak yok. Arayuz sekmeyi bos gostermek yerine hic gostermiyor.

    §10.3: sekme POTM ile ACILIR, gollerle degil -- goller her uygulamada var,
    POTM yalnizca izleyenler oy verdigi icin var. "potm" topluluk verisi
    olan TEK cetvel; esigi gecmis mac yoksa listede yer almaz (bos sekme
    uydurulmaz), o zaman saglayicinin ilk cetveline dusulur.
    """
    with get_conn() as conn:
        competition = conn.execute("SELECT id,name,season,sport FROM rankit_competitions WHERE id=?",
                                   (competition_id,)).fetchone()
        if not competition:
            raise HTTPException(404, "Competition not found")
        leaders = _potm_leaders(conn, competition_id)
        available = (["potm"] if leaders else []) + [r["stat"] for r in conn.execute(
            """SELECT stat FROM rankit_player_stats WHERE competition_id=?
               GROUP BY stat ORDER BY CASE stat WHEN 'goals' THEN 0 WHEN 'assists' THEN 1
               ELSE 2 END""", (competition_id,)).fetchall()]
        if not available:
            return {"stat": stat, "available": [], "players": [], "updated_at": None}
        if stat not in available:
            stat = available[0]
        if stat == "potm":
            return {"stat": "potm", "available": available, "season": competition["season"],
                    "players": leaders, "updated_at": None,
                    "min_votes": rankit_rank.MIN_COMMUNITY_RATINGS}
        # Istenen cetvel yoksa elimizdeki ilkine dus - bos ekran gostermektense.
        if stat not in available:
            stat = available[0]
        rows = conn.execute(
            """SELECT s.rank,s.name,s.team_name,s.team_id,s.position,s.value,
                      s.matches,s.minutes,s.provider_player_id,s.updated_at,
                      t.short_name team_short,t.color team_color,
                      COALESCE(tl.logo_url,t.crest_url) crest_url,
                      (SELECT p.id FROM rankit_players p
                       WHERE p.sport=? AND p.name=s.name LIMIT 1) player_id
               FROM rankit_player_stats s
               LEFT JOIN rankit_teams t ON t.id=s.team_id
               LEFT JOIN rankit_team_logos tl ON tl.team_id=t.id
               WHERE s.competition_id=? AND s.stat=?
               ORDER BY s.rank, s.name""",
            (competition["sport"], competition_id, stat)).fetchall()
        return {"stat": stat, "available": available,
                "season": competition["season"],
                "players": [dict(r) for r in rows],
                "updated_at": rows[0]["updated_at"] if rows else None}


@router.get("/matches/{match_id}")
def rankit_match(match_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        row = conn.execute(MATCH_SELECT + " WHERE m.id=?", (match_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Match not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        result = _match_dict(conn, row, uid)
        result["players"] = [dict(r) for r in conn.execute("""SELECT p.id,p.name,p.shirt_no,p.image_url,t.short_name team,
            t.name team_name
            FROM rankit_match_players mp JOIN rankit_players p ON p.id=mp.player_id
            JOIN rankit_teams t ON t.id=mp.team_id WHERE mp.match_id=? ORDER BY t.short_name,p.name""", (match_id,)).fetchall()]
        # Doğrulanmış maç kadrosu: sezon kadrosundan (yukarıdaki "players")
        # AYRI bir alan. İkisi ayrı durmasa arayüz "bu gerçek 11 mi" sorusunu
        # dürüstçe cevaplayamıyordu — kullanıcının şikayeti tam olarak buydu.
        # Yoksa alan BOŞ kalır; sezon kadrosunu 11'miş gibi sunmuyoruz.
        lineup_rows = conn.execute(
            """SELECT l.team_id,l.side,l.formation,l.coach_name,l.confirmed_at,
                      t.name team_name,t.short_name team_short
               FROM rankit_match_lineups l JOIN rankit_teams t ON t.id=l.team_id
               WHERE l.match_id=? ORDER BY CASE l.side WHEN 'home' THEN 0 ELSE 1 END""",
            (match_id,)).fetchall()
        if lineup_rows:
            people = conn.execute(
                """SELECT team_id,name,shirt_no,role,ord,player_id,position,position_code,
                          sub_in,sub_out,replaced FROM rankit_match_lineup_players
                   WHERE match_id=? ORDER BY team_id,role,ord""", (match_id,)).fetchall()
            by_team: dict[int, dict] = {}
            for person in people:
                slot = by_team.setdefault(person["team_id"], {"start": [], "bench": []})
                # 15d "CAME ON · 63' Neto for Madueke", 15b STARTED / CAME ON.
                # player_id: POTM/respect oyu bu kimlikle verilir. played: ilk 11
                # ya da oyuna girdi (secici yalnizca bunlari listeler, §10.2).
                slot[person["role"]].append({
                    "name": person["name"], "shirt_no": person["shirt_no"],
                    "player_id": person["player_id"], "position": person["position"],
                    "position_code": person["position_code"],
                    "sub_in": person["sub_in"], "sub_out": person["sub_out"],
                    "replaced": person["replaced"],
                    "played": person["role"] == "start" or person["sub_in"] is not None,
                })
            result["lineups"] = [{
                "side": row["side"], "team_id": row["team_id"],
                "team": row["team_short"] or row["team_name"],
                "formation": row["formation"], "coach": row["coach_name"],
                "confirmed_at": row["confirmed_at"],
                "starters": by_team.get(row["team_id"], {}).get("start", []),
                "bench": by_team.get(row["team_id"], {}).get("bench", []),
            } for row in lineup_rows]
        else:
            result["lineups"] = []
        # 2f "result + events" (§9): YALNIZ bitmis macta. Canliyken anlar
        # Companion'in (§9.2: "An event feed on both makes them the same
        # screen"). Kaynak saglayici: gol / kart rankit_moments, oyuncu
        # degisikligi dogrulanmis kadrodan (sub_in + replaced). Olay
        # uydurulmaz; `events_checked` = bu mac icin saglayicidan olay ya da
        # kadro okundu mu (bos liste "golsuz" mu "bilinmiyor" mu ayrilsin).
        if row["status"] == "finished":
            order = {"goal": 0, "own_goal": 0, "card": 1, "substitution": 2}
            events = [{"minute": m["minute"], "kind": m["kind"], "label": m["label"],
                       "player": m["detail"], "side": m["side"]}
                      for m in conn.execute("""SELECT minute,kind,label,detail,side FROM rankit_moments
                                               WHERE match_id=?""", (match_id,))]
            subs = conn.execute("""SELECT l.name, l.replaced, l.sub_in, g.side FROM rankit_match_lineup_players l
                JOIN rankit_match_lineups g ON g.match_id=l.match_id AND g.team_id=l.team_id
                WHERE l.match_id=? AND l.sub_in IS NOT NULL""", (match_id,)).fetchall()
            for sub in subs:
                events.append({"minute": sub["sub_in"], "kind": "substitution",
                               "label": f"{sub['name']} for {sub['replaced']}" if sub["replaced"] else sub["name"],
                               "player": sub["name"], "side": sub["side"]})
            events.sort(key=lambda e: (e["minute"], order.get(e["kind"], 3)))
            result["events"] = events
            result["events_checked"] = bool(events or result["lineups"] or row["events_polled_at"])
        else:
            result["events"] = None
            result["events_checked"] = False
        result["reviews"] = [dict(r) for r in conn.execute("""SELECT e.id,e.rating,e.review,e.watched_date,e.classic,e.spoiler,u.username,
            (SELECT COUNT(*) FROM rankit_review_likes l WHERE l.entry_id=e.id) likes,
            EXISTS(SELECT 1 FROM rankit_review_likes l WHERE l.entry_id=e.id AND l.user_id=?) liked,
            (SELECT COUNT(*) FROM rankit_review_comments c JOIN users cu ON cu.id=c.user_id
             WHERE c.entry_id=e.id AND cu.is_banned=0) comments
            FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id
            WHERE e.match_id=? AND e.visibility='public' AND e.review<>'' AND u.is_banned=0
            ORDER BY likes DESC,e.id DESC""", (uid or -1, match_id)).fetchall()]
        return result


@router.get("/search")
def rankit_search(q: str = Query(default="", max_length=80), kind: str = "All",
                  status: str = Query("All", description="upcoming|live|finished"),
                  user=Depends(get_optional_user),
                  match_sort: Literal["relevance", "hottest"] = "relevance"):
    """Arama. status verilirse maç sonuçları ona göre kısılır.

    "Rank a match" yüzeyi bunu 'finished' ile çağırıyor: orada iş bir maçı
    PUANLAMAK ve oynanmamış bir maç o listede ölü bir satır. Varsayılan "All",
    yani mevcut çağıranlar (genel arama) etkilenmiyor.

    Ekran 3e her satırın altına KULLANICIYA ÖZEL bir cümle yazıyor —
    "in your diary", "12 rated", "7 of 12". Bu yüzden arama artık kimliği
    biliyor; maç sonuçları da _match_dict'e uid ile giriyor, yoksa
    "defterinde" satırı her zaman boş çıkardı.
    """
    # % ve _ joker DEGIL, normal karakter (kisi aramasindaki kural): "%"
    # yazan biri her seyi eslestiriyordu. Her LIKE ESCAPE '\\' ile.
    needle = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    term = f"%{needle}%"
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        matches = []
        if kind in ("All", "Matches"):
            where = "WHERE (h.name LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"
            args = [term, term, term]
            # Home ve Discover'daki kural: senkronlu katalog varken demo
            # kalintisi (provider NULL) aramada da cikmaz.
            if conn.execute("SELECT 1 FROM rankit_matches WHERE provider IS NOT NULL LIMIT 1").fetchone():
                where += " AND m.provider IS NOT NULL"
            if status != "All":
                where += " AND m.status=?"
                args.append(status)
            # Sira "en yeni" DEGIL. Bir sezon gelecek maya kadar uzuyor;
            # starts_at DESC listenin tepesine sekiz ay sonrasini koyuyor ve
            # 3e'nin ilk satiri ("14 Sep - in your diary") asla gorunmuyordu.
            # Once DEFTERINDEKILER, sonra SIMDIYE EN YAKIN.
            order = """ ORDER BY (SELECT 1 FROM rankit_diary_entries e
                                  WHERE e.match_id=m.id AND e.user_id=?) DESC,
                                 ABS(julianday(m.starts_at)-julianday('now'))
                        LIMIT 21"""
            # 11c "MATCHES · HOTTEST FIRST": web sonucu isiya gore (esik alti sonda).
            if match_sort == "hottest":
                order = f" ORDER BY {MATCH_HEAT_SQL} IS NULL, {MATCH_HEAT_SQL} DESC, m.starts_at DESC, m.id LIMIT 21"
            rows = conn.execute(MATCH_SELECT + " " + where + order,
                                args if match_sort == "hottest" else args + [uid]).fetchall()
            match_total = conn.execute("""SELECT COUNT(*) FROM rankit_matches m
                JOIN rankit_competitions c ON c.id=m.competition_id
                JOIN rankit_teams h ON h.id=m.home_team_id JOIN rankit_teams a ON a.id=m.away_team_id """ + where,
                args).fetchone()[0]
            matches = [_match_dict(conn, r, uid) for r in rows]
        players = [dict(r) for r in conn.execute("SELECT id,name,sport,team_id FROM rankit_players WHERE name LIKE ? ESCAPE '\\' LIMIT 21", (term,)).fetchall()] if kind in ("All", "Players") else []
        # 3e kulüp satırı: "Premier League · 12 rated". Turnuva o kulübün EN SON
        # maçından geliyor (bir kulüp kupada da oynar, afiş olan ligidir);
        # sayı DISTINCT maç, çünkü rewatch aynı maçı iki kez saydırmamalı.
        teams = [dict(r) for r in conn.execute("""SELECT t.id,t.name,t.short_name,t.sport,t.color,
            COALESCE(l.logo_url,t.crest_url) crest_url,
            (SELECT c.name FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
             WHERE m.home_team_id=t.id OR m.away_team_id=t.id
             ORDER BY m.starts_at DESC LIMIT 1) competition,
            (SELECT COUNT(DISTINCT e.match_id) FROM rankit_diary_entries e
             JOIN rankit_matches m2 ON m2.id=e.match_id
             WHERE e.user_id=? AND e.rating IS NOT NULL
               AND (m2.home_team_id=t.id OR m2.away_team_id=t.id)) rated
            FROM rankit_teams t
            LEFT JOIN rankit_team_logos l ON l.team_id=t.id
            WHERE t.name LIKE ? ESCAPE '\\' OR t.short_name LIKE ? ESCAPE '\\' LIMIT 21""", (uid, term, term)).fetchall()] if kind in ("All", "Teams") else []
        # Banli hesap aramada cikmaz (/people ile ayni kural).
        members = [dict(r) for r in conn.execute("SELECT id,username FROM users WHERE username LIKE ? ESCAPE '\\' AND username NOT LIKE 'rankit_demo' AND is_banned=0 LIMIT 21", (term,)).fetchall()] if kind in ("All", "Members") else []
        # 3e koleksiyon satırı: halka "7 of 12", altyazı da EŞLEŞME SEBEBİ
        # ("includes Arsenal"). Sebebi yazabilmek için listeler artık yalnızca
        # başlıkla değil, İÇERDİKLERİ kulüple de eşleşiyor — "arsenal" yazan
        # biri "Every London Derby"yi başlıktan asla bulamazdı.
        lists_where = """WHERE l.visibility='public'
              AND NOT EXISTS(SELECT 1 FROM users bu WHERE bu.id=l.user_id AND bu.is_banned=1)
              AND (l.title LIKE ? ESCAPE '\\' OR EXISTS(
              SELECT 1 FROM rankit_list_items i JOIN rankit_matches m ON m.id=i.match_id
              JOIN rankit_teams t ON t.id IN (m.home_team_id, m.away_team_id)
              WHERE i.list_id=l.id AND t.name LIKE ? ESCAPE '\\'))"""
        lists_total = conn.execute("SELECT COUNT(*) FROM rankit_lists l " + lists_where,
                                   (term, term)).fetchone()[0] if kind in ("All", "Lists") else 0
        # 11c liste satiri: "Every London Derby · 12 matches · by @selin".
        lists = [dict(r) for r in conn.execute("""SELECT l.id,l.title,l.description,l.ranked,
            (SELECT username FROM users WHERE id=l.user_id) username,
            (SELECT COUNT(*) FROM rankit_list_items i WHERE i.list_id=l.id) total,
            (SELECT COUNT(DISTINCT i.match_id) FROM rankit_list_items i
             JOIN rankit_diary_entries e ON e.match_id=i.match_id
             WHERE i.list_id=l.id AND e.user_id=? AND e.rating IS NOT NULL) rated,
            (SELECT t.name FROM rankit_list_items i JOIN rankit_matches m ON m.id=i.match_id
             JOIN rankit_teams t ON t.id IN (m.home_team_id, m.away_team_id)
             WHERE i.list_id=l.id AND t.name LIKE ? ESCAPE '\\' LIMIT 1) matched_team
            FROM rankit_lists l
            WHERE l.visibility='public'
              AND NOT EXISTS(SELECT 1 FROM users bu WHERE bu.id=l.user_id AND bu.is_banned=1)
              AND (l.title LIKE ? ESCAPE '\\' OR EXISTS(
              SELECT 1 FROM rankit_list_items i JOIN rankit_matches m ON m.id=i.match_id
              JOIN rankit_teams t ON t.id IN (m.home_team_id, m.away_team_id)
              WHERE i.list_id=l.id AND t.name LIKE ? ESCAPE '\\'))
            LIMIT 21""", (uid, term, term, term)).fetchall()] if kind in ("All", "Lists") else []
        # 3e COLLECTIONS bolumu URUNUN koleksiyonlari (§24: liste ve koleksiyon
        # ayri seyler); kullanici listeleri "lists" altinda kaliyor.
        collections = rankit_hunt.search(conn, uid, term, limit=SEARCH_LIMIT + 1) if kind in ("All", "Collections") and needle else []
        # HANDOFF §4.10: "That's all" yalnizca sayfalama dogrularsa. Her bolum
        # SEARCH_LIMIT'te kesiliyor; bir fazlasi okunup kesildigi soyleniyor.
        sections = {"matches": matches, "players": players, "teams": teams, "members": members,
                    "lists": lists, "collections": collections}
        truncated = {name: len(rows) > SEARCH_LIMIT for name, rows in sections.items()}
        out = {name: rows[:SEARCH_LIMIT] for name, rows in sections.items()}
        # 11c kulup satiri: "Arsenal · Premier League · 4.3 avg heat · FOLLOWING".
        # Isi kulubun en guncel lig sezonundan, yalniz 20 puanli maclarla (§5.5).
        for team in out["teams"]:
            team.update(_club_season_heat(conn, team["id"]))
            team["following"] = bool(uid and conn.execute(
                "SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='team' AND target_id=?",
                (uid, team["id"])).fetchone())
        # 11c kisi satiri: iliski durumu ve (sorgu bir kulube uyduysa) "31
        # Arsenal matches logged" -- yalniz izleyenin gorebildigi kayitlardan.
        club = out["teams"][0] if out["teams"] else None
        for member in out["members"]:
            mid_ = member["id"]
            member["following"] = bool(uid and conn.execute(
                "SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (uid, mid_)).fetchone())
            member["follows_you"] = bool(uid and conn.execute(
                "SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (mid_, uid)).fetchone())
            if club:
                seen = _visible_entries_sql()
                member["club_logged"] = conn.execute(f"""SELECT COUNT(DISTINCT e.match_id) FROM rankit_diary_entries e
                    JOIN rankit_matches m ON m.id=e.match_id
                    WHERE {seen} AND ? IN (m.home_team_id, m.away_team_id)""",
                    (mid_, uid or -1, uid or -1, mid_, club["id"])).fetchone()[0]
                member["club"] = club["name"]
        # 11c sekme sayilari ("Matches 284 · Clubs 2 · People 24 · Lists 8"):
        # ilk 20 degil GERCEK toplam.
        counts = {}
        if kind in ("All", "Matches"):
            counts["matches"] = match_total
        if kind in ("All", "Teams"):
            counts["teams"] = conn.execute("""SELECT COUNT(*) FROM rankit_teams t
                WHERE t.name LIKE ? ESCAPE '\\' OR t.short_name LIKE ? ESCAPE '\\'""", (term, term)).fetchone()[0]
        if kind in ("All", "Players"):
            counts["players"] = conn.execute("SELECT COUNT(*) FROM rankit_players WHERE name LIKE ? ESCAPE '\\'",
                                             (term,)).fetchone()[0]
        if kind in ("All", "Members"):
            counts["members"] = conn.execute("""SELECT COUNT(*) FROM users WHERE username LIKE ? ESCAPE '\\'
                AND username NOT LIKE 'rankit_demo' AND is_banned=0""", (term,)).fetchone()[0]
        if kind in ("All", "Lists"):
            counts["lists"] = lists_total
        if kind in ("All", "Collections"):
            counts["collections"] = len(collections) if not truncated["collections"] else None
        out["counts"] = counts
        out["truncated"] = truncated
        return out


SEARCH_LIMIT = 20


@router.get("/notifications")
def rankit_notifications(tz: int = Query(default=0, ge=-840, le=840),
                         user=Depends(get_optional_user)):
    """Ekran 3f. Durumlar once (hep TONIGHT), sonra olaylar kendi zamanlarinda."""
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        if not uid:
            return {"items": [], "unread": 0, "states": 0}
        return rankit_notify.feed(conn, uid, tz)


@router.post("/notifications/read")
def rankit_notifications_read(user=Depends(get_optional_user)):
    """"Mark read" yalnizca OLAYLARI kapatir; durumlar kosul gecince kaybolur."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        return {"ok": True, "marked": rankit_notify.mark_read(conn, uid)}


def _followed_sources(conn, uid) -> int:
    """3g "Competitions & clubs - N followed": turnuva AILESI + kulup."""
    if not uid:
        return 0
    teams = conn.execute("""SELECT COUNT(*) n FROM rankit_follows
        WHERE user_id=? AND target_type='team'""", (uid,)).fetchone()["n"]
    return int(teams or 0) + rankit_rank.followed_competition_count(conn, uid)


def _family(conn, competition_id: int):
    row = conn.execute("SELECT sport,name FROM rankit_competitions WHERE id=?",
                       (competition_id,)).fetchone()
    return (row["sport"], row["name"]) if row else None


def _followed_families(conn, uid) -> set:
    return {(r["sport"], r["name"]) for r in conn.execute(
        """SELECT c.sport,c.name FROM rankit_follows f JOIN rankit_competitions c
           ON c.id=f.target_id WHERE f.user_id=? AND f.target_type='competition'""",
        (uid or -1,))}


# ── Ilk kurulum (ekranlar 4g / 4h) ──────────────────────────────────────────
ONBOARD_CLUBS = 7   # 4h: yedi kulup + bir "Search" karosu


class OnboardIn(BaseModel):
    competitions: list[int] = Field(default_factory=list, max_length=40)
    clubs: list[int] = Field(default_factory=list, max_length=80)
    skipped: bool = False


def _current_competitions(conn):
    """Her turnuva BIR KEZ, en guncel sezonuyla. rankit_competitions sezon
    basina satir tutuyor; secici "Premier League"i iki kez gostermemeli.

    Sira TOPLULUK ETKINLIGI (o turnuvanin tum sezonlarindaki kayit sayisi),
    esitlikte ad. Mac sayisi populerlik degil -- NBA 1200 mac oynuyor diye
    listenin basina gecmemeli."""
    return conn.execute("""
        WITH latest AS (
            SELECT c.name, c.sport, MAX(c.season) season FROM rankit_competitions c
            WHERE EXISTS(SELECT 1 FROM rankit_matches m WHERE m.competition_id=c.id
                         AND m.provider IS NOT NULL)
            GROUP BY c.name, c.sport)
        SELECT c.id, c.name, c.sport, c.season,
               (SELECT COUNT(*) FROM rankit_diary_entries e JOIN rankit_matches m ON m.id=e.match_id
                JOIN rankit_competitions c2 ON c2.id=m.competition_id
                WHERE c2.name=c.name AND c2.sport=c.sport) activity
        FROM rankit_competitions c JOIN latest l
          ON l.name=c.name AND l.sport=c.sport AND l.season=c.season
        ORDER BY activity DESC, c.name""").fetchall()


@router.get("/onboarding")
def rankit_onboarding(competitions: str = Query(default="", max_length=400),
                      user=Depends(get_optional_user)):
    """4h icin veri. Kulupler SECILEN turnuvalardan gelir: once turnuva
    secilir, kulup listesi ona gore daralir. Hic secim yoksa hepsinden."""
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        picked = [int(x) for x in competitions.split(",") if x.strip().isdigit()]
        comps = _current_competitions(conn)
        followed = {(r["target_type"], r["target_id"]) for r in conn.execute(
            "SELECT target_type,target_id FROM rankit_follows WHERE user_id=?", (uid or -1,))}
        scope = picked or [r["id"] for r in comps]
        marks = ",".join("?" * len(scope)) or "NULL"
        clubs = conn.execute(f"""
            SELECT t.id, t.name, t.short_name, t.color,
                   COALESCE(l.logo_url, t.crest_url) crest_url,
                   (SELECT COUNT(*) FROM rankit_diary_entries e JOIN rankit_matches m2 ON m2.id=e.match_id
                    WHERE t.id IN (m2.home_team_id, m2.away_team_id)) activity
            FROM rankit_teams t LEFT JOIN rankit_team_logos l ON l.team_id=t.id
            WHERE t.id IN (SELECT home_team_id FROM rankit_matches WHERE competition_id IN ({marks})
                           UNION SELECT away_team_id FROM rankit_matches WHERE competition_id IN ({marks}))
            ORDER BY activity DESC, t.name
            LIMIT ?""", (*scope, *scope, ONBOARD_CLUBS)).fetchall()
        done = bool(uid and conn.execute("""SELECT 1 FROM rankit_user_settings
            WHERE user_id=? AND key='onboarded' AND value='1'""", (uid,)).fetchone())
        # Duzenleyici (Settings > Competitions & clubs) icin: takip edilen HER
        # kulup. Oneri listesi yedi kulup; disinda kalan bir takip ekranda
        # gorunmezse birakilamaz da.
        followed_clubs = [dict(r) for r in conn.execute("""
            SELECT t.id, t.name, t.short_name, t.color, COALESCE(l.logo_url, t.crest_url) crest_url
            FROM rankit_follows f JOIN rankit_teams t ON t.id=f.target_id
            LEFT JOIN rankit_team_logos l ON l.team_id=t.id
            WHERE f.user_id=? AND f.target_type='team' ORDER BY t.name""", (uid or -1,)).fetchall()]
        # Takip edilen turnuva eski bir sezon satiri olabilir; secicide gorunmesi
        # icin kimligi de donuyor.
        # Turnuva takibi AILE: eski bir sezon satirini takip edenin secicide
        # gorunen (en yeni) satiri da takipli sayilir.
        families = _followed_families(conn, uid)
        followed_comp_ids = sorted(r["id"] for r in comps if (r["sport"], r["name"]) in families)
        # 14a "Primary Arch connected · selin@primaryarch.com": yalniz kendi
        # hesabin, yalniz giris yapmisken. Ayri bir RankIt kimligi yok.
        account = None
        if user:
            row = conn.execute("SELECT username,email FROM users WHERE id=?", (uid,)).fetchone()
            account = dict(row) if row else None
        return {
            "done": done,
            "account": account,
            "primary_arch_connections": None,
            "competitions": [{**dict(r), "followed": (r["sport"], r["name"]) in families}
                             for r in comps],
            "clubs": [{**dict(r), "followed": ("team", r["id"]) in followed} for r in clubs],
            "followed_clubs": followed_clubs,
            "followed_competition_ids": followed_comp_ids,
        }


@router.put("/follows/sources")
def rankit_set_sources(body: OnboardIn, user=Depends(get_optional_user)):
    """Settings > Competitions & clubs. Ilk kurulumdan FARKLI: bu bir
    DUZENLEYICI, gonderilen kume turnuva+kulup takiplerinin TAMAMI -- secimi
    kaldirilan birakilir. Kisi ve oyuncu takiplerine dokunmaz."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        valid_t = {r["id"] for r in conn.execute("SELECT id FROM rankit_teams")}
        # Kulupler: kimlik esitligi. Turnuvalar: AILE (sezondan bagimsiz) --
        # bir sezonun satirindan digerine gecmek takibi birakip yeniden
        # yazmak olmamali.
        want_t = {t for t in body.clubs if t in valid_t}
        have_t = {r["target_id"] for r in conn.execute(
            "SELECT target_id FROM rankit_follows WHERE user_id=? AND target_type='team'", (uid,))}
        for tid in have_t - want_t:
            conn.execute("DELETE FROM rankit_follows WHERE user_id=? AND target_type='team' AND target_id=?",
                         (uid, tid))
        for tid in want_t - have_t:
            conn.execute("INSERT INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'team',?)",
                         (uid, tid))
        want_c = {}
        for cid in body.competitions:
            fam = _family(conn, cid)
            if fam:
                want_c.setdefault(fam, cid)
        have_c = {}
        for r in conn.execute("""SELECT f.target_id, c.sport, c.name FROM rankit_follows f
                JOIN rankit_competitions c ON c.id=f.target_id
                WHERE f.user_id=? AND f.target_type='competition'""", (uid,)):
            have_c.setdefault((r["sport"], r["name"]), []).append(r["target_id"])
        for fam, ids in have_c.items():
            if fam not in want_c:
                for tid in ids:
                    conn.execute("""DELETE FROM rankit_follows WHERE user_id=?
                                    AND target_type='competition' AND target_id=?""", (uid, tid))
        for fam, cid in want_c.items():
            if fam not in have_c:
                conn.execute("""INSERT INTO rankit_follows(user_id,target_type,target_id)
                                VALUES(?,'competition',?)""", (uid, cid))
        return {"ok": True, "following_sources": _followed_sources(conn, uid)}


@router.post("/onboarding")
def rankit_onboarding_save(body: OnboardIn, user=Depends(get_optional_user)):
    """"Build my home" ya da "Skip". Ikisi de kurulumu KAPATIR; Skip bir daha
    sormaz. Takipler eklenir, var olanlar silinmez -- ilk kurulum baska bir
    cihazda yeniden gorunse bile kimsenin takibini dusurmemeli."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if not body.skipped:
            valid_c = {r["id"] for r in conn.execute("SELECT id FROM rankit_competitions")}
            valid_t = {r["id"] for r in conn.execute("SELECT id FROM rankit_teams")}
            have = _followed_families(conn, uid)
            for cid in dict.fromkeys(body.competitions):
                fam = _family(conn, cid) if cid in valid_c else None
                # Ayni turnuvanin baska bir sezonu zaten takipliyse ikinci satir yok.
                if fam and fam not in have:
                    conn.execute("""INSERT OR IGNORE INTO rankit_follows(user_id,target_type,target_id)
                                    VALUES(?,'competition',?)""", (uid, cid))
                    have.add(fam)
            for tid in dict.fromkeys(body.clubs):
                if tid in valid_t:
                    conn.execute("""INSERT OR IGNORE INTO rankit_follows(user_id,target_type,target_id)
                                    VALUES(?,'team',?)""", (uid, tid))
        conn.execute("""INSERT INTO rankit_user_settings(user_id,key,value) VALUES(?,'onboarded','1')
                        ON CONFLICT(user_id,key) DO UPDATE SET value='1'""", (uid,))
        return {"ok": True, "following_sources": _followed_sources(conn, uid)}


# Sunucunun DAVRANDIGI ayarlar ve varsayilanlari. Listede olmayan bir anahtar
# yazilamaz: 3g'nin disindaki bir sey buraya sizmasin.
SERVER_SETTINGS = {
    # 3f'in "RUNNING HOT" uyarisi. Kapaliysa uretilmiyor -- istemcide
    # gizlemek yetmez, cunku uyari sunucuda dogruyor.
    "alerts_running_hot": True,
}


def _read_settings(conn, uid: Optional[int]) -> dict:
    out = dict(SERVER_SETTINGS)
    if not uid:
        return out
    for row in conn.execute("SELECT key,value FROM rankit_user_settings WHERE user_id=?", (uid,)):
        if row["key"] in out:
            out[row["key"]] = row["value"] == "1"
    return out


@router.get("/settings")
def rankit_settings(user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        return _read_settings(conn, uid)


@router.put("/settings")
def rankit_set_settings(body: dict, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        # CODE.md §8 / BUILD §2.8: "false" metni true DEGILDIR. Eskiden
        # {"alerts_running_hot": "false"} uyariyi ACIK yaziyordu (truthy).
        # Once hepsi dogrulanir: yarim yazilmis bir ayar kumesi kalmasin.
        for key, value in body.items():
            if key in SERVER_SETTINGS and not isinstance(value, bool):
                raise HTTPException(422, f"{key} must be true or false")
        for key, value in body.items():
            if key not in SERVER_SETTINGS:
                continue
            conn.execute("""INSERT INTO rankit_user_settings(user_id,key,value) VALUES(?,?,?)
                ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value""",
                (uid, key, "1" if value else "0"))
        # AYNI baglantidan okunuyor. rankit_settings'i cagirmak yeni bir
        # baglanti aciyordu ve bu islem henuz islenmemis oldugu icin yanit
        # ESKI degeri tasiyordu -- arayuz her dokunusta bir tik geride kalirdi.
        return _read_settings(conn, uid)


@router.get("/players/{player_id}")
def rankit_player_detail(player_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        player = conn.execute("""SELECT p.id,p.name,p.sport,p.shirt_no,p.image_url,p.team_id,
            t.name team_name,t.short_name team_short,t.color team_color,
            COALESCE(l.logo_url,t.crest_url) team_crest
            FROM rankit_players p LEFT JOIN rankit_teams t ON t.id=p.team_id
            LEFT JOIN rankit_team_logos l ON l.team_id=t.id WHERE p.id=?""", (player_id,)).fetchone()
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
        team = conn.execute("""SELECT t.id,t.name,t.short_name,t.sport,t.color,t.country,
            COALESCE(l.logo_url,t.crest_url) crest_url FROM rankit_teams t
            LEFT JOIN rankit_team_logos l ON l.team_id=t.id WHERE t.id=?""", (team_id,)).fetchone()
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
        # 12a "a club is a lookup": sezon ozeti, izleyenin defteri, en sicak
        # maclar, siradaki mac ve icinde oldugu koleksiyonlar. Stadyum verisi
        # yok (uydurulmaz).
        season = _club_season_heat(conn, team_id)
        comp = _club_league_season(conn, team_id)
        if comp:
            played_ids = [r[0] for r in conn.execute("""SELECT id FROM rankit_matches WHERE competition_id=?
                AND status='finished' AND ? IN (home_team_id, away_team_id)""", (comp["id"], team_id))]
            classic_ids = {r[0] for r in conn.execute(rankit_hunt._classic_ids_sql(),
                                                      (rankit_rank.MIN_COMMUNITY_RATINGS, rankit_rank.CLASSIC_SHARE))}
            position = next((i + 1 for i, row in enumerate(_standings(conn, comp)) if row["team_id"] == team_id), None)
            season.update({"played": len(played_ids), "classics": len(classic_ids & set(played_ids)),
                           "position": position})
        logged = conn.execute("""SELECT COUNT(DISTINCT e.match_id) FROM rankit_diary_entries e
            JOIN rankit_matches m ON m.id=e.match_id
            WHERE e.user_id=? AND ? IN (m.home_team_id, m.away_team_id)""", (uid or -1, team_id)).fetchone()[0]
        hottest = conn.execute(MATCH_SELECT + f""" WHERE (m.home_team_id=? OR m.away_team_id=?) AND m.status='finished'
            AND {MATCH_HEAT_SQL} IS NOT NULL ORDER BY {MATCH_HEAT_SQL} DESC, m.starts_at DESC LIMIT 5""",
            (team_id, team_id)).fetchall()
        upcoming = conn.execute(MATCH_SELECT + """ WHERE (m.home_team_id=? OR m.away_team_id=?)
            AND m.status IN ('upcoming','live') ORDER BY m.starts_at LIMIT 1""", (team_id, team_id)).fetchone()
        next_match = None
        if upcoming:
            next_match = _match_dict(conn, upcoming, uid)
            next_match["collections"] = [rankit_hunt.summarize(conn, col, uid)["title"]
                                         for col in rankit_hunt.collections_for_match(conn, uid, upcoming["id"])] if uid else []
        return {"team": dict(team), "players": players, "following": followed, "favorited": favorited,
                "matches": [_match_dict(conn, row, uid) for row in rows],
                "season": season, "logged": logged, "venue": None,
                "hottest": [_match_dict(conn, row, uid) for row in hottest], "next": next_match}


# Zevk ortakligi icin taban. Iki ortak macta "%100 uyusuyorsunuz" demek
# bilgi degil gurultu; 3i'nin cumlesi ("41 of the 57") ancak orneklem varken
# bir sey soyler.
OVERLAP_MIN_SHARED = 10  # Guncel HTML t9: on ortak mac olmadan yuzde yok.
# "Uyusmak" = en fazla yarim yildiz fark. Puanlar 0.5 adimli; yarim yildiz
# bir adim, yani ayni maca komsu iki okuma.
OVERLAP_TOLERANCE = 0.5


def _visible_entries_sql(alias: str = "e") -> str:
    """Bir kullanicinin kayitlarindan IZLEYENIN gorebildikleri.

    Profil istatistigi, ortalama ve zevk ortakligi hep BU kume uzerinden:
    ozel kayitlarla hesaplanan bir ortalama ya da "57 macta 41 uyum" cumlesi,
    o kaydi gizleyen kisinin puanini dolayli olarak ele verir.
    Parametreler: (owner_id, viewer_id, viewer_id, owner_id).
    """
    return f"""{alias}.user_id=? AND ({alias}.visibility='public'
        OR {alias}.user_id=?
        OR ({alias}.visibility='followers' AND EXISTS(
            SELECT 1 FROM rankit_follows f WHERE f.user_id=? AND f.target_type='user'
            AND f.target_id=?)))"""


@router.get("/members/{member_id}")
def rankit_member_detail(member_id: int, user=Depends(get_optional_user)):
    """Ekran 3i — baskasinin profili."""
    with get_conn() as conn:
        # Banli hesap kisi listelerinden ve inceleme yuzeylerinden dustugu gibi
        # profil olarak da acilmaz.
        member = conn.execute("SELECT id,username,created_at FROM users WHERE id=? AND is_banned=0",
                              (member_id,)).fetchone()
        if not member:
            raise HTTPException(404, "Member not found")
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        seen = _visible_entries_sql()
        vis = (member_id, uid or -1, uid or -1, member_id)
        stats = conn.execute(f"""SELECT COUNT(*) diary_count,COUNT(DISTINCT match_id) matches,
            COUNT(DISTINCT CASE WHEN classic=1 AND rating IS NOT NULL THEN match_id END) classics,
            (SELECT AVG(v.rating) FROM rankit_diary_entries v WHERE v.id IN (
                SELECT MAX(e.id) FROM rankit_diary_entries e
                WHERE {seen} AND e.rating IS NOT NULL GROUP BY e.match_id)) avg_rating
            FROM rankit_diary_entries e WHERE {seen}""", (*vis, *vis)).fetchone()
        entries = [_mask_spoiler_text(dict(r), uid) for r in conn.execute(f"""SELECT e.id,e.user_id,e.match_id,e.rating,e.review,e.spoiler,
            EXISTS(SELECT 1 FROM rankit_diary_entries v WHERE v.user_id=? AND v.match_id=e.match_id
                   AND v.rating IS NOT NULL) viewer_rated,
            e.watched_date,e.classic,
            h.short_name home_short,a.short_name away_short,
            h.name home_name,a.name away_name FROM rankit_diary_entries e
            JOIN rankit_matches m ON m.id=e.match_id JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id WHERE {seen}
            ORDER BY e.watched_date DESC,e.id DESC LIMIT 31""", (uid or -1, *vis)).fetchall()]
        # 3i listesi 30'da kesiliyor; "That's all" yalnizca gercekten bittiyse.
        entries_has_more = len(entries) > 30
        entries = entries[:30]
        followed = bool(uid and conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (uid, member_id)).fetchone())
        follows_you = bool(uid and conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (member_id, uid)).fetchone())

        # §7.1 — profilde KADEME. Baskasinin profilinde ilerleme cubugu yok
        # (3i yalnizca "Rank 5 · Season Ticket" yaziyor); ilerleme kisinin
        # kendi profilinde.
        rank = rankit_rank.tier_for(rankit_rank.total_points(conn, member_id))

        # Zevk ortakligi. Iki tarafin da MAC BASINA SON puani (rewatch ayni
        # maci iki kez saydirmasin). Onun tarafi yalnizca gorebildiklerin.
        overlap = None
        if uid and uid != member_id:
            row = conn.execute(f"""
                WITH mine AS (
                    SELECT e.match_id, e.rating r FROM rankit_diary_entries e
                    WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
                                   WHERE user_id=? AND rating IS NOT NULL GROUP BY match_id)),
                theirs AS (
                    SELECT e.match_id, e.rating r FROM rankit_diary_entries e
                    WHERE e.id IN (SELECT MAX(e.id) FROM rankit_diary_entries e
                                   WHERE {seen} AND e.rating IS NOT NULL GROUP BY e.match_id))
                SELECT COUNT(*) shared,
                       COALESCE(SUM(ABS(t.r - m.r) <= ?), 0) agree,
                       AVG(t.r - m.r) bias
                FROM mine m JOIN theirs t ON t.match_id=m.match_id""",
                (uid, *vis, OVERLAP_TOLERANCE)).fetchone()
            shared = int(row["shared"] or 0)
            overlap = {
                "shared": shared,
                "agree": int(row["agree"] or 0),
                # Taban altinda YUZDE YOK: arayuz "henuz yeterli degil" diyor.
                "pct": round(row["agree"] / shared, 3) if shared >= OVERLAP_MIN_SHARED else None,
                # Pozitif = o senden SICAK puanliyor, negatif = soguk.
                "bias": round(float(row["bias"]), 2) if shared >= OVERLAP_MIN_SHARED else None,
                "min_shared": OVERLAP_MIN_SHARED,
            }

        # 3i RECENT SHELF: kompakt MatchCard'lar. Isi TOPLULUGUN, yildizlar
        # ONUN -- tasarimda Arsenal 4.6 isi ile bes yildiz yan yana.
        # Mac basina SON kayit: ayni maci iki kez loglamak (rewatch) rafta iki
        # ayni kart demek -- ve arayuzde ayni React anahtari.
        shelf_rows = conn.execute(f"""SELECT e.id entry_id, e.match_id, e.rating, e.classic, e.skin
            FROM rankit_diary_entries e
            WHERE e.id IN (SELECT MAX(e.id) FROM rankit_diary_entries e WHERE {seen}
                           GROUP BY e.match_id)
            ORDER BY e.watched_date DESC, e.id DESC LIMIT 6""", vis).fetchall()
        shelf = []
        for r in shelf_rows:
            m = conn.execute(MATCH_SELECT + " WHERE m.id=?", (r["match_id"],)).fetchone()
            if m:
                shelf.append({**_match_dict(conn, m, uid), "entry_id": r["entry_id"],
                              "their_rating": r["rating"], "their_classic": bool(r["classic"]),
                              "their_skin": r["skin"] or "default"})

        return {"member": dict(member), "stats": dict(stats), "following": followed, "follows_you": follows_you,
                "entries": entries, "entries_has_more": entries_has_more,
                "rank": rank, "overlap": overlap, "shelf": shelf,
                "is_self": bool(uid and uid == member_id)}


@router.get("/people")
def rankit_people(kind: str = "following", q: str = "", offset: int = 0,
                  limit: int = 30, user=Depends(get_optional_user)):
    """HTML 9a: kendi iliski listesi; gorunur zevk ortakligi ONCE siralanir.

    §13.1 "never alphabetically": on ortak mac altinda yuzde yok, ama sira
    yine alfabe degil ORTAK MAC SAYISI -- daha cok ortak gecmisi olan, yuzdesi
    acilmaya daha yakin olandir. Ad yalnizca son esitlik bozucu.

    Kisi basina profil/cetvel sorgusu yok. Tek CTE tum adaylari siralar,
    sonra sayfalar; ikinci sayfada daha yuksek uyum saklanmaz.
    """
    if not user:
        raise HTTPException(401, "Sign in to see your people")
    if kind not in ("following", "followers") or len(q) > 100 or offset < 0 or not 1 <= limit <= 50:
        raise HTTPException(422, "Invalid people filter")
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        owner = conn.execute("SELECT id,username FROM users WHERE id=?", (uid,)).fetchone()
        if not owner:
            raise HTTPException(401, "Sign in again")
        # Hesap aramasinda % ve _ joker DEGIL, normal karakterdir.
        params = {"uid": uid, "q": q.strip().lstrip("@").lower(), "kind": kind,
                  "minimum": OVERLAP_MIN_SHARED, "tolerance": OVERLAP_TOLERANCE,
                  "limit": limit + 1, "offset": offset}
        candidates = """WITH related AS (
            SELECT u.id,u.username,
                EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=:uid
                    AND f.target_type='user' AND f.target_id=u.id) following,
                EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=u.id
                    AND f.target_type='user' AND f.target_id=:uid) follows_you
            FROM users u WHERE u.id<>:uid AND u.is_banned=0),
        candidates AS (SELECT * FROM related WHERE
            ((:kind='following' AND following) OR (:kind='followers' AND follows_you))
            AND instr(lower(username),:q)>0)
        """
        total = conn.execute(candidates + "SELECT COUNT(*) FROM candidates", params).fetchone()[0]
        rows = conn.execute(candidates + """,
        visible AS (
            SELECT e.* FROM rankit_diary_entries e JOIN candidates c ON c.id=e.user_id
            WHERE e.visibility='public' OR (e.visibility='followers' AND c.following)),
        stats AS (SELECT user_id,COUNT(DISTINCT match_id) matches,
            COUNT(DISTINCT CASE WHEN classic=1 AND rating IS NOT NULL THEN match_id END) classics
            FROM visible GROUP BY user_id),
        mine AS (SELECT match_id,rating FROM rankit_diary_entries WHERE id IN (
            SELECT MAX(id) FROM rankit_diary_entries WHERE user_id=:uid AND rating IS NOT NULL GROUP BY match_id)),
        theirs AS (SELECT user_id,match_id,rating FROM visible WHERE id IN (
            SELECT MAX(id) FROM visible WHERE rating IS NOT NULL GROUP BY user_id,match_id)),
        overlap AS (SELECT t.user_id,COUNT(*) shared,SUM(ABS(t.rating-m.rating)<=:tolerance) agree,
            AVG(t.rating-m.rating) bias FROM theirs t JOIN mine m ON m.match_id=t.match_id GROUP BY t.user_id)
        SELECT c.*,COALESCE(s.matches,0) matches,COALESCE(s.classics,0) classics,
            COALESCE(o.shared,0) shared,COALESCE(o.agree,0) agree,
            CASE WHEN o.shared>=:minimum THEN ROUND(1.0*o.agree/o.shared,3) END pct,
            CASE WHEN o.shared>=:minimum THEN ROUND(o.bias,2) END bias
        FROM candidates c LEFT JOIN stats s ON s.user_id=c.id LEFT JOIN overlap o ON o.user_id=c.id
        ORDER BY pct DESC,COALESCE(o.shared,0) DESC,
            c.username COLLATE NOCASE,c.id LIMIT :limit OFFSET :offset""", params).fetchall()
        counts = conn.execute("""SELECT
            (SELECT COUNT(*) FROM rankit_follows f JOIN users u ON u.id=f.target_id
             WHERE f.user_id=? AND f.target_type='user' AND u.is_banned=0 AND u.id<>?) following,
            (SELECT COUNT(*) FROM rankit_follows f JOIN users u ON u.id=f.user_id
             WHERE f.target_id=? AND f.target_type='user' AND u.is_banned=0 AND u.id<>?) followers""",
            (uid, uid, uid, uid)).fetchone()
        people = [{"id": r["id"], "username": r["username"], "following": bool(r["following"]),
                   "follows_you": bool(r["follows_you"]), "matches": r["matches"], "classics": r["classics"],
                   "overlap": {k: r[k] for k in ("shared", "agree", "pct", "bias")} | {"min_shared": OVERLAP_MIN_SHARED}}
                  for r in rows[:limit]]
        return {"owner": dict(owner), "counts": dict(counts), "people": people, "total": total,
                "next_offset": offset + limit if len(rows) > limit else None}


@router.get("/people/discover")
def rankit_discover_people(q: str = "", offset: int = 0, limit: int = 20,
                           user=Depends(get_optional_user)):
    """HTML 9b — handle aramasi ve gercek ortak maclardan taste onerileri.

    Bos sorguda en az bir ortak maci olan hesaplar onerilir. Yazili sorguda
    handle eslesmesi yeterlidir; ortak gecmis yoksa arayuz oran uydurmaz.
    """
    if not user:
        raise HTTPException(401, "Sign in to find people")
    if len(q) > 100 or offset < 0 or not 1 <= limit <= 50:
        raise HTTPException(422, "Invalid people search")
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        needle = q.strip().lstrip("@").lower()
        params = {"uid": uid, "q": needle, "minimum": OVERLAP_MIN_SHARED,
                  "tolerance": OVERLAP_TOLERANCE, "limit": limit + 1, "offset": offset}
        cte = """WITH candidates AS (
            SELECT u.id,u.username,
                EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=:uid
                    AND f.target_type='user' AND f.target_id=u.id) following,
                EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=u.id
                    AND f.target_type='user' AND f.target_id=:uid) follows_you
            FROM users u WHERE u.id<>:uid AND u.is_banned=0
                AND u.username NOT LIKE 'rankit_demo%'
                AND (:q='' OR instr(lower(u.username),:q)>0)),
        visible AS (
            SELECT e.* FROM rankit_diary_entries e JOIN candidates c ON c.id=e.user_id
            WHERE e.visibility='public' OR (e.visibility='followers' AND c.following)),
        stats AS (SELECT user_id,COUNT(DISTINCT match_id) matches,
            COUNT(DISTINCT CASE WHEN classic=1 AND rating IS NOT NULL THEN match_id END) classics
            FROM visible GROUP BY user_id),
        mine AS (SELECT match_id,rating FROM rankit_diary_entries WHERE id IN (
            SELECT MAX(id) FROM rankit_diary_entries WHERE user_id=:uid AND rating IS NOT NULL GROUP BY match_id)),
        theirs AS (SELECT user_id,match_id,rating FROM visible WHERE id IN (
            SELECT MAX(id) FROM visible WHERE rating IS NOT NULL GROUP BY user_id,match_id)),
        overlap AS (SELECT t.user_id,COUNT(*) shared,SUM(ABS(t.rating-m.rating)<=:tolerance) agree,
            AVG(t.rating-m.rating) bias FROM theirs t JOIN mine m ON m.match_id=t.match_id GROUP BY t.user_id),
        eligible AS (SELECT c.*,COALESCE(s.matches,0) matches,COALESCE(s.classics,0) classics,
            COALESCE(o.shared,0) shared,COALESCE(o.agree,0) agree,
            CASE WHEN o.shared>=:minimum THEN ROUND(1.0*o.agree/o.shared,3) END pct,
            CASE WHEN o.shared>=:minimum THEN ROUND(o.bias,2) END bias
            FROM candidates c LEFT JOIN stats s ON s.user_id=c.id LEFT JOIN overlap o ON o.user_id=c.id
            WHERE :q<>'' OR COALESCE(o.shared,0)>0)
        """
        total = conn.execute(cte + "SELECT COUNT(*) FROM eligible", params).fetchone()[0]
        rows = conn.execute(cte + """SELECT * FROM eligible ORDER BY
            CASE WHEN :q<>'' AND lower(username)=:q THEN 0
                 WHEN :q<>'' AND instr(lower(username),:q)=1 THEN 1 ELSE 2 END,
            pct DESC,shared DESC,
            username COLLATE NOCASE,id LIMIT :limit OFFSET :offset""", params).fetchall()
        people = [{"id": r["id"], "username": r["username"], "following": bool(r["following"]),
                   "follows_you": bool(r["follows_you"]), "matches": r["matches"], "classics": r["classics"],
                   "overlap": {k: r[k] for k in ("shared", "agree", "pct", "bias")} | {"min_shared": OVERLAP_MIN_SHARED}}
                  for r in rows[:limit]]
        return {"people": people, "total": total,
                "next_offset": offset + limit if len(rows) > limit else None,
                # Tanisiklik kaynagi yok: ortak hesap DB'sinden sayi uydurulmaz.
                "primary_arch_connections": None}


class UserFollowIn(BaseModel):
    following: bool


@router.put("/people/{member_id}/follow")
def rankit_set_user_follow(member_id: int, body: UserFollowIn, user=Depends(get_optional_user)):
    """Tekrar gelen istek takibi TERSINE cevirmemeli; eski POST korunur."""
    if not user:
        raise HTTPException(401, "Sign in to follow people")
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if member_id == uid:
            raise HTTPException(422, "You cannot follow yourself")
        conn.execute("BEGIN IMMEDIATE")
        if not conn.execute("SELECT 1 FROM users WHERE id=? AND is_banned=0", (member_id,)).fetchone():
            raise HTTPException(404, "Member not found")
        if body.following:
            added = conn.execute("INSERT OR IGNORE INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'user',?)", (uid, member_id))
            if added.rowcount:
                rankit_notify.notify(conn, member_id, "follow", actor_id=uid)
        else:
            conn.execute("DELETE FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (uid, member_id))
        reverse = conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user' AND target_id=?", (member_id, uid)).fetchone()
        return {"following": body.following, "follows_you": bool(reverse)}


@router.get("/shelf")
def rankit_shelf(member_id: Optional[int] = Query(default=None, gt=0),
                 sort: Literal["newest", "rating", "classics", "competition"] = "newest",
                 limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0),
                 user=Depends(get_optional_user)):
    """7f "The shelf as a real wall": her kayit bir kart ("That's card 143").
    Siralar gorunur (Newest / Highest rated / Classics only / By competition),
    yuz kart birden, sayfali. Kendi rafin tamami; baskasininki yalniz
    gorebildiklerin (herkese acik / takip ediyorsan takipcilere acik).
    Ust satir "143 CARDS · 12 CLASSICS": `cards` ve `classic_cards` ayni
    gorunur kumeden."""
    with get_conn() as conn:
        if member_id is None:
            owner = _actor_id(user, conn)
            viewer = owner
        else:
            viewer = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
            owner = member_id
            if not conn.execute("SELECT 1 FROM users WHERE id=? AND is_banned=0", (owner,)).fetchone():
                raise HTTPException(404, "Member not found")
        seen = _visible_entries_sql()
        vis = (owner, viewer or -1, viewer or -1, owner)
        where = seen + (" AND e.classic=1 AND e.rating IS NOT NULL" if sort == "classics" else "")
        order = {
            "newest": "e.watched_date DESC, e.id DESC",
            "classics": "e.watched_date DESC, e.id DESC",
            "rating": "e.rating IS NULL, e.rating DESC, e.watched_date DESC, e.id DESC",
            "competition": "c.name, e.watched_date DESC, e.id DESC",
        }[sort]
        counts = conn.execute(f"""SELECT COUNT(*) cards,
            COALESCE(SUM(e.classic=1 AND e.rating IS NOT NULL),0) classic_cards
            FROM rankit_diary_entries e WHERE {seen}""", vis).fetchone()
        total = conn.execute(f"SELECT COUNT(*) FROM rankit_diary_entries e WHERE {where}", vis).fetchone()[0]
        rows = conn.execute(f"""SELECT e.id entry_id, e.match_id, e.rating, e.classic, e.skin, e.watched_date,
                e.is_rewatch, c.name competition
            FROM rankit_diary_entries e JOIN rankit_matches m ON m.id=e.match_id
            JOIN rankit_competitions c ON c.id=m.competition_id
            WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?""", (*vis, limit, offset)).fetchall()
        cards = []
        for r in rows:
            match = conn.execute(MATCH_SELECT + " WHERE m.id=?", (r["match_id"],)).fetchone()
            if match:
                cards.append({**_match_dict(conn, match, viewer), "entry": {
                    "id": r["entry_id"], "rating": r["rating"], "classic": bool(r["classic"]),
                    "skin": r["skin"] or "default", "watched_date": r["watched_date"],
                    "rewatch": bool(r["is_rewatch"])}})
        return {"owner_id": owner, "sort": sort, "cards": cards, "total": total,
                "counts": {"cards": counts["cards"], "classic_cards": counts["classic_cards"]},
                "offset": offset, "next_offset": offset + len(rows) if offset + len(rows) < total else None}


@router.get("/diary")
def rankit_diary(view: str = "watched", user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        # "Your reviews" (HANDOFF 6b -> 5c): hesabin KENDI incelemeleri, tum
        # maclar boyunca -- rastgele bir macin inceleme listesi degil. Gizli
        # ve takipcilere acik olanlar da dahil (sahibi kendisi).
        only_reviews = "AND e.review<>''" if view == "reviews" else ""
        # starts_at ve armalar da gerekiyor: web günlüğü kartı maç kartıyla aynı
        # bileşenle çiziyor, bunlar olmadan saat ve kulüp arması boş kalıyordu.
        rows = conn.execute("""SELECT e.*,m.sport,m.status,m.starts_at,m.home_score,m.away_score,c.name competition,
            h.name home_name,h.short_name home_short,h.color home_color,
            COALESCE((SELECT logo_url FROM rankit_team_logos WHERE team_id=h.id),h.crest_url) home_crest,
            a.name away_name,a.short_name away_short,a.color away_color,
            COALESCE((SELECT logo_url FROM rankit_team_logos WHERE team_id=a.id),a.crest_url) away_crest,
            (SELECT COUNT(*) FROM rankit_review_likes l WHERE l.entry_id=e.id) respect,
            (SELECT COUNT(*) FROM rankit_review_comments rc JOIN users ru ON ru.id=rc.user_id
             WHERE rc.entry_id=e.id AND ru.is_banned=0) replies
            FROM rankit_diary_entries e JOIN rankit_matches m ON m.id=e.match_id
            JOIN rankit_competitions c ON c.id=m.competition_id JOIN rankit_teams h ON h.id=m.home_team_id
            JOIN rankit_teams a ON a.id=m.away_team_id WHERE e.user_id=? """ + only_reviews + """
            ORDER BY e.watched_date DESC,e.id DESC""", (uid,)).fetchall()
        # 2d "Height is your stars, colour is community heat": her kaydin
        # macinin TOPLULUK isisi. Kart kurali: kullanici basina son puanli
        # kayit; §5.5 20 puanin altinda isi yok (sayac kalir).
        heats = {r["match_id"]: (r["avg"], int(r["n"])) for r in conn.execute(
            """SELECT e.match_id, AVG(e.rating) avg, COUNT(*) n FROM rankit_diary_entries e
               WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
                              WHERE rating IS NOT NULL AND match_id IN (
                                  SELECT match_id FROM rankit_diary_entries WHERE user_id=?)
                              GROUP BY user_id, match_id)
               GROUP BY e.match_id""", (uid,)).fetchall()}
        entries = []
        for r in rows:
            avg, n = heats.get(r["match_id"], (None, 0))
            entries.append({**dict(r), "rating_count": n,
                            "community_rating": round(float(avg), 1)
                            if avg is not None and n >= rankit_rank.MIN_COMMUNITY_RATINGS else None})
        return {"entries": entries}


@router.post("/diary")
def rankit_log(body: DiaryIn, user=Depends(get_optional_user)):
    if body.rating is not None and (body.rating < .5 or body.rating > 5 or round(body.rating * 2) != body.rating * 2):
        raise HTTPException(422, "Rating must use 0.5 steps")
    if body.tags is not None and len(body.tags) > 3:
        raise HTTPException(422, "Choose at most three tags")
    # "Gelecek" sunucunun yerel gunu degil: dogudaki bir kullanicinin bugunu
    # UTC'den bir gun ileride olabilir (UTC+14'e kadar). Eskiden date.today()
    # sunucunun saat dilimine bagliydi.
    utc_now = datetime.now(timezone.utc).replace(tzinfo=None)
    if body.watched_date is not None and body.watched_date > (utc_now + timedelta(hours=14)).date():
        raise HTTPException(422, "Watched date cannot be in the future")
    # Gonderilmezse izleme tarihi KULLANICININ bugunu (tz_offset), sunucunun degil.
    local_today = (utc_now + timedelta(minutes=body.tz_offset)).date()
    with get_conn() as conn:
        # Yazma kilidi basta: ayni client_entry_id ile es zamanli iki tekrar
        # ikisi birden "yok" gorup iki satir yazamasin.
        conn.execute("BEGIN IMMEDIATE")
        uid = _actor_id(user, conn)
        match = conn.execute("SELECT status,starts_at FROM rankit_matches WHERE id=?", (body.match_id,)).fetchone()
        if not match:
            raise HTTPException(404, "Match not found")
        if match["status"] != "finished":
            raise HTTPException(409, "Only finished matches can be added to the diary")
        rated_at = rankit_rank.accepted_rated_at(body.rated_at, match["starts_at"])
        streak_before = rankit_rank.streak_for(conn, uid, body.tz_offset)["current"]
        existing = None if body.is_rewatch else conn.execute("""SELECT id,rating FROM rankit_diary_entries
            WHERE user_id=? AND match_id=? AND is_rewatch=0 ORDER BY id DESC LIMIT 1""", (uid, body.match_id)).fetchone()
        if body.client_entry_id is not None:
            keyed = conn.execute("""SELECT id,rating,match_id FROM rankit_diary_entries
                WHERE user_id=? AND client_entry_id=?""", (uid, body.client_entry_id)).fetchone()
            if keyed is not None:
                if keyed["match_id"] != body.match_id:
                    raise HTTPException(409, "This entry id belongs to another match")
                existing = keyed
        if body.entry_id is not None:
            existing = conn.execute("SELECT id,rating FROM rankit_diary_entries WHERE id=? AND user_id=? AND match_id=?",
                                    (body.entry_id, uid, body.match_id)).fetchone()
            if existing is None:
                raise HTTPException(404, "Diary entry not found")
        # 6a koleksiyon karosunun "+1"i: bu kayit maci ILK KEZ mi puanliyor.
        was_rated = bool(conn.execute("""SELECT 1 FROM rankit_diary_entries
            WHERE user_id=? AND match_id=? AND rating IS NOT NULL LIMIT 1""", (uid, body.match_id)).fetchone())
        # Puan ALANI gonderildi mi? 15z composer "saves as you type": yalniz
        # inceleme metnini gonderen otomatik kayit puani SILMEMELI. Eskiden
        # gonderilmeyen rating None sayilip "puani kaldir" diye yaziliyordu --
        # her tus vurusu puani, odulu ve seriyi geri alirdi. Artik: alan yok =
        # dokunma, acik null = kaldir. Yeni kayitta alan yoksa puansiz kayit.
        rating_sent = "rating" in body.model_fields_set
        final_rating = body.rating if (rating_sent or not existing) else existing["rating"]
        # BUILD §9.3: etiketler, oyuncular ve inceleme ancak puan varken
        # acilir; Classic damgasi da bir hukum (§3). Puansiz bir kayda YENI
        # inceleme metni, yeni etiket ya da Classic yazilamaz. Puani kaldirmak
        # mevcut metni/etiketi silmez; istemcinin ayni metni geri gondermesi
        # reddedilmez (POTM/respect ile ayni karar, Faz 1).
        if final_rating is None:
            stored_review, stored_classic, stored_tags = "", 0, set()
            if existing:
                kept = conn.execute("SELECT review,classic FROM rankit_diary_entries WHERE id=?",
                                    (existing["id"],)).fetchone()
                stored_review, stored_classic = kept["review"] or "", kept["classic"]
                stored_tags = {r["tag"] for r in conn.execute(
                    "SELECT tag FROM rankit_entry_tags WHERE entry_id=?", (existing["id"],))}
            new_review = body.review.strip() if body.review is not None else ""
            new_tags = {t.strip()[:40] for t in (body.tags or []) if t.strip()}
            if ((new_review and new_review != stored_review)
                    or not new_tags <= stored_tags
                    or (body.classic and not stored_classic)):
                raise HTTPException(422, "Rate the match first")
        # 2j: kilitli skin kazanilmadan, Gilt Classic olmayan kartta secilemez.
        if body.skin is not None and SKIN_RULES[body.skin] is not None:
            rule = SKIN_RULES[body.skin]
            if _is_earned(rule) and body.skin not in _unlocked_skins(conn, uid, body.tz_offset):
                raise HTTPException(403, "This skin is locked")
            if rule == "classic":
                classic_now = body.classic if body.classic is not None else bool(existing and conn.execute(
                    "SELECT classic FROM rankit_diary_entries WHERE id=?", (existing["id"],)).fetchone()["classic"])
                if not classic_now:
                    raise HTTPException(422, "Gilt is for Classic cards only")
        # Puanin ani: cevrimdisi kabul edilmis an ya da simdi.
        moment = (rated_at or utc_now).strftime("%Y-%m-%d %H:%M:%S")
        if existing:
            entry_id = existing["id"]
            # Yalnızca gerçekten gönderilen sütunlar yazılır -- rating dahil:
            # alan yoksa dokunulmaz, açık null "puanı kaldır".
            sets, args = (["rating=?"], [body.rating]) if rating_sent else ([], [])
            if body.watched_date is not None:
                sets.append("watched_date=?"); args.append(body.watched_date.isoformat())
            if body.review is not None:
                sets.append("review=?"); args.append(body.review.strip())
            if body.visibility is not None:
                sets.append("visibility=?"); args.append(body.visibility)
            if body.classic is not None:
                sets.append("classic=?"); args.append(int(body.classic))
            if body.spoiler is not None:
                sets.append("spoiler=?"); args.append(int(body.spoiler))
            if body.skin is not None:
                sets.append("skin=?"); args.append(None if body.skin == "default" else body.skin)
            # rated_at yildizin ILK verildigi an: puan kaldirilinca silinir,
            # puan degisince (ör. 3.5 -> 4) kalir.
            if rating_sent and body.rating is None:
                sets.append("rated_at=NULL")
            elif rating_sent and existing["rating"] is None:
                sets.append("rated_at=?"); args.append(moment)
            if sets:
                conn.execute(f"UPDATE rankit_diary_entries SET {','.join(sets)} WHERE id=?", (*args, entry_id))
            # Etiketler ancak istemci bir etiket listesi gönderdiyse değişir.
            if body.tags is not None:
                conn.execute("DELETE FROM rankit_entry_tags WHERE entry_id=?", (entry_id,))
            updated = True
        else:
            # Yeni kayıtta eski varsayılanlar geçerli — burada "gönderilmedi"
            # gerçekten "boş" demek, silinecek bir şey yok.
            cur = conn.execute("""INSERT INTO rankit_diary_entries
                (user_id,match_id,watched_date,rating,review,is_rewatch,visibility,classic,spoiler,
                 rated_at,client_entry_id,skin)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""", (uid, body.match_id,
                                               (body.watched_date or local_today).isoformat(), body.rating,
                                               (body.review or "").strip(), int(body.is_rewatch),
                                               body.visibility or "public", int(bool(body.classic)), int(bool(body.spoiler)),
                                               moment if body.rating is not None else None, body.client_entry_id,
                                               None if body.skin in (None, "default") else body.skin))
            entry_id, updated = cur.lastrowid, False
            # Seri created_at'e bakiyor (§7.2): cevrimdisi yapilmis puanin ANI
            # yukleme ani degil, telefondaki an -- kabul edildiyse.
            if rated_at is not None:
                conn.execute("UPDATE rankit_diary_entries SET created_at=? WHERE id=?",
                             (rated_at.strftime("%Y-%m-%d %H:%M:%S"), entry_id))
        # Classic damgasi kalkarsa Gilt da kalkar: Gilt yalniz Classic kartta.
        conn.execute("UPDATE rankit_diary_entries SET skin=NULL WHERE id=? AND skin='gilt' AND classic=0",
                     (entry_id,))
        for tag in dict.fromkeys(t.strip() for t in (body.tags or []) if t.strip()):
            conn.execute("INSERT INTO rankit_entry_tags(entry_id,tag) VALUES(?,?)", (entry_id, tag[:40]))
        # §7.1 — puanlama odulu. Idempotensi rankit_points'teki UNIQUE'ten
        # geliyor, yani duzenleme yeniden odemez; burada tekrar cagirmak
        # zararsiz ve "ilk kayit miydi" sorusunu uygulama koduna tasimiyor.
        # BUILD §12.1: odul PUANLAMANIN. Yildizsiz izleme kaydi "gecesinde
        # puanladi" odemesi almaz (CODE.md Adim 2: izleme kaydi rating degil).
        revoked = 0
        if not rating_sent and existing:
            # Puana dokunulmadi: odul ne verilir ne geri alinir.
            award = {"kind": None, "points": 0, "same_day": False}
        elif body.rating is not None:
            award = rankit_rank.award_for_rating(conn, uid, body.match_id, body.tz_offset, at=rated_at)
        else:
            award = {"kind": None, "points": 0, "same_day": False}
            # Puan kaldirildiysa ve bu macta BASKA puanli kaydi da kalmadiysa
            # puanlama odulu geri alinir: odul puanin karsiligi (sahibin
            # karari, 2026-09-21). Yeniden izleme kaydinda puan duruyorsa odul
            # kalir; companion gibi ayni maca yazilan baska kazanclar kalir.
            # Tekrar puanlamak ani kuralina gore yeniden oder -- ciftlenmez,
            # cunku odul (kullanici, tur, mac) basina tektir.
            if not conn.execute("""SELECT 1 FROM rankit_diary_entries
                    WHERE user_id=? AND match_id=? AND rating IS NOT NULL LIMIT 1""",
                    (uid, body.match_id)).fetchone():
                revoked = rankit_rank.revoke_rating(conn, uid, body.match_id)
        # "A season followed end to end" (300): takip ettigin kulubun lig
        # sezonunun her maci puanliysa verilir, puan kaldirilip eksik kalirsa
        # geri alinir (bkz. rankit_hunt.sync_season_awards).
        season_gained, season_revoked = rankit_hunt.sync_season_awards(conn, uid, body.match_id)
        revoked += season_revoked
        rankit_hunt.sync_completions(conn, uid, body.match_id)
        # 3f: "@deniz stamped an Instant Classic on a match in your diary."
        # Yalnizca CLASSIC damgasi -- her puanlama herkesi rahatsiz etmemeli.
        # Kime: o maci defterine almis herkese. UNIQUE ayni damgayi ikinci kez
        # bildirmiyor, yani kaydi duzenlemek bildirimi tekrarlamaz.
        if body.classic and final_rating is not None:
            for other in conn.execute(
                    # Classic damgasinin kendisi bir HUKUM (BUILD §3). Yalnizca
                    # maci PUANLAMIS olana gider; yildizsiz izleme kaydi puan
                    # degil ve bildirim ona maci bozar (BUILD §15).
                    """SELECT DISTINCT user_id FROM rankit_diary_entries
                       WHERE match_id=? AND user_id<>? AND rating IS NOT NULL""", (body.match_id, uid)).fetchall():
                rankit_notify.notify(conn, int(other["user_id"]), "classic",
                                     actor_id=uid, match_id=body.match_id)
        # 6a / 7e (BUILD §4.1): "That's card 143." + uc delta. Deltalarin
        # yaninda TOPLAMLAR da: kart numarasi (bu kaydin kullanicinin
        # defterindeki sirasi; duzenlemede ayni kalir), guncel seri, toplam
        # puan. Koleksiyon karosu ("8/12 London Derby +1"): bu maci iceren,
        # avindaki en dolu koleksiyon; +1 yalnizca mac ILK KEZ puanlandiysa.
        streak_now = rankit_rank.streak_for(conn, uid, body.tz_offset)["current"]
        card_number = conn.execute("SELECT COUNT(*) FROM rankit_diary_entries WHERE user_id=? AND id<=?",
                                   (uid, entry_id)).fetchone()[0]
        return {"ok": True, "entry_id": entry_id, "updated": updated,
                "points_awarded": award["points"], "award_kind": award["kind"],
                "points_revoked": revoked,
                "diary_entries_delta": 0 if updated else 1,
                "streak_delta": streak_now - streak_before,
                "streak_current": streak_now,
                "points_total": rankit_rank.total_points(conn, uid),
                "card_number": card_number,
                "season_award": {"points": season_gained} if season_gained else None,
                "skins_unlocked": _newly_unlocked(conn, uid, body.tz_offset) if final_rating is not None else [],
                "collection": rankit_hunt.tile_for(conn, uid, body.match_id,
                                                   newly_rated=not was_rated and final_rating is not None)
                              if final_rating is not None else None}


@router.get("/skins")
def rankit_skins(entry_id: Optional[int] = None, tz_offset: int = Query(default=0, ge=-840, le=840),
                 user=Depends(get_optional_user)):
    """2j skin secici. `locked`: kazanilmamis (Turf / Floodlight / lig skinleri); `available`:
    bu kartta secilebilir mi (Gilt yalniz Classic kartta). entry_id verilirse
    o kaydin secili skini de doner."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        entry = None
        if entry_id is not None:
            entry = conn.execute("SELECT id,classic,skin FROM rankit_diary_entries WHERE id=? AND user_id=?",
                                 (entry_id, uid)).fetchone()
            if not entry:
                raise HTTPException(404, "Diary entry not found")
        unlocked = _unlocked_skins(conn, uid, tz_offset)
        skins = []
        for sid, name, rule in SKINS:
            locked = _is_earned(rule) and sid not in unlocked
            skins.append({"id": sid, "name": name, "rule": rule, "locked": locked,
                          "league": rule[7:] if str(rule or "").startswith("league:") else None,
                          "available": not locked and (rule != "classic" or bool(entry and entry["classic"]))})
        return {"skins": skins, "selected": (entry["skin"] or "default") if entry else None,
                "floodlight_nights": FLOODLIGHT_NIGHTS}


@router.put("/diary/{entry_id}")
def rankit_update_entry(entry_id: int, body: DiaryIn, user=Depends(get_optional_user)):
    # Sahiplik + mac eslesmesi rankit_log icinde kontrol edilir. Kimlik URL'den gelir.
    return rankit_log(body.model_copy(update={"entry_id": entry_id}), user)


def _votable_players(conn, match_id: int) -> set:
    """POTM ve respect verilebilecek oyuncular: BUILD §10.2 -- maçta GERCEKTEN
    oynayanlar (ilk 11 + oyuna girenler). Kadro oyunculara bagli degilse
    (eski satirlar, basketbol) sezon kadrosuna duser -- onceki davranis."""
    played = {r["player_id"] for r in conn.execute(
        """SELECT player_id FROM rankit_match_lineup_players
           WHERE match_id=? AND player_id IS NOT NULL
             AND (role='start' OR sub_in IS NOT NULL)""", (match_id,))}
    if played:
        return played
    return {r["player_id"] for r in conn.execute(
        "SELECT player_id FROM rankit_match_players WHERE match_id=?", (match_id,))}


def _require_rated(conn, uid: int, match_id: int):
    """BUILD §9.1 / §9.3: oyuncular (POTM, respect) PUAN verildikten sonra
    acilir -- "one dashed line says they open once there is a rating".
    Yildizsiz izleme kaydi yetmez (izleme kaydi puan degil)."""
    if not conn.execute("""SELECT 1 FROM rankit_diary_entries
            WHERE user_id=? AND match_id=? AND rating IS NOT NULL""", (uid, match_id)).fetchone():
        raise HTTPException(403, "Rate this match first")


@router.post("/matches/{match_id}/potm")
def vote_potm(match_id: int, body: VoteIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn); _require_rated(conn, uid, match_id)
        if body.player_id not in _votable_players(conn, match_id):
            raise HTTPException(422, "Player did not play in this match")
        conn.execute("""INSERT INTO rankit_potm_votes(user_id,match_id,player_id) VALUES(?,?,?)
            ON CONFLICT(user_id,match_id) DO UPDATE SET player_id=excluded.player_id,updated_at=datetime('now')""", (uid, match_id, body.player_id))
        # POTM ile respect ayni oyuncuda olamaz (vote_respect kurali). POTM
        # respect verilmis bir oyuncuya TASININCA o respect duser; yoksa
        # oyuncu iki listede birden kaliyordu.
        conn.execute("DELETE FROM rankit_respect_votes WHERE user_id=? AND match_id=? AND player_id=?",
                     (uid, match_id, body.player_id))
        return {"ok": True}


@router.put("/matches/{match_id}/respect")
def vote_respect(match_id: int, body: RespectIn, user=Depends(get_optional_user)):
    if len(set(body.player_ids)) > 2:
        raise HTTPException(422, "Choose at most two players")
    with get_conn() as conn:
        uid = _actor_id(user, conn); _require_rated(conn, uid, match_id)
        potm = conn.execute("SELECT player_id FROM rankit_potm_votes WHERE user_id=? AND match_id=?", (uid, match_id)).fetchone()
        if potm and potm["player_id"] in body.player_ids:
            raise HTTPException(422, "POTM cannot also receive Respect")
        if not set(body.player_ids).issubset(_votable_players(conn, match_id)):
            raise HTTPException(422, "Player did not play in this match")
        conn.execute("DELETE FROM rankit_respect_votes WHERE user_id=? AND match_id=?", (uid, match_id))
        conn.executemany("INSERT INTO rankit_respect_votes(user_id,match_id,player_id) VALUES(?,?,?)", [(uid, match_id, p) for p in dict.fromkeys(body.player_ids)])
        return {"ok": True}


@router.post("/follow")
def rankit_follow(body: FollowIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        existing = conn.execute("SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id)).fetchone()
        want = _want(existing, body)
        if want and not existing:
            # Eski uc PUT /people/{id}/follow'un kurallarini atlatamaz: kendini
            # takip yok, banli ya da olmayan hesap yok; diger hedefler de var
            # olmali (target_id polimorfik, FK yok -- hayalet takip kalirdi).
            if body.target_type == "user":
                if body.target_id == uid:
                    raise HTTPException(422, "You cannot follow yourself")
                if not conn.execute("SELECT 1 FROM users WHERE id=? AND is_banned=0", (body.target_id,)).fetchone():
                    raise HTTPException(404, "Member not found")
            else:
                table = {"team": "rankit_teams", "player": "rankit_players",
                         "competition": "rankit_competitions"}[body.target_type]
                if not conn.execute(f"SELECT 1 FROM {table} WHERE id=?", (body.target_id,)).fetchone():
                    raise HTTPException(404, "Not found")
            conn.execute("INSERT INTO rankit_follows(user_id,target_type,target_id,notify) VALUES(?,?,?,?)", (uid, body.target_type, body.target_id, int(body.notify)))
            if body.target_type == "user":
                rankit_notify.notify(conn, int(body.target_id), "follow", actor_id=uid)
        elif existing and not want:
            conn.execute("DELETE FROM rankit_follows WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id))
        return {"following": want}


@router.get("/lists")
def rankit_lists():
    with get_conn() as conn:
        rows = conn.execute("""SELECT l.*,u.username,(SELECT COUNT(*) FROM rankit_list_items i WHERE i.list_id=l.id) match_count
            FROM rankit_lists l JOIN users u ON u.id=l.user_id
            WHERE l.visibility='public' AND u.is_banned=0 ORDER BY l.updated_at DESC""").fetchall()
        return {"lists": [dict(r) for r in rows]}


@router.post("/lists")
def create_rankit_list(body: ListIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        # Olmayan mac kimligi eskiden FK hatasiyla 500 donuyordu.
        _require_matches(conn, list(dict.fromkeys(body.match_ids)))
        cur = conn.execute("INSERT INTO rankit_lists(user_id,title,description,ranked,visibility) VALUES(?,?,?,?,?)", (uid, body.title.strip(), body.description.strip(), int(body.ranked), body.visibility))
        for pos, mid in enumerate(dict.fromkeys(body.match_ids), 1):
            conn.execute("INSERT INTO rankit_list_items(list_id,match_id,position) VALUES(?,?,?)", (cur.lastrowid, mid, pos))
        return {"ok": True, "list_id": cur.lastrowid}


def _require_matches(conn, match_ids: list[int]) -> None:
    if not match_ids:
        return
    marks = ",".join("?" * len(match_ids))
    found = {r[0] for r in conn.execute(f"SELECT id FROM rankit_matches WHERE id IN ({marks})", match_ids)}
    missing = [m for m in match_ids if m not in found]
    if missing:
        raise HTTPException(404, f"Match not found: {missing[0]}")


def _require_list_owner(conn, list_id: int, uid: int):
    row = conn.execute("SELECT * FROM rankit_lists WHERE id=?", (list_id,)).fetchone()
    if not row:
        raise HTTPException(404, "List not found")
    if int(row["user_id"]) != uid:
        raise HTTPException(403, "You can only edit your own list")
    return row


def _repack_list(conn, list_id: int, match_ids: list[int]) -> None:
    """Siralari 1..n yeniden yaz. UNIQUE(list_id, position) yuzunden once
    hepsi negatife alinir; tek UPDATE ile kaydirmak satir sirasina gore
    carpisabiliyor."""
    conn.execute("UPDATE rankit_list_items SET position=-position WHERE list_id=?", (list_id,))
    for pos, mid in enumerate(match_ids, 1):
        conn.execute("UPDATE rankit_list_items SET position=? WHERE list_id=? AND match_id=?", (pos, list_id, mid))
    conn.execute("UPDATE rankit_lists SET updated_at=datetime('now') WHERE id=?", (list_id,))


def _list_match_ids(conn, list_id: int) -> list[int]:
    return [r[0] for r in conn.execute(
        "SELECT match_id FROM rankit_list_items WHERE list_id=? ORDER BY position", (list_id,))]


@router.put("/lists/{list_id}")
def rankit_update_list(list_id: int, body: ListUpdateIn, user=Depends(get_optional_user)):
    """3h "a list is a shelf you curate": olusturulduktan sonra da duzenlenir.
    Eskiden hicbir duzenleme ucu yoktu -- baslik, gorunurluk ya da siralama
    bir kez yazildiktan sonra degismiyordu."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        _require_list_owner(conn, list_id, uid)
        sets, args = [], []
        if body.title is not None:
            sets.append("title=?"); args.append(body.title.strip())
        if body.description is not None:
            sets.append("description=?"); args.append(body.description.strip())
        if body.ranked is not None:
            sets.append("ranked=?"); args.append(int(body.ranked))
        if body.visibility is not None:
            sets.append("visibility=?"); args.append(body.visibility)
        if sets:
            conn.execute(f"UPDATE rankit_lists SET {','.join(sets)},updated_at=datetime('now') WHERE id=?",
                         (*args, list_id))
        return {"ok": True}


@router.delete("/lists/{list_id}")
def rankit_delete_list(list_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        _require_list_owner(conn, list_id, uid)
        conn.execute("DELETE FROM rankit_lists WHERE id=?", (list_id,))
        return {"ok": True}


@router.delete("/lists/{list_id}/items/{match_id}")
def rankit_remove_list_item(list_id: int, match_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        _require_list_owner(conn, list_id, uid)
        cur = conn.execute("DELETE FROM rankit_list_items WHERE list_id=? AND match_id=?", (list_id, match_id))
        if not cur.rowcount:
            raise HTTPException(404, "Match is not in this list")
        _repack_list(conn, list_id, _list_match_ids(conn, list_id))
        return {"ok": True}


@router.put("/lists/{list_id}/order")
def rankit_order_list(list_id: int, body: ListOrderIn, user=Depends(get_optional_user)):
    """Siralama listenin TAM kumesi olmali: eksik ya da fazla mac sessizce
    dusurulmez/eklenmez."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        _require_list_owner(conn, list_id, uid)
        current = _list_match_ids(conn, list_id)
        if len(body.match_ids) != len(set(body.match_ids)) or set(body.match_ids) != set(current):
            raise HTTPException(422, "Order must contain exactly the matches in the list")
        _repack_list(conn, list_id, body.match_ids)
        return {"ok": True, "match_ids": body.match_ids}


def _require_list_access(conn, list_id: int, uid: Optional[int]):
    """Liste gorunurlugu. Once HIC yoktu: /lists/{id} her listeyi kimlige
    bakmadan donuyordu, yani 'private' bir liste kimligi tahmin eden herkese
    aciktı (guvenlik analizindeki "lists IDOR" maddesi). 404, 403 degil:
    gizli bir listenin VAR OLDUGUNU da soylememek icin."""
    # Banli hesabin listesi kesifte oldugu gibi kendi yuzeyinde de yok.
    row = conn.execute("""SELECT l.*,u.username FROM rankit_lists l
        JOIN users u ON u.id=l.user_id WHERE l.id=? AND u.is_banned=0""", (list_id,)).fetchone()
    if not row:
        raise HTTPException(404, "List not found")
    owner = int(row["user_id"])
    if row["visibility"] == "public" or uid == owner:
        return row
    if row["visibility"] == "followers" and uid and conn.execute(
            """SELECT 1 FROM rankit_follows WHERE user_id=? AND target_type='user'
               AND target_id=?""", (uid, owner)).fetchone():
        return row
    raise HTTPException(404, "List not found")


@router.get("/lists/mine")
def rankit_my_lists(user=Depends(get_optional_user)):
    """12b "YOUR LISTS · 4 … SAVED FROM OTHERS". Kendi listelerin (gizliler
    dahil) sayilariyla, sonra kaydettigin baskalarinin listeleri (hala
    gorebildiklerin; banli yazar yok)."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        counts = """(SELECT COUNT(*) FROM rankit_list_items i WHERE i.list_id=l.id) match_count,
            (SELECT COUNT(DISTINCT i.match_id) FROM rankit_list_items i JOIN rankit_diary_entries e
             ON e.match_id=i.match_id AND e.user_id=:uid AND e.rating IS NOT NULL WHERE i.list_id=l.id) rated,
            (SELECT COUNT(*) FROM rankit_list_respect r WHERE r.list_id=l.id) respect,
            (SELECT COUNT(*) FROM rankit_list_saves s WHERE s.list_id=l.id) saves"""
        owned = [dict(r) for r in conn.execute(f"""SELECT l.id,l.title,l.description,l.visibility,l.ranked,
            l.updated_at, {counts} FROM rankit_lists l WHERE l.user_id=:uid
            ORDER BY l.updated_at DESC, l.id DESC""", {"uid": uid})]
        saved = [dict(r) for r in conn.execute(f"""SELECT l.id,l.title,l.description,l.visibility,l.ranked,
            u.username, {counts} FROM rankit_list_saves sv JOIN rankit_lists l ON l.id=sv.list_id
            JOIN users u ON u.id=l.user_id
            WHERE sv.user_id=:uid AND l.user_id<>:uid AND u.is_banned=0
              AND (l.visibility='public' OR (l.visibility='followers' AND EXISTS(
                   SELECT 1 FROM rankit_follows f WHERE f.user_id=:uid AND f.target_type='user'
                   AND f.target_id=l.user_id)))
            ORDER BY sv.created_at DESC, sv.rowid DESC""", {"uid": uid})]
        return {"owned": owned, "saved": saved}


@router.get("/lists/{list_id}")
def rankit_list_detail(list_id: int, user=Depends(get_optional_user)):
    """Ekran 3h — "a list is a shelf you curate"."""
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        row = _require_list_access(conn, list_id, uid)
        items = conn.execute(MATCH_SELECT + """ JOIN rankit_list_items li ON li.match_id=m.id
            WHERE li.list_id=? ORDER BY li.position""", (list_id,)).fetchall()
        respect = conn.execute("SELECT COUNT(*) n FROM rankit_list_respect WHERE list_id=?",
                               (list_id,)).fetchone()["n"]
        saves = conn.execute("SELECT COUNT(*) n FROM rankit_list_saves WHERE list_id=?",
                             (list_id,)).fetchone()["n"]
        mine = lambda sql: bool(uid and conn.execute(sql, (list_id, uid)).fetchone())
        return {
            "list": dict(row),
            # uid ile: "your 5★" satiri izleyenin kendi puanindan geliyor.
            "matches": [_match_dict(conn, m, uid) for m in items],
            "respect": respect,
            "respected": mine("SELECT 1 FROM rankit_list_respect WHERE list_id=? AND user_id=?"),
            "saves": saves,
            "saved": mine("SELECT 1 FROM rankit_list_saves WHERE list_id=? AND user_id=?"),
            "is_owner": bool(uid and uid == int(row["user_id"])),
        }


@router.post("/lists/{list_id}/save")
def rankit_list_save(list_id: int, user=Depends(get_optional_user), body: Optional[ToggleIn] = None):
    """3h "38 saved". Kaydetmek bildirim URETMIYOR: tasarimda karsiligi yok
    ve bir listenin sahibine "biri kaydetti" demek respect'le yaristirir."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        _require_list_access(conn, list_id, uid)
        had = conn.execute("SELECT 1 FROM rankit_list_saves WHERE list_id=? AND user_id=?",
                           (list_id, uid)).fetchone()
        want = _want(had, body)
        if had and not want:
            conn.execute("DELETE FROM rankit_list_saves WHERE list_id=? AND user_id=?", (list_id, uid))
        elif want and not had:
            conn.execute("INSERT INTO rankit_list_saves(list_id,user_id) VALUES(?,?)", (list_id, uid))
        n = conn.execute("SELECT COUNT(*) n FROM rankit_list_saves WHERE list_id=?",
                         (list_id,)).fetchone()["n"]
        return {"saved": want, "saves": n}


@router.post("/lists/{list_id}/respect")
def rankit_list_respect(list_id: int, user=Depends(get_optional_user), body: Optional[ToggleIn] = None):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        row = _require_list_access(conn, list_id, uid)
        # Kendi listene respect yok (inceleme respect'iyle ayni kural).
        if int(row["user_id"]) == uid:
            raise HTTPException(403, "You cannot respect your own list")
        had = conn.execute("SELECT 1 FROM rankit_list_respect WHERE list_id=? AND user_id=?",
                           (list_id, uid)).fetchone()
        want = _want(had, body)
        if had and not want:
            conn.execute("DELETE FROM rankit_list_respect WHERE list_id=? AND user_id=?", (list_id, uid))
        elif want and not had:
            conn.execute("INSERT INTO rankit_list_respect(list_id,user_id) VALUES(?,?)", (list_id, uid))
            rankit_notify.notify(conn, int(row["user_id"]), "list_respect",
                                 actor_id=uid, list_id=list_id)
        n = conn.execute("SELECT COUNT(*) n FROM rankit_list_respect WHERE list_id=?",
                         (list_id,)).fetchone()["n"]
        return {"respected": want, "respect": n}


@router.post("/lists/{list_id}/items")
def add_rankit_list_item(list_id: int, body: ListItemIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        owner = conn.execute("SELECT user_id FROM rankit_lists WHERE id=?", (list_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "List not found")
        if int(owner["user_id"]) != uid:
            raise HTTPException(403, "You can only edit your own list")
        _require_matches(conn, [body.match_id])
        conn.execute("UPDATE rankit_lists SET updated_at=datetime('now') WHERE id=?", (list_id,))
        pos = conn.execute("SELECT COALESCE(MAX(position),0)+1 p FROM rankit_list_items WHERE list_id=?", (list_id,)).fetchone()["p"]
        conn.execute("""INSERT INTO rankit_list_items(list_id,match_id,position,note) VALUES(?,?,?,?)
            ON CONFLICT(list_id,match_id) DO UPDATE SET note=excluded.note""", (list_id, body.match_id, pos, body.note.strip()))
        return {"ok": True}


@router.post("/matches/{match_id}/watchlist")
def toggle_watchlist(match_id: int, user=Depends(get_optional_user), body: Optional[ToggleIn] = None):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        if not conn.execute("SELECT 1 FROM rankit_matches WHERE id=?", (match_id,)).fetchone():
            raise HTTPException(404, "Match not found")
        exists = conn.execute("SELECT 1 FROM rankit_watchlist WHERE user_id=? AND match_id=?", (uid, match_id)).fetchone()
        want = _want(exists, body)
        if exists and not want:
            conn.execute("DELETE FROM rankit_watchlist WHERE user_id=? AND match_id=?", (uid, match_id))
        elif want and not exists:
            conn.execute("INSERT INTO rankit_watchlist(user_id,match_id) VALUES(?,?)", (uid, match_id))
        return {"watchlisted": want}


@router.get("/watchlist")
def get_watchlist(user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        rows = conn.execute(MATCH_SELECT + """ JOIN rankit_watchlist w ON w.match_id=m.id
            WHERE w.user_id=? ORDER BY m.starts_at""", (uid,)).fetchall()
        return {"matches": [_match_dict(conn, row, uid) for row in rows]}


class AppetiteIn(BaseModel):
    # 1-5: isi rampasinin bes basamagi (COLD..HOT). None = okumayi geri cek.
    appetite: Optional[int] = Field(default=None, ge=1, le=5)


@router.put("/matches/{match_id}/appetite")
def set_appetite(match_id: int, body: AppetiteIn, user=Depends(get_optional_user)):
    """Beklenen isi okumasi -- 2h/16c "members who want this one".

    Okuma izleme listesine ekleyenden gelir: okuma vermek maci listeye de
    ekler, None okumayi geri ceker ama maci listede birakir. Listeden cikmak
    (toggle_watchlist) satiri, dolayisiyla okumayi da siler. Yalnizca
    baslamamis macta: baslama duduguyle beklenti biter. Idempotent.
    """
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        match = conn.execute("SELECT status,starts_at FROM rankit_matches WHERE id=?", (match_id,)).fetchone()
        if not match:
            raise HTTPException(404, "Match not found")
        # Durum alani saglayicidan gecikmeli donebilir (canli dongu dakikada
        # bir): baslama SAATI gectiyse beklenti de kapanmistir.
        kickoff = rankit_rank._as_dt(match["starts_at"])
        if match["status"] != "upcoming" or (kickoff and kickoff <= datetime.now(timezone.utc).replace(tzinfo=None)):
            raise HTTPException(409, "Expected heat closes at kick-off")
        conn.execute("""INSERT INTO rankit_watchlist(user_id,match_id,appetite) VALUES(?,?,?)
            ON CONFLICT(user_id,match_id) DO UPDATE SET appetite=excluded.appetite""",
                     (uid, match_id, body.appetite))
        return {"watchlisted": True, "my_appetite": body.appetite}


@router.post("/favorite")
def toggle_favorite(body: TargetIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        exists = conn.execute("SELECT 1 FROM rankit_favorites WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id)).fetchone()
        want = _want(exists, body)
        if exists and not want:
            conn.execute("DELETE FROM rankit_favorites WHERE user_id=? AND target_type=? AND target_id=?", (uid, body.target_type, body.target_id))
        elif want and not exists:
            conn.execute("INSERT INTO rankit_favorites(user_id,target_type,target_id) VALUES(?,?,?)", (uid, body.target_type, body.target_id))
        return {"favorited": want}


@router.post("/reviews/{entry_id}/like")
def toggle_review_like(entry_id: int, user=Depends(get_optional_user), body: Optional[ToggleIn] = None):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        entry = _require_review_access(conn, entry_id, uid)
        # Kendi incelemene respect yok: sayim "baskalari ne dusundu" ve 5c'nin
        # varsayilan sirasi bu sayiya dayaniyor.
        if int(entry["user_id"]) == uid:
            raise HTTPException(403, "You cannot respect your own review")
        exists = conn.execute("SELECT 1 FROM rankit_review_likes WHERE user_id=? AND entry_id=?", (uid, entry_id)).fetchone()
        want = _want(exists, body)
        if exists and not want:
            conn.execute("DELETE FROM rankit_review_likes WHERE user_id=? AND entry_id=?", (uid, entry_id))
        elif want and not exists:
            conn.execute("INSERT INTO rankit_review_likes(user_id,entry_id) VALUES(?,?)", (uid, entry_id))
        likes = conn.execute("SELECT COUNT(*) n FROM rankit_review_likes WHERE entry_id=?", (entry_id,)).fetchone()["n"]
        # §7.1 — respect, incelemenin YAZARINA puan kazandirir (respect veren
        # kisiye degil). Tavan inceleme basina 50 puan: tek bir viral yorumun
        # kademe satin almasini engelliyor.
        author = conn.execute("SELECT user_id FROM rankit_diary_entries WHERE id=?", (entry_id,)).fetchone()
        # Bildirim yalnizca respect VERILIRKEN; geri alinca satir silinmiyor
        # ama UNIQUE tekrar yazmayi da engelliyor (bkz. rankit_notify.notify).
        if author and want and not exists:
            rankit_notify.notify(conn, int(author["user_id"]), "respect",
                                 actor_id=uid, entry_id=entry_id)
        if author:
            _sync_review_respect(conn, entry_id, int(author["user_id"]))
        return {"liked": want, "likes": likes}


def _sync_review_respect(conn, entry_id: int, author_id: int) -> None:
    """§12.1 "A like on your review": respect basina puan, inceleme basina tavan.

    Defter satiri (inceleme basina TEK) incelemenin SU ANKI respect'lerinden
    hesaplanir, yazarin kendisi haric. Eskiden her tiklamada puan EKLENIYORDU
    -- respect'i geri almak dahil: tek bir kisi ver / geri al ile yazara
    tavana kadar puan uretebiliyordu. Artik geri alinan respect puanini da
    geri alir; ayni kisi ikinci kez odetemez.
    """
    given = conn.execute("SELECT COUNT(*) FROM rankit_review_likes WHERE entry_id=? AND user_id<>?",
                         (entry_id, author_id)).fetchone()[0]
    per, variant = rankit_rank.points_for(conn, "respect", author_id)
    points = min(given * per, rankit_rank.RESPECT_CAP_PER_REVIEW)
    if points <= 0:
        conn.execute("""DELETE FROM rankit_points WHERE user_id=? AND kind='respect'
                        AND subject_type='review' AND subject_id=?""", (author_id, entry_id))
        return
    conn.execute(
        """INSERT INTO rankit_points(user_id,kind,points,subject_type,subject_id,variant)
           VALUES(?,'respect',?,'review',?,?)
           ON CONFLICT(user_id,kind,subject_type,subject_id) DO UPDATE SET points=excluded.points""",
        (author_id, points, entry_id, variant))


def _require_review_access(conn, entry_id: int, uid: Optional[int] = None):
    # Banli hesabin incelemesi listelerden dustugu gibi kendi yuzeyinde de yok.
    entry = conn.execute("""SELECT e.user_id,e.visibility,e.review,e.spoiler,u.is_banned
        FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id WHERE e.id=?""", (entry_id,)).fetchone()
    if not entry or not entry["review"] or entry["is_banned"]:
        raise HTTPException(404, "Review not found")
    if entry["visibility"] == "public" or uid == entry["user_id"]:
        return entry
    if entry["visibility"] == "followers" and uid and conn.execute("""SELECT 1 FROM rankit_follows
        WHERE user_id=? AND target_type='user' AND target_id=?""", (uid, entry["user_id"])).fetchone():
        return entry
    raise HTTPException(403, "This review is not visible to you")


@router.get("/reviews/{entry_id}/comments")
def review_comments(entry_id: int, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        entry = _require_review_access(conn, entry_id, uid)
        rows = conn.execute("""SELECT c.id,c.content,c.created_at,u.username FROM rankit_review_comments c
            JOIN users u ON u.id=c.user_id WHERE c.entry_id=? AND u.is_banned=0 ORDER BY c.id""", (entry_id,)).fetchall()
        # Spoiler isaretli incelemenin yanitlari da spoiler: ayni maci konusuyorlar.
        return {"comments": [{**dict(r), "spoiler": bool(entry["spoiler"])} for r in rows]}


@router.post("/reviews/{entry_id}/comments")
def add_review_comment(entry_id: int, body: ReviewCommentIn, user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        entry = _require_review_access(conn, entry_id, uid)
        # Ayni client_id ile gelen tekrar ikinci yanit ve ikinci bildirim
        # dogurmaz; ilk yanitin kimligi doner.
        if body.client_id:
            seen = conn.execute("SELECT id, entry_id FROM rankit_review_comments WHERE user_id=? AND client_id=?",
                                (uid, body.client_id)).fetchone()
            if seen:
                if int(seen["entry_id"]) != entry_id:
                    raise HTTPException(409, "This reply id belongs to another review")
                return {"ok": True, "comment_id": seen["id"], "duplicate": True}
        # Adres varsayilani INCELEMENIN YAZARI: bir yanit her zaman birine
        # yoneliktir, ve hicbir sey secilmediyse yoneldigi kisi yazardir.
        author = int(entry["user_id"])
        target = body.reply_to or author
        # §11.2: adres yanit EYLEMINDEN uretilir -- yalnizca bu dizide olan
        # birine: yazar ya da burada yanit yazmis biri. Eskiden herhangi bir
        # kullanici kimligi kabul ediliyordu; diziyle ilgisi olmayan birine
        # (incelemeyi goremeyen birine bile) "reply" bildirimi yollanabiliyordu.
        if target != author and not conn.execute(
                """SELECT 1 FROM rankit_review_comments c JOIN users u ON u.id=c.user_id
                   WHERE c.entry_id=? AND c.user_id=? AND u.is_banned=0 LIMIT 1""",
                (entry_id, target)).fetchone():
            raise HTTPException(422, "Reply to the author or someone in this thread")
        cur = conn.execute(
            "INSERT INTO rankit_review_comments(user_id,entry_id,content,reply_to_user_id,client_id) VALUES(?,?,?,?,?)",
            (uid, entry_id, body.content.strip(), target, body.client_id))
        # Yanit ADRESLENEN kisiye gider, incelemenin yazarina degil: §6.1'de
        # bir yanit her zaman BIRINE yoneliktir ve o kisi yazar olmayabilir.
        rankit_notify.notify(conn, target, "reply", actor_id=uid, entry_id=entry_id)
        return {"ok": True, "comment_id": cur.lastrowid}


@router.get("/matches/{match_id}/watchalong")
def watchalong_history(match_id: int, room: str = "community",
                       before_id: Optional[int] = Query(default=None, gt=0),
                       limit: int = Query(default=100, ge=1, le=200)):
    """Oda gecmisi. 6d "Read the thread": gecenin TUM konusmasi okunabilir --
    eskiden yalniz son 100 mesaj donuyordu (Codex frontend kaydi, 6d arsivi).
    Sayfalar geriye dogru: `before_id` verilirse ondan onceki mesajlar;
    `has_more` daha eskisi var mi, `next_before_id` bir sonraki istek icin.
    Mesajlar her sayfada eskiden yeniye."""
    with get_conn() as conn:
        where, args = "w.match_id=? AND w.room=?", [match_id, room[:40]]
        if before_id is not None:
            where += " AND w.id<?"
            args.append(before_id)
        rows = conn.execute(f"""SELECT w.id,w.content,w.created_at,u.username FROM rankit_watchalong_messages w
            JOIN users u ON u.id=w.user_id WHERE {where} ORDER BY w.id DESC LIMIT ?""", (*args, limit + 1)).fetchall()
        has_more = len(rows) > limit
        page = list(reversed(rows[:limit]))
        return {"messages": [dict(r) for r in page], "has_more": has_more,
                "next_before_id": page[0]["id"] if has_more and page else None}


# Companion suresi SUNUCU SAATIYLE (§12.1 "a night in the companion", 20 puan).
# Katilim ucunu (/presence) hicbir istemci cagirmiyordu -- frontend'de cagri
# yok; sohbet soketi ise panel acilinca baglaniyor. Sure, baglantinin macin
# CANLI penceresiyle ortusen kismi: baslama anindan itibaren, spora gore en
# uzun mac suresiyle sinirli. Istemci sayi gonderip hile yapamaz.
MATCH_SPAN_SECONDS = {"Football": 130 * 60, "Basketball": 180 * 60}
PRESENCE_FIRST_REPORT_SECONDS = 60


def _minute_number(value):
    """Mac dakikasi -> int: "73'", "45+2'", FotMob'un yon isaretli dakikasi
    ya da 73 -> 73; "HT" -> 45; okunamazsa None. 0..200 araligina kirpilir."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return max(0, min(200, int(value)))
    text = str(value)
    found = re.search(r"\d{1,3}", text)
    if found:
        return max(0, min(200, int(found.group(0))))
    return 45 if "HT" in text.upper() else None


def _join_room(conn, uid: int, match_id: int) -> None:
    """Odaya giren katilanlara sayilir (5a "24 joining"); sure eklenmez."""
    conn.execute("""INSERT INTO rankit_companion_presence(user_id,match_id,seconds,updated_at)
        VALUES(?,?,0,datetime('now'))
        ON CONFLICT(user_id,match_id) DO UPDATE SET updated_at=datetime('now')""", (uid, match_id))


def _maybe_award_companion(conn, uid: int, match_id: int, sport: str) -> int:
    """Esik gecildiyse ve daha once odenmediyse companion odulu."""
    total = conn.execute("""SELECT seconds,awarded_at FROM rankit_companion_presence
        WHERE user_id=? AND match_id=?""", (uid, match_id)).fetchone()
    need = rankit_rank.PRESENCE_SECONDS.get(sport, rankit_rank.PRESENCE_DEFAULT)
    if not total or total["seconds"] < need or total["awarded_at"]:
        return 0
    gained = rankit_rank.award(conn, uid, "companion", "match", match_id)
    conn.execute("""UPDATE rankit_companion_presence SET awarded_at=datetime('now')
        WHERE user_id=? AND match_id=?""", (uid, match_id))
    return gained


def _accrue_room_seconds(conn, uid: int, match_id: int, joined_at: datetime, left_at: datetime) -> int:
    """Baglantinin macin canli penceresiyle ortusen saniyelerini ekler."""
    row = conn.execute("SELECT sport,status,starts_at FROM rankit_matches WHERE id=?", (match_id,)).fetchone()
    started = rankit_rank._as_dt(row["starts_at"]) if row else None
    if not row or not started or row["status"] not in ("live", "finished"):
        return 0
    if started.tzinfo is not None:
        started = started.astimezone(timezone.utc).replace(tzinfo=None)
    window_end = started + timedelta(seconds=MATCH_SPAN_SECONDS.get(row["sport"], 150 * 60))
    added = max(0, int((min(left_at, window_end) - max(joined_at, started)).total_seconds()))
    if added:
        conn.execute("""UPDATE rankit_companion_presence SET seconds=seconds+?, updated_at=datetime('now')
            WHERE user_id=? AND match_id=?""", (added, uid, match_id))
        _maybe_award_companion(conn, uid, match_id, row["sport"])
    return added


WATCHALONG_RATE_LIMIT, WATCHALONG_RATE_WINDOW = 5, 10.0


@router.websocket("/ws/watchalong/{match_id}")
async def rankit_watchalong_socket(ws: WebSocket, match_id: int, room: str = "community"):
    token = ws.query_params.get("token", "")
    uid = None
    if token:
        try:
            # imza + ban + token sürümü; geçmezse misafir değil, kapı kapalı
            uid = int(verify_token(token)["sub"])
        except Exception:
            uid = None
    with get_conn() as conn:
        if uid is None and not IS_PROD:
            uid = _demo_user_id(conn)
        if uid is None:
            await ws.close(code=4401, reason="Sign in required")
            return
        username_row = conn.execute("SELECT username FROM users WHERE id=?", (uid,)).fetchone()
        if not username_row:
            await ws.close(code=4401, reason="Unknown user")
            return
        username = username_row["username"]
    await ws.accept()
    key = (match_id, room[:40])
    WATCHALONG_CONNECTIONS.setdefault(key, []).append(ws)
    joined_at = datetime.now(timezone.utc).replace(tzinfo=None)
    present = ROOM_USERS.setdefault(match_id, {})
    present[uid] = present.get(uid, 0) + 1
    with get_conn() as conn:
        _join_room(conn, uid, match_id)
    sent_at: list[float] = []   # bu bağlantının son mesaj zamanları (sel koruması)
    try:
        while True:
            payload = await ws.receive_json()
            if not isinstance(payload, dict):
                continue
            content = str(payload.get("content", "")).strip()[:300]
            if not content:
                continue
            # Bağlantı başına 10 sn'de en çok 5 mesaj: HTTP istek sınırı
            # WebSocket'i kapsamıyor, tek istemci odayı mesaj seliyle boğabiliyordu.
            now_ts = time.monotonic()
            sent_at = [t for t in sent_at if now_ts - t < WATCHALONG_RATE_WINDOW]
            if len(sent_at) >= WATCHALONG_RATE_LIMIT:
                await ws.send_json({"type": "error", "error": "You're sending messages too fast — wait a moment.",
                                    "client_id": str(payload.get("client_id", ""))[:64]})
                continue
            sent_at.append(now_ts)
            with get_conn() as conn:
                match = conn.execute("SELECT status FROM rankit_matches WHERE id=?", (match_id,)).fetchone()
                if not match or match["status"] not in ("upcoming", "live"):
                    await ws.send_json({"type": "error", "error": "This room is now read-only.", "client_id": str(payload.get("client_id", ""))[:64]})
                    continue
                cur = conn.execute("INSERT INTO rankit_watchalong_messages(match_id,user_id,room,content) VALUES(?,?,?,?)", (match_id, uid, key[1], content))
                message = {"id": cur.lastrowid, "username": username, "content": content, "created_at": "now"}
            for peer in list(WATCHALONG_CONNECTIONS.get(key, [])):
                try:
                    await peer.send_json({"type": "message", "message": message, "client_id": str(payload.get("client_id", ""))[:64]})
                except Exception:
                    if peer in WATCHALONG_CONNECTIONS.get(key, []):
                        WATCHALONG_CONNECTIONS[key].remove(peer)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WATCHALONG_CONNECTIONS.get(key, []):
            WATCHALONG_CONNECTIONS[key].remove(ws)
        present = ROOM_USERS.get(match_id, {})
        if present.get(uid, 0) <= 1:
            present.pop(uid, None)
        else:
            present[uid] -= 1
        try:
            with get_conn() as conn:
                _accrue_room_seconds(conn, uid, match_id, joined_at,
                                     datetime.now(timezone.utc).replace(tzinfo=None))
        except Exception:
            pass    # sure yazilamamasi baglantiyi kapatmayi bozmamali


class PresenceIn(BaseModel):
    """Companion'da gecirilen sure. Istemci periyodik olarak EK sure gonderir.

    Neden toplam degil de ek: sekme kapanip acilirsa toplam sifirlanir ve
    kullanici kazandigi sureyi kaybeder; ek gondermek her parcayi kalici kilar.
    """
    seconds: int = Field(ge=0, le=1800)   # tek raporda en fazla 30 dk


class PulseIn(BaseModel):
    """Canli okuma (ekran 5b "YOUR LIVE READ"). Isi rampasiyla ayni olcek."""
    value: float = Field(ge=0, le=5)
    # Istemcinin dakikasi yalnizca YEDEK: sunucu saglayicinin canli dakikasini
    # (live_minute) kullanir. Istemci companion yanitindaki "73'" metnini
    # aynen geri yolluyordu ve tamsayi bekleyen alan okumayi 422 ile
    # reddediyordu; dakika gelmeyince de her okuma 0. dakikaya yaziliyordu.
    minute: Optional[int | str] = None


@router.get("/matches/{match_id}/companion")
def rankit_companion(match_id: int, user=Depends(get_optional_user)):
    """Companion sekmesinin tum durumu — 5a (mac oncesi) ve 5b (canli).

    Rozet mac durumundan turer: katilim sayisi -> LIVE -> hicbir sey.
    Emekli olan Watchalong sekmesinin yerini aliyor.
    """
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        row = conn.execute("SELECT status,starts_at,sport,live_minute FROM rankit_matches WHERE id=?",
                           (match_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Match not found")

        joined = conn.execute(
            "SELECT COUNT(*) n FROM rankit_companion_presence WHERE match_id=?",
            (match_id,)).fetchone()["n"]
        # 5a "3 you follow": katilanlardan izleyenin takip ettikleri.
        joined_following = conn.execute(
            """SELECT COUNT(*) n FROM rankit_companion_presence p
               JOIN rankit_follows f ON f.user_id=? AND f.target_type='user' AND f.target_id=p.user_id
               WHERE p.match_id=?""", (uid or -1, match_id)).fetchone()["n"]
        # 6d "184 messages kept" / 5b sohbet: odanin tum mesajlari.
        messages = conn.execute("SELECT COUNT(*) n FROM rankit_watchalong_messages WHERE match_id=?",
                                (match_id,)).fetchone()["n"]
        # §5.5: nabiz ISI rampasinda bir deger ("every heat value everywhere").
        # 20 okuma olmadan sayi yok; okuma sayilari her zaman kalir.
        floor = rankit_rank.MIN_COMMUNITY_RATINGS

        # Su anki nabiz: kullanici basina SON okuma. Her ornegi ortalamak
        # cok okuma yapani agirliklandirirdi.
        current = conn.execute(
            """SELECT AVG(value) v, COUNT(*) n FROM rankit_pulse_reads p
               WHERE match_id=? AND id=(SELECT MAX(id) FROM rankit_pulse_reads
                                        WHERE match_id=p.match_id AND user_id=p.user_id)""",
            (match_id,)).fetchone()

        # Zaman cizelgesi: 5'er dakikalik kovalar. Okumanin VERILDIGI dakika
        # (saglayicinin canli dakikasi), kaydedildigi an degil.
        timeline = [dict(r) for r in conn.execute(
            """SELECT (minute/5)*5 bucket, ROUND(AVG(value),2) value, COUNT(*) reads
               FROM rankit_pulse_reads WHERE match_id=?
               GROUP BY bucket ORDER BY bucket""", (match_id,))]
        for bucket in timeline:
            if bucket["reads"] < floor:
                bucket["value"] = None
        by_bucket = {b["bucket"]: b for b in timeline}

        moments = [dict(r) for r in conn.execute(
            """SELECT m.id,m.minute,m.kind,m.label,
                      (SELECT COUNT(*) FROM rankit_moment_marks k WHERE k.moment_id=m.id) marks
               FROM rankit_moments m WHERE m.match_id=? ORDER BY m.minute DESC""",
            (match_id,))]
        # 5b "Red card - Sporting · Pulse +0.9": anin oncesi ve sonrasindaki
        # kovalarin farki; iki kova da esigi gecmediyse sayi yok.
        for moment in moments:
            base = (int(moment["minute"]) // 5) * 5
            before, after = by_bucket.get(base - 5), by_bucket.get(base + 5)
            moment["pulse_delta"] = (round(after["value"] - before["value"], 2)
                                     if before and after and before["value"] is not None
                                     and after["value"] is not None else None)

        mine = conn.execute(
            """SELECT value,minute FROM rankit_pulse_reads
               WHERE match_id=? AND user_id=? ORDER BY id DESC LIMIT 1""",
            (match_id, uid or -1)).fetchone()

        status = row["status"]
        # 6d "THE NIGHT, IN FULL": maç bitince nabiz gecenin KAYDI olur. Yalnizca
        # olculen kovalardan; olcum yoksa alan bos (HANDOFF §4.9.4: grafik,
        # zirve ya da katilim uydurulmaz). Devre arasi karsilastirmasi yalnizca
        # futbolda: basketbol donemleri baska (§4.9.6).
        record = None
        if status == "finished":
            scored = [b for b in timeline if b["value"] is not None]
            peak = max(scored, key=lambda b: (b["value"], b["reads"])) if scored else None
            rise = None
            half = by_bucket.get(45)
            if row["sport"] == "Football" and scored and half and half["value"] is not None \
                    and scored[-1]["bucket"] > 45:
                rise = round(scored[-1]["value"] - half["value"], 2)
            record = {
                "peak": ({"minute": peak["bucket"], "value": peak["value"], "reads": peak["reads"]}
                         if peak else None),
                "rise_from_ht": rise, "messages": messages, "attendance": joined,
            }
        return {
            "status": status,
            "sport": row["sport"],
            "starts_at": row["starts_at"],
            # 5b zaman cizelgesinin son etiketi ("73'"). Saglayicidan
            # geliyor, hizli olay dongusu yaziyor.
            "minute": clean_minute(row["live_minute"]),
            # 5a: katilim sayisi, 5b: LIVE, bitmisse rozet yok.
            "badge": str(joined) if status == "upcoming" and joined else ("LIVE" if status == "live" else None),
            "joined": joined,
            "joined_following": joined_following,
            # 15d "312 in the room": su an bagli olan farkli kisiler.
            "in_room": len(ROOM_USERS.get(match_id, {})),
            "messages": messages,
            # Sohbet mac oncesi ve canliyken acik; bitince okunur kalir (6d).
            "room_open": status in ("upcoming", "live"),
            "pulse": {"value": (round(current["v"], 2)
                                if current and current["v"] is not None and current["n"] >= floor else None),
                      "reads": current["n"] if current else 0,
                      "min_reads": floor,
                      "timeline": timeline},
            "my_read": {"value": mine["value"], "minute": mine["minute"]} if mine else None,
            "moments": moments,
            # 5a'nin sozu: "Live rating opens at kick-off. Your stars still
            # wait for full time." Yildiz puanlama HALA bitmis mac istiyor.
            "live_read_open": status == "live",
            "record": record,
        }


@router.post("/matches/{match_id}/pulse")
def rankit_pulse(match_id: int, body: PulseIn, user=Depends(get_optional_user)):
    """Canli okuma birak. Yalnizca mac CANLIYKEN — 5a acikca "live rating
    opens at kick-off" diyor."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        row = conn.execute("SELECT status,live_minute FROM rankit_matches WHERE id=?", (match_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Match not found")
        if row["status"] != "live":
            raise HTTPException(409, "The live read opens at kick-off")
        minute = _minute_number(row["live_minute"])
        if minute is None:
            minute = _minute_number(body.minute) or 0
        conn.execute(
            "INSERT INTO rankit_pulse_reads(match_id,user_id,value,minute) VALUES(?,?,?,?)",
            (match_id, uid, float(body.value), minute))
        agg = conn.execute(
            """SELECT AVG(value) v, COUNT(*) n FROM rankit_pulse_reads p
               WHERE match_id=? AND id=(SELECT MAX(id) FROM rankit_pulse_reads
                                        WHERE match_id=p.match_id AND user_id=p.user_id)""",
            (match_id,)).fetchone()
        return {"ok": True, "pulse": round(agg["v"], 2) if agg["v"] is not None else None,
                "reads": agg["n"]}


@router.post("/moments/{moment_id}/mark")
def rankit_mark_moment(moment_id: int, user=Depends(get_optional_user)):
    """Bir ani isaretle ("148 marked this"). Idempotent."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        exists = conn.execute("SELECT 1 FROM rankit_moment_marks WHERE moment_id=? AND user_id=?",
                              (moment_id, uid)).fetchone()
        if exists:
            conn.execute("DELETE FROM rankit_moment_marks WHERE moment_id=? AND user_id=?",
                         (moment_id, uid))
        else:
            conn.execute("INSERT INTO rankit_moment_marks(moment_id,user_id) VALUES(?,?)",
                         (moment_id, uid))
        n = conn.execute("SELECT COUNT(*) n FROM rankit_moment_marks WHERE moment_id=?",
                         (moment_id,)).fetchone()["n"]
        return {"marked": not bool(exists), "marks": n}


@router.get("/reviews/{entry_id}/thread")
def rankit_review_thread(entry_id: int, tz_offset: int = 0, user=Depends(get_optional_user)):
    """Ekran 4a — bir incelemenin kendi yuzeyi.

    §6.1: mac sayfasinin inceleme listesi ile bir incelemenin yanit dizisi
    AYRI yuzeyler. Burada inceleme nesnenin kendisi; yanitlar ona asili.

    Yanitlar DUZ bir liste, agac degil: yuvalama tek seviye, derinlik yerine
    "kime" bilgisi tasiniyor. Sira EN COK RESPECT.
    """
    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        _require_review_access(conn, entry_id, uid)

        row = conn.execute("""
            SELECT e.id,e.user_id,e.rating,e.review,e.classic,e.spoiler,e.created_at,
                   e.rated_at, e.is_rewatch, """ + NIGHT_AWARD_SQL + """,
                   u.username, m.id match_id, m.starts_at,
                   ht.name home_name, at.name away_name, m.home_score, m.away_score,
                   (SELECT COUNT(*) FROM rankit_review_likes l WHERE l.entry_id=e.id) respect,
                   EXISTS(SELECT 1 FROM rankit_review_likes l WHERE l.entry_id=e.id AND l.user_id=?) respected
            FROM rankit_diary_entries e
            JOIN users u ON u.id=e.user_id
            JOIN rankit_matches m ON m.id=e.match_id
            JOIN rankit_teams ht ON ht.id=m.home_team_id
            JOIN rankit_teams at ON at.id=m.away_team_id
            WHERE e.id=?""", (uid or -1, entry_id)).fetchone()
        if not row:
            raise HTTPException(404, "Review not found")

        author_points = rankit_rank.total_points(conn, int(row["user_id"]))

        tags = [r["tag"] for r in conn.execute(
            "SELECT tag FROM rankit_entry_tags WHERE entry_id=?", (entry_id,))]

        replies = [dict(r) for r in conn.execute("""
            SELECT c.id, c.content, c.created_at, c.user_id, u.username,
                   t.username reply_to,
                   (SELECT COUNT(*) FROM rankit_comment_respect k WHERE k.comment_id=c.id) respect,
                   EXISTS(SELECT 1 FROM rankit_comment_respect k
                          WHERE k.comment_id=c.id AND k.user_id=?) respected
            FROM rankit_review_comments c
            JOIN users u ON u.id=c.user_id
            LEFT JOIN users t ON t.id=c.reply_to_user_id
            WHERE c.entry_id=? AND u.is_banned=0
            ORDER BY respect DESC, c.id ASC""", (uid or -1, entry_id))]
        for r in replies:
            # §6.1: yazarin kendi yanitlari AUTHOR isareti tasir.
            r["is_author"] = int(r["user_id"]) == int(row["user_id"])
            r["is_mine"] = bool(uid and int(r["user_id"]) == uid)
            # HANDOFF §5: spoiler isaretli incelemenin yanitlarinin da kendi
            # gosterme kapisi var -- ayni maci konusuyorlar.
            r["spoiler"] = bool(row["spoiler"])

        return {
            "review": {
                "id": row["id"], "username": row["username"],
                # Sahiplik sunucudan: istemci kullanici adindan eslemek zorunda
                # kalmasin (kendi incelemene respect yok, Faz 7).
                "user_id": row["user_id"], "is_mine": bool(uid and int(row["user_id"]) == uid),
                "rating": row["rating"], "review": row["review"],
                "classic": bool(row["classic"]), "spoiler": bool(row["spoiler"]),
                "created_at": row["created_at"],
                "respect": row["respect"], "respected": bool(row["respected"]),
                "tags": tags,
                "on_the_night": _on_the_night(row, tz_offset),
                # §7.3: incelemenin yaninda yalnizca KADEME ADI, ilerleme yok.
                "rank": rankit_rank.tier_for(author_points)["tier"],
                "rank_name": rankit_rank.tier_for(author_points)["name"],
            },
            "match": {
                "id": row["match_id"],
                "title": f"{row['home_name']} {row['home_score']}-{row['away_score']} {row['away_name']}"
                         if row["home_score"] is not None else f"{row['home_name']} v {row['away_name']}",
            },
            "replies": replies,
        }


@router.post("/comments/{comment_id}/respect")
def rankit_comment_respect(comment_id: int, user=Depends(get_optional_user), body: Optional[ToggleIn] = None):
    """Yanita respect. §6.1: begeni degil respect — asla altin, asla animasyon."""
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        # Eskiden hicbir kontrol yoktu: goremedigin (gizli / takipcilere acik)
        # bir incelemenin yanitina respect verilebiliyor, kendi yanitina respect
        # verilebiliyor, var olmayan yanit kimligi 500 donduruyordu.
        comment = conn.execute("""SELECT c.entry_id,c.user_id,u.is_banned FROM rankit_review_comments c
            JOIN users u ON u.id=c.user_id WHERE c.id=?""", (comment_id,)).fetchone()
        if not comment or comment["is_banned"]:
            raise HTTPException(404, "Reply not found")
        _require_review_access(conn, int(comment["entry_id"]), uid)
        if int(comment["user_id"]) == uid:
            raise HTTPException(403, "You cannot respect your own reply")
        exists = conn.execute("SELECT 1 FROM rankit_comment_respect WHERE comment_id=? AND user_id=?",
                              (comment_id, uid)).fetchone()
        want = _want(exists, body)
        if exists and not want:
            conn.execute("DELETE FROM rankit_comment_respect WHERE comment_id=? AND user_id=?",
                         (comment_id, uid))
        elif want and not exists:
            conn.execute("INSERT INTO rankit_comment_respect(comment_id,user_id) VALUES(?,?)",
                         (comment_id, uid))
        n = conn.execute("SELECT COUNT(*) n FROM rankit_comment_respect WHERE comment_id=?",
                         (comment_id,)).fetchone()["n"]
        return {"respected": want, "respect": n}


@router.get("/matches/{match_id}/reviews")
def rankit_match_reviews(match_id: int, sort: str = "respected",
                         tz_offset: int = 0, limit: int = 60, offset: int = 0,
                         user=Depends(get_optional_user),
                         scope: Literal["all", "following"] = "all"):
    """Ekran 5c — Community sekmesindeki "318 reviews >" buraya gidiyor.

    Iki sey mac sayfasindaki ozetten farkli:
      * TAKIP ETTIKLERIN ustte, ayri bir bolumde. Bir incelemeyi kimin
        yazdigi, kac respect aldigindan once gelir.
      * Varsayilan sira EN COK RESPECT — yeni degil. §6.1: "Replies sort by
        most respected, not newest." Ayni ilke inceleme listesinde de gecerli.
    """
    order = {
        "respected": "respect DESC, e.id DESC",
        "newest": "e.id DESC",
        "lowest": "e.rating ASC, e.id DESC",
    }.get(sort, "respect DESC, e.id DESC")

    with get_conn() as conn:
        uid = int(user["sub"]) if user else (None if IS_PROD else _demo_user_id(conn))
        limit = max(1, min(100, limit))
        offset = max(0, offset)
        # 7h "Following" sekmesi: yalniz takip ettiklerinin incelemeleri.
        only_followed = ("""AND EXISTS(SELECT 1 FROM rankit_follows f WHERE f.user_id=:viewer
                            AND f.target_type='user' AND f.target_id=e.user_id)""" if scope == "following" else "")
        total = conn.execute(f"""SELECT COUNT(*) n FROM rankit_diary_entries e
            JOIN users u ON u.id=e.user_id
            WHERE e.match_id=:match AND e.visibility='public' AND e.review<>'' AND u.is_banned=0 {only_followed}""",
            {"match": match_id, "viewer": uid or -1}).fetchone()["n"]
        rows = conn.execute(f"""
            SELECT e.id, e.user_id, e.rating, e.review, e.classic, e.spoiler,
                   e.created_at, e.rated_at, e.is_rewatch, m.starts_at, u.username, {NIGHT_AWARD_SQL},
                   (SELECT COUNT(*) FROM rankit_review_likes l WHERE l.entry_id=e.id) respect,
                   (SELECT COUNT(*) FROM rankit_review_comments c JOIN users cu ON cu.id=c.user_id
                    WHERE c.entry_id=e.id AND cu.is_banned=0) replies,
                   EXISTS(SELECT 1 FROM rankit_review_likes l WHERE l.entry_id=e.id AND l.user_id=?) respected,
                   EXISTS(SELECT 1 FROM rankit_follows f
                          WHERE f.user_id=? AND f.target_type='user' AND f.target_id=e.user_id) followed
            FROM rankit_diary_entries e
            JOIN users u ON u.id=e.user_id
            JOIN rankit_matches m ON m.id=e.match_id
            WHERE e.match_id=? AND e.visibility='public' AND e.review<>'' AND u.is_banned=0
              {only_followed.replace(":viewer", str(int(uid or -1)))}
            ORDER BY followed DESC, {order} LIMIT ? OFFSET ?""", (uid or -1, uid or -1, match_id, limit, offset)).fetchall()

        followed, everyone = [], []
        for row in rows:
            item = dict(row)
            # §7.1'in "gecesinde puanladi" isareti incelemede de gorunur:
            # 5c'de "@deniz - on the night - 2h" diye geciyor.
            item["on_the_night"] = _on_the_night(row, tz_offset)
            item["is_mine"] = bool(uid and int(row["user_id"]) == uid)
            for key in ("starts_at", "rated_at", "is_rewatch", "night_award"):
                item.pop(key, None)
            (followed if row["followed"] else everyone).append(item)

        next_offset = offset + len(rows)
        # 7h sol sutun: "WHAT PEOPLE SAID MOST" (ilk uc etiket) ve "RATING
        # SPREAD" (kullanici basina son puan, yildiza yuvarlanmis 1-5). Dagilim
        # bir isi degeri gibi okunur: 20 puan altinda yok (§5.5), sayac kalir.
        top_tags = [dict(r) for r in conn.execute(
            """SELECT t.tag, COUNT(*) count FROM rankit_entry_tags t
               JOIN rankit_diary_entries e ON e.id=t.entry_id JOIN users u ON u.id=e.user_id
               WHERE e.match_id=? AND u.is_banned=0 GROUP BY t.tag ORDER BY count DESC, t.tag LIMIT 3""", (match_id,))]
        ratings = [r[0] for r in conn.execute(
            """SELECT rating FROM rankit_diary_entries WHERE id IN (
                   SELECT MAX(id) FROM rankit_diary_entries WHERE match_id=? AND rating IS NOT NULL GROUP BY user_id)""",
            (match_id,))]
        spread = None
        if len(ratings) >= rankit_rank.MIN_COMMUNITY_RATINGS:
            spread = {str(star): 0 for star in range(1, 6)}
            for value in ratings:
                spread[str(min(5, max(1, int(-(-float(value) // 1)))))] += 1
        return {"total": total, "sort": sort, "scope": scope, "offset": offset,
                "next_offset": next_offset if next_offset < total else None,
                "followed": followed, "everyone": everyone,
                "top_tags": top_tags, "spread": spread, "rating_count": len(ratings),
                "community_rating": round(sum(ratings) / len(ratings), 1)
                                    if len(ratings) >= rankit_rank.MIN_COMMUNITY_RATINGS else None}


@router.get("/activity")
def rankit_activity(scope: Literal["following", "mutuals"] = "following",
                    limit: int = Query(30, ge=1, le=60), offset: int = Query(0, ge=0),
                    tz_offset: int = Query(0, ge=-840, le=840), user=Depends(get_optional_user)):
    """7a "FROM PEOPLE YOU FOLLOW", 11d "Everyone you follow / Mutuals only",
    2q arkadas akisi. /home akisi HERKESIN son incelemeleri; bu, takip
    ettiklerinin puanlari ve incelemeleri + kapattiklari koleksiyonlar.

    Gorunurluk: herkese acik ve (takip ettigin icin) takipcilere acik
    kayitlar; gizli kayit yok. Banli hesap yok. Spoiler isaretli metin, maci
    henuz puanlamadiysan tasinmaz (/home akisiyla ayni kural). Skor kartta
    oldugu gibi gelir; spoiler kalkani istemcide `viewer_rated` ile.
    """
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        people = """SELECT f.target_id FROM rankit_follows f JOIN users u ON u.id=f.target_id
            WHERE f.user_id=:uid AND f.target_type='user' AND u.is_banned=0 AND u.id<>:uid"""
        if scope == "mutuals":
            people += """ AND EXISTS(SELECT 1 FROM rankit_follows b WHERE b.user_id=f.target_id
                          AND b.target_type='user' AND b.target_id=:uid)"""
        want = offset + limit + 1
        params = {"uid": uid, "want": want}
        entries = conn.execute(f"""
            SELECT e.id, e.user_id, u.username, e.match_id, e.rating, e.classic, e.review, e.spoiler,
                   e.is_rewatch, e.rated_at, e.created_at, m.starts_at, m.status,
                   m.home_score, m.away_score, {NIGHT_AWARD_SQL},
                   COALESCE(e.rated_at, e.created_at) at, e.skin, m.sport, m.stage, co.name competition,
                   h.name home_name, h.short_name home_short, a.name away_name, a.short_name away_short,
                   h.color home_color, a.color away_color,
                   COALESCE((SELECT logo_url FROM rankit_team_logos WHERE team_id=h.id),h.crest_url) home_crest,
                   COALESCE((SELECT logo_url FROM rankit_team_logos WHERE team_id=a.id),a.crest_url) away_crest,
                   EXISTS(SELECT 1 FROM rankit_diary_entries v WHERE v.user_id=:uid
                          AND v.match_id=e.match_id AND v.rating IS NOT NULL) viewer_rated,
                   (SELECT COUNT(*) FROM rankit_review_likes l WHERE l.entry_id=e.id) respect,
                   EXISTS(SELECT 1 FROM rankit_review_likes l WHERE l.entry_id=e.id AND l.user_id=:uid) respected,
                   (SELECT COUNT(*) FROM rankit_review_comments c JOIN users cu ON cu.id=c.user_id
                    WHERE c.entry_id=e.id AND cu.is_banned=0) replies
            FROM rankit_diary_entries e JOIN users u ON u.id=e.user_id
            JOIN rankit_matches m ON m.id=e.match_id JOIN rankit_competitions co ON co.id=m.competition_id
            JOIN rankit_teams h ON h.id=m.home_team_id JOIN rankit_teams a ON a.id=m.away_team_id
            WHERE e.user_id IN ({people}) AND e.visibility IN ('public','followers')
              AND (e.rating IS NOT NULL OR e.review<>'')
            ORDER BY at DESC, e.id DESC LIMIT :want""", params).fetchall()
        # 2q: kayit bir koleksiyon karti olarak cizilir (akis bir raf). Kartin
        # isisi TOPLULUGUN -- kart kurali, §5.5 20 puanin altinda yok.
        ids = sorted({int(r["match_id"]) for r in entries})
        heats = {}
        if ids:
            marks = ",".join("?" * len(ids))
            heats = {h["match_id"]: (h["avg"], int(h["n"])) for h in conn.execute(
                f"""SELECT e.match_id, AVG(e.rating) avg, COUNT(*) n FROM rankit_diary_entries e
                    WHERE e.id IN (SELECT MAX(id) FROM rankit_diary_entries
                                   WHERE rating IS NOT NULL AND match_id IN ({marks}) GROUP BY user_id, match_id)
                    GROUP BY e.match_id""", ids).fetchall()}
        items = []
        for r in entries:
            row = _mask_spoiler_text(dict(r), uid)
            avg, n = heats.get(int(r["match_id"]), (None, 0))
            items.append({
                "kind": "entry", "id": f"e{r['id']}", "at": r["at"], "entry_id": r["id"],
                "user": {"id": r["user_id"], "username": r["username"]},
                "match": {"id": r["match_id"], "status": r["status"], "starts_at": r["starts_at"],
                          "sport": r["sport"], "stage": r["stage"], "competition": r["competition"],
                          "home_name": r["home_name"], "home_short": r["home_short"],
                          "away_name": r["away_name"], "away_short": r["away_short"],
                          "home_color": r["home_color"], "away_color": r["away_color"],
                          "home_crest": r["home_crest"], "away_crest": r["away_crest"],
                          "home_score": r["home_score"], "away_score": r["away_score"],
                          "rating_count": n,
                          "community_rating": round(float(avg), 1)
                          if avg is not None and n >= rankit_rank.MIN_COMMUNITY_RATINGS else None},
                "skin": r["skin"] or "default",
                "rating": r["rating"], "classic": bool(r["classic"]),
                "review": row["review"], "spoiler": row["spoiler"], "review_withheld": row["review_withheld"],
                # 11d: akıştaki respect düğmesi kendi durumunu bilsin (web ReviewArticle).
                "respect": r["respect"], "respected": bool(r["respected"]), "replies": r["replies"],
                "on_the_night": _on_the_night(r, tz_offset), "viewer_rated": bool(r["viewer_rated"]),
            })
        for r in conn.execute(f"""
            SELECT cc.user_id, u.username, cc.collection_id, cc.completed_at at
            FROM rankit_collection_completions cc JOIN users u ON u.id=cc.user_id
            WHERE cc.user_id IN ({people}) ORDER BY cc.completed_at DESC LIMIT :want""", params).fetchall():
            col = rankit_hunt.get(conn, r["collection_id"])
            if not col or (col["kind"] == "curated" and not col["active"]):
                continue
            summary = rankit_hunt.summarize(conn, col, int(r["user_id"]))
            items.append({"kind": "collection", "id": f"c{r['user_id']}-{r['collection_id']}", "at": r["at"],
                          "user": {"id": r["user_id"], "username": r["username"]},
                          "collection": {k: summary[k] for k in ("id", "kind", "title", "subtitle",
                                                                  "season", "collected", "total")}})
        items.sort(key=lambda item: (item["at"] or ""), reverse=True)
        page = items[offset:offset + limit]
        return {"scope": scope, "items": page, "offset": offset,
                "has_more": len(items) > offset + limit}


@router.get("/quick-rate")
def rankit_quick_rate(tz_offset: int = 0, user=Depends(get_optional_user)):
    """Ekran 3j — altin elmasin actigi sey.

    Genel bir arama DEGIL. Uc bolum: bu gecenin puanlanmamis maclari,
    "seriyi ayakta tutar" isaretiyle; sonra son yedi gunun yakalanmamislari.
    Sira §7.2'ye dayaniyor: bir gece ancak O GUN oynanan bir maci o gun
    puanlarsan sayilir, yani "bu gece" ile "yakalama" ayri seyler.
    """
    if not -840 <= tz_offset <= 840:
        raise HTTPException(422, "Invalid timezone offset")
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        today = rankit_rank.rankit_day(now, tz_offset)

        # "Puanlanmamis" = PUANLI kaydi yok. Yildizsiz izleme kaydi puan
        # degil (§12.1): eskiden herhangi bir kayit maci listeden dusuruyordu,
        # gece yildizsiz kaydedilen mac bu gece puanlanip seriyi tutamiyordu.
        rows = conn.execute(MATCH_SELECT + """
            WHERE m.status='finished'
              AND datetime(m.starts_at) >= datetime('now','-7 days')
              AND NOT EXISTS (SELECT 1 FROM rankit_diary_entries e
                              WHERE e.user_id=? AND e.match_id=m.id AND e.rating IS NOT NULL)
            ORDER BY m.starts_at DESC LIMIT 120""", (uid,)).fetchall()

        tonight, catchup = [], []
        for row in rows:
            card = _match_dict(conn, row, uid)
            played = rankit_rank.rankit_day(
                rankit_rank._as_dt(row["starts_at"]) or now, tz_offset)
            if played == today:
                # Bu gece oynandi ve puanlanmadi: puanlamak seriyi ayakta tutar.
                card["keeps_streak"] = True
                tonight.append(card)
            else:
                catchup.append(card)

        streak = rankit_rank.streak_for(conn, uid, tz_offset)
        return {
            "tonight": tonight,
            "catchup": catchup[:40],
            "catchup_total": len(catchup),
            "streak": streak["current"],
            # Bu gece puanlanacak mac yoksa seri risk altinda DEGIL —
            # §7.2'nin dinlenme gecesi kurali. Bu gece zaten gecesinde bir mac
            # puanladiysan da degil: gece sayildi, kalan maclar seriyi uzatmaz.
            "tonight_counted": streak["tonight_counted"],
            "at_risk": bool(tonight) and streak["current"] > 0 and not streak["tonight_counted"],
        }


@router.get("/rank")
def rankit_rank_view(user=Depends(get_optional_user), tz_offset: int = 0):
    """Kademe, puan ve seri. §7.3 ikisini AYRI tutuyor — ayni bilesende yan
    yana gosterilirlerse tek bir skor gibi okunuyorlar."""
    if not -840 <= tz_offset <= 840:
        raise HTTPException(422, "Invalid timezone offset")
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        points = rankit_rank.total_points(conn, uid)
        # 2p kutulari son 50 hareketten degil TUM hesap defterinden gelir.
        totals = {r["kind"]: dict(r) for r in conn.execute(
            """SELECT kind, COUNT(*) count, SUM(points) points
               FROM rankit_points WHERE user_id=? GROUP BY kind""", (uid,))}
        breakdown = []
        # rate_late da dokumde: 2p kutulari tahtadaki dort tur, ama defterin
        # tamami hesaplanmali -- dokum toplamla tutmazsa "2,840" nereden geldi
        # sorusu cevapsiz kalir. Kutularin disindaki tur arayuzde gorunmez.
        respect_each = rankit_rank.points_for(conn, "respect", uid)[0]
        for kind in ("rate_same_day", "rate_late", "respect", "companion", "season"):
            count = totals.get(kind, {}).get("count", 0)
            points_kind = totals.get(kind, {}).get("points", 0) or 0
            # "412 Likes on reviews x2 each": respect defteri inceleme basina
            # TEK satir, yani satir sayisi respect sayisi degil -- puan / birim.
            if kind == "respect":
                count = points_kind // respect_each if respect_each else 0
            breakdown.append({"kind": kind, "count": count, "points": points_kind})
        identity = conn.execute("SELECT username FROM users WHERE id=?", (uid,)).fetchone()
        return {
            "username": identity["username"],
            "matches": conn.execute("SELECT COUNT(DISTINCT match_id) FROM rankit_diary_entries WHERE user_id=?", (uid,)).fetchone()[0],
            "breakdown": breakdown,
            "rank": rankit_rank.tier_for(points),
            "streak": rankit_rank.streak_for(conn, uid, tz_offset),
            "ledger": [dict(r) for r in conn.execute(
                """SELECT kind,points,subject_type,subject_id,created_at
                   FROM rankit_points WHERE user_id=? ORDER BY id DESC LIMIT 50""", (uid,))],
        }


@router.post("/matches/{match_id}/presence")
def rankit_presence(match_id: int, body: PresenceIn, user=Depends(get_optional_user)):
    """Companion'da oturma suresini biriktirir ve esik gecilince oder.

    Sahibin kurali: futbolda 45 dakika, baskette iki ceyrek. Bu §7.1'in en
    yuksek tek odulu (20 puan) ve "maç sirasinda orada olmak taklit edilmesi
    en zor sey" gerekcesiyle veriliyor — o yuzden esik gercek sureye bakiyor,
    odaya girip cikmaya degil.
    """
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        row = conn.execute("SELECT sport,status FROM rankit_matches WHERE id=?", (match_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Match not found")
        # Eklenen sure DURUSTLESTIRILIR: yalnizca mac CANLIYKEN ve son
        # rapordan bu yana GECEN gercek sureyi asmadan. Eskiden istemcinin
        # sayisi aynen ekleniyordu: tek istekte 1800 sn, bitmis macta bile.
        prev = conn.execute("""SELECT updated_at FROM rankit_companion_presence
            WHERE user_id=? AND match_id=?""", (uid, match_id)).fetchone()
        added = 0
        if row["status"] == "live":
            cap = PRESENCE_FIRST_REPORT_SECONDS
            last = rankit_rank._as_dt(prev["updated_at"]) if prev else None
            if last is not None:
                cap = (datetime.now(timezone.utc).replace(tzinfo=None) - last).total_seconds() + 5
            added = int(max(0, min(body.seconds, cap)))
        conn.execute(
            """INSERT INTO rankit_companion_presence(user_id,match_id,seconds,updated_at)
               VALUES(?,?,?,datetime('now'))
               ON CONFLICT(user_id,match_id) DO UPDATE SET
                 seconds=seconds+excluded.seconds, updated_at=datetime('now')""",
            (uid, match_id, added))
        gained = _maybe_award_companion(conn, uid, match_id, row["sport"])
        total = conn.execute("SELECT seconds FROM rankit_companion_presence WHERE user_id=? AND match_id=?",
                             (uid, match_id)).fetchone()
        need = rankit_rank.PRESENCE_SECONDS.get(row["sport"], rankit_rank.PRESENCE_DEFAULT)
        return {"seconds": total["seconds"], "required": need, "counted": added,
                "qualified": total["seconds"] >= need, "points_awarded": gained}


@router.get("/profile")
def rankit_profile(user=Depends(get_optional_user)):
    with get_conn() as conn:
        uid = _actor_id(user, conn)
        u = conn.execute("SELECT id,username,created_at FROM users WHERE id=?", (uid,)).fetchone()
        # 6b "Counts come from actual account data": Classic sayisi MAC basina
        # (yeniden izleme ayni maci iki kez saydirmaz) ve yalniz puanli kayittan
        # (Classic bir hukum, §3); ortalama mac basina SON puan -- topluluk
        # puani ve zevk ortakligiyla ayni kural.
        stats = conn.execute("""SELECT COUNT(*) diary_count,COUNT(DISTINCT match_id) matches,
            COUNT(DISTINCT CASE WHEN classic=1 AND rating IS NOT NULL THEN match_id END) classics,
            (SELECT AVG(v.rating) FROM rankit_diary_entries v WHERE v.id IN (
                SELECT MAX(id) FROM rankit_diary_entries
                WHERE user_id=? AND rating IS NOT NULL GROUP BY match_id)) avg_rating
            FROM rankit_diary_entries WHERE user_id=?""", (uid, uid)).fetchone()
        extra = {
            "following": conn.execute("SELECT COUNT(*) n FROM rankit_follows WHERE user_id=?", (uid,)).fetchone()["n"],
            # 6b: insan iliskileri kaynak/kulup takiplerinden AYRI sayilir.
            "following_people": conn.execute("""SELECT COUNT(*) n FROM rankit_follows f JOIN users u ON u.id=f.target_id
                WHERE f.user_id=? AND f.target_type='user' AND u.is_banned=0 AND u.id<>?""", (uid, uid)).fetchone()["n"],
            "followers": conn.execute("""SELECT COUNT(*) n FROM rankit_follows f JOIN users u ON u.id=f.user_id
                WHERE f.target_id=? AND f.target_type='user' AND u.is_banned=0 AND u.id<>?""", (uid, uid)).fetchone()["n"],
            "reviews": conn.execute("SELECT COUNT(*) n FROM rankit_diary_entries WHERE user_id=? AND LENGTH(TRIM(COALESCE(review,'')))>0", (uid,)).fetchone()["n"],
            # 3g "Competitions & clubs - 6 followed". Yukaridaki sayi KISILERI
            # ve listeleri de iceriyor; o satira verilseydi takip ettigin
            # insanlari "kulup" diye sayardi.
            # Turnuvalar AILE olarak sayiliyor (sezondan bagimsiz), kulupler tek tek.
            "following_sources": _followed_sources(conn, uid),
            "favorites": conn.execute("SELECT COUNT(*) n FROM rankit_favorites WHERE user_id=?", (uid,)).fetchone()["n"],
            "watchlist": conn.execute("SELECT COUNT(*) n FROM rankit_watchlist WHERE user_id=?", (uid,)).fetchone()["n"],
            "lists": conn.execute("SELECT COUNT(*) n FROM rankit_lists WHERE user_id=?", (uid,)).fetchone()["n"],
        }
        favorite_rows = conn.execute(MATCH_SELECT + """ JOIN rankit_favorites f ON f.target_id=m.id
            WHERE f.user_id=? AND f.target_type='match' ORDER BY f.created_at DESC LIMIT 4""", (uid,)).fetchall()
        # /lists herkese acik kesiftir; profil sahibinin gizli listeleri de burada.
        owned_lists = conn.execute("""SELECT l.id,l.title,l.visibility,l.ranked,
            (SELECT COUNT(*) FROM rankit_list_items i WHERE i.list_id=l.id) match_count
            FROM rankit_lists l WHERE l.user_id=? ORDER BY l.updated_at DESC,l.id DESC""", (uid,)).fetchall()
        return {"user": dict(u), "stats": {**dict(stats), **extra}, "owned_lists": [dict(row) for row in owned_lists],
                "favorite_matches": [_match_dict(conn, row, uid) for row in favorite_rows]}
