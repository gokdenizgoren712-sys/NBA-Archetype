# -*- coding: utf-8 -*-
"""Bir kullanıcıyı admin yapar (ya da --demote ile geri alır).

NEDEN GEREKLİ
─────────────
Sitedeki "admin invite code" ucu (/api/auth/promote) 2026-09 güvenlik
çalışmasında kaldırıldı — kod internetten sınırsız denenebiliyordu. Artık:
- Günlük yol: bir admin, admin panelinde (Admin → Users) "Make admin" /
  "Remove admin" ile atar (PATCH /api/admin/users/{id} {"role": ...}).
- Bu betik: İLK admini atamak ya da panele erişen admin kalmadığında kurtarmak.
`require_admin` rolü her istekte veritabanından okur.

- Yerelde: yerel DB'de test kullanıcıları var, hiçbiri admin değil; lokalde
  `/admin/photo-layout` gibi sayfalar bunun için açılmıyor.
- Canlıda: betiği SUNUCUNUN İÇİNDE çalıştır (Railway: `railway ssh`, sonra
  aşağıdaki komut). DB_PATH orada zaten canlı veritabanını gösterir.

KULLANIM
────────
1) Siteye normal şekilde KAYIT OL (lokalde, kendi e-postanla).
2) Sonra bu betiği çalıştır:

       python src/make_admin.py --email seninmail@ornek.com

   ya da kullanıcı adıyla:

       python src/make_admin.py --username gokdeniz

3) Yeniden giriş gerekmez: rol her istekte veritabanından okunuyor.

Listelemek için argümansız çalıştır.

DİKKAT: kendi makinenden canlı veritabanına DB_PATH ile işaret etme —
canlıda betiği sunucunun kendi kabuğunda çalıştır.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = Path(os.environ.get("DB_PATH", ROOT / "data" / "app.db"))


def rows(conn):
    return conn.execute(
        "SELECT id, username, email, role FROM users ORDER BY id").fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email")
    ap.add_argument("--username")
    ap.add_argument("--demote", action="store_true", help="admin -> user")
    a = ap.parse_args()

    if not DB.exists():
        raise SystemExit(f"[HATA] veritabani yok: {DB}")

    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row

    if not a.email and not a.username:
        print(f"veritabani: {DB}\n")
        print(f"{'id':>4}  {'kullanici':22}{'e-posta':34}rol")
        for r in rows(conn):
            mark = "  <-- ADMIN" if r["role"] == "admin" else ""
            print(f"{r['id']:>4}  {str(r['username']):22}{str(r['email']):34}{r['role']}{mark}")
        print("\nBirini admin yapmak icin:")
        print("  python src/make_admin.py --email <e-posta>")
        return

    field, value = ("email", a.email) if a.email else ("username", a.username)
    role = "user" if a.demote else "admin"
    cur = conn.execute(f"UPDATE users SET role=? WHERE {field}=?", (role, value))
    conn.commit()
    if cur.rowcount == 0:
        print(f"[HATA] {field}={value} bulunamadi. Once siteden kayit olun.")
        print("\nMevcut kullanicilar:")
        for r in rows(conn):
            print(f"  {r['username']}  <{r['email']}>  role={r['role']}")
        sys.exit(1)

    print(f"[OK] {value} -> role={role}")
    print("Rol her istekte veritabanindan okunuyor; yeniden giris gerekmez.")


if __name__ == "__main__":
    main()
