"""RankIt canlı skorlarının hafif, kendi kendini sınırlayan güncelleyicisi.

Tam katalog/kadro senkronu değildir. Yalnızca yakın zamanda başlayan veya
başlayacak maçların saat, durum ve skorunu sağlayıcıdan günceller. SQLite
claim kaydı birden fazla worker'ın aynı işi eşzamanlı çalıştırmasını önler.
"""
from __future__ import annotations

import os
import threading
import time

from .db import get_conn


FOTMOB_LEAGUES = {
    "Premier League": [(47, "league")], "La Liga": [(87, "league")],
    "Serie A": [(55, "league")], "Bundesliga": [(54, "league")],
    "Ligue 1": [(53, "league")], "FA Cup": [(132, "cup")],
    "Copa del Rey": [(138, "cup")], "Coppa Italia": [(141, "cup")],
    "DFB-Pokal": [(209, "cup")], "Coupe de France": [(134, "cup")],
    "UEFA Champions League": [(42, "uefa"), (10611, "qualifying")],
    "UEFA Europa League": [(73, "uefa"), (10613, "qualifying")],
    "UEFA Conference League": [(10216, "uefa"), (10615, "qualifying")],
}
JOB_NAME = "rankit_live_scores"

# FotMob canli dakikayi yon isaretleriyle veriyor ("73" + U+200E + U+2019 +
# U+200E). Gorunmez isaretler ekran okuyucunun okudugu metne ve kopyalanan
# metne sizar, tipografik tirnak da "73 right single quotation mark" diye
# okunur. Dakika "73'", "45+2'", "HT" bicimine indirgenir.
_BIDI_MARKS = dict.fromkeys(map(ord, "\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069"))
_PRIMES = str.maketrans({"\u2019": "'", "\u2018": "'", "\u2032": "'", "\u02bc": "'"})


def clean_minute(value) -> str | None:
    if value is None:
        return None
    text = str(value).translate(_BIDI_MARKS).translate(_PRIMES)
    text = "".join(text.split())
    return text or None


def _claim() -> bool:
    with get_conn() as conn:
        cur = conn.execute("""INSERT INTO rankit_sync_state(job_name,last_attempt)
            VALUES(?,datetime('now'))
            ON CONFLICT(job_name) DO UPDATE SET last_attempt=datetime('now')
            WHERE last_attempt IS NULL OR last_attempt < datetime('now','-15 minutes')""", (JOB_NAME,))
        return cur.rowcount > 0


def _active_scopes() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("""SELECT DISTINCT m.provider,c.name competition,m.season
            FROM rankit_matches m JOIN rankit_competitions c ON c.id=m.competition_id
            WHERE m.provider IS NOT NULL AND m.status IN ('upcoming','live')
              AND datetime(m.starts_at) BETWEEN datetime('now','-2 days') AND datetime('now','+8 hours')""").fetchall()
        return [dict(row) for row in rows]


def _parse_score(value) -> tuple[int | None, int | None]:
    parts = str(value or "").replace("–", "-").split("-")
    if len(parts) != 2:
        return None, None
    left, right = parts[0].strip(), parts[1].strip()
    return (int(left), int(right)) if left.isdigit() and right.isdigit() else (None, None)


def _stage(item: dict, mode: str) -> str:
    code = str(item.get("round") or "")
    name = str(item.get("roundName") or "")
    if mode == "qualifying":
        return {"1": "First qualifying round", "2": "Second qualifying round",
                "3": "Third qualifying round", "final": "Play-off round"}.get(code, name or "Qualifying")
    if mode == "cup":
        return name or {"1/8": "Round of 16", "1/4": "Quarter-finals",
                        "1/2": "Semi-finals", "final": "Final"}.get(code, "Cup tie")
    if mode == "league":
        return f"Matchday {code}" if code.isdigit() else name
    return {"playoff": "Knockout phase play-offs", "1/8": "Round of 16",
            "1/4": "Quarter-finals", "1/2": "Semi-finals", "final": "Final"}.get(
                code, f"League phase · Matchday {code}" if code.isdigit() else name)


def _refresh_fotmob(competition: str, season: str) -> int:
    from curl_cffi import requests

    sources = FOTMOB_LEAGUES.get(competition)
    if not sources:
        return 0
    start = str(season).split("-")[0]
    updated = 0
    for league_id, mode in sources:
        response = requests.get(
            "https://www.fotmob.com/api/data/leagues",
            params={"id": league_id, "season": f"{start}/{int(start) + 1}"},
            impersonate="chrome124", timeout=25,
        )
        response.raise_for_status()
        fixtures = ((response.json().get("fixtures") or {}).get("allMatches") or [])
        with get_conn() as conn:
            for item in fixtures:
                status_data = item.get("status") or {}
                status = "finished" if status_data.get("finished") else "live" if status_data.get("started") else "upcoming"
                home_score, away_score = _parse_score(status_data.get("scoreStr"))
                stage = _stage(item, mode)
                cur = conn.execute("""UPDATE rankit_matches SET starts_at=?,status=?,home_score=?,away_score=?,stage=?
                    WHERE provider='fotmob' AND provider_match_id=?
                      AND (starts_at<>? OR status<>? OR COALESCE(home_score,-1)<>COALESCE(?,-1)
                           OR COALESCE(away_score,-1)<>COALESCE(?,-1) OR COALESCE(stage,'')<>?)""",
                    (status_data.get("utcTime") or "", status, home_score, away_score, stage, str(item.get("id")),
                     status_data.get("utcTime") or "", status, home_score, away_score, stage))
                updated += max(0, cur.rowcount)
    return updated


def _refresh_euroleague(season: str) -> int:
    from curl_cffi import requests

    start = str(season).split("-")[0]
    response = requests.get(
        f"https://api-live.euroleague.net/v2/competitions/E/seasons/E{start}/games",
        headers={"User-Agent": "PrimaryArch-RankIt/0.4"}, timeout=25,
    )
    response.raise_for_status()
    updated = 0
    with get_conn() as conn:
        for item in (response.json() or {}).get("data") or []:
            game_status = str(item.get("gameStatus") or "").lower()
            played = bool(item.get("played"))
            status = "finished" if played else "live" if game_status in {"live", "playing", "in progress", "started"} else "upcoming"
            home, away = item.get("local") or {}, item.get("road") or {}
            phase = str((item.get("phaseType") or {}).get("name") or "").strip().title()
            group = str((item.get("group") or {}).get("rawName") or "").strip().title()
            round_name = str(item.get("roundName") or "").strip()
            stage = round_name if phase == "Regular Season" else " · ".join(p for p in (phase, group) if p) or round_name
            home_score = int(home.get("score") or 0) if played or status == "live" else None
            away_score = int(away.get("score") or 0) if played or status == "live" else None
            external_id = str(item.get("identifier") or item.get("id"))
            starts_at = str(item.get("utcDate") or item.get("date") or "")
            cur = conn.execute("""UPDATE rankit_matches SET starts_at=?,status=?,home_score=?,away_score=?,stage=?
                WHERE provider='euroleague' AND provider_match_id=?
                  AND (starts_at<>? OR status<>? OR COALESCE(home_score,-1)<>COALESCE(?,-1)
                       OR COALESCE(away_score,-1)<>COALESCE(?,-1) OR COALESCE(stage,'')<>?)""",
                (starts_at, status, home_score, away_score, stage, external_id,
                 starts_at, status, home_score, away_score, stage))
            updated += max(0, cur.rowcount)
    return updated


def _refresh_nba(season: str) -> int:
    from nba_api.stats.endpoints import ScheduleLeagueV2

    frame = ScheduleLeagueV2(season=season, timeout=45).get_data_frames()[0]
    if frame.empty:
        return 0
    frame = frame[frame["gameLabel"].fillna("").str.lower() != "preseason"]
    updated = 0
    with get_conn() as conn:
        for row in frame.itertuples(index=False):
            game_id = str(getattr(row, "gameId"))
            game_status = int(getattr(row, "gameStatus"))
            status = "finished" if game_status == 3 else "live" if game_status == 2 else "upcoming"
            home_raw, away_raw = getattr(row, "homeTeam_score", None), getattr(row, "awayTeam_score", None)
            home_score = int(home_raw) if str(home_raw).isdigit() else None
            away_score = int(away_raw) if str(away_raw).isdigit() else None
            starts_at = str(getattr(row, "gameDateTimeUTC"))
            cur = conn.execute("""UPDATE rankit_matches SET starts_at=?,status=?,home_score=?,away_score=?
                WHERE provider='nba' AND provider_match_id=?
                  AND (starts_at<>? OR status<>? OR COALESCE(home_score,-1)<>COALESCE(?,-1)
                       OR COALESCE(away_score,-1)<>COALESCE(?,-1))""",
                (starts_at, status, home_score, away_score, game_id,
                 starts_at, status, home_score, away_score))
            updated += max(0, cur.rowcount)
    return updated


# Kadro maç saatine kadar değişir, o yüzden pencere iki yönlü: başlamamış
# maçlarda her turda yeniden sorulur, bitmiş maçta bir kez alınıp bırakılır.
LINEUP_LOOKAHEAD_HOURS = 3
LINEUP_LOOKBACK_HOURS = 4
LINEUP_BATCH = 30
# Onarim penceresi: kadro toplama 2026-09-05'te basladi; bu pencere hepsini
# kapsiyor. Saglayicinin kalici olarak kadrosuz dondurdugu bir mac sonsuza
# dek her turda sorulmasin diye sinirli.
LINEUP_REPAIR_DAYS = 45


def _lineup_targets(conn):
    targets = conn.execute(
        f"""SELECT m.id, m.provider_match_id, m.home_team_id, m.away_team_id
            FROM rankit_matches m
            WHERE m.provider='fotmob' AND m.provider_match_id IS NOT NULL
              AND datetime(m.starts_at) BETWEEN
                  datetime('now','-{LINEUP_LOOKBACK_HOURS} hours') AND
                  datetime('now','+{LINEUP_LOOKAHEAD_HOURS} hours')
              -- Bitmiş maçta kadro bir daha değişmez: bir kez alındıysa
              -- sağlayıcıyı boşuna yorma.
              AND NOT (m.status='finished'
                       AND EXISTS(SELECT 1 FROM rankit_match_lineups l
                                  WHERE l.match_id=m.id))
            ORDER BY m.starts_at
            LIMIT {LINEUP_BATCH}"""
    ).fetchall()
    # Onarim: 80b6fa0 oncesi kod kadroyu oyuncu kimligi (player_id) ve
    # oyuna giris dakikasi olmadan yaziyordu. Yukaridaki kosul bitmis maci
    # bir daha sormadigi icin o maclarda POTM / respect secicisi bos
    # kaliyordu (secici yalniz kimligi olan oynayanlari listeler, §10.2).
    # Yeni kod her satiri bagliyor; bagsiz satir = eski yazim = yeniden cek.
    # Pencerenin artan yerini doldurur, canli / yaklasan maclardan calmaz.
    room = LINEUP_BATCH - len(targets)
    if room > 0:
        targets += conn.execute(
            f"""SELECT m.id, m.provider_match_id, m.home_team_id, m.away_team_id
                FROM rankit_matches m
                WHERE m.provider='fotmob' AND m.provider_match_id IS NOT NULL
                  AND m.status='finished'
                  AND datetime(m.starts_at) >= datetime('now','-{LINEUP_REPAIR_DAYS} days')
                  AND EXISTS(SELECT 1 FROM rankit_match_lineup_players p
                             WHERE p.match_id=m.id AND p.player_id IS NULL)
                ORDER BY m.starts_at DESC
                LIMIT ?""", (room,)
        ).fetchall()
    return targets


FOTMOB_PLAYER_IMAGE = "https://images.fotmob.com/image_resources/playerimages/{}.png"


def _lineup_player_id(conn, team_id: int, person: dict):
    """Kadrodaki oyuncuyu rankit_players'a bagla -- POTM ve respect oyu ancak
    boyle verilebilir (BUILD §10.2: secici maçta oynayanlari listeler).

    Anahtar (sport, name): katalog senkronu da (rankit_sync._player) boyle
    eslestiriyor; ayni adli iki oyuncu tek satira duser (bilinen sinir).
    Gorsel yalnizca bossa doldurulur: FotMob'un kendi oyuncu gorseli (§2.9
    POTM varyanti gorsel istiyor).
    """
    name = (person.get("name") or "").strip()
    if not name:
        return None
    provider_id = person.get("id")
    image = FOTMOB_PLAYER_IMAGE.format(provider_id) if provider_id else None
    conn.execute(
        """INSERT INTO rankit_players(sport,team_id,name,shirt_no,image_url)
           VALUES('Football',?,?,?,?)
           ON CONFLICT(sport,name) DO UPDATE SET team_id=excluded.team_id,
             shirt_no=COALESCE(excluded.shirt_no, rankit_players.shirt_no),
             image_url=COALESCE(rankit_players.image_url, excluded.image_url)""",
        (team_id, name, person.get("shirtNumber"), image))
    return conn.execute("SELECT id FROM rankit_players WHERE sport='Football' AND name=?",
                        (name,)).fetchone()["id"]


def _substitution_minutes(person: dict):
    """(oyuna girdigi dakika, ciktigi dakika) -- performance.substitutionEvents."""
    sub_in = sub_out = None
    for event in ((person.get("performance") or {}).get("substitutionEvents") or []):
        minute = event.get("time")
        if not isinstance(minute, (int, float)):
            continue
        if event.get("type") == "subIn" and sub_in is None:
            sub_in = int(minute)
        elif event.get("type") == "subOut" and sub_out is None:
            sub_out = int(minute)
    return sub_in, sub_out


def _swap_map(events: list) -> dict:
    """Giren oyuncunun saglayici kimligi -> yerine girdigi oyuncunun adi.
    Kaynak maç olaylari: "Substitution" olayinin `swap` = [giren, cikan]."""
    swaps = {}
    for event in events or []:
        if str(event.get("type") or "").lower() != "substitution":
            continue
        pair = event.get("swap") or []
        if len(pair) == 2 and (pair[0] or {}).get("id") and (pair[1] or {}).get("name"):
            swaps[str(pair[0]["id"])] = pair[1]["name"]
    return swaps


def _store_lineup(conn, match_id: int, team_id: int, side: str, block: dict, swaps=None) -> None:
    """Bir takımın 11'ini, yedeklerini, dizilişini ve teknik direktörünü yazar.

    Oyuncu basina: oy icin rankit_players kimligi, mevki (olculmus kaba etiket
    + FotMob'un ham kodu), oyuna giris/cikis dakikasi, kimin yerine girdigi.
    """
    starters = block.get("starters") or []
    subs = block.get("subs") or []
    if not starters:
        return
    conn.execute(
        """INSERT INTO rankit_match_lineups
             (match_id,team_id,side,formation,coach_name,confirmed_at)
           VALUES(?,?,?,?,?,datetime('now'))
           ON CONFLICT(match_id,team_id) DO UPDATE SET
             formation=excluded.formation, coach_name=excluded.coach_name,
             side=excluded.side, confirmed_at=datetime('now')""",
        (match_id, team_id, side, block.get("formation"),
         ((block.get("coach") or {}).get("name") or None)),
    )
    # Tam değiştir: kadro değiştiyse eski satırların kalması yanlış bilgi olur.
    conn.execute("DELETE FROM rankit_match_lineup_players WHERE match_id=? AND team_id=?",
                 (match_id, team_id))
    rows = [("start", i, p) for i, p in enumerate(starters)]
    rows += [("bench", i, p) for i, p in enumerate(subs)]
    values = []
    for role, order, p in rows:
        if not (p.get("name") or "").strip():
            continue
        sub_in, sub_out = _substitution_minutes(p)
        code = p.get("positionId")
        values.append((match_id, team_id, p.get("id"), p.get("name") or "",
                       p.get("shirtNumber"), role, order,
                       _lineup_player_id(conn, team_id, p),
                       _position_label([code]) if code is not None else None, code,
                       sub_in, sub_out, (swaps or {}).get(str(p.get("id")))))
    conn.executemany(
        """INSERT OR IGNORE INTO rankit_match_lineup_players
             (match_id,team_id,provider_player_id,name,shirt_no,role,ord,
              player_id,position,position_code,sub_in,sub_out,replaced)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""", values)


def _store_lineups_from(conn, target: dict, content: dict) -> int:
    """Bir matchDetails yanitindan iki takimin kadrosunu yazar; kac takim.
    Kadro dongusu (15 dk) ve canli olay dongusu (45 sn) ayni yolu kullanir."""
    lineup = (content or {}).get("lineup") if isinstance(content, dict) else None
    if not isinstance(lineup, dict):
        return 0
    events = (((content.get("matchFacts") or {}).get("events") or {}).get("events") or [])
    swaps = _swap_map(events)
    stored = 0
    for side, key, team_id in (("home", "homeTeam", target["home_team_id"]),
                               ("away", "awayTeam", target["away_team_id"])):
        block = lineup.get(key) or {}
        if not team_id or not block.get("starters"):
            continue
        _store_lineup(conn, target["id"], team_id, side, block, swaps)
        stored += 1
    return stored


def _store_moments(conn, match_id: int, events: list) -> None:
    """Gol ve kartlari ana cevirir (ekran 5b MOMENTS).

    UNIQUE(match_id,minute,kind,label) tekrar yazmayi engelliyor: is her 15
    dakikada bir kosuyor ve ayni golu bes kez eklemesi gerekmiyor.
    """
    rows = []
    for e in events:
        kind = str(e.get("type") or "").lower()
        who = e.get("nameStr") or (e.get("player") or {}).get("name") or ""
        minute = e.get("time")
        if minute is None or not who:
            continue
        if kind == "goal":
            k = "own_goal" if e.get("ownGoal") else "goal"
            label = f"{'Own goal' if e.get('ownGoal') else 'Goal'} - {who}"
        elif kind == "card":
            card = str(e.get("card") or "").lower()
            k = "card"
            label = f"{'Red card' if card == 'red' else 'Yellow card'} - {who}"
        else:
            continue
        side = "home" if e.get("isHome") is True else "away" if e.get("isHome") is False else None
        rows.append((match_id, int(minute), k, label, who, side))
    if rows:
        # Taraf sonradan eklendi: eski satir ayni olayla tekrar gelirse tarafi
        # tamamlanir, baska bir sey degismez.
        conn.executemany(
            """INSERT INTO rankit_moments(match_id,minute,kind,label,detail,side)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT(match_id,minute,kind,label) DO UPDATE SET
                 side=COALESCE(rankit_moments.side, excluded.side)""", rows)


def refresh_lineups() -> dict:
    """Doğrulanmış 11 + yedek + diziliş + teknik direktör.

    Sezon kadrosundan (rankit_match_players) AYRI tutuluyor: arayüz
    "bu gerçek 11 mi" sorusunu ancak ikisi ayrıysa dürüstçe cevaplayabilir.
    """
    from curl_cffi import requests

    with get_conn() as conn:
        targets = [dict(r) for r in _lineup_targets(conn)]
    if not targets:
        return {"checked": 0, "stored": 0}

    stored = 0
    for target in targets:
        try:
            response = requests.get(
                "https://www.fotmob.com/api/data/matchDetails",
                params={"matchId": target["provider_match_id"]},
                impersonate="chrome124", timeout=25,
            )
            if response.status_code != 200:
                continue
            content = response.json().get("content") or {}
        except Exception:
            continue
        # Anlar AYNI yanitta geliyor (matchFacts.events) — kadro icin zaten
        # yapilan cagriyi ikinci kez yapmiyoruz.
        try:
            events = (((response.json().get("content") or {})
                       .get("matchFacts") or {}).get("events") or {}).get("events") or []
        except Exception:
            events = []
        if events:
            with get_conn() as conn:
                _store_moments(conn, target["id"], events)

        with get_conn() as conn:
            stored += _store_lineups_from(conn, target, content)
        time.sleep(0.4)  # sağlayıcıya nazik ol
    return {"checked": len(targets), "stored": stored}


# ── Canli olaylar: AYRI ve HIZLI dongu ───────────────────────────────────────
# 15 dakikalik kadans olaylar icin cok yavas. 67'deki gol ekranda 15 dakika
# sonra gorunurse 5b'nin "18 new since the red card" satiri anlamsiz olur ve
# nabiz zaman cizelgesi olayla hizalanmaz.
#
# Ama ters uc de gercek: FotMob resmi API DEGIL (CLAUDE.md rate-limit uyarisi)
# ve yogun bir cumartesi ayni anda 77 mac canli olabiliyor. Hepsini dakikada
# bir yoklamak engellenmenin yolu.
#
# Cozum oncelik + sira: kisa aralik, kucuk parti, ve
#   (1) icinde INSAN OLAN maclar once  — gecikmenin hissedildigi tek yer
#   (2) sonra en eski yoklanan          — cok macta hicbiri ac kalmasin
# 77 canli mac, partide 12, 45 saniyede bir => tam tur ~4.5 dakika, ama
# izlenen maclar her turda tazeleniyor.
EVENTS_JOB = "rankit_live_events"
EVENTS_INTERVAL_SECONDS = 45
EVENTS_BATCH = 12


def _claim_events() -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            f"""INSERT INTO rankit_sync_state(job_name,last_attempt)
                VALUES(?,datetime('now'))
                ON CONFLICT(job_name) DO UPDATE SET last_attempt=datetime('now')
                WHERE last_attempt IS NULL
                   OR last_attempt < datetime('now','-{EVENTS_INTERVAL_SECONDS} seconds')""",
            (EVENTS_JOB,))
        return cur.rowcount > 0


def _live_targets(conn):
    return conn.execute(
        f"""SELECT m.id, m.provider_match_id, m.home_team_id, m.away_team_id,
                   (SELECT COUNT(*) FROM rankit_companion_presence p WHERE p.match_id=m.id)
                 + (SELECT COUNT(*) FROM rankit_watchlist w WHERE w.match_id=m.id) AS watchers
            FROM rankit_matches m
            WHERE m.provider='fotmob' AND m.provider_match_id IS NOT NULL
              AND m.status='live'
            ORDER BY watchers DESC,
                     COALESCE(m.events_polled_at,'') ASC
            LIMIT {EVENTS_BATCH}""").fetchall()


def refresh_live_events() -> dict:
    """Canli maclarin olaylarini, skorunu ve dakikasini tazeler.

    Yavas isten AYRI: o is kadro/fikstur icin 15 dakikada bir kosuyor, bu
    yalnizca CANLI maclara bakiyor ve hicbir mac canli degilse tek bir
    COUNT sorgusuyla geri donuyor — bos yere saglayiciya gitmiyor.
    """
    from curl_cffi import requests

    with get_conn() as conn:
        targets = [dict(r) for r in _live_targets(conn)]
    if not targets:
        return {"live": 0, "polled": 0, "moments": 0}

    polled = moments = 0
    for t in targets:
        try:
            response = requests.get(
                "https://www.fotmob.com/api/data/matchDetails",
                params={"matchId": t["provider_match_id"]},
                impersonate="chrome124", timeout=20)
            if response.status_code != 200:
                continue
            payload = response.json()
        except Exception:
            continue
        polled += 1

        content = payload.get("content") or {}
        events = ((content.get("matchFacts") or {}).get("events") or {}).get("events") or []
        status = (payload.get("header") or {}).get("status") or {}
        live_time = (status.get("liveTime") or {}).get("short")
        score = status.get("scoreStr")

        with get_conn() as conn:
            if events:
                before = conn.execute("SELECT COUNT(*) n FROM rankit_moments WHERE match_id=?",
                                      (t["id"],)).fetchone()["n"]
                _store_moments(conn, t["id"], events)
                moments += conn.execute("SELECT COUNT(*) n FROM rankit_moments WHERE match_id=?",
                                        (t["id"],)).fetchone()["n"] - before
            # Skor ve dakika ayni yanittan; ek istek yok.
            sets, args = ["events_polled_at=datetime('now')"], []
            if score and "-" in str(score):
                home, _, away = str(score).partition("-")
                sets += ["home_score=?", "away_score=?"]
                args += [home.strip(), away.strip()]
            if live_time:
                sets.append("live_minute=?")
                args.append(clean_minute(live_time))
            if status.get("finished"):
                sets.append("status='finished'")
            # Kadro da AYNI yanitta: 15d oyuna girenleri dakikasiyla gosteriyor.
            # 15 dakikalik kadro dongusu mac bitince durur ve son dakika
            # degisikliklerini kaciriyordu; bu dongu her 45 sn'de yeniler.
            _store_lineups_from(conn, t, content)
            conn.execute(f"UPDATE rankit_matches SET {','.join(sets)} WHERE id=?",
                         (*args, t["id"]))
        time.sleep(0.3)   # saglayiciya nazik ol
    return {"live": len(targets), "polled": polled, "moments": moments}


def _events_worker() -> None:
    time.sleep(18)
    while True:
        try:
            if _claim_events():
                out = refresh_live_events()
                if out["polled"]:
                    print(f"[rankit-events] {out}", flush=True)
        except Exception as exc:
            print(f"[rankit-events] failed: {exc}", flush=True)
        time.sleep(15)


def refresh_live_scores() -> dict:
    scopes = _active_scopes()
    updated = 0
    errors = []
    for scope in scopes:
        try:
            if scope["provider"] == "fotmob":
                updated += _refresh_fotmob(scope["competition"], scope["season"])
            elif scope["provider"] == "nba":
                updated += _refresh_nba(scope["season"])
            elif scope["provider"] == "euroleague":
                updated += _refresh_euroleague(scope["season"])
        except Exception as exc:
            errors.append(f"{scope['competition']} {scope['season']}: {exc}")
    # Kadrolar aynı 15 dakikalık turda: ayrı bir zamanlayıcı açmak yerine
    # zaten var olan claim'in içinde. Hatası skor güncellemesini düşürmemeli.
    try:
        lineups = refresh_lineups()
    except Exception as exc:
        lineups = {"error": str(exc)}
        errors.append(f"lineups: {exc}")
    # Sezon cetvelleri ayni thread'de ama KENDI claim'iyle: bir mac bitmeden
    # gol kralligi degismez, alti saat fazlasiyla taze.
    stats = None
    if _claim_stats():
        try:
            stats = refresh_player_stats()
        except Exception as exc:
            stats = {"error": str(exc)}
            errors.append(f"player-stats: {exc}")

    with get_conn() as conn:
        conn.execute("""UPDATE rankit_sync_state SET
            last_success=CASE WHEN ?='' THEN datetime('now') ELSE last_success END,
            last_error=?,updated_matches=? WHERE job_name=?""",
            ("; ".join(errors), "; ".join(errors)[:1000], updated, JOB_NAME))
    return {"scopes": len(scopes), "updated": updated, "lineups": lineups,
            "player_stats": stats, "errors": errors}


# -- Sezon siralamalari (ekran 3d) -------------------------------------------
# Tasarim uc cetvel istiyor: Goals / Assists / Minutes. Bunlarin hicbiri
# bizde yok - rankit_match_players SEZON KADROSU, rankit_moments'taki gol ise
# yalnizca olay yoklamasi yapilmis maclardan ve oyuncuya isimle bagli.
# O yuzden cetvel dogrudan saglayicidan aliniyor.
#
# Butce: turnuva basina 1 (lig) + 3 (cetvel) istek, alti saatte bir. 13
# turnuva => gunde ~200 istek. Ayni saglayiciyi canli olaylar icin zaten
# 45 saniyede bir yokluyoruz; bu onun yaninda gurultu bile degil.
STATS_JOB = "rankit_player_stats"
STATS_INTERVAL_HOURS = 6
STATS_LIMIT = 40
# Tasarimin sordugu uc sutun -> saglayicinin anahtarlari.
STATS_WANTED = (("goals", "goals"), ("assists", "goal_assist"), ("minutes", "mins_played"))

# FotMob mevkiyi SAYIYLA veriyor, etiketle degil. Asagidaki tablo tahmin
# degil: her kodun etiketi playerData'dan (positionDescription.positions[])
# tek tek okunarak cikarildi (2026-09, Premier League cetvelindeki 38 kod).
# Ekran 3d "Arsenal - Winger" yaziyor - yani KABA etiket isteniyor, "Right
# Wing-Back" degil; olculen ince etiket burada kaba olana indirgeniyor.
POSITION_CODES = {
    11: "Keeper",
    32: "Defender", 33: "Defender", 34: "Defender", 36: "Defender",
    37: "Defender", 38: "Defender", 51: "Defender", 59: "Defender",
    68: "Defender",
    64: "Midfielder", 66: "Midfielder", 71: "Midfielder", 72: "Midfielder",
    73: "Midfielder", 74: "Midfielder", 76: "Midfielder", 77: "Midfielder",
    78: "Midfielder",
    # 84 ve 85 "Attacking Midfielder" olarak olculdu; 86 ayni ucun ortasi,
    # iki yanindaki olculmus komsusuyla ayni satirda.
    84: "Midfielder", 85: "Midfielder", 86: "Midfielder",
    82: "Winger", 83: "Winger", 87: "Winger", 88: "Winger",
    103: "Winger", 107: "Winger",
    104: "Striker", 115: "Striker",
}


def _position_label(codes) -> str:
    """Kodlardan tek bir kaba mevki. Ilk kod ana mevki (saglayici boyle siraliyor)."""
    for code in codes or ():
        try:
            code = int(code)
        except (TypeError, ValueError):
            continue
        if code in POSITION_CODES:
            return POSITION_CODES[code]
        # Olculmemis bir kod: saglayici sahayi bantlar halinde numaralandiriyor
        # ve olculen 29 kodun hepsi asagidaki bantlara uyuyor.
        if code < 32:
            return "Keeper"
        if code < 60:
            return "Defender"
        if code < 100:
            return "Midfielder"
        return "Striker"
    return ""


def _claim_stats() -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            f"""INSERT INTO rankit_sync_state(job_name,last_attempt)
                VALUES(?,datetime('now'))
                ON CONFLICT(job_name) DO UPDATE SET last_attempt=datetime('now')
                WHERE last_attempt IS NULL
                   OR last_attempt < datetime('now','-{STATS_INTERVAL_HOURS} hours')""",
            (STATS_JOB,))
        return cur.rowcount > 0


def _stat_scopes() -> list[dict]:
    """Cetveli olan turnuvalar: FotMob lig kimligi bilinen futbol turnuvalari."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT c.id, c.name, m.season FROM rankit_competitions c
               JOIN rankit_matches m ON m.competition_id=c.id
               WHERE c.sport='Football' AND m.provider='fotmob'
               GROUP BY c.id, m.season
               ORDER BY MAX(m.starts_at) DESC""").fetchall()
    return [dict(r) for r in rows if r["name"] in FOTMOB_LEAGUES]


# Kulup adindaki hukuki/tarihi gurultu. Saglayici tam adi yaziyor
# ("1. FSV Mainz 05"), biz kisa adi ("Mainz 05"); ayni kulup.
_NAME_NOISE = {
    "fc", "cf", "sc", "sv", "ss", "ssc", "as", "ac", "afc", "us", "ud", "cd",
    "rc", "rcd", "sd", "bsc", "vfl", "vfb", "tsg", "tsv", "fsv", "pfk", "spvgg",
    "de", "del", "la", "le", "club", "sport", "calcio", "futbol", "football",
}


def _norm_team(name: str) -> str:
    """Kulup adini karsilastirilabilir bir anahtara indirger.

    Aksan temizlenir, noktalama atilir, kurulus yili ve hukuki kisaltma
    dusulur: "Bayer 04 Leverkusen" ve "Bayer Leverkusen" ayni anahtari verir.
    (CLAUDE.md'de not dusulmus genel bir eksik: isim normalizasyonu tek
    noktada standart degil. Bu, RankIt tarafindaki ilk hali.)
    """
    import unicodedata

    flat = unicodedata.normalize("NFKD", str(name or ""))
    flat = "".join(ch for ch in flat if not unicodedata.combining(ch)).lower()
    tokens = []
    for raw in "".join(ch if ch.isalnum() else " " for ch in flat).split():
        if raw in _NAME_NOISE:
            continue
        if raw.isdigit():          # "04", "1899", "05" -> kurulus yili
            continue
        tokens.append(raw)
    return "".join(tokens)


def _team_index(conn, sport: str) -> dict:
    """Saglayicinin takim adi -> bizim takim satirimiz. Cetvelde armanin
    gelmesi buna bagli; eslesmezse satir armasiz ama dogru kalir."""
    index: dict = {}
    for row in conn.execute("SELECT id,name,short_name FROM rankit_teams WHERE sport=?", (sport,)):
        for key in (row["name"], row["short_name"]):
            if key:
                index.setdefault(_norm_team(key), row["id"])
    index.pop("", None)
    return index


def _match_team(index: dict, name: str):
    """Once tam anahtar, sonra TEK ADAYLI kapsama.

    Kapsama yalnizca tek aday varken kabul ediliyor: "Internazionale" icin
    "inter" tek adaydir ("interturku" onun onekine uymaz), ama iki kulup ayni
    onegi paylassaydi yanlis armayi basmaktansa armasiz birakmak dogru.
    Kisa anahtarlar ("az") disarida: bes harften kisa bir parca cok kulube uyar.
    """
    key = _norm_team(name)
    if not key:
        return None
    if key in index:
        return index[key]
    hits = set()
    for ours, tid in index.items():
        short, long = sorted((ours, key), key=len)
        if len(short) >= 5 and (long.startswith(short) or long.endswith(short)):
            hits.add(tid)
    return hits.pop() if len(hits) == 1 else None


def refresh_player_stats() -> dict:
    from curl_cffi import requests

    stored = 0
    scopes = _stat_scopes()
    for scope in scopes:
        league_id = FOTMOB_LEAGUES[scope["name"]][0][0]
        start = str(scope["season"]).split("-")[0]
        try:
            payload = requests.get(
                "https://www.fotmob.com/api/data/leagues",
                params={"id": league_id, "season": f"{start}/{int(start) + 1}"},
                impersonate="chrome124", timeout=25).json()
        except Exception:
            continue
        # fetchAllUrl tam cetveli veriyor; ozet yalnizca ilk uc oyuncu.
        sources = {entry.get("name"): entry.get("fetchAllUrl")
                   for entry in ((payload.get("stats") or {}).get("players") or [])}
        for ours, theirs in STATS_WANTED:
            url = sources.get(theirs)
            if not url:
                continue
            try:
                lists = requests.get(url, impersonate="chrome124", timeout=25).json()
                rows = ((lists.get("TopLists") or [{}])[0].get("StatList") or [])[:STATS_LIMIT]
            except Exception:
                continue
            if not rows:
                continue
            with get_conn() as conn:
                teams = _team_index(conn, "Football")
                # SIL-VE-YAZ: cetvelden dusen oyuncu listede kalmamali.
                conn.execute("""DELETE FROM rankit_player_stats
                                WHERE competition_id=? AND season=? AND stat=?""",
                             (scope["id"], scope["season"], ours))
                conn.executemany(
                    """INSERT OR REPLACE INTO rankit_player_stats
                       (competition_id,season,stat,rank,name,provider_player_id,
                        team_name,team_id,position,value,matches,minutes,updated_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))""",
                    [(scope["id"], scope["season"], ours, int(r.get("Rank") or i + 1),
                      r.get("ParticipantName") or "", r.get("ParticiantId"),
                      r.get("TeamName"), _match_team(teams, r.get("TeamName")),
                      _position_label(r.get("Positions")), float(r.get("StatValue") or 0),
                      r.get("MatchesPlayed"), r.get("MinutesPlayed"))
                     for i, r in enumerate(rows) if r.get("ParticipantName")])
                stored += len(rows)
        time.sleep(0.5)  # saglayiciya nazik ol
    return {"competitions": len(scopes), "rows": stored}


def _worker() -> None:
    time.sleep(12)
    while True:
        try:
            if _claim():
                print(f"[rankit-sync] {refresh_live_scores()}", flush=True)
        except Exception as exc:
            print(f"[rankit-sync] failed: {exc}", flush=True)
        time.sleep(60)


def background_jobs_enabled() -> bool:
    """Sunucunun arka plan islerine TEK anahtar (katalog, canli skor/olay,
    logo doldurma). RANKIT_BACKGROUND_JOBS=0 hepsini kapatir; tanimsizsa
    acik -- canli sunucunun davranisi degismez. Testler kapatir
    (tests/conftest.py): aksi halde thread'ler test sirasinda gercek
    saglayicilara gidip test veritabanina yaziyordu."""
    return os.environ.get("RANKIT_BACKGROUND_JOBS", "1") != "0"


def start_rankit_live_sync() -> None:
    if not background_jobs_enabled():
        return
    # Olaylar icin AYRI worker: kadro/fikstur 15 dakikada bir yeterli ama
    # canli olaylar degil. Ikisi ayri claim satiri kullaniyor.
    threading.Thread(target=_events_worker, name="rankit-live-events", daemon=True).start()
    # Her process kendi hafif worker'ını açabilir; veritabanı claim'i sağlayıcı
    # çağrısının tüm process'lerde toplam 15 dakikada bir yapılmasını garanti eder.
    threading.Thread(target=_worker, name="rankit-live-sync", daemon=True).start()
