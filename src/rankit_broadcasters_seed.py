# -*- coding: utf-8 -*-
"""RankIt yayıncı katmanı — kanal listesi tohumu (GB / US / TR).

NE TOHUMLANIYOR, NE TOHUMLANMIYOR
─────────────────────────────────
Burada YALNIZCA kanal adları var. "Sky Sports diye bir yayıncı var" doğrulanabilir
bir olgu; "Premier League'in GB hakları Sky'da" ise sezondan sezona değişen bir
İDDİA ve bu dosyanın onu uydurma hakkı yok. Yanlış kanal göstermek, hiç kanal
göstermemekten kötü — ürün kararı da bu yönde (bkz. api/db.py'deki tablo notu).

Bu yüzden `rankit_broadcast_rules` ve `rankit_broadcasts` BOŞ bırakılıyor:
turnuva-ülke eşlemesini yönetim ekranından insan giriyor, kaynağı ve doğrulanma
tarihi kayda geçiyor.

Kullanım:
    python src/rankit_broadcasters_seed.py            # ekle/güncelle
    python src/rankit_broadcasters_seed.py --list     # mevcut listeyi göster
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.db import get_conn, init_db   # noqa: E402

# (ülke, ad, tür, url)
# Kapsam kullanıcı kararı: şimdilik yalnız GB, US, TR.
BROADCASTERS: list[tuple[str, str, str, str | None]] = [
    # ── Birleşik Krallık ────────────────────────────────────────────────────
    ("GB", "Sky Sports",        "tv",        "https://www.skysports.com"),
    ("GB", "TNT Sports",        "tv",        "https://www.tntsports.co.uk"),
    ("GB", "BBC",               "tv",        "https://www.bbc.co.uk/sport"),
    ("GB", "ITV",               "tv",        "https://www.itv.com/sport"),
    ("GB", "Amazon Prime Video", "streaming", "https://www.primevideo.com"),
    ("GB", "Premier Sports",    "tv",        "https://www.premiersports.com"),
    ("GB", "DAZN",              "streaming", "https://www.dazn.com"),
    ("GB", "NBA League Pass",   "streaming", "https://www.nba.com/watch"),

    # ── Amerika Birleşik Devletleri ─────────────────────────────────────────
    ("US", "ESPN",              "tv",        "https://www.espn.com"),
    ("US", "ABC",               "tv",        "https://abc.com"),
    ("US", "TNT",               "tv",        "https://www.tntdrama.com"),
    ("US", "NBC",               "tv",        "https://www.nbcsports.com"),
    ("US", "CBS",               "tv",        "https://www.cbssports.com"),
    ("US", "FOX",               "tv",        "https://www.foxsports.com"),
    ("US", "Peacock",           "streaming", "https://www.peacocktv.com"),
    ("US", "Paramount+",        "streaming", "https://www.paramountplus.com"),
    ("US", "Apple TV",          "streaming", "https://tv.apple.com"),
    ("US", "Amazon Prime Video", "streaming", "https://www.primevideo.com"),
    ("US", "NBA League Pass",   "streaming", "https://www.nba.com/watch"),

    # ── Türkiye ─────────────────────────────────────────────────────────────
    ("TR", "beIN SPORTS",       "tv",        "https://www.beinsports.com.tr"),
    ("TR", "S Sport",           "tv",        "https://www.ssport.tv"),
    ("TR", "S Sport Plus",      "streaming", "https://www.ssportplus.com"),
    ("TR", "Tabii",             "streaming", "https://www.tabii.com"),
    ("TR", "TRT Spor",          "tv",        "https://www.trtspor.com.tr"),
    ("TR", "TV8",               "tv",        "https://www.tv8.com.tr"),
    ("TR", "Exxen",             "streaming", "https://www.exxen.com"),
    ("TR", "NBA League Pass",   "streaming", "https://www.nba.com/watch"),
]

COUNTRIES = ("GB", "US", "TR")


def seed() -> dict:
    init_db()
    added = kept = 0
    with get_conn() as conn:
        for country, name, kind, url in BROADCASTERS:
            row = conn.execute(
                "SELECT id FROM rankit_broadcasters WHERE country=? AND name=?",
                (country, name)).fetchone()
            if row:
                # url/kind değişmiş olabilir — adı anahtar, gerisi güncellenir.
                conn.execute("UPDATE rankit_broadcasters SET kind=?,url=? WHERE id=?",
                             (kind, url, row["id"]))
                kept += 1
            else:
                conn.execute(
                    "INSERT INTO rankit_broadcasters(country,name,kind,url) VALUES(?,?,?,?)",
                    (country, name, kind, url))
                added += 1
    return {"added": added, "updated": kept}


def show() -> None:
    with get_conn() as conn:
        for country in COUNTRIES:
            rows = conn.execute(
                "SELECT name,kind FROM rankit_broadcasters WHERE country=? ORDER BY name",
                (country,)).fetchall()
            print(f"\n{country} ({len(rows)})")
            for r in rows:
                print(f"  {r['name']:22s} {r['kind']}")
        rules = conn.execute("SELECT COUNT(*) n FROM rankit_broadcast_rules").fetchone()["n"]
        exact = conn.execute("SELECT COUNT(*) n FROM rankit_broadcasts").fetchone()["n"]
        print(f"\nturnuva-ülke kuralı: {rules}   maç başına kesin kayıt: {exact}")
        if not rules and not exact:
            print("Hiçbir eşleme yok — yayıncı alanı her maçta boş döner (kasıtlı).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="mevcut listeyi göster, yazma")
    a = ap.parse_args()
    if a.list:
        show()
    else:
        print(seed())
        show()
