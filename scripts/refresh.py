"""
Sezon veri yenileme — standalone çalıştırılabilir veya api/main.py'den import edilebilir.

Kullanım:
    python scripts/refresh.py             # 2025-26 sezonu
    python scripts/refresh.py 2024-25     # belirli sezon

Adımlar:
    1. src/fetch_data.py       — nba_api'den ham veri çek (parquet'e yaz)
    2. src/score_compat.py     — skor tablosu yeniden hesapla
    3. data/refresh_status.json — son çalışma zamanı ve durumunu kaydet
"""

import sys, subprocess, json, time
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
STATUS_FILE = ROOT / "data" / "refresh_status.json"

_refresh_thread = None


def refresh_current_season(season: str = "2025-26") -> dict:
    """
    Tam pipeline'ı çalıştırır: fetch → score → status yaz.
    Bloklamayan thread'den çağrıldığında arka planda çalışır.
    """
    started = datetime.now(timezone.utc).isoformat()
    _write_status({"status": "running", "started_at": started, "season": season, "last_run": None})

    t0 = time.monotonic()
    errors = []

    # Adım 1: veri çekme
    r1 = subprocess.run(
        [sys.executable, str(ROOT / "src" / "fetch_data.py")],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    if r1.returncode != 0:
        errors.append(f"fetch_data: {r1.stderr.strip()[-500:]}")

    # Adım 2: skor hesaplama (score_compat.py __main__)
    if not errors:
        r2 = subprocess.run(
            [sys.executable, str(ROOT / "src" / "score_compat.py")],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        if r2.returncode != 0:
            errors.append(f"score_compat: {r2.stderr.strip()[-500:]}")

    duration = round(time.monotonic() - t0, 1)
    finished = datetime.now(timezone.utc).isoformat()
    status_out = {
        "status":      "error" if errors else "ok",
        "started_at":  started,
        "last_run":    finished,
        "duration_s":  duration,
        "season":      season,
        "errors":      errors,
    }
    _write_status(status_out)
    return status_out


def _write_status(data: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(data, indent=2))


def read_status() -> dict:
    if not STATUS_FILE.exists():
        return {"status": "never_run"}
    try:
        return json.loads(STATUS_FILE.read_text())
    except Exception:
        return {"status": "unreadable"}


def is_running() -> bool:
    global _refresh_thread
    return _refresh_thread is not None and _refresh_thread.is_alive()


def start_refresh(season: str = "2025-26") -> None:
    """Non-blocking: arka planda refresh_current_season çalıştır."""
    import threading
    global _refresh_thread
    _refresh_thread = threading.Thread(
        target=refresh_current_season, args=(season,), daemon=True
    )
    _refresh_thread.start()


if __name__ == "__main__":
    season = sys.argv[1] if len(sys.argv) > 1 else "2025-26"
    print(f"Refreshing {season}…")
    result = refresh_current_season(season)
    print(json.dumps(result, indent=2))
