# -*- coding: utf-8 -*-
"""Fantezi veri hattı: maç logları → kadrolar → takvim → pozisyonlar →
backtest → projeksiyon → draft planları (API'nin okuduğu dosyalar).

Kullanım:
    python -m src.fantasy.build                     # cache'lenmiş olanı atla
    python -m src.fantasy.build --refresh-rosters   # kadroları yenile (sezon öncesi sık değişir)
    python -m src.fantasy.build --skip-backtest     # ayarı yeniden seçmeden projeksiyonu yenile
    python -m src.fantasy.build --skip-plans        # draft planlarını (~3 dk) atla

Maç logu sezonları: projeksiyon son 3 sezonu kullanacak, backtest ise
2025-26'yı ve 2024-25'i kendilerinden önceki üçer sezondan tahmin
edecek (iki kat) — o yüzden 5 sezon.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.fantasy_formats import FORMATS, DEFAULT_FORMAT  # noqa: E402
from src.fantasy.backtest import run as run_backtest  # noqa: E402
from src.fantasy.calendar import build_calendar  # noqa: E402
from src.fantasy.fetch import fetch_player_gamelogs, fetch_rosters  # noqa: E402
from src.fantasy.plans import build_plans  # noqa: E402
from src.fantasy.positions import build_positions  # noqa: E402
from src.fantasy.publish import build_projections  # noqa: E402

GAMELOG_SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
TARGET_SEASON = "2026-27"
STATS_SEASON = "2025-26"


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh-rosters", action="store_true")
    ap.add_argument("--refresh-gamelogs", action="store_true")
    ap.add_argument("--skip-backtest", action="store_true")
    ap.add_argument("--skip-plans", action="store_true")
    a = ap.parse_args(argv)

    for season in GAMELOG_SEASONS:
        fetch_player_gamelogs(season, refresh=a.refresh_gamelogs)
    rosters = fetch_rosters(TARGET_SEASON, refresh=a.refresh_rosters)
    build_calendar(TARGET_SEASON, playoff_weeks=FORMATS[DEFAULT_FORMAT]["playoff_weeks"])
    build_positions(rosters, stats_season=STATS_SEASON, target_season=TARGET_SEASON)
    if not a.skip_backtest:
        run_backtest()          # sezon ağırlıkları + çekme ölçeği + belirsizlik aralıkları
    build_projections(TARGET_SEASON)
    if not a.skip_plans:
        build_plans(TARGET_SEASON)   # projeksiyon değiştiyse planlar da eskidi


if __name__ == "__main__":
    main()
