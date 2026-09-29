# -*- coding: utf-8 -*-
"""Projeksiyon backtest'i — model, görmediği bir sezona karşı.

İki kat:
  - AYAR katı  : 2024-25'i 2021-22…2023-24'ten tahmin et; sezon ağırlıkları
                 ve çekme ölçeği burada seçilir.
  - TEST katı  : 2025-26'yı 2022-23…2024-25'ten tahmin et; seçilen ayarla,
                 hiç dokunulmadan raporlanır. Sayfada yayınlanan sayı bu.

Kıyas tabanı: "geçen sezonun maç ortalaması" (çoğu sitenin fiilen yaptığı).
Model bunu yenmiyorsa karmaşıklığı haklı değildir.

Değerlendirme havuzu: hedef sezonda ≥20 maç oynayanlar. Yüzdeler için ≥150
deneme. Aralıklar (p10/p90) iki katın artıklarından, dakika kovasına göre.

Çıktı: data/fantasy_backtest.json
"""

from __future__ import annotations

import json
import sys
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.fantasy.projections import (  # noqa: E402
    PTS_WEIGHTS, SEASON_WEIGHTS, load_gamelogs, prev_season, project, _fp,
)

DATA_DIR = ROOT / "data"
TUNE_FOLD, TEST_FOLD = "2024-25", "2025-26"
MIN_GP_EVAL = 20
MIN_ATT_PCT = 150
EVAL_STATS = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M"]
MPG_BUCKETS = [(0, 15, "<15"), (15, 25, "15-25"), (25, 32, "25-32"), (32, 99, "32+")]
# Geçmiş maç oranı (son 3 sezon, ağırlıklı): sakatlığa yatkın / orta / dayanıklı
GP_HISTORY_BUCKETS = [(0, 0.6, "<60%"), (0.6, 0.8, "60-80%"), (0.8, 1.01, "80%+")]

WEIGHT_GRID = [(5, 3, 2), (6, 3, 1), (5, 4, 3), (7, 2, 1)]
K_SCALE_GRID = [0.5, 1.0, 2.0]


def actual_per_game(logs: pd.DataFrame) -> pd.DataFrame:
    g = logs.groupby("PLAYER_ID")
    act = g[EVAL_STATS + ["FGM", "FGA", "FTM", "FTA", "MIN"]].sum()
    act["GP"] = g.size()
    for s in EVAL_STATS + ["MIN"]:
        act[s] = act[s] / act["GP"]
    act["FG%"] = act["FGM"] / act["FGA"].replace(0, np.nan)
    act["FT%"] = act["FTM"] / act["FTA"].replace(0, np.nan)
    act["FP"] = _fp(act, PTS_WEIGHTS)
    return act


def _metrics(pred: pd.Series, true: pd.Series) -> dict:
    d = pd.concat([pred, true], axis=1, keys=["p", "t"]).dropna()
    if len(d) < 5:
        return {"n": len(d)}
    err = d["p"] - d["t"]
    return {"n": int(len(d)), "mae": round(float(err.abs().mean()), 3),
            "rmse": round(float(np.sqrt((err ** 2).mean())), 3),
            "corr": round(float(d["p"].corr(d["t"])), 4),
            "bias": round(float(err.mean()), 3)}


def run_fold(target: str, logs: dict, roster: pd.DataFrame, weights, k_scale) -> dict:
    act = actual_per_game(logs[target])
    evalp = act[act["GP"] >= MIN_GP_EVAL]
    proj = project(target, logs, roster, players=[int(p) for p in evalp.index],
                   weights=weights, k_scale=k_scale).set_index("PLAYER_ID")
    proj["FP"] = _fp(proj, PTS_WEIGHTS)

    last = actual_per_game(logs[prev_season(target)])
    last = last[last["GP"] >= 10]

    # Model ve baz AYNI oyuncularda kıyaslanır (geçen sezonu olanlar). Modelin
    # tüm havuzdaki hatası ayrıca raporlanır — çaylak/az maçlılar dahil, daha zor.
    common = evalp.index.intersection(last.index)
    res = {"model": {}, "baseline_last_season": {}, "model_all_players": {}}
    for s in EVAL_STATS + ["FP", "MIN"]:
        pcol = "PROJ_MPG" if s == "MIN" else s
        res["model"][s] = _metrics(proj[pcol].reindex(common), evalp.loc[common, s])
        res["baseline_last_season"][s] = _metrics(last.loc[common, s], evalp.loc[common, s])
        res["model_all_players"][s] = _metrics(proj[pcol], evalp[s])
    for pct, att in (("FG%", "FGA"), ("FT%", "FTA")):
        ok = evalp.loc[common][evalp.loc[common, att] >= MIN_ATT_PCT]
        res["model"][pct] = _metrics(proj[pct].reindex(ok.index), ok[pct])
        res["baseline_last_season"][pct] = _metrics(last[pct].reindex(ok.index), ok[pct])

    # Oynanan maç: hedefte oynayan ve önceki sezonda da oynamış herkes (0'lar dahil değil).
    both = act.index.intersection(last.index)
    gp_proj = project(target, logs, roster, players=[int(p) for p in both],
                      weights=weights, k_scale=k_scale).set_index("PLAYER_ID")["PROJ_GP"]
    res["model"]["GP"] = _metrics(gp_proj, act.loc[both, "GP"])
    res["baseline_last_season"]["GP"] = _metrics(last.loc[both, "GP"], act.loc[both, "GP"])

    ratios = (evalp["FP"] / proj["FP"]).replace([np.inf, -np.inf], np.nan)
    gp_full = project(target, logs, roster, players=[int(p) for p in both],
                      weights=weights, k_scale=k_scale).set_index("PLAYER_ID")
    gp_ratio = (act.loc[both, "GP"] / gp_proj.reindex(both)).replace([np.inf, -np.inf], np.nan)
    return {"metrics": res, "fp_ratio": ratios, "mpg": proj["PROJ_MPG"], "gp_ratio": gp_ratio,
            "hist_gp_rate": gp_full["HIST_GP_RATE"]}


def _score(fold: dict) -> float:
    """Ayar seçimi: maç başı Yahoo puanı MAE (tek sayı; tüm stat'ları taşıyor)."""
    return fold["metrics"]["model"]["FP"]["mae"]


def run(write: bool = True) -> dict:
    logs = load_gamelogs([prev_season(TEST_FOLD, i) for i in range(0, 5)])
    roster = pd.read_parquet(DATA_DIR / "2026-27__rosters.parquet")

    grid = []
    for w, k in product(WEIGHT_GRID, K_SCALE_GRID):
        f = run_fold(TUNE_FOLD, logs, roster, w, k)
        grid.append({"weights": list(w), "k_scale": k, "fp_mae": _score(f)})
        print(f"[tune] weights={w} k_scale={k}: FP MAE {_score(f):.3f}")
    best = min(grid, key=lambda g: g["fp_mae"])
    w, k = tuple(best["weights"]), best["k_scale"]

    tune = run_fold(TUNE_FOLD, logs, roster, w, k)
    test = run_fold(TEST_FOLD, logs, roster, w, k)

    ranges = {}
    fp_r = pd.concat([tune["fp_ratio"], test["fp_ratio"]])
    mpg = pd.concat([tune["mpg"], test["mpg"]])
    for lo, hi, name in MPG_BUCKETS:
        r = fp_r[(mpg >= lo) & (mpg < hi)].dropna()
        if len(r) >= 10:
            ranges[name] = {"p10": round(float(r.quantile(0.1)), 3),
                            "p90": round(float(r.quantile(0.9)), 3), "n": int(len(r))}
    gp_r = pd.concat([tune["gp_ratio"], test["gp_ratio"]])
    hist = pd.concat([tune["hist_gp_rate"], test["hist_gp_rate"]]).reindex(gp_r.index)
    # Maç aralığı geçmişe göre: tek aralık dayanıklı bir yıldıza da sakatlık
    # geçmişi olan birine de aynı 24-82 bandını veriyordu.
    gp_ranges = {}
    for lo, hi, name in GP_HISTORY_BUCKETS:
        r = gp_r[(hist >= lo) & (hist < hi)].dropna()
        if len(r) >= 20:
            gp_ranges[name] = {"p10": round(float(r.quantile(0.1)), 3),
                               "p90": round(float(r.quantile(0.9)), 3), "n": int(len(r))}
    gp_r = gp_r.dropna()

    report = {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
        "chosen": {"weights": list(w), "k_scale": k, "default_weights": list(SEASON_WEIGHTS)},
        "tuning_grid": grid,
        "folds": {TUNE_FOLD: {"role": "tune", **tune["metrics"]},
                  TEST_FOLD: {"role": "test", **test["metrics"]}},
        "fp_ratio_ranges_by_mpg": ranges,
        "gp_ratio_ranges_by_history": gp_ranges,
        "gp_ratio_range": {"p10": round(float(gp_r.quantile(0.1)), 3),
                           "p90": round(float(gp_r.quantile(0.9)), 3), "n": int(len(gp_r))},
        "notes": [
            "Evaluation pool: players with at least 20 games in the target season.",
            "Baseline: each player's previous-season per-game average (players with 10+ games).",
            "Rookie baselines use only draft classes before the target season; players who left the league are missing, so late-pick baselines lean optimistic.",
        ],
    }
    if write:
        (DATA_DIR / "fantasy_backtest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"[build] backtest yazıldı — seçilen weights={w} k_scale={k}")
    return report


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    rep = run()
    for fold, body in rep["folds"].items():
        print(f"\n== {fold} ({body['role']})")
        for s in ["FP", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "FG%", "FT%", "MIN", "GP"]:
            m, b = body["model"].get(s, {}), body["baseline_last_season"].get(s, {})
            print(f"  {s:5} model MAE {m.get('mae')} corr {m.get('corr')} bias {m.get('bias')} | "
                  f"baseline MAE {b.get('mae')} corr {b.get('corr')} (n={m.get('n')}/{b.get('n')})")
    print("\nranges", rep["fp_ratio_ranges_by_mpg"], "gp", rep["gp_ratio_ranges_by_history"])
