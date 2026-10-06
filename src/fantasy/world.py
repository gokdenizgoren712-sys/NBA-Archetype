# -*- coding: utf-8 -*-
"""Dünya — NBA'nin oyun düzeyinde simülasyonu; fantezi simülatörünün (Faz 6) oyuncu üretim kaynağı.

`team_sim.py` her takım için K senaryo × 82 oyun'un BEKLENEN istatistiklerini üretir (sakatlık, oyun içi dakika dağıtımı, sahadaki
takım arkadaşlarına göre kullanım, yetenek şoku). Burada üstüne OYUN İÇİ GÜRÜLTÜ eklenir ve sonuç fantezi haftalarına toplanır:

  oyun gürültüsü : sayma istatistikleri (FGA, FTA, REB, AST, STL, BLK, TOV) negatif binom (gamma-Poisson; varyans/ortalama oranları
                   2025-26 maç loglarından ölçüldü: FGA 1.35, FTA 2.1, REB 1.25, AST 1.18, STL 1.06, BLK 1.04, TOV 1.01);
                   3'lük denemeler FGA'nın binom payı; isabetler binom: 2'lik ve 3'lük isabet, serbest atış isabeti. PTS = 2·FGM + 3PM + FTM kimlik olarak çıkar
                   (projeksiyonda da birebir böyle) — puan, FG% ve FT% tutarlı kalır.
  haftalık toplam: oyun → fantezi haftası takımın fikstür sayısıyla eşlenir (GAMES_EXPECTED, toplam 82; NBA Cup'ın kesirli oyunları
                   kümülatif yuvarlamayla dağılır).

Saklanan (float32): `sums[senaryo, hafta, oyuncu, istatistik]`, `games[senaryo, hafta, oyuncu]` ve `best_hs[senaryo, hafta, oyuncu]`
(haftanın en iyi tek maçı, High Score ağırlıklarıyla: PTS + REB + 2·AST + 3·STL + 3·BLK). K=128'de ≈ 100 MB.
Girdi: projeksiyon dosyasındaki `SI_*` sütunları (team_sim.sim_inputs) — maç logu gerekmez.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd

from src.fantasy import team_sim as ts

# Fantezi toplama sırası (season_sim.STATS ile aynı)
WSTATS = ["FGM", "FGA", "FTM", "FTA", "FG3M", "PTS", "REB", "AST", "STL", "BLK", "TOV"]
HS_WEIGHTS = {"PTS": 1.0, "REB": 1.0, "AST": 2.0, "STL": 3.0, "BLK": 3.0}
# varyans / ortalama (negatif binom aşırı yayılımı); 2025-26, ≥40 maç ve ≥20 dk oynayan 232 oyuncu
DISPERSION = {"FGA": 1.35, "FTA": 2.1, "REB": 1.25, "AST": 1.18, "STL": 1.06, "BLK": 1.04, "TOV": 1.01}


def week_of_game(team_weeks: pd.DataFrame, games: int | dict[str, int] = 82) -> tuple[list[int], dict[str, np.ndarray]]:
    """Takım başına oyun indeksi → hafta sırası (WSTATS ekseni). Dönüş: (haftalar, {takım: (games,) hafta indeksi}).
    games: her takım için aynı sayı ya da {takım: oyun} (sezon içi: kalan maç)."""
    weeks = sorted(int(w) for w in team_weeks["WEEK"].unique())
    out: dict[str, np.ndarray] = {}
    for team, g in team_weeks.groupby("TEAM"):
        n = int(games[str(team)]) if isinstance(games, dict) and str(team) in games else (82 if isinstance(games, dict) else int(games))
        exp = g.set_index("WEEK")["GAMES_EXPECTED"].reindex(weeks).fillna(0.0).to_numpy(float)
        bounds = np.rint(np.cumsum(exp) / max(exp.sum(), 1e-9) * n).astype(int)
        counts = np.diff(np.concatenate([[0], bounds]))
        out[str(team)] = np.repeat(np.arange(len(weeks)), counts)[:n]
    return weeks, out


def rest_from_week(weeks: pd.DataFrame, as_of: str | None) -> int | None:
    """Sezon içinde tamamen oynanmamış ilk hafta (SeasonSim.default_from_week ile aynı); sezon öncesinde None."""
    if not as_of:
        return None
    t = pd.Timestamp(as_of)
    nxt = weeks[pd.to_datetime(weeks["START"]) > t]
    return int(nxt["WEEK"].min()) if len(nxt) else None


def rest_games(team_weeks: pd.DataFrame, weeks: pd.DataFrame, as_of: str, from_week: int) -> tuple[dict[str, int], dict[str, float]]:
    """Takım başına: (from_week ve sonrasındaki maç sayısı, as_of ile from_week arasında kalan kısmen oynanmış haftanın kalan maçı).
    SeasonSim.view'daki 'skipped' hesabının aynısı — dünya yalnız from_week'ten başlar, oyuncunun kalan maçı bu oranla küçülür."""
    t = pd.Timestamp(as_of)
    span = {int(r.WEEK): (pd.Timestamp(r.START), pd.Timestamp(r.END)) for r in weeks.itertuples()}
    games, skipped = {}, {}
    for team, g in team_weeks.groupby("TEAM"):
        ge = g.set_index("WEEK")["GAMES_EXPECTED"]
        games[str(team)] = int(round(float(ge[ge.index >= from_week].sum())))
        sk = 0.0
        for w, x in ge.items():
            if w >= from_week or int(w) not in span:
                continue
            a, e = span[int(w)]
            if e <= t:
                continue
            left = 1.0 if a > t else float((e - t).days) / max(float((e - a).days + 1), 1.0)
            sk += float(x) * min(max(left, 0.0), 1.0)
        skipped[str(team)] = sk
    return games, skipped


def _nb(rng: np.random.Generator, lam: np.ndarray, phi: float) -> np.ndarray:
    """Ortalaması lam, varyansı phi·lam olan sayma değişkeni (gamma-Poisson); phi ≤ 1 → Poisson."""
    lam = np.maximum(lam, 0.0)
    if phi <= 1.0001:
        return rng.poisson(lam).astype(np.float32)
    shape = np.maximum(lam / (phi - 1.0), 1e-6)
    return rng.poisson(rng.gamma(shape, phi - 1.0)).astype(np.float32)


def game_draws(lam: dict[str, np.ndarray], present: np.ndarray, rng: np.random.Generator) -> dict[str, np.ndarray]:
    """λ'lardan oyun düzeyi istatistikler (K × G × n). Sahada olmayan oyuncu 0."""
    pr = present.astype(np.float32)
    fga = _nb(rng, lam["FGA"], DISPERSION["FGA"]) * pr
    tiny = 1e-9
    q3 = np.clip(lam["FG3A"] / np.maximum(lam["FGA"], tiny), 0, 1)                    # 3'lük deneme payı: FG3A ≤ FGA kendiliğinden, beklenti korunur
    fg3a = rng.binomial(fga.astype(np.int32), q3).astype(np.float32)
    fta = _nb(rng, lam["FTA"], DISPERSION["FTA"]) * pr
    p3 = np.clip(lam["FG3M"] / np.maximum(lam["FG3A"], tiny), 0, 1)
    p2 = np.clip((lam["FGM"] - lam["FG3M"]) / np.maximum(lam["FGA"] - lam["FG3A"], tiny), 0, 1)
    pf = np.clip(lam["FTM"] / np.maximum(lam["FTA"], tiny), 0, 1)
    fg3m = rng.binomial(fg3a.astype(np.int32), p3).astype(np.float32)
    fg2m = rng.binomial((fga - fg3a).astype(np.int32), p2).astype(np.float32)
    ftm = rng.binomial(fta.astype(np.int32), pf).astype(np.float32)
    fgm = fg2m + fg3m
    out = {"FGA": fga, "FGM": fgm, "FG3M": fg3m, "FTA": fta, "FTM": ftm, "PTS": 2.0 * fgm + fg3m + ftm}
    for s in ("REB", "AST", "STL", "BLK", "TOV"):
        out[s] = _nb(rng, lam[s], DISPERSION[s]) * pr
    return out


@dataclass
class World:
    player_ids: np.ndarray
    weeks: list[int]
    sums: np.ndarray            # (K × W × P × len(WSTATS)) float32
    games: np.ndarray           # (K × W × P) int8
    best_hs: np.ndarray         # (K × W × P) float32 — haftanın en iyi tek maçı (High Score ağırlıkları)
    scenarios: int
    seconds: float = 0.0
    from_week: int | None = None    # sezon içi: dünya yalnız bu haftadan başlar (öncesi 0); None → tam sezon
    _mean_sums: np.ndarray | None = None
    _mean_best: np.ndarray | None = None

    @property
    def nbytes(self) -> int:
        return int(self.sums.nbytes + self.games.nbytes + self.best_hs.nbytes)

    def index(self) -> dict[int, int]:
        return {int(p): i for i, p in enumerate(self.player_ids)}

    def mean_sums(self) -> np.ndarray:
        """(W × P × S) senaryo ortalaması — piyasa çekmesi ortalamayı kaydırırken gürültüyü korusun diye."""
        if getattr(self, "_mean_sums", None) is None:
            self._mean_sums = self.sums.mean(axis=0)
            self._mean_best = self.best_hs.mean(axis=0)
        return self._mean_sums

    def mean_best(self) -> np.ndarray:
        self.mean_sums()
        return self._mean_best

    def season_per_game(self) -> pd.DataFrame:
        """Oyuncu başına oynanan maç başına ortalama (senaryo ortalaması) — SIM_* ile karşılaştırma ve test için."""
        tot = self.sums.sum(axis=1)                                   # (K × P × S)
        gp = self.games.sum(axis=1).astype(np.float64)                # (K × P)
        per = np.where(gp[:, :, None] > 0, tot / np.maximum(gp[:, :, None], 1), np.nan)
        out = pd.DataFrame(np.nanmean(per, axis=0), index=self.player_ids, columns=WSTATS)
        out["GP"] = gp.mean(axis=0)
        return out


def build_world(inputs: pd.DataFrame, team_weeks: pd.DataFrame, model: dict, scenarios: int = 128, seed: int = 20261020,
                progress: bool = False, from_week: int | None = None, weeks_table: pd.DataFrame | None = None,
                as_of: str | None = None) -> World:
    """inputs: projeksiyon tablosu (PLAYER_ID, TEAM, FP_RATIO_Q, GP_RATIO_Q ve SI_* sütunları).
    from_week (+ weeks_table, as_of): sezon içi kalan-sezon dünyası — yalnız from_week ve sonrası oynanır (öncesi 0); girdideki SI_GP
    kalan maçtır, takımın from_week sonrası maçına oranla küçülür (kısmen oynanmış hafta dışarıda kalır)."""
    t0 = time.time()
    games_by: dict[str, int] | None = None
    if from_week is not None:
        if weeks_table is None or as_of is None:
            raise ValueError("from_week needs weeks_table and as_of")
        games_by, skipped = rest_games(team_weeks, weeks_table, as_of, from_week)
        inputs = inputs.copy()
        tm = inputs["TEAM"].astype(str)
        scale = tm.map(lambda x: games_by.get(x, 0) / max(games_by.get(x, 0) + skipped.get(x, 0.0), 1.0)).fillna(0.0)
        inputs["SI_GP"] = np.minimum(inputs["SI_GP"].to_numpy(float) * scale.to_numpy(float), tm.map(lambda x: float(games_by.get(x, 0))).to_numpy(float))
        team_weeks = team_weeks.copy()
        team_weeks.loc[team_weeks["WEEK"] < from_week, "GAMES_EXPECTED"] = 0.0
    p, team, fits, Lold, gpq, fpq, params = ts._frame_inputs(inputs, model, scenarios)
    params.seed = seed
    pids = np.asarray(p.index)
    pos = {int(pid): i for i, pid in enumerate(pids)}
    weeks, wog = week_of_game(team_weeks, games_by if games_by is not None else params.games)
    W, P, K = len(weeks), len(pids), params.scenarios
    sums = np.zeros((K, W, P, len(WSTATS)), dtype=np.float32)
    games = np.zeros((K, W, P), dtype=np.int8)
    best = np.zeros((K, W, P), dtype=np.float32)
    sidx = {s: i for i, s in enumerate(WSTATS)}
    for ti, (tm, g) in enumerate(p.groupby(team.reindex(p.index))):
        if not isinstance(tm, str) or tm not in wog:
            continue
        ix = [pos[int(q)] for q in g.index]
        G = len(wog[tm])
        if G == 0:
            continue
        Pt = replace(params, games=G)
        lam, present, _m = ts.team_game_lambdas(g, fits, {k: v[ix] for k, v in Lold.items()}, gpq[ix], fpq[ix], Pt, seed_offset=ti)
        rng = np.random.default_rng([seed, 17, ti])
        draws = game_draws(lam, present, rng)
        onehot = np.zeros((G, W), dtype=np.float32)
        onehot[np.arange(G), wog[tm]] = 1.0
        for s in WSTATS:
            sums[:, :, ix, sidx[s]] = np.einsum("kgn,gw->kwn", draws[s], onehot, optimize=True)
        games[:, :, ix] = np.einsum("kgn,gw->kwn", present.astype(np.float32), onehot, optimize=True).astype(np.int8)
        fp_hs = sum(draws[s] * w for s, w in HS_WEIGHTS.items())
        fp_hs = np.where(present, fp_hs, -1.0)
        for w in range(W):
            gi = np.flatnonzero(wog[tm] == w)
            if gi.size:
                best[:, w, ix] = np.maximum(fp_hs[:, gi, :].max(axis=1), 0.0)
        if progress:
            print(f"[world] {tm} ({ti + 1}) {time.time() - t0:.1f}s", flush=True)
    return World(pids, weeks, sums, games, best, K, time.time() - t0, from_week=from_week)


def load_world(projection_path, team_weeks_path, model_path, scenarios: int = 128) -> World:
    inputs = pd.read_parquet(projection_path)
    tw = pd.read_parquet(team_weeks_path)
    model = json.loads(open(model_path, encoding="utf-8").read())
    return build_world(inputs, tw, model, scenarios)
