# -*- coding: utf-8 -*-
"""Strateji backtest'i — draft önerilerimiz GERÇEK bir sezonda işe yarıyor mu?

Ürünün değerlendirmesi (draft.py evaluate_league*) takımları yine bizim
projeksiyonlarımızla ölçüyor; eklenen gürültü rastgele hatayı temsil ediyor
ama modelin sistematik yanlışlarını göremez (docs/FANTASY_MODEL_IMPROVEMENTS.md
zayıflık 1). Burada o döngü kırılıyor:

  1. TAHTA: hedef sezon (2024-25 ve 2025-26) için projeksiyon yalnız önceki üç
     sezonun verisiyle kurulur (projections.project zaten hedef sezonu görmez).
     Değer, ADP, pozisyon o anın bilgisiyle.
  2. DRAFT: her draft sırası × tohum için aynı bot tahtaları (ortak rastgele
     sayılar) ve farklı kullanıcı stratejileri.
  3. GERÇEK PUANLAMA: hedef sezonun maç loglarıyla hafta hafta. Günlük sınır: o gün
     starter sayısından fazla oyuncu oynarsa menajerin SEZON ÖNCESİ en değerli
     bildikleri sayılır (sonradan görme yok). Her hafta herkes herkesle
     kıyaslanır (all-play), normal sezon haftaları (playoff öncesi).
  4. KALİBRASYON: ürünün tahmin ettiği sıra / playoff olasılığı gerçekleşenle.

Bilinen sızıntılar (küçük): pozisyon kodları güncel kadrodan/hedef sezon bios'undan
(bazı sezonların bios'u eksik; pozisyonlar sezondan sezona neredeyse sabit).
Çaylak tabanı ve kadro tarihi (FROM_YEAR, DRAFT_NUMBER) güncel kadrodan — ligden
düşen çaylaklar havuzda yok.

Bilinen EKSİK (sızıntının tersi): sezon öncesi bilinen uzun sakatlıklar (ör.
Haliburton/Tatum 2025 playoff'unda sakatlandı) ne tahtada ne "piyasa"da. Gerçek
Yahoo ADP bunları bilir; buradaki piyasa = geçen sezon maç başı üretim.

Çıktı: data/fantasy_strategy_backtest.json
"""

from __future__ import annotations

import json
import math
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
from src.fantasy.backtest import GP_HISTORY_BUCKETS, MPG_BUCKETS, bucket_quantiles, ratio_tables, run_fold  # noqa: E402
from src.fantasy.calendar import build_team_weeks, build_weeks  # noqa: E402
from src.fantasy.positions import eligible_positions, load_profiles  # noqa: E402
from src.fantasy.projections import SEASON_WEIGHTS, load_gamelogs, prev_season, project  # noqa: E402
from src.fantasy.publish import last_season_per_game  # noqa: E402
from src.fantasy import valuation as vl  # noqa: E402
from src.fantasy.season_sim import SeasonSim  # noqa: E402
from src.fantasy.valuation import value_players  # noqa: E402

DATA_DIR = ROOT / "data"
TARGETS = ("2024-25", "2025-26")
LONG_TO_RAW = {"Guard": "G", "Forward": "F", "Center": "C", "Guard-Forward": "G-F",
               "Forward-Guard": "F-G", "Forward-Center": "F-C", "Center-Forward": "C-F"}
CAT_STATS = ["FGM", "FGA", "FTM", "FTA", "FG3M", "PTS", "REB", "AST", "STL", "BLK", "TOV"]
CAT_OF = {"FG%": ("FGM", "FGA"), "FT%": ("FTM", "FTA"), "3PM": "FG3M", "PTS": "PTS", "REB": "REB",
          "AST": "AST", "STL": "STL", "BLK": "BLK", "TO": "TOV"}


# ── 1. Tarihsel tahta ───────────────────────────────────────────────────────

def _raw_from_height(inches: float) -> str:
    """Bios'ta pozisyon kodu yoksa boydan kaba tahmin (yalnız backtest yedeği)."""
    return "G" if inches <= 75 else "G-F" if inches <= 78 else "F" if inches <= 81 else "F-C" if inches <= 83 else "C"


def _positions(pool: list[int], roster: pd.DataFrame, target: str) -> dict[int, str]:
    raw: dict[int, str] = {}
    height: dict[int, float] = {}
    # Eski → yeni; yenisi üstüne yazar. Güncel kadroda olmayan (emekli/ligden düşen) oyuncular için
    # birkaç sezon geriye bakılır; kod hiç yoksa boydan tahmin edilir — yoksa hiçbir slota
    # uygun olmayıp draft edilemezler.
    for s in [prev_season(target, n) for n in range(6, 0, -1)] + [target]:
        p = DATA_DIR / f"{s}__bios.parquet"
        if p.exists():
            b = pd.read_parquet(p)
            raw.update({int(i): LONG_TO_RAW.get(v, "") for i, v in zip(b["PLAYER_ID"], b["POSITION"]) if isinstance(v, str)})
            height.update({int(i): float(h) for i, h in zip(b["PLAYER_ID"], b["PLAYER_HEIGHT_INCHES"]) if pd.notna(h)})
    raw.update({int(i): v for i, v in zip(roster["PLAYER_ID"], roster["POSITION_RAW"]) if isinstance(v, str)})
    prof = load_profiles(prev_season(target))
    for pid in pool:
        if raw.get(pid) not in ("G", "F", "C", "G-F", "F-G", "F-C", "C-F") and pid in height:
            raw[pid] = _raw_from_height(height[pid])
    return {pid: ",".join(eligible_positions(raw.get(pid), prof.get(pid))) for pid in pool}


def _tune_ranges(target: str, logs, roster) -> tuple[dict, dict, dict, dict]:
    """Belirsizlik bantları YALNIZ bir önceki sezonun katından — hedef sezonun artıkları sızmasın."""
    fold = run_fold(prev_season(target), logs, roster, SEASON_WEIGHTS, 0.5)
    fp, mpg = fold["fp_ratio"], fold["mpg"]
    fp_r = {n: {"p10": float(fp[(mpg >= lo) & (mpg < hi)].dropna().quantile(.1)),
                "p90": float(fp[(mpg >= lo) & (mpg < hi)].dropna().quantile(.9))}
            for lo, hi, n in MPG_BUCKETS if fp[(mpg >= lo) & (mpg < hi)].dropna().size >= 10}
    gp, hist = fold["gp_ratio"], fold["hist_gp_rate"].reindex(fold["gp_ratio"].index)
    gp_r = {n: {"p10": float(gp[(hist >= lo) & (hist < hi)].dropna().quantile(.1)),
                "p90": float(gp[(hist >= lo) & (hist < hi)].dropna().quantile(.9))}
            for lo, hi, n in GP_HISTORY_BUCKETS if gp[(hist >= lo) & (hist < hi)].dropna().size >= 20}
    gp_all = {"p10": float(gp.dropna().quantile(.1)), "p90": float(gp.dropna().quantile(.9))}
    return fp_r, gp_r, gp_all, ratio_tables([fold])


def historical_projections(target: str, logs: dict, roster: pd.DataFrame) -> pd.DataFrame:
    """Hedef sezon projeksiyonu, bir önceki sezonun sonundaki bilgiyle (publish adımının eşi)."""
    logs = {k: v for k, v in logs.items() if k < target}
    last = logs[prev_season(target)]
    rookies = roster[roster["FROM_YEAR"] == int(target[:4])]["PLAYER_ID"].astype(int).tolist()
    pool = sorted(set(last["PLAYER_ID"].astype(int)) | set(rookies))
    proj = project(target, logs, roster, players=pool, weights=SEASON_WEIGHTS, k_scale=0.5)

    names = dict(zip(last["PLAYER_ID"].astype(int), last["PLAYER_NAME"]))
    names.update({int(i): n for i, n in zip(roster["PLAYER_ID"], roster["PLAYER_NAME"]) if int(i) not in names})
    team_now = dict(zip(roster["PLAYER_ID"].astype(int), roster["TEAM_ABBREVIATION"]))
    proj["PLAYER_NAME"] = proj["PLAYER_ID"].map(names)
    # Takım: önceki sezonun son takımı; çaylakta güncel kadro (küçük sızıntı, yalnız haftalık maç sayısını etkiler)
    proj["TEAM"] = [lt if isinstance(lt, str) else team_now.get(p, "UNK") for p, lt in zip(proj["PLAYER_ID"], proj["LAST_TEAM"])]
    proj["ELIGIBLE"] = proj["PLAYER_ID"].map(_positions(pool, roster, target))
    proj["ARCHETYPE"] = None

    fp_r, gp_r, gp_all, tables = _tune_ranges(target, logs, roster)
    proj["FP_RATIO_Q"], proj["GP_RATIO_Q"] = bucket_quantiles(tables, proj["PROJ_MPG"], proj["HIST_GP_RATE"])
    bucket = lambda m: next(n for lo, hi, n in MPG_BUCKETS if lo <= m < hi)   # noqa: E731
    band = [fp_r.get(bucket(m), {"p10": .6, "p90": 1.4}) for m in proj["PROJ_MPG"]]
    proj["FP_RATIO_P10"], proj["FP_RATIO_P90"] = [b["p10"] for b in band], [b["p90"] for b in band]
    gb = []
    for r in proj["HIST_GP_RATE"]:
        if r is None or (isinstance(r, float) and math.isnan(r)):
            gb.append(gp_all)
        else:
            gb.append(gp_r.get("<60%" if r < .6 else "60-80%" if r < .8 else "80%+", gp_all))
    proj["GP_P10"] = (proj["PROJ_GP"] * [b["p10"] for b in gb]).clip(0, 82)
    proj["GP_P90"] = (proj["PROJ_GP"] * [b["p90"] for b in gb]).clip(0, 82)
    flags = []
    for r in proj.itertuples(index=False):
        f = []
        if r.SOURCE == "rookie_baseline":
            f.append("rookie")
        if r.HIST_GP_RATE is not None and not (isinstance(r.HIST_GP_RATE, float) and math.isnan(r.HIST_GP_RATE)) and r.HIST_GP_RATE < .65:
            f.append("injury_risk")
        if r.AGE is not None and not (isinstance(r.AGE, float) and math.isnan(r.AGE)) and r.AGE >= 33:
            f.append("age_decline")
        flags.append(",".join(f))
    proj["FLAGS"] = flags
    return proj.merge(last_season_per_game(last), on="PLAYER_ID", how="left")


def season_calendar(season: str, n_playoff_weeks: int = 3) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Oynanmış bir sezonun takım fikstüründen fantezi haftaları + takım × hafta.
    Fantezi playoff'u NBA normal sezonunun son `n_playoff_weeks` haftası (Yahoo varsayılanı)."""
    s = pd.read_parquet(DATA_DIR / f"{season}__schedule.parquet")
    s["DATE"] = pd.to_datetime(s["GAME_DATE"]).dt.date
    games = s.groupby("GAME_ID").agg(DATE=("DATE", "first"), T=("TEAM_ABBREVIATION", list)).reset_index()
    games = games[games["T"].map(len) == 2]
    known = pd.DataFrame({"GAME_ID": games["GAME_ID"], "DATE": games["DATE"],
                          "HOME_ABBREVIATION": games["T"].str[0], "AWAY_ABBREVIATION": games["T"].str[1]})
    weeks = build_weeks(list(known["DATE"]))
    playoff_weeks = tuple(int(w) for w in weeks["WEEK"].iloc[-n_playoff_weeks:])
    weeks["IS_PLAYOFF"] = weeks["WEEK"].isin(playoff_weeks)
    tw = build_team_weeks(known, pd.DataFrame(columns=["GAME_ID", "DATE"]), weeks, playoff_weeks)
    return weeks, tw


# ── 2. Gerçek sezon ────────────────────────────────────────────────────────

class ActualSeason:
    """2025-26 maç logları → oyuncu × gün × stat dizisi; takımları hafta hafta puanlar."""

    def __init__(self, logs: pd.DataFrame, weeks: pd.DataFrame, fmt: dict, board: dr.Board):
        self.fmt, self.board = fmt, board
        logs = logs.assign(GAME_DATE=pd.to_datetime(logs["GAME_DATE"]).dt.date)
        days = sorted(logs["GAME_DATE"].unique())
        self.day_ix = {d: i for i, d in enumerate(days)}
        first_po = int(weeks.loc[weeks["IS_PLAYOFF"], "WEEK"].min())
        reg = weeks[weeks["WEEK"] < first_po].assign(    # yalnız normal sezon haftaları
            START=lambda w: pd.to_datetime(w["START"]).dt.date, END=lambda w: pd.to_datetime(w["END"]).dt.date)
        self.day_week = np.array([
            next((int(w.WEEK) for w in reg.itertuples() if w.START <= d <= w.END), -1) for d in days])
        self.weeks = sorted(set(self.day_week) - {-1})
        self.pid_ix = {int(p): i for i, p in enumerate(board.ids)}
        n, D = len(board.ids), len(days)
        self.stats = np.zeros((n, D, len(CAT_STATS)))
        self.played = np.zeros((n, D), dtype=bool)
        g = logs[logs["PLAYER_ID"].isin(self.pid_ix)]
        pi = g["PLAYER_ID"].map(self.pid_ix).to_numpy()
        di = g["GAME_DATE"].map(self.day_ix).to_numpy()
        self.stats[pi, di] = g[CAT_STATS].to_numpy(float)
        self.played[pi, di] = g["MIN"].to_numpy(float) > 0
        self.cap = len(fmt["roster"]["starters"])

    def team_daily(self, roster: list[int]) -> np.ndarray:
        """(gün × stat) takım toplamı. Günlük sınır: oynayanlardan sezon öncesi
        değeri en yüksek `cap` kişi (tahtadaki VALUE sırası)."""
        rows = sorted((self.pid_ix[p] for p in roster), key=lambda i: -self.board.value[i])
        pl = self.played[rows]                                  # (k × gün)
        keep = pl & (np.cumsum(pl, axis=0) <= self.cap)
        return (self.stats[rows] * keep[:, :, None]).sum(axis=0)

    def weekly(self, roster: list[int]) -> np.ndarray:
        d = self.team_daily(roster)
        return np.array([d[self.day_week == w].sum(axis=0) for w in self.weeks])   # (hafta × stat)

    def score_league(self, rosters: dict[int, list[int]]) -> dict[int, dict]:
        """All-play: her hafta herkes herkesle. Kategori ya da puan formatı."""
        teams = sorted(rosters)
        W = {t: self.weekly(rosters[t]) for t in teams}
        ix = {s: j for j, s in enumerate(CAT_STATS)}
        out = {}
        if self.fmt["kind"] == "categories":
            cats = self.fmt["categories"]

            def catvals(w):
                cols = []
                for c in cats:
                    spec = CAT_OF[c]
                    if isinstance(spec, tuple):
                        cols.append(w[:, ix[spec[0]]] / np.maximum(w[:, ix[spec[1]]], 1e-9))
                    else:
                        cols.append(-w[:, ix[spec]] if c == "TO" else w[:, ix[spec]])
                return np.stack(cols, axis=1)                   # (hafta × kategori), büyük = iyi
            V = {t: catvals(W[t]) for t in teams}
            for t in teams:
                match, catw = [], []
                for o in teams:
                    if o == t:
                        continue
                    won = (V[t] > V[o]).sum(axis=1) + 0.5 * (V[t] == V[o]).sum(axis=1)
                    catw.append(won / len(cats))
                    match.append(np.where(won > len(cats) / 2, 1.0, np.where(won == len(cats) / 2, 0.5, 0.0)))
                out[t] = {"matchup_win_rate": float(np.mean(match)), "category_win_rate": float(np.mean(catw))}
        else:
            w8 = self.fmt["weights"]
            pts = {t: sum(W[t][:, ix[k]] * v for k, v in w8.items() if k in ix) for t in teams}
            for t in teams:
                match = [np.where(pts[t] > pts[o], 1.0, np.where(pts[t] == pts[o], 0.5, 0.0)) for o in teams if o != t]
                out[t] = {"matchup_win_rate": float(np.mean(match)), "season_points": float(pts[t].sum())}
        order = sorted(teams, key=lambda t: -out[t]["matchup_win_rate"])
        for i, t in enumerate(order, start=1):
            out[t]["rank"] = i
        return out


# ── 3. Stratejiler ──────────────────────────────────────────────────────────

def _feasible_best(b: dr.Board, score: np.ndarray, taken: set, mine: list, left_after: int) -> int:
    rows = dr._candidates(b, taken, mine, left_after, score, k=1)
    return int(b.ids[rows[0]])


def strategy_pickers(b: dr.Board) -> dict:
    """Kullanıcı stratejileri: (tahta, alınanlar, benimkiler, gelecek pickler) → oyuncu."""
    def dynamic(taken, mine, future):
        return dr.my_pick_by_strategy(b, {"punt": ()}, taken, mine, future)

    def static(taken, mine, future):
        return _feasible_best(b, b.value, taken, mine, len(future))

    def market(taken, mine, future):
        return _feasible_best(b, -b.adp, taken, mine, len(future))

    out = {"ours_dynamic": dynamic, "ours_static": static, "market_adp": market}
    if not b.is_categories:
        out.pop("ours_dynamic")        # puan formatında dinamik = statik
    return out


def run_draft(b: dr.Board, slot: int, picker, seed: int, bot_mix: str) -> dict[int, list[int]]:
    """draft.simulate_draft'ın eşi; kullanıcı seçimi dışarıdan verilen fonksiyonla.
    Botların tahtası yalnız (tohum, sıra) ile belirlenir → stratejiler arası ortak."""
    styles = dr.mixed_bot_styles(b.teams, slot) if bot_mix == "mixed" else \
        {s: "adp" for s in range(1, b.teams + 1) if s != slot}
    orders = {s: dr._bot_order(b, st, np.random.default_rng([seed, s])) for s, st in styles.items()}
    rosters = {s: [] for s in range(1, b.teams + 1)}
    taken: set = set()
    my_picks = dr.snake_picks(b.teams, b.rounds, slot)
    for overall in range(1, b.total_picks + 1):
        owner = dr.pick_owner(overall, b.teams)
        left_after = b.rounds - len(rosters[owner]) - 1
        if owner == slot:
            pid = picker(taken, rosters[owner], [p for p in my_picks if p > overall])
        else:
            pid = dr._bot_pick(b, orders[owner], taken, rosters[owner], left_after)
        taken.add(pid)
        rosters[owner].append(pid)
    return rosters


# ── 4. Koşu ────────────────────────────────────────────────────────────────

def _summ(xs) -> dict:
    a = np.asarray(xs, float)
    return {"mean": round(float(a.mean()), 4), "se": round(float(a.std(ddof=1) / math.sqrt(len(a))), 4) if len(a) > 1 else None, "n": int(len(a))}


def actual_values(season: ActualSeason) -> np.ndarray:
    """Tahtadaki her oyuncunun GERÇEK sezon değeri (formatın ölçüsüyle).
    Kategori: sezon toplamlarının z toplamı (yüzdeler hacim ağırlıklı; havuz =
    takım × starter, yinelemeyle); puan: toplam fantezi puanı."""
    ix = {st: j for j, st in enumerate(CAT_STATS)}
    t = season.stats.sum(axis=1)                                 # (oyuncu × stat)
    fmt = season.fmt
    if fmt["kind"] != "categories":
        return sum(t[:, ix[k]] * v for k, v in fmt["weights"].items() if k in ix)
    cols = []
    for c in fmt["categories"]:
        spec = CAT_OF[c]
        if isinstance(spec, tuple):
            m, a = t[:, ix[spec[0]]], t[:, ix[spec[1]]]
            cols.append(m - m.sum() / max(a.sum(), 1e-9) * a)
        else:
            cols.append(-t[:, ix[spec]] if c == "TO" else t[:, ix[spec]])
    raw = np.stack(cols, axis=1)
    n = fmt["teams"] * len(fmt["roster"]["starters"])
    score = raw[:, list(fmt["categories"]).index("PTS")]
    for _ in range(3):
        top = raw[np.argsort(-score)[:n]]
        score = ((raw - top.mean(axis=0)) / np.maximum(top.std(axis=0), 1e-9)).sum(axis=1)
    return score


def ordering_quality(b: dr.Board, season: ActualSeason) -> dict:
    """Tahtanın sıralaması (VALUE) mı piyasa (ADP) mı gerçekleşen değeri daha iyi
    öngördü? İlk N oyuncunun ortalama gerçek değeri + ilk 40'taki büyük kayıplar."""
    act = actual_values(season)
    by_val, by_adp = np.argsort(-b.value), np.argsort(b.adp)
    out = {}
    for n in (12, 36, 72, b.teams * b.rounds):
        out[f"top{n}_actual_mean"] = {"ours": round(float(act[by_val[:n]].mean()), 3),
                                      "market": round(float(act[by_adp[:n]].mean()), 3)}
    gp = season.played.sum(axis=1)
    out["top40_busts_under_30gp"] = [
        {"player": str(b.df["PLAYER_NAME"].iloc[i]), "rank": int(k + 1), "adp": round(float(b.adp[i]), 1),
         "proj_gp": round(float(b.df["PROJ_GP"].iloc[i]), 1), "actual_gp": int(gp[i])}
        for k, i in enumerate(by_val[:40]) if gp[i] < 30]
    return out


def fit_calibration(calib: dict, teams: int) -> dict:
    """Ürünün tahminini gerçekleşene eşleyen düzeltme (tüm stratejilerin draftları):
    playoff: logit(p_gerçek) = a + b·logit(p_tahmin); sıra: gerçek = c + d·tahmin.
    b, d < 1 → ürün fazla emin; tahminler ortaya çekilmeli."""
    from scipy.optimize import minimize
    pp = np.clip(np.array(calib["pred_playoff"], float), 0.01, 0.99)
    ap = np.array(calib["act_playoff"], float)
    x = np.log(pp / (1 - pp))

    def nll(w):
        z = np.clip(w[0] + w[1] * x, -30, 30)
        return float(np.sum(np.log1p(np.exp(z)) - ap * z))
    a, bb = minimize(nll, np.array([0.0, 1.0]), method="Nelder-Mead").x
    pr, ar = np.array(calib["pred_rank"], float), np.array(calib["act_rank"], float)
    d, c = np.polyfit(pr, ar, 1)
    return {"n": int(len(pp)), "teams": teams,
            "playoff_logit": {"a": round(float(a), 4), "b": round(float(bb), 4)},
            "rank_linear": {"c": round(float(c), 4), "d": round(float(d), 4)}}


def apply_calibration(fit: dict, pred_playoff: float, pred_rank: float) -> tuple[float, float]:
    p = min(max(pred_playoff, 0.01), 0.99)
    z = fit["playoff_logit"]["a"] + fit["playoff_logit"]["b"] * math.log(p / (1 - p))
    rank = fit["rank_linear"]["c"] + fit["rank_linear"]["d"] * pred_rank
    return 1 / (1 + math.exp(-z)), min(max(rank, 1.0), float(fit["teams"]))


def _calibration(calib: dict, main: str) -> dict:
    keep = [i for i, s in enumerate(calib["strategy"]) if s == main]
    pr, ar = np.array(calib["pred_rank"])[keep], np.array(calib["act_rank"])[keep]
    pp, ap = np.array(calib["pred_playoff"])[keep], np.array(calib["act_playoff"])[keep]
    return {
        "strategy": main, "n": int(len(pr)),
        "rank_corr": round(float(np.corrcoef(pr, ar)[0, 1]), 3) if pr.std() and ar.std() else None,
        "pred_rank_mean": round(float(pr.mean()), 2), "act_rank_mean": round(float(ar.mean()), 2),
        "pred_playoff_mean": round(float(pp.mean()), 3), "act_playoff_rate": round(float(ap.mean()), 3),
        "playoff_brier": round(float(((pp - ap) ** 2).mean()), 4),
        # Referans: herkese sabit "gerçekleşen oran" deseydik
        "playoff_brier_constant": round(float(ap.mean() * (1 - ap.mean())), 4),
    }


def run_format(fmt_key: str, proj: pd.DataFrame, tw: pd.DataFrame, weeks: pd.DataFrame, actual_logs: pd.DataFrame,
               seeds: int = 6, bot_mix: str = "mixed", calib_sims: int = 60, shrink: float | None = None) -> dict:
    fmt = get_format(fmt_key)
    b = dr.make_board(value_players(proj, fmt, tw), fmt, shrink=shrink)
    season = ActualSeason(actual_logs, weeks, fmt, b)
    pickers = strategy_pickers(b)
    res = {k: {"rank": [], "matchup": [], "top_half": [], "playoff": []} for k in pickers}
    paired = {k: [] for k in pickers if k != "market_adp"}
    calib = {"strategy": [], "pred_rank": [], "act_rank": [], "pred_playoff": [], "act_playoff": []}
    main = "ours_dynamic" if "ours_dynamic" in pickers else "ours_static"
    playoff_n = int(fmt.get("playoff_teams", 6))
    for slot in range(1, b.teams + 1):
        for s in range(seeds):
            seed = 1000 * slot + s
            outcome = {}
            for name, picker in pickers.items():
                rosters = run_draft(b, slot, picker, seed, bot_mix)
                act = season.score_league(rosters)[slot]
                outcome[name] = act
                r = res[name]
                r["rank"].append(act["rank"])
                r["matchup"].append(act["matchup_win_rate"])
                r["top_half"].append(act["rank"] <= b.teams / 2)
                r["playoff"].append(act["rank"] <= playoff_n)
                if calib_sims:                     # tüm stratejiler: kalibrasyon için tahmin yayılımı
                    pred = dr.evaluate_league_mc(b, rosters, sims=calib_sims, seed=seed)[slot]
                    calib["strategy"].append(name)
                    calib["pred_rank"].append(pred["rank_mean"])
                    calib["act_rank"].append(act["rank"])
                    calib["pred_playoff"].append(pred["playoff_prob"])
                    calib["act_playoff"].append(float(act["rank"] <= playoff_n))
            for k in paired:
                paired[k].append(outcome[k]["matchup_win_rate"] - outcome["market_adp"]["matchup_win_rate"])
    out = {"format": fmt_key, "teams": b.teams, "seeds_per_slot": seeds, "bot_mix": bot_mix,
           "strategies": {k: {m: _summ(v) for m, v in r.items()} for k, r in res.items()},
           "paired_vs_market": {k: _summ(v) for k, v in paired.items()},
           "_raw": {"paired": paired, "calib": calib, "main": main}}
    if calib["pred_rank"]:
        out["calibration"] = _calibration(calib, main)
        out["calibration_fit"] = fit_calibration(calib, b.teams)
    if bot_mix == "mixed":
        out["ordering"] = ordering_quality(b, season)
    return out


MARKETS = {                       # (anchor, gp_blend) — piyasa modeli varsayımı, bkz. valuation.MARKET_ANCHOR
    "naive": (1.0, 0.0),           # yalniz gecen sezon mac basi, herkes 82 mac (eski)
    "prior_guess": (0.6, 0.5),     # ilk elle tahminim
    "default": (vl.MARKET_ANCHOR, vl.MARKET_GP_BLEND),   # Yahoo listesine uydurulmus
    "skeptical": (0.4, 0.75),      # kalabalik yas/sakatligi daha cok fiyatliyor
}


def run(formats=("yahoo_h2h_9cat", "yahoo_h2h_points"), targets=TARGETS, seeds: int = 10, write: bool = True,
        market: str = "default") -> dict:
    t0 = time.time()
    saved = (vl.MARKET_ANCHOR, vl.MARKET_GP_BLEND)
    vl.MARKET_ANCHOR, vl.MARKET_GP_BLEND = MARKETS[market]
    try:
        return _run(formats, targets, seeds, write, market, t0)
    finally:
        vl.MARKET_ANCHOR, vl.MARKET_GP_BLEND = saved


def sensitivity(seeds: int = 6) -> dict:
    """Aynı backtest, üç piyasa varsayımıyla: 'piyasayı yendik' farkı ne kadar varsayıma bağlı?"""
    out = {}
    for name in MARKETS:
        rep = run(seeds=seeds, write=False, market=name)
        out[name] = {"market": MARKETS[name], "pooled": {k: v["paired_vs_market"] for k, v in rep["pooled"].items()},
                     "folds": {t: {k: r["paired_vs_market"] for k, r in f["results"].items()} for t, f in rep["folds"].items()}}
        print(f"[sensitivity] {name} tamam")
    (DATA_DIR / "fantasy_strategy_backtest_markets.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


def _run(formats, targets, seeds, write, market, t0) -> dict:
    logs = load_gamelogs([prev_season(max(targets), i) for i in range(0, 6)])
    roster = pd.read_parquet(DATA_DIR / "2026-27__rosters.parquet")
    report = {"targets": list(targets), "market": {"name": market, "anchor_gp_blend": MARKETS[market]}, "generated_at": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"),
              "folds": {}, "pooled": {}}
    pooled: dict[str, dict] = {}
    for target in targets:
        proj = historical_projections(target, logs, roster)
        weeks, tw = season_calendar(target)
        fold = {"pool": int(len(proj)), "results": {}}
        for key in formats:
            for mix in ("mixed", "adp"):
                r = run_format(key, proj, tw, weeks, logs[target], seeds=seeds, bot_mix=mix,
                               calib_sims=60 if mix == "mixed" else 0)
                raw = r.pop("_raw")
                pk = pooled.setdefault(f"{key}|{mix}", {"paired": {}, "calib": None, "main": raw["main"]})
                for k, v in raw["paired"].items():
                    pk["paired"].setdefault(k, []).extend(v)
                if raw["calib"]["pred_rank"]:
                    pk["calib"] = {k: (pk["calib"] or {}).get(k, []) + v for k, v in raw["calib"].items()}
                fold["results"][f"{key}|{mix}"] = r
                print(f"[strategy] {target} {key} bots={mix} — {time.time() - t0:.0f} sn")
        report["folds"][target] = fold
    for k, pk in pooled.items():
        report["pooled"][k] = {"paired_vs_market": {s: _summ(v) for s, v in pk["paired"].items()}}
        if pk["calib"]:
            report["pooled"][k]["calibration"] = _calibration(pk["calib"], pk["main"])
            report["pooled"][k]["calibration_fit"] = fit_calibration(pk["calib"], 12)
    report["notes"] = [
        "Projections for each target season use only earlier seasons (no leakage); uncertainty bands come from the fold before the target.",
        "Actual scoring: real game logs week by week, daily cap = starting slots, chosen by pre-season value; "
        "all-play vs every other team; regular-season weeks only (last 3 weeks = fantasy playoffs).",
        "Market = our own last-season per-game ADP model, which (like our board) knows nothing about preseason injuries. Real Yahoo ADP does.",
        "Small known leaks: position codes from current roster / target-season bios; rookie pool and draft info "
        "from the current roster (rookies who washed out are missing).",
    ]
    if write:
        (DATA_DIR / "fantasy_strategy_backtest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def sim_calibration(formats=("yahoo_h2h_9cat", "yahoo_h2h_points"), targets=TARGETS, seeds: int = 5,
                    sims: int = 100) -> dict:
    """Sezon simülatörü (season_sim.SeasonSim) ile statik değerlendirmenin (draft.evaluate_league_mc) gerçek
    sezonlara karşı kalibrasyonu, AYNI draftlarda. Karşılaştırma ölçüsü: all-play playoff (üst 6) olasılığı ve sıra."""
    from scipy.optimize import minimize
    logs = load_gamelogs([prev_season(max(targets), i) for i in range(0, 6)])
    roster = pd.read_parquet(DATA_DIR / "2026-27__rosters.parquet")

    def slope(pp, ap):
        pp = np.clip(np.array(pp, float), 0.01, 0.99)
        ap = np.array(ap, float)
        x = np.log(pp / (1 - pp))

        def nll(w):
            z = np.clip(w[0] + w[1] * x, -30, 30)
            return float(np.sum(np.log1p(np.exp(z)) - ap * z))
        return float(minimize(nll, np.array([0.0, 1.0]), method="Nelder-Mead").x[1])

    out = {}
    for key in formats:
        acc = {"act_p": [], "act_r": [], "static_p": [], "static_r": [], "sim_p": [], "sim_r": []}
        for target in targets:
            proj = historical_projections(target, logs, roster)
            weeks, tw = season_calendar(target)
            fmt = get_format(key)
            b = dr.make_board(value_players(proj, fmt, tw), fmt)
            sim = SeasonSim(b, tw)
            season = ActualSeason(logs[target], weeks, fmt, b)
            pk = strategy_pickers(b)
            picker = pk.get("ours_dynamic", pk["ours_static"])
            n_po = int(fmt.get("playoff_teams", 6))
            for slot in range(1, b.teams + 1):
                for s_ in range(seeds):
                    seed = 1000 * slot + s_
                    ros = run_draft(b, slot, picker, seed, "mixed")
                    a = season.score_league(ros)[slot]
                    st = dr.evaluate_league_mc(b, ros, sims=60, seed=seed)[slot]
                    sm = sim.simulate(ros, sims=sims, seed=seed)[slot]
                    acc["act_p"].append(float(a["rank"] <= n_po))
                    acc["act_r"].append(a["rank"])
                    acc["static_p"].append(st["playoff_prob"])
                    acc["static_r"].append(st["rank_mean"])
                    acc["sim_p"].append(sm["all_play_playoff_prob"])
                    acc["sim_r"].append(sm["all_play_rank_mean"])
        ap, ar = np.array(acc["act_p"]), np.array(acc["act_r"])
        res = {"n": int(len(ap)), "actual_playoff": round(float(ap.mean()), 3), "actual_rank": round(float(ar.mean()), 2),
               "brier_constant": round(float(ap.mean() * (1 - ap.mean())), 4)}
        for name in ("static", "sim"):
            pp, pr = np.array(acc[f"{name}_p"]), np.array(acc[f"{name}_r"])
            res[name] = {"pred_playoff": round(float(pp.mean()), 3), "brier": round(float(((pp - ap) ** 2).mean()), 4),
                         "slope": round(slope(pp, ap), 2), "pred_rank": round(float(pr.mean()), 2),
                         "rank_corr": round(float(np.corrcoef(pr, ar)[0, 1]), 3)}
        out[key] = res
        print(f"[sim_calibration] {key}: {res}")
    (DATA_DIR / "fantasy_sim_calibration.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if "--sim-calibration" in sys.argv:
        sim_calibration()
        sys.exit(0)
    if "--sensitivity" in sys.argv:
        for n, v in sensitivity().items():
            print(n, v["market"])
            for k, d in v["pooled"].items():
                print("  ", k, {s: f"{x['mean']:+.3f}±{x['se']:.3f}" for s, x in d.items()})
        sys.exit(0)
    rep = run()
    for target, fold in rep["folds"].items():
        for k, r in fold["results"].items():
            print(f"\n== {target} {k}")
            for s, v in r["strategies"].items():
                print(f"  {s:13} rank {v['rank']['mean']:.2f}±{v['rank']['se']:.2f}  "
                      f"matchup {v['matchup']['mean']:.3f}  playoff {v['playoff']['mean']:.2f}")
            for s, v in r["paired_vs_market"].items():
                print(f"  {s} − market (matchup win rate): {v['mean']:+.3f} ± {v['se']:.3f}")
            if "calibration" in r:
                print("  calibration", r["calibration"])
            if "ordering" in r:
                o = r["ordering"]
                print("  ordering", {n: v for n, v in o.items() if n.endswith("_mean")})
                print("  busts", [(x["player"], x["rank"], x["actual_gp"]) for x in o["top40_busts_under_30gp"]])
    print("\n== POOLED")
    for k, r in rep["pooled"].items():
        print(k, {s: f"{v['mean']:+.3f}±{v['se']:.3f}" for s, v in r["paired_vs_market"].items()})
        if "calibration" in r:
            print("   ", r["calibration"])
            print("    fit", r["calibration_fit"])
