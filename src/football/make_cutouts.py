# -*- coding: utf-8 -*-
"""Oyuncu fotoğraflarını yüksek çözünürlükte yeniden çeker ve arka planı kaldırır.

NEDEN
─────
İlk çekim `pithumbsize=256` istemişti; gelen dosyalar ~330px genişlikte.
Kart fotoğrafı 236px yükseklikte gösteriyor, yani retina ekranda zaten sınırda
ve kesme (cutout) için fazlasıyla düşük. Wikimedia orijinali tutuyor, aynı
API'den 960px'e kadar isteyebiliyoruz — arama adımı da gerekmiyor, manifest
her oyuncunun sayfa adını (`source`) zaten saklıyor.

Wikimedia'nın infobox fotoğrafı futbolcularda neredeyse hep maç günü portresi:
özne net, arka plan bokeh kalabalık. Arka plan kaldırmanın en kolay hâli, ve
denemede (Haaland, Saka, Salah, Cherki) saç/omuz kenarları temiz çıktı.

LİSANS — DİKKAT
───────────────
Arka planı kaldırmak TÜREV ESER üretir. İndirilen 1717 fotoğrafın 1679'u
atıf zorunlu lisansta; bunların büyük kısmı CC BY-SA, yani türev de AYNI
lisansla paylaşılmak zorunda ve "değiştirildi" notu düşülmeli. Manifest
`artist` / `license` alanlarını taşıyor (1713'ünde dolu); kesilmiş sürümün
manifesti bunları `modified: true` ile birlikte devralıyor. Atıf arayüzde
gösterilmeden bu görseller yayına çıkmamalı.

ÇIKTI: frontend/public/football-cutouts/{PLAYER_ID}.webp  (+ manifest)
Mevcut .jpg'lere DOKUNMAZ — geri dönülebilir kalsın diye ayrı klasör.
"""

from __future__ import annotations

import argparse
import io
import json
import time
from pathlib import Path

import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
SRC_MANIFEST = DATA / "football_photo_manifest.json"
OUT_DIR = ROOT / "frontend" / "public" / "football-cutouts"
OUT_MANIFEST = DATA / "football_cutout_manifest.json"

# Wikimedia UA politikasi iletisim adresi istiyor; genel bir UA daha sert
# kisiliyor. Site adresi yeterli, kisisel veri gerekmiyor.
UA = {"User-Agent": "PrimaryArch/1.0 (https://primaryarch.net; football archetype research)"}
WIKI = "https://en.wikipedia.org/w/api.php"
THUMB = 960          # Wikimedia mevcut en yakın boyutu döner
PAUSE = 1.2          # API — 0.7'de 25 kayitin 8'i 429 aldi (olculdu)
IMG_PAUSE = 2.0      # upload.wikimedia.org daha sıkı: 1.0'da 13/17 429
COOLDOWN = 60        # 429 uzerine bu kadar bekle (Retry-After yoksa)
ALPHA_MIN = 12       # bu değerin altındaki alfa "arka plan" sayılır
MIN_BLOB = 0.02      # en büyük bölgenin %2'sinden küçük parçalar atılır
# Kart fotoğrafı 236px yükseklikte gösteriliyor; 2x ekranda 472px gerekiyor.
# 600 hem rahat bir pay bırakıyor hem dosyayı 900px'e göre ~3 kat küçültüyor
# (900px'te 1717 dosya 97 MB tutuyordu — mevcut jpg setinden bile büyük).
TARGET_H = 600


def largest_component(alpha: np.ndarray) -> np.ndarray:
    """Yalnızca en büyük bağlı alfa bölgesini tut.

    rembg bazen arka plandan kopuk parçalar bırakıyor (yan taraftaki başka bir
    oyuncunun forması, tribün lekesi). Bunlar kartta havada duran renk
    parçaları olarak görünüyor. Özne tek ve bitişik olduğu için en büyük
    bileşeni tutmak temiz bir kural.
    """
    try:
        from scipy import ndimage
    except ImportError:
        return alpha                      # scipy yoksa dokunma
    mask = alpha > ALPHA_MIN
    lab, n = ndimage.label(mask)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    big = sizes.max()
    out = alpha.copy()
    for i in range(1, n + 1):
        if i != keep and sizes[i - 1] < big * MIN_BLOB:
            out[lab == i] = 0
    return out


def _get(url, **kw):
    """429'u CİDDİYE ALAN istek.

    Önceki hâli 429'u sıradan bir hata sayıp 1.5-4.5s sonra tekrar deniyordu —
    hız sınırı penceresi bundan çok daha uzun, o yüzden üç deneme de aynı duvara
    çarpıyordu ve kayıt "kalıcı hata" diye işaretleniyordu. 2763 fotoğrafın
    1184'ü böyle düştü; hepsinin kaynağı ve lisansı geçerliydi, tek sorun
    tempoydu (ölçüldü: 0.7s/1.0s temposunda 25 kayıttan 21'i 429).

    Sunucu Retry-After veriyorsa ona uyuyoruz — tahmin etmekten iyisi."""
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, **kw)
        except Exception:
            time.sleep(3.0 * (attempt + 1))
            continue
        if r.status_code != 429:
            return r
        wait = COOLDOWN * (attempt + 1)
        ra = r.headers.get("Retry-After")
        if ra:
            try:
                wait = max(wait, int(float(ra)))
            except ValueError:
                pass
        print(f"    [429] {wait}s bekleniyor…", flush=True)
        time.sleep(wait)
    return None


def fetch_big(title: str) -> Image.Image | None:
    """Sayfanın infobox fotoğrafını büyük boyutta indirir.

    Toplu koşuda upload.wikimedia.org ara sıra görsel yerine hata sayfası
    dönüyor ("cannot identify image file"); aynı URL tek başına sorunsuz
    geliyor, yani kalıcı bir eksiklik değil hız sınırı. Üç deneme + artan
    bekleme bunu kapatıyor.
    """
    # API çağrısının kendisi de korumasız olamaz: hızlı ardışık isteklerde
    # Wikipedia JSON yerine hata sayfası döndürüyor ve .json() patlıyor
    # ("Expecting value: line 1 column 1").
    j = None
    for attempt in range(3):
        r = _get(WIKI, params={
            "action": "query", "titles": title, "redirects": 1,
            "prop": "pageimages", "piprop": "thumbnail",
            "pithumbsize": THUMB, "format": "json"}, timeout=25)
        if r is not None and r.status_code == 200 and                 r.headers.get("content-type", "").startswith("application/json"):
            try:
                j = r.json()
                break
            except Exception:
                pass
        time.sleep(2.0 * (attempt + 1))
    time.sleep(PAUSE)
    if j is None:
        return None
    pages = list(((j.get("query") or {}).get("pages") or {}).values())
    if not pages or "thumbnail" not in pages[0]:
        return None
    url = pages[0]["thumbnail"]["source"].split("?")[0]
    for attempt in range(3):
        r = _get(url, timeout=30)
        time.sleep(IMG_PAUSE)
        if r is not None and r.status_code == 200 and                 r.headers.get("content-type", "").startswith("image/"):
            try:
                return Image.open(io.BytesIO(r.content)).convert("RGB")
            except Exception:
                pass
        time.sleep(1.5 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="kaç oyuncu (deneme için)")
    ap.add_argument("--only", nargs="*", help="yalnızca bu sayfa adları")
    ap.add_argument("--force", action="store_true", help="mevcut çıktının üstüne yaz")
    args = ap.parse_args()

    from rembg import remove, new_session
    sess = new_session("u2net")

    src = json.loads(SRC_MANIFEST.read_text(encoding="utf-8"))
    todo = [(pid, v) for pid, v in src.items() if v.get("status") == "ok"]
    if args.only:
        want = set(args.only)
        todo = [(p, v) for p, v in todo if v.get("source") in want]
    if args.limit:
        todo = todo[: args.limit]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = json.loads(OUT_MANIFEST.read_text(encoding="utf-8")) if OUT_MANIFEST.exists() else {}

    done = fail = skip = 0
    for i, (pid, v) in enumerate(todo, 1):
        dst = OUT_DIR / f"{pid}.webp"
        if dst.exists() and not args.force:
            skip += 1
            continue
        title = v.get("source")
        try:
            im = fetch_big(title)
            if im is None:
                fail += 1
                continue
            cut = remove(im, session=sess)                 # RGBA
            arr = np.array(cut)
            arr[..., 3] = largest_component(arr[..., 3])
            cut = Image.fromarray(arr)
            bbox = cut.getbbox()
            if bbox:
                cut = cut.crop(bbox)
            if cut.height > TARGET_H:
                w = round(cut.width * TARGET_H / cut.height)
                cut = cut.resize((w, TARGET_H), Image.LANCZOS)
            cut.save(dst, "WEBP", quality=88, method=6)
            out[pid] = {
                "file": dst.name, "source": title,
                "license": v.get("license"), "artist": v.get("artist"),
                # CC BY-SA türevleri aynı lisansla paylaşılmalı ve
                # değiştirildiği belirtilmeli — arayüz bunu göstermeli.
                "modified": "background removed",
                "w": cut.width, "h": cut.height,
            }
            done += 1
        except Exception as e:
            fail += 1
            print(f"  [hata] {title}: {e}")
        if i % 25 == 0:
            OUT_MANIFEST.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
            print(f"  {i}/{len(todo)}  uretildi={done} atlandi={skip} hata={fail}")

    OUT_MANIFEST.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    tot = sum(f.stat().st_size for f in OUT_DIR.glob("*.webp"))
    print(f"\n[OK] uretildi={done} atlandi={skip} hata={fail}")
    print(f"     {OUT_DIR}  ({tot/1e6:.1f} MB, {len(list(OUT_DIR.glob('*.webp')))} dosya)")
    print(f"     {OUT_MANIFEST.name}")


if __name__ == "__main__":
    main()
