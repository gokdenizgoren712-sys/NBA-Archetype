# -*- coding: utf-8 -*-
"""Kimya bileşenlerinin AĞIRLIKLARINI veriden öğrenir.

SORUN
─────
lineup_fit'in ağırlıkları (slots .40 / pairs .30 / shape .15 / diversity .15)
elle seçilmişti. Ölçüldüğünde, aynı kulübün farklı XI'leri arasında (kulüp
kimliği ve kadro kalitesi kontrol edilmiş hâlde, sonuç ölçütü xG farkı):

    slots      +0.072   (3.1 standart hata — gerçek)
    diversity  +0.049   (2.1 SE — gerçek)
    pairs      +0.015   (0.6 SE — sıfırdan ayırt edilemiyor)

pairs skorun %30'uydu ve hiçbir şey ölçmüyordu. Kulüpler ARASI +0.236 gibi
güçlü görünüyordu, ama o tamamen takım kimliği: iyi takımın arketip çiftleri
de "uyumlu" çıkıyordu, çiftler uyumlu olduğu için kazanmıyordu.

YÖNTEM
──────
Bileşenler takım-içi merkezleniyor, kalite ayrı bir değişken olarak modele
giriyor (kimyanın kaliteyi taklit etmesini engellemek için), ağırlıklar
regresyonla çıkarılıyor. Maç bazında TRAIN/TEST bölünüyor ve karar TEST'e
göre veriliyor.

NE İDDİA ETMİYORUZ
──────────────────
Bu ağırlıklar kimyayı güçlü bir yordayıcı yapmıyor. Etki küçük ve öyle
kalıyor. Yapılan şey, skorun ölçmediği bir şeye (pairs) %30 ağırlık
vermeyi bırakıp ölçtüğü şeylere vermek. Dürüstlük kazancı, güç kazancı değil.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
OUT = DATA / "football__chem_weights.json"

# shape ÖĞRENİLEMİYOR: gerçek takımlar daima geçerli diziliş oynuyor, yani
# real_xi'de bu bileşen sabit 1.0 — varyansı yok, regresyon ona ağırlık
# atayamaz. Mevcut 0.15'i korunuyor ve öğrenilen ağırlıklar kalan 0.85'i
# paylaşıyor. (Oyunda shape gerçekten değişebiliyor, o yüzden atılmıyor.)
COMPS = ["slots", "pairs", "diversity"]
SHAPE_W = 0.15
TRAIN_FRAC = 0.6
SEED = 17


def prep(season="all", target="xg_diff"):
    """TÜM sezonlar havuzlanır. Tek sezonda (1808 XI) standart hata 0.024;
    ölçmek istediğimiz etkiler 0.02-0.05 mertebesinde, yani tek sezon
    ayırt edemiyor. 10 sezonda SE 0.0075'e iniyor ve ayrım netleşiyor."""
    if season == "all":
        fs = sorted(DATA.glob("football__*__real_xi.parquet"))
        if not fs:
            raise SystemExit("[HATA] real_xi parquet yok")
        d = pd.concat([pd.read_parquet(f) for f in fs], ignore_index=True)
    else:
        d = pd.read_parquet(DATA / f"football__{season}__real_xi.parquet")
    d = d[d.known_players >= 10].copy()
    if target not in d.columns:
        raise SystemExit(f"[HATA] {target} kolonu yok — real_xi.py yeniden kosulmali")
    d = d[d[target].notna()].copy()
    # Sabit etki birimi (kulüp, sezon): kadro sezonlar arasında değişiyor,
    # yalnız kulüp adına göre merkezlemek transferleri kimyaya yazardı.
    d["unit"] = d.team.astype(str) + "|" + d.season.astype(str)
    for c in COMPS + ["avg_quality", target]:
        d["d_" + c] = d[c] - d.groupby("unit")[c].transform("mean")
    return d


def fit(tr, target):
    X = np.column_stack([np.ones(len(tr))] + [tr["d_" + c] for c in COMPS]
                        + [tr.d_avg_quality])
    b, *_ = np.linalg.lstsq(X, tr["d_" + target], rcond=None)
    return b


def corr_of(df, w, target):
    """Verilen ağırlıklarla kurulan kimya skorunun artıkla korelasyonu."""
    s = sum(w[c] * df["d_" + c] for c in COMPS)
    # kaliteyi ayıkla ki kimya onu taklit ederek puan kazanmasın
    X = np.column_stack([np.ones(len(df)), df.d_avg_quality])
    b, *_ = np.linalg.lstsq(X, df["d_" + target], rcond=None)
    resid = df["d_" + target] - X @ b
    return float(np.corrcoef(s, resid)[0, 1])


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="all")
    ap.add_argument("--target", default="xg_diff", choices=["xg_diff", "goal_diff"])
    args = ap.parse_args()

    d = prep(args.season, args.target)
    rng = np.random.default_rng(SEED)
    mids = np.asarray(d.match_id.unique(), dtype=object)
    rng.shuffle(mids)
    tr_ids = set(mids[: int(len(mids) * TRAIN_FRAC)])
    tr, te = d[d.match_id.isin(tr_ids)], d[~d.match_id.isin(tr_ids)]
    print(f"{len(d)} XI · TRAIN {len(tr)} · TEST {len(te)} · hedef {args.target}\n")

    b = fit(tr, args.target)
    raw = dict(zip(COMPS, b[1:1 + len(COMPS)]))
    print("ham regresyon katsayilari (TRAIN):")
    for c in COMPS:
        print(f"  {c:11}{raw[c]:+.3f}")

    # Negatif katsayı = "bu bileşen yüksekken sonuç kötü". Bir uyum skorunda
    # negatif ağırlık anlamsız (oyuncuyu kötü kadro kurmaya teşvik eder),
    # o yüzden 0'a kırpılıp yeniden normalize ediliyor.
    clipped = {c: max(0.0, raw[c]) for c in COMPS}
    tot = sum(clipped.values())
    share = 1.0 - SHAPE_W
    learned = ({c: round(v / tot * share, 3) for c, v in clipped.items()} if tot > 0
               else {c: round(share / len(COMPS), 3) for c in COMPS})
    learned["shape"] = SHAPE_W

    current = {"slots": 0.40, "pairs": 0.30, "shape": 0.15, "diversity": 0.15}
    print("\nagirliklar:")
    print(f"  {'bilesen':12}{'mevcut':>9}{'ogrenilen':>11}")
    for c in COMPS + ["shape"]:
        print(f"  {c:12}{current[c]:>9.2f}{learned[c]:>11.3f}"
              + ("   (olculemez, sabit)" if c == "shape" else ""))

    r_cur = corr_of(te, current, args.target)
    r_new = corr_of(te, learned, args.target)
    print(f"\nTEST kumesinde artikla korelasyon:")
    print(f"  mevcut agirliklar   {r_cur:+.4f}")
    print(f"  ogrenilen agirliklar {r_new:+.4f}   ({r_new - r_cur:+.4f})")
    se = 1 / np.sqrt(len(te))
    print(f"  (standart hata ~{se:.4f}; {abs(r_new)/se:.1f} SE)")

    OUT.write_text(json.dumps({
        "season": args.season, "target": args.target,
        "weights": learned, "previous": current,
        "test_r_learned": round(r_new, 4), "test_r_previous": round(r_cur, 4),
        "n_train": int(len(tr)), "n_test": int(len(te)),
        "note": ("Takim-ici (kulup sabit etkisi) + kadro kalitesi kontrollu "
                 "regresyondan. Etki kucuk; amac olcmedigi seye agirlik "
                 "vermemek, gucu artirmak degil."),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[OK] {OUT.name}")


if __name__ == "__main__":
    main()
