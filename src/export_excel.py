"""
Tüm analiz çıktılarını tek Excel dosyasına aktarır.

Sheetler:
  1.  Özet              — tier/arketip dağılımı, en çok bileşenli oyuncular
  2.  Uyum_Matrisi      — arketip x arketip ham affinity
  3.  Uyum_Flex         — versatility-adjusted affinity
  4.  2025-26_Oyuncular — tüm oyuncular: etiket + versatility
  4b. Oyuncu_Skorları   — her oyuncu için bileşen bazlı 0-1 skor profili
  5.  2025-26_5li       — gerçek 5'li lineup'lar, uyum skoru ile sıralı
  6.  2025-26_Duolar    — en iyi duolar, arketip çiftleri ile
  6b. Duo_Uyum          — skor tabanlı duo uyumluluk tablosu (top-500)
  6c. 5li_Uyum          — skor tabanlı teorik 5'li uyum (top-200)
  7+. <SEASON>          — her tarihsel sezon için oyuncu listesi
"""
import sys, json
from pathlib import Path
import pandas as pd, numpy as np
from itertools import combinations

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from signatures import COMPONENT_SIGNATURES, POSITION_COMPONENTS
from versatility import compute_versatility
from score_compat import build_score_table, duo_compatibility, top_lineup_combos

COMP_COLS = list(COMPONENT_SIGNATURES.keys())
POS_COLS  = sorted(POSITION_COMPONENTS)
CORE      = ["Engine","Anchor","Rim Runner","Spacer","Connector","Creator"]
OUT_FILE  = ROOT / "data" / "NBA_Archetypes_Analysis.xlsx"


# ── yardımcı: gerçek skor tabanlı oyuncu->arketip ────────────────────────────

def _player_arch_from_scores(df_full: pd.DataFrame) -> dict:
    """PLAYER_NAME -> baskın core-noun (ham skor en yüksek)."""
    from engine import predict_components, select_signatures
    if "FTA" in df_full.columns and "FGA" in df_full.columns:
        df_full = df_full.copy()
        df_full["FT_RATE"] = (df_full["FTA"] / df_full["FGA"].replace(0, pd.NA)).fillna(0)
    sigset = select_signatures(df_full)
    lp = ROOT / "config" / "learned_thresholds.json"
    if lp.exists():
        learned = json.loads(lp.read_text())
        for c in list(sigset.keys()):
            if c in learned:
                sigset[c] = {**sigset[c], "percentile_threshold": learned[c]["percentile"]}
    scores, _ = predict_components(df_full, sigset=sigset)
    scores["PLAYER_NAME"] = df_full["PLAYER_NAME"].values
    core_in = [c for c in CORE if c in scores.columns]
    arch = {}
    for _, row in scores.iterrows():
        cs = {c: row[c] for c in core_in if pd.notna(row[c])}
        if cs:
            arch[row["PLAYER_NAME"]] = max(cs, key=cs.get)
    return arch


def _abbrev_map(player_arch: dict) -> dict:
    """'S. Gilgeous-Alexander' -> 'Shai Gilgeous-Alexander' tipi eşleme."""
    m = {}
    for full in player_arch:
        parts = full.split(" ", 1)
        if len(parts) == 2:
            m[parts[0][0] + ". " + parts[1]] = full
    return m


# ── Sheet 1: Özet ─────────────────────────────────────────────────────────────

def sheet_ozet(labeled: pd.DataFrame) -> pd.DataFrame:
    rows = []

    # Tier dağılımı
    rows.append({"Kategori": "=== VERSATİLİTY TİER DAĞILIMI ===", "Değer": ""})
    if "versatility_tier" in labeled.columns:
        for tier in ["Elite","Versatile","Contributor","Role Player","Specialist"]:
            n = (labeled["versatility_tier"] == tier).sum()
            rows.append({"Kategori": tier, "Değer": f"{n} oyuncu ({100*n/len(labeled):.1f}%)"})

    rows.append({"Kategori": "", "Değer": ""})
    rows.append({"Kategori": "=== ARKETİP DAĞILIMI (lig geneli) ===", "Değer": ""})
    for c in COMP_COLS:
        if c in labeled.columns:
            n = int(labeled[c].sum())
            rows.append({"Kategori": c, "Değer": f"{n} oyuncu ({100*n/len(labeled):.1f}%)"})

    rows.append({"Kategori": "", "Değer": ""})
    rows.append({"Kategori": "=== POZİSYON DAĞILIMI ===", "Değer": ""})
    for c in POS_COLS:
        if c in labeled.columns:
            n = int(labeled[c].sum())
            rows.append({"Kategori": c, "Değer": f"{n} oyuncu ({100*n/len(labeled):.1f}%)"})

    return pd.DataFrame(rows)


# ── Sheet 4: 2025-26 oyuncular ────────────────────────────────────────────────

def sheet_oyuncular(labeled: pd.DataFrame) -> pd.DataFrame:
    cols = ["PLAYER_NAME","TEAM_ABBREVIATION","GP","MIN","PTS","REB","AST","STL","BLK"]
    cols = [c for c in cols if c in labeled.columns]
    out = labeled[cols].copy()

    # Pozisyon etiketi (metin)
    def pos_str(row):
        return " / ".join(c for c in POS_COLS if row.get(c, False))
    out["Pozisyon"] = labeled.apply(pos_str, axis=1)

    # Bileşenler (metin)
    def comp_str(row):
        return " | ".join(c for c in COMP_COLS if row.get(c, False))
    out["Bileşenler"] = labeled.apply(comp_str, axis=1)

    # Versatility
    for vc in ["versatility_score","versatility_tier","versatility_raw"]:
        if vc in labeled.columns:
            out[vc] = labeled[vc]

    out = out.rename(columns={
        "PLAYER_NAME": "Oyuncu", "TEAM_ABBREVIATION": "Takım",
        "versatility_score": "V_Skor", "versatility_tier": "V_Tier",
        "versatility_raw": "V_Ham",
    })
    if "V_Skor" in out.columns:
        out = out.sort_values("V_Skor", ascending=False)
    return out.reset_index(drop=True)


# ── Sheet 5: 2025-26 gerçek 5'li lineup'lar ──────────────────────────────────

def sheet_fiveman(player_arch: dict, abbrev: dict) -> pd.DataFrame:
    lu_path  = DATA / "2025-26__lineups_5man.parquet"
    polo_path = DATA / "2025-26__playoff_lineups_5man.parquet"

    frames = []
    for path, source in [(lu_path,"Regular"), (polo_path,"Playoff")]:
        if not path.exists():
            continue
        df = pd.read_parquet(path)
        df["source"] = source
        frames.append(df)
    if not frames:
        return pd.DataFrame({"Bilgi": ["Lineup verisi bulunamadı"]})

    all_lu = pd.concat(frames, ignore_index=True)

    # NET_RATING normalize -> success proxy
    nr = all_lu["NET_RATING"].clip(-20, 20)
    all_lu["success"] = (nr - nr.min()) / (nr.max() - nr.min() + 1e-9)

    # MIN filtresi
    all_lu = all_lu[all_lu["MIN"] >= 50].copy()

    # Lineup'taki oyuncuların arketiplerini bul
    def lineup_arch_score(group_name: str) -> tuple:
        names = [n.strip() for n in str(group_name).split(" - ")]
        archs = []
        for n in names:
            full = n if n in player_arch else abbrev.get(n)
            if full and full in player_arch:
                archs.append(player_arch[full])
        # kaç benzersiz core-noun var?
        unique_arch = len(set(archs))
        return ", ".join(archs) if archs else "—", unique_arch

    all_lu[["Arketipler","N_Unique_Arch"]] = pd.DataFrame(
        all_lu["GROUP_NAME"].map(lineup_arch_score).tolist(), index=all_lu.index
    )

    keep = ["GROUP_NAME","TEAM_ABBREVIATION","source","MIN","NET_RATING",
            "OFF_RATING","DEF_RATING","W","L","success","Arketipler","N_Unique_Arch"]
    keep = [c for c in keep if c in all_lu.columns]
    out = all_lu[keep].sort_values("NET_RATING", ascending=False)
    out = out.rename(columns={
        "GROUP_NAME":"5'li Lineup","TEAM_ABBREVIATION":"Takım",
        "source":"Tür","MIN":"Dakika","NET_RATING":"Net Rating",
        "OFF_RATING":"Hücum","DEF_RATING":"Savunma",
        "W":"Galibiyet","L":"Mağlubiyet","success":"Başarı Skoru",
    })
    return out.head(100).reset_index(drop=True)


# ── Sheet 6: En iyi duolar ────────────────────────────────────────────────────

def sheet_duolar(player_arch: dict, abbrev: dict) -> pd.DataFrame:
    lu2_path  = DATA / "2025-26__lineups_2man.parquet"
    polo2_path = DATA / "2025-26__playoff_lineups_2man.parquet"

    frames = []
    for path, source in [(lu2_path,"Regular"), (polo2_path,"Playoff")]:
        if not path.exists():
            continue
        df = pd.read_parquet(path)
        df["source"] = source
        frames.append(df)
    if not frames:
        csv_path = DATA / "2025-26__best_duos.csv"
        if csv_path.exists():
            return pd.read_csv(csv_path)
        return pd.DataFrame({"Bilgi": ["Duo verisi bulunamadı"]})

    all_du = pd.concat(frames, ignore_index=True)

    # İsim ayır
    split = all_du["GROUP_NAME"].str.split(" - ", expand=True)
    all_du["P1"] = split[0].str.strip()
    all_du["P2"] = split[1].str.strip() if split.shape[1] > 1 else ""

    # Tam isme çevir
    def resolve(n):
        if n in player_arch: return n
        return abbrev.get(n, n)
    all_du["P1_full"] = all_du["P1"].map(resolve)
    all_du["P2_full"] = all_du["P2"].map(resolve)
    all_du["Arch1"]   = all_du["P1_full"].map(player_arch)
    all_du["Arch2"]   = all_du["P2_full"].map(player_arch)
    all_du["Arch_Çift"] = all_du.apply(
        lambda r: " + ".join(sorted([str(r["Arch1"]), str(r["Arch2"])])), axis=1)

    all_du = all_du[all_du["MIN"] >= 150].copy()
    nr = all_du["NET_RATING"].clip(-20, 20)
    all_du["Başarı"] = (nr - nr.min()) / (nr.max() - nr.min() + 1e-9)

    keep = ["P1_full","P2_full","Arch_Çift","TEAM_ABBREVIATION","source",
            "MIN","NET_RATING","W","L","Başarı"]
    keep = [c for c in keep if c in all_du.columns]
    out = all_du[keep].sort_values("NET_RATING", ascending=False)
    out = out.rename(columns={
        "P1_full":"Oyuncu 1","P2_full":"Oyuncu 2",
        "Arch_Çift":"Arketip Çifti","TEAM_ABBREVIATION":"Takım",
        "source":"Tür","MIN":"Dakika","NET_RATING":"Net Rating",
        "W":"Galibiyet","L":"Mağlubiyet",
    })
    return out.head(100).reset_index(drop=True)


# ── Tarihsel sezon sheetleri ──────────────────────────────────────────────────

def sheet_historical_season(df_season: pd.DataFrame, season: str) -> pd.DataFrame:
    """Tek sezon için oyuncu-arketip özeti."""
    comp_avail = [c for c in COMP_COLS if c in df_season.columns]
    pos_avail  = [c for c in POS_COLS  if c in df_season.columns]

    keep = ["PLAYER_NAME","GP","MIN","PTS","REB","AST"]
    keep = [c for c in keep if c in df_season.columns]
    out = df_season[keep].copy()

    out["Pozisyon"]  = df_season.apply(
        lambda r: " / ".join(c for c in pos_avail if r.get(c, False)), axis=1)
    out["Bileşenler"] = df_season.apply(
        lambda r: " | ".join(c for c in comp_avail if r.get(c, False)), axis=1)

    if "versatility_score" in df_season.columns:
        out["V_Skor"] = df_season["versatility_score"].round(3)
        out["V_Tier"] = df_season.get("versatility_tier", "")
        out = out.sort_values("V_Skor", ascending=False)
    else:
        n_comp = df_season[comp_avail].sum(axis=1)
        out["N_Bileşen"] = n_comp.values
        out = out.sort_values("N_Bileşen", ascending=False)

    out = out.rename(columns={
        "PLAYER_NAME":"Oyuncu","GP":"Maç","MIN":"Dakika",
        "PTS":"Sayı","REB":"Ribaund","AST":"Asist",
    })
    return out.reset_index(drop=True)


# ── Ana akış ──────────────────────────────────────────────────────────────────

def main():
    print("Veriler yükleniyor...")

    labeled_path = DATA / "2025-26__labeled.parquet"
    if not labeled_path.exists():
        print("[HATA] 2025-26__labeled.parquet yok.")
        return
    labeled = pd.read_parquet(labeled_path)

    # Versatility yoksa hesapla
    if "versatility_score" not in labeled.columns:
        print("Versatility hesaplanıyor...")
        labeled = compute_versatility(labeled)

    # Oyuncu arketipi (skor tabanlı)
    print("Oyuncu arketipleri (skor tabanlı) hesaplanıyor...")
    df_full = pd.read_parquet(DATA / "2025-26__merged.parquet")

    # BPM proxy — OBPM/DBPM nba_api'den gelmiyor; yoksa hesapla ve kaydet
    if "OBPM" not in df_full.columns or df_full["OBPM"].isna().all():
        try:
            sys.path.insert(0, str(ROOT / "src"))
            from compute_bpm import compute_bpm
            print("BPM proxy hesaplanıyor (compute_bpm)...")
            df_full = compute_bpm(df_full)
            df_full.to_parquet(DATA / "2025-26__merged.parquet")
            print("  OBPM/DBPM/BPM eklendi → merged.parquet güncellendi")
        except Exception as e:
            print(f"  [UYARI] compute_bpm başarısız: {e}")
    player_arch = _player_arch_from_scores(df_full)
    abbrev      = _abbrev_map(player_arch)

    # Affinity matrisleri
    aff_path  = DATA / "2025-26__affinity_matrix.parquet"
    aflx_path = DATA / "2025-26__affinity_matrix_flex.parquet"
    aff_matrix  = pd.read_parquet(aff_path)  if aff_path.exists()  else pd.DataFrame()
    aflx_matrix = pd.read_parquet(aflx_path) if aflx_path.exists() else pd.DataFrame()

    # Tarihsel veri
    hist_path = DATA / "historical__labeled.parquet"
    hist = pd.read_parquet(hist_path) if hist_path.exists() else pd.DataFrame()

    # Skor tablosu (tüm sistemi besliyor)
    print("Oyuncu skor profilleri hesaplanıyor...")
    score_tbl = build_score_table("2025-26")
    score_tbl.to_parquet(DATA / "2025-26__player_scores.parquet")

    # Duo uyumu (top-60 oyuncudan C(60,2)=1770 çift)
    print("Duo uyumu hesaplanıyor...")
    duo_compat = duo_compatibility(score_tbl, affinity_matrix=aff_matrix, min_games=20)

    # 5'li uyum
    print("5'li kombinasyon uyumu hesaplanıyor (top-60 havuzdan, top-200)...")
    lineup_compat = top_lineup_combos(score_tbl, top_n=200, min_gp=20)

    print("Excel oluşturuluyor...")
    with pd.ExcelWriter(OUT_FILE, engine="openpyxl") as writer:

        # 1. Özet
        sheet_ozet(labeled).to_excel(writer, sheet_name="Özet", index=False)
        print("  ✓ Özet")

        # 2. Uyum Matrisi
        if not aff_matrix.empty:
            aff_matrix.round(3).to_excel(writer, sheet_name="Uyum_Matrisi")
            print("  ✓ Uyum_Matrisi")

        # 3. Uyum Flex
        if not aflx_matrix.empty:
            aflx_matrix.round(3).to_excel(writer, sheet_name="Uyum_Flex")
            print("  ✓ Uyum_Flex")

        # 4. 2025-26 Oyuncular
        sheet_oyuncular(labeled).to_excel(
            writer, sheet_name="2025-26_Oyuncular", index=False)
        print("  ✓ 2025-26_Oyuncular")

        # 4b. Oyuncu Skor Profilleri
        score_cols_ordered = (
            ["PLAYER_NAME", "TEAM_ABBREVIATION", "POSITION", "GP", "MIN",
             "PTS", "REB", "AST", "primary_arch", "overall_score"]
            + [f"score_{c}" for c in COMP_COLS if f"score_{c}" in score_tbl.columns]
        )
        score_cols_ordered = [c for c in score_cols_ordered if c in score_tbl.columns]
        score_tbl_out = (score_tbl[score_cols_ordered]
                         .sort_values("overall_score", ascending=False)
                         .reset_index(drop=True))
        score_tbl_out = score_tbl_out.rename(columns={
            "PLAYER_NAME": "Oyuncu", "TEAM_ABBREVIATION": "Takım",
            "POSITION": "Pozisyon", "GP": "Maç", "MIN": "Dk/Maç",
            "PTS": "Sayı", "REB": "Ribaund", "AST": "Asist",
            "primary_arch": "Ana_Arketip", "overall_score": "Genel_Skor",
        })
        score_tbl_out.to_excel(writer, sheet_name="Oyuncu_Skorları", index=False)
        print("  ✓ Oyuncu_Skorları")

        # 5. 2025-26 5'li lineup'lar
        sheet_fiveman(player_arch, abbrev).to_excel(
            writer, sheet_name="2025-26_5li", index=False)
        print("  ✓ 2025-26_5li")

        # 6. 2025-26 duolar
        sheet_duolar(player_arch, abbrev).to_excel(
            writer, sheet_name="2025-26_Duolar", index=False)
        print("  ✓ 2025-26_Duolar")

        # 6b. Skor tabanlı duo uyumu
        if not duo_compat.empty:
            duo_compat.to_excel(writer, sheet_name="Duo_Uyum", index=False)
            print(f"  ✓ Duo_Uyum ({len(duo_compat)} çift)")

        # 6c. Skor tabanlı 5'li uyum
        if not lineup_compat.empty:
            lineup_compat.to_excel(writer, sheet_name="5li_Uyum", index=False)
            print(f"  ✓ 5li_Uyum ({len(lineup_compat)} kombinasyon)")

        # 7+. Tarihsel sezonlar (sondan eskiye)
        if not hist.empty:
            seasons = sorted(hist["SEASON"].unique(), reverse=True)
            for season in seasons:
                df_s = hist[hist["SEASON"] == season].reset_index(drop=True)
                sheet_name = season.replace("/", "-")[:31]  # Excel 31 char sınırı
                sheet_historical_season(df_s, season).to_excel(
                    writer, sheet_name=sheet_name, index=False)
            print(f"  ✓ {len(seasons)} tarihsel sezon sheetleri")

    print(f"\nKaydedildi: {OUT_FILE}")
    print(f"Toplam sheet: {6 + (len(seasons) if not hist.empty else 0)}")


if __name__ == "__main__":
    main()
