# -*- coding: utf-8 -*-
"""ONARIM Asama 4 gorsel kabulu icin QA senaryosu (YALNIZ bir DB KOPYASINA).

Neden var: §3 / §3.1 / §5.5 gorunurluk politikalarinin uc durumu gelistirme
veritabaninda GOZLENEMIYOR:
  - 20 ve ustu puanli mac yok (en coku 5) -> "20 esigi asildi" hali cizilemiyor,
  - puanli her mac zaten `rankit_demo` (yerel anonim izleyici) tarafindan
    puanlanmis -> "puanlamamis izleyici" kapisi (§3.1) hic acilmiyor,
  - spoiler isaretli tek bir inceleme yok -> spoiler perdesi denenemiyor.

Bu satirlar UYDURMA: gercek kullanici gorusu degil, QA fikstürü. O yuzden
  (a) yalnizca --db ile verilen bir KOPYAYA yaziyor, gercek app.db'ye asla,
  (b) hesaplar acikca sentetik (`qa_viewer_01`...), incelemeler QA diyor,
  (c) prod ortam degiskeni gorurse hic baslamiyor.

    cp data/app.db /tmp/qa.db
    python src/scratch/seed_qa_visibility.py --db /tmp/qa.db
    DB_PATH=/tmp/qa.db uvicorn api.main:app --port 8011
    API_PORT=8011 npm run dev -- --port 5174     # frontend/ icinde
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

VOICES = [
    ("Best game of the round, no argument.", 5.0, 0),
    ("QA fixture review - the comeback was the whole story.", 4.5, 0),
    ("Second half decided it. QA fixture.", 4.0, 0),
    ("QA fixture - contains the winning play, marked spoiler.", 5.0, 1),
    ("Dragged in the middle but the finish earned it.", 4.0, 0),
]


def prod() -> bool:
    return bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") == "true"
                or os.environ.get("IS_PROD") == "true")


def pick_match(conn) -> int:
    """Bitmis, HIC puanlanmamis bir mac: boylece demo izleyici 'puanlamamis'
    kaliyor ve §3.1 kapisi gercekten aciliyor."""
    row = conn.execute("""SELECT m.id FROM rankit_matches m
        WHERE m.status='finished' AND m.home_score IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM rankit_diary_entries e WHERE e.match_id=m.id)
        ORDER BY m.starts_at DESC LIMIT 1""").fetchone()
    if not row:
        raise SystemExit("uygun mac yok: bitmis ve hic puanlanmamis mac bulunamadi")
    return int(row["id"])


def seed(conn, match_id: int, raters: int) -> None:
    from api import rankit_rank
    floor = rankit_rank.MIN_COMMUNITY_RATINGS
    users = []
    for i in range(1, raters + 1):
        name = f"qa_viewer_{i:02d}"
        row = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
        uid = int(row["id"]) if row else conn.execute(
            "INSERT INTO users(username,email,hashed_password,role) VALUES(?,?,?,'user')",
            (name, f"{name}@qa.invalid", "x")).lastrowid
        users.append(uid)

    for index, uid in enumerate(users):
        text, rating, spoiler = VOICES[index % len(VOICES)] if index < 5 else ("", 4.0 + (index % 3) * 0.5, 0)
        rating = min(5.0, rating)
        conn.execute("""INSERT INTO rankit_diary_entries
              (user_id,match_id,rating,review,classic,spoiler,visibility,watched_date)
            VALUES(?,?,?,?,0,?, 'public', date('now'))""",
                     (uid, match_id, rating, text, spoiler))

    n = conn.execute("SELECT COUNT(*) FROM rankit_diary_entries WHERE match_id=?", (match_id,)).fetchone()[0]
    m = conn.execute("""SELECT h.short_name h, a.short_name a FROM rankit_matches m
        JOIN rankit_teams h ON h.id=m.home_team_id JOIN rankit_teams a ON a.id=m.away_team_id
        WHERE m.id=?""", (match_id,)).fetchone()
    print(f"match {match_id} ({m['h']} vs {m['a']}): {n} rating(s), threshold {floor}")
    print(f"  -> community verdict {'VISIBLE' if n >= floor else 'withheld'}; viewer (rankit_demo) has NOT rated it")
    print(f"  -> {sum(1 for v in VOICES if v[2])} spoiler-marked review among the first {min(len(VOICES), raters)}")


def undo(conn) -> None:
    ids = [int(r["id"]) for r in conn.execute("SELECT id FROM users WHERE username LIKE 'qa_viewer_%'")]
    if not ids:
        print("nothing to undo")
        return
    marks = ",".join("?" * len(ids))
    conn.execute(f"DELETE FROM rankit_diary_entries WHERE user_id IN ({marks})", ids)
    conn.execute(f"DELETE FROM users WHERE id IN ({marks})", ids)
    print(f"removed {len(ids)} qa_viewer accounts and their entries")


def main() -> None:
    if prod():
        raise SystemExit("local only: production environment variable found")
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, help="KOPYA veritabani yolu (gercek app.db degil)")
    parser.add_argument("--raters", type=int, default=22)
    parser.add_argument("--undo", action="store_true")
    args = parser.parse_args()

    db = Path(args.db).resolve()
    real = (ROOT / "data" / "app.db").resolve()
    if db == real:
        raise SystemExit("bu script gercek app.db'ye yazmaz; once kopyala")
    if not db.exists():
        raise SystemExit(f"kopya yok: {db}")
    os.environ["DB_PATH"] = str(db)

    from api.db import get_conn
    with get_conn() as conn:
        if args.undo:
            undo(conn)
        else:
            seed(conn, pick_match(conn), args.raters)


if __name__ == "__main__":
    main()
