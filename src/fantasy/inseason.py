# -*- coding: utf-8 -*-
"""Sezon içi projeksiyon güncelleme (Faz 4): sezon öncesi projeksiyon "ön bilgi", oynanan maçlar kanıt.

Üç bileşen ayrı güncellenir (ayrı öğrenme hızları — dakika rolü hızlı değişir, dakika başı üretim yavaş,
maç oranı arada):
  1. Dakika başı üretim: r' = (r_ön · P_s + Σ üretim) / (P_s + Σ dakika); P_s stat'a göre ölçeklenir
     (gürültülü stat'lar — STL / BLK / 3PT — daha yavaş öğrenir, K_RATE ile aynı oranlar).
  2. Maç başı dakika: son R maçın ortalaması ile ön bilgi; ön bilgi km maç ağırlığında.
  3. Oynama oranı: p' = (p_ön · kg + oynanan) / (kg + takım maçı); tahmin edilen sezon maçı = oynanan + p'·kalan.
Yüzdeler deneme sayısıyla, DD2 / TD3 maç başı oranla harmanlanır. Parametreler backtest ile seçildi
(`python -m src.fantasy.inseason` → data/fantasy_inseason_backtest.json). Sakatlık haberi yok: şu an sakat olan
oyuncu, oynamadığı maçlar oynama oranını düşürene kadar sağlıklı görünür.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.fantasy.projections import (  # noqa: E402
    K_RATE, PTS_WEIGHTS, RATE_STATS, SEASON_WEIGHTS, TEAM_GAMES, load_gamelogs, prev_season, project,
)

DATA_DIR = ROOT / "data"

# Backtest ile seçildi (2024-25 ve 2025-26, takım başına 15 / 30 / 45 / 60 maçta kesme; 8 vaka; bkz. tune()).
# Kalan sezonda oyuncu başına Yahoo puanı MAE 4.97 → 3.61, dakika 4.61 → 3.25, kalan maç 9.5 → 8.2 — her vakada iyi.
# Eğriler iç noktada minimum verir (ızgara uçlarında değil): üretim 200–800 dk arası düz, dakika 4 maç × son 10 maç.
PARAMS = {"prior_min": 400.0, "mpg_games": 4.0, "mpg_window": 10, "gp_games": 20.0}
FG_PRIOR_ATT, FT_PRIOR_ATT, DD_PRIOR_GAMES = 400.0, 150.0, 25.0
COUNT_STATS = RATE_STATS + ["FGM", "FTM"]


def team_games(cur: pd.DataFrame) -> pd.Series:
    """Takım başına oynanan maç sayısı (benzersiz GAME_ID)."""
    return cur.groupby("TEAM_ABBREVIATION")["GAME_ID"].nunique()


def observed(cur: pd.DataFrame, window: int) -> pd.DataFrame:
    """Oyuncu başına şu ana kadarki gözlem: GP, dakika toplamı, stat toplamları, son `window` maçın dakikası."""
    played = cur[cur["MIN"] > 0].sort_values("GAME_DATE")
    g = played.groupby("PLAYER_ID")
    agg = g[["MIN"] + COUNT_STATS + ["DD2", "TD3"]].sum()
    agg["GP"] = g.size()
    last = g["MIN"].apply(lambda s: s.iloc[-window:].sum())
    n_last = g["MIN"].apply(lambda s: min(len(s), window))
    agg["RECENT_MIN"], agg["RECENT_N"] = last, n_last
    agg["TEAM_NOW"] = g["TEAM_ABBREVIATION"].last()
    return agg


def update_projections(base: pd.DataFrame, cur: pd.DataFrame, params: dict | None = None) -> pd.DataFrame:
    """base: sezon öncesi projeksiyon (project() çıktısı, PLAYER_ID sütunlu); cur: sezon içi maç logları (o güne kadar)."""
    p = {**PARAMS, **(params or {})}
    obs = observed(cur, int(p["mpg_window"]))
    tg = team_games(cur)
    out = base.reset_index(drop=True).copy()
    o = obs.reindex(out["PLAYER_ID"]).reset_index(drop=True)          # satır satır hizalı; gözlemi olmayanlar NaN
    has = o["GP"].notna().to_numpy()
    z = lambda col: o[col].fillna(0.0).to_numpy(float)                 # noqa: E731
    mpg0 = out["PROJ_MPG"].clip(lower=1e-6).to_numpy(float)

    # 2) dakika: son R maç + ön bilgi
    mpg = np.where(has, (mpg0 * p["mpg_games"] + z("RECENT_MIN")) / (p["mpg_games"] + z("RECENT_N")), mpg0)
    # 1) dakika başı üretim (stat'a göre ön bilgi ağırlığı)
    for s_ in RATE_STATS:
        prior = p["prior_min"] * K_RATE[s_] / K_RATE["PTS"]
        rate = (out[s_].to_numpy(float) / mpg0 * prior + z(s_)) / (prior + z("MIN"))
        out[s_] = np.where(has, rate * mpg, out[s_].to_numpy(float))
    fg = (out["FG%"].to_numpy(float) * FG_PRIOR_ATT + z("FGM")) / (FG_PRIOR_ATT + z("FGA"))
    ft = (out["FT%"].to_numpy(float) * FT_PRIOR_ATT + z("FTM")) / (FT_PRIOR_ATT + z("FTA"))
    out["FG%"], out["FT%"] = np.where(has, fg, out["FG%"]), np.where(has, ft, out["FT%"])
    out["FGM"] = out["FGA"] * out["FG%"]
    out["FTM"] = out["FTA"] * out["FT%"]
    for c in ("DD2", "TD3"):
        out[c] = np.where(has, (out[c].to_numpy(float) * DD_PRIOR_GAMES + z(c)) / (DD_PRIOR_GAMES + z("GP")), out[c])
    # 3) oynama oranı → sezon maçı
    played_team = o["TEAM_NOW"].map(tg).fillna(o["GP"]).fillna(0.0).to_numpy(float)
    p0 = np.clip(out["PROJ_GP"].to_numpy(float) / TEAM_GAMES, 0.0, 1.0)
    p_new = (p0 * p["gp_games"] + z("GP")) / (p["gp_games"] + np.maximum(played_team, 1.0))
    gp_new = np.clip(z("GP") + p_new * np.maximum(TEAM_GAMES - played_team, 0.0), z("GP"), TEAM_GAMES)
    out["PROJ_GP"] = np.where(has, gp_new, out["PROJ_GP"])
    out["PROJ_MPG"] = mpg
    scale = mpg / mpg0
    for c in [c for c in out.columns if c.startswith("SD_")]:
        out[c] = out[c].to_numpy(float) * scale
    out["INSEASON_GP"] = z("GP").astype(int)
    if "TEAM" in out.columns:                       # takas edilenler: güncel takım (haftalık maç sayısı buradan)
        out["TEAM"] = np.where(has, o["TEAM_NOW"].fillna(out["TEAM"]), out["TEAM"])
    return out


# ── Backtest ────────────────────────────────────────────────────────────────

def _fp(df: pd.DataFrame) -> pd.Series:
    return sum(df[k] * v for k, v in PTS_WEIGHTS.items())


def _split(target_logs: pd.DataFrame, team_game_n: int) -> tuple[pd.DataFrame, pd.DataFrame, float]:
    """Takım başına ~`team_game_n` maç oynanmış tarihte böl: (o güne kadar, sonrası, ligin ortalama oynanan maçı)."""
    ranks = target_logs.groupby("TEAM_ABBREVIATION")["GAME_DATE"].apply(lambda s: sorted(s.unique())[min(team_game_n, s.nunique()) - 1])
    cutoff = sorted(ranks)[len(ranks) // 2]              # medyan tarih (GAME_DATE ISO metin: sıralama tarih sırasıdır)
    return target_logs[target_logs["GAME_DATE"] <= cutoff], target_logs[target_logs["GAME_DATE"] > cutoff], cutoff


def backtest_cases(targets=("2024-25", "2025-26"), games=(15, 30, 45, 60)) -> list[dict]:
    roster = pd.read_parquet(DATA_DIR / "2026-27__rosters.parquet")
    logs = load_gamelogs([prev_season(max(targets), i) for i in range(0, 6)])
    cases = []
    for t in targets:
        hist = {k: v for k, v in logs.items() if k < t}
        pool = [int(x) for x in logs[t]["PLAYER_ID"].unique()]
        base = project(t, hist, roster, players=pool, weights=SEASON_WEIGHTS, k_scale=0.5)
        for n in games:
            cur, ros, cutoff = _split(logs[t], n)
            cases.append({"target": t, "n": n, "cutoff": cutoff, "base": base, "cur": cur, "ros": ros})
    return cases


def evaluate(case: dict, params: dict | None = None) -> dict:
    """Kalan sezonun gerçeğiyle: FP/maç, dakika ve kalan maç hatası (temel projeksiyon vs güncellenmiş)."""
    base, cur, ros = case["base"], case["cur"], case["ros"]
    new = update_projections(base, cur, params) if params is not None else base
    g = ros[ros["MIN"] > 0].groupby("PLAYER_ID")
    act = g[["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV"]].sum()
    act["GP"] = g.size()
    act = act[act["GP"] >= 12]
    seen = cur[cur["MIN"] > 0].groupby("PLAYER_ID").size()
    ids = [p for p in act.index if seen.get(p, 0) >= 5 and p in set(new["PLAYER_ID"])]
    a = act.loc[ids]
    fp_a = (_fp(a[["PTS", "REB", "AST", "STL", "BLK", "TOV"]].div(a["GP"], axis=0)))
    n_ = new.set_index("PLAYER_ID").loc[ids]
    fp_p = _fp(n_[["PTS", "REB", "AST", "STL", "BLK", "TOV"]])
    tg_after = ros.groupby("TEAM_ABBREVIATION")["GAME_ID"].nunique().median()
    tg_before = team_games(cur).median()
    left_pred = (n_["PROJ_GP"] - n_["INSEASON_GP"] if "INSEASON_GP" in n_ else n_["PROJ_GP"] * tg_after / TEAM_GAMES)
    if "INSEASON_GP" not in n_:
        left_pred = n_["PROJ_GP"] * (TEAM_GAMES - tg_before) / TEAM_GAMES
    # kalan maç: tüm ros oyuncuları (12 maç eşiği koşulu olmadan) — oynama oranı tahmininin doğruluğu için
    gp_all = ros[ros["MIN"] > 0].groupby("PLAYER_ID").size()
    ids2 = [p for p in seen.index if seen[p] >= 5 and p in set(new["PLAYER_ID"])]
    nn = new.set_index("PLAYER_ID").loc[ids2]
    gp_left_pred = (nn["PROJ_GP"] - nn["INSEASON_GP"]) if "INSEASON_GP" in nn else nn["PROJ_GP"] * (TEAM_GAMES - tg_before) / TEAM_GAMES
    gp_left_act = gp_all.reindex(ids2).fillna(0)
    return {"fp_mae": float((fp_p - fp_a).abs().mean()), "mpg_mae": float((n_["PROJ_MPG"] - a["MIN"] / a["GP"]).abs().mean()),
            "gp_mae": float((gp_left_pred - gp_left_act).abs().mean()), "n_fp": len(ids), "n_gp": len(ids2)}


def tune(cases: list[dict]) -> dict:
    """Üç bileşen bağımsız: her biri kendi hata ölçüsünü en aza indirecek şekilde seçilir."""
    def mean_of(params, key):
        return float(np.mean([evaluate(c, params)[key] for c in cases]))
    base_scores = {k: float(np.mean([evaluate(c, None)[k] for c in cases])) for k in ("fp_mae", "mpg_mae", "gp_mae")}
    grids = {
        "mpg": ([{"mpg_games": g, "mpg_window": w} for g in (0.5, 1, 2, 4, 8, 16) for w in (5, 10, 20, 40, 100)], "mpg_mae"),
        "gp": ([{"gp_games": g} for g in (2, 5, 10, 20, 40, 80)], "gp_mae"),
        "rate": ([{"prior_min": m} for m in (50, 100, 200, 400, 800, 1600, 3200)], "fp_mae"),
    }
    chosen, table = dict(PARAMS), {}
    for name, (grid, key) in grids.items():
        rows = []
        for gparams in grid:
            rows.append({**gparams, key: mean_of({**chosen, **gparams}, key)})
        best = min(rows, key=lambda r: r[key])
        chosen.update({k: v for k, v in best.items() if k != key})
        table[name] = rows
    final = {k: mean_of(chosen, k) for k in ("fp_mae", "mpg_mae", "gp_mae")}
    return {"chosen": chosen, "grid": table, "base_scores": base_scores, "final_scores": final}


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cases = backtest_cases()
    print(f"{len(cases)} vaka (hedef sezon × kesme noktası)")
    res = tune(cases)
    per_case = [{"target": c["target"], "team_games": c["n"], "base": evaluate(c, None), "updated": evaluate(c, res["chosen"])} for c in cases]
    res["per_case"] = per_case
    (DATA_DIR / "fantasy_inseason_backtest.json").write_text(json.dumps(res, indent=2, default=str), encoding="utf-8")
    print("seçilen:", res["chosen"])
    print("temel :", {k: round(v, 3) for k, v in res["base_scores"].items()})
    print("güncel:", {k: round(v, 3) for k, v in res["final_scores"].items()})
    for r in per_case:
        print(r["target"], r["team_games"], "FP/maç MAE", round(r["base"]["fp_mae"], 3), "→", round(r["updated"]["fp_mae"], 3),
              "| dk", round(r["base"]["mpg_mae"], 2), "→", round(r["updated"]["mpg_mae"], 2),
              "| kalan maç", round(r["base"]["gp_mae"], 2), "→", round(r["updated"]["gp_mae"], 2))
