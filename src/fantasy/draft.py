# -*- coding: utf-8 -*-
"""Draft motoru — snake sırası, kadro doldurulabilirliği, dinamik öneri,
rakip simülasyonu, draft sırasına göre planlar ve lig değerlendirmesi.

Kategori formatlarında öneri statik sıralama değil (Rosenof'un H-score
fikrinin sade hâli, arXiv 2409.09884):
  Takımın her kategorideki beklenen G toplamı S_c = mevcut kadro + aday +
  gelecek picklerin beklenen katkısı. Ortalama rakibe karşı kazanma olasılığı
  P_c = Φ((S_c − B_c) / √(2N)) — G-score biriminde iki takımın farkının
  varyansı ≈ 2N (N kadro büyüklüğü). Aday değeri = Σ_c ΔP_c.
  Bir kategori umutsuzlaştıkça Φ düzleşir, oraya yatırımın getirisi düşer:
  punt, ayrı bir kural olmadan kendiliğinden öğrenilir.

Puan ve High Score formatlarında değer toplanabilir; aday değeri statik
değerdir, kadro kısıtı (slot doldurulabilirliği) yine uygulanır.

Rakipler: her botun kendi tahtası var, ADP + N(0, ADP_SD) ("adp" stili) ya
da bizim değerimiz + gürültü ("value" stili). Botlar da kadro kısıtına uyar.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy.special import ndtr

from config.fantasy_formats import SLOT_ELIGIBILITY

CAND_POOL = 40            # öneri için değerlendirilen en iyi uygun oyuncu sayısı
M_WINDOW = 6              # gelecek pick katkısı: ADP sırasında ±6 oyuncunun ortalaması
BOT_STYLES = ("adp", "value")
BENCH_WEIGHT = {"points": 0.25, "high_score": 0.0}


# ── Snake sırası ────────────────────────────────────────────────────────────

def pick_owner(overall: int, teams: int) -> int:
    """1 tabanlı genel pick numarası → sırayı alan takımın draft sırası (1..teams)."""
    rnd = (overall - 1) // teams
    pos = (overall - 1) % teams
    return pos + 1 if rnd % 2 == 0 else teams - pos


def snake_picks(teams: int, rounds: int, slot: int) -> list[int]:
    if not 1 <= slot <= teams:
        raise ValueError(f"draft slot must be between 1 and {teams}")
    return [r * teams + (slot if r % 2 == 0 else teams - slot + 1) for r in range(rounds)]


# ── Kadro doldurulabilirliği ────────────────────────────────────────────────

def _slot_ok(slot: str, elig: tuple[str, ...]) -> bool:
    if not elig:                      # pozisyonu bilinmeyen oyuncu yalnız Util'e girer
        return slot == "Util"
    allowed = SLOT_ELIGIBILITY[slot]
    return any(p in allowed for p in elig)


def max_filled(eligs: list[tuple[str, ...]], slots: list[str]) -> int:
    """Oyuncuların doldurabileceği en fazla starter slotu (iki parçalı eşleştirme)."""
    match: dict[int, int] = {}        # slot index → oyuncu index

    def assign(p: int, seen: set) -> bool:
        for s, name in enumerate(slots):
            if s in seen or not _slot_ok(name, eligs[p]):
                continue
            seen.add(s)
            if s not in match or assign(match[s], seen):
                match[s] = p
                return True
        return False

    return sum(assign(p, set()) for p in range(len(eligs)))


def feasible(eligs: list[tuple[str, ...]], slots: list[str], picks_left_after: int) -> bool:
    """Bu kadroyla kalan picklerle bütün starter slotları hâlâ dolabilir mi?"""
    if picks_left_after >= len(slots):
        return True                   # kalan pick her boş slotu kapatmaya yeter
    return len(slots) - max_filled(eligs, slots) <= picks_left_after


def slot_mask(elig: tuple[str, ...], slots: list[str]) -> int:
    """Oyuncunun girebildiği starter slotları, bit maskesi olarak."""
    m = 0
    for s, name in enumerate(slots):
        if _slot_ok(name, elig):
            m |= 1 << s
    return m


@lru_cache(maxsize=200_000)
def _max_filled_masks(masks: tuple[int, ...], n_slots: int) -> int:
    """max_filled'ın maskeli hâli. Profil (2026-09-29): simülasyon süresinin
    ~%80'i eşleştirmedeydi; uygunluk kombinasyonu az (PG, PG/SG, SF/PF, C…)
    olduğundan sıralı maske demeti üzerinden önbellek neredeyse her çağrıyı karşılıyor."""
    match = [-1] * n_slots

    def assign(p: int, seen: int) -> bool:
        m = masks[p] & ~seen
        while m:
            low = m & -m
            s = low.bit_length() - 1
            m ^= low
            seen |= low
            if match[s] == -1 or assign(match[s], seen):
                match[s] = p
                return True
        return False

    return sum(assign(p, 0) for p in range(len(masks)))


def lineup_assignment(masks: list[int], n_slots: int) -> tuple[list[int | None], list[int]]:
    """(slot → oyuncu indeksi ya da None, yedekteki oyuncu indeksleri).
    Mock draft ekranındaki "kadro slotlara göre doluyor" görünümü için."""
    match: list[int] = [-1] * n_slots

    def assign(p: int, seen: int) -> bool:
        m = masks[p] & ~seen
        while m:
            low = m & -m
            s = low.bit_length() - 1
            m ^= low
            seen |= low
            if match[s] == -1 or assign(match[s], seen):
                match[s] = p
                return True
        return False

    for p in range(len(masks)):
        assign(p, 0)
    placed = set(match)
    return [None if x == -1 else x for x in match], [p for p in range(len(masks)) if p not in placed]


def feasible_masks(roster_masks: list[int], cand_mask: int, n_slots: int, picks_left_after: int) -> bool:
    if picks_left_after >= n_slots:
        return True
    key = tuple(sorted(roster_masks + [cand_mask]))
    return n_slots - _max_filled_masks(key, n_slots) <= picks_left_after


# ── Tahta (değerlenmiş havuz) ───────────────────────────────────────────────

@dataclass
class Board:
    fmt: dict
    teams: int
    rounds: int
    slots: list[str]
    df: pd.DataFrame
    ids: np.ndarray
    value: np.ndarray
    adp: np.ndarray
    adp_sd: np.ndarray
    elig: list[tuple[str, ...]]
    cats: list[str] = field(default_factory=list)
    G: np.ndarray | None = None
    M: np.ndarray | None = None       # ADP sırasındaki beklenen G (pick → kategori vektörü)
    masks: list[int] = field(default_factory=list)   # oyuncu → uygun starter slotları (bit)
    _adp_ranks: np.ndarray | None = None              # adp_ranks() önbelleği
    GA: np.ndarray | None = None      # mutlak üretim, G biriminde (gerçekleşme örneklemesi için)
    dirs: np.ndarray | None = None    # kategori yönleri (+1 / TO için −1)
    base_total: np.ndarray | None = None   # puan formatlarında gerçekleşmeye açık toplam
    fp_mu: np.ndarray | None = None   # üretim çarpanı ~ lognormal(fp_mu, fp_sigma)
    fp_sigma: np.ndarray | None = None
    gp_mu: np.ndarray | None = None   # maç çarpanı ~ lognormal(gp_mu, gp_sigma), 82'de kesilir
    gp_sigma: np.ndarray | None = None
    gp_cap: np.ndarray | None = None
    row: dict[int, int] = field(default_factory=dict)

    @property
    def is_categories(self) -> bool:
        return self.fmt["kind"] == "categories"

    @property
    def total_picks(self) -> int:
        return self.teams * self.rounds


def make_board(valued: pd.DataFrame, fmt: dict) -> Board:
    df = valued.reset_index(drop=True)
    rounds = len(fmt["roster"]["starters"]) + fmt["roster"].get("bench", 0)
    elig = [tuple(p for p in str(e or "").split(",") if p) for e in df["ELIGIBLE"]]
    b = Board(fmt=fmt, teams=int(fmt["teams"]), rounds=rounds, slots=list(fmt["roster"]["starters"]),
              df=df, ids=df["PLAYER_ID"].to_numpy(int), value=df["VALUE"].to_numpy(float),
              adp=df["ADP"].to_numpy(float), adp_sd=df["ADP_SD"].to_numpy(float), elig=elig,
              row={int(p): i for i, p in enumerate(df["PLAYER_ID"])})
    b.masks = [slot_mask(e, b.slots) for e in elig]
    # Gerçekleşen sezon belirsizliği — backtest artıklarının p10/p90'ından
    # lognormal: ln p10 = μ − 1.2816σ, ln p90 = μ + 1.2816σ.
    z90 = 1.2815516
    lo, hi = df["FP_RATIO_P10"].to_numpy(float), df["FP_RATIO_P90"].to_numpy(float)
    b.fp_mu, b.fp_sigma = (np.log(lo) + np.log(hi)) / 2, (np.log(hi) - np.log(lo)) / (2 * z90)
    gp = np.maximum(df["PROJ_GP"].to_numpy(float), 1.0)
    glo = np.maximum(df["GP_P10"].to_numpy(float), 1.0) / gp
    ghi = np.maximum(df["GP_P90"].to_numpy(float), 1.0) / gp
    b.gp_mu, b.gp_sigma = (np.log(glo) + np.log(ghi)) / 2, (np.log(ghi) - np.log(glo)) / (2 * z90)
    b.gp_cap = 82.0 / gp
    if b.is_categories:
        b.cats = list(fmt["categories"])
        col = "G_" if fmt["matchup"] == "h2h" else "Z_"
        b.G = df[[f"{col}{c}" for c in b.cats]].to_numpy(float)
        b.GA = df[[f"{'GA_' if col == 'G_' else 'ZA_'}{c}" for c in b.cats]].to_numpy(float)
        b.dirs = np.array([-1.0 if c == "TO" else 1.0 for c in b.cats])
        order = np.argsort(b.adp)
        by_adp = b.G[order]
        n = len(by_adp)
        b.M = np.array([by_adp[max(0, i - M_WINDOW): min(n, i + M_WINDOW + 1)].mean(axis=0)
                        for i in range(n)])
    else:
        b.base_total = df["FP_TOTAL" if fmt["kind"] == "points" else "HS_WEEK_AVG"].to_numpy(float)
    return b


def sample_multipliers(b: Board, rng: np.random.Generator, basis: str = "total") -> np.ndarray:
    """Her oyuncu için bir gerçekleşen-sezon çarpanı: üretim × (toplam bazında) maç."""
    n = len(b.ids)
    m = np.exp(b.fp_mu + b.fp_sigma * rng.standard_normal(n))
    if basis == "total":
        m = m * np.minimum(np.exp(b.gp_mu + b.gp_sigma * rng.standard_normal(n)), b.gp_cap)
    return m


def _future_sum(b: Board, future_picks: list[int]) -> np.ndarray:
    idx = [min(p - 1, len(b.M) - 1) for p in future_picks]
    return b.M[idx].sum(axis=0) if idx else np.zeros(len(b.cats))


def _baseline(b: Board) -> np.ndarray:
    """Ortalama rakibin draft sonu beklenen kategori toplamı."""
    return b.M[: b.total_picks].sum(axis=0) / b.teams


def category_probs(b: Board, team_sum: np.ndarray) -> np.ndarray:
    """Ortalama rakibe karşı kategori kazanma olasılıkları."""
    return ndtr((team_sum - _baseline(b)) / math.sqrt(2 * b.rounds))


# ── Öneri ───────────────────────────────────────────────────────────────────

def _available(b: Board, taken: set[int]) -> np.ndarray:
    return np.array([int(p) not in taken for p in b.ids])


def _candidates(b: Board, taken: set[int], roster: list[int], picks_left_after: int,
                score: np.ndarray, k: int = CAND_POOL) -> list[int]:
    """Kadro kısıtını geçen en iyi k aday (satır indisleri), `score`a göre."""
    avail = np.flatnonzero(_available(b, taken))
    order = avail[np.argsort(-score[avail])]
    masks = [b.masks[b.row[p]] for p in roster]
    out = []
    for i in order:
        if feasible_masks(masks, b.masks[i], len(b.slots), picks_left_after):
            out.append(int(i))
            if len(out) >= k:
                break
    return out


def dynamic_scores(b: Board, roster: list[int], cand_rows: list[int], future_picks: list[int],
                   punt: tuple[str, ...] = ()) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(aday puanı, adayla birlikte kategori olasılıkları, adaysız olasılıklar)."""
    active = np.array([c not in punt for c in b.cats])
    have = b.G[[b.row[p] for p in roster]].sum(axis=0) if roster else np.zeros(len(b.cats))
    base_sum = have + _future_sum(b, future_picks)
    before = category_probs(b, base_sum)
    after = category_probs(b, base_sum[None, :] + b.G[cand_rows])
    gain = ((after - before) * active).sum(axis=1)
    return gain, after, before


def availability(b: Board, taken: set[int], rows: list[int], opp_picks: int,
                 sims: int = 400, seed: int = 0) -> np.ndarray:
    """Aradaki `opp_picks` rakip pickinden sonra bu oyuncuların hâlâ duruyor olma
    olasılığı. Rakip = ADP + gürültü tahtası (kadro ihtiyacı yok sayılır)."""
    if opp_picks <= 0:
        return np.ones(len(rows))
    avail = np.flatnonzero(_available(b, taken))
    rng = np.random.default_rng(seed)
    noisy = b.adp[avail][:, None] + b.adp_sd[avail][:, None] * rng.standard_normal((len(avail), sims))
    ranks = noisy.argsort(axis=0).argsort(axis=0)            # 0 = ilk alınan
    pos = {int(r): i for i, r in enumerate(avail)}
    out = []
    for r in rows:
        i = pos.get(int(r))
        out.append(0.0 if i is None else float((ranks[i] >= opp_picks).mean()))
    return np.array(out)


def recommend(b: Board, taken: set[int], mine: list[int], current_pick: int, slot: int,
              punt: tuple[str, ...] = (), n: int = 10, seed: int = 0) -> dict:
    """Şu an sıradaki kullanıcı için öneriler + kategori profili + punt önerisi."""
    my_picks = snake_picks(b.teams, b.rounds, slot)
    remaining = [p for p in my_picks if p >= current_pick]
    if not remaining:
        return {"done": True, "recommendations": []}
    now, future = remaining[0], remaining[1:]
    picks_left_after = len(future)
    next_pick = future[0] if future else None
    taken_all = set(taken) | set(mine)

    if b.is_categories:
        cand = _candidates(b, taken_all, mine, picks_left_after, b.value, k=CAND_POOL)
        gain, after, before = dynamic_scores(b, mine, cand, future, punt)
        order = np.argsort(-gain)
    else:
        cand = _candidates(b, taken_all, mine, picks_left_after, b.value, k=CAND_POOL)
        gain = b.value[cand]
        order = np.argsort(-gain)
        after = before = None

    top = [cand[i] for i in order[:n]]
    opp_between = (next_pick - now - 1) if next_pick else 0
    avail_next = availability(b, taken_all, top, opp_between, seed=seed)

    recs = []
    for k, i in enumerate(order[:n]):
        r = cand[i]
        rec = {"player_id": int(b.ids[r]), "score": round(float(gain[i]), 4),
               "value": round(float(b.value[r]), 3), "adp": round(float(b.adp[r]), 1),
               "available_next_pick": round(float(avail_next[k]), 3)}
        if b.is_categories:
            delta = after[i] - before
            best = [b.cats[j] for j in np.argsort(-delta)[:2] if delta[j] > 0.005 and b.cats[j] not in punt]
            rec["boosts"] = best
            rec["category_prob_after"] = {c: round(float(after[i][j]), 3) for j, c in enumerate(b.cats)}
        recs.append(rec)

    out = {"done": False, "current_pick": now, "next_pick": next_pick, "picks_left": len(remaining),
           "recommendations": recs}
    if b.is_categories:
        probs = before
        out["category_prob"] = {c: round(float(probs[j]), 3) for j, c in enumerate(b.cats)}
        # Punt önerisi: en az 4 pickten sonra %30'un altına düşen kategoriler.
        out["punt_suggestion"] = ([c for j, c in enumerate(b.cats) if probs[j] < 0.30 and c not in punt]
                                  if len(mine) >= 4 else [])
    return out


# ── Simülasyon ──────────────────────────────────────────────────────────────

def _bot_order(b: Board, style: str, rng: np.random.Generator) -> np.ndarray:
    if style == "value":
        spread = np.maximum(np.abs(b.value).std(), 1e-9) * 0.15
        return np.argsort(-(b.value + rng.standard_normal(len(b.value)) * spread))
    return np.argsort(b.adp + b.adp_sd * rng.standard_normal(len(b.adp)))


def _bot_pick(b: Board, order: np.ndarray, taken: set[int], roster: list[int], picks_left_after: int) -> int:
    masks = [b.masks[b.row[p]] for p in roster]
    fallback = None
    for i in order:
        pid = int(b.ids[i])
        if pid in taken:
            continue
        if fallback is None:
            fallback = pid
        if feasible_masks(masks, b.masks[i], len(b.slots), picks_left_after):
            return pid
    return fallback


def my_pick_by_strategy(b: Board, strategy: dict, taken: set[int], mine: list[int], future: list[int]) -> int:
    score = strategy.get("score", b.value)
    cand = _candidates(b, taken, mine, len(future), score, k=CAND_POOL if b.is_categories else 5)
    if b.is_categories:
        gain, _, _ = dynamic_scores(b, mine, cand, future, strategy.get("punt", ()))
        return int(b.ids[cand[int(np.argmax(gain))]])
    return int(b.ids[cand[0]])


def simulate_draft(b: Board, slot: int, strategy: dict, rng: np.random.Generator,
                   bot_styles: dict[int, str] | None = None) -> dict[int, list[int]]:
    """Tam bir draft: kullanıcı `strategy` ile, botlar kendi tahtalarıyla."""
    rosters: dict[int, list[int]] = {s: [] for s in range(1, b.teams + 1)}
    orders = {s: _bot_order(b, (bot_styles or {}).get(s, "adp"), rng) for s in rosters if s != slot}
    taken: set[int] = set()
    my_picks = snake_picks(b.teams, b.rounds, slot)
    for overall in range(1, b.total_picks + 1):
        owner = pick_owner(overall, b.teams)
        left_after = b.rounds - len(rosters[owner]) - 1
        if owner == slot:
            future = [p for p in my_picks if p > overall]
            pid = my_pick_by_strategy(b, strategy, taken, rosters[owner], future)
        else:
            pid = _bot_pick(b, orders[owner], taken, rosters[owner], left_after)
        taken.add(pid)
        rosters[owner].append(pid)
    return rosters


# ── Lig değerlendirmesi ─────────────────────────────────────────────────────

def _poisson_binomial_win(probs: np.ndarray) -> float:
    """Kategorilerin yarıdan fazlasını kazanma olasılığı (beraberlik yarım sayılır)."""
    dist = np.zeros(len(probs) + 1)
    dist[0] = 1.0
    for p in probs:
        dist[1:] = dist[1:] * (1 - p) + dist[:-1] * p
        dist[0] *= (1 - p)
    half = len(probs) / 2
    win = dist[np.arange(len(dist)) > half].sum()
    tie = dist[np.arange(len(dist)) == half].sum()
    return float(win + 0.5 * tie)


def evaluate_league(b: Board, rosters: dict[int, list[int]], mult: np.ndarray | None = None) -> dict[int, dict]:
    """Her takımın gücü. `mult` verilirse oyuncuların gerçekleşen sezonu
    (sample_multipliers) uygulanır; verilmezse projeksiyon olduğu gibi.

    Kategori: lig içindeki her rakibe karşı kategori kazanma olasılığı ve
    eşleşme (kategorilerin çoğunluğu) kazanma oranı. Puan: toplam puan."""
    teams = sorted(rosters)
    out: dict[int, dict] = {}
    if b.is_categories:
        G = b.G if mult is None else b.G + b.dirs[None, :] * (mult[:, None] - 1) * b.GA
        sums = {t: G[[b.row[p] for p in rosters[t]]].sum(axis=0) for t in teams}
        scale = math.sqrt(2 * b.rounds)
        for t in teams:
            cat_p, match_p = [], []
            for o in teams:
                if o == t:
                    continue
                p = ndtr((sums[t] - sums[o]) / scale)
                cat_p.append(p)
                match_p.append(_poisson_binomial_win(p))
            cat_p = np.mean(cat_p, axis=0)
            out[t] = {"category_win_prob": {c: round(float(cat_p[j]), 3) for j, c in enumerate(b.cats)},
                      "expected_category_wins": round(float(cat_p.sum()), 2),
                      "matchup_win_rate": round(float(np.mean(match_p)), 3),
                      "strength": float(np.mean(match_p))}
    else:
        # Points'te yedekler starter'ın boş günlerinde az oynar (çeyrek ağırlık);
        # High Score'da kadro haftalık kurulur, yalnız starter'lar sayılır.
        tot = b.base_total if mult is None else b.base_total * mult
        n_start = len(b.slots)
        bench_w = BENCH_WEIGHT.get(b.fmt["kind"], 0.0)
        for t in teams:
            vals = np.sort(tot[[b.row[p] for p in rosters[t]]])[::-1]
            s = float(vals[:n_start].sum() + bench_w * vals[n_start:].sum())
            out[t] = {"total": round(s, 1), "strength": s}
    ranked = sorted(teams, key=lambda t: -out[t]["strength"])
    for i, t in enumerate(ranked, start=1):
        out[t]["projected_rank"] = i
    return out


def adp_ranks(b: Board, sims: int = 400, seed: int = 0) -> np.ndarray:
    """ADP + gürültü tahtalarında her oyuncunun kaçıncı alındığı (n × sims),
    tahta başına bir kez hesaplanıp saklanır."""
    if b._adp_ranks is None:
        rng = np.random.default_rng(seed)
        noisy = b.adp[:, None] + b.adp_sd[:, None] * rng.standard_normal((len(b.adp), sims))
        b._adp_ranks = noisy.argsort(axis=0).argsort(axis=0)
    return b._adp_ranks


def pick_availability(b: Board, row: int, opp_before: int) -> float:
    """Draftın başından, senden önceki `opp_before` rakip pickinden sonra oyuncunun
    hâlâ duruyor olma olasılığı (rakipler ADP + gürültüyle seçer)."""
    if opp_before <= 0:
        return 1.0
    return float((adp_ranks(b)[row] >= opp_before).mean())


def evaluate_league_mc(b: Board, rosters: dict[int, list[int]], sims: int = 200, seed: int = 0,
                       basis: str = "total") -> dict[int, dict]:
    """Gerçekleşme belirsizliğiyle `sims` çekiliş: ortalama güç, sıra dağılımı,
    ilk yarı, playoff (formatın playoff takım sayısı) ve 1.lik olasılığı."""
    rng = np.random.default_rng(seed)
    teams = sorted(rosters)
    ranks = {t: [] for t in teams}
    strength = {t: [] for t in teams}
    point = evaluate_league(b, rosters)
    for _ in range(sims):
        ev = evaluate_league(b, rosters, sample_multipliers(b, rng, basis))
        for t in teams:
            ranks[t].append(ev[t]["projected_rank"])
            strength[t].append(ev[t]["strength"])
    out = {}
    playoff_teams = min(int(b.fmt.get("playoff_teams", 6)), len(teams))
    for t in teams:
        r = np.array(ranks[t])
        out[t] = {**point[t], "strength": float(np.mean(strength[t])),
                  "rank_mean": round(float(r.mean()), 2),
                  "rank_p10_p90": [float(np.percentile(r, 10)), float(np.percentile(r, 90))],
                  "rank_dist": [round(float((r == k).mean()), 3) for k in range(1, len(teams) + 1)],
                  "top_half_prob": round(float((r <= len(teams) / 2).mean()), 3),
                  "playoff_prob": round(float((r <= playoff_teams).mean()), 3),
                  "first_place_prob": round(float((r == 1).mean()), 3)}
    order = sorted(teams, key=lambda t: out[t]["rank_mean"])
    for i, t in enumerate(order, start=1):
        out[t]["projected_rank"] = i
    return out


GRADES = [(0.90, "A+"), (0.80, "A"), (0.70, "A-"), (0.60, "B+"), (0.50, "B"), (0.40, "B-"),
          (0.30, "C+"), (0.20, "C"), (0.10, "C-"), (0.0, "D")]


def letter_grade(rank: int, teams: int) -> str:
    """Lig içi sıradan harf: 1. = üst yüzdelik."""
    pct = 1 - (rank - 1) / max(teams - 1, 1)
    return next(g for cut, g in GRADES if pct >= cut)


# ── Planlar ─────────────────────────────────────────────────────────────────

def mixed_bot_styles(teams: int, user_slot: int) -> dict[int, str]:
    """Kullanıcı dışındaki sıralar sırayla ADP / değer stili."""
    others = [s for s in range(1, teams + 1) if s != user_slot]
    return {s: BOT_STYLES[i % 2] for i, s in enumerate(others)}


CATEGORY_PLANS = [
    {"key": "balanced", "label": "Balanced", "punt": ()},
    {"key": "punt_ft", "label": "Punt FT%", "punt": ("FT%",)},
    {"key": "punt_fg", "label": "Punt FG%", "punt": ("FG%",)},
    {"key": "punt_to", "label": "Punt TO", "punt": ("TO",)},
    {"key": "punt_ast", "label": "Punt AST", "punt": ("AST",)},
    {"key": "punt_3pm", "label": "Punt 3PM", "punt": ("3PM",)},
]


def _value_plans(b: Board) -> list[dict]:
    df = b.df
    flags = df["FLAGS"].fillna("")
    risky = flags.str.contains("injury_risk").to_numpy() | flags.str.contains("age_decline").to_numpy()
    up = df["FP_RATIO_P90"].to_numpy(float)
    spread = np.maximum(np.abs(b.value).std(), 1e-9)
    return [
        {"key": "best_value", "label": "Best value", "score": b.value},
        {"key": "low_risk", "label": "Low risk", "score": b.value - risky * spread * 0.35},
        {"key": "upside", "label": "Upside", "score": b.value * up},
    ]


def draft_plans(b: Board, slot: int, sims: int = 30, seed: int = 0, n_plans: int = 3) -> dict:
    """Draft sırasına göre alternatif planlar. Her plan `sims` kez tam draft
    oynanarak değerlendirilir; en güçlü `n_plans` plan döner."""
    strategies = [dict(s) for s in CATEGORY_PLANS if all(c in b.cats for c in s["punt"])] \
        if b.is_categories else _value_plans(b)
    my_picks = snake_picks(b.teams, b.rounds, slot)
    # Rakiplerin yarısı piyasa (ADP), yarısı bizim değerimizle (keskin) draft eder —
    # hepsi ADP'yle oynasa kullanıcı her planda 1. çıkıyordu (döngüsel sonuç).
    bots = mixed_bot_styles(b.teams, slot)
    results = []
    for si, strat in enumerate(strategies):
        rng = np.random.default_rng(seed + si * 7919)
        per_round: list[dict[int, int]] = [dict() for _ in range(b.rounds)]
        strengths, ranks, profiles = [], [], []
        for _ in range(sims):
            rosters = simulate_draft(b, slot, strat, rng, bots)
            mine = rosters[slot]
            for r, pid in enumerate(mine):
                per_round[r][pid] = per_round[r].get(pid, 0) + 1
            ev = evaluate_league(b, rosters, sample_multipliers(b, rng))
            strengths.append(ev[slot]["strength"])
            ranks.append(ev[slot]["projected_rank"])
            if b.is_categories:
                profiles.append([ev[slot]["category_win_prob"][c] for c in b.cats])
        rounds = []
        for r in range(b.rounds):
            common = sorted(per_round[r].items(), key=lambda kv: -kv[1])[:3]
            # share: bu planda o turda bu oyuncunun seçildiği simülasyon payı.
            # available: senin pickinden önceki rakip pickleri ADP + gürültüyle
            # oynanınca hâlâ duruyor olma olasılığı (tasarımdaki "Availability").
            opp_before = my_picks[r] - 1 - r
            rounds.append({"round": r + 1, "pick": my_picks[r],
                           "targets": [{"player_id": int(p), "share": round(c / sims, 3),
                                        "available": round(pick_availability(b, b.row[int(p)], opp_before), 3)}
                                       for p, c in common]})
        res = {"key": strat["key"], "label": strat["label"], "punt": list(strat.get("punt", ())),
               "rounds": rounds, "expected_rank": round(float(np.mean(ranks)), 2),
               "top_half_prob": round(float((np.array(ranks) <= b.teams / 2).mean()), 3),
               "rank_se": round(float(np.std(ranks) / math.sqrt(sims)), 3),
               "rank_p10_p90": [float(np.percentile(ranks, 10)), float(np.percentile(ranks, 90))],
               "strength": round(float(np.mean(strengths)), 4),
               "strength_sd": round(float(np.std(strengths)), 4)}
        if b.is_categories:
            prof = np.mean(profiles, axis=0)
            res["category_win_prob"] = {c: round(float(prof[j]), 3) for j, c in enumerate(b.cats)}
            res["expected_category_wins"] = round(float(prof.sum()), 2)
            res["matchup_win_rate"] = res["strength"]
        results.append(res)
    # Kullanıcının okuduğu ölçü beklenen sıra; ona göre sırala. Simülasyon
    # gürültüsü içinde kalan farklar "berabere" işaretlenir — aynı veriyle iki
    # tohum en iyi planı değiştirebiliyordu (2026-09-29, 12 takım 7. sıra).
    results.sort(key=lambda r: (r["expected_rank"], -r["strength"]))
    best = results[0]
    for r in results:
        r["tied_with_best"] = bool(
            # <=: tüm çekilişlerde aynı sıra çıkınca SE 0 olur, en iyi plan kendisiyle berabere kalmalı
            r["expected_rank"] - best["expected_rank"] <= 2 * math.hypot(r["rank_se"], best["rank_se"]))
    return {"slot": slot, "teams": b.teams, "rounds": b.rounds, "picks": my_picks,
            "sims_per_plan": sims, "plans": results[:n_plans], "all_strategies": [
                {"key": r["key"], "strength": r["strength"], "expected_rank": r["expected_rank"]} for r in results]}
