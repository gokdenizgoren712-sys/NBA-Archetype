# -*- coding: utf-8 -*-
"""Kimya skoru için GERÇEK FUTBOL referans dağılımı.

NEDEN BU, "kimya sonucu tahmin eder" YERİNE
────────────────────────────────────────────
Kimyanın maç sonucunu yordayıp yormadığı 17.936 gerçek ilk-11 üzerinde
ölçüldü. Bulgular:

  • Takım-içi (kulüp+sezon sabit etkisi) kimya ~ gol farkı: +0.052, 6.9 SE.
    Yani sıfır DEĞİL, gerçek bir ilişki var.
  • Ama kadro kalitesi modele girince hiçbir bileşen tek başına anlamlı
    kalmıyor (t≈1). Rotasyonda kalite ve rol kapsaması birlikte düşüyor,
    ikisi ayrıştırılamıyor.
  • Ayrılmış test kümesinde hiçbir ağırlık seti diğerinden ya da sıfırdan
    ayırt edilemiyor (fark ~0.002, SE 0.012).

EN ÖNEMLİ KISIT: gerçek menajerler kötü kurulmuş XI dizmiyor. slots'un
%98'i 0.37–0.75 arasında sıkışmış. Oyunda çarkla kurulan bir XI bu bandın
çok altına inebiliyor — ve veri o bölgede HİÇ gözlem içermiyor. Yani
"kapsaması 0.20 olan bir XI ne yapar" sorusunu bu veriyle cevaplayamayız.

Bu yüzden kimyayı bir SONUÇ TAHMİNİ olarak sunmayı bırakıyoruz. Onun
yerine cevaplanabilir soruyu cevaplıyoruz: "bu XI, gerçekte sahaya
çıkmış ilk-11'lere ne kadar benziyor?" Referans dağılım gerçek, persantil
gerçek, iddia da tam olarak ölçtüğümüz şey.

ÇIKTI: data/football__chem_reference.json
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
OUT = DATA / "football__chem_reference.json"

COMPS = ["score", "slots", "pairs", "diversity"]
# real_xi'de bileşik skor "chemistry" adıyla duruyor
COL = {"score": "chemistry", "slots": "slots", "pairs": "pairs",
       "diversity": "diversity"}
GRID = list(range(0, 101))       # her yüzdelik için eşik


def build():
    fs = sorted(DATA.glob("football__*__real_xi.parquet"))
    if not fs:
        raise SystemExit("[HATA] real_xi parquet yok")
    d = pd.concat([pd.read_parquet(f) for f in fs], ignore_index=True)
    d = d[d.known_players >= 10]

    ref = {}
    for k in COMPS:
        col = COL[k]
        v = pd.to_numeric(d[col], errors="coerce").dropna()
        ref[k] = {
            "q": [round(float(np.percentile(v, p)), 4) for p in GRID],
            "mean": round(float(v.mean()), 4),
            "p01": round(float(np.percentile(v, 1)), 4),
            "p99": round(float(np.percentile(v, 99)), 4),
        }

    # Sekiz rol slotu ayrı ayrı — panelin "hangi işte açığın var" satırı
    # bunu gerçek futbola göre konumlandırabilsin.
    out = {
        "n": int(len(d)),
        "seasons": sorted(d.season.astype(str).unique().tolist()),
        "leagues": sorted(d.league.astype(str).unique().tolist()),
        "components": ref,
        "note": ("Gercek ilk-11 dagilimi. Persantil = bu XI, sahaya cikmis "
                 "kadrolarin yuzde kacindan daha iyi kuruldu. Sonuc tahmini "
                 "DEGIL: kimyanin sonuca etkisi kadro kalitesinden "
                 "ayristirilamiyor (bkz. modul docstring)."),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"{len(d)} gercek XI · {len(out['seasons'])} sezon · "
          f"{len(out['leagues'])} lig")
    for k in COMPS:
        r = ref[k]
        print(f"  {k:10} p1 {r['p01']:.3f}  ort {r['mean']:.3f}  p99 {r['p99']:.3f}")
    print(f"\n[OK] {OUT.name}")
    return out


if __name__ == "__main__":
    build()
