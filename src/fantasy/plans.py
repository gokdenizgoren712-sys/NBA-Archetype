# -*- coding: utf-8 -*-
"""Draft planlarını önceden hesaplar — yaygın ligler için.

Bir (format, takım sayısı, draft sırası) planı 9-cat'te ~8 sn sürüyor (6
strateji × 60 tam draft simülasyonu). İstek anında bekletmemek için Yahoo'nun
varsayılan formatları, 10 ve 12 takımlı liglerin her draft sırası için build
sırasında hesaplanıp dosyaya yazılır. Özel ligler istek anında, daha az
simülasyonla hesaplanır (api/fantasy_draft.py).

Çıktı: data/{season}__fantasy_plans.json
  {format_key: {"10": {"1": plan, ...}, "12": {...}}}
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy.draft import draft_plans, make_board  # noqa: E402
from src.fantasy.valuation import value_players  # noqa: E402

DATA_DIR = ROOT / "data"
PRECOMPUTED_FORMATS = ["yahoo_h2h_9cat", "yahoo_h2h_points", "yahoo_high_score"]
PRECOMPUTED_TEAMS = [10, 12]
SIMS = 60             # 30'da stratejiler arası fark tohum gürültüsünün içindeydi
SEED = 20261020        # açılış gecesi; aynı veriyle aynı planlar çıksın


def build_plans(season: str = "2026-27", write: bool = True) -> dict:
    proj = pd.read_parquet(DATA_DIR / f"{season}__fantasy_projections.parquet")
    tw = pd.read_parquet(DATA_DIR / f"{season}__fantasy_team_weeks.parquet")
    out: dict = {"season": season, "sims_per_plan": SIMS, "seed": SEED,
                 "built_at": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"), "formats": {}}
    t0 = time.time()
    for key in PRECOMPUTED_FORMATS:
        out["formats"][key] = {}
        for teams in PRECOMPUTED_TEAMS:
            fmt = get_format(key, teams=teams)
            board = make_board(value_players(proj, fmt, tw), fmt)
            out["formats"][key][str(teams)] = {
                str(slot): draft_plans(board, slot, sims=SIMS, seed=SEED + slot)
                for slot in range(1, teams + 1)
            }
            print(f"[plans] {key} {teams} takım — {time.time() - t0:.0f} sn")
    if write:
        (DATA_DIR / f"{season}__fantasy_plans.json").write_text(json.dumps(out), encoding="utf-8")
    return out
