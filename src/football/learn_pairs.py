# -*- coding: utf-8 -*-
"""Arketip-çifti değerlerini TAKIM-İÇİ artıktan öğrenir.

SORUN
─────
lineup_fit'in `pairs` bileşeni (skorun %30'u) config/football_roles.py'deki
ELLE YAZILMIŞ önselden geliyordu. Ölçüldüğünde şu çıktı:

    pairs ~ gol farkı   kulüpler arası +0.236   takım içi +0.013

Yani çiftler sinerjiyi değil TAKIM KİMLİĞİNİ ölçüyordu: Barcelona'nın arketip
çiftleri "uyumlu" görünüyordu çünkü Barcelona kazanıyordu, çiftler uyumlu
olduğu için değil. Site "arketip uyumu" iddiasında olduğuna göre bunun
düzeltilmesi kozmetik değil, iddianın kendisiyle ilgili.

YÖNTEM
──────
Her XI için gol farkını AYNI KULÜBÜN ortalamasından sapma olarak alıyoruz
(sabit etki: kulüp kimliği tanım gereği eleniyor), sonra kadro kalitesinin
sapmasını da regresyonla çıkarıyoruz. Kalan artık = "bu kulüp, bu kalitedeki
kadroyla beklenenden ne kadar iyi/kötü oynadı". Bir arketip çifti sahadayken
bu artık sistematik olarak pozitifse, o çift gerçekten bir şey katıyordur.

AŞIRI UYUM KORUMASI
───────────────────
24 arketip -> 276 çift, elimizde ~1800 XI. Ezberlemek çok kolay. Bu yüzden
  (a) maç bazında TRAIN/TEST bölünüyor, karar TEST'e göre veriliyor,
  (b) az gözlenen çiftler (MIN_N altı) hiç öğrenilmiyor, 0 kalıyor,
  (c) her çiftin değeri gözlem sayısına göre 0'a doğru büzülüyor
      (shrinkage) — 12 maçlık bir çift 200 maçlık bir çift kadar
      güvenilir değil.
"""

from __future__ import annotations

import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"

MIN_N = 25          # bu sayıdan az görülen çift öğrenilmez
SHRINK_K = 60       # büzülme yarı-ömrü: n=60'ta değer yarıya iner
TRAIN_FRAC = 0.6
SEED = 17


# lineup_fit kaleciyi hesaba KATMIYOR. Çift tablosunu kaleci arketipleriyle
# öğrenmek, üretimde hiç kullanılmayacak bir şeyi ölçmek olur.
GK_ARCHS = {"Shot Stopper", "Sweeper Keeper", "Distributor", "Command of Area"}


def load(season="2025-2026", min_known=10):
    p = DATA / f"football__{season}__real_xi.parquet"
    d = pd.read_parquet(p)
    d = d[d.known_players >= min_known].copy()
    d["archs"] = d.archetypes.map(
        lambda s: [a for a in json.loads(s) if a not in GK_ARCHS])
    return d


def residuals(d):
    """Kulüp sabit etkisi + kadro kalitesi çıkarılmış gol farkı."""
    for c in ("goal_diff", "avg_quality"):
        d["d_" + c] = d[c] - d.groupby("team")[c].transform("mean")
    X = np.column_stack([np.ones(len(d)), d.d_avg_quality])
    b, *_ = np.linalg.lstsq(X, d.d_goal_diff, rcond=None)
    d["resid"] = d.d_goal_diff - X @ b
    return d


def pair_keys(archs):
    """XI'deki benzersiz arketip çiftleri (aynı çift iki kez sayılmaz)."""
    return {tuple(sorted(p)) for p in combinations(sorted(set(archs)), 2)}


def learn(train):
    """Çift -> (ham ortalama artık, n, büzülmüş değer)."""
    acc, cnt = {}, {}
    for r in train.itertuples():
        for k in pair_keys(r.archs):
            acc[k] = acc.get(k, 0.0) + r.resid
            cnt[k] = cnt.get(k, 0) + 1
    out = {}
    for k, n in cnt.items():
        if n < MIN_N:
            continue
        raw = acc[k] / n
        out[k] = {"raw": raw, "n": n, "value": raw * n / (n + SHRINK_K)}
    return out


def score_xi(archs, table):
    """Öğrenilmiş çift değerlerinin ortalaması — bilinmeyen çift 0."""
    ks = pair_keys(archs)
    if not ks:
        return 0.0
    vals = [table.get(k, {}).get("value", 0.0) for k in ks]
    return float(np.mean(vals))


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    args = ap.parse_args()

    d = residuals(load(args.season))
    rng = np.random.default_rng(SEED)
    # np.asarray(dtype=object): match_id ArrowStringArray geliyor, doğrudan
    # shuffle etmek uyarı veriyor ve kopya üretebiliyor — bölünmeyi bozar.
    mids = np.asarray(d.match_id.unique(), dtype=object)
    rng.shuffle(mids)
    assert len(set(mids)) == len(mids), "bolunme bozuk: tekrarli match_id"
    tr_ids = set(mids[: int(len(mids) * TRAIN_FRAC)])
    train = d[d.match_id.isin(tr_ids)]
    test = d[~d.match_id.isin(tr_ids)]
    print(f"TRAIN {len(train)} XI · TEST {len(test)} XI")

    table = learn(train)
    print(f"ogrenilen cift: {len(table)} (>= {MIN_N} gozlem)\n")

    # ── KARAR TESTE GORE ────────────────────────────────────────────────────
    test = test.copy()
    test["learned"] = [score_xi(a, table) for a in test.archs]
    r_learned = test[["learned", "resid"]].corr().iloc[0, 1]
    r_prior = test[["pairs", "resid"]].corr().iloc[0, 1]
    r_slots = test[["slots", "resid"]].corr().iloc[0, 1]
    r_div = test[["diversity", "resid"]].corr().iloc[0, 1]

    print("TEST kumesinde artikla korelasyon (kulup + kalite kontrol edilmis):")
    print(f"  ogrenilen cift degeri   {r_learned:+.4f}   <-- yeni")
    print(f"  mevcut 'pairs' onseli   {r_prior:+.4f}")
    print(f"  slots                   {r_slots:+.4f}")
    print(f"  diversity               {r_div:+.4f}")

    # TRAIN'de ne kadar iyi görünüyor? Fark = ezber payı.
    train = train.copy()
    train["learned"] = [score_xi(a, table) for a in train.archs]
    r_tr = train[["learned", "resid"]].corr().iloc[0, 1]
    print(f"\n  (TRAIN'de {r_tr:+.4f} — TEST ile arasindaki fark ezber payi)")

    vals = sorted(table.items(), key=lambda kv: -kv[1]["value"])
    print("\nen iyi 6 cift:")
    for k, v in vals[:6]:
        print(f"  {v['value']:+.3f}  n={v['n']:>4}  {k[0]} + {k[1]}")
    print("en kotu 6 cift:")
    for k, v in vals[-6:]:
        print(f"  {v['value']:+.3f}  n={v['n']:>4}  {k[0]} + {k[1]}")

    out = DATA / f"football__{args.season}__pair_values.json"
    out.write_text(json.dumps(
        {"season": args.season, "min_n": MIN_N, "shrink_k": SHRINK_K,
         "train_frac": TRAIN_FRAC, "test_r": round(float(r_learned), 4),
         "train_r": round(float(r_tr), 4),
         "pairs": {f"{k[0]}|{k[1]}": round(v["value"], 4) for k, v in table.items()},
         "n": {f"{k[0]}|{k[1]}": v["n"] for k, v in table.items()}},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n[OK] {out.name}")


if __name__ == "__main__":
    main()
