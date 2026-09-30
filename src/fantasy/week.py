# -*- coding: utf-8 -*-
"""Bu hafta (Faz 4, tasarım 11): haftalık eşleşme, High Score haftalık kadro ve streamer / waiver listesi.

Üç formatın ortak sorusu "bu hafta ne oynasın / kimi alsın?":
  kategori    — rakibe karşı kategori başına kazanma olasılığı (aynı sezon simülasyonundan, tek hafta), sallantıdaki
                (%30–70) kategoriler ve o kategorilere en çok yardım eden serbest oyuncular.
  puan        — beklenen puan iki takım için, kazanma olasılığı.
  High Score  — starter'ın o haftaki TAVANI (en iyi tek maçının beklentisi; maç sayısı arttıkça yükselir);
                pozisyon kısıtı altında en yüksek toplam tavanlı kadro (kesirsiz açgözlü: transversal matroid, optimal).
Serbest oyuncu = ligdeki hiçbir kadroda olmayan havuz oyuncusu.
"""

from __future__ import annotations

import math

import numpy as np

from src.fantasy import draft as dr
from src.fantasy.season_sim import CAT_OF, SeasonSim, _draw_q  # noqa: F401  (CAT_OF: dışarıya kolaylık)
from src.fantasy.valuation import expected_max_table

SWING_LO, SWING_HI = 0.35, 0.65     # sallantı: kazanma olasılığı bu aralıkta; en çekişmeli MAX_SWING kategori
MAX_SWING = 3
MAX_FA = 30


def _availability(sim: SeasonSim, row: int, from_week: int | None) -> float:
    """Oynama olasılığı: tam sezonda PROJ_GP/82; sezon içinde kalan oyuncu maçı / kalan takım maçı."""
    return sim.availability(row, from_week)


def team_games_in_week(sim: SeasonSim, row: int, week: int) -> float:
    return float(sim.G[row][sim.weeks.index(week)])


def hs_ceiling(b: dr.Board, sim: SeasonSim, row: int, week: int, from_week: int | None = None) -> tuple[float, float]:
    """(o haftaki tavan = beklenen en iyi tek maç puanı, beklenen oynanan maç). Binom(n, p) üzerinden karışım."""
    fmt = b.fmt
    fp_game = float(sum(b.df[k].iloc[row] * v for k, v in fmt["weights"].items() if k in b.df.columns))
    table = expected_max_table(list(b.df["Q_HIGH_SCORE"].iloc[row])) * fp_game
    n = int(min(round(team_games_in_week(sim, row, week)), len(table) - 1))
    p = _availability(sim, row, from_week)
    ks = np.arange(n + 1)
    probs = np.array([math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in ks])
    return float((probs * table[ks]).sum()), float(n * p)


def best_lineup(b: dr.Board, roster: list[int], score: dict[int, float]) -> list[int]:
    """Pozisyon slotlarına yerleşebilen en yüksek toplam skorlu starter'lar (skora göre açgözlü + eşleştirme)."""
    n_slots = len(b.slots)
    chosen: list[int] = []
    for pid in sorted(roster, key=lambda p: -score[p]):
        masks = tuple(b.masks[b.row[p]] for p in chosen + [pid])
        if dr._max_filled_masks(masks, n_slots) == len(masks):
            chosen.append(pid)
        if len(chosen) >= n_slots:
            break
    return chosen


def hs_matchup(sim: SeasonSim, mine: list[int], theirs: list[int], week: int, sims: int, seed: int,
               from_week: int | None = None) -> dict:
    """High Score haftalık eşleşme: her starter'ın skoru = o hafta oynadığı maçların EN İYİSİ. İki takım da
    tavana göre en iyi kadrosunu kurar. Maç sayısı: takım maçları − sakatlık / dinlenme (kesirli kısım Bernoulli)."""
    b = sim.b
    picks = []
    for roster in (mine, theirs):
        ceil = {p: hs_ceiling(b, sim, b.row[p], week, from_week)[0] for p in roster}
        picks.append(best_lineup(b, roster, ceil))
    rows = np.array([b.row[p] for team in picks for p in team], dtype=int)
    mult, n_w = sim.week_draws(rows, week, sims, seed, from_week)
    rng = np.random.default_rng([seed, 9])
    k = np.floor(n_w) + (rng.random(n_w.shape) < (n_w - np.floor(n_w)))              # (S × P) tam sayı maç
    u_max = rng.random(n_w.shape) ** (1.0 / np.maximum(k, 1.0))                     # k maçın en iyisinin yüzdeliği
    q = np.array([list(b.df["Q_HIGH_SCORE"].iloc[r]) for r in rows], float)
    fp = np.array([sum(b.df[c].iloc[r] * v for c, v in b.fmt["weights"].items() if c in b.df.columns) for r in rows])
    score = np.where(k > 0, fp[None, :] * mult * _draw_q(q, u_max), 0.0)
    n_a = len(picks[0])
    a, o = score[:, :n_a].sum(axis=1), score[:, n_a:].sum(axis=1)
    return {"exp_points": [round(float(a.mean()), 1), round(float(o.mean()), 1)],
            "win_prob": round(float((a > o).mean() + 0.5 * (a == o).mean()), 3)}


def analyze_week(sim: SeasonSim, rosters: dict[int, list[int]], slot: int, opp: int, week: int,
                 sims: int = 300, seed: int = 0, from_week: int | None = None) -> dict:
    b, fmt = sim.b, sim.fmt
    kind = fmt["kind"]
    mine, theirs = rosters[slot], rosters[opp]
    V, games = sim.week_values([mine, theirs], week, sims=sims, seed=seed, from_week=from_week)
    rostered = {p for r in rosters.values() for p in r}
    out: dict = {"kind": kind, "week": week, "opponent": opp, "games": [round(float(games[0]), 1), round(float(games[1]), 1)]}

    swing: list[str] = []
    cat_gain: dict[str, float] = {}
    if kind == "categories":
        a, o = V[:, 0, :], V[:, 1, :]
        win = ((a > o).mean(axis=0) + 0.5 * (a == o).mean(axis=0))
        cats = []
        for j, c in enumerate(b.cats):
            sign = -1.0 if c == "TO" else 1.0
            cats.append({"cat": c, "me": round(float(sign * a[:, j].mean()), 3), "opp": round(float(sign * o[:, j].mean()), 3),
                         "win": round(float(win[j]), 3)})
        contested = sorted((j for j in range(len(b.cats)) if SWING_LO <= win[j] <= SWING_HI), key=lambda j: abs(win[j] - 0.5))
        swing = [b.cats[j] for j in contested[:MAX_SWING]]
        won_a = (a > o).sum(axis=1) + 0.5 * (a == o).sum(axis=1)
        out["matchup"] = {"categories": cats, "exp_cats": [round(float(win.sum()), 2), round(float(len(b.cats) - win.sum()), 2)],
                          "win_prob": round(float((won_a > len(b.cats) / 2).mean() + 0.5 * (won_a == len(b.cats) / 2).mean()), 3),
                          "swing": swing}
    elif kind == "high_score":
        out["matchup"] = hs_matchup(sim, mine, theirs, week, sims, seed, from_week)
    else:
        a, o = V[:, 0, 0], V[:, 1, 0]
        out["matchup"] = {"exp_points": [round(float(a.mean()), 1), round(float(o.mean()), 1)],
                          "win_prob": round(float((a > o).mean() + 0.5 * (a == o).mean()), 3)}

    # Oyuncu tablosu (senin kadron): maç, beklenen maç, tavan / haftalık puan
    fp_w = lambda row: float(sum(b.df[k].iloc[row] * v for k, v in (fmt.get("weights") or {}).items() if k in b.df.columns))   # noqa: E731
    players = []
    ceil: dict[int, float] = {}
    for pid in mine:
        r = b.row[pid]
        g = team_games_in_week(sim, r, week)
        p = _availability(sim, r, from_week)
        row = {"player_id": pid, "games": int(round(g)), "exp_games": round(g * p, 2)}
        if kind == "high_score":
            c, _ = hs_ceiling(b, sim, r, week, from_week)
            row["ceiling"] = round(c, 1)
            ceil[pid] = c
        elif kind == "points":
            row["exp_points"] = round(fp_w(r) * g * p, 1)
        players.append(row)
    out["players"] = players
    if kind == "high_score":
        best = best_lineup(b, mine, ceil)
        out["lineup"] = {"best": best, "best_total": round(sum(ceil[p] for p in best), 1), "starters": len(b.slots)}

    # Serbest oyuncular: bu hafta ne kadar ve neye yardım ediyor
    lg_games = float(np.mean([team_games_in_week(sim, r, week) for r in range(len(b.ids))]))
    fa = []
    order = np.argsort(-b.value)
    for i in order:
        pid = int(b.ids[i])
        if pid in rostered:
            continue
        g = team_games_in_week(sim, int(i), week)
        if g < 1:
            continue
        p = _availability(sim, int(i), from_week)
        item = {"player_id": pid, "games": int(round(g)), "exp_games": round(g * p, 2)}
        if kind == "categories":
            # G-skoru sezon toplamı bazlı; o haftanın maç sayısı ligin ortalamasına oranlanır. Sallantıdaki
            # kategoriler varsa yalnız onlar sayılır (streamer o kategorileri kazandırsın).
            score_cats = [(b.cats[j], float(b.G[i][j] * g / max(lg_games, 1e-9))) for j in range(len(b.cats)) if b.cats[j] in swing or not swing]
            item["helps"] = [c for c, v in sorted(score_cats, key=lambda kv: -kv[1])[:2] if v > 0]
            item["week_value"] = round(sum(v for c, v in score_cats), 2)
        elif kind == "high_score":
            c, _ = hs_ceiling(b, sim, int(i), week, from_week)
            item["week_value"] = round(c, 1)
        else:
            item["week_value"] = round(fp_w(int(i)) * g * p, 1)
        fa.append(item)
        if len(fa) >= 80:
            break
    if kind == "categories" and fa:
        # Serbest oyuncuların hepsi ikame seviyesi: mutlak G toplamı hep negatif. "Tipik serbest oyuncuya göre avantaj"
        # (medyan çıkarılır) — pozitif = bu hafta alınmaya değer.
        med = float(np.median([x["week_value"] for x in fa]))
        for x in fa:
            x["week_value"] = round(x["week_value"] - med, 2)
    fa.sort(key=lambda x: -x["week_value"])
    out["free_agents"] = fa[:MAX_FA]
    return out
