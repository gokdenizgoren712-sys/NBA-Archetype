# -*- coding: utf-8 -*-
"""Maç simülasyonunun gol modelini GERÇEK maçlardan kalibre eder.

NEDEN BÖYLE
───────────
Basketbol tarafındaki seasonSim.js reytingleri elle seçilmiş katsayılarla
skora çeviriyor. Futbolda buna gerek yok: elimizde aynı sezonun 2245 gerçek
ilk-11'i, her birinin bizim hesapladığımız kimya/kalite girdisi VE gerçek
gol çıktısı var. Yani katsayıyı uydurmak yerine ölçebiliyoruz.

Gol dağılımının Poisson olduğu VARSAYILMADI, doğrulandı (2155 XI):
    gözlenen  {0:579, 1:732, 2:519, 3:239, 4:64, 5:19, 6:3}
    Poisson   {0:573, 1:759, 2:503, 3:222, 4:74, 5:20, 6:4}
    ortalama 1.33 / varyans 1.29  (Poisson'da eşit olmalı — pratikte eşit)

DÜRÜSTLÜK NOTU — KİMYA
──────────────────────
Kimya tek başına gol farkıyla +0.14 korele, ama KALİTE KONTROL EDİLİNCE
katkısı R²'de +0.001'e düşüyor. Yani kimyanın görünen etkisi büyük ölçüde
"iyi takımın kimyası da yüksek çıkıyor"dan ibaret. Bu yüzden model kimyayı
ATMIYOR ama ölçülen katsayısıyla — kalitenin ~1/5'i — tutuyor. Oyunda
kimyanın belirleyici olduğu izlenimi verilmemeli; UI bunu açıkça yazıyor.

ÇIKTI: data/football__sim_coeffs.json — frontend bunu okur.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
OUT = DATA / "football__sim_coeffs.json"

MIN_KNOWN = 9          # 11'in en az 9'u tanınsın, yoksa kalite ortalaması gürültülü


def _fit(A, y):
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    pred = A @ b
    ss_res = float(((y - pred) ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return b, 1 - ss_res / ss_tot


def calibrate(season="2025-2026"):
    p = DATA / f"football__{season}__real_xi.parquet"
    if not p.exists():
        raise SystemExit(f"[HATA] {p.name} yok — once real_xi.py kosulmali")
    d = pd.read_parquet(p)

    # Aynı maçın iki tarafını eşleştir: rakip kalitesi modelin yarısı.
    both = d.groupby("match_id").filter(lambda g: len(g) == 2).copy()
    both = both.sort_values(["match_id", "team"])
    for src, dst in (("avg_quality", "opp_quality"), ("chemistry", "opp_chem")):
        both[dst] = both.groupby("match_id")[src].transform(lambda s: s[::-1].values)
    d = both[both.known_players >= MIN_KNOWN].copy()
    if len(d) < 200:
        raise SystemExit(f"[HATA] yeterli eslesmis mac yok ({len(d)})")

    home = d.is_home.astype(float).to_numpy() if "is_home" in d.columns else np.zeros(len(d))
    A = np.column_stack([np.ones(len(d)), d.avg_quality, d.chemistry,
                         d.opp_quality, home])
    names = ["const", "quality", "chemistry", "opp_quality", "home"]

    b_for, r2_for = _fit(A, d.goals_for.to_numpy(float))
    b_ag, r2_ag = _fit(A, d.goals_against.to_numpy(float))

    # Poisson uyumu — modelin altındaki varsayımı her koşuda yeniden ölç.
    gf = d.goals_for
    lam = float(gf.mean())
    from math import exp, factorial
    obs = {k: int((gf == k).sum()) for k in range(7)}
    exp_ = {k: round(len(gf) * exp(-lam) * lam ** k / factorial(k)) for k in range(7)}

    coeffs = {
        "season": season,
        "n_matches": int(d.match_id.nunique()),
        "n_rows": int(len(d)),
        "goals_for": dict(zip(names, [float(x) for x in b_for])),
        "goals_against": dict(zip(names, [float(x) for x in b_ag])),
        "r2": {"goals_for": round(r2_for, 4), "goals_against": round(r2_ag, 4)},
        "league_mean_goals": lam,
        "poisson_check": {"observed": obs, "expected": exp_,
                          "mean": round(lam, 3), "var": round(float(gf.var()), 3)},
        # Simülasyonda lambda bu tabanın altına inmesin — 0 veya negatif
        # lambda Poisson'da tanımsız, ayrıca gerçek futbolda da yok.
        "lambda_floor": 0.15,
        "note": ("Kimya katsayisi kaliteye gore kucuk: kalite kontrol "
                 "edilince kimyanin R2 katkisi ~0.001. Oyunda kimya bir "
                 "bulmaca hedefi; sonuc tahmininde belirleyici degil."),
    }
    OUT.write_text(json.dumps(coeffs, ensure_ascii=False, indent=1),
                   encoding="utf-8")

    print(f"{coeffs['n_rows']} XI / {coeffs['n_matches']} mac\n")
    for tgt, b, r2 in (("goals_for", b_for, r2_for),
                       ("goals_against", b_ag, r2_ag)):
        print(f"{tgt:14} R2={r2:.3f}  " +
              "  ".join(f"{n}{v:+.2f}" for n, v in zip(names, b)))
    print(f"\nPoisson kontrolu  ortalama {lam:.2f} / varyans {gf.var():.2f}")
    print(f"  gozlenen {obs}")
    print(f"  beklenen {exp_}")
    print(f"\n[OK] {OUT.name}")
    return coeffs


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    calibrate(ap.parse_args().season)
