# -*- coding: utf-8 -*-
"""RankIt Android yayınları — depolama ve dağıtım.

NEDEN VAR
─────────
Derlemeler tek makinede birikiyordu: artifacts/ altında sekiz APK, hangisinin
güncel olduğunu söyleyen bir kayıt yok, dosyanın bozulmadığını gösteren bir
sağlama yok, birine göndermek için de dosyayı elden geçirmek gerekiyor. Dağıtım
kararı sideload olduğuna göre (Play Store değil), o "elden geçirme" adımının
kendisi ürünün parçası — bu yüzden burada duruyor.

NE DEĞİL
────────
Genel bir dosya yükleme servisi değil. Yüklenen şeyin gerçekten bir APK olduğu
doğrulanıyor (zip imzası + içinde AndroidManifest.xml). Aksi hâlde admin
hesabını ele geçiren biri, sitenin alan adından istediği dosyayı dağıtabilirdi.

DOSYA NEREDE
────────────
Railway volume'unda, veritabanının yanında (DB_PATH'in dizini). Repoya girmiyor
(.gitignore'da *.apk zaten var) ve imaja da girmiyor — deploy'lar arasında
volume korunduğu için yayınlar deploy'dan bağımsız yaşıyor.

ERİŞİM
──────
Yükleme, listeleme ve silme ADMIN'e; indirme herkese açık ama LİSTELENMİYOR —
bağlantıyı bilen indirir. Küçük gruba sideload dağıtımın istediği tam olarak bu;
Play Store'a geçildiğinde bu katman yerini oraya bırakır.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .auth import require_admin
from .db import DB_PATH, get_conn

router = APIRouter(prefix="/api/rankit", tags=["RankIt releases"])

# Volume'un kökü veritabanıyla aynı yer: production'da /data, yerelde ./data.
RELEASE_DIR = Path(os.environ.get("RANKIT_RELEASE_DIR", str(DB_PATH.parent / "rankit-releases")))
MAX_BYTES = 200 * 1024 * 1024        # bugünkü APK ~4 MB; tavan kazara yüklemeye karşı
CHUNK = 1024 * 1024
CHANNELS = ("alpha", "beta", "release")
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.\-_+]{0,39}$")


def _safe_name(version_name: str, version_code: int) -> str:
    """Dosya adı KULLANICIDAN gelmiyor, kayıttan türetiliyor — yol geçişi (../)
    ya da sürpriz uzantı için açık kapı bırakmamak için."""
    slug = re.sub(r"[^0-9A-Za-z.\-_]", "-", version_name)[:40]
    return f"rankit-{slug}-{version_code}.apk"


def _looks_like_apk(path: Path) -> str:
    """Boşsa hata metni, sorun yoksa boş string.

    APK bir zip; içinde AndroidManifest.xml olmak zorunda. İkisini de kontrol
    etmek ucuz ve 'admin paneli üzerinden rastgele dosya dağıtımı'nı kapatıyor."""
    try:
        with path.open("rb") as fh:
            if fh.read(4) != b"PK\x03\x04":
                return "That file is not an APK (no zip signature)."
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            if "AndroidManifest.xml" not in names:
                return "That zip has no AndroidManifest.xml — not an Android package."
            if not any(n.endswith(".dex") for n in names):
                return "That APK has no dex file — it would not install."
    except zipfile.BadZipFile:
        return "That file is not a readable zip."
    except Exception as exc:                                   # pragma: no cover
        return f"Could not inspect that file: {exc}"
    return ""


def _row(r) -> dict:
    d = dict(r)
    d.pop("file_name", None)          # disk düzeni dışarıya sızmasın
    d["download_url"] = f"/api/rankit/releases/{d['id']}/download"
    return d


# ── Admin ────────────────────────────────────────────────────────────────────

@router.post("/admin/releases")
async def upload_release(
    file: UploadFile = File(...),
    version_name: str = Form(...),
    version_code: int = Form(...),
    channel: str = Form("alpha"),
    notes: str = Form(""),
    user=Depends(require_admin),
):
    version_name = version_name.strip()
    if not VERSION_RE.match(version_name):
        raise HTTPException(400, "Version name must be letters, digits, dot, dash or underscore.")
    if version_code < 1:
        raise HTTPException(400, "Version code must be a positive integer.")
    if channel not in CHANNELS:
        raise HTTPException(400, f"Channel must be one of: {', '.join(CHANNELS)}")
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM rankit_app_releases WHERE version_code=?",
                        (version_code,)).fetchone():
            # Android aynı versionCode'u güncelleme saymaz; sessizce ikinci bir
            # kayıt yazmak "yükledim ama telefon güncellemiyor"a yol açardı.
            raise HTTPException(409, f"Version code {version_code} is already published.")

    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    name = _safe_name(version_name, version_code)
    dest = RELEASE_DIR / name
    tmp = dest.with_suffix(".part")

    # Diske AKITILIYOR, belleğe alınmıyor; sağlama aynı geçişte hesaplanıyor.
    digest = hashlib.sha256()
    size = 0
    try:
        with tmp.open("wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, f"That file is larger than {MAX_BYTES // (1024*1024)} MB.")
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "That file is empty.")
        problem = _looks_like_apk(tmp)
        if problem:
            raise HTTPException(400, problem)
        shutil.move(str(tmp), str(dest))
    except HTTPException:
        tmp.unlink(missing_ok=True)
        raise
    except Exception as exc:                                   # pragma: no cover
        tmp.unlink(missing_ok=True)
        raise HTTPException(500, f"Could not store that file: {exc}")

    sha = digest.hexdigest()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO rankit_app_releases
               (version_name,version_code,channel,notes,file_name,size_bytes,sha256,uploaded_by)
               VALUES(?,?,?,?,?,?,?,?)""",
            (version_name, version_code, channel, notes.strip()[:2000], name, size, sha,
             int(user["sub"])))
        row = conn.execute("""SELECT r.*,u.username uploader FROM rankit_app_releases r
            LEFT JOIN users u ON u.id=r.uploaded_by WHERE r.id=?""", (cur.lastrowid,)).fetchone()
    return _row(row)


@router.get("/admin/releases")
def list_releases(user=Depends(require_admin)):
    with get_conn() as conn:
        rows = conn.execute("""SELECT r.*,u.username uploader FROM rankit_app_releases r
            LEFT JOIN users u ON u.id=r.uploaded_by
            ORDER BY r.version_code DESC""").fetchall()
    out = [_row(r) for r in rows]
    # Diskte gerçekten var mı? Volume takılmadan deploy edilirse kayıt durur ama
    # dosya gitmiş olur — bunu panelde göstermek, indirince fark etmekten iyi.
    for item, row in zip(out, rows):
        item["file_present"] = (RELEASE_DIR / row["file_name"]).exists()
    return {"releases": out, "dir": str(RELEASE_DIR)}


@router.delete("/admin/releases/{release_id}")
def delete_release(release_id: int, user=Depends(require_admin)):
    with get_conn() as conn:
        row = conn.execute("SELECT file_name FROM rankit_app_releases WHERE id=?",
                           (release_id,)).fetchone()
        if not row:
            raise HTTPException(404, "No such release.")
        conn.execute("DELETE FROM rankit_app_releases WHERE id=?", (release_id,))
    (RELEASE_DIR / row["file_name"]).unlink(missing_ok=True)
    return {"ok": True}


# ── Açık uçlar (listelenmiyor) ───────────────────────────────────────────────

@router.get("/releases/latest")
def latest_release(channel: str = "alpha"):
    """Uygulamanın 'yeni sürüm var mı' sorusu ve indirme sayfasının kaynağı."""
    if channel not in CHANNELS:
        raise HTTPException(400, f"Channel must be one of: {', '.join(CHANNELS)}")
    with get_conn() as conn:
        row = conn.execute("""SELECT * FROM rankit_app_releases
            WHERE channel=? ORDER BY version_code DESC LIMIT 1""", (channel,)).fetchone()
    if not row:
        # 404 değil: "henüz yayın yok" bir hata değil, geçerli bir cevap.
        return {"release": None, "channel": channel}
    return {"release": _row(row), "channel": channel}


@router.get("/releases/{release_id}/download")
def download_release(release_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM rankit_app_releases WHERE id=?",
                           (release_id,)).fetchone()
    if not row:
        raise HTTPException(404, "No such release.")
    path = RELEASE_DIR / row["file_name"]
    if not path.exists():
        # Kayıt var, dosya yok: volume takılı değil ya da silinmiş.
        raise HTTPException(410, "That build is no longer stored on the server.")
    return FileResponse(
        path,
        media_type="application/vnd.android.package-archive",
        filename=f"RankIt-{row['version_name']}.apk",
        headers={"X-Checksum-SHA256": row["sha256"]},
    )
