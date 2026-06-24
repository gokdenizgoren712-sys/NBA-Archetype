"""
Aşama 6 — Tam çalıştırıcı:
  1. Mevcut 2025-26 skoru zaten yapıldı (versatility.py __main__).
  2. Tarihsel (historical__labeled.parquet) için de aynı hesabı yap.
  3. Affinity matrisine versatility ağırlıklı başarı (flex_bonus) ekle.
"""
import sys, json
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

from versatility import compute_versatility, versatility_summary, top_per_tier
from signatures  import COMPONENT_SIGNATURES, POSITION_COMPONENTS

ALL_COMP = list(COMPONENT_SIGNATURES.keys())


# ── 1. Tarihsel versatility ────────────────────────────────────────────────────

def run_historical():
    hist_path = DATA_DIR / "historical__labeled.parquet"
    if not hist_path.exists():
        print("[atla] historical__labeled.parquet yok")
        return
    df = pd.read_parquet(hist_path)
    # Tüm sezonları tek seferde normalize etme; her sezonu kendi içinde normalize et
    frames = []
    for season, grp in df.groupby("SEASON"):
        grp = grp.copy().reset_index(drop=True)
        grp = compute_versatility(grp)
        frames.append(grp)
    out = pd.concat(frames, ignore_index=True)
    out.to_parquet(hist_path)
    print(f"Tarihsel versatility güncellendi: {len(out)} kayıt, {out['SEASON'].nunique()} sezon")

    # Sezon başına ortalama versatility
    print("\nSezon başına ortalama versatility_score (ilk 5 / son 5):")
    avg = out.groupby("SEASON")["versatility_score"].mean().sort_index()
    print(pd.concat([avg.head(5), avg.tail(5)]).round(3).to_string())


# ── 2. Affinity matrisine versatility flex_bonus ekle ────────────────────────

def flex_adjusted_affinity():
    """
    Uyum matrisini versatility ile düzelt:
      adjusted[a, b] = affinity[a, b] * (1 + alpha * avg_versatility[a, b])
    Böylece çok yönlü oyuncu çiftleri daha yüksek puan alır.
    alpha = 0.20 (kullanıcı isterse ayarlanabilir).
    """
    aff_path = DATA_DIR / "2025-26__affinity_matrix.parquet"
    ver_path = DATA_DIR / "2025-26__versatility.parquet"
    if not aff_path.exists() or not ver_path.exists():
        print("[atla] affinity_matrix veya versatility dosyası yok")
        return

    M   = pd.read_parquet(aff_path)
    ver = pd.read_parquet(ver_path)

    # Her arketip grubunun ortalama versatility skoru
    from run_affinity import SEASON  # "2025-26"
    merged_path = DATA_DIR / f"{SEASON.replace('/', '-')}__merged.parquet"
    if not merged_path.exists():
        print("[atla] merged parquet yok")
        return

    df_full = pd.read_parquet(merged_path)
    if "FTA" in df_full.columns and "FGA" in df_full.columns:
        df_full["FT_RATE"] = (df_full["FTA"] / df_full["FGA"].replace(0, pd.NA)).fillna(0)

    df_sub = df_full[df_full["PLAYER_NAME"].isin(ver["PLAYER_NAME"])].reset_index(drop=True)
    from engine import predict_components, select_signatures
    learned_path = ROOT / "config" / "learned_thresholds.json"
    sigset = select_signatures(df_sub)
    if learned_path.exists():
        learned = json.loads(learned_path.read_text())
        for c in list(sigset.keys()):
            if c in learned:
                sigset[c] = {**sigset[c], "percentile_threshold": learned[c]["percentile"]}
    scores, _ = predict_components(df_sub, sigset=sigset)
    scores["PLAYER_NAME"] = df_sub["PLAYER_NAME"].values

    CORE = ["Engine", "Anchor", "Rim Runner", "Spacer", "Connector", "Creator"]
    core_in = [c for c in CORE if c in scores.columns]
    player_arch = {}
    for _, row in scores.iterrows():
        cs = {c: row[c] for c in core_in if not pd.isna(row[c])}
        if cs:
            player_arch[row["PLAYER_NAME"]] = max(cs, key=cs.get)

    ver_map = ver.set_index("PLAYER_NAME")["versatility_score"].to_dict()
    arch_ver = {}   # arketip -> avg versatility
    for player, arch in player_arch.items():
        arch_ver.setdefault(arch, []).append(ver_map.get(player, 0))
    arch_ver_avg = {a: np.mean(v) for a, v in arch_ver.items()}
    print("\nArketip bazı ortalama versatility:")
    for a, v in sorted(arch_ver_avg.items(), key=lambda x: -x[1]):
        print(f"  {a:<15} {v:.3f}")

    # Düzeltme: adjusted[a,b] = raw[a,b] * (1 + 0.20 * (ver[a]+ver[b])/2)
    alpha = 0.20
    M_adj = M.copy()
    for a in M.index:
        for b in M.columns:
            if not np.isnan(M.loc[a, b]):
                va = arch_ver_avg.get(a, 0)
                vb = arch_ver_avg.get(b, 0)
                M_adj.loc[a, b] = round(M.loc[a, b] * (1 + alpha * (va + vb) / 2), 3)

    out_adj = DATA_DIR / "2025-26__affinity_matrix_flex.parquet"
    M_adj.to_parquet(out_adj)
    M_adj.round(3).to_csv(DATA_DIR / "2025-26__affinity_matrix_flex.csv",
                          encoding="utf-8-sig")
    print("\nVersatility-adjusted affinity matrisi:")
    print(M_adj.to_string())

    print("\nEn güçlü çiftler (flex adjusted):")
    pairs = [(a, b, M_adj.loc[a, b])
             for a in M_adj.index for b in M_adj.columns
             if a <= b and not np.isnan(M_adj.loc[a, b])]
    for a, b, v in sorted(pairs, key=lambda x: -x[2])[:10]:
        lbl = f"{a} + {b}" if a != b else f"{a} (çift)"
        print(f"  {lbl:<35} {v:.3f}")
    print(f"\nKaydedildi: {out_adj.name}")


if __name__ == "__main__":
    print("=== AŞAMA 6: TARİHSEL VERSATİLİTY ===")
    run_historical()

    print("\n=== AŞAMA 6: FLEX-ADJUSTED AFİNİTY ===")
    flex_adjusted_affinity()

    print("\n=== AŞAMA 6 TAMAMLANDI ===")
