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

KALAN SEZON (sezon içi): `from_week` verilirse yalnız o haftadan sonrası oynanır (geçmiş haftalar atlanır).
Oyuncunun kalan maçı PROJ_GP − INSEASON_GP'den gelir (sezon öncesinde toplamın kalan payı), sakatlık blokları
yalnız kalan takım maçlarına yayılır; üretim şansı (çarpan) kalan payın karekökü kadar daralır (sezon içi backtest'te
hata 4.97→3.61, yani ~0.73 ≈ √0.5) ve piyasaya büzme (draft.SHRINK) kanıt biriktikçe gevşer.
`base_wins` mevcut H2H galibiyetlerini sıralamaya ekler.

HIGH SCORE: haftalık takım skoru = her starter'ın o hafta oynadığı maçların EN İYİSİ (toplam değil). Kadro her hafta
maç sayısına göre kurulur (beklenen tavana göre açgözlü + pozisyon eşleştirmesi, week.best_lineup ile aynı mantık);
o hafta hiç oynamayan starter'ın yerine öncelik sırasındaki ilk uygun yedek girer (pozisyon kısıtı yedek girişinde
gevşek: yedek çoğunlukla esnek). Oyuncu skoru = ortalama × üretim çarpanı × Q_HIGH_SCORE'un k-maç maksimum kantili.

Girdi: draft.Board (projeksiyon + değer + ADP) ve takım-hafta maç sayıları (calendar.build_team_weeks).
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.special import ndtri
from scipy.stats import binom

from src.fantasy import draft as dr

STATS = ["FGM", "FGA", "FTM", "FTA", "FG3M", "PTS", "REB", "AST", "STL", "BLK", "TOV"]
CAT_OF = {"FG%": ("FGM", "FGA"), "FT%": ("FTM", "FTA"), "3PM": "FG3M", "PTS": "PTS", "REB": "REB",
          "AST": "AST", "STL": "STL", "BLK": "BLK", "TO": "TOV"}
# Gürültü kaynağı: sayma istatistiklerinde kendi SD'si; FGM/FTM'de vuruş "etkisi" SD'si (FGA/FTA sabit)
SD_COL = {"FGM": "SD_FG_IMP", "FTM": "SD_FT_IMP", "FG3M": "SD_FG3M", "PTS": "SD_PTS", "REB": "SD_REB",
          "AST": "SD_AST", "STL": "SD_STL", "BLK": "SD_BLK", "TOV": "SD_TOV"}
BLOCK_SHARES = (0.42, 0.25)
_HS_W = {"PTS": 1.0, "REB": 1.0, "AST": 2.0, "STL": 3.0, "BLK": 3.0}          # dünyanın "en iyi maç" ağırlıkları (High Score)


def w_stats() -> list[str]:
    from src.fantasy.world import WSTATS
    return WSTATS      # kaçırılan maçların ardışık iki bloktaki payı; kalanı dağınık
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


class _View:
    """Simülasyonun baktığı sezon dilimi: hangi haftalar oynanacak, oyuncu başına kalan maç / ortalama."""
    __slots__ = ("G", "T", "gp", "denom", "spread", "mean", "fp_mean", "from_week", "_hs_ceil")

    def __init__(self, G, T, gp, denom, spread, mean, fp_mean, from_week):
        self.G, self.T, self.gp, self.denom, self.spread = G, T, gp, denom, spread
        self.mean, self.fp_mean, self.from_week = mean, fp_mean, from_week
        self._hs_ceil = None


class SeasonSim:
    def __init__(self, b: dr.Board, team_weeks: pd.DataFrame, shrink: float | None = None,
                 playoff_weeks: list[int] | None = None, weeks: pd.DataFrame | None = None, as_of: str | None = None,
                 world=None, world_shrink: bool = True):
        self.b = b
        fmt = b.fmt
        self.fmt = fmt
        df = b.df
        n = len(df)
        gp = np.maximum(df["PROJ_GP"].to_numpy(float), 1.0)
        mean = np.stack([df[s].to_numpy(float) for s in STATS], axis=1)                # (n × 11) maç başı
        # Piyasaya büzme (draft.SHRINK) — toplam düzeyinde, draft motoruyla aynı yerel-ortalama üzerinden
        k = dr.SHRINK.get(fmt["kind"], 1.0) if shrink is None else shrink
        self._k = k
        self.gp = gp
        self._tot = mean * gp[:, None]
        self._loc = dr.local_market_mean(b.adp, self._tot) if k < 1.0 else None
        self._raw_mean = mean
        self.mean = self._shrunk(k)
        self.sd = np.stack([df[SD_COL[s]].to_numpy(float) if s in SD_COL else np.zeros(n) for s in STATS], axis=1)
        self.sd = np.nan_to_num(self.sd)
        self._w = np.array([fmt["weights"].get(s, 0.0) for s in STATS]) if fmt["kind"] != "categories" else None
        if fmt["kind"] != "categories":
            w = self._w
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
        self.insea_gp = df["INSEASON_GP"].to_numpy(float) if "INSEASON_GP" in df.columns else np.zeros(n)
        self.as_of = as_of
        self._week_span = ({int(r.WEEK): (pd.Timestamp(r.START), pd.Timestamp(r.END)) for r in weeks.itertuples()}
                           if weeks is not None else {})
        self._views: dict = {}
        self.world = world if (world is not None and list(world.weeks) == list(self.weeks)) else None   # Faz 6: NBA dünyası (None → eski motor)
        self._widx = self.world.index() if self.world is not None else None
        self.world_shrink = world_shrink       # dünyaya da piyasaya çekme (draft.SHRINK): eski motorun kalibre ettiği takım yayılımı
        self._wfac: np.ndarray | None = None
        self._full = _View(G=self.G, T=self.total_games, gp=self.gp, denom=np.full(n, TEAM_GAMES), spread=1.0,
                           mean=self.mean, fp_mean=getattr(self, "fp_mean", None), from_week=None)

    def _shrunk(self, k: float) -> np.ndarray:
        if self._loc is None:
            return np.maximum(self._raw_mean, 0.0)
        return np.maximum((self._loc + k * (self._tot - self._loc)) / np.maximum(self.gp, MIN_GP_FOR_SHRINK)[:, None], 0.0)

    # ── Kalan sezon ─────────────────────────────────────────────────────────

    def default_from_week(self) -> int | None:
        """Sezon içindeyse (as_of biliniyor) tamamen oynanmamış ilk hafta; sezon öncesinde None (tam sezon).
        Kısmen oynanmış hafta dışarıda kalır (onun sonuçları 'This week' ekranında)."""
        if not self.as_of or not self._week_span:
            return None
        t = pd.Timestamp(self.as_of)
        nxt = [w for w in self.weeks if w in self._week_span and self._week_span[w][0] > t]
        return min(nxt) if nxt else None

    def availability(self, row: int, from_week: int | None = None) -> float:
        """Bir oyuncunun (satır) görünümdeki maç oynama olasılığı."""
        v = self.view(from_week)
        return float(np.clip(v.gp[row] / v.denom[row], 0.0, 1.0))

    def view(self, from_week: int | None) -> _View:
        """`from_week` ve sonrası için kalan-sezon görünümü; None ya da ilk hafta → tam sezon."""
        if from_week is None or from_week <= self.weeks[0]:
            return self._full
        hit = self._views.get(from_week)
        if hit is not None:
            return hit
        keep = np.array([w >= from_week for w in self.weeks], dtype=float)
        G = self.G * keep[None, :]
        T = np.maximum(G.sum(axis=1), 1.0)
        # Kalan oyuncu maçı: projeksiyon toplamından oynananlar çıkar; sezon öncesinde toplamın kalan payı. as_of ile
        # from_week arasında kısmen oynanmış / atlanan hafta varsa onun maçları da kalan paydan oranla düşer.
        raw = np.maximum(self.gp - self.insea_gp, 0.0) if self.insea_gp.any() else self.gp * (T / self.total_games)
        skipped = np.zeros_like(T)
        if self.as_of and self._week_span:
            t = pd.Timestamp(self.as_of)
            for j, w in enumerate(self.weeks):
                if w >= from_week or w not in self._week_span:
                    continue
                a, e = self._week_span[w]
                if e <= t:
                    continue
                left = 1.0 if a > t else float((e - t).days) / max(float((e - a).days + 1), 1.0)
                skipped += self.G[:, j] * min(max(left, 0.0), 1.0)
        gp = np.clip(raw * T / np.maximum(T + skipped, 1.0), 0.0, T)
        rem = float(np.median(T / self.total_games))
        mean = self._shrunk(1.0 - (1.0 - self._k) * rem)
        v = _View(G=G, T=T, gp=gp, denom=T, spread=math.sqrt(rem), mean=mean,
                  fp_mean=(mean @ self._w) if self._w is not None else None, from_week=from_week)
        self._views[from_week] = v
        return v

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

    def _season_draws(self, rows: np.ndarray, U: dict[str, np.ndarray], v: _View | None = None):
        """(oyuncu sezon çarpanı S×P, oynanan maç oranı S×P). `v`: kalan-sezon görünümü (yoksa tam sezon)."""
        v = v or self._full
        if self.fp_q is not None:
            m = _draw_q(self.fp_q[rows], U["fp"][:, rows])
            r = _draw_q(self.gp_q[rows], U["gp"][:, rows])
        else:
            m = np.exp(self.b.fp_mu[rows] + self.b.fp_sigma[rows] * ndtri(np.clip(U["fp"][:, rows], 1e-9, 1 - 1e-9)))
            r = np.exp(self.b.gp_mu[rows] + self.b.gp_sigma[rows] * ndtri(np.clip(U["gp"][:, rows], 1e-9, 1 - 1e-9)))
        games = np.minimum(v.gp[rows][None, :] * np.maximum(r, 0.0), v.denom[rows][None, :])
        if v.spread != 1.0:
            m = 1.0 + (m - 1.0) * v.spread                   # gözlenen maç payı kadar üretim belirsizliği daralır
        return m, games / v.denom[rows][None, :]

    def _weekly_games(self, rows: np.ndarray, frac: np.ndarray, U: dict[str, np.ndarray], v: _View | None = None) -> np.ndarray:
        """(S × P × W) o hafta oynanan maç: takım maçları − sakatlık blokları − dağınık kayıp."""
        v = v or self._full
        S, P = frac.shape
        G = v.G[rows]                                           # (P × W)
        T = v.T[rows]                                           # (P,)
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

    def week_draws(self, rows: np.ndarray, week: int, sims: int, seed: int, from_week: int | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Oyuncu satırları için o haftanın gerçekleşmesi: (üretim çarpanı S×P, oynanan maç S×P; kesirli)."""
        v = self.view(from_week)
        U = self._uniforms(sims, seed)
        mult, frac = self._season_draws(rows, U, v)
        return mult, self._weekly_games(rows, frac, U, v)[:, :, self.weeks.index(week)]

    def week_values(self, rosters_list: list[list[int]], week: int, sims: int = 300, seed: int = 0,
                    from_week: int | None = None) -> tuple[np.ndarray, np.ndarray]:
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
        v = self.view(from_week)
        U = self._uniforms(sims, seed)
        mult, frac = self._season_draws(rows, U, v)
        n_w = self._weekly_games(rows, frac, U, v)[:, :, self.weeks.index(week)][:, :, None]   # (S × P × 1)
        rng = np.random.default_rng([seed, 5])
        games = np.einsum("tp,spw->stw", onehot, n_w, optimize=True).mean(axis=0)[:, 0]

        def tsum(x: np.ndarray) -> np.ndarray:
            return np.einsum("tp,spw,spc->stwc", onehot, n_w, x, optimize=True)[:, :, 0, :]

        if fmt["kind"] == "categories":
            mu = v.mean[rows][None] * mult[:, :, None]
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
        mu = (v.fp_mean[rows][None] * mult)[:, :, None]
        sd = (self.fp_sd[rows][None] * mult)[:, :, None]
        pts = tsum(mu)
        return np.maximum(pts + np.sqrt(tsum(sd ** 2)) * rng.standard_normal(pts.shape), 0.0), games

    # ── High Score ──────────────────────────────────────────────────────────

    def _hs_ceilings(self, v: _View) -> np.ndarray:
        """(oyuncu × hafta) beklenen haftalık tavan: Σ_k Binom(takım maçı, oynama olasılığı)[k] × E[k maçın en iyisi]."""
        if v._hs_ceil is not None:
            return v._hs_ceil
        if not hasattr(self, "_etab"):
            from src.fantasy.valuation import expected_max_table
            self._etab = np.array([expected_max_table(list(q)) for q in self.b.df["Q_HIGH_SCORE"]])     # (n × 8), ortalamaya oranlı
            self._qhs = np.array([list(q) for q in self.b.df["Q_HIGH_SCORE"]], float)
        kmax = self._etab.shape[1] - 1
        n_games = np.minimum(np.rint(v.G), kmax).astype(int)                     # (n × W)
        p = np.clip(v.gp / v.denom, 0.0, 1.0)[:, None, None]
        pmf = binom.pmf(np.arange(kmax + 1)[None, None, :], n_games[:, :, None], p)   # (n × W × K)
        ceil = (pmf * self._etab[:, None, :]).sum(axis=2) * v.fp_mean[:, None]
        v._hs_ceil = ceil
        return ceil

    def _hs_priority(self, v: _View, rows: np.ndarray, sizes: list[int]) -> np.ndarray:
        """(T × W × R) her takım-hafta için oyuncu öncelik sırası (takım içi yerel indeks; -1 = dolgu):
        önce pozisyon kısıtı altında tavanı en yüksek starter'lar, sonra kalanlar tavana göre."""
        b = self.b
        n_slots = len(b.slots)
        ceil = self._hs_ceilings(v)
        W, R = ceil.shape[1], max(sizes)
        out = np.full((len(sizes), W, R), -1, dtype=int)
        cache = self.__dict__.setdefault("_hs_prio", {})
        off = 0
        for t, size in enumerate(sizes):
            r = rows[off:off + size]
            off += size
            key = (v.from_week, tuple(int(x) for x in r))
            hit = cache.get(key)
            if hit is None:
                hit = np.full((W, size), -1, dtype=int)
                masks = [b.masks[x] for x in r]
                for w in range(W):
                    c = ceil[r, w]
                    order = list(np.argsort(-c, kind="stable"))
                    chosen: list[int] = []
                    for j in order:
                        if len(chosen) >= n_slots:
                            break
                        if dr._max_filled_masks(tuple(masks[i] for i in chosen + [j]), n_slots) == len(chosen) + 1:
                            chosen.append(j)
                    hit[w] = chosen + [j for j in order if j not in chosen]
                if len(cache) >= 512:
                    cache.pop(next(iter(cache)))
                cache[key] = hit
            out[t, :, :size] = hit
        return out

    def _hs_scores(self, v: _View, rows: np.ndarray, sizes: list[int], n_spw: np.ndarray, mult: np.ndarray,
                   rng: np.random.Generator) -> np.ndarray:
        """(S × T × W) haftalık High Score takım skoru."""
        S, P, W = n_spw.shape
        n_slots = len(self.b.slots)
        k = np.floor(n_spw) + (rng.random(n_spw.shape) < (n_spw - np.floor(n_spw)))       # tam sayı maç
        u_max = rng.random(n_spw.shape) ** (1.0 / np.maximum(k, 1.0))                      # k maçın en iyisinin yüzdeliği
        _ = self._hs_ceilings(v)                                                            # _qhs / _etab hazır
        q = np.repeat(self._qhs[rows], W, axis=0)                                           # (P·W × K), p-büyük sırada
        draw = _draw_q(q, u_max.reshape(S, P * W)).reshape(S, P, W)
        score = np.where(k > 0, v.fp_mean[rows][None, :, None] * mult[:, :, None] * draw, 0.0)
        prio = self._hs_priority(v, rows, sizes)                                            # (T × W × R)
        offs = np.concatenate([[0], np.cumsum(sizes)[:-1]])
        pad = prio < 0
        g = np.where(pad, P, prio + offs[:, None, None])                                    # global oyuncu indeksi; P = boş
        wi = np.broadcast_to(np.arange(W)[None, :, None], g.shape)
        score_x = np.concatenate([score, np.zeros((S, 1, W))], axis=1)
        avail_x = np.concatenate([k > 0, np.zeros((S, 1, W), dtype=bool)], axis=1)
        sc, av = score_x[:, g, wi], avail_x[:, g, wi]                                      # (S × T × W × R)
        take = av & (np.cumsum(av, axis=-1) <= n_slots)
        return (sc * take).sum(axis=-1)

    # ── Dünya (Faz 6): oyuncu üretimi NBA simülasyonundan okunur ────────────────────────

    def _world_factor(self) -> np.ndarray:
        """(n_oyuncu × 11) piyasaya çekme çarpanı: (yerel piyasa ortalaması + κ·(toplam − ortalama)) / toplam — eski motorun `_shrunk`'ı ile aynı."""
        if self._wfac is None:
            if self._loc is None or self._k >= 1.0:
                self._wfac = np.ones_like(self._tot)
            else:
                self._wfac = np.clip((self._loc + self._k * (self._tot - self._loc)) / np.where(np.abs(self._tot) < 1e-9, 1e-9, self._tot), 0.2, 3.0)
        return self._wfac

    def _world_values(self, rows: np.ndarray, sizes: list[int], sims: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
        """Haftalık takım değerleri V (S × T × W × C) ve haftalık takım oyuncu-maç sayısı (S × T × W) — dünyadan.
        Her fantezi simülasyonu bir NBA senaryosuna bağlanır (`seed`'den, takımlardan bağımsız): aynı tohumla aynı NBA sezonu → takas gibi
        öncesi / sonrası karşılaştırmalarında ortak rastgele sayılar kendiliğinden korunur; aynı NBA takımından oyuncular birlikte hareket eder."""
        w, b, fmt = self.world, self.b, self.fmt
        T = len(sizes)
        widx = np.array([self._widx[int(b.ids[r])] for r in rows])
        ks = np.random.default_rng([seed, 23]).integers(0, w.scenarios, size=sims)
        sel = lambda arr: arr[ks[:, None], :, widx[None, :]]                         # (S × P × W [× C]) — ileri indeksleme, kopya küçük
        counts = sel(w.sums)                                                         # (S × P × W × C)
        games = sel(w.games).astype(np.float32)                                      # (S × P × W)
        f = self._world_factor()[rows] if self.world_shrink else None                # (P × C) piyasaya çekme çarpanı
        if f is not None:
            ms = w.mean_sums()[:, widx, :].transpose(1, 0, 2)[None]                  # (1 × P × W × C)
            counts = np.maximum(counts + (f[None, :, None, :] - 1.0) * ms, 0.0)      # ortalamayı kaydır, gürültüyü koru
        owner = np.repeat(np.arange(T), sizes)

        def team_sum(x: np.ndarray) -> np.ndarray:                                   # (S × P × ...) → (S × T × ...)
            if len(set(sizes)) == 1:
                return x.reshape(sims, T, sizes[0], *x.shape[2:]).sum(axis=2)
            out = np.zeros((sims, T) + x.shape[2:], dtype=x.dtype)
            for t in range(T):
                out[:, t] = x[:, owner == t].sum(axis=1)
            return out

        tot = team_sum(counts)                                                       # (S × T × W × C)
        games_tw = team_sum(games)                                                   # (S × T × W)
        ix = {s_: j for j, s_ in enumerate(w_stats())}
        if fmt["kind"] == "categories":
            cols = []
            for c in fmt["categories"]:
                spec = CAT_OF[c]
                if isinstance(spec, tuple):
                    cols.append(tot[..., ix[spec[0]]] / np.maximum(tot[..., ix[spec[1]]], 1e-9))
                else:
                    cols.append(-tot[..., ix[spec]] if c == "TO" else tot[..., ix[spec]])
            return np.stack(cols, axis=-1).astype(np.float64), games_tw
        if fmt["kind"] == "points":
            pts = sum(tot[..., ix[k]] * wt for k, wt in fmt["weights"].items() if k in ix)
            return pts[..., None].astype(np.float64), games_tw
        # High Score: her starter haftanın EN İYİ tek maçını getirir; kadro beklenen tavana göre kurulur, oynamayanın yerine sıradaki yedek girer
        best = sel(w.best_hs)                                                        # (S × P × W)
        if f is not None:
            tot_r = self._tot[rows]                                                  # (P × C) model sezon toplamları
            wt = np.array([fmt["weights"].get(s_, 0.0) for s_ in STATS])
            f_fp = (tot_r * f * wt).sum(axis=1) / np.maximum((tot_r * wt).sum(axis=1), 1e-9)
            mb = w.mean_best()[:, widx].T[None]                                       # (1 × P × W)
            best = np.maximum(best + (f_fp[None, :, None] - 1.0) * mb, 0.0)
        prio = self._hs_priority(self._full, rows, sizes)                            # (T × W × R)
        n_slots = len(b.slots)
        P, W = best.shape[1], best.shape[2]
        offs = np.concatenate([[0], np.cumsum(sizes)[:-1]])
        pad = prio < 0
        g = np.where(pad, P, prio + offs[:, None, None])
        wi = np.broadcast_to(np.arange(W)[None, :, None], g.shape)
        best_x = np.concatenate([best, np.zeros((sims, 1, W), dtype=best.dtype)], axis=1)
        av_x = np.concatenate([games > 0, np.zeros((sims, 1, W), dtype=bool)], axis=1)
        sc, av = best_x[:, g, wi], av_x[:, g, wi]                                    # (S × T × W × R)
        take = av & (np.cumsum(av, axis=-1) <= n_slots)
        return (sc * take).sum(axis=-1)[..., None].astype(np.float64), games_tw

    # ── Simülasyon ──────────────────────────────────────────────────────────

    def simulate(self, rosters: dict[int, list[int]], sims: int = 100, seed: int = 0, from_week: int | None = None,
                 base_wins: dict[int, float] | None = None) -> dict[int, dict]:
        """`from_week`: kalan-sezon görünümü (None → tam sezon). `base_wins`: takım → şimdiye kadarki H2H galibiyeti
        (sıralamaya eklenir; yalnız kalan-sezon görünümünde anlamlı)."""
        b, fmt = self.b, self.fmt
        v = self.view(from_week)
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

        use_world = self.world is not None and v.from_week is None and all(int(b.ids[r]) in self._widx for r in rows)             and (fmt["kind"] != "high_score" or all(abs(fmt["weights"].get(k, 0.0) - w_) < 1e-9 for k, w_ in _HS_W.items()))
        if use_world:
            V, games_tw = self._world_values(rows, sizes, sims, seed)           # (S × T × W × C), (S × T × W)
            n_spw = None
        else:
            U = self._uniforms(sims, seed)
            mult, frac = self._season_draws(rows, U, v)
            n_spw = self._weekly_games(rows, frac, U, v)            # (S × P × W)
            games_tw = None

        if use_world:
            pass
        elif fmt["kind"] == "categories":
            mu = v.mean[rows][None] * mult[:, :, None]              # (S × P × C)
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
        elif fmt["kind"] == "high_score":
            V = self._hs_scores(v, rows, [len(rosters[t]) for t in teams], n_spw, mult, rng)[..., None]   # (S × T × W × 1)
        else:
            mu = (v.fp_mean[rows][None] * mult)                     # (S × P)
            sd = self.fp_sd[rows][None] * mult
            pts = tsum(n_spw, mu[:, :, None])[..., 0]
            var = tsum(n_spw, (sd ** 2)[:, :, None])[..., 0]
            V = (pts + np.sqrt(var) * rng.standard_normal(pts.shape))[..., None]   # (S × T × W × 1)

        weeks_ix = {w: i for i, w in enumerate(self.weeks)}
        reg_all = [weeks_ix[w] for w in self.reg_weeks]
        reg = [weeks_ix[w] for w in self.reg_weeks if v.from_week is None or w >= v.from_week]
        po = [weeks_ix[w] for w in self.playoff_weeks]
        if not reg:
            raise ValueError("No regular-season weeks are left to simulate.")
        base = np.array([float((base_wins or {}).get(t, 0.0)) for t in teams])[None, :]
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
        if games_tw is None:
            games_tw = n_spw.reshape(sims, T, R, -1).sum(axis=2) if blocks else np.einsum("tp,spw->stw", onehot, n_spw, optimize=True)
        games_pw = games_tw.mean(axis=0)[:, used]                                                                     # (T × Wu)

        # H2H: rastgele round-robin programı
        rr = _round_robin(T if T % 2 == 0 else T + 1)
        h2h = np.zeros((sims, T))
        perm = rng.random((sims, T)).argsort(axis=1)                  # her simülasyonda takım → konum (rastgele program)
        inv = np.argsort(perm, axis=1)                                # konum → takım
        self_ix = np.arange(T)[None, :]
        for wi in reg:
            k = reg_all.index(wi)                                     # program tam sezondaki sırasıyla sürer
            opp_pos = rr[k % len(rr)][perm]                           # (S × T) rakibin konumu
            opp = np.where(opp_pos < T, np.take_along_axis(inv, np.minimum(opp_pos, T - 1), axis=1), self_ix)
            a = V[:, :, wi, :]
            o = np.take_along_axis(a, opp[:, :, None], axis=1)
            h2h += np.where(opp == self_ix, 0.0, result(a, o))
        # Sıralama: H2H galibiyeti, eşitlikte all-play gücü, sonra rastgele
        h2h = h2h + base
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
        self.last_engine = "world" if use_world else "legacy"
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
