"""
Aşama 2 (çalıştırıcı): Gerçek nba_api verisiyle 40 oyuncuyu doğrula + eşikleri optimize et.

Önce src/fetch_data.py çalıştırılmış ve data/2025-26__merged.parquet üretilmiş olmalı.
"""
import sys, re, json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from engine import (predict_components, validate_components, jaccard_composite,
                    assign_positions, optimize_thresholds)
from signatures import COMPONENT_SIGNATURES, NBA_POSITION_MAP

TAGS_XLSX = str(ROOT / "TAGS.xlsx")
MERGED = ROOT / "data" / "2025-26__merged.parquet"

COMP_LIST = ["Point-of-Attack","Three-Level","Off-Ball","Half-Court","Pick-and-Roll","3-and-D",
    "All-Around","Foul-Drawing","Pull-Up","Shotmaker","Shotmaking","Two-Way","Point-Center","Point-Forward",
    "Rim Runner","Rim-Running","Rim Running","Heliocentric","Jumbo","Downhill","Pressure","Scoring","Speed",
    "Versatile","Defensive","Gravity","Scalable","Stretch","Tempo","Switchable","Slashing","Playmaking",
    "Secondary","Connector","Engine","Ecosystem","Hub","Conductor","Creator","Fulcrum","Anchor","Spacer",
    "Finisher","Force","Initiator","Unicorn","Stopper","Guard","Wing","Forward","Big","Center"]

def parse_label(label):
    found, rem = [], str(label)
    for c in COMP_LIST:
        if re.search(r'\b'+re.escape(c)+r'\b', rem, re.IGNORECASE):
            found.append(c); rem = re.sub(r'\b'+re.escape(c)+r'\b','',rem,flags=re.IGNORECASE)
    norm=set()
    for f in found:
        if f in ("Rim-Running","Rim Running","Rim Runner"): norm.add("Rim Runner")
        elif f in ("Shotmaker","Shotmaking"): norm.add("Shotmaker")
        else: norm.add(f)
    return norm

NAME_MAP = {
    "Alperen Şengün":  "Alperen Sengun",
    "Tyrese Haliburton": None,  # 2025-26'da oynamadı (sakatlandı)
}

def normalize_name(name: str) -> str | None:
    return NAME_MAP.get(name, name)

def main():
    tags = pd.read_excel(TAGS_XLSX, sheet_name='Top 41', header=1).dropna(subset=['Oyuncu'])
    raw_gt = {r['Oyuncu']: parse_label(r['Etiket']) for _, r in tags.iterrows()}
    ground_truth = {}
    for player, comps in raw_gt.items():
        norm = normalize_name(player)
        if norm is None:
            print(f"[skip] {player} — bu sezonda veri yok")
            continue
        ground_truth[norm] = comps

    # Onaylı kullanıcı düzeltmelerini ground truth'a ekle (arch_overrides.json)
    overrides_path = ROOT / "data" / "arch_overrides.json"
    if overrides_path.exists():
        try:
            overrides = json.loads(overrides_path.read_text())
            added = 0
            for player_name, season_map in overrides.items():
                if not isinstance(season_map, dict):
                    continue
                arch = next(reversed(list(season_map.values())), None)
                if arch:
                    ground_truth[player_name] = ground_truth.get(player_name, set()) | {arch}
                    added += 1
            if added:
                print(f"[overrides] {added} düzeltme ground truth'a eklendi")
        except Exception as e:
            print(f"[UYARI] arch_overrides.json okunamadı: {e}")

    if not MERGED.exists():
        print(f"[HATA] {MERGED} yok. Önce: python src/fetch_data.py")
        return
    df = pd.read_parquet(MERGED)

    if "OBPM" not in df.columns or df["OBPM"].isna().all():
        try:
            from compute_bpm import compute_bpm
            df = compute_bpm(df)
            print("BPM proxy eklendi (OBPM/DBPM/BPM)")
        except Exception as e:
            print(f"[UYARI] compute_bpm başarısız: {e}")

    # FT_RATE türet (Downhill imzasında kullanılıyor)
    if "FTA" in df and "FGA" in df:
        df["FT_RATE"] = (df["FTA"] / df["FGA"].replace(0, pd.NA)).fillna(0)

    # sadece 40 oyuncuyu eşleştir (isim normalizasyonu gerekebilir)
    df = df[df["PLAYER_NAME"].isin(ground_truth.keys())].reset_index(drop=True)
    print(f"Eşleşen oyuncu: {len(df)}/40")
    missing = set(ground_truth) - set(df["PLAYER_NAME"])
    if missing:
        print(f"[uyarı] eşleşmeyen (isim formatı?): {sorted(missing)}")

    defined = [c for c in COMPONENT_SIGNATURES]  # pozisyon-dışı bileşenler
    gt_defined = {p: (c & set(defined)) for p, c in ground_truth.items()}

    scores, positives = predict_components(df, only=defined)

    # pozisyonları ayrıca ata ve birleştir
    positions = assign_positions(df, position_col="POSITION")
    positives_full = pd.concat([positives, positions], axis=1)
    gt_full = {p: (ground_truth[p]) for p in ground_truth}

    print("\n=== KATMAN 1: Bileşen doğrulama (elle eşik) ===")
    val = validate_components(positives, gt_defined, df["PLAYER_NAME"])
    print(val.to_string(index=False))

    print("\n=== EŞİK OPTİMİZASYONU ===")
    opt = optimize_thresholds(scores, gt_defined, df["PLAYER_NAME"])
    print(json.dumps(opt, indent=2, ensure_ascii=False))
    (ROOT / "config" / "learned_thresholds.json").write_text(
        json.dumps(opt, indent=2, ensure_ascii=False))
    print("-> config/learned_thresholds.json kaydedildi")

    print("\n=== KATMAN 2: Kompozit Jaccard (pozisyon dahil) ===")
    jac = jaccard_composite(positives_full, gt_full, df["PLAYER_NAME"])
    print(jac[['player','jaccard','exact']].to_string(index=False))
    print(f"\nOrtalama Jaccard: {jac['jaccard'].mean():.3f} | Tam eşleşme: {jac['exact'].mean():.1%}")

if __name__ == "__main__":
    main()
