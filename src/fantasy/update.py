# -*- coding: utf-8 -*-
"""Günlük sezon içi güncelleme (Faz 4): yeni maç loglarını çek → projeksiyonu yenile → (isteğe bağlı) yayınla.

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
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.fantasy.inseason import PARAMS, update_projections  # noqa: E402

DATA_DIR = ROOT / "data"
SEASON = "2026-27"
PUBLISHED = DATA_DIR / f"{SEASON}__fantasy_projections.parquet"
PRE = DATA_DIR / f"{SEASON}__fantasy_projections_pre.parquet"


def refresh_projections(cur: pd.DataFrame, base: pd.DataFrame, params: dict | None = None) -> pd.DataFrame:
    """Saf fonksiyon: sezon öncesi taban + sezon içi loglar → yayınlanacak tablo (as-of ve zaman damgasıyla)."""
    new = update_projections(base, cur, params or PARAMS)
    new["INSEASON_AS_OF"] = str(cur["GAME_DATE"].max())
    new["BUILT_AT"] = pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds")
    return new


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

    if not PRE.exists():
        if not PUBLISHED.exists():
            print("[update] projeksiyon yok: önce python -m src.fantasy.build")
            return 1
        published = pd.read_parquet(PUBLISHED)
        if "INSEASON_AS_OF" in published.columns:
            print("[update] sezon öncesi anlık görüntü (_pre) yok ve yayındaki dosya zaten güncellenmiş: build'i yeniden koş")
            return 1
        published.to_parquet(PRE, index=False)
        print(f"[update] sezon öncesi anlık görüntü yazıldı: {PRE.name}")
    if args.dry_run:
        print("[update] dry-run: loglar çekilir, projeksiyon güncellenir" + (", main'e gönderilir" if args.push else ""))
        return 0

    from src.fantasy.fetch import fetch_player_gamelogs
    logs_path = DATA_DIR / f"{SEASON}__player_gamelogs.parquet"
    if args.no_fetch and logs_path.exists():
        cur = pd.read_parquet(logs_path)
    else:
        try:
            cur = fetch_player_gamelogs(SEASON, refresh=True)
        except Exception as e:      # noqa: BLE001 — sezon başlamamış ya da API hatası: dosyaya dokunma
            print(f"[update] maç logları alınamadı ({type(e).__name__}: {e}); değişiklik yok")
            return 0
    if cur is None or len(cur) == 0 or int((cur["MIN"] > 0).sum()) == 0:
        print("[update] henüz oynanmış maç yok; değişiklik yok")
        return 0

    base = pd.read_parquet(PRE)
    new = refresh_projections(cur, base)
    new.to_parquet(PUBLISHED, index=False)
    n_upd = int((new["INSEASON_GP"] > 0).sum())
    print(f"[update] {SEASON}: {new['INSEASON_AS_OF'].iloc[0]} tarihine kadar, {n_upd} oyuncu güncellendi ({len(new)} toplam)")

    if args.push:
        msg = f"Fantasy: sezon ici projeksiyon guncellemesi ({new['INSEASON_AS_OF'].iloc[0]})"
        pushed = publish([PUBLISHED], msg)
        print("[update] main'e gönderildi" if pushed else "[update] yayında değişiklik yok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
