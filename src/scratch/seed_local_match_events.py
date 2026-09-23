# -*- coding: utf-8 -*-
"""YEREL geliştirme için: bir bitmiş maça gerçekçi olay verisi koyar (2f).

Neden var: `GET /matches/{id}` bitmiş maçta `events` döner, ama olaylar
sağlayıcı döngüsünden gelir (canlı olay / kadro yoklaması). Yerelde hiç
yoklanmamış bir maçta liste boş ve `events_checked: false` olur — doğru ama
frontend'in "dolu olay" görsel kabulü yapılamaz. Bu betik o örneği kurar:
iki gol, bir kırmızı kart ve dakikalı bir oyuncu değişikliği.

    python src/scratch/seed_local_match_events.py            # en yeni bitmiş maç
    python src/scratch/seed_local_match_events.py 54609      # belirli maç
    python src/scratch/seed_local_match_events.py 54609 --undo

Yalnız yerel veritabanında çalışır (prod ortam değişkeni varsa durur).
Geri alma, yalnız bu betiğin yazdığı satırları siler.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from api.db import get_conn, init_db  # noqa: E402

MARK = "scratch-seed"          # geri alirken bu etiketle bulunur
GOALS = [(23, "goal", "Goal - Saka", "Saka", "home"),
         (58, "goal", "Goal - Palmer", "Palmer", "away"),
         (71, "card", "Red card - Romero", "Romero", "away")]


def prod() -> bool:
    return bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") == "true"
                or os.environ.get("IS_PROD") == "true")


def pick(conn, match_id):
    if match_id:
        row = conn.execute("SELECT id, home_team_id, away_team_id FROM rankit_matches WHERE id=? AND status='finished'",
                           (match_id,)).fetchone()
    else:
        row = conn.execute("""SELECT id, home_team_id, away_team_id FROM rankit_matches
                              WHERE status='finished' AND provider IS NOT NULL
                              ORDER BY starts_at DESC LIMIT 1""").fetchone()
    return row


def undo(conn, match_id: int) -> None:
    conn.execute("DELETE FROM rankit_moments WHERE match_id=? AND detail IN (?,?,?)",
                 (match_id, *[g[3] for g in GOALS]))
    conn.execute("DELETE FROM rankit_match_lineup_players WHERE match_id=? AND name=?", (match_id, "Trossard"))
    conn.execute("DELETE FROM rankit_match_lineups WHERE match_id=? AND coach_name=?", (match_id, MARK))
    print(f"match {match_id}: seeded events and lineup row removed")


def seed(conn, row) -> None:
    match_id, home, away = row["id"], row["home_team_id"], row["away_team_id"]
    for minute, kind, label, who, side in GOALS:
        conn.execute("""INSERT INTO rankit_moments(match_id,minute,kind,label,detail,side)
                        VALUES(?,?,?,?,?,?)
                        ON CONFLICT(match_id,minute,kind,label) DO UPDATE SET side=excluded.side""",
                     (match_id, minute, kind, label, who, side))
    # Oyuncu degisikligi olayi dogrulanmis kadrodan geliyor: ev sahibi icin
    # tek satirlik bir yedek yeterli (varsa dokunulmaz).
    conn.execute("""INSERT OR IGNORE INTO rankit_match_lineups(match_id,team_id,side,formation,coach_name)
                    VALUES(?,?,'home','4-3-3',?)""", (match_id, home, MARK))
    conn.execute("""INSERT OR IGNORE INTO rankit_match_lineup_players
                    (match_id,team_id,name,shirt_no,role,ord,sub_in,replaced)
                    VALUES(?,?,'Trossard',19,'bench',90,63,'Martinelli')""", (match_id, home))
    conn.execute("UPDATE rankit_matches SET events_polled_at=datetime('now') WHERE id=?", (match_id,))
    print(f"match {match_id} (home {home} / away {away}): 2 goals, 1 red card, 63' substitution written")
    print(f"check: GET /api/rankit/matches/{match_id} -> events[4], events_checked: true")


def main() -> None:
    if prod():
        raise SystemExit("local only: production environment variable found")
    args = [a for a in sys.argv[1:] if a != "--undo"]
    match_id = int(args[0]) if args else None
    init_db()
    with get_conn() as conn:
        row = pick(conn, match_id)
        if not row:
            raise SystemExit("no finished match found (pass an id, or run the catalog sync)")
        if "--undo" in sys.argv:
            undo(conn, row["id"])
        else:
            seed(conn, row)


if __name__ == "__main__":
    main()
