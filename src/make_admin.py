# -*- coding: utf-8 -*-
"""Yerel geliştirme veritabanında bir kullanıcıyı admin yapar.

NEDEN GEREKLİ
─────────────
Admin sayfaları (`/admin/*`) `require_admin`'e bağlı ve o da JWT'deki
`role == "admin"` kontrolüne bakıyor. Yerel veritabanı production'ın kopyası
değil — içinde yalnızca test kullanıcıları var, hiçbiri admin değil. Dolayısıyla
lokalde `/admin/photo-layout` gibi sayfalar açılmıyor.

KULLANIM
────────
1) Siteye normal şekilde KAYIT OL (lokalde, kendi e-postanla).
2) Sonra bu betiği çalıştır:

       python src/make_admin.py --email seninmail@ornek.com

   ya da kullanıcı adıyla:

       python src/make_admin.py --username gokdeniz

3) Siteden ÇIKIP TEKRAR GİRİŞ YAP — rol JWT'nin içinde taşınıyor, eski
   oturumdaki token hâlâ "user" diyor.

Listelemek için argümansız çalıştır.

DİKKAT: bu yalnızca yerel geliştirme içindir. Production veritabanına
DB_PATH ile işaret etmeyin.
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
    print("\nSIRADAKI ADIM: siteden CIKIP TEKRAR GIRIS YAPIN.")
    print("Rol JWT'nin icinde tasiniyor; acik oturumdaki token hala eski rolu soyluyor.")


if __name__ == "__main__":
    main()
