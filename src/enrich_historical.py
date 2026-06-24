"""
Tarihsel oyuncular için overall_score, primary_arch ve versatility_score hesaplar.

Akış:
  Her sezon için {season}__hist_merged.parquet yüklenir,
  engine.predict_components(force_fallback=True) ile score_* vektörleri hesaplanır,
  overall_score = ağırlıklı core-noun ortalaması (tarihsel için BPM yok → comp_score),
  primary_arch = en yüksek skorda core noun (pozisyon maskesiyle),
  compute_versatility() ile versatility_score + tier yeniden hesaplanır.
  Sonuçlar historical__labeled.parquet'a yazılır.

Çalıştır:
  python src/enrich_historical.py
"""

import sys, re
from pathlib import Path

import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from engine import predict_components, select_signatures
from signatures import CORE_NOUNS, NOUN_WEIGHTS, NOUN_POSITION_MASK, POSITION_COMPONENTS, FALLBACK_SIGNATURES
from versatility import compute_versatility

ECO_FALLBACK_MIN = 0.60  # Ecosystem için minimum skor (score_compat ile aynı)

# Tarihsel labeling'deki boolean core noun öncelik sırası
HIST_BOOL_NOUNS = ["Ecosystem", "Engine", "Anchor", "Creator", "Connector",
                   "Hub", "Force", "Initiator", "Spacer", "Finisher", "Rim Runner", "Stopper"]


def _primary_arch_from_tag(tag: str) -> str:
    """TAG sütunundan (ör. 'Engine | Two-Way | Downhill') ilk core noun'u çeker."""
    if not tag or not isinstance(tag, str):
        return ""
    parts = [p.strip() for p in tag.split("|")]
    for p in parts:
        if p in HIST_BOOL_NOUNS:
            return p
    return ""


def _primary_arch_from_bools(row: pd.Series) -> str:
    """Boolean bileşen sütunlarından öncelik sırasına göre primary_arch belirler."""
    for noun in HIST_BOOL_NOUNS:
        if row.get(noun, False):
            return noun
    return ""


def _primary_arch_from_scores(row: pd.Series, pos: str, noun_cols: list) -> str:
    """Pozisyon maskesine uyan en yüksek skorda core noun (fallback)."""
    ranked = sorted(
        [(n, float(row.get(f"score_{n}", 0) or 0)) for n in noun_cols],
        key=lambda x: -x[1]
    )
    # Diğer noun'ların en yüksek skoru (Initiator ve Engine hariç)
    other_scores = [
        float(row.get(f"score_{n}", 0) or 0)
        for n in noun_cols if n not in ("Initiator", "Engine")
    ]
    other_max = max(other_scores) if other_scores else 0.0

    for noun, score in ranked:
        allowed = NOUN_POSITION_MASK.get(noun)
        if allowed is None or pos in allowed:
            if noun == "Ecosystem" and score < ECO_FALLBACK_MIN:
                continue
            # Initiator: hız/mesafe metrikleri eksik sezonlarda her yerde çıkar;
            # başka noun >= 0.52 varsa geç
            if noun == "Initiator" and other_max >= 0.52:
                continue
            return noun
    return ranked[0][0] if ranked else ""


def enrich_season(season: str, df_hist: pd.DataFrame) -> pd.DataFrame:
    """Tek bir sezon için score_*, overall_score, primary_arch hesaplar."""
    merged_p = DATA / f"{season}__hist_merged.parquet"
    if not merged_p.exists():
        print(f"  [ATLA] {season}: hist_merged yok")
        return df_hist

    merged = pd.read_parquet(merged_p)
    # Sadece GP>=20 filtresi (motor için yeterli örnek)
    merged = merged[merged["GP"].fillna(0) >= 20].copy().reset_index(drop=True)

    # BPM'i önceden merge et (predict_components ile aynı index'te kalır)
    bref_p = DATA / f"{season}__bref_advanced.parquet"
    if bref_p.exists() and "BPM" not in merged.columns:
        try:
            bref = pd.read_parquet(bref_p, columns=["PLAYER_NAME","BPM"])
            # Sadece ilk eşleşmeyi al (TOT satırı zaten bref'te tekil)
            bref = bref.drop_duplicates("PLAYER_NAME")
            merged = merged.merge(bref, on="PLAYER_NAME", how="left")
        except Exception:
            pass
    merged = merged.reset_index(drop=True)

    # Tarihsel veri → fallback imzalar zorunlu
    try:
        scores_df, _ = predict_components(merged, force_fallback=True)
    except Exception as e:
        print(f"  [HATA] {season} predict_components: {e}")
        return df_hist

    # Rename: Engine → score_Engine vb.
    score_rename = {c: f"score_{c}" for c in scores_df.columns}
    scores_df = scores_df.rename(columns=score_rename)
    scores_df["PLAYER_ID"] = merged["PLAYER_ID"].values

    # Core noun sütunları
    noun_cols = [c for c in CORE_NOUNS if f"score_{c}" in scores_df.columns]
    weights   = [NOUN_WEIGHTS.get(c, 1.0) for c in noun_cols]
    w_total   = sum(weights)

    if noun_cols:
        # score_compat.py ile AYNI formül: top-4 noun (^1.5) + BPM blend (0.60/0.40).
        # Tutarlı cross-era karşılaştırma için sabit BPM aralığı [-5, 15] kullanılır.
        _score_mat = np.array([scores_df[f"score_{c}"].fillna(0).values**1.5 * w
                               for c, w in zip(noun_cols, weights)]).T   # (n, 12)
        _w_arr = np.array(weights)
        _top_k = 4
        _sort_idx  = np.argsort(-_score_mat, axis=1)[:, :_top_k]
        _top_sc    = np.take_along_axis(_score_mat, _sort_idx, axis=1)
        _top_wt    = _w_arr[_sort_idx]
        comp_score = pd.Series(_top_sc.sum(axis=1) / _top_wt.sum(axis=1), index=scores_df.index)

        # BPM varsa overall_score = 0.60*top4_noun + 0.40*BPM_norm (score_compat ile aynı)
        # Sabit aralık: çapraz sezon karşılaştırması için BPM_MIN=-5 BPM_MAX=15 (değiştirme)
        if "BPM" in merged.columns:
            bpm_ser  = pd.Series(merged["BPM"].values, index=scores_df.index)
            BPM_MIN, BPM_MAX = -5.0, 15.0
            bpm_norm = ((bpm_ser.fillna(BPM_MIN).clip(BPM_MIN, BPM_MAX) - BPM_MIN) / (BPM_MAX - BPM_MIN))
            raw_overall = (0.60 * comp_score + 0.40 * bpm_norm).round(3)
            scores_df["BPM"] = bpm_ser.round(1).values
        else:
            raw_overall = comp_score.round(3)

        mask_gp = merged["GP"].fillna(0) >= 35
        scores_df["overall_score"] = raw_overall.where(mask_gp.values, other=float("nan"))

    # primary_arch — score_compat.py ile AYNI mantık (boolean-first kaldırıldı).
    # Eskiden: boolean label önce kontrol ediliyordu → Jokić gibi oyuncular eski
    # FALLBACK Ecosystem hatasından kalma Connector=True ile yanlış etiketleniyordu.
    # Şimdi: doğrudan noun skorlarına bakılır (pozisyon maskesi + MIN_PRIMARY gate).
    df_season_pre = df_hist[df_hist["SEASON"] == season].copy()
    if "POSITION" in merged.columns:
        pos_map = dict(zip(merged["PLAYER_ID"], merged["POSITION"].fillna("")))
    else:
        pos_map = {}

    # FALLBACK imzaları için noun thresholds (learned thresholds uygulanmaz)
    fallback_thresholds = {c: FALLBACK_SIGNATURES[c].get("percentile_threshold", 0.0)
                          for c in noun_cols if c in FALLBACK_SIGNATURES}
    MIN_PRIMARY = 0.88   # score_compat.py ile aynı — düşük learned-threshold tuzağını engeller
    ECO_FALLBACK_MIN = 0.90

    eco_thr = max(fallback_thresholds.get("Ecosystem", 0.0), MIN_PRIMARY)

    def _pick_arch(row):
        ranked = sorted(
            [(n, float(row.get(f"score_{n}", 0) or 0)) for n in noun_cols],
            key=lambda x: -x[1],
        )
        other_scores = [float(row.get(f"score_{n}", 0) or 0)
                        for n in noun_cols if n != "Initiator"]
        other_max = max(other_scores) if other_scores else 0.0

        # Ecosystem önceliği: threshold geçiliyorsa (ve top-3 içindeyse) Ecosystem seç.
        # Jokić gibi oyuncular Force/Connector'dan yüksek skor alsa bile Ecosystem kazanır.
        eco_score = float(row.get("score_Ecosystem", 0) or 0)
        if eco_score >= eco_thr:
            eco_rank = next((i for i, (n, _) in enumerate(ranked) if n == "Ecosystem"), 99)
            if eco_rank <= 2:   # top-3 içindeyse
                return "Ecosystem"

        # Geçiş 1: threshold (fallback) + MIN_PRIMARY gate
        for noun, score in ranked:
            thr = max(fallback_thresholds.get(noun, 0.0), MIN_PRIMARY)
            if score >= thr:
                if noun == "Initiator" and other_max >= 0.52:
                    continue
                return noun
        # Geçiş 2 (fallback): threshold yok, en yüksek skor
        for noun, score in ranked:
            if noun == "Ecosystem" and score < ECO_FALLBACK_MIN:
                continue
            if noun == "Initiator" and other_max >= 0.52:
                continue
            return noun
        return ranked[0][0] if ranked else ""

    scores_df["primary_arch"] = scores_df.apply(_pick_arch, axis=1)

    # df_hist ile birleştir (bu sezonun satırları)
    df_season = df_season_pre.copy()
    score_cols = [c for c in scores_df.columns if c.startswith("score_")]
    extra_cols = ["overall_score", "primary_arch"]
    bpm_col = ["BPM"] if "BPM" in scores_df.columns and "BPM" not in df_season_pre.columns else []
    merge_cols = ["PLAYER_ID"] + score_cols + extra_cols + bpm_col
    merge_cols = [c for c in merge_cols if c in scores_df.columns]

    # Traded oyuncular scores_df'de iki kez çıkabilir → dedup (en yüksek overall_score'u sakla)
    dedup_scores = scores_df[merge_cols].copy()
    if "overall_score" in dedup_scores.columns:
        dedup_scores = (
            dedup_scores.sort_values("overall_score", ascending=False)
            .drop_duplicates("PLAYER_ID", keep="first")
        )
    else:
        dedup_scores = dedup_scores.drop_duplicates("PLAYER_ID", keep="first")

    df_season = df_season.merge(
        dedup_scores, on="PLAYER_ID", how="left", suffixes=("", "_new")
    )
    # Overwrite varsa yeni değerlerle
    overwrite_cols = score_cols + ["overall_score", "primary_arch"]
    if "BPM" in scores_df.columns:
        overwrite_cols.append("BPM")
    for col in overwrite_cols:
        if col + "_new" in df_season.columns:
            df_season[col] = df_season[col + "_new"]
            df_season.drop(columns=[col + "_new"], inplace=True)
        elif col in df_season.columns and col in dedup_scores.columns and col != "PLAYER_ID":
            pass  # zaten yerinde

    return df_season


def main():
    hist_p = DATA / "historical__labeled.parquet"
    if not hist_p.exists():
        print("[HATA] data/historical__labeled.parquet bulunamadı")
        sys.exit(1)

    df = pd.read_parquet(hist_p)
    seasons = sorted(df["SEASON"].unique().tolist())
    print(f"Toplam {len(seasons)} sezon, {len(df)} oyuncu kaydı\n")

    enriched_parts = []
    for season in seasons:
        print(f"[{season}] işleniyor...", end=" ", flush=True)
        part = enrich_season(season, df)
        enriched_parts.append(part)
        n_overall = part["overall_score"].notna().sum() if "overall_score" in part.columns else 0
        n_arch    = (part["primary_arch"].fillna("") != "").sum() if "primary_arch" in part.columns else 0
        print(f"overall={n_overall}, arch={n_arch}")

    df_enriched = pd.concat(enriched_parts, ignore_index=True)

    # Versatility: sezon başına yeniden hesapla (lig-içi normalizasyon için)
    vers_parts = []
    for season in seasons:
        part = df_enriched[df_enriched["SEASON"] == season].copy()
        comp_avail = [c for c in list(df.columns) if c in part.columns and
                      c not in ["PLAYER_ID","PLAYER_NAME","GP","MIN","PTS","REB","AST","SEASON",
                                 "TAG","N_COMPONENTS","rarity_score","diversity_bonus",
                                 "pos_flex_bonus","versatility_raw","versatility_score","versatility_tier"]]
        # Sadece boolean bileşen sütunları varsa versatility hesapla
        bool_cols = [c for c in comp_avail if part[c].dtype == bool or set(part[c].dropna().unique()).issubset({0,1,True,False})]
        if bool_cols:
            try:
                part = compute_versatility(part)
            except Exception as e:
                print(f"  [UYARI] {season} versatility: {e}")
        vers_parts.append(part)
        print(f"  {season} versatility yeniden hesaplandı")

    df_final = pd.concat(vers_parts, ignore_index=True)

    # Kaydet
    df_final.to_parquet(hist_p)
    print(f"\n[OK] Kaydedildi: {hist_p.name}  ({len(df_final)} satir)")

    # Özet
    n_with_overall = df_final["overall_score"].notna().sum() if "overall_score" in df_final.columns else 0
    n_with_arch    = (df_final["primary_arch"].fillna("") != "").sum() if "primary_arch" in df_final.columns else 0
    print(f"  overall_score dolu: {n_with_overall} / {len(df_final)}")
    print(f"  primary_arch dolu:  {n_with_arch}  / {len(df_final)}")


if __name__ == "__main__":
    main()
