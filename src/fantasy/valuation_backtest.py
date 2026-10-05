# -*- coding: utf-8 -*-
"""Değerleme backtest'i — sıralamamız GERÇEKLEŞEN sezon değerini ne kadar iyi öngörüyor?

Strateji backtest'inin (strategy_backtest.py) aynı tarihsel tahtaları ve gerçek puanlaması üzerinde, ama
draft simülasyonu olmadan: her oyuncunun sezon sonu GERÇEK değeri (`actual_values`: sezon toplamlarının
formatın ölçüsüyle z toplamı) ile tahtadaki VALUE karşılaştırılır. Değerleme varyantlarını (örn. kaçırılan maçın yerine
gelen yedek üretimi, valuation.REPL_CREDIT) ucuza ve gürültüsüz kıyaslamak için.

Ölçüler (2024-25 ve 2025-26 hedefleri; yalnız tahtanın ilk 200'ü):
  spearman      : VALUE sırası ile gerçek değer sırası
  topN_actual   : tahtanın ilk N oyuncusunun ortalama GERÇEK değeri (N = 12, 36, 72, 156) — draft kararına en yakın ölçü
  inj_bias      : geçen sezon <45 maç + önceki sezon ≥62 maç oynayanlar ("sakatlıktan dönenler") için ortalama
                  (gerçek sıra − tahtadaki sıra): + = tahta onları olduğundan YUKARI koydu

    python -m src.fantasy.valuation_backtest
    python -m src.fantasy.valuation_backtest --credits 0 0.5 1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402
from src.fantasy.projections import load_gamelogs, prev_season  # noqa: E402
from src.fantasy.strategy_backtest import (  # noqa: E402
    ActualSeason, TARGETS, actual_values, historical_projections, season_calendar,
)

DATA_DIR = ROOT / "data"
TOP = 200


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))


def evaluate(fmt_key: str, proj: pd.DataFrame, tw: pd.DataFrame, weeks: pd.DataFrame, logs: pd.DataFrame,
             credit: float) -> dict:
    fmt = get_format(fmt_key)
    old = vl.REPL_CREDIT
    vl.REPL_CREDIT = credit
    try:
        b = dr.make_board(vl.value_players(proj, fmt, tw), fmt, shrink=1.0)      # büzme kapalı: saf değerleme
    finally:
        vl.REPL_CREDIT = old
    act = actual_values(ActualSeason(logs, weeks, fmt, b))
    order = np.argsort(-b.value)
    top = order[:TOP]
    out = {"spearman": round(_spearman(b.value[top], act[top]), 4)}
    for n in (12, 36, 72, b.teams * b.rounds):
        out[f"top{n}_actual"] = round(float(act[order[:n]].mean()), 3)
    # sakatlıktan dönenler
    df = b.df
    gp_hist = df["HIST_GP_RATE"].to_numpy(float)
    last_gp = df["LAST_GP"].to_numpy(float) if "LAST_GP" in df.columns else np.full(len(df), np.nan)
    inj = np.where((last_gp < 45) & (gp_hist >= 0.55))[0]
    inj = np.array([i for i in inj if i in set(top.tolist()) or True])
    act_rank = pd.Series(-act).rank().to_numpy()
    our_rank = pd.Series(-b.value).rank().to_numpy()
    if len(inj):
        out["inj_n"] = int(len(inj))
        out["inj_bias"] = round(float((act_rank[inj] - our_rank[inj]).mean()), 1)
    return out


def run(credits=(0.0, 0.25, 0.5, 0.75, 1.0), formats=("yahoo_h2h_9cat", "yahoo_h2h_points"), write: bool = True) -> dict:
    logs = load_gamelogs([prev_season(max(TARGETS), i) for i in range(0, 6)])
    roster = pd.read_parquet(DATA_DIR / "2026-27__rosters.parquet")
    res: dict = {}
    for target in TARGETS:
        proj = historical_projections(target, logs, roster)
        weeks, tw = season_calendar(target)
        for key in formats:
            for c in credits:
                r = evaluate(key, proj, tw, weeks, logs[target], c)
                res.setdefault(key, {}).setdefault(str(c), {})[target] = r
                print(f"[valbt] {target} {key} credit={c}: {r}")
    if write:
        (DATA_DIR / "fantasy_valuation_backtest.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--credits", type=float, nargs="*", default=[0.0, 0.25, 0.5, 0.75, 1.0])
    ap.add_argument("--formats", nargs="*", default=["yahoo_h2h_9cat"])
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    run(tuple(args.credits), tuple(args.formats))
