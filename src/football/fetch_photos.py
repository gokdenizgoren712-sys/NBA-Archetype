# -*- coding: utf-8 -*-
"""Oyuncu fotoğrafları — Wikimedia Commons, LİSANS DOĞRULAMALI.

NEDEN BÖYLE
───────────
Media day / kulüp / ajans (Getty, Imago) fotoğrafları telifli; "lisanssız
kullanılabiliyor" yaygın bir yanlış bilgi. FotMob'un servis ettiği görseller de
FotMob'a lisanslı, bize değil. Bu yüzden tek kaynak Wikipedia/Commons ve
oradan da SADECE serbest lisanslı (CC / kamu malı) dosyalar alınır.

  1. Oyuncu adı Wikipedia'da aranır; sayfanın kısa açıklaması futbolcu
     olduğunu doğrulamıyorsa ATLANIR (aynı adlı başka kişiye düşmemek için)
  2. Sayfa görselinin Commons'taki lisansı okunur
  3. Lisans serbest listesinde değilse dosya ALINMAZ (fair-use olabilir)
  4. 256px küçük hâli indirilir (Wikimedia'yı hotlink'le yormamak için)
  5. Atıf bilgisi manifest'e yazılır — CC BY / BY-SA atıf ZORUNLU kılar,
     arayüzde gösterilmesi gerekiyor (bkz. frontend PhotoCredit)
"""

import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
OUT_DIR = ROOT / "frontend" / "public" / "football-photos"
MANIFEST = DATA / "football_photo_manifest.json"

UA = {"User-Agent": "PrimaryArch/1.0 (football archetype research)"}
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
PAUSE = 0.35        # API sorguları
IMG_PAUSE = 1.2     # görsel indirme — upload.wikimedia.org daha sıkı
THUMB = 256

# Serbest lisanslar. Listede OLMAYAN her şey reddedilir — "bilmiyorsak alma".
FREE_RE = re.compile(r"^(CC[ -]|Public domain|PD|GFDL|FAL|Copyrighted free)", re.I)
# Futbolcu olduğunu doğrulayan kısa açıklama
FOOT_RE = re.compile(r"foot|soccer|goalkeep|midfield|defender|striker|winger", re.I)


def _get(url, params):
    for i in range(3):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=25)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        time.sleep(1.5 * (i + 1))
    return None


def find_page(name):
    """Oyuncunun Wikipedia sayfası — futbolcu olduğu doğrulanmış."""
    for title in (name, f"{name} (footballer)"):
        j = _get(WIKI, {"action": "query", "titles": title, "redirects": 1,
                        "prop": "pageimages|description",
                        "piprop": "thumbnail|name", "pithumbsize": THUMB,
                        "format": "json"})
        time.sleep(PAUSE)
        if not j:
            continue
        pages = list(((j.get("query") or {}).get("pages") or {}).values())
        if not pages:
            continue
        p = pages[0]
        if "missing" in p or "thumbnail" not in p:
            continue
        desc = p.get("description") or ""
        if not FOOT_RE.search(desc):
            continue      # aynı adlı başka biri olabilir — atla
        return p
    # son çare: arama
    j = _get(WIKI, {"action": "query", "list": "search",
                    "srsearch": f"{name} footballer", "srlimit": 1,
                    "format": "json"})
    time.sleep(PAUSE)
    hits = ((j or {}).get("query") or {}).get("search") or []
    if not hits:
        return None
    return find_page(hits[0]["title"]) if hits[0]["title"] != name else None


def download(url):
    """Görsel indirir. upload.wikimedia.org API'den DAHA SIKI hız sınırlıyor —
    ilk denemede 0.35 sn aralıkla 12 oyuncunun 4'ü 429 yedi. Ayrı ve daha
    uzun bekleme + üstel geri çekilme."""
    for i in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            if r.status_code == 200 and len(r.content) > 500:
                time.sleep(IMG_PAUSE)
                return r.content
            if r.status_code == 429:
                time.sleep(8 * (i + 1))
                continue
            return None
        except Exception:
            time.sleep(3 * (i + 1))
    return None


def license_of(filename):
    j = _get(COMMONS, {"action": "query", "titles": f"File:{filename}",
                       "prop": "imageinfo", "iiprop": "extmetadata",
                       "format": "json"})
    time.sleep(PAUSE)
    pages = ((j or {}).get("query") or {}).get("pages") or {}
    if not pages:
        return None, None
    ii = (list(pages.values())[0].get("imageinfo") or [{}])[0]
    em = ii.get("extmetadata") or {}
    lic = (em.get("LicenseShortName") or {}).get("value")
    artist = re.sub(r"<[^>]+>", "", (em.get("Artist") or {}).get("value", "")).strip()
    return lic, artist[:80]


def run(season="2025-2026", limit=None):
    if season == "all":
        # TÜM sezonların benzersiz oyuncuları. Arşiv 2016/17'ye kadar indiği
        # için tek sezonla tarayınca eski kadroların büyük kısmı fotoğrafsız
        # kalıyordu. Manifest zaten taranmışları atladığı için bu koşu
        # artımlıdır: sadece yeni oyuncu id'leri için istek atılır.
        fs = sorted(DATA.glob("football__*__scores.parquet"))
        if not fs:
            print("[HATA] skor dosyası yok"); sys.exit(1)
        df = pd.concat([pd.read_parquet(f)[["PLAYER_ID", "PLAYER_NAME"]]
                        for f in fs], ignore_index=True)
        print(f"  {len(fs)} sezon birleştirildi")
    else:
        scores = DATA / f"football__{season}__scores.parquet"
        if scores.exists():
            df = pd.read_parquet(scores)
        else:
            fs = sorted(DATA.glob(f"football__*__{season}__fotmob.parquet"))
            if not fs:
                print("[HATA] veri yok"); sys.exit(1)
            df = pd.concat([pd.read_parquet(f) for f in fs], ignore_index=True)

    people = (df[["PLAYER_ID", "PLAYER_NAME"]].drop_duplicates("PLAYER_ID")
              .sort_values("PLAYER_NAME"))
    if limit:
        people = people.head(limit)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    man = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}

    hit = skip = rejected = 0
    for i, (_, r) in enumerate(people.iterrows(), 1):
        pid = str(int(r.PLAYER_ID))
        if pid in man:
            skip += 1
            continue
        page = find_page(r.PLAYER_NAME)
        if not page:
            man[pid] = {"status": "no_page"}
            continue
        fn = page.get("pageimage")
        lic, artist = license_of(fn) if fn else (None, None)
        if not lic or not FREE_RE.match(lic):
            man[pid] = {"status": "not_free", "license": lic}
            rejected += 1
            continue
        url = page["thumbnail"]["source"].split("?")[0]
        blob = download(url)
        if blob is None:
            man[pid] = {"status": "download_failed"}
            continue
        (OUT_DIR / f"{pid}.jpg").write_bytes(blob)
        man[pid] = {"status": "ok", "file": f"{pid}.jpg", "license": lic,
                    "artist": artist, "source": page.get("title", r.PLAYER_NAME)}
        hit += 1
        if i % 25 == 0:
            MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=1),
                                encoding="utf-8")
            print(f"  {i}/{len(people)}  bulundu={hit} reddedildi={rejected}")

    MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for v in man.values() if v.get("status") == "ok")
    print(f"\n[OK] {len(people)} oyuncu tarandi | fotograf={hit} yeni, {ok} toplam | "
          f"lisans reddi={rejected} | atlanan(zaten var)={skip}")
    print(f"     goruntuler: {OUT_DIR}")
    print(f"     manifest  : {MANIFEST.name}")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    run(args.season, args.limit)
