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
        """)
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
