"""RankIt v0.4 katalog verisini canlı SQLite'a tek seferlik aktarır.

Railway volume'u deploy'lar arasında korunduğu için başarı durumu DB'de tutulur.
İş yarıda kalırsa senkron fonksiyonları idempotent olduğundan sonraki deneme
kaldığı yerden güvenle devam eder.
"""
from __future__ import annotations

import threading
import time

from .db import get_conn


JOB_NAME = "rankit_catalog_v040"
RETRY_SECONDS = 10 * 60


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


def _worker() -> None:
    # Health-check'i ve ilk API yanıtını katalog indirmeleriyle geciktirme.
    time.sleep(20)
    while not _already_done():
        _mark_attempt()
        try:
            matches = _sync_once()
            _mark_result(matches=matches)
            print(f"[rankit-catalog] completed: {matches} fixtures", flush=True)
            return
        except Exception as exc:
            _mark_result(error=str(exc))
            print(f"[rankit-catalog] failed, retrying later: {exc}", flush=True)
            time.sleep(RETRY_SECONDS)


def start_rankit_catalog_sync() -> None:
    if _already_done():
        return
    threading.Thread(target=_worker, name="rankit-catalog-sync", daemon=True).start()
