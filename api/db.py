"""SQLite veritabanı kurulumu."""
import sqlite3, os
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "data" / "app.db")))

def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            email            TEXT UNIQUE NOT NULL,
            username         TEXT UNIQUE NOT NULL,
            hashed_password  TEXT NOT NULL,
            role             TEXT NOT NULL DEFAULT 'user',
            is_banned        INTEGER NOT NULL DEFAULT 0,
            reset_token      TEXT,
            reset_expires    TEXT,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS articles (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            title            TEXT NOT NULL,
            slug             TEXT UNIQUE NOT NULL,
            content          TEXT NOT NULL DEFAULT '',
            cover_image_url  TEXT,
            author_id        INTEGER REFERENCES users(id),
            status           TEXT NOT NULL DEFAULT 'draft',
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id  INTEGER REFERENCES articles(id) ON DELETE CASCADE,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS saved_players (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            player_name  TEXT NOT NULL,
            season       TEXT NOT NULL DEFAULT '2025-26',
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, player_name, season)
        );

        CREATE TABLE IF NOT EXISTS saved_lineups (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            players     TEXT NOT NULL,
            score       REAL,
            grade       TEXT,
            pct         REAL,
            label       TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS lineup_games (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            pct         INTEGER NOT NULL,
            grade       TEXT NOT NULL,
            lineup_json TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        -- "Kadro Kaydetme" (bkz. docs/online-architecture-review-and-roadmap.md Faz 1).
        -- roster_json BİLEREK lineup_json (sadece isim) ile AYNI ŞEKİL DEĞİL — Board
        -- Challenge'da (lineup_games.roster_json) yaşanan "sadece isimle headToHead.js
        -- çalışmaz" hatasına tekrar düşmemek için tam oyuncu satırı (PLAYER_NAME,
        -- primary_arch, overall_score, score_*, _season, _cost, _posPenalty) taşır —
        -- aynı şekli _backfill_roster_json_once() (api/main.py) zaten üretiyor.
        CREATE TABLE IF NOT EXISTS saved_rosters (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            source_mode  TEXT NOT NULL DEFAULT 'single',   -- 'single' | 'same_screen' | 'with_a_friend'
            mode         TEXT NOT NULL DEFAULT 'classic',  -- 'classic' | 'salarycap'
            sim_era      TEXT,
            roster_json  TEXT NOT NULL,
            overall_pct  REAL,
            grade        TEXT,
            -- Futbol kadrolari 18 kisi ve dizilis kodlu ('4-3-3'); basketbol
            -- 9 kisi ve 'classic'/'salarycap'. Tek tabloyu ikisi paylasiyor,
            -- ayrimi bu kolon tutuyor. Eski satirlar basketbol.
            sport        TEXT NOT NULL DEFAULT 'basketball',
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, name)
        );

        CREATE TABLE IF NOT EXISTS challenge_results (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            challenger_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
            entry_id       INTEGER REFERENCES lineup_games(id) ON DELETE CASCADE,
            won            INTEGER NOT NULL,
            series_score   TEXT,
            created_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tag_corrections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
            player_name     TEXT NOT NULL,
            season          TEXT NOT NULL DEFAULT '2025-26',
            current_arch    TEXT NOT NULL,
            suggested_arch  TEXT NOT NULL,
            note            TEXT,
            status          TEXT NOT NULL DEFAULT 'pending',
            created_at      TEXT DEFAULT (datetime('now'))
        );

        -- Futbol arketip sözlüğü geri bildirimi (2026-08). Basketboldaki
        -- tag_corrections'tan AYRI ve farklı şekilli: orada bir OYUNCUnun
        -- etiketi düzeltiliyor, burada henüz oyuncu yok — sözlüğün KENDİSİ
        -- (isim değişikliği ya da eksik arketip) tartışılıyor.
        -- phase: gk | def | mid | fwd   ·   kind: rename | add | other
        -- Oyuncu fotografinin kartta nasil oturdugu. Cutout'lar farkli en/boy
        -- oranlarinda cikiyor (kimi omuzdan, kimi belden); tek bir CSS kurali
        -- hepsine uymuyor. Admin bunlari tek tek duzeltebilsin diye kalici
        -- olarak burada. Kayit YOKSA kart varsayilan yerlesimi kullanir.
        -- Futbol kafa kafaya odalari. Basketbolun game_rooms'undan AYRI:
        -- orada iki NBA takimindan canli sirayla draft ediliyor, burada her
        -- oyuncu kendi XI'ini kurup GONDERIYOR ve iki taraf da gonderince
        -- eslesme SUNUCUDA cozuluyor. Sonucu istemciye birakmak, oyuncunun
        -- kendi skorunu bildirmesi demek olurdu.
        CREATE TABLE IF NOT EXISTS football_h2h_rooms (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code     TEXT UNIQUE NOT NULL,
            mode          TEXT NOT NULL DEFAULT 'friend',   -- friend | online
            status        TEXT NOT NULL DEFAULT 'waiting',  -- waiting|building|resolved|abandoned
            season        TEXT,
            p1_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            p2_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            p1_squad_json TEXT,      -- [{PLAYER_ID, SEASON}] — 11 ilk 11
            p2_squad_json TEXT,
            p1_name       TEXT,
            p2_name       TEXT,
            result_json   TEXT,      -- sunucuda cozulen eslesme
            created_at    TEXT DEFAULT (datetime('now')),
            updated_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS football_photo_layout (
            player_id  INTEGER PRIMARY KEY,
            scale      REAL NOT NULL DEFAULT 1.0,   -- 0.6 .. 2.0
            offset_x   REAL NOT NULL DEFAULT 50.0,  -- object-position %
            offset_y   REAL NOT NULL DEFAULT 100.0, -- 100 = alta hizali
            updated_at TEXT DEFAULT (datetime('now')),
            updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS football_archetype_feedback (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            phase        TEXT NOT NULL,
            kind         TEXT NOT NULL DEFAULT 'other',
            archetype    TEXT,
            suggestion   TEXT NOT NULL,
            note         TEXT,
            status       TEXT NOT NULL DEFAULT 'pending',
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_rooms (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code        TEXT UNIQUE NOT NULL,
            mode             TEXT NOT NULL,                     -- 'friend' | 'online'
            status           TEXT NOT NULL DEFAULT 'waiting',   -- waiting|drafting|complete|abandoned
            season           TEXT NOT NULL,
            team_a           TEXT NOT NULL,
            team_b           TEXT NOT NULL,
            pool_json        TEXT,
            player1_user_id  INTEGER REFERENCES users(id),
            player2_user_id  INTEGER REFERENCES users(id),
            turn_user_id     INTEGER,
            pick_number      INTEGER NOT NULL DEFAULT 0,
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_room_picks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id      INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
            user_id      INTEGER REFERENCES users(id),
            player_id    TEXT NOT NULL,
            slot_index   INTEGER NOT NULL,
            pick_number  INTEGER NOT NULL,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        -- RankIt by Primary Arch: scouting verisinden tamamen bagimsiz sosyal
        -- mac gunlugu. Tum tablolar rankit_ prefix'iyle izole tutulur.
        CREATE TABLE IF NOT EXISTS rankit_competitions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sport       TEXT NOT NULL CHECK(sport IN ('Basketball','Football','Olympics')),
            name        TEXT NOT NULL,
            country     TEXT,
            season      TEXT NOT NULL,
            UNIQUE(sport, name, season)
        );

        CREATE TABLE IF NOT EXISTS rankit_teams (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sport       TEXT NOT NULL,
            name        TEXT NOT NULL,
            short_name  TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#FFB11B',
            crest_url   TEXT,
            country     TEXT,
            UNIQUE(sport, name)
        );

        CREATE TABLE IF NOT EXISTS rankit_players (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sport       TEXT NOT NULL,
            team_id     INTEGER REFERENCES rankit_teams(id) ON DELETE SET NULL,
            name        TEXT NOT NULL,
            shirt_no    TEXT,
            image_url   TEXT,
            UNIQUE(sport, name)
        );

        CREATE TABLE IF NOT EXISTS rankit_matches (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            sport           TEXT NOT NULL,
            competition_id  INTEGER REFERENCES rankit_competitions(id),
            season          TEXT NOT NULL,
            starts_at       TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'upcoming',
            home_team_id    INTEGER REFERENCES rankit_teams(id),
            away_team_id    INTEGER REFERENCES rankit_teams(id),
            home_score      INTEGER,
            away_score      INTEGER,
            broadcaster     TEXT,
            editorial       INTEGER NOT NULL DEFAULT 0,
            summary         TEXT,
            cover_variant   TEXT,
            provider        TEXT,
            provider_match_id TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(competition_id, starts_at, home_team_id, away_team_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_match_players (
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            player_id   INTEGER REFERENCES rankit_players(id) ON DELETE CASCADE,
            team_id     INTEGER REFERENCES rankit_teams(id),
            starter     INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY(match_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_diary_entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id      INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            watched_date  TEXT NOT NULL,
            rating        REAL CHECK(rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)),
            review        TEXT,
            is_rewatch    INTEGER NOT NULL DEFAULT 0,
            visibility    TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
            classic       INTEGER NOT NULL DEFAULT 0,
            spoiler       INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_entry_tags (
            entry_id    INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            tag         TEXT NOT NULL,
            PRIMARY KEY(entry_id, tag)
        );

        CREATE TABLE IF NOT EXISTS rankit_potm_votes (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            player_id   INTEGER REFERENCES rankit_players(id) ON DELETE CASCADE,
            updated_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, match_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_respect_votes (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            player_id   INTEGER REFERENCES rankit_players(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, match_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_review_likes (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            entry_id    INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, entry_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_review_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            entry_id    INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_follows (
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            target_type  TEXT NOT NULL CHECK(target_type IN ('user','team','player','competition')),
            target_id    INTEGER NOT NULL,
            notify       INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, target_type, target_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_lists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            description TEXT,
            ranked      INTEGER NOT NULL DEFAULT 0,
            visibility  TEXT NOT NULL DEFAULT 'public',
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_list_items (
            list_id     INTEGER REFERENCES rankit_lists(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            position    INTEGER NOT NULL,
            note        TEXT,
            PRIMARY KEY(list_id, match_id),
            UNIQUE(list_id, position)
        );

        CREATE TABLE IF NOT EXISTS rankit_watchlist (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, match_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_favorites (
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            target_type  TEXT NOT NULL CHECK(target_type IN ('match','team','player','competition')),
            target_id    INTEGER NOT NULL,
            created_at   TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, target_type, target_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_watchalong_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            room        TEXT NOT NULL DEFAULT 'community',
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_rankit_matches_start ON rankit_matches(starts_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_diary_user ON rankit_diary_entries(user_id, watched_date DESC);
        CREATE INDEX IF NOT EXISTS idx_rankit_diary_match ON rankit_diary_entries(match_id);
        CREATE INDEX IF NOT EXISTS idx_rankit_comments_entry ON rankit_review_comments(entry_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_watchalong_match ON rankit_watchalong_messages(match_id, room, id);
        """)
        # RankIt katalog senkronizasyonu: dis veri kaynagindaki mac kimligi
        # tekrar calistirmalarda ayni maci gunceller, kopya uretmez.
        for col, dfn in [("provider", "TEXT"), ("provider_match_id", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE rankit_matches ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_provider_match ON rankit_matches(provider, provider_match_id)")
        # Migration: add columns to existing DBs that predate these fields
        for col, dfn in [
            ("is_banned",     "INTEGER NOT NULL DEFAULT 0"),
            ("reset_token",   "TEXT"),
            ("reset_expires", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        # v3.5: sezon simülasyonu sonuçları + oyun modu
        for col, dfn in [
            ("wins",          "INTEGER"),
            ("season_result", "TEXT"),
            ("sim_era",       "TEXT"),
            ("mode",          "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE lineup_games ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        # Faz 3: With a Friend — round-bazlı/pick-bazlı çark alt-modu odaya kayıtlı
        try:
            conn.execute("ALTER TABLE game_rooms ADD COLUMN wheel_mode TEXT NOT NULL DEFAULT 'round'")
        except Exception:
            pass
        # 2026-07 dayanıklılık: canlı oyun state'i (ROOM_STATES, önceden sadece
        # bellekte) her değişiklikte buraya JSON olarak yazılır — sunucu restart
        # olursa (deploy/crash) aktif maçlar artık kaybolmuyor, DB'den geri
        # yükleniyor (bkz. api/game_ws.py _save_state/_restore_state).
        try:
            conn.execute("ALTER TABLE game_rooms ADD COLUMN state_json TEXT")
        except Exception:
            pass
        # Faz 4 (Online Opponent — Board Challenge): tam oyuncu satırlarını
        # (arketip skorları dahil) tutar, lineup_json (sadece isim) yetersiz
        # kalıyordu — bkz. docs/online-mode-backend-prompt.md "Yapılacak 2".
        # NULL = eski kayıt, board listesine hiç girmez (isim eşleştirmeye
        # düşmeden sessizce dışlanır).
        try:
            conn.execute("ALTER TABLE lineup_games ADD COLUMN roster_json TEXT")
        except Exception:
            pass
        # Rewrite History → Board Challenge: bir Single Player koşusu gerçek
        # bir sezon/takımın yerine geçtiyse burada saklanır (NULL = Quick Sim,
        # normal davranış). Board Challenge'da bu bilgi meydan okuyana taşınır
        # — o da AYNI sezondan FARKLI bir takımı kendi bonus koşusu için seçer.
        for col, dfn in [
            ("real_season", "TEXT"),
            ("real_team",   "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE lineup_games ADD COLUMN {col} {dfn}")
            except Exception:
                pass

        # saved_rosters.sport — futbol kadrolari (18 kisi, dizilis kodu) ile
        # basketbol kadrolari (9 kisi, classic/salarycap) ayni tabloyu
        # paylasiyor. Mevcut satirlarin hepsi basketbol.
        try:
            conn.execute("ALTER TABLE saved_rosters ADD COLUMN "
                         "sport TEXT NOT NULL DEFAULT 'basketball'")
        except Exception:
            pass

        # football_h2h_rooms.draft_state_json — oda içi canlı draft durumu
        # (sıra, havuz, iki kadro). Basketbolun game_rooms.state_json'ıyla aynı
        # gerekçe: durum yalnız bellekte dururken deploy/çökme aktif draftı
        # siliyordu. Her seçimde buraya yazılıyor, bağlantı yeniden kurulunca
        # buradan geri yükleniyor (bkz. api/football_ws.py).
        try:
            conn.execute("ALTER TABLE football_h2h_rooms ADD COLUMN draft_state_json TEXT")
        except Exception:
            pass
        # Oda hangi akışta: 'submit' = bitmiş XI gönder (eski yol),
        # 'draft' = odada sırayla draft. Eski satırlar submit.
        try:
            conn.execute("ALTER TABLE football_h2h_rooms ADD COLUMN "
                         "flow TEXT NOT NULL DEFAULT 'submit'")
        except Exception:
            pass
