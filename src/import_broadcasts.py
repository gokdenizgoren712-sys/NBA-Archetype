# -*- coding: utf-8 -*-
"""data/broadcast/*.csv -> rankit_broadcasters + rankit_broadcast_rules.

Neden ayri bir script: yayin haklari sezon icinde degisir ve rankit_*
semasinin kendi ilkesi "hicbiri yoksa cevap BOS, tahmin uretmiyoruz".
Bu yuzden CSV'deki her satirin bir confidence sutunu var ve bu arac
VARSAYILAN OLARAK yalnizca 'established' satirlari yukler. 'verify'
satirlari resmi kaynaktan dogrulanip CSV'de established'a cevrilene
kadar veritabanina girmez; --include-unverified ile bilerek zorlanabilir.

Idempotent: iki kez kosmak yeni satir uretmez (UNIQUE kisitlari + OR IGNORE).

  python src/import_broadcasts.py --dry-run
  python src/import_broadcasts.py
  python src/import_broadcasts.py --country TR --include-unverified
"""
import argparse, csv, io, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB   = ROOT / "data" / "app.db"
DIR  = ROOT / "data" / "broadcast"


def rows(name):
    with io.open(DIR / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    ap = argparse.ArgumentParser(description="Import broadcaster CSVs into RankIt")
    ap.add_argument("--db", default=str(DB))
    ap.add_argument("--country", action="append",
                    help="Only this country (repeatable): US, GB, TR")
    ap.add_argument("--include-unverified", action="store_true",
                    help="Also load rows marked confidence=verify")
    ap.add_argument("--dry-run", action="store_true", help="Report, write nothing")
    a = ap.parse_args()

    want = {c.upper() for c in a.country} if a.country else None
    conn = sqlite3.connect(a.db)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")

    added_b = skipped_b = 0
    for r in rows("broadcasters.csv"):
        if want and r["country"].upper() not in want:
            continue
        exists = conn.execute("SELECT 1 FROM rankit_broadcasters WHERE country=? AND name=?",
                              (r["country"], r["name"])).fetchone()
        if exists:
            skipped_b += 1
            continue
        added_b += 1
        if not a.dry_run:
            conn.execute("INSERT INTO rankit_broadcasters(country,name,kind,url) VALUES(?,?,?,?)",
                         (r["country"], r["name"], r["kind"] or "tv", r["url"] or None))

    added_r = skipped_r = held = 0
    missing_comp, missing_bc = set(), set()
    for r in rows("broadcast_rules.csv"):
        if want and r["country"].upper() not in want:
            continue
        if r["confidence"] != "established" and not a.include_unverified:
            held += 1
            continue
        comp = conn.execute(
            "SELECT id FROM rankit_competitions WHERE name=? AND season=? AND sport=?",
            (r["competition"], r["season"], r["sport"])).fetchone()
        if not comp:
            missing_comp.add(f"{r['competition']} {r['season']}")
            continue
        bc = conn.execute("SELECT id FROM rankit_broadcasters WHERE country=? AND name=?",
                          (r["country"], r["broadcaster"])).fetchone()
        if not bc:
            missing_bc.add(f"{r['country']}/{r['broadcaster']}")
            continue
        dup = conn.execute("""SELECT 1 FROM rankit_broadcast_rules
                              WHERE competition_id=? AND country=? AND broadcaster_id=?""",
                           (comp["id"], r["country"], bc["id"])).fetchone()
        if dup:
            skipped_r += 1
            continue
        added_r += 1
        if not a.dry_run:
            conn.execute("""INSERT INTO rankit_broadcast_rules
                            (competition_id,country,broadcaster_id,note)
                            VALUES(?,?,?,?)""",
                         (comp["id"], r["country"], bc["id"], r["note"] or None))

    if a.dry_run:
        conn.rollback()
    else:
        conn.commit()
    conn.close()

    tag = "DRY RUN - hicbir sey yazilmadi" if a.dry_run else "yazildi"
    print(f"[{tag}]")
    print(f"  yayinci : +{added_b} eklendi, {skipped_b} zaten vardi")
    print(f"  kural   : +{added_r} eklendi, {skipped_r} zaten vardi")
    if held:
        print(f"  BEKLETILDI: {held} satir confidence=verify - dogrulanmadan yuklenmez")
        print("             (bilerek yuklemek icin --include-unverified)")
    for label, s in (("turnuva bulunamadi", missing_comp), ("yayinci bulunamadi", missing_bc)):
        if s:
            print(f"  {label}: {len(s)} -> {sorted(s)[:4]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
