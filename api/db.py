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
        """)
