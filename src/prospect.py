"""
Prospect / scouting kağıdı hesabı (P3).

Skorlanmış bir lig tablosuna (score_*, overall_pct, AGE, SOS_FACTOR) prospect
alanları ekler. Kullanıcının istediği 4 boyut:
  - nba_fit  (floor)   : şu anki üretim seviyesi, SOS-ayarlı → "NBA'e uygunluk"
  - ceiling  (potential): yaş-projeksiyonlu tavan (genç = daha çok tavan)
  - grade + tier        : floor/ceiling harmanı → tek not + kademe
  - strengths/weaknesses: en yüksek/düşük arketipler

Yaş, üniversite prospektlerinde NBA başarısının #1 yordayıcısıdır (üretim sabitken
genç = daha iyi) — model bunu merkeze alır. Ağırlıklar/eğri VARSAYILAN; P5 backtest'te
gerçek NBA sonuçlarına karşı ayarlanacak.
"""
import numpy as np
import pandas as pd

CORE_NOUNS = ["Engine", "Ecosystem", "Hub", "Connector", "Creator", "Anchor",
              "Spacer", "Finisher", "Force", "Initiator", "Stopper", "Rim Runner"]

# ── Ayarlanabilir varsayılanlar (P5'te kalibre edilecek) ──────────────────────
W_FLOOR    = 0.40     # nota floor katkısı
W_CEILING  = 0.60     # nota ceiling katkısı (upside odaklı)
YOUNG_AGE  = 18.0     # tam projeksiyon yaşı (bu ve altı → maks upside)
OLD_AGE    = 23.0     # projeksiyon biter (bu ve üstü → ceiling≈floor)
MAX_PROJ   = 0.55     # 18 yaşında kalan headroom'un ne kadarı tavana eklenir
# Yaş cezası: OLD_THRESH üstü her yıl grade'i düşürür. Yaş, üretimden BAĞIMSIZ
# negatif prospect sinyalidir (24 yaşındaki üretken oyuncu ≠ elit prospekt).
OLD_THRESH = 21.0     # bu yaşın üstünde ceza başlar (draft-yaşı civarı)
OLD_SLOPE  = 0.08     # üstteki her yıl için grade çarpanı düşüşü
AGE_PEN_MIN = 0.55    # ceza tabanı


def _youth_factor(age):
    """Yaş → [0,1] gençlik faktörü. YOUNG_AGE'de 1, OLD_AGE'de 0, arası doğrusal."""
    if age is None or (isinstance(age, float) and np.isnan(age)):
        return 0.35   # yaş yoksa nötr-düşük varsayım
    return float(np.clip((OLD_AGE - age) / (OLD_AGE - YOUNG_AGE), 0.0, 1.0))


def _age_penalty(age):
    """Yaş → grade çarpanı. OLD_THRESH altı: 1.0 (ceza yok, upside ceiling'de).
    Üstü: her yıl OLD_SLOPE düşer (yaşlı üretken oyuncu prospekt olarak değersizleşir)."""
    if age is None or (isinstance(age, float) and np.isnan(age)):
        return 0.88   # yaş yoksa hafif belirsizlik cezası
    return float(np.clip(1 - OLD_SLOPE * max(0.0, age - OLD_THRESH), AGE_PEN_MIN, 1.0))


def add_prospect_fields(df: pd.DataFrame) -> pd.DataFrame:
    """df'e prospect kolonları ekler (in-place döner)."""
    out = df.copy()
    n = len(out)
    if n == 0:
        return out

    # overall_pct yoksa overall_score'dan üret (lig-içi persantil)
    if "overall_pct" not in out.columns and "overall_score" in out.columns:
        out["overall_pct"] = out["overall_score"].rank(pct=True, na_option="keep")

    overall = out["overall_pct"].fillna(out["overall_pct"].median()) if "overall_pct" in out else pd.Series(0.5, index=out.index)
    sos = out["SOS_FACTOR"].fillna(1.0) if "SOS_FACTOR" in out.columns else pd.Series(1.0, index=out.index)
    age = out["AGE"] if "AGE" in out.columns else pd.Series(np.nan, index=out.index)

    # ── FLOOR (nba_fit): şu anki üretim seviyesi × SOS iskontosu, 0-100 ──
    floor = (overall * sos * 100).clip(0, 100)

    # ── CEILING: yaş-projeksiyonlu. Genç oyuncu kalan headroom'un bir kısmını kazanır ──
    yf = age.apply(_youth_factor)
    ceiling = (floor + (100 - floor) * yf * MAX_PROJ).clip(0, 100)

    # ── GRADE: floor/ceiling harmanı × yaş cezası (yaşlıyı doğrudan düşürür) ──
    age_pen = age.apply(_age_penalty)
    grade = ((W_FLOOR * floor + W_CEILING * ceiling) * age_pen).clip(0, 100)

    def _tier(g):
        if g >= 88: return "Elite Prospect"
        if g >= 76: return "First-Round"
        if g >= 62: return "Rotation Upside"
        if g >= 45: return "Developmental"
        return "Longshot"

    # ── Güçlü / zayıf yanlar: score_* içinde en yüksek/düşük 3 arketip ──
    score_cols = [f"score_{c}" for c in CORE_NOUNS if f"score_{c}" in out.columns]

    def _rank_arch(row, top=True, k=3):
        vals = [(c.replace("score_", ""), float(row.get(c, 0) or 0)) for c in score_cols]
        vals.sort(key=lambda x: x[1], reverse=top)
        return [a for a, _ in vals[:k]]

    out["prospect_floor"]   = floor.round(1)
    out["prospect_ceiling"] = ceiling.round(1)
    out["prospect_grade"]   = grade.round(1)
    out["prospect_tier"]    = grade.apply(_tier)
    out["prospect_youth"]   = yf.round(3)
    out["strengths"]  = out.apply(lambda r: _rank_arch(r, top=True),  axis=1)
    out["weaknesses"] = out.apply(lambda r: _rank_arch(r, top=False), axis=1)
    return out
