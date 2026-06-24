"""
Aşama 3: Tüm aktif oyunculara (2025-26) motoru uygula, bileşen etiketlerini üret.

Çıktı:
  data/2025-26__labeled.parquet   — her oyuncu için boolean bileşen sütunları
  data/2025-26__labeled.csv       — insan okunabilir özet (isim + etiket listesi)
"""
import sys
from pathlib import Path
import pandas as pd, json

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from engine import predict_components, assign_positions, select_signatures
from signatures import COMPONENT_SIGNATURES, POSITION_COMPONENTS

MERGED = ROOT / "data" / "2025-26__merged.parquet"
LEARNED = ROOT / "config" / "learned_thresholds.json"

MIN_MINUTES = 200  # sezon boyunca minimum dakika filtresi


def apply_learned_thresholds(sigset: dict, learned: dict) -> dict:
    """learned_thresholds.json'daki optimize eşikleri imza kümesine uygular."""
    result = {}
    for comp, sig in sigset.items():
        if comp in learned:
            result[comp] = {**sig, "percentile_threshold": learned[comp]["percentile"]}
        else:
            result[comp] = sig
    return result


def build_tag_string(row: pd.Series, comp_cols: list, pos_cols: list) -> str:
    """Boolean sütunlardan okunabilir etiket dizisi üretir."""
    pos = [c for c in pos_cols if row.get(c, False)]
    comps = [c for c in comp_cols if row.get(c, False)]
    return " | ".join(pos + comps) if (pos or comps) else "—"


def main():
    if not MERGED.exists():
        print(f"[HATA] {MERGED} yok. Önce: python src/fetch_data.py")
        return

    df = pd.read_parquet(MERGED)
    print(f"Toplam oyuncu: {len(df)}")

    # BPM proxy — OBPM/DBPM nba_api'den gelmiyor; yoksa hesapla
    if "OBPM" not in df.columns or df["OBPM"].isna().all():
        try:
            from compute_bpm import compute_bpm
            print("BPM proxy hesaplanıyor (compute_bpm)...")
            df = compute_bpm(df)
            df.to_parquet(MERGED)  # merged'ı güncelle; diğer scriptler de kullanır
            print("  OBPM/DBPM/BPM eklendi")
        except Exception as e:
            print(f"  [UYARI] compute_bpm başarısız: {e}")

    # Minimum dakika filtresi (MIN maç başına; toplam = MIN * GP)
    if "MIN" in df.columns and "GP" in df.columns:
        total_min = df["MIN"] * df["GP"]
        df = df[total_min >= MIN_MINUTES].reset_index(drop=True)
        print(f"Dakika filtresi (toplam >={MIN_MINUTES} dk): {len(df)} oyuncu kaldı")

    # FT_RATE türet
    if "FTA" in df.columns and "FGA" in df.columns:
        df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

    # Optimize eşikleri yükle
    sigset = COMPONENT_SIGNATURES
    if LEARNED.exists():
        learned = json.loads(LEARNED.read_text())
        sigset = apply_learned_thresholds(sigset, learned)
        print(f"Optimize eşikler uygulandı ({len(learned)} bileşen)")

    # Bileşen tahminleri
    sigset = select_signatures(df, force_fallback=False)
    sigset = apply_learned_thresholds(sigset, json.loads(LEARNED.read_text())) if LEARNED.exists() else sigset
    _, positives = predict_components(df, sigset=sigset)
    comp_cols = list(positives.columns)

    # Pozisyon ataması
    positions = assign_positions(df, position_col="POSITION")
    pos_cols = sorted(POSITION_COMPONENTS)

    # Birleştir
    labeled = pd.concat([
        df[["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "GP", "MIN", "PTS",
            "REB", "AST", "STL", "BLK"]].reset_index(drop=True),
        positives.reset_index(drop=True),
        positions.reset_index(drop=True),
    ], axis=1)

    # Okunabilir etiket sütunu
    labeled["TAG"] = labeled.apply(
        lambda r: build_tag_string(r, comp_cols, pos_cols), axis=1
    )

    # Bileşen sayısı
    labeled["N_COMPONENTS"] = positives.sum(axis=1) + positions.sum(axis=1)

    # Kaydet
    out_parquet = ROOT / "data" / "2025-26__labeled.parquet"
    out_csv     = ROOT / "data" / "2025-26__labeled.csv"
    labeled.to_parquet(out_parquet)
    labeled[["PLAYER_NAME", "TEAM_ABBREVIATION", "GP", "MIN", "PTS",
             "N_COMPONENTS", "TAG"]].to_csv(out_csv, index=False, encoding="utf-8-sig")

    print(f"\nKaydedildi: {out_parquet.name}  ({labeled.shape[0]} oyuncu, {labeled.shape[1]} kolon)")
    print(f"Kaydedildi: {out_csv.name}")

    # Bileşen başına kaç oyuncu pozitif?
    print("\n=== BİLEŞEN DAĞILIMI (lig geneli) ===")
    for col in comp_cols + pos_cols:
        n = labeled[col].sum()
        pct = 100 * n / len(labeled)
        print(f"  {col:<18} {n:>4} oyuncu  ({pct:.1f}%)")

    # En çok bileşen taşıyan top-20
    print("\n=== TOP 20 (en çok bileşen) ===")
    top = labeled.nlargest(20, "N_COMPONENTS")[
        ["PLAYER_NAME", "TEAM_ABBREVIATION", "N_COMPONENTS", "TAG"]
    ]
    print(top.to_string(index=False))

    # Doğrulama sample'ındaki 40 oyuncunun etiketleri
    gt_names = [
        "Shai Gilgeous-Alexander", "Victor Wembanyama", "Nikola Jokić",
        "Luka Dončić", "Jalen Brunson", "Giannis Antetokounmpo",
        "Karl-Anthony Towns", "Lauri Markkanen", "Paolo Banchero",
        "Franz Wagner", "Jalen Johnson", "Pascal Siakam", "Alperen Sengun",
    ]
    print("\n=== KONTROL: GT OYUNCULAR ===")
    ctrl = labeled[labeled["PLAYER_NAME"].isin(gt_names)][
        ["PLAYER_NAME", "N_COMPONENTS", "TAG"]
    ].sort_values("N_COMPONENTS", ascending=False)
    print(ctrl.to_string(index=False))


if __name__ == "__main__":
    main()
