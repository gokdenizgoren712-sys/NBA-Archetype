# -*- coding: utf-8 -*-
"""Takas analizi (Faz 4, tasarım 12) — "verirsem / alırsam takımım nasıl değişir?"

Aynı sezon simülatörü (season_sim.SeasonSim) iki kez koşulur: takas öncesi ve sonrası kadrolarla, AYNI
tohum ve oyuncu bazlı ortak rastgele sayılarla. Bir oyuncu her iki dünyada da aynı sezonu (sakatlık, üretim
şansı) yaşadığı için sonuçlar arasındaki fark gürültüde kaybolmaz; gerçek etki görünür.

Kadro boyutu: 2'ye 1 gibi eşitsiz takaslar kadro sayısını bozar; gerçek ligdeki gibi en düşük değerli oyuncular
bırakılır (taze alınanlar korunur), eksik kalan yerler havuzdaki en iyi serbest oyuncuyla dolar. Ne yapıldığı
`roster_notes` içinde açıkça yazılır.
"""

from __future__ import annotations

import numpy as np

from src.fantasy import draft as dr
from src.fantasy.season_sim import SeasonSim

# Karar ölçüsü: haftalık maç kazanma oranındaki (rakip ortalamaya karşı) fark. Ortak rastgele sayılarla 300
# simülasyonda tohumdan tohuma sapması 0.002–0.005 (playoff olasılığında 0.02, sırada 0.1) — en kararlı ölçü.
# 0.012 ≈ sezonda ~0.25 galibiyet; gürültünün 2–6 katı. Playoff / sıra ekranda gösterilir ama karar vermez.
WIN_RATE_EDGE = 0.012


def owners(rosters: dict[int, list[int]]) -> dict[int, int]:
    return {p: t for t, r in rosters.items() for p in r}


def fit_roster(b: dr.Board, roster: list[int], rostered: set[int], size: int, protect: set[int]) -> tuple[list[int], list[int], list[int]]:
    """Kadroyu `size`a getir: fazlaysa en düşük değerliyi bırak (protect hariç), eksikse en iyi serbest oyuncuyu ekle."""
    out = list(roster)
    dropped, added = [], []
    while len(out) > size:
        cands = [p for p in out if p not in protect] or out
        worst = min(cands, key=lambda p: b.value[b.row[p]])
        out.remove(worst)
        dropped.append(worst)
    if len(out) < size:
        taken = set(rostered) | set(out)
        for i in np.argsort(-b.value):
            pid = int(b.ids[i])
            if pid in taken:
                continue
            out.append(pid)
            added.append(pid)
            taken.add(pid)
            if len(out) >= size:
                break
    return out, dropped, added


def _cat_win(me: dict) -> list[float] | None:
    reg = [w["cat_win"] for w in me["weekly"] if not w["playoff"] and "cat_win" in w]
    return list(np.mean(reg, axis=0)) if reg else None


def _summary(me: dict) -> dict:
    return {k: me[k] for k in ("rank_mean", "playoff_prob", "champion_prob", "expected_wins", "all_play_rate") if k in me} | (
        {"category_wins_per_week": me["category_wins_per_week"]} if "category_wins_per_week" in me else {})


def analyze_trade(sim: SeasonSim, rosters: dict[int, list[int]], slot: int, give: list[int], get: list[int],
                  sims: int = 300, seed: int = 0, from_week: int | None = None,
                  base_wins: dict[int, float] | None = None) -> dict:
    b = sim.b
    own = owners(rosters)
    partner_slots = {own[p] for p in get if p in own and own[p] != slot}
    if len(partner_slots) > 1:
        raise ValueError("The players you get must all come from one team (or be free agents).")
    partner = next(iter(partner_slots)) if partner_slots else None
    rostered = set(own)
    mine = rosters[slot]
    acquired = set(get)
    new_mine = [p for p in mine if p not in set(give)] + [p for p in get]
    after = {t: list(r) for t, r in rosters.items()}
    notes: list[str] = []
    fa_taken = [p for p in get if p not in own]
    if partner is not None:
        after[partner] = [p for p in rosters[partner] if p not in set(get)] + list(give)
    size = b.rounds
    fitted, dropped, added = fit_roster(b, new_mine, rostered | set(get) | set(give), size, acquired)
    after[slot] = fitted
    name = lambda pid: str(b.df["PLAYER_NAME"].iloc[b.row[pid]])   # noqa: E731
    if dropped:
        notes.append(f"After the trade you have {len(new_mine)} players, so {', '.join(name(p) for p in dropped)} "
                     f"{'is' if len(dropped) == 1 else 'are'} dropped (lowest value).")
    if added:
        notes.append(f"After the trade you have {len(new_mine)} players, so {', '.join(name(p) for p in added)} "
                     f"{'is' if len(added) == 1 else 'are'} added from free agency (best available).")
    if fa_taken:
        notes.append(f"{', '.join(name(p) for p in fa_taken)} {'is a' if len(fa_taken) == 1 else 'are'} free agent"
                     f"{'' if len(fa_taken) == 1 else 's'}, so this part is a pickup, not a trade.")
    if partner is not None:
        pf, pd_, pa = fit_roster(b, after[partner], rostered | set(give) | set(get), size, set(give))
        after[partner] = pf

    before_res = sim.simulate(rosters, sims=sims, seed=seed, from_week=from_week, base_wins=base_wins)
    after_res = sim.simulate(after, sims=sims, seed=seed, from_week=from_week, base_wins=base_wins)
    b0, a0 = before_res[slot], after_res[slot]
    cb, ca = _cat_win(b0), _cat_win(a0)
    cats = []
    if cb is not None:
        for j, c in enumerate(b.cats):
            cats.append({"cat": c, "now": round(float(cb[j]), 3), "after": round(float(ca[j]), 3), "change": round(float(ca[j] - cb[j]), 3)})
    dp = a0["playoff_prob"] - b0["playoff_prob"]
    dr_ = b0["rank_mean"] - a0["rank_mean"]                       # + = sıra iyileşti
    dw = a0["all_play_rate"] - b0["all_play_rate"]
    verdict = "Good for you" if dw >= WIN_RATE_EDGE else "Bad for you" if dw <= -WIN_RATE_EDGE else "About even"
    why = f"Playoff odds {round(b0['playoff_prob'] * 100)}% → {round(a0['playoff_prob'] * 100)}%, average finish {b0['rank_mean']:.1f} → {a0['rank_mean']:.1f}."
    if cats:
        up = sorted(cats, key=lambda c: -c["change"])
        gains = [f"{c['cat']} (+{round(c['change'] * 100)})" for c in up[:2] if c["change"] >= 0.02]
        losses = [f"{c['cat']} ({round(c['change'] * 100)})".replace("(-", "(−") for c in up[::-1][:2] if c["change"] <= -0.02]
        if gains:
            why += f" Adds {' and '.join(gains)}."
        if losses:
            why += f" Costs {' and '.join(losses)}."
    out = {"verdict": verdict, "why": why, "before": _summary(b0), "after": _summary(a0),
           "delta": {"playoff_prob": round(dp, 3), "rank": round(dr_, 2), "win_rate": round(dw, 4),
                     "cats_per_week": round(a0.get("category_wins_per_week", 0) - b0.get("category_wins_per_week", 0), 2) if cats else None},
           "categories": cats, "roster_notes": notes, "partner_slot": partner,
           "my_roster_after": after[slot], "dropped": dropped, "added": added}
    if partner is not None:
        out["partner"] = {"slot": partner, "rank_before": before_res[partner]["rank_mean"], "rank_after": after_res[partner]["rank_mean"]}
    return out
