# -*- coding: utf-8 -*-
"""Faz 6, aşama 2 — karar kapısı: dünya motoru (NBA simülasyonundan okuyan SeasonSim) eski motora karşı, GERÇEK sezonlarda.

Aynı draftlar, aynı gerçek puanlama (strategy_backtest.ActualSeason). Her draft ligindeki 12 takım için (n büyük):
  playoff     : tahmin edilen playoff (üst 6) olasılığı ↔ gerçekleşen (all-play sırası) — Brier, kalibrasyon eğimi
  sıra        : tahmin edilen ortalama sıra ↔ gerçek sıra — korelasyon
  yayılım     : gerçekleşen all-play kazanma oranının tahmin edilene REGRESYONU: eğim ≈ 1 → takımlar arası fark doğru,
                < 1 → motor takımları olduğundan daha farklı gösteriyor (aşırı güven; piyasaya çekme bunu düzeltir)
  haftalık    : tahmin edilen haftalık eşleşme kazanma olasılığı ↔ gerçek haftalık all-play oranı (MSE, eğim)
Motorlar: legacy (ürünün şimdiki hali: piyasaya çekme açık), legacy_k1 (çekme kapalı), world.
High Score: haftanın en iyi tek maçı tahmini ↔ gerçek (dünyanın koşullu dağılımı: sapma ve P10–P90 kapsaması).

    python -m src.fantasy.world_backtest [--seeds 3] [--sims 100] [--formats yahoo_h2h_9cat yahoo_h2h_points] [--hs]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.fantasy_formats import get_format  # noqa: E402
from src.fantasy import draft as dr  # noqa: E402
from src.fantasy import team_sim as ts  # noqa: E402
from src.fantasy import world as wd  # noqa: E402
from src.fantasy.projections import load_gamelogs, prev_season  # noqa: E402
from src.fantasy.season_sim import CAT_OF, SeasonSim  # noqa: E402
from src.fantasy.strategy_backtest import (  # noqa: E402
    ActualSeason, CAT_STATS, historical_projections, run_draft, season_calendar, strategy_pickers,
)
from src.fantasy.valuation import value_players  # noqa: E402

DATA_DIR = ROOT / "data"
TARGETS = ("2024-25", "2025-26")
ALL3 = ("2023-24", "2024-25", "2025-26")


def historical_world(target: str, betas: dict, tw: pd.DataFrame, scenarios: int = 128, params: dict | None = None,
                     seed: int = 20261020) -> tuple[wd.World, pd.DataFrame]:
    """Geçmiş bir sezonun dünyası: yalnız o sezondan ÖNCEKİ loglardan kurulan girdi, hedef sezonun gerçek takımı ve kadro bilgisiyle
    (ofsezonda kadrolar bellidir). `betas`: o sezon hariç öğrenilmiş hız kalibrasyonu (leave-one-season-out)."""
    inp = ts._backtest_inputs([target])[target]
    proj = inp["proj"].copy()
    p = ts.calibrate_rates(proj, betas)
    fr = pd.DataFrame(index=p.index)
    for s in ts.STATS:
        fr[f"SI_{s}"] = p[s].astype(float)
    fr["SI_MPG"], fr["SI_GP"], fr["SI_MOVER"] = p["PROJ_MPG"].astype(float), p["PROJ_GP"].astype(float), p["MOVER"].astype(float)
    for k, (a, theta) in inp["fits"].items():
        fr[f"SI_A_{k}"] = a.reindex(p.index).fillna(float(a.mean())).astype(float)
        fr[f"SI_L_{k}"] = inp["Lold"][k]
        fr[f"SI_THETA_{k}"] = float(theta)
    fr["TEAM"] = p["TEAM"]
    fr["FP_RATIO_Q"], fr["GP_RATIO_Q"] = proj["FP_RATIO_Q"], proj["GP_RATIO_Q"]
    model = {"sim": {"params": params or {k: v for k, v in _default_params().items()}}}
    w = wd.build_world(fr.reset_index(), tw, model, scenarios=scenarios, seed=seed)
    return w, proj.reset_index()


def _default_params() -> dict:
    from dataclasses import asdict
    keep = ("budget_scale", "lam_top", "sigma_minutes", "eps", "sigma_talent_scale", "mover_delta", "minute_cap")
    return {k: v for k, v in asdict(ts.SimParams()).items() if k in keep}


def _actual_weekly(season: ActualSeason, rosters: dict[int, list[int]]) -> dict[int, np.ndarray]:
    """Takım → haftalık all-play galibiyet oranı (diğer 11 takıma karşı), `season.weeks` sırasıyla."""
    teams = sorted(rosters)
    W = {t: season.weekly(rosters[t]) for t in teams}
    ix = {s: j for j, s in enumerate(CAT_STATS)}
    fmt = season.fmt
    if fmt["kind"] == "categories":
        cats = fmt["categories"]

        def vals(w):
            cols = []
            for c in cats:
                spec = CAT_OF[c]
                if isinstance(spec, tuple):
                    cols.append(w[:, ix[spec[0]]] / np.maximum(w[:, ix[spec[1]]], 1e-9))
                else:
                    cols.append(-w[:, ix[spec]] if c == "TO" else w[:, ix[spec]])
            return np.stack(cols, axis=1)
        V = {t: vals(W[t]) for t in teams}
        out = {}
        for t in teams:
            res = []
            for o in teams:
                if o == t:
                    continue
                won = (V[t] > V[o]).sum(axis=1) + 0.5 * (V[t] == V[o]).sum(axis=1)
                res.append(np.where(won > len(cats) / 2, 1.0, np.where(won == len(cats) / 2, 0.5, 0.0)))
            out[t] = np.mean(res, axis=0)
        return out
    w8 = fmt["weights"]
    pts = {t: sum(W[t][:, ix[k]] * v for k, v in w8.items() if k in ix) for t in teams}
    return {t: np.mean([np.where(pts[t] > pts[o], 1.0, np.where(pts[t] == pts[o], 0.5, 0.0)) for o in teams if o != t], axis=0) for t in teams}


def _slope_x_to_y(x: np.ndarray, y: np.ndarray) -> float:
    x, y = np.asarray(x, float), np.asarray(y, float)
    return float(np.cov(x, y)[0, 1] / max(np.var(x, ddof=1), 1e-12))


def _logit_slope(pp, ap) -> float:
    from scipy.optimize import minimize
    pp = np.clip(np.array(pp, float), 0.01, 0.99)
    ap = np.array(ap, float)
    x = np.log(pp / (1 - pp))

    def nll(w):
        z = np.clip(w[0] + w[1] * x, -30, 30)
        return float(np.sum(np.log1p(np.exp(z)) - ap * z))
    return float(minimize(nll, np.array([0.0, 1.0]), method="Nelder-Mead").x[1])


def compare_engines(fmt_key: str, target: str, betas: dict, seeds: int = 3, sims: int = 100, scenarios: int = 128,
                    world_params: dict | None = None, extra_engines: dict | None = None) -> pd.DataFrame:
    """Dönüş: (takım × lig) satırları — gerçek sonuç ve her motorun tahmini."""
    logs = load_gamelogs([prev_season(max(TARGETS), i) for i in range(0, 6)])
    weeks, tw = season_calendar(target)
    fmt = get_format(fmt_key)
    world, proj = historical_world(target, betas, tw, scenarios, world_params)
    b = dr.make_board(value_players(proj, fmt, tw), fmt)
    season = ActualSeason(logs[target], weeks, fmt, b)
    engines = {"legacy": SeasonSim(b, tw), "legacy_k1": SeasonSim(b, tw, shrink=1.0),
               "world": SeasonSim(b, tw, world=world, world_shrink=False), "world_k": SeasonSim(b, tw, world=world, world_shrink=True)}
    engines.update(extra_engines or {})
    pk = strategy_pickers(b)
    names = list(pk)
    n_po = int(fmt.get("playoff_teams", 6))
    rows = []
    for slot in range(1, b.teams + 1):
        for s_ in range(seeds):
            seed = 1000 * slot + s_
            picker = pk[names[s_ % len(names)]]
            ros = run_draft(b, slot, picker, seed, "mixed")
            act = season.score_league(ros)
            actw = _actual_weekly(season, ros)
            preds = {n: e.simulate(ros, sims=sims, seed=seed) for n, e in engines.items()}
            for t in sorted(ros):
                row = {"target": target, "fmt": fmt_key, "slot": slot, "seed": s_, "team": t, "act_rank": act[t]["rank"],
                       "act_playoff": float(act[t]["rank"] <= n_po), "act_wr": act[t]["matchup_win_rate"]}
                for n, pr in preds.items():
                    row[f"{n}_pp"] = pr[t]["all_play_playoff_prob"]
                    row[f"{n}_rank"] = pr[t]["all_play_rank_mean"]
                    row[f"{n}_wr"] = pr[t]["all_play_rate"]
                    wk = {w["week"]: w["win_prob"] for w in pr[t]["weekly"] if not w["playoff"]}
                    xs = [wk[wn] for wn in season.weeks if wn in wk]
                    ys = [actw[t][i] for i, wn in enumerate(season.weeks) if wn in wk]
                    row[f"{n}_wk_pred"], row[f"{n}_wk_act"] = xs, ys
                rows.append(row)
    return pd.DataFrame(rows)


def summarize(df: pd.DataFrame, engines=("legacy", "legacy_k1", "world", "world_k")) -> dict:
    ap, ar, wr = df["act_playoff"].to_numpy(), df["act_rank"].to_numpy(), df["act_wr"].to_numpy()
    out = {"n": int(len(df)), "actual_playoff": round(float(ap.mean()), 3), "brier_constant": round(float(ap.mean() * (1 - ap.mean())), 4)}
    for n in engines:
        pp, pr, pw = df[f"{n}_pp"].to_numpy(), df[f"{n}_rank"].to_numpy(), df[f"{n}_wr"].to_numpy()
        wx = np.concatenate([np.asarray(x) for x in df[f"{n}_wk_pred"]]); wy = np.concatenate([np.asarray(y) for y in df[f"{n}_wk_act"]])
        out[n] = {"brier": round(float(((pp - ap) ** 2).mean()), 4), "slope": round(_logit_slope(pp, ap), 2),
                  "pred_playoff": round(float(pp.mean()), 3), "rank_corr": round(float(np.corrcoef(pr, ar)[0, 1]), 3),
                  "spread_slope": round(_slope_x_to_y(pw, wr), 3), "wr_rmse": round(float(np.sqrt(((pw - wr) ** 2).mean())), 4),
                  "week_mse": round(float(((wx - wy) ** 2).mean()), 4), "week_slope": round(_slope_x_to_y(wx, wy), 3),
                  "week_corr": round(float(np.corrcoef(wx, wy)[0, 1]), 3), "pred_sd": round(float(pw.std()), 4)}
    out["actual_wr_sd"] = round(float(wr.std()), 4)
    return out


def hs_check(target: str, betas: dict, scenarios: int = 128) -> dict:
    """High Score: haftanın en iyi tek maçı. Tahmin = dünyanın o oyuncu-haftası için koşullu (≥1 maç oynadı) dağılımı;
    gerçek = o haftada o oyuncunun oynadığı maçların en iyisi. Oyuncular: tahmini ≥ 22 dk, hafta başına ≥1 maç oynayan."""
    logs = load_gamelogs([prev_season(max(TARGETS), i) for i in range(0, 6)])
    weeks, tw = season_calendar(target)
    world, proj = historical_world(target, betas, tw, scenarios)
    g = logs[target].copy()
    g["DATE"] = pd.to_datetime(g["GAME_DATE"]).dt.date
    wk = weeks.assign(START=pd.to_datetime(weeks["START"]).dt.date, END=pd.to_datetime(weeks["END"]).dt.date)
    first_po = int(weeks.loc[weeks["IS_PLAYOFF"], "WEEK"].min())

    def week_of(d):
        r = wk[(wk["START"] <= d) & (d <= wk["END"])]
        return int(r["WEEK"].iloc[0]) if len(r) else -1
    g["WEEK"] = g["DATE"].map(week_of)
    g["HS"] = g["PTS"] + g["REB"] + 2 * g["AST"] + 3 * g["STL"] + 3 * g["BLK"]
    act = g[(g["WEEK"] > 0) & (g["WEEK"] < first_po)].groupby(["PLAYER_ID", "WEEK"]).agg(best=("HS", "max"), n=("HS", "size")).reset_index()
    pid_ix = world.index()
    wix = {int(w): i for i, w in enumerate(world.weeks)}
    mpg = proj.set_index("PLAYER_ID")["PROJ_MPG"]
    rows = []
    for r in act.itertuples():
        if r.PLAYER_ID not in pid_ix or r.WEEK not in wix or mpg.get(r.PLAYER_ID, 0) < 22:
            continue
        i, w = pid_ix[r.PLAYER_ID], wix[r.WEEK]
        ok = world.games[:, w, i] > 0
        if ok.sum() < 20:
            continue
        pred = world.best_hs[ok, w, i]
        gms = world.games[ok, w, i]
        rows.append({"best": r.best, "n": r.n, "pred_mean": float(pred.mean()), "p10": float(np.percentile(pred, 10)), "p90": float(np.percentile(pred, 90)),
                     "pred_n": float(gms.mean())})
    d = pd.DataFrame(rows)
    inside = ((d["best"] >= d["p10"]) & (d["best"] <= d["p90"])).mean()
    return {"target": target, "n": int(len(d)), "actual_mean": round(float(d["best"].mean()), 2), "pred_mean": round(float(d["pred_mean"].mean()), 2),
            "bias": round(float((d["pred_mean"] - d["best"]).mean()), 2), "mae": round(float((d["pred_mean"] - d["best"]).abs().mean()), 2),
            "cover80": round(float(inside), 3), "games_pred": round(float(d["pred_n"].mean()), 2), "games_actual": round(float(d["n"].mean()), 2)}


def loso_betas(targets=ALL3) -> dict[str, dict]:
    from src.fantasy import context as cx
    cases = cx.backtest_cases(tuple(targets))
    return {t: ts.fit_rate_calibration(pd.concat([cases[x] for x in targets if x != t])) for t in targets}


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--sims", type=int, default=100)
    ap.add_argument("--formats", nargs="*", default=["yahoo_h2h_9cat", "yahoo_h2h_points"])
    ap.add_argument("--hs", action="store_true", help="High Score haftalık en iyi maç kontrolü")
    ap.add_argument("--cache", default=None, help="hız kalibrasyonu (leave-one-season-out) için önbellek dosyası (pickle)")
    a = ap.parse_args(argv)
    t0 = time.time()
    import os
    import pickle
    if a.cache and os.path.exists(a.cache):
        betas = pickle.load(open(a.cache, "rb"))
    else:
        betas = loso_betas()
        if a.cache:
            pickle.dump(betas, open(a.cache, "wb"))
    print(f"[world-bt] kalibrasyon {time.time() - t0:.0f} sn", flush=True)
    report: dict = {}
    for key in a.formats:
        parts = []
        for t in TARGETS:
            parts.append(compare_engines(key, t, betas[t], seeds=a.seeds, sims=a.sims))
            print(f"[world-bt] {key} {t} — {time.time() - t0:.0f} sn", flush=True)
        df = pd.concat(parts, ignore_index=True)
        df.to_pickle(DATA_DIR / f"fantasy_world_backtest_rows_{key}.pkl")          # lig bazlı bootstrap için (depoya girmez)
        report[key] = {"pooled": summarize(df), **{t: summarize(df[df.target == t]) for t in TARGETS}}
        print(key, json.dumps(report[key]["pooled"], indent=1), flush=True)
    if a.hs:
        report["high_score_best_game"] = [hs_check(t, betas[t]) for t in TARGETS]
        print(json.dumps(report["high_score_best_game"], indent=1))
    (DATA_DIR / "fantasy_world_backtest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
