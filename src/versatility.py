"""
Aşama 6: Versatile / non-versatile faktörü.

Fikir:
  Ham N_SKILL (bileşen sayısı) yetersiz çünkü her bileşen eşit nadir değil
  (Two-Way %38, Rim Runner %7.5).  Nadir bileşenler daha fazla katkıda bulunmalı.

Versatility skoru üç katmandan oluşur:
  1. rarity_score   : taşınan her bileşenin 1-prevalence ağırlıklı toplamı
                      (nadir bileşen = yüksek katkı)
  2. diversity_bonus: hem core-noun (Engine/Anchor/…) hem modifier (Two-Way/Scoring/…)
                      taşımak; tek boyutluluktan kaçınır
  3. pos_flex_bonus : birden fazla pozisyon etiketini taşımak
                      (Guard-Wing gibi çift pozisyonlu oyuncular)

Son skor [0..1]'e min-max normalize edilir, 5 katmana bölünür:
  Specialist   [0.00 – 0.20)
  Role Player  [0.20 – 0.40)
  Contributor  [0.40 – 0.60)
  Versatile    [0.60 – 0.80)
  Elite        [0.80 – 1.00]
"""

import sys, json
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "config"))
from signatures import COMPONENT_SIGNATURES, POSITION_COMPONENTS

# Bileşen grupları (rol çeşitliliği bonusu için)
CORE_NOUNS = {"Engine", "Anchor", "Rim Runner", "Spacer", "Connector", "Creator"}
MODIFIERS   = {"Two-Way", "Downhill", "Scoring", "Stretch", "Shotmaker",
               "Three-Level", "3-and-D", "Versatile"}

ALL_COMP = list(COMPONENT_SIGNATURES.keys())
POS_COMP = sorted(POSITION_COMPONENTS)

TIER_LABELS = {
    (0.00, 0.20): "Specialist",
    (0.20, 0.40): "Role Player",
    (0.40, 0.60): "Contributor",
    (0.60, 0.80): "Versatile",
    (0.80, 1.01): "Elite",
}


def _prevalence(df: pd.DataFrame, cols: list) -> dict:
    """Her bileşenin lig içi yaygınlığı (0..1)."""
    n = len(df)
    return {c: (df[c].sum() / n if c in df.columns else 0.0) for c in cols}


def compute_versatility(df: pd.DataFrame) -> pd.DataFrame:
    """
    Labeled DataFrame'e (Aşama 3 çıktısı) versatility_score + versatility_tier ekler.

    Parametreler
    ------------
    df : Aşama 3 çıktısı — boolean bileşen sütunları içermeli.

    Döner
    -----
    df ile aynı satırlar + ek sütunlar:
        rarity_score, diversity_bonus, pos_flex_bonus,
        versatility_raw, versatility_score [0..1], versatility_tier (string)
    """
    comp_cols = [c for c in ALL_COMP if c in df.columns]
    pos_cols  = [c for c in POS_COMP  if c in df.columns]

    prev = _prevalence(df, comp_cols)

    # 1. Rarity score: her taşınan bileşen için (1 - prevalence) ekle
    rarity = pd.Series(0.0, index=df.index)
    for c in comp_cols:
        mask = df[c].astype(bool)
        rarity += mask * (1.0 - prev[c])

    # 2. Diversity bonus: hem core-noun hem modifier taşıyorsa +0.5
    has_core = df[[c for c in comp_cols if c in CORE_NOUNS]].any(axis=1)
    has_mod  = df[[c for c in comp_cols if c in MODIFIERS]].any(axis=1)
    # Birden fazla farklı core-noun taşımak için ekstra bonus
    n_core = df[[c for c in comp_cols if c in CORE_NOUNS]].sum(axis=1)
    diversity = (has_core & has_mod).astype(float) * 0.5 + (n_core >= 2).astype(float) * 0.3

    # 3. Position flexibility bonus: birden fazla pozisyon = +0.2
    n_pos = df[pos_cols].sum(axis=1) if pos_cols else pd.Series(0, index=df.index)
    pos_flex = (n_pos >= 2).astype(float) * 0.2

    raw = rarity + diversity + pos_flex

    # Min-max normalize (lig içi)
    lo, hi = raw.min(), raw.max()
    score = (raw - lo) / (hi - lo) if hi > lo else pd.Series(0.5, index=df.index)

    def _tier(v: float) -> str:
        for (lo_, hi_), label in TIER_LABELS.items():
            if lo_ <= v < hi_:
                return label
        return "Elite"

    out = df.copy()
    out["rarity_score"]     = rarity.round(4)
    out["diversity_bonus"]  = diversity.round(4)
    out["pos_flex_bonus"]   = pos_flex.round(4)
    out["versatility_raw"]  = raw.round(4)
    out["versatility_score"]= score.round(4)
    out["versatility_tier"] = score.map(_tier)
    return out


def versatility_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Tier dağılımını özetler."""
    tier_order = ["Specialist", "Role Player", "Contributor", "Versatile", "Elite"]
    rows = []
    for tier in tier_order:
        sub = df[df["versatility_tier"] == tier]
        rows.append({
            "tier":       tier,
            "n_players":  len(sub),
            "pct":        round(100 * len(sub) / len(df), 1),
            "avg_score":  round(sub["versatility_score"].mean(), 3) if len(sub) else 0,
            "avg_n_comp": round((sub[[c for c in ALL_COMP if c in sub.columns]]
                                 .sum(axis=1).mean()), 1) if len(sub) else 0,
        })
    return pd.DataFrame(rows)


def top_per_tier(df: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    """Her tier'dan en yüksek skorlu n oyuncuyu listeler."""
    tier_order = ["Elite", "Versatile", "Contributor", "Role Player", "Specialist"]
    rows = []
    for tier in tier_order:
        sub = df[df["versatility_tier"] == tier].nlargest(n, "versatility_score")
        for _, r in sub.iterrows():
            rows.append({
                "tier":              tier,
                "player":            r["PLAYER_NAME"],
                "team":              r.get("TEAM_ABBREVIATION", ""),
                "versatility_score": r["versatility_score"],
                "TAG":               r.get("TAG", ""),
            })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    labeled_path = ROOT / "data" / "2025-26__labeled.parquet"
    if not labeled_path.exists():
        print("[HATA] data/2025-26__labeled.parquet yok.")
        sys.exit(1)

    df = pd.read_parquet(labeled_path)
    df = compute_versatility(df)

    # Kaydet
    out = ROOT / "data" / "2025-26__versatility.parquet"
    df.to_parquet(out)
    print(f"Kaydedildi: {out.name}  ({len(df)} oyuncu)\n")

    # Özet
    print("=== TIER DAĞILIMI ===")
    print(versatility_summary(df).to_string(index=False))

    print("\n=== HER TİER'DAN TOP 5 ===")
    print(top_per_tier(df).to_string(index=False))

    # Labeled parquet'a versatility sütunlarını geri yaz
    df.to_parquet(labeled_path)
    print(f"\n2025-26__labeled.parquet güncellendi (versatility sütunları eklendi)")
