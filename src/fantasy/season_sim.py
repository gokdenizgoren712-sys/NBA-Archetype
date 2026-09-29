# -*- coding: utf-8 -*-
"""Sezon simülatörü (Faz 3) — draft edilen ligi gerçek fikstürle haftalık Monte Carlo ile oynatır.

Her simülasyonda:
  1. Oyuncu başına bir SEZON gerçekleşmesi: üretim çarpanı ve sezonluk maç sayısı, backtest
     artıklarının ampirik kantil tablolarından (draft.sample_multipliers ile aynı mantık).
  2. Kaçırılan maçlar SAKATLIK modeliyle haftalara dağıtılır: iki ardışık blok + dağınık kayıp.
     Ölçüm (2023-24…2025-26, 986 oyuncu-sezon): kaçırılan maçların yalnız %41'i tek ardışık blokta —
     sakatlıklar çoğunlukla parça parça. Blok payları 0.42 / 0.25, kalanı dağınık.
  3. Haftalık takım toplamları = Σ (o hafta oynanan maç × oyuncunun sezon ortalaması) + maçtan maça
     gürültü (oyuncu başına SD, bağımsız). Yüzdeler yapı gereği FGM/FGA, FTM/FTA'dan.
  4. Haftalık eşleşmeler: hem all-play (herkes herkese; şans-bağımsız güç) hem rastgele round-robin
     H2H programı. Kategori: kazanılan kategori sayısı; puan: toplam puan.
  5. Fantezi playoff'u (playoff_teams takım, tek eleme, üst tohumlar bay).

Basitleştirmeler (bilerek): günlük kadro sınırı yok (backtest'te sınır nadiren devreye giriyor: 13 kişilik
kadro 30 takıma dağılmış), pozisyon slotu kısıtı yok (draft.py'nin lineup atamasıyla değerlendirilir),
sezon içi waiver/takas yok. Doğrulama: strateji backtest'inin gerçek sezonlarıyla (bkz. strategy_backtest).

Girdi: draft.Board (projeksiyon + değer + ADP) ve takım-hafta maç sayıları (calendar.build_team_weeks).
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.special import ndtri

from src.fantasy import draft as dr

STATS = ["FGM", "FGA", "FTM", "FTA", "FG3M", "PTS", "REB", "AST", "STL", "BLK", "TOV"]
CAT_OF = {"FG%": ("FGM", "FGA"), "FT%": ("FTM", "FTA"), "3PM": "FG3M", "PTS": "PTS", "REB": "REB",
          "AST": "AST", "STL": "STL", "BLK": "BLK", "TO": "TOV"}
# Gürültü kaynağı: sayma istatistiklerinde kendi SD'si; FGM/FTM'de vuruş "etkisi" SD'si (FGA/FTA sabit)
SD_COL = {"FGM": "SD_FG_IMP", "FTM": "SD_FT_IMP", "FG3M": "SD_FG3M", "PTS": "SD_PTS", "REB": "SD_REB",
          "AST": "SD_AST", "STL": "SD_STL", "BLK": "SD_BLK", "TOV": "SD_TOV"}
BLOCK_SHARES = (0.42, 0.25)      # kaçırılan maçların ardışık iki bloktaki payı; kalanı dağınık
MIN_GP_FOR_SHRINK = 20.0
TEAM_GAMES = 82.0


def _draw_q(q: np.ndarray, u: np.ndarray) -> np.ndarray:
    """q: (P × K) satır başına kantil tablosu; u: (S × P) ∈ [0,1) → (S × P) ters-CDF örnekleri."""
    k = q.shape[1] - 1
    pos = u * k
    lo = np.minimum(pos.astype(int), k - 1)
    f = pos - lo
    idx = np.arange(q.shape[0])[None, :]
    return q[idx, lo] * (1 - f) + q[idx, lo + 1] * f


def _round_robin(t: int) -> np.ndarray:
    """(t−1 tur × t) — her turda takım konumunun rakip konumu (daire yöntemi, t çift)."""
    pos = list(range(t))
    rounds = []
    for _ in range(t - 1):
        opp = np.empty(t, dtype=int)
        for i in range(t // 2):
            a, b = pos[i], pos[t - 1 - i]
            opp[a], opp[b] = b, a
        rounds.append(opp)
        pos = [pos[0]] + [pos[-1]] + pos[1:-1]
    return np.array(rounds)


def _bracket(n: int) -> list[tuple[int, int | None]]:
    """n takımlı tek eleme ilk tur eşleşmeleri (tohum indisleri, 0=1. tohum); None = bay."""
    size = 1
    while size < n:
        size *= 2
    order = [0]
    while len(order) < size:                       # standart tohum sırası: 1,8,4,5,3,6,2,7 …
        m = len(order) * 2
        order = [x for s in order for x in (s, m - 1 - s)]
    return [(a, b if b < n else None) for a, b in zip(order[::2], order[1::2])]


class SeasonSim:
    def __init__(self, b: dr.Board, team_weeks: pd.DataFrame, shrink: float | None = None,
                 playoff_weeks: list[int] | None = None):
        self.b = b
        fmt = b.fmt
        self.fmt = fmt
        df = b.df
        n = len(df)
        gp = np.maximum(df["PROJ_GP"].to_numpy(float), 1.0)
        mean = np.stack([df[s].to_numpy(float) for s in STATS], axis=1)                # (n × 11) maç başı
        # Piyasaya büzme (draft.SHRINK) — toplam düzeyinde, draft motoruyla aynı yerel-ortalama üzerinden
        k = dr.SHRINK.get(fmt["kind"], 1.0) if shrink is None else shrink
        if k < 1.0:
            tot = mean * gp[:, None]
            loc = dr.local_market_mean(b.adp, tot)
            mean = (loc + k * (tot - loc)) / np.maximum(gp, MIN_GP_FOR_SHRINK)[:, None]
        self.mean = np.maximum(mean, 0.0)
        self.sd = np.stack([df[SD_COL[s]].to_numpy(float) if s in SD_COL else np.zeros(n) for s in STATS], axis=1)
        self.sd = np.nan_to_num(self.sd)
        if fmt["kind"] != "categories":
            w = np.array([fmt["weights"].get(s, 0.0) for s in STATS])
            self.fp_mean = self.mean @ w
            qp = np.array([list(x) for x in df["Q_POINTS"]], float)                   # maç puanı kantilleri
            self.fp_sd = np.nan_to_num(qp.std(axis=1))
        self.gp = gp
        self._u_cache: dict = {}
        self.fp_q, self.gp_q = b.fp_q, b.gp_q
        if self.fp_q is None:                       # ampirik tablo yoksa lognormal yedeği
            self.fp_q = None
        # Takım × hafta maç sayıları
        piv = (team_weeks.pivot_table(index="TEAM", columns="WEEK", values="GAMES_EXPECTED", aggfunc="sum")
               .fillna(0.0))
        self.weeks = list(piv.columns)
        self.team_games = piv
        team_of = df["TEAM"].to_numpy()
        self.G = np.stack([piv.loc[t].to_numpy(float) if t in piv.index else np.zeros(len(self.weeks)) for t in team_of])
        self.total_games = np.maximum(self.G.sum(axis=1), 1.0)
        po = team_weeks.groupby("WEEK")["IS_PLAYOFF"].max()
        self.playoff_weeks = ([w for w in self.weeks if w in set(playoff_weeks)] if playoff_weeks
                              else [w for w in self.weeks if bool(po.get(w, False))])
        first_po = min(self.playoff_weeks) if self.playoff_weeks else max(self.weeks) + 1
        self.reg_weeks = [w for w in self.weeks if w < first_po]

    # ── Gerçekleşme ─────────────────────────────────────────────────────────

    def _uniforms(self, sims: int, seed: int) -> dict[str, np.ndarray]:
        """OYUNCU BAZLI ortak rastgele sayılar (S × tüm havuz): aynı `seed` ile bir oyuncu, hangi kadroda
        olursa olsun aynı sezonu (çarpan, maç sayısı, sakatlık blokları) yaşar. Takas gibi "önce / sonra"
        karşılaştırmalarında farkın gürültüde kaybolmaması için (common random numbers)."""
        key = (sims, seed)
        hit = self._u_cache.get(key)
        if hit is None:
            rng = np.random.default_rng([seed, 11])
            n = len(self.gp)
            hit = {k: rng.random((sims, n)) for k in ("fp", "gp", "b1", "b2")}
            if len(self._u_cache) >= 4:
                self._u_cache.pop(next(iter(self._u_cache)))
            self._u_cache[key] = hit
        return hit

    def _season_draws(self, rows: np.ndarray, U: dict[str, np.ndarray]):
        """(oyuncu sezon çarpanı S×P, oynanan maç oranı S×P)."""
        if self.fp_q is not None:
            m = _draw_q(self.fp_q[rows], U["fp"][:, rows])
            r = _draw_q(self.gp_q[rows], U["gp"][:, rows])
        else:
            m = np.exp(self.b.fp_mu[rows] + self.b.fp_sigma[rows] * ndtri(np.clip(U["fp"][:, rows], 1e-9, 1 - 1e-9)))
            r = np.exp(self.b.gp_mu[rows] + self.b.gp_sigma[rows] * ndtri(np.clip(U["gp"][:, rows], 1e-9, 1 - 1e-9)))
        games = np.minimum(self.gp[rows][None, :] * np.maximum(r, 0.0), TEAM_GAMES)
        return m, games / TEAM_GAMES

    def _weekly_games(self, rows: np.ndarray, frac: np.ndarray, U: dict[str, np.ndarray]) -> np.ndarray:
        """(S × P × W) o hafta oynanan maç: takım maçları − sakatlık blokları − dağınık kayıp."""
        S, P = frac.shape
        G = self.G[rows]                                        # (P × W)
        T = self.total_games[rows]                              # (P,)
        c_hi = np.cumsum(G, axis=1)
        c_lo = c_hi - G
        missed = np.clip((1.0 - frac), 0.0, 1.0) * T[None, :]   # (S × P) kaçırılan takım maçı
        lost = np.zeros((S, P, G.shape[1]))
        for share, ukey in zip(BLOCK_SHARES, ("b1", "b2")):
            length = share * missed                             # (S × P)
            start = U[ukey][:, rows] * np.maximum(T[None, :] - length, 0.0)
            end = start + length
            ov = np.minimum(end[:, :, None], c_hi[None]) - np.maximum(start[:, :, None], c_lo[None])
            lost += np.clip(ov, 0.0, None)
        played = np.clip(G[None] - lost, 0.0, None)
        scatter = (1.0 - sum(BLOCK_SHARES)) * missed / T[None, :]          # (S × P) dağınık kayıp oranı
        return played * (1.0 - scatter)[:, :, None]

    # ── Tek hafta, iki takım (haftalık eşleşme) ─────────────────────────────

    def week_draws(self, rows: np.ndarray, week: int, sims: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
        """Oyuncu satırları için o haftanın gerçekleşmesi: (üretim çarpanı S×P, oynanan maç S×P; kesirli)."""
        U = self._uniforms(sims, seed)
        mult, frac = self._season_draws(rows, U)
        return mult, self._weekly_games(rows, frac, U)[:, :, self.weeks.index(week)]

    def week_values(self, rosters_list: list[list[int]], week: int, sims: int = 300, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
        """Verilen kadroların o haftaki değerleri: (S × T × kategori) — yüzdeler oran, TO işaret çevrili (büyük = iyi);
        puan formatında (S × T × 1). İkinci çıktı: (T,) takım başına beklenen oynanan oyuncu-maçı. `simulate` ile
        aynı sezon gerçekleşmeleri ve gürültü; yalnız tek hafta, gerekli takımlar için."""
        b, fmt = self.b, self.fmt
        T = len(rosters_list)
        rows = np.array([b.row[p] for r in rosters_list for p in r], dtype=int)
        sizes = [len(r) for r in rosters_list]
        owner = np.repeat(np.arange(T), sizes)
        onehot = np.zeros((T, len(rows)))
        onehot[owner, np.arange(len(rows))] = 1.0
        U = self._uniforms(sims, seed)
        mult, frac = self._season_draws(rows, U)
        n_w = self._weekly_games(rows, frac, U)[:, :, self.weeks.index(week)][:, :, None]      # (S × P × 1)
        rng = np.random.default_rng([seed, 5])
        games = np.einsum("tp,spw->stw", onehot, n_w, optimize=True).mean(axis=0)[:, 0]

        def tsum(x: np.ndarray) -> np.ndarray:
            return np.einsum("tp,spw,spc->stwc", onehot, n_w, x, optimize=True)[:, :, 0, :]

        if fmt["kind"] == "categories":
            mu = self.mean[rows][None] * mult[:, :, None]
            sd = self.sd[rows][None] * mult[:, :, None]
            tot = tsum(mu)
            tot = np.maximum(tot + np.sqrt(tsum(sd ** 2)) * rng.standard_normal(tot.shape), 0.0)
            ix = {c: j for j, c in enumerate(STATS)}
            cols = []
            for c in fmt["categories"]:
                spec = CAT_OF[c]
                if isinstance(spec, tuple):
                    cols.append(tot[..., ix[spec[0]]] / np.maximum(tot[..., ix[spec[1]]], 1e-9))
                else:
                    cols.append(-tot[..., ix[spec]] if c == "TO" else tot[..., ix[spec]])
            return np.stack(cols, axis=-1), games
        mu = (self.fp_mean[rows][None] * mult)[:, :, None]
        sd = (self.fp_sd[rows][None] * mult)[:, :, None]
        pts = tsum(mu)
        return np.maximum(pts + np.sqrt(tsum(sd ** 2)) * rng.standard_normal(pts.shape), 0.0), games

    # ── Simülasyon ──────────────────────────────────────────────────────────

    def simulate(self, rosters: dict[int, list[int]], sims: int = 100, seed: int = 0) -> dict[int, dict]:
        b, fmt = self.b, self.fmt
        teams = sorted(rosters)
        T = len(teams)
        rows = np.array([b.row[p] for t in teams for p in rosters[t]], dtype=int)
        owner = np.repeat(np.arange(T), [len(rosters[t]) for t in teams])
        onehot = np.zeros((T, len(rows)))
        onehot[owner, np.arange(len(rows))] = 1.0
        rng = np.random.default_rng(seed)

        sizes = [len(rosters[t]) for t in teams]
        R = sizes[0]
        blocks = len(set(sizes)) == 1          # oyuncular takım takım sıralı ve kadrolar eşit boyda → toplu matris çarpımı

        def tsum(n: np.ndarray, x: np.ndarray) -> np.ndarray:
            """Takım toplamı: n (S × P × W) maç sayıları, x (S × P × C) oyuncu değerleri → (S × T × W × C)."""
            if blocks:
                return np.matmul(n.reshape(sims, T, R, -1).transpose(0, 1, 3, 2), x.reshape(sims, T, R, -1))
            return np.einsum("tp,spw,spc->stwc", onehot, n, x, optimize=True)

        U = self._uniforms(sims, seed)
        mult, frac = self._season_draws(rows, U)
        n_spw = self._weekly_games(rows, frac, U)                   # (S × P × W)
        W = n_spw.shape[2]

        if fmt["kind"] == "categories":
            mu = self.mean[rows][None] * mult[:, :, None]           # (S × P × C)
            sd = self.sd[rows][None] * mult[:, :, None]
            tot = tsum(n_spw, mu)
            var = tsum(n_spw, sd ** 2)
            tot = np.maximum(tot + np.sqrt(var) * rng.standard_normal(tot.shape), 0.0)
            ix = {s: j for j, s in enumerate(STATS)}
            cols = []
            for c in fmt["categories"]:
                spec = CAT_OF[c]
                if isinstance(spec, tuple):
                    cols.append(tot[..., ix[spec[0]]] / np.maximum(tot[..., ix[spec[1]]], 1e-9))
                else:
                    cols.append(-tot[..., ix[spec]] if c == "TO" else tot[..., ix[spec]])
            V = np.stack(cols, axis=-1)                              # (S × T × W × cats), büyük = iyi
        else:
            mu = (self.fp_mean[rows][None] * mult)                  # (S × P)
            sd = self.fp_sd[rows][None] * mult
            pts = tsum(n_spw, mu[:, :, None])[..., 0]
            var = tsum(n_spw, (sd ** 2)[:, :, None])[..., 0]
            V = (pts + np.sqrt(var) * rng.standard_normal(pts.shape))[..., None]   # (S × T × W × 1)

        weeks_ix = {w: i for i, w in enumerate(self.weeks)}
        reg = [weeks_ix[w] for w in self.reg_weeks]
        po = [weeks_ix[w] for w in self.playoff_weeks]
        is_cat = fmt["kind"] == "categories"
        ncat = V.shape[-1]

        def result(a: np.ndarray, o: np.ndarray) -> np.ndarray:
            """a, o: (..., cats) → a'nın o'ya karşı haftalık sonucu (1 / 0.5 / 0) ve kategori payı."""
            if not is_cat:
                return np.where(a[..., 0] > o[..., 0], 1.0, np.where(a[..., 0] == o[..., 0], 0.5, 0.0))
            won = (a > o).sum(-1) + 0.5 * (a == o).sum(-1)
            return np.where(won > ncat / 2, 1.0, np.where(won == ncat / 2, 0.5, 0.0))

        # All-play: her hafta herkes herkesle (şans-bağımsız güç)
        Vr = V[:, :, reg, :]                                          # (S × T × Wr × cats)
        A = Vr[:, :, None, :, :]                                      # takım i
        B = Vr[:, None, :, :, :]                                      # takım j
        res = result(A, B)                                            # (S × T × T × Wr)
        eye = np.eye(T, dtype=bool)[None, :, :, None]
        res = np.where(eye, 0.0, res)
        ap_wins = res.sum(axis=(2, 3))                                # (S × T)
        ap_rate = ap_wins / (max(T - 1, 1) * len(reg))
        # Kategori kazanma payı (yalnız kategori formatı): rakiplere karşı ort. kazanılan kategori / hafta
        if is_cat:
            catw = ((A > B).sum(-1) + 0.5 * (A == B).sum(-1)).astype(float)
            catw = np.where(eye, 0.0, catw).sum(axis=(2, 3)) / (max(T - 1, 1) * len(reg))
        else:
            catw = None

        # Haftalık görünüm (regular + playoff haftaları): rakiplere karşı kategori/eşleşme kazanma olasılığı
        used = reg + po
        Vu = V[:, :, used, :]
        Au, Bu = Vu[:, :, None, :, :], Vu[:, None, :, :, :]
        eye_u = np.eye(T, dtype=bool)[None, :, :, None]
        opp_n = max(T - 1, 1)
        wk_match = np.where(eye_u, 0.0, result(Au, Bu)).sum(axis=2).mean(axis=0) / opp_n          # (T × Wu)
        if is_cat:
            cw = (Au > Bu).astype(float) + 0.5 * (Au == Bu)                                       # (S,T,T,Wu,cats)
            cw = np.where(eye_u[..., None], 0.0, cw).sum(axis=2).mean(axis=0) / opp_n            # (T × Wu × cats)
        games_pw = (n_spw.reshape(sims, T, R, -1).sum(axis=2) if blocks
                    else np.einsum("tp,spw->stw", onehot, n_spw, optimize=True)).mean(axis=0)[:, used]                  # (T × Wu)

        # H2H: rastgele round-robin programı
        rr = _round_robin(T if T % 2 == 0 else T + 1)
        h2h = np.zeros((sims, T))
        perm = rng.random((sims, T)).argsort(axis=1)                  # her simülasyonda takım → konum (rastgele program)
        inv = np.argsort(perm, axis=1)                                # konum → takım
        self_ix = np.arange(T)[None, :]
        for k, wi in enumerate(reg):
            opp_pos = rr[k % len(rr)][perm]                           # (S × T) rakibin konumu
            opp = np.where(opp_pos < T, np.take_along_axis(inv, np.minimum(opp_pos, T - 1), axis=1), self_ix)
            a = V[:, :, wi, :]
            o = np.take_along_axis(a, opp[:, :, None], axis=1)
            h2h += np.where(opp == self_ix, 0.0, result(a, o))
        # Sıralama: H2H galibiyeti, eşitlikte all-play gücü, sonra rastgele
        key = h2h * 1000 + ap_wins + rng.random((sims, T)) * 1e-3
        order = np.argsort(-key, axis=1)
        rank = np.empty_like(order)
        np.put_along_axis(rank, order, np.arange(1, T + 1)[None, :].repeat(sims, 0), axis=1)
        ap_order = np.argsort(-(ap_wins + rng.random((sims, T)) * 1e-3), axis=1)
        ap_rank = np.empty_like(ap_order)
        np.put_along_axis(ap_rank, ap_order, np.arange(1, T + 1)[None, :].repeat(sims, 0), axis=1)

        # Playoff'lar
        n_po = min(int(fmt.get("playoff_teams", 6)), T)
        champ = np.zeros((sims, T))
        made = rank <= n_po
        if po and n_po >= 2:
            first = _bracket(n_po)
            for s in range(sims):
                seeds = list(order[s, :n_po])                          # tohum sırasıyla takım indisleri
                rnd = 0
                cur = list(first)
                while True:
                    winners = []
                    wk = po[min(rnd, len(po) - 1)]
                    for a, b_ in cur:
                        if b_ is None:
                            winners.append(a)
                            continue
                        ta, tb = seeds[a], seeds[b_]
                        r = float(result(V[s, ta, wk, :], V[s, tb, wk, :]))
                        winners.append(a if r >= 0.5 else b_)         # eşitlikte üst tohum
                    if len(winners) == 1:
                        champ[s, seeds[winners[0]]] = 1.0
                        break
                    winners.sort()
                    cur = [(winners[i], winners[-1 - i]) for i in range(len(winners) // 2)]
                    rnd += 1

        out = {}
        for i, t in enumerate(teams):
            r, a = rank[:, i], ap_rank[:, i]
            out[t] = {
                "rank_mean": round(float(r.mean()), 2),
                "rank_p10_p90": [float(np.percentile(r, 10)), float(np.percentile(r, 90))],
                "rank_dist": [round(float((r == k).mean()), 3) for k in range(1, T + 1)],
                "playoff_prob": round(float(made[:, i].mean()), 3),
                "champion_prob": round(float(champ[:, i].mean()), 3),
                "first_place_prob": round(float((r == 1).mean()), 3),
                "expected_wins": round(float(h2h[:, i].mean()), 2),
                "all_play_rate": round(float(ap_rate[:, i].mean()), 3),
                "all_play_rank_mean": round(float(a.mean()), 2),
                "all_play_playoff_prob": round(float((a <= n_po).mean()), 3),
            }
            if catw is not None:
                out[t]["category_wins_per_week"] = round(float(catw[:, i].mean()), 2)
            out[t]["weekly"] = [
                {"week": int(self.weeks[w]), "playoff": self.weeks[w] in self.playoff_weeks,
                 "games": round(float(games_pw[i, k]), 2), "win_prob": round(float(wk_match[i, k]), 3),
                 **({"cats_won": round(float(cw[i, k].sum()), 2),
                     "cat_win": [round(float(x), 3) for x in cw[i, k]]} if is_cat else {})}
                for k, w in enumerate(used)]
        order_m = sorted(teams, key=lambda t: out[t]["rank_mean"])
        for k, t in enumerate(order_m, start=1):
            out[t]["projected_rank"] = k
        return out


def complete_league(b: dr.Board, my_roster: list[int], slot: int, seed: int = 0,
                    fixed: dict[int, list[int]] | None = None) -> dict[int, list[int]]:
    """Yalnız kullanıcının kadrosu biliniyorsa (asistan / kayıtlı liste) diğer takımların kadrolarını botlarla
    tamamlar: kullanıcının oyuncuları havuzdan çıkarılır, kalan takımlar draft.mixed_bot_styles ile snake sırasında
    seçer. Her `seed` farklı bir rakip seti verir ("11 simüle rakip"). `fixed`: bilinen rakip kadroları
    (slot → oyuncu listesi) — bunlar olduğu gibi kalır, botlar geri kalanı doldurur."""
    fixed = fixed or {}
    rng = np.random.default_rng(seed)
    styles = dr.mixed_bot_styles(b.teams, slot)
    orders = {t: dr._bot_order(b, st, rng) for t, st in styles.items()}
    rosters: dict[int, list[int]] = {t: [] for t in range(1, b.teams + 1)}
    rosters[slot] = list(my_roster)
    for t, r in fixed.items():
        rosters[t] = list(r)
    taken: set[int] = set(my_roster) | {p for r in fixed.values() for p in r}
    for overall in range(1, b.total_picks + 1):
        owner = dr.pick_owner(overall, b.teams)
        if owner == slot or owner in fixed:
            continue
        left_after = b.rounds - len(rosters[owner]) - 1
        pid = dr._bot_pick(b, orders[owner], taken, rosters[owner], left_after)
        taken.add(pid)
        rosters[owner].append(pid)
    return rosters
