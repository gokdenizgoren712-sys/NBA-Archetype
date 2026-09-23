# -*- coding: utf-8 -*-
"""Lig skinleri gorsel kabulu icin QA senaryosu (YALNIZ bir DB KOPYASINA).

Neden var: bir lig skinini acmak icin bir kulubun o ligdeki TUM sezonunu
puanlamak gerekiyor (La Liga'da 38 mac). Gelistirme veritabaninda bunu
elle yapmak mumkun degil. Bu betik iki kulupluk sentetik bir "La Liga"
sezonu kurar (kulup basina beklenen 2 mac, cift devre): yerel izleyici
(`rankit_demo`) kulubu takip ediyor ve iki mactan birini puanlamis. Kalan
maci arayuzden puanlamak sezonu bitirir -> 6a'da "LA LIGA UNLOCKED" satiri.

Satirlar UYDURMA, QA fikstürü:
  (a) yalnizca --db ile verilen bir KOPYAYA yazar, gercek app.db'ye asla,
  (b) kulupler ve sezon acikca sentetik ("QA Hispalis", "2019-20"),
  (c) prod ortam degiskeni gorurse hic baslamaz,
  (d) maclar provider='qa' -- canli senkron bunlara dokunmaz.

    cp data/app.db <scratch>/qa.db
    python src/scratch/seed_qa_skins.py --db <scratch>/qa.db
    DB_PATH=<scratch>/qa.db uvicorn api.main:app --port 8011
    API_PORT=8011 npx vite --port 5174     # frontend/ icinde
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

SEASON = "2019-20"


def prod() -> bool:
    return bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RENDER") == "true"
                or os.environ.get("IS_PROD") == "true")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="DB KOPYASININ yolu (asla data/app.db)")
    args = ap.parse_args()
    if prod():
        raise SystemExit("prod ortaminda calismaz")
    target = Path(args.db).resolve()
    if target == (ROOT / "data" / "app.db").resolve():
        raise SystemExit("gercek veritabanina yazilmaz; bir kopya ver")
    if not target.exists():
        raise SystemExit(f"{target} yok")

    import api.db as DB
    DB.DB_PATH = target
    from api import rankit as RK

    with DB.get_conn() as c:
        demo = RK._demo_user_id(c)
        comp = c.execute("SELECT id FROM rankit_competitions WHERE name='La Liga' AND season=?", (SEASON,)).fetchone()
        if comp:
            raise SystemExit("QA sezonu zaten kurulu")
        c.execute("INSERT INTO rankit_competitions(sport,name,season) VALUES('Football','La Liga',?)", (SEASON,))
        comp_id = c.execute("SELECT id FROM rankit_competitions WHERE name='La Liga' AND season=?", (SEASON,)).fetchone()["id"]
        teams = []
        for name, short, color in (("QA Hispalis", "Hispalis", "#b3202c"), ("QA Triana", "Triana", "#1d7a45")):
            c.execute("INSERT INTO rankit_teams(sport,name,short_name,color) VALUES('Football',?,?,?)", (name, short, color))
            teams.append(c.execute("SELECT id FROM rankit_teams WHERE name=?", (name,)).fetchone()["id"])
        home, away = teams
        ids = []
        for when, h, a, hs, as_ in (("2019-09-14T19:00:00Z", home, away, 2, 1), ("2020-02-08T19:00:00Z", away, home, 1, 3)):
            c.execute("""INSERT INTO rankit_matches(sport,competition_id,season,starts_at,status,home_team_id,
                         away_team_id,home_score,away_score,provider)
                         VALUES('Football',?,?,?,'finished',?,?,?,?,'qa')""", (comp_id, SEASON, when, h, a, hs, as_))
            ids.append(c.execute("SELECT last_insert_rowid()").fetchone()[0])
        c.execute("INSERT OR IGNORE INTO rankit_follows(user_id,target_type,target_id) VALUES(?,'team',?)", (demo, home))
        c.execute("""INSERT INTO rankit_diary_entries(user_id,match_id,watched_date,rating,visibility)
                     VALUES(?,?,'2019-09-14',4.0,'public')""", (demo, ids[0]))
    print(f"QA La Liga {SEASON}: maclar {ids}; demo={demo} takip ediyor, {ids[0]} puanli. "
          f"Sezonu bitirmek icin mac {ids[1]}'i puanla (QA Triana vs QA Hispalis).")


if __name__ == "__main__":
    main()
