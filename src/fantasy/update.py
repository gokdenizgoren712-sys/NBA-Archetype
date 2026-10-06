# -*- coding: utf-8 -*-
"""Sezon içi güncelleme (Faz 4): yeni maç loglarını çek → projeksiyonu yenile → dosyayı atomik yaz.

Asıl çalıştırıcı sunucudaki arka plan worker'ı (api/fantasy_live.py, saatte bir, RankIt canlı skor düzeniyle); bu CLI elle
kullanım / yedek içindir (`--push`: sunucu yerine yerelden main'e yayınlamak istenirse).

    python -m src.fantasy.update            # veriyi çeker, data/2026-27__fantasy_projections.parquet'i günceller
    python -m src.fantasy.update --push     # ayrıca YALNIZ o dosyayı main'e gönderir (Railway deploy eder)
    python -m src.fantasy.update --dry-run  # çekmeden / yazmadan ne yapacağını söyler

Tasarım:
- Başlangıç noktası HER ZAMAN sezon öncesi anlık görüntü (`..._projections_pre.parquet`, `build` yazar): güncelleme
  idempotent, üst üste binmez; parametreler değişirse tek komutla yeniden üretilir.
- Sezon başlamadıysa (log yok) hiçbir şey yazmadan çıkar.
- `--push`, çalışma dizinine dokunmaz: `origin/main` üzerinden geçici bir git worktree açar, yalnız güncellenen dosyayı
  kopyalar, commit eder, main'e gönderir ve worktree'yi siler. Yerel, gönderilmemiş commit'ler asla yayına gitmez.
- Sakatlık haberi yok: bkz. inseason.py.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.fantasy.inseason import PARAMS, update_projections  # noqa: E402

DATA_DIR = ROOT / "data"
SEASON = "2026-27"
PUBLISHED = DATA_DIR / f"{SEASON}__fantasy_projections.parquet"
PRE = DATA_DIR / f"{SEASON}__fantasy_projections_pre.parquet"


def refresh_projections(cur: pd.DataFrame, base: pd.DataFrame, params: dict | None = None, model: dict | None = None,
                        log: Callable[[str], None] = print) -> pd.DataFrame:
    """Saf fonksiyon: sezon öncesi taban + sezon içi loglar → yayınlanacak tablo (as-of ve zaman damgasıyla).
    Simülasyon modeli varsa kalan sezon için SI_* / SIM_* da yenilenir (`inseason_sim`); kurulamazsa tablo modelle yayınlanır, SIM_* kapalı kalır
    (API eski tarihli SIM_*'ı kullanmaz)."""
    new = update_projections(base, cur, params or PARAMS)
    as_of = str(cur["GAME_DATE"].max())
    new["INSEASON_AS_OF"] = as_of
    new["BUILT_AT"] = pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")
    if model is None:
        path = DATA_DIR / f"{SEASON}__fantasy_context_model.json"
        model = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    try:
        from src.fantasy.inseason_sim import attach_inseason_sim
        new = attach_inseason_sim(new, cur, model, as_of)
    except Exception as e:      # noqa: BLE001 — simülasyon hatası güncellemeyi durdurmasın
        log(f"[update] kalan sezon simülasyonu kurulamadı: {type(e).__name__}: {e}")
        new = new.drop(columns=[c for c in new.columns if c.startswith(("SIM_", "SI_"))])
    return new


def _atomic_write(df: pd.DataFrame, path: Path) -> None:
    """Geçici dosya + os.replace: API (mtime ile yeniden yükler) yarım dosya görmez."""
    tmp = path.with_name(path.name + ".tmp")
    df.to_parquet(tmp, index=False)
    os.replace(tmp, path)


def run_update(data_dir: Path = DATA_DIR, season: str = SEASON, fetcher: Callable[[str], pd.DataFrame] | None = None,
               log: Callable[[str], None] = print) -> dict:
    """Bir güncelleme turu (sunucu worker'ı ve CLI ortak kullanır).
    Dönüş: {"status": "updated" | "no_games" | "fetch_failed" | "no_base", ...}. Hata durumunda yayındaki dosyaya dokunmaz."""
    published = data_dir / f"{season}__fantasy_projections.parquet"
    pre = data_dir / f"{season}__fantasy_projections_pre.parquet"
    if not pre.exists():
        if not published.exists():
            return {"status": "no_base", "detail": "önce python -m src.fantasy.build"}
        snap = pd.read_parquet(published)
        if "INSEASON_AS_OF" in snap.columns:
            return {"status": "no_base", "detail": "yayındaki dosya zaten güncellenmiş ve _pre yok: build'i yeniden koş"}
        _atomic_write(snap, pre)
        log(f"[update] sezon öncesi anlık görüntü yazıldı: {pre.name}")
    if fetcher is None:
        from src.fantasy.fetch import fetch_player_gamelogs
        fetcher = lambda s: fetch_player_gamelogs(s, refresh=True)   # noqa: E731
    try:
        cur = fetcher(season)
    except Exception as e:      # noqa: BLE001 — sezon başlamamış ya da API hatası: dosyaya dokunma
        return {"status": "fetch_failed", "detail": f"{type(e).__name__}: {e}"}
    if cur is None or len(cur) == 0 or int((cur["MIN"] > 0).sum()) == 0:
        return {"status": "no_games"}
    new = refresh_projections(cur, pd.read_parquet(pre))
    _atomic_write(new, published)
    return {"status": "updated", "as_of": str(new["INSEASON_AS_OF"].iloc[0]),
            "players_updated": int((new["INSEASON_GP"] > 0).sum()), "players": int(len(new))}


def _git(*args: str, cwd: Path) -> str:
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


def publish(files: list[Path], message: str, attempts: int = 2, root: Path = ROOT) -> bool:
    """origin/main üzerinde geçici worktree'de commit + push. Değişiklik yoksa False. `root`: git deposu (testte geçici)."""
    for attempt in range(attempts):
        _git("fetch", "-q", "origin", "main", cwd=root)
        wt = Path(tempfile.mkdtemp(prefix="pa-fantasy-update-"))
        _git("worktree", "add", "-q", "--detach", str(wt), "origin/main", cwd=root)
        try:
            for f in files:
                dst = wt / f.relative_to(root)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dst)
                _git("add", "-f", str(f.relative_to(root)), cwd=wt)
            if not _git("status", "--porcelain", cwd=wt):
                return False
            _git("commit", "-q", "-m", message, cwd=wt)
            try:
                _git("push", "-q", "origin", "HEAD:main", cwd=wt)
                return True
            except RuntimeError:
                if attempt == attempts - 1:
                    raise                                      # main o arada ilerledi: bir kez daha dene
        finally:
            _git("worktree", "remove", "--force", str(wt), cwd=root)
    return False


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--push", action="store_true", help="güncellenen projeksiyonu main'e gönder")
    ap.add_argument("--dry-run", action="store_true", help="çekme / yazma yok")
    ap.add_argument("--no-fetch", action="store_true", help="loglar zaten güncel; yeniden çekme")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if args.dry_run:
        print("[update] dry-run: loglar çekilir, projeksiyon güncellenir" + (", main'e gönderilir" if args.push else ""))
        return 0
    fetcher = None
    if args.no_fetch:
        fetcher = lambda s: pd.read_parquet(DATA_DIR / f"{s}__player_gamelogs.parquet")   # noqa: E731
    res = run_update(fetcher=fetcher)
    print(f"[update] {res}")
    if res["status"] == "no_base":
        return 1
    if res["status"] == "updated" and args.push:
        pushed = publish([PUBLISHED], f"Fantasy: sezon ici projeksiyon guncellemesi ({res['as_of']})")
        print("[update] main'e gönderildi" if pushed else "[update] yayında değişiklik yok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
