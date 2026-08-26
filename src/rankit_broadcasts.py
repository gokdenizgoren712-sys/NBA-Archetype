# -*- coding: utf-8 -*-
"""RankIt yayıncı eşlemeleri — YEREL düzenleme aracı.

Yayıncı tablosunun kullanıcı yüzeyi yok ve şimdilik olmayacak: içi büyük ölçüde
boş, yarım dolu bir alanı uygulamada göstermek kullanıcıya "burada bilgi olur"
dedirtip çoğu maçta boş bırakmak olurdu. Bu yüzden düzenleme HTTP'ye hiç
çıkmıyor — script doğrudan veritabanına yazıyor.

İKİ KATMAN (bkz. api/db.py'deki tablo notu):
  kural  — turnuva + ülke varsayılanı, 'typical' olarak çözülür
  kesin  — maç başına kayıt, kuralı EZER, 'confirmed' olarak çözülür
Hiçbiri yoksa cevap boş. Tahmin üretilmiyor.

KULLANIM
    # ne var ne yok
    python src/rankit_broadcasts.py show
    python src/rankit_broadcasts.py show --country TR

    # kanal listesi (id'leri buradan al)
    python src/rankit_broadcasts.py channels --country TR

    # turnuva kuralı: "Premier League 2025-26, TR, beIN SPORTS"
    python src/rankit_broadcasts.py rule --competition "Premier League" \
        --season 2025-26 --country TR --channel "beIN SPORTS"

    # tek maç: kuralı ezer
    python src/rankit_broadcasts.py match --match 1230 --country TR \
        --channel "S Sport"

    # kaldır
    python src/rankit_broadcasts.py clear --match 1230 --country TR
    python src/rankit_broadcasts.py clear --competition "Premier League" \
        --season 2025-26 --country TR

    # bir maçta ne çözülüyor
    python src/rankit_broadcasts.py resolve --match 1230 --country TR

Kanal adı büyük/küçük harfe duyarsız aranır; birden fazla eşleşirse durur ve
adayları listeler — yanlış kanala yazmaktansa hiç yazmamak doğru.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.db import get_conn, init_db   # noqa: E402

COUNTRIES = ("GB", "US", "TR")


def _country(code: str) -> str:
    c = (code or "").upper()
    if c not in COUNTRIES:
        sys.exit(f"[dur] Desteklenmeyen ülke: {code}. Şimdilik yalnız {', '.join(COUNTRIES)}.")
    return c


def _channel_id(conn, country: str, name: str) -> int:
    rows = conn.execute(
        "SELECT id,name FROM rankit_broadcasters WHERE country=? AND lower(name) LIKE ?",
        (country, f"%{name.strip().lower()}%")).fetchall()
    if not rows:
        sys.exit(f"[dur] {country} içinde '{name}' diye bir kanal yok. "
                 f"`channels --country {country}` ile bak.")
    if len(rows) > 1:
        opts = ", ".join(r["name"] for r in rows)
        sys.exit(f"[dur] '{name}' birden fazla kanalla eşleşti: {opts}. Tam adı yaz.")
    return rows[0]["id"]


def _competition_id(conn, name: str, season: str | None) -> int:
    sql = "SELECT id,name,season FROM rankit_competitions WHERE lower(name) LIKE ?"
    args: list = [f"%{name.strip().lower()}%"]
    if season:
        sql += " AND season=?"
        args.append(season)
    rows = conn.execute(sql, args).fetchall()
    if not rows:
        sys.exit(f"[dur] '{name}'{' / ' + season if season else ''} diye bir turnuva yok.")
    if len(rows) > 1:
        opts = ", ".join(f"{r['name']} {r['season']} (id={r['id']})" for r in rows)
        sys.exit(f"[dur] Birden fazla turnuva eşleşti: {opts}. --season ekle ya da tam ad yaz.")
    return rows[0]["id"]


def cmd_channels(a) -> None:
    with get_conn() as conn:
        sql = "SELECT id,country,name,kind FROM rankit_broadcasters"
        args: list = []
        if a.country:
            sql += " WHERE country=?"
            args.append(_country(a.country))
        for r in conn.execute(sql + " ORDER BY country,name", args):
            print(f"  {r['id']:>3}  {r['country']}  {r['name']:22s} {r['kind']}")


def cmd_show(a) -> None:
    with get_conn() as conn:
        where, args = "", []
        if a.country:
            where, args = " WHERE r.country=?", [_country(a.country)]
        print("── Turnuva kuralları (typical) ──")
        rows = conn.execute(f"""SELECT r.country,c.name comp,c.season,b.name chan,r.note,r.updated_at
            FROM rankit_broadcast_rules r
            JOIN rankit_competitions c ON c.id=r.competition_id
            JOIN rankit_broadcasters b ON b.id=r.broadcaster_id{where}
            ORDER BY r.country,c.name,b.name""", args).fetchall()
        for r in rows:
            note = f"  ({r['note']})" if r["note"] else ""
            print(f"  {r['country']}  {r['comp']} {r['season']:8s} -> {r['chan']}{note}")
        if not rows:
            print("  yok")

        where = " WHERE x.country=?" if a.country else ""
        print("\n── Maç başına kesin kayıtlar (confirmed) ──")
        rows = conn.execute(f"""SELECT x.country,x.match_id,b.name chan,x.verified_at
            FROM rankit_broadcasts x JOIN rankit_broadcasters b ON b.id=x.broadcaster_id{where}
            ORDER BY x.country,x.match_id""", args).fetchall()
        for r in rows:
            print(f"  {r['country']}  maç {r['match_id']:>5} -> {r['chan']}   ({r['verified_at']})")
        if not rows:
            print("  yok")


def cmd_rule(a) -> None:
    country = _country(a.country)
    with get_conn() as conn:
        comp = _competition_id(conn, a.competition, a.season)
        chan = _channel_id(conn, country, a.channel)
        conn.execute("""INSERT INTO rankit_broadcast_rules
            (competition_id,country,broadcaster_id,note) VALUES(?,?,?,?)
            ON CONFLICT(competition_id,country,broadcaster_id) DO UPDATE SET
            note=excluded.note,updated_at=datetime('now')""",
            (comp, country, chan, (a.note or "").strip()[:120]))
    print(f"[ok] kural: turnuva {comp} / {country} -> kanal {chan}")


def cmd_match(a) -> None:
    country = _country(a.country)
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM rankit_matches WHERE id=?", (a.match,)).fetchone():
            sys.exit(f"[dur] {a.match} numaralı maç yok.")
        chan = _channel_id(conn, country, a.channel)
        conn.execute("""INSERT INTO rankit_broadcasts
            (match_id,country,broadcaster_id,source,verified_at)
            VALUES(?,?,?,'editorial',datetime('now'))
            ON CONFLICT(match_id,country,broadcaster_id) DO UPDATE SET
            verified_at=datetime('now'),updated_at=datetime('now')""",
            (a.match, country, chan))
    print(f"[ok] kesin kayıt: maç {a.match} / {country} -> kanal {chan}")


def cmd_clear(a) -> None:
    country = _country(a.country)
    with get_conn() as conn:
        if a.match:
            n = conn.execute("DELETE FROM rankit_broadcasts WHERE match_id=? AND country=?",
                             (a.match, country)).rowcount
            print(f"[ok] maç {a.match} / {country}: {n} kayıt silindi")
        elif a.competition:
            comp = _competition_id(conn, a.competition, a.season)
            n = conn.execute("DELETE FROM rankit_broadcast_rules WHERE competition_id=? AND country=?",
                             (comp, country)).rowcount
            print(f"[ok] turnuva {comp} / {country}: {n} kural silindi")
        else:
            sys.exit("[dur] --match ya da --competition ver.")


def cmd_resolve(a) -> None:
    """Uygulamanın o maçta ne göstereceğini aynı sırayla hesaplar."""
    country = _country(a.country)
    with get_conn() as conn:
        exact = conn.execute("""SELECT b.name FROM rankit_broadcasts x
            JOIN rankit_broadcasters b ON b.id=x.broadcaster_id
            WHERE x.match_id=? AND x.country=? ORDER BY b.name""", (a.match, country)).fetchall()
        if exact:
            print(f"confirmed: {', '.join(r['name'] for r in exact)}")
            return
        rule = conn.execute("""SELECT b.name FROM rankit_broadcast_rules r
            JOIN rankit_broadcasters b ON b.id=r.broadcaster_id
            JOIN rankit_matches m ON m.competition_id=r.competition_id
            WHERE m.id=? AND r.country=? ORDER BY b.name""", (a.match, country)).fetchall()
        if rule:
            print(f"typical: {', '.join(r['name'] for r in rule)}")
            return
        print("boş — bu maç için kayıt yok (kasıtlı, tahmin üretilmiyor)")


def main() -> None:
    init_db()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("channels", help="kanal listesi"); p.add_argument("--country")
    p.set_defaults(fn=cmd_channels)

    p = sub.add_parser("show", help="mevcut eşlemeler"); p.add_argument("--country")
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser("rule", help="turnuva+ülke varsayılanı")
    p.add_argument("--competition", required=True); p.add_argument("--season")
    p.add_argument("--country", required=True); p.add_argument("--channel", required=True)
    p.add_argument("--note", default=""); p.set_defaults(fn=cmd_rule)

    p = sub.add_parser("match", help="maç başına kesin kayıt")
    p.add_argument("--match", type=int, required=True)
    p.add_argument("--country", required=True); p.add_argument("--channel", required=True)
    p.set_defaults(fn=cmd_match)

    p = sub.add_parser("clear", help="eşleme kaldır")
    p.add_argument("--match", type=int); p.add_argument("--competition")
    p.add_argument("--season"); p.add_argument("--country", required=True)
    p.set_defaults(fn=cmd_clear)

    p = sub.add_parser("resolve", help="bir maçta ne çözülüyor")
    p.add_argument("--match", type=int, required=True)
    p.add_argument("--country", required=True); p.set_defaults(fn=cmd_resolve)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
