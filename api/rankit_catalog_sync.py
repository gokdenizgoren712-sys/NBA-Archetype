"""RankIt katalogu: once ilk aktarim, sonra DUZENLI fikstur kesfi.

Neden duzenli
-------------
Bu is eskiden TEK SEFERLIKTI: `rankit_catalog_v040` bir kez basarili olunca
worker hic baslamiyordu. Canli guncelleyici (rankit_live_sync) ise yalnizca
VAR OLAN satirlarin saatini, durumunu ve skorunu gunceller; yeni fikstur
EKLEMEZ. Iki kural yan yana durunca, ilk aktarimdan sonra yayimlanan hicbir
fikstur canli veritabanina gelmiyordu.

Olculdu (2026-09-15, primaryarch.net, salt okunur istekler): aktarim 28
Agustos'ta, UEFA lig asamasi kurasinin ertesi gunu kostu. Lig asamasi slotlari
o an tur kodu tasimadigi icin (sync_football, mode == "uefa") atlandi ve bir
daha eklenmedi. UCL 2026-27: production 90 mac, FotMob 234. UEL: 82 / 226.
10 Eylul UCL gecesi icin ana ekran 0 mac donduruyordu.

Kurallar
--------
* Ilk aktarim aynen kaliyor (iki sezon; basarisizsa 10 dakikada bir tekrar).
* Sonra her REFRESH_HOURS saatte bir YALNIZCA guncel sezon yeniden taraniyor;
  onceki sezon ancak hala oynanacak maci varsa. Senkron fonksiyonlari
  idempotent (ON CONFLICT upsert) ve kullanici icerigi tasiyan maci silmez.
* Birden fazla process: claim rankit_sync_state uzerinden, tur basina bir kez.
* Her calisma rankit_sync_runs'a yaziliyor. /sync-health production'da
  "never_run" diyordu; artik gercek turlari gosterir.

Railway volume'u deploy'lar arasinda korundugu icin durum DB'de tutulur.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone

from .db import get_conn
from .rankit_live_sync import background_jobs_enabled


JOB_NAME = "rankit_catalog_v040"          # ilk aktarim
REFRESH_JOB = "rankit_catalog_refresh"    # duzenli fikstur kesfi
RETRY_SECONDS = 10 * 60
REFRESH_HOURS = 6
# Saglayici 403/429 verip geri cekildiginde bir tur uzun surebilir
# (fetch_fotmob.api lig basina ~90 sn'ye kadar bekliyor, 16 lig). Basarisiz
# turun tekrari bundan kisa olsaydi ikinci bir process ayni isi ustune alirdi.
REFRESH_RETRY_MINUTES = 30
POLL_SECONDS = 5 * 60
OPEN_MATCH_DAYS = 3


def _already_done() -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT last_success FROM rankit_sync_state WHERE job_name=?",
            (JOB_NAME,),
        ).fetchone()
        return bool(row and row["last_success"])


def _mark_attempt() -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO rankit_sync_state(job_name,last_attempt,last_error)
               VALUES(?,datetime('now'),'')
               ON CONFLICT(job_name) DO UPDATE SET
                 last_attempt=datetime('now'),last_error=''""",
            (JOB_NAME,),
        )


def _mark_result(*, matches: int = 0, error: str = "") -> None:
    with get_conn() as conn:
        conn.execute(
            """UPDATE rankit_sync_state SET
                 last_success=CASE WHEN ?='' THEN datetime('now') ELSE last_success END,
                 last_error=?,updated_matches=? WHERE job_name=?""",
            (error, error[:1000], matches, JOB_NAME),
        )


def _sync_once() -> int:
    from src.rankit_sync import sync_euroleague, sync_football

    total = 0
    for season in ("2025-26", "2026-27"):
        euroleague = sync_euroleague(season)
        total += int(euroleague.get("matches", 0))
        print(f"[rankit-catalog] EuroLeague {season}: {euroleague}", flush=True)

        football = sync_football(season)
        total += int(football.get("matches", 0))
        print(f"[rankit-catalog] Football {season}: {football}", flush=True)
    return total


# ── Duzenli fikstur kesfi ────────────────────────────────────────────────────

def season_for(moment: datetime) -> str:
    """Avrupa sezonu Temmuz'da doner: 30 Haziran 2026 -> 2025-26, 1 Temmuz -> 2026-27."""
    start = moment.year if moment.month >= 7 else moment.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _previous(season: str) -> str:
    start = int(season.split("-")[0]) - 1
    return f"{start}-{str(start + 1)[-2:]}"


def seasons_to_refresh(conn, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    current = season_for(now)
    previous = _previous(current)
    # Onceki sezon, ancak hala oynanacak maci varsa (ertelenmis mac, EuroLeague
    # Final Four) taraniyor. Durumu guncellenmemis gecmis bir "upcoming"
    # kalintisi tek basina yetmez -- yoksa biten sezon her turda yeniden inerdi.
    since = (now - timedelta(days=OPEN_MATCH_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    still_open = conn.execute(
        """SELECT 1 FROM rankit_matches
           WHERE season=? AND provider IN ('fotmob','euroleague')
             AND status IN ('upcoming','live')
             AND datetime(starts_at) >= datetime(?)
           LIMIT 1""",
        (previous, since)).fetchone()
    return [previous, current] if still_open else [current]


def claim_refresh() -> bool:
    """Bu process turu alabilir mi? Basari REFRESH_HOURS'ta bir, hata tekrari
    REFRESH_RETRY_MINUTES'ta bir; iki process ayni turu alamaz."""
    with get_conn() as conn:
        cur = conn.execute(
            f"""INSERT INTO rankit_sync_state(job_name,last_attempt,last_error)
                VALUES(?,datetime('now'),'')
                ON CONFLICT(job_name) DO UPDATE SET last_attempt=datetime('now')
                WHERE (last_success IS NULL
                       OR last_success < datetime('now','-{REFRESH_HOURS} hours'))
                  AND (last_attempt IS NULL
                       OR last_attempt < datetime('now','-{REFRESH_RETRY_MINUTES} minutes'))""",
            (REFRESH_JOB,))
        return cur.rowcount > 0


def _mark_refresh(ok: bool, note: str = "") -> None:
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO rankit_sync_state(job_name,last_attempt,last_success,last_error)
               VALUES(?,datetime('now'),CASE WHEN ? THEN datetime('now') END,?)
               ON CONFLICT(job_name) DO UPDATE SET
                 last_success=CASE WHEN ? THEN datetime('now') ELSE last_success END,
                 last_error=excluded.last_error""",
            (REFRESH_JOB, int(ok), note[:1000], int(ok)))


def refresh_catalog(now: datetime | None = None) -> dict:
    """Guncel sezonun fiksturlerini yeniden tara; yeni yayimlananlari ekle."""
    from src.rankit_sync import _run, sync_euroleague, sync_football

    with get_conn() as conn:
        seasons = seasons_to_refresh(conn, now)
    ok = True
    for season in seasons:
        # _run hatayi yutar ve rankit_sync_runs'a yazar: FotMob dusse bile
        # EuroLeague turu yapilmis olur (ve tersi).
        ok = _run("euroleague", lambda s=season: sync_euroleague(s), season) and ok
        ok = _run("football", lambda s=season: sync_football(s), season) and ok
    _mark_refresh(ok, "" if ok else "see rankit_sync_runs")
    return {"seasons": seasons, "ok": ok}


def _bootstrap() -> None:
    _mark_attempt()
    try:
        matches = _sync_once()
    except Exception as exc:
        _mark_result(error=str(exc))
        print(f"[rankit-catalog] failed, retrying later: {exc}", flush=True)
        time.sleep(RETRY_SECONDS)
        return
    _mark_result(matches=matches)
    # Ilk aktarim guncel sezonu zaten taradi; hemen ardindan ikinci kez taramasin.
    _mark_refresh(True)
    print(f"[rankit-catalog] completed: {matches} fixtures", flush=True)


def _worker() -> None:
    # Health-check'i ve ilk API yanitini katalog indirmeleriyle geciktirme.
    time.sleep(20)
    while True:
        try:
            if not _already_done():
                _bootstrap()
                continue
            if claim_refresh():
                print(f"[rankit-catalog] refresh: {refresh_catalog()}", flush=True)
        except Exception as exc:
            print(f"[rankit-catalog] refresh failed: {exc}", flush=True)
        time.sleep(POLL_SECONDS)


def start_rankit_catalog_sync() -> None:
    # Eskiden ilk aktarim bitmisse burada donuluyordu -- hatanin kendisi buydu.
    # Tek kapatma yolu ortak anahtar (testler, bakim).
    if not background_jobs_enabled():
        return
    threading.Thread(target=_worker, name="rankit-catalog-sync", daemon=True).start()
