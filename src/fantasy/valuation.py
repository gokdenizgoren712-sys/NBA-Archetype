# -*- coding: utf-8 -*-
"""Oyuncu değerlemesi — formata göre tek bir "değer" sayısı ve kırılımı.

Kategori formatları (Rosenof, "Static quantification of player value",
arXiv 2307.02188, Tablo 5 ile birebir):
  Z-score : dir · (μ(q) − μ̄) / σ
  G-score : dir · (μ(q) − μ̄) / √(σ² + κ·τ²),  κ = 2N / (2N − 1)
    μ(q) oyuncunun haftalık ortalaması, μ̄ ve σ havuz ortalaması / sapması,
    τ oyuncunun haftadan haftaya sapmasının havuzdaki karesel ortalaması,
    N takım başı oyuncu sayısı. Havuz: ilk (takım × kadro) oyuncu, 3 tur.
  Yüzdeler hacimle: X = isabet − p̄·deneme (p̄ havuzun toplam yüzdesi) —
    makaledeki (A/Ā)(R − R̄) ile aynı şey × Ā; z-score'da Ā sadeleşir.
  H2H'de G-score (haftalık oynaklık belirleyici), Roto'da Z-score varsayılan;
  ikisi de her zaman döner.

Points: maç başı puan × maç = sezon toplamı; değer = toplam − yedek seviyesi
  (havuzun hemen dışındaki `teams` oyuncunun ortalaması).

High Score: her hafta takımın maç sayısı n, oyuncunun o maçlardan k'sında
  oynaması Binom(n, p=maç oranı); haftalık değer = Σ P(k)·E[k maçın en iyisi].
  E[k maçın en iyisi] oyuncunun kendi maç puanı dağılımından (quantile
  fonksiyonu Q): ∫ Q(u)·k·u^(k−1) du.

`basis`: "total" oynanacak maçı hesaba katar (varsayılan), "per_game" katmaz.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from config.fantasy_formats import CATEGORIES

POOL_ROUNDS = 3
# Kaçırılan maçın yerine gelen yedek (waiver) oyuncunun üretimi: 0 = kaçırılan maç sıfır üretim sayılır (eski davranış),
# 1 = yedek, havuz dışı ilk `teams × REPL_DEPTH` oyuncunun ortalaması kadar üretir.
# 0.75 (2026-10-05): src/fantasy/valuation_backtest.py — 2023-24…2025-26 × 9-cat/puan, sıralamamızın gerçekleşen sezon değeriyle
# uyumu (Spearman) 6/6'da arttı, sakatlıktan dönenlerdeki sistematik hata ~0'a indi; strateji backtest'inde (4 tohum) 9-cat'te
# piyasaya karşı kazanma oranı +0.10 → +0.15, puanda gürültü içinde karışık (+0.03/−0.04 → −0.01/+0.04). Spearman 1.0'a kadar
# artıyor ama tam kredi (yedek her zaman hazır) iyimser; 0.75 ara değer.
REPL_CREDIT = 0.75
REPL_DEPTH = 3
_U = np.linspace(0, 1, 401)
# requirements numpy>=1.24 diyor; trapezoid 2.0'da geldi, trapz 2.x'te kaldırılıyor.
_trapz = getattr(np, "trapezoid", None) or np.trapz

# Kategori → (projeksiyondaki maç başı kolon, sapma kolonu)
CAT_COLUMNS = {
    "PTS": ("PTS", "SD_PTS"), "REB": ("REB", "SD_REB"), "AST": ("AST", "SD_AST"),
    "STL": ("STL", "SD_STL"), "BLK": ("BLK", "SD_BLK"), "3PM": ("FG3M", "SD_FG3M"),
    "TO": ("TOV", "SD_TOV"), "FG%": (None, "SD_FG_IMP"), "FT%": (None, "SD_FT_IMP"),
}
PCT_PARTS = {"FG%": ("FGM", "FGA"), "FT%": ("FTM", "FTA")}


def roster_size(fmt: dict) -> int:
    r = fmt["roster"]
    return len(r["starters"]) + r.get("bench", 0)


def pool_size(fmt: dict) -> int:
    return fmt["teams"] * roster_size(fmt)


def games_per_week(proj: pd.DataFrame, team_weeks: pd.DataFrame, fmt: dict, basis: str) -> pd.Series:
    """Oyuncunun normal sezonda haftada oynaması beklenen maç."""
    reg = team_weeks[team_weeks["WEEK"] < min(fmt["playoff_weeks"])]
    team_avg = reg.groupby("TEAM")["GAMES_EXPECTED"].mean()
    league_avg = float(team_avg.mean())
    if basis == "per_game":
        return pd.Series(league_avg * 0.85, index=proj.index)   # sabit: maç kaçırma herkese eşit
    team_g = proj["TEAM"].map(team_avg).fillna(league_avg)
    return team_g * (proj["PROJ_GP"] / 82.0)


def _team_games(proj: pd.DataFrame, team_weeks: pd.DataFrame, fmt: dict) -> pd.Series:
    """Oyuncunun takımının normal sezonda haftalık maçı (sakatlık / dinlenme düşülmeden)."""
    reg = team_weeks[team_weeks["WEEK"] < min(fmt["playoff_weeks"])]
    team_avg = reg.groupby("TEAM")["GAMES_EXPECTED"].mean()
    return proj["TEAM"].map(team_avg).fillna(float(team_avg.mean()))


def _tiers(values: pd.Series, n_pool: int, window: int = 12) -> pd.Series:
    """Sıralı değerlerde, YEREL tipik adımın 2 katından büyük boşlukta yeni kademe.

    Tek bir küresel eşik işe yaramadı: havuzun medyan adımı zirvede her
    oyuncuya ayrı kademe açtı (boşluklar orada büyük), havuz yayılımının bir
    oranı ise ilk 60'ı iki kademeye sıkıştırdı. Her oyuncunun boşluğu kendi
    çevresindeki (±window) ortalama boşlukla kıyaslanıyor."""
    v = values.sort_values(ascending=False)
    gaps = (-v.diff()).fillna(0).to_numpy()
    local = pd.Series(gaps).rolling(2 * window + 1, center=True, min_periods=3).mean().to_numpy()
    tier, out = 1, {}
    for i, idx in enumerate(v.index):
        if i > 0 and gaps[i] > 2 * local[i]:
            tier += 1
        out[idx] = tier
    return pd.Series(out).reindex(values.index)


# ── Kategori formatları ─────────────────────────────────────────────────────

def category_values(proj: pd.DataFrame, fmt: dict, g_week: pd.Series,
                    punt: tuple[str, ...] = (), g_full: pd.Series | None = None,
                    repl_credit: float | None = None) -> pd.DataFrame:
    """`g_full`: oyuncunun takımının haftalık maçı (sakatlıksız); g_week ≤ g_full oynayacağı maç. İkisi arasındaki fark
    yedekle dolar: üretim = oyuncu·g_week + kredi·yedek·(g_full − g_week)."""
    credit = REPL_CREDIT if repl_credit is None else repl_credit
    cats = [c for c in fmt["categories"]]
    n = roster_size(fmt)
    kappa = 2 * n / (2 * n - 1)
    size = min(pool_size(fmt), len(proj))
    sqrt_g = np.sqrt(g_week)

    # İlk havuz: maç başı Yahoo puanı × maç (makul bir genel güç göstergesi).
    rough = (proj["PTS"] + 1.2 * proj["REB"] + 1.5 * proj["AST"] + 3 * proj["STL"]
             + 3 * proj["BLK"] - proj["TOV"]) * proj["PROJ_GP"]
    pool = rough.nlargest(size).index
    waiver = rough.nlargest(size + fmt["teams"] * REPL_DEPTH).index.difference(pool) if credit > 0 and g_full is not None else None

    out = pd.DataFrame(index=proj.index)
    for _ in range(POOL_ROUNDS):
        z_total = pd.Series(0.0, index=proj.index)
        for c in cats:
            direction = CATEGORIES[c]["direction"]
            mean_col, sd_col = CAT_COLUMNS[c]
            if c in PCT_PARTS:
                made, att = PCT_PARTS[c]
                p_bar = proj.loc[pool, made].sum() / proj.loc[pool, att].sum()
                per_game = proj[made] - p_bar * proj[att]
            else:
                per_game = proj[mean_col]
            mu = per_game * g_week
            if waiver is not None:
                mu = mu + credit * float(per_game.loc[waiver].mean()) * (g_full - g_week)
            tau = proj[sd_col] * sqrt_g
            mu_bar = mu.loc[pool].mean()
            sigma = mu.loc[pool].std(ddof=0)
            tau_rms = math.sqrt(float((tau.loc[pool] ** 2).mean()))
            g_denom = math.sqrt(sigma ** 2 + kappa * tau_rms ** 2)
            out[f"Z_{c}"] = direction * (mu - mu_bar) / sigma
            out[f"G_{c}"] = direction * (mu - mu_bar) / g_denom
            # Mutlak üretim, G ve Z biriminde (yön uygulanmadan): draft
            # simülasyonu oyuncunun gerçekleşen sezonunu örneklerken
            # G' = G + yön·(çarpan − 1)·GA ile kaydırıyor (src/fantasy/draft.py).
            out[f"GA_{c}"] = mu / g_denom
            out[f"ZA_{c}"] = mu / sigma
            if c not in punt:
                z_total += out[f"Z_{c}"]
        pool = z_total.nlargest(size).index

    active = [c for c in cats if c not in punt]
    out["VALUE_Z"] = out[[f"Z_{c}" for c in active]].sum(axis=1)
    out["VALUE_G"] = out[[f"G_{c}" for c in active]].sum(axis=1)
    out["VALUE"] = out["VALUE_G"] if fmt["matchup"] == "h2h" else out["VALUE_Z"]
    return out


# ── Points ──────────────────────────────────────────────────────────────────

def points_values(proj: pd.DataFrame, fmt: dict, basis: str) -> pd.DataFrame:
    w = fmt["weights"]
    fp = sum(proj[k] * v for k, v in w.items() if k in proj.columns)
    out = pd.DataFrame(index=proj.index)
    out["FP_GAME"] = fp
    out["FP_TOTAL"] = fp * (proj["PROJ_GP"] if basis == "total" else 82 * 0.85)
    size = min(pool_size(fmt), len(proj))
    ranked = out["FP_TOTAL"].sort_values(ascending=False)
    # Kaçırılan maçın yerine yedek gelir (REPL_CREDIT): değer hesabında toplam = oyuncu·maç + kredi·yedek·(82 − maç).
    eff = out["FP_TOTAL"]
    if REPL_CREDIT > 0 and basis == "total" and len(ranked) > size:
        waiver = ranked.iloc[size:size + fmt["teams"] * REPL_DEPTH].index
        eff = out["FP_TOTAL"] + REPL_CREDIT * float(fp.loc[waiver].mean()) * (82.0 - proj["PROJ_GP"]).clip(lower=0)
        ranked = eff.sort_values(ascending=False)
    repl = float(ranked.iloc[size:size + fmt["teams"]].mean()) if len(ranked) > size else float(ranked.iloc[-1])
    out["VALUE"] = eff - repl
    out["REPLACEMENT"] = repl
    return out


# ── High Score ──────────────────────────────────────────────────────────────

def expected_max_table(quantiles: list[float], kmax: int = 7) -> np.ndarray:
    """k = 0..kmax için E[k bağımsız maçın en iyisi] / ortalama (k=0 → 0)."""
    q = np.interp(_U, np.linspace(0, 1, len(quantiles)), quantiles)
    table = np.zeros(kmax + 1)
    for k in range(1, kmax + 1):
        table[k] = _trapz(q * k * _U ** (k - 1), _U)
    return table


def high_score_values(proj: pd.DataFrame, fmt: dict, team_weeks: pd.DataFrame) -> pd.DataFrame:
    w = fmt["weights"]
    fp = sum(proj[k] * v for k, v in w.items() if k in proj.columns)
    last_week = max(fmt["playoff_weeks"])
    tw = team_weeks[team_weeks["WEEK"] <= last_week]
    games = {t: sub.set_index("WEEK")["GAMES_EXPECTED"].round().astype(int)
             for t, sub in tw.groupby("TEAM")}
    playoff = set(fmt["playoff_weeks"])

    rows = []
    for idx, r in proj.iterrows():
        table = expected_max_table(r["Q_HIGH_SCORE"]) * fp.loc[idx]
        p = float(np.clip(r["PROJ_GP"] / 82.0, 0, 1))
        weekly = {}
        for wk, n in games.get(r["TEAM"], pd.Series(dtype=int)).items():
            n = int(min(n, len(table) - 1))
            ks = np.arange(n + 1)
            probs = np.array([math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in ks])
            weekly[wk] = float((probs * table[ks]).sum())
        vals = list(weekly.values()) or [0.0]
        po = [v for wk, v in weekly.items() if wk in playoff] or [0.0]
        four = sum(1 for n in games.get(r["TEAM"], pd.Series(dtype=int)).values if n >= 4)
        rows.append({"idx": idx, "HS_WEEK_AVG": float(np.mean(vals)), "HS_PLAYOFF_AVG": float(np.mean(po)),
                     "CEILING_INDEX": float(expected_max_table(r["Q_HIGH_SCORE"])[4]), "FOUR_GAME_WEEKS": four})
    out = pd.DataFrame(rows).set_index("idx").reindex(proj.index)
    out["FP_GAME"] = fp
    size = min(fmt["teams"] * len(fmt["roster"]["starters"]), len(proj))   # yalnız starter'lar sayılır
    ranked = out["HS_WEEK_AVG"].sort_values(ascending=False)
    repl = float(ranked.iloc[size:size + fmt["teams"]].mean()) if len(ranked) > size else 0.0
    out["VALUE"] = out["HS_WEEK_AVG"] - repl
    out["REPLACEMENT"] = repl
    return out


# ── Giriş noktası ───────────────────────────────────────────────────────────

def value_players(proj: pd.DataFrame, fmt: dict, team_weeks: pd.DataFrame,
                  punt: tuple[str, ...] = (), basis: str = "total") -> pd.DataFrame:
    """Projeksiyon tablosu + format → değer, sıra ve kademe eklenmiş tablo."""
    if basis not in ("total", "per_game"):
        raise ValueError("basis must be 'total' or 'per_game'")
    proj = proj.reset_index(drop=True)
    if fmt["kind"] == "categories":
        bad = [c for c in punt if c not in fmt["categories"]]
        if bad:
            raise ValueError(f"cannot punt categories outside the format: {bad}")
        if len(punt) >= len(fmt["categories"]):
            raise ValueError("cannot punt every category")
        g_week = games_per_week(proj, team_weeks, fmt, basis)
        vals = category_values(proj, fmt, g_week, punt, g_full=_team_games(proj, team_weeks, fmt) if basis == "total" else None)
    elif fmt["kind"] == "points":
        vals = points_values(proj, fmt, basis)
    else:
        vals = high_score_values(proj, fmt, team_weeks)

    out = proj.join(vals)
    out["RANK"] = out["VALUE"].rank(ascending=False, method="first").astype(int)
    out["TIER"] = _tiers(out["VALUE"], pool_size(fmt))
    out = out.join(market_adp(proj, fmt, team_weeks))
    out["ADP_DIFF"] = out["ADP"] - out["RANK"]   # + → piyasa daha geç alıyor (değer)
    return out.sort_values("RANK").reset_index(drop=True)


# ── Kendi ADP modelimiz ─────────────────────────────────────────────────────

LAST_COLS = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG3M", "FGM", "FGA", "FTM", "FTA"]


# "Piyasa" varsayımları — Yahoo API gelene kadar (Faz 5) Yahoo'nun sezon öncesi "Top 200 Default
# Rankings" listesine (config/reference/yahoo_default_top200_2026-27.txt) UYDURULDU:
#   ANCHOR   : kalabalık ne kadar geçen sezonun maç başı ortalamasına çıpalı (1.0 = yalnız o),
#              kalanı bizim projeksiyonumuz (yaş, takım değişikliği, ortalamaya dönüş).
#   GP_BLEND : beklenen maç sayısı = (1−b)·82 + b·geçen sezon oynanan maç (b=0 → herkes 82 oynar).
# Uydurma sonucu: Spearman 0.705 (kaba tahmin 0.60/0.50 → 0.677, eski saf model → 0.656). Yüzey
# düz — hiçbir ayar 0.70'i geçmiyor; kalan fark bu iki sayıyla kapanmaz (sakatlıktan dönen
# yıldızlar ve çaylaklar; bkz. docs/FANTASY_MODEL_IMPROVEMENTS.md). Tek sezon, tek liste.
MARKET_ANCHOR = 0.4
MARKET_GP_BLEND = 0.25


def market_adp(proj: pd.DataFrame, fmt: dict, team_weeks: pd.DataFrame,
               anchor: float | None = None, gp_blend: float | None = None) -> pd.DataFrame:
    """"Piyasa" draft sırası — bizim sıralamamız DEĞİL (docs/FANTASY_PLAN.md).

    Kalabalık oyuncuyu ağırlıkla geçen sezonun MAÇ BAŞI üretimine göre, o formatın
    kendi ölçüsüyle draft eder (geçen sezon ≥20 maçı olanlar için; olmayanlarda
    bizim projeksiyonumuz). MARKET_ANCHOR kadar geçen sezona, kalanı projeksiyona
    dayanır; oynanacak maç sayısı geçen sezonun oynanan maçına kısmen çekilir.
    Haftalık oynaklığı görmez. ADP_SD = 0.12·ADP + 2 — sezgisel."""
    anchor = MARKET_ANCHOR if anchor is None else anchor
    gp_blend = MARKET_GP_BLEND if gp_blend is None else gp_blend
    m = proj.copy()
    has_last = m["LAST_GP"].fillna(0) >= 20 if "LAST_GP" in m.columns else pd.Series(False, index=m.index)
    for c in LAST_COLS:
        if f"LAST_{c}" in m.columns:
            m[c] = (anchor * m[f"LAST_{c}"] + (1 - anchor) * m[c]).where(has_last, m[c])
    last_gp = m["LAST_GP"].fillna(82.0).clip(upper=82.0) if "LAST_GP" in m.columns else 82.0
    games = ((1 - gp_blend) * 82.0 + gp_blend * last_gp).where(has_last, m["PROJ_GP"])
    m["PROJ_GP"] = games
    if fmt["kind"] == "categories":
        score = category_values(m, fmt, games_per_week(m, team_weeks, fmt, "total"))["VALUE_Z"]
    else:
        score = sum(m[k] * v for k, v in fmt["weights"].items() if k in m.columns) * games / 82.0
    adp = score.rank(ascending=False, method="first")
    source = pd.Series("model", index=proj.index)
    real = _real_adp(proj)
    if real is not None:
        # Güvenilir gerçek Yahoo ADP'si olanlar aynen; kalanlar (az draft edilmiş / listede yok)
        # onların ARKASINA, model sırasıyla dizilir.
        have = real.notna()
        rest = adp[~have].rank(method="first")
        adp = real.where(have, float(real.max()) + rest)
        source[have] = "yahoo"
    return pd.DataFrame({"ADP": adp, "ADP_SD": (0.12 * adp + 2).round(1), "ADP_SOURCE": source}, index=proj.index)


def _real_adp(proj: pd.DataFrame) -> pd.Series | None:
    """Projeksiyon satırlarına hizalı gerçek Yahoo ADP'si (config/reference/); yoksa None.
    Yalnızca proj["SEASON"] ile eşleşen bir dosya varsa (canlı sezon); tarihsel backtest tahtaları
    SEASON taşımaz, modele düşer."""
    if "SEASON" not in proj.columns or "PLAYER_NAME" not in proj.columns or proj.empty:
        return None
    from src.fantasy import reference as ref
    d = ref.load_adp(str(proj["SEASON"].iloc[0]))
    if d is None:
        return None
    d = d[d["reliable"]].drop_duplicates("key").set_index("key")["adp"]
    return proj["PLAYER_NAME"].map(ref.norm_name).map(d).astype(float)
