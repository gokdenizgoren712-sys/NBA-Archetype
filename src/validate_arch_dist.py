"""
Arketip dağılımı sanity kontrolü.

Gerçek NBA liginde beklenen rough dağılımla karşılaştırır:
- Spacer çok mu? (3PT atışçı sayısına göre)
- Engine çok mu / az mı?
- Stopper yeterli mi?
- Sırasız oyuncular (overall_score=NaN) ne kadar?

Çalıştırma: python src/validate_arch_dist.py
"""

from pathlib import Path
import pandas as pd
import sys

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def validate(season: str = "2025-26"):
    path = DATA / f"{season.replace('/','_')}__player_scores.parquet"
    if not path.exists():
        path = DATA / f"{season.replace('/','-')}__player_scores.parquet"
    if not path.exists():
        print(f"[HATA] {path} bulunamadı")
        sys.exit(1)

    df = pd.read_parquet(path)
    total = len(df)
    ranked = df[df["overall_score"].notna()]
    unranked = df[df["overall_score"].isna()]

    print(f"\n{'='*60}")
    print(f"Sezon: {season}  |  Toplam: {total}  |  Sıralı: {len(ranked)}  |  Sırasız: {len(unranked)}")
    print(f"{'='*60}\n")

    # Arketip dağılımı
    if "primary_arch" in ranked.columns:
        dist = ranked["primary_arch"].value_counts()
        print("Arketip dağılımı (sıralı oyuncular):")
        for arch, n in dist.items():
            pct = n / len(ranked) * 100
            bar = "█" * int(pct / 2)
            flag = ""
            # Sanity threshold'lar
            if arch == "Spacer" and pct > 25:
                flag = " ! COK FAZLA (>25%)"
            elif arch == "Engine" and pct < 5:
                flag = " ! AZ (<5%)"
            elif arch == "Stopper" and pct < 5:
                flag = " ! AZ (<5%)"
            nm = str(arch).encode("ascii","replace").decode()
            bar_ascii = "#" * int(pct / 2)
            print(f"  {nm:<14} {n:>4} ({pct:5.1f}%)  {bar_ascii}{flag}")

    # 3PT sanity: Spacer count vs actual 3PT shooters
    print()
    spacer_count = int((ranked["primary_arch"] == "Spacer").sum()) if "primary_arch" in ranked.columns else 0
    # Gerçek 3PT atışçı: FG3A >= 3.0 ve sıralı
    if "FG3A" in ranked.columns:
        real_spacers = int((ranked["FG3A"].fillna(0) >= 4.0).sum())
        ratio = spacer_count / real_spacers if real_spacers else float("inf")
        status = "OK" if 0.2 < ratio < 1.5 else "! ORAN BOZUK"
        print(f"Spacer/Gercek 3PT (FG3A>=4): {spacer_count}/{real_spacers} = {ratio:.2f}  {status}")

    # Modifier tag dağılımı — gerçek percentile_threshold'larıyla
    sys.path.insert(0, str(ROOT))
    try:
        from config.signatures import COMPONENT_SIGNATURES as CS, MODIFIER_TAGS
        mod_cols = [f"score_{m}" for m in MODIFIER_TAGS if f"score_{m}" in ranked.columns]
        if mod_cols:
            print("\nModifier tag dagilimi (gercek percentile_threshold ile):")
            counts = {}
            for m in MODIFIER_TAGS:
                col = f"score_{m}"
                if col not in ranked.columns:
                    continue
                thr = CS.get(m, {}).get("percentile_threshold", 0.75)
                n = int((ranked[col].fillna(0) >= thr).sum())
                counts[m] = (n, thr)
            for mod, (n, thr) in sorted(counts.items(), key=lambda x: -x[1][0]):
                pct = n / len(ranked) * 100
                nm = mod.encode("ascii","replace").decode()
                flag = " ! COK FAZLA (>30%)" if pct > 30 else ""
                print(f"  {nm:<18} {n:>4} ({pct:5.1f}%)  thr={thr:.2f}{flag}")
    except ImportError:
        pass

    # Sırasız oyuncular (düşük dakika)
    if "eff_games" in unranked.columns:
        print(f"\nSırasız {len(unranked)} oyuncu — eff_games dağılımı:")
        print(f"  medyan: {unranked['eff_games'].median():.0f} dk")
        print(f"  max:    {unranked['eff_games'].max():.0f} dk")
        low_games = int((unranked["eff_games"].fillna(0) < 200).sum())
        print(f"  <200 dk (gerçek az oynayan): {low_games}")

    print()


if __name__ == "__main__":
    season = sys.argv[1] if len(sys.argv) > 1 else "2025-26"
    validate(season)
