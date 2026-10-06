# -*- coding: utf-8 -*-
"""Sezon içi takım simülasyonu (Faz 6, aşama 5): kalan maçlar için NBA'yi yeniden oynat.

Sezon içi güncelleme (`inseason.update_projections`) her oyuncunun maç başı üretimini, dakikasını ve kalan maç beklentisini
oynanan maçlara göre yeniler. Burada o güncel tablo, simülasyonun girdisi olur:

  - hızlar: güncel maç başı istatistikler (sezon öncesi simülasyonun hız kalibrasyonuyla, aynı sapma düzeltmesi);
  - dakika: güncel PROJ_MPG; kalan maç: PROJ_GP − INSEASON_GP (takımın kalan maçına göre kırpılır);
  - bağlam yükü: eski takımın yükü YOK (L_eski = NaN): güncel hızlar yeni takımdaki gerçek rolü zaten içeriyor, yeniden dağıtım
    yalnız oyun içi devamsızlıklardan (sakatlık, dinlenme) gelir — sezon öncesi bağlam düzeltmesi ikinci kez uygulanmaz;
  - takımın kalan maç sayısı: oynanan maçlar loglardan (`inseason.team_games`).
Sonuç `SIM_*` sütunlarıdır (maç başı ortalama, kalan sezon); `SIM_GP` = oynanan + beklenen kalan maç (toplam sezon), `SIM_AS_OF`
güncelleme tarihi — API simülasyonun güncel olup olmadığını buradan anlar. `SI_*` sütunları kalan sezon girdileridir
(`world.build_world(..., from_week=...)` aynı tablodan kalan haftaları oynatır).

Backtest (`python -m src.fantasy.inseason_sim`): 2024-25 ve 2025-26, takım başına 15 / 30 / 45 / 60 maçta kesme; kalan sezonun
gerçeğiyle güncel model vs güncel simülasyon (FP / maç, dakika, kalan maç; MAE ve yanlılık).
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

from src.fantasy import team_sim as ts  # noqa: E402
from src.fantasy.projections import TEAM_GAMES  # noqa: E402

REST_COLS = ["TEAM", "AGE", "PROJ_MPG", "PROJ_GP", "INSEASON_GP", "FP_RATIO_Q", "GP_RATIO_Q"] + ts.STATS


def games_left(cur: pd.DataFrame) -> dict[str, int]:
    """Takım başına kalan maç: 82 − oynanan (loglardaki benzersiz maç)."""
    played = cur.groupby("TEAM_ABBREVIATION")["GAME_ID"].nunique()
    return {str(t): int(max(TEAM_GAMES - n, 1)) for t, n in played.items()}


def _fits_from_table(t: pd.DataFrame) -> dict:
    return {k: (pd.Series(t[f"SI_A_{k}"].to_numpy(float), index=t.index), float(t[f"SI_THETA_{k}"].iloc[0])) for k in ("usg", "reb", "ast")}


def rest_frame(table: pd.DataFrame, left: dict[str, int], model: dict, fits: dict | None = None):
    """Güncel tablo → simülasyon girdileri (PLAYER_ID indeksli). Dönüş: (p, takım, fits, Lold, gp_q, fp_q, params, games_by_team)."""
    t = table.set_index("PLAYER_ID") if "PLAYER_ID" in table.columns else table
    t = t[t["TEAM"].isin(left)]
    p = t[[c for c in REST_COLS if c in t.columns]].copy()
    rest_gp = (p["PROJ_GP"] - p["INSEASON_GP"]).clip(lower=0.0)
    cap = p["TEAM"].map(left).astype(float)
    p["PROJ_GP"] = np.minimum(rest_gp, cap)
    p["MOVER"] = 0.0                                                    # güncel hızlar yeni rolü zaten taşıyor
    p = ts.calibrate_rates(p, model.get("sim", {}).get("rate_calib", {}))
    fits = fits if fits is not None else _fits_from_table(t)
    fits = {k: (a.reindex(p.index).fillna(float(a.mean())), th) for k, (a, th) in fits.items()}
    Lold = {k: np.full(len(p), np.nan) for k in fits}                  # eski yük yok → çarpan 1 (bkz. modül açıklaması)
    gpq = np.array([list(x) for x in p["GP_RATIO_Q"]], float)
    fpq = np.array([list(x) for x in p["FP_RATIO_Q"]], float)
    sim = model.get("sim", {})
    params = ts.SimParams(**sim.get("params", {}))
    return p, p["TEAM"], fits, Lold, gpq, fpq, params, left


def run_rest(table: pd.DataFrame, left: dict[str, int], model: dict, fits: dict | None = None, scenarios: int | None = None) -> pd.DataFrame:
    p, team, fits, Lold, gpq, fpq, params, left = rest_frame(table, left, model, fits)
    if scenarios:
        params.scenarios = scenarios
    return ts.simulate_league(p, team, fits, Lold, gpq, fpq, params, games_by_team=left)


def si_columns(table: pd.DataFrame, left: dict[str, int], model: dict, fits: dict | None = None) -> pd.DataFrame:
    """Kalan sezon dünyası için SI_* (kalibre hızlar, kalan maç, L_eski yok) — `world.build_world` bunları okur."""
    p, team, fits, Lold, *_ = rest_frame(table, left, model, fits)
    out = pd.DataFrame(index=p.index)
    for s_ in ts.STATS:
        out[f"SI_{s_}"] = p[s_].astype(float)
    out["SI_MPG"], out["SI_GP"], out["SI_MOVER"] = p["PROJ_MPG"].astype(float), p["PROJ_GP"].astype(float), 0.0
    for k, (a, theta) in fits.items():
        out[f"SI_A_{k}"] = a.astype(float)
        out[f"SI_L_{k}"] = Lold[k]
        out[f"SI_THETA_{k}"] = float(theta)
    return out


def attach_inseason_sim(new: pd.DataFrame, cur: pd.DataFrame, model: dict, as_of: str, scenarios: int | None = None) -> pd.DataFrame:
    """`update.refresh_projections` çıktısına kalan-sezon SI_* / SIM_* ekler (sezon öncesi olanların yerine). Model dosyasında
    'sim' bölümü ya da SI_A_* eğilimleri yoksa tabloya dokunmaz."""
    if "sim" not in model or "SI_A_usg" not in new.columns:
        return new
    left = games_left(cur)
    t = new.set_index("PLAYER_ID")
    sim = run_rest(t, left, model, scenarios=scenarios)
    si = si_columns(t, left, model)
    sim["SIM_GP"] = sim["SIM_GP"] + t["INSEASON_GP"].reindex(sim.index).fillna(0.0)       # toplam sezon maçı: oynanan + beklenen kalan
    out = new.drop(columns=[c for c in new.columns if c.startswith(("SIM_", "SI_"))])
    out = out.merge(si.reset_index(), on="PLAYER_ID", how="left").merge(sim.reset_index(), on="PLAYER_ID", how="left")
    out["SIM_AS_OF"] = as_of
    return out


# ── Backtest ──────────────────────────────────────────────────────────────────

def backtest(targets=("2024-25", "2025-26"), games=(15, 30, 45, 60), scenarios: int = 100, write: bool = True) -> dict:
    """Kalan sezon: güncel model (inseason.update_projections) vs güncel simülasyon. Hız kalibrasyonu leave-one-season-out
    (2023-26'dan hedef sezon dışarıda), ilk girdi: sezon öncesi simülasyon backtest'iyle aynı ham projeksiyon."""
    from src.fantasy import context as cx
    from src.fantasy.inseason import PARAMS, _split, team_games, update_projections
    from src.fantasy.projections import PTS_WEIGHTS, _fp
    inputs = ts._backtest_inputs(list(targets))
    cases = cx.backtest_cases(("2023-24", "2024-25", "2025-26"))
    from src.fantasy.projections import load_gamelogs
    logs = load_gamelogs(["2023-24", "2024-25", "2025-26"])
    res: dict = {"targets": list(targets), "games": list(games), "cases": []}
    for t in targets:
        d = inputs[t]
        betas = ts.fit_rate_calibration(pd.concat([cases[x] for x in cases if x != t]))
        model = {"sim": {"params": {"scenarios": scenarios}, "rate_calib": betas}}
        base = d["proj"].reset_index()
        for n in games:
            cur, ros, cutoff = _split(logs[t], n)
            new = update_projections(base, cur, PARAMS)
            left = games_left(cur)
            tab = new.set_index("PLAYER_ID")
            sim = run_rest(tab, left, model, fits=d["fits"], scenarios=scenarios)
            g = ros[ros["MIN"] > 0].groupby("PLAYER_ID")
            act = g[["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV"]].sum()
            act["GP"] = g.size()
            seen = cur[cur["MIN"] > 0].groupby("PLAYER_ID").size()
            ids = [p for p in act.index if act.loc[p, "GP"] >= 12 and seen.get(p, 0) >= 5 and p in sim.index and p in tab.index]
            a = act.loc[ids]
            fp_a = _fp(a[["PTS", "REB", "AST", "STL", "BLK", "TOV"]].div(a["GP"], axis=0), PTS_WEIGHTS)
            mdl = tab.loc[ids]
            fp_m = _fp(mdl[["PTS", "REB", "AST", "STL", "BLK", "TOV"]], PTS_WEIGHTS)
            fp_s = sim.loc[ids, "SIM_FP"]
            gp_all = ros[ros["MIN"] > 0].groupby("PLAYER_ID").size()
            ids2 = [p for p in seen.index if seen[p] >= 5 and p in sim.index and p in tab.index]
            gp_act = gp_all.reindex(ids2).fillna(0)
            gp_m = (tab.loc[ids2, "PROJ_GP"] - tab.loc[ids2, "INSEASON_GP"]).clip(lower=0)
            gp_s = sim.loc[ids2, "SIM_GP"]
            e = lambda x, y: [round(float((x - y).abs().mean()), 3), round(float((x - y).mean()), 3)]   # noqa: E731
            row = {"target": t, "n": n, "players": len(ids),
                   "FP": {"model": e(fp_m, fp_a), "sim": e(fp_s, fp_a)},
                   "MPG": {"model": e(mdl["PROJ_MPG"], a["MIN"] / a["GP"]), "sim": e(sim.loc[ids, "SIM_MPG"], a["MIN"] / a["GP"])},
                   "GP_left": {"model": e(gp_m, gp_act), "sim": e(gp_s, gp_act)},
                   "cover80": round(float(((fp_a >= sim.loc[ids, "SIM_FP_P10"]) & (fp_a <= sim.loc[ids, "SIM_FP_P90"])).mean()), 3)}
            res["cases"].append(row)
    if write:
        (ROOT / "data" / "fantasy_inseason_sim_backtest.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    return res


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    r = backtest()
    tot = {k: {"model": [], "sim": []} for k in ("FP", "MPG", "GP_left")}
    for c in r["cases"]:
        print(c["target"], c["n"], f"n={c['players']}", "kapsama", c["cover80"])
        for k in ("FP", "MPG", "GP_left"):
            print(f"   {k:8s} MAE {c[k]['model'][0]:.3f} → {c[k]['sim'][0]:.3f}   yanlılık {c[k]['model'][1]:+.3f} → {c[k]['sim'][1]:+.3f}")
            for w in ("model", "sim"):
                tot[k][w].append(c[k][w])
    print("ORTALAMA")
    for k, v in tot.items():
        m, s = np.mean(v["model"], axis=0), np.mean(v["sim"], axis=0)
        print(f"   {k:8s} MAE {m[0]:.3f} → {s[0]:.3f}   yanlılık {m[1]:+.3f} → {s[1]:+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
