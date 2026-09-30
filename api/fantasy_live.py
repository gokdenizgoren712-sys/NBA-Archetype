"""Fantezi sezon içi projeksiyonunun sunucuda kendi kendine güncellenmesi (Faz 4).

RankIt canlı skor mekanizmasıyla (api/rankit_live_sync.py) aynı düzen: uygulama açılırken bir arka plan iş parçacığı
başlar; SQLite claim satırı birden fazla worker'ın aynı işi eşzamanlı yapmasını engeller. Her tur:
  yeni maç loglarını çek (nba_api, tek çağrı) → sezon öncesi projeksiyonu oynanan maçlarla harmanla → dosyayı atomik yaz.
API dosyanın mtime'ına bakıp kendiliğinden yeniden yükler (api/fantasy.py `_load`).

- Sezon açılış gecesinden önce hiçbir şey çağrılmaz.
- Railway diski geçici: her deploy'da image'daki sezon öncesi dosyadan başlanır, ilk turda (~45 sn sonra) yeniden hesaplanır.
- stats.nba.com hata verirse (engel, zaman aşımı) sezon öncesi projeksiyon olduğu gibi kalır; log'a yazılır, sonraki tur dener.
- Kapatmak: FANTASY_LIVE_UPDATES=0 (yalnız bu iş) ya da RANKIT_BACKGROUND_JOBS=0 (tüm arka plan işleri; testler bunu kullanır).
"""
from __future__ import annotations

import datetime as dt
import os
import threading
import time

import pandas as pd

from .db import get_conn
from .rankit_live_sync import background_jobs_enabled

JOB_NAME = "fantasy_inseason"
INTERVAL_MINUTES = 60
STARTUP_DELAY = 45          # deploy sonrası önce uygulama ısınsın, RankIt işleri önce çalışsın


def enabled() -> bool:
    return background_jobs_enabled() and os.environ.get("FANTASY_LIVE_UPDATES", "1") != "0"


def season_started(today: dt.date, opening_night: dt.date) -> bool:
    """Açılış gecesinden bir gün önce başla (saat dilimi payı); öncesinde nba_api'ye gitme."""
    return today >= opening_night - dt.timedelta(days=1)


def _opening_night() -> dt.date | None:
    from src.fantasy.update import DATA_DIR, SEASON
    p = DATA_DIR / f"{SEASON}__fantasy_weeks.parquet"
    if not p.exists():
        return None
    return pd.to_datetime(pd.read_parquet(p)["START"].iloc[0]).date()


def _claim() -> bool:
    with get_conn() as conn:
        cur = conn.execute(f"""INSERT INTO rankit_sync_state(job_name,last_attempt)
            VALUES(?,datetime('now'))
            ON CONFLICT(job_name) DO UPDATE SET last_attempt=datetime('now')
            WHERE last_attempt IS NULL OR last_attempt < datetime('now','-{INTERVAL_MINUTES} minutes')""", (JOB_NAME,))
        return cur.rowcount > 0


def tick(today: dt.date | None = None) -> dict | None:
    """Bir tur: sezon başladıysa ve claim alındıysa güncelle. Çalışmadıysa None."""
    opening = _opening_night()
    if opening is None or not season_started(today or dt.date.today(), opening):
        return None
    if not _claim():
        return None
    from src.fantasy.update import run_update
    return run_update(log=lambda m: print(m, flush=True))


def _worker() -> None:
    time.sleep(STARTUP_DELAY)
    while True:
        try:
            res = tick()
            if res is not None:
                print(f"[fantasy-live] {res}", flush=True)
        except Exception as exc:  # noqa: BLE001 — iş parçacığı asla ölmesin
            print(f"[fantasy-live] failed: {exc}", flush=True)
        time.sleep(300)         # claim satırı asıl sıklığı belirler (saatte bir); 5 dk'da bir yalnız bakar


def start_fantasy_live() -> None:
    if not enabled():
        return
    threading.Thread(target=_worker, name="fantasy-live-update", daemon=True).start()
