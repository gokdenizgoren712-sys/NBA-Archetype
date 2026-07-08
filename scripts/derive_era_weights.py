"""
P4: ERA_PILLAR_WEIGHTS'i gerçek dönem istatistiğinden türet + el-yazımıyla kıyasla.

3PAr (3PA/FGA) dönem farklarının tanımlayıcı istatistiği. Bunu 'modernlik' eksenine
çevirip pillar weights'i türetir: spacing ↑, rim_protection ↓, perimeter_d ↑,
finishing ↓ (iç oyun eski dönemlerde değerli), creation ~sabit.
  python scripts/derive_era_weights.py
"""
import sys
import glob
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ERAS = {"magic_bird": (1979, 1991), "jordan": (1991, 1999), "dead_ball": (1999, 2008),
        "proto": (2008, 2014), "small_ball": (2014, 2020), "parity": (2020, 2030)}
ORDER = ["magic_bird", "jordan", "dead_ball", "proto", "small_ball", "parity"]


def era_of(season):
    y = int(season.split("-")[0])
    for e, (a, b) in ERAS.items():
        if a <= y < b:
            return e
    return "parity"


def season_3par(season):
    """Bir sezonun lig 3PAr'ı. bref_pergame (tüm sezonlar) → hist_merged fallback."""
    for cand in [ROOT / "data" / f"{season}__bref_pergame.parquet",
                 ROOT / "data" / f"{season}__hist_merged.parquet",
                 ROOT / "data" / f"{season}__merged.parquet"]:
        if not cand.exists():
            continue
        m = pd.read_parquet(cand)
        cols = {c.upper(): c for c in m.columns}
        fg3a = cols.get("FG3A") or cols.get("3PA")
        fga = cols.get("FGA")
        gp = cols.get("GP") or cols.get("G")
        if not fg3a or not fga:
            continue
        w = m[gp].fillna(0) if gp else pd.Series(1, index=m.index)
        tot3 = (m[fg3a].fillna(0) * w).sum()
        totf = (m[fga].fillna(0) * w).sum()
        if totf > 0:
            return tot3 / totf
    return np.nan


# Tüm sezonların 3PAr'ı
seasons = sorted({Path(p).name.split("__")[0] for p in glob.glob(str(ROOT / "data" / "*__bref_pergame.parquet"))}
                 | {Path(p).name.split("__")[0] for p in glob.glob(str(ROOT / "data" / "*__hist_merged.parquet"))}
                 | {"2025-26"})
rows = [(s, era_of(s), season_3par(s)) for s in seasons]
df = pd.DataFrame(rows, columns=["season", "era", "tpar"]).dropna(subset=["tpar"])
g = df.groupby("era")["tpar"].mean()
g = g.reindex([e for e in ORDER if e in g.index])

print("── Gerçek dönem 3PAr (3PA/FGA, GP-ağırlıklı) ──")
for e in g.index:
    print(f"  {e:11} 3PAr={g[e]:.3f}")

# Modernlik ekseni (0..1)
lo, hi = g.min(), g.max()
m = (g - lo) / (hi - lo)

# Veri-türevi weights (3PAr modernlik ekseninden lineer)
derived = pd.DataFrame({
    "creation":       1.10 + 0.0 * m,            # playmaking ~era-sabit
    "spacing":        0.55 + 0.95 * m,           # 3PAr ile doğru orantılı
    "rim_protection": 1.35 - 0.75 * m,           # 3PAr ile ters (iç oyun ↓)
    "perimeter_d":    0.95 + 0.30 * m,           # 3-sayı savunması ↑
    "finishing":      1.15 - 0.40 * m,           # iç bitiricilik eski dönemde ↑
}).round(2)

HAND = {
    "magic_bird": [1.10, 0.55, 1.20, 0.95, 1.20], "jordan": [1.25, 0.70, 1.05, 1.25, 0.90],
    "dead_ball": [0.90, 0.70, 1.45, 1.20, 0.90], "proto": [1.10, 0.95, 1.00, 1.00, 0.95],
    "small_ball": [1.10, 1.45, 0.60, 1.15, 0.70], "parity": [1.05, 1.20, 0.80, 1.15, 0.80],
}
P = ["creation", "spacing", "rim_protection", "perimeter_d", "finishing"]
print("\n── El-yazımı (H) vs Veri-türevi (D) ──")
print(f"{'era':11} " + "  ".join(f"{p[:5]:>11}" for p in P))
for e in g.index:
    h = HAND[e]; d = [derived.loc[e, p] for p in P]
    print(f"{e:11} " + "  ".join(f"H{h[i]:.2f}/D{d[i]:.2f}" for i in range(5)))

# Korelasyon: el-yazımı spacing/rim, 3PAr'la ne kadar örtüşüyor?
hand_sp = [HAND[e][1] for e in g.index]; hand_rim = [HAND[e][2] for e in g.index]
print(f"\n  corr(el-spacing, 3PAr) = {np.corrcoef(hand_sp, g.values)[0,1]:.3f}")
print(f"  corr(el-rim,     3PAr) = {np.corrcoef(hand_rim, g.values)[0,1]:.3f}")
print("\n  (yüksek |corr| → el-yazımı zaten 3PAr'ı yansıtıyor = doğrulanmış)")

# JS blok
print("\n── Türetilmiş ERA_PILLAR_WEIGHTS (JS) ──")
for e in g.index:
    d = derived.loc[e]
    print(f"  {e+':':12} {{ creation: {d.creation}, spacing: {d.spacing}, rim_protection: {d.rim_protection}, perimeter_d: {d.perimeter_d}, finishing: {d.finishing} }},")
