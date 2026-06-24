"""
OBPM / DBPM / BPM proxy hesaplama.

nba_api Basketball-Reference'ın BPM'ini doğrudan vermez.
Bu modül mevcut nba_api kolonlarından yaklaşık OBPM/DBPM üretir.
Gerçek B-Ref BPM yerine kullanım için yeterli kalitede bir proxy sağlar.

Referans: B-Ref BPM = box-score katkılar + team context + role factors.
"""
import pandas as pd
import numpy as np


def _zscore(series: pd.Series) -> pd.Series:
    """Serinin z-skorunu döner; std=0 durumunda sıfır döner."""
    std = series.std(ddof=0)
    if std < 1e-9:
        return pd.Series(0.0, index=series.index)
    return (series - series.mean()) / std


def compute_bpm(df: pd.DataFrame) -> pd.DataFrame:
    """
    Mevcut nba_api kolonlarından OBPM, DBPM, BPM proxy üretir.

    Gerekli kolonlar (hepsi 2025-26__merged.parquet'ta mevcut):
      Offensive: TS_PCT, USG_PCT, AST_PCT, TM_TOV_PCT (veya TOV)
      Defensive: DEF_RATING, STL, BLK, MIN

    Çıktı: df'e OBPM, DBPM, BPM sütunları eklenerek döner.
    Ölçek: gerçekçi BPM aralığına normalize edilir (ortalama ~0, elite ~+8).
    """
    df = df.copy()
    n = len(df)

    if n < 5:
        df["OBPM"] = np.nan
        df["DBPM"] = np.nan
        df["BPM"]  = np.nan
        return df

    def safe_col(col: str, default: float = 0.0) -> pd.Series:
        if col in df.columns:
            return df[col].fillna(df[col].median() if df[col].notna().sum() > 0 else default)
        return pd.Series(default, index=df.index, dtype=float)

    # Offensive proxy
    ts_z   = _zscore(safe_col("TS_PCT"))
    usg_z  = _zscore(safe_col("USG_PCT"))
    ast_z  = _zscore(safe_col("AST_PCT"))

    # TOV: düşük = iyi. TM_TOV_PCT öncelikli, yoksa TOV/MIN türetimi.
    if "TM_TOV_PCT" in df.columns:
        tov_z = -_zscore(safe_col("TM_TOV_PCT"))
    elif "TOV" in df.columns and "MIN" in df.columns:
        min_s = safe_col("MIN", 1.0).clip(lower=0.1)
        tov_per36 = safe_col("TOV") / min_s * 36
        tov_z = -_zscore(tov_per36)
    else:
        tov_z = pd.Series(0.0, index=df.index)

    obpm_raw = 0.35 * ts_z + 0.25 * usg_z + 0.25 * ast_z + 0.15 * tov_z

    # Defensive proxy
    drtg_z = -_zscore(safe_col("DEF_RATING"))   # düşük DEF_RATING → iyi savunma

    min_s = safe_col("MIN", 1.0).clip(lower=0.1)
    stl_per36 = safe_col("STL") / min_s * 36
    blk_per36 = safe_col("BLK") / min_s * 36
    stl_z = _zscore(stl_per36)
    blk_z = _zscore(blk_per36)

    dbpm_raw = 0.50 * drtg_z + 0.30 * stl_z + 0.20 * blk_z

    # Gerçekçi ölçeğe normalize (B-Ref lig ortalaması ≈ 0; elite ≈ +6..+10)
    df["OBPM"] = (obpm_raw * 3.5).round(2)
    df["DBPM"] = (dbpm_raw * 2.5).round(2)
    df["BPM"]  = (df["OBPM"] + df["DBPM"]).round(2)

    return df


def inject_bpm_to_merged(merged_path) -> pd.DataFrame:
    """
    Merged parquet'ı okur, BPM proxy ekler, geri yazar ve df döner.
    label_league.py veya export_excel.py tarafından çağrılabilir.
    """
    from pathlib import Path
    p = Path(merged_path)
    df = pd.read_parquet(p)

    needs_bpm = (
        "OBPM" not in df.columns
        or df["OBPM"].isna().all()
    )
    if not needs_bpm:
        return df

    print("BPM proxy hesaplanıyor (compute_bpm)...")
    df = compute_bpm(df)
    df.to_parquet(p)
    print(f"  OBPM/DBPM/BPM kolonları eklendi → {p.name}")
    return df
