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
  3. pos_flex_bonus : çift pozisyon etiketi taşımak (BBR "SG-SF" gibi)

Son skor [0..1]'e min-max normalize edilir, 5 katmana bölünür:
  Specialist   [0.00 – 0.20)
  Role Player  [0.20 – 0.40)
  Contributor  [0.40 – 0.60)
  Versatile    [0.60 – 0.80)
  Elite        [0.80 – 1.00]

2026-07: girdi kaynağı DEĞİŞTİ. Önceden "Aşama 3" boolean pipeline'ının
(eski label_league.py çıktısı, data/2025-26__labeled.parquet) boolean
sütunlarına dayanıyordu — bu dosya aylarca güncellenmemişti, hâlâ o gün
kaldırılan modifier'ları (Jumbo/Two-Way/Defensive/vb.) True olarak
taşıyordu ve canlı skorlama sisteminden (score_compat.py) tamamen kopuktu.
Artık DOĞRUDAN CANLI player_scores.parquet'in score_X (percentile) +
primary_arch/percentile_threshold'undan türetilen "aktif mi" booleanlarını
kullanıyor — tek gerçek kaynak (score_compat.py) ile senkron kalıyor.
"""

import sys, json
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "config"))
from signatures import COMPONENT_SIGNATURES, CORE_NOUNS as ALL_CORE_NOUNS, MODIFIER_TAGS

# Bileşen grupları (rol çeşitliliği bonusu için) — güncel canlı noun/modifier
# setinden türetilir, elle sabitlenmiş bayat bir liste değil.
CORE_NOUNS = set(ALL_CORE_NOUNS)
MODIFIERS  = set(MODIFIER_TAGS)

TIER_LABELS = {
    (0.00, 0.20): "Specialist",
    (0.20, 0.40): "Role Player",
    (0.40, 0.60): "Contributor",
    (0.60, 0.80): "Versatile",
    (0.80, 1.01): "Elite",
}


def _active_components(df: pd.DataFrame) -> pd.DataFrame:
    """score_X >= kendi percentile_threshold'u -> "bu bileşen aktif mi" boolean
    matrisi. active_modifiers/Bileşenler'in canlı API'de (api/main.py) zaten
    kullandığı mantıkla birebir aynı — tek kaynak, iki kez tanımlanmıyor."""
    out = pd.DataFrame(index=df.index)
    for comp, sig in COMPONENT_SIGNATURES.items():
        col = f"score_{comp}"
        if col not in df.columns:
            continue
        thr = sig.get("percentile_threshold", 0.75)
        out[comp] = df[col].fillna(0) >= thr
    return out


def _prevalence(df: pd.DataFrame, cols: list) -> dict:
    """Her bileşenin lig içi yaygınlığı (0..1)."""
    n = len(df)
    return {c: (df[c].sum() / n if c in df.columns else 0.0) for c in cols}


def compute_versatility(df: pd.DataFrame) -> pd.DataFrame:
    """
    Canlı player_scores.parquet'e (score_compat.py çıktısı) versatility_score +
    versatility_tier + is_versatile ekler.

    Parametreler
    ------------
    df : score_X (percentile) sütunları + bref_pos_raw (opsiyonel, pozisyon
         esnekliği için) içermeli.

    Döner
    -----
    df ile aynı satırlar + ek sütunlar:
        rarity_score, diversity_bonus, pos_flex_bonus,
        versatility_raw, versatility_score [0..1], versatility_tier (string),
        is_versatile (bool — havuzun üst ~%15'i)
    """
    active = _active_components(df)
    comp_cols = list(active.columns)

    prev = _prevalence(active, comp_cols)

    # 1. Rarity score: her taşınan bileşen için (1 - prevalence) ekle
    rarity = pd.Series(0.0, index=df.index)
    for c in comp_cols:
        rarity += active[c] * (1.0 - prev[c])

    # 2. Diversity bonus: hem core-noun hem modifier taşıyorsa +0.5;
    # birden fazla farklı core-noun taşımak için ekstra +0.3
    has_core = active[[c for c in comp_cols if c in CORE_NOUNS]].any(axis=1)
    has_mod  = active[[c for c in comp_cols if c in MODIFIERS]].any(axis=1)
    n_core   = active[[c for c in comp_cols if c in CORE_NOUNS]].sum(axis=1)
    diversity = (has_core & has_mod).astype(float) * 0.5 + (n_core >= 2).astype(float) * 0.3

    # 3. Position flexibility bonus: BBR çift-pozisyon etiketi ("SG-SF" gibi) = +0.2
    if "bref_pos_raw" in df.columns:
        pos_flex = df["bref_pos_raw"].astype(str).str.contains("-", na=False).astype(float) * 0.2
    else:
        pos_flex = pd.Series(0.0, index=df.index)

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
    out["rarity_score"]      = rarity.round(4)
    out["diversity_bonus"]   = diversity.round(4)
    out["pos_flex_bonus"]    = pos_flex.round(4)
    out["versatility_raw"]   = raw.round(4)
    out["versatility_score"] = score.round(4)
    out["versatility_tier"]  = score.map(_tier)
    # is_versatile: havuz-göreli üst ~%15 (game/awards.js isVersatile()'ın
    # beklediği bayrak — bkz. dosyanın kullanıldığı call site).
    cutoff = score.quantile(0.85)
    out["is_versatile"] = score >= cutoff
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
                "primary_arch":      r.get("primary_arch", ""),
            })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    scores_path = ROOT / "data" / "2025-26__player_scores.parquet"
    bref_path   = ROOT / "data" / "2025-26__merged_bref.parquet"
    if not scores_path.exists():
        print("[HATA] data/2025-26__player_scores.parquet yok.")
        sys.exit(1)

    df = pd.read_parquet(scores_path)
    if bref_path.exists():
        bref = pd.read_parquet(bref_path)
        if "PLAYER_ID" in bref.columns and "bref_pos_raw" in bref.columns:
            df = df.merge(bref[["PLAYER_ID", "bref_pos_raw"]], on="PLAYER_ID", how="left")

    df = compute_versatility(df)

    out = ROOT / "data" / "2025-26__versatility.parquet"
    df.to_parquet(out)
    print(f"Kaydedildi: {out.name}  ({len(df)} oyuncu)\n")

    print("=== TIER DAĞILIMI ===")
    print(versatility_summary(df).to_string(index=False))

    print("\n=== HER TİER'DAN TOP 5 ===")
    print(top_per_tier(df).to_string(index=False))
