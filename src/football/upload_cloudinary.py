# -*- coding: utf-8 -*-
"""Cutout'ları Cloudinary'ye yükler ve public_id haritası üretir.

NEDEN CLOUDINARY
────────────────
1717 cutout ~65 MB. Repoya koymak git geçmişini kalıcı olarak şişiriyor,
Railway volume ise boş başlıyor ve doldurması ayrı iş — üstelik sonrasında
her görsel isteği FastAPI'den geçiyor, yani uygulama CDN işi yapıyor.
Cloudinary zaten kurulu (blog görselleri için) ve tam bu iş için tasarlanmış:
CDN, otomatik format (WebP/AVIF), otomatik boyut.

İKİ MOD
───────
signed   — CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET tanımlıysa. public_id'yi
           biz veriyoruz (football/{PLAYER_ID}), yeniden yükleme aynı adrese
           yazıyor, harita deterministik.
unsigned — yalnızca CLOUDINARY_UPLOAD_PRESET varsa. Cloudinary public_id'yi
           kendi atıyor (unsigned preset'te genelde public_id kilitli), o
           yüzden dönen değeri haritaya yazıyoruz.

Her iki modda da çıktı AYNI: data/football_cloudinary.json = {player_id:
public_id}. Ön yüz URL'i bundan kuruyor, dolayısıyla mod bir uygulama
ayrıntısı olarak kalıyor.

SIRLAR
──────
Anahtarlar YALNIZCA ortam değişkeninden okunur; bu dosyaya ya da repoya
hiçbir sır yazılmaz. Kullanım:
    setx CLOUDINARY_CLOUD_NAME  ...      (ya da $env:... / export)
    setx CLOUDINARY_API_KEY     ...
    setx CLOUDINARY_API_SECRET  ...
    python src/football/upload_cloudinary.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
CUT_DIR = ROOT / "frontend" / "public" / "football-cutouts"
OUT = DATA / "football_cloudinary.json"

FOLDER = "football"          # Cloudinary klasörü
PAUSE = 0.25


def _sign(params: dict, secret: str) -> str:
    """Cloudinary imzası: alfabetik param dizisi + secret'ın SHA-1'i."""
    raw = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k] != "")
    return hashlib.sha1((raw + secret).encode()).hexdigest()


def upload(path: Path, pid: str, cloud: str, key: str | None,
           secret: str | None, preset: str | None) -> str | None:
    url = f"https://api.cloudinary.com/v1_1/{cloud}/image/upload"
    with open(path, "rb") as fh:
        files = {"file": (path.name, fh)}
        if key and secret:
            params = {"public_id": f"{FOLDER}/{pid}",
                      "overwrite": "true",
                      "timestamp": str(int(time.time()))}
            params["signature"] = _sign(params, secret)
            params["api_key"] = key
            r = requests.post(url, data=params, files=files, timeout=60)
        else:
            r = requests.post(url, data={"upload_preset": preset,
                                         "folder": FOLDER},
                              files=files, timeout=60)
    if r.status_code != 200:
        return None
    return (r.json() or {}).get("public_id")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    cloud = os.environ.get("CLOUDINARY_CLOUD_NAME") or os.environ.get("VITE_CLOUDINARY_CLOUD_NAME")
    key = os.environ.get("CLOUDINARY_API_KEY")
    secret = os.environ.get("CLOUDINARY_API_SECRET")
    preset = os.environ.get("CLOUDINARY_UPLOAD_PRESET") or os.environ.get("VITE_CLOUDINARY_UPLOAD_PRESET")

    if not cloud:
        raise SystemExit("[HATA] CLOUDINARY_CLOUD_NAME tanimli degil")
    mode = "signed" if (key and secret) else ("unsigned" if preset else None)
    if not mode:
        raise SystemExit("[HATA] Ne API anahtari ne upload preset var — biri gerekli")
    print(f"cloud={cloud}  mod={mode}")

    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    files = sorted(CUT_DIR.glob("*.webp"))
    if a.limit:
        files = files[: a.limit]
    print(f"{len(files)} cutout, {len(done)} zaten yuklu\n")

    ok = fail = skip = 0
    for i, f in enumerate(files, 1):
        pid = f.stem
        if pid in done and not a.force:
            skip += 1
            continue
        try:
            public_id = upload(f, pid, cloud, key, secret, preset)
        except Exception as e:
            public_id = None
            print(f"  [hata] {pid}: {e}")
        if public_id:
            done[pid] = public_id
            ok += 1
        else:
            fail += 1
        time.sleep(PAUSE)
        if i % 50 == 0:
            OUT.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
            print(f"  {i}/{len(files)}  yuklendi={ok} atlandi={skip} hata={fail}")

    OUT.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
    print(f"\n[OK] yuklendi={ok} atlandi={skip} hata={fail}")
    print(f"     {OUT.name}  ({len(done)} kayit)")
    if fail and mode == "unsigned":
        print("\nNOT: unsigned preset'te toplu yukleme kisitli olabilir. Hatalar")
        print("     surüyorsa Cloudinary panelinden preset'i acin ya da signed")
        print("     mod icin CLOUDINARY_API_KEY/SECRET tanimlayin.")


if __name__ == "__main__":
    main()
