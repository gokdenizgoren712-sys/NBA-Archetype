# -*- coding: utf-8 -*-
"""Arketip kalibrasyonu — ground truth'a karşı sapma öğrenme.

NE YAPIYOR
──────────
Her arketip için tek bir SAPMA (bias) öğrenir: score'_a = score_a + b_a.
argmax bu düzeltilmiş skorlar üzerinden alınır.

NEDEN METRİK AĞIRLIKLARINI DEĞİL
─────────────────────────────────
24 arketipte ~190 metrik ağırlığı var, elimizde 46 eğitim örneği. O uzayı
aramak ezberlemekten başka bir şey üretmez. Ölçümün gösterdiği sorun zaten
ağırlıkların iç dağılımı değil, arketiplerin BİRBİRİNE GÖRE SEVİYESİ:
kalecide Distributor herkeste yüksek çıkıp Shot Stopper'ı eziyor, orta sahada
Regista/Metronome, Anchor/Box-to-Box'ı eziyordu. Tek sapma bunu düzeltir ve
24 parametreyle sınırlı kalır.

AŞIRI UYUM RİSKİ HÂLÂ VAR: 46 örnek / 24 parametre. Bu yüzden
  (a) sapmalar L2 ile 0'a doğru cezalanır (LAMBDA),
  (b) aralık dar tutulur (BIAS_MAX),
  (c) TEST skoru ayrı raporlanır ve KARAR ONA GÖRE VERİLİR.
TRAIN skorunun iyileşmesi tek başına hiçbir şey ifade etmez.

SONUÇ (2026-08, kaleci etiketleri kör kart setine çevrildikten sonra)
────────────────────────────────────────────────────────────────────
    KALİBRASYONSUZ   train 57.4%   test 65.2%
    KALİBRE EDİLMİŞ  train 72.3%   test 60.9%   <-- TEST 4.3 PUAN DÜŞTÜ

Sapma öğrenmek ezberden ibaret çıktı: TRAIN 15 puan artarken TEST düşüyor.
KARAR: kalibrasyon ÜRETİME ALINMADI. Bu betik bir deney kaydı olarak duruyor
ve üretim yoluna hiçbir şey yazmıyor. 47 örnekle 24 parametrelik bir uzay
aranamaz; bunu değiştirecek olan daha fazla ETİKET, daha akıllı arama değil.
"""

from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "config"))

from football_signatures import PHASES, signatures_for, archetypes_for  # noqa: E402

BIAS_MAX = 0.20      # sapma bu aralığın dışına çıkamaz
BIAS_STEP = 0.02
LAMBDA = 0.35        # L2 cezası — büyük sapmaları caydırır
SPLIT_PATH = DATA / "football__gt_split.json"
REPORT_PATH = DATA / "football__calibration_report.json"


def fold(s):
    s = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


BLIND_GK_PATH = DATA / "football__gt_gk_blind.csv"


def load_blind_gk() -> dict:
    """İsim GİZLİYKEN verilmiş kaleci etiketleri.

    NEDEN AYRI BİR KAYNAK
    ─────────────────────
    Formdaki kaleci etiketleri oyuncunun ADI görünürken verildi ve ölçüldüğünde
    bu sezonun sayılarını değil oyuncunun NAMINI yansıttığı ortaya çıktı:
    aynı 27 kaleci isimsiz stat kartından yeniden etiketlenince cevapların
    yarısından fazlası (14/27) değişti, Distributor 2'den 10'a çıktı. Sistemin
    isabeti de tersine döndü — isimli etiketlere karşı %33 (çoğunluk tabanı
    %59, yani tabandan KÖTÜ), kör etiketlere karşı %56 (taban %48).

    Bu yüzden kaleci fazında ground truth artık form değil bu dosya. Diğer üç
    faz formdan gelmeye devam ediyor; oralarda böyle bir sapma ölçülmedi ve
    sözlük zaten tabanın çok üstünde (def %79 vs %39, mid %55 vs %21,
    fwd %56 vs %22).
    """
    if not BLIND_GK_PATH.exists():
        return {}
    d = pd.read_csv(BLIND_GK_PATH)
    out = {}
    for r in d.itertuples():
        labs = {x.strip() for x in str(r.truth).split("/") if x.strip()}
        if labs:
            out[fold(r.player)] = labs
    return out


def load_truth(form_path: Path, season="2025-2026", blind_gk=True):
    """Form yanıtları -> [{name, phase, truth:set, scores:{arch: val}}]

    blind_gk=True ise kaleci etiketleri formdan DEĞİL kör kart setinden
    gelir (bkz. load_blind_gk).
    """
    DK = "I don't know this player"
    NONE_FIT = "None of these fit"
    ans = pd.read_excel(form_path, sheet_name=0).iloc[0]

    labels = {}
    for col, v in ans.items():
        if col == "Zaman damgası" or pd.isna(v):
            continue
        parts = [p.strip() for p in str(v).split(",") if p.strip()]
        parts = [p for p in parts
                 if not p.startswith(DK) and not p.startswith(NONE_FIT)]
        if parts:
            labels[fold(col)] = set(parts)

    blind = load_blind_gk() if blind_gk else {}

    sc = pd.read_parquet(DATA / f"football__{season}__scores.parquet")
    sc = sc[sc.primary_arch.notna()].copy()
    sc["_k"] = sc.PLAYER_NAME.map(fold)

    out = []
    for k, truth in labels.items():
        hit = sc[sc._k == k]
        if hit.empty:
            continue
        r = hit.nlargest(1, "MINUTES_PHASE").iloc[0]
        ph = r.PHASE
        if ph == "gk" and k in blind:
            truth = blind[k]          # nam değil, sayılara bakarak verilmiş
        sigs = signatures_for(ph)
        scores = {}
        for a in archetypes_for(ph):
            v = r.get(f"score_{a}")
            if v is None or pd.isna(v):
                continue
            allowed = sigs[a].get("positions") or ()
            if allowed and r.POSITION not in allowed:
                continue            # pozisyon maskesi — aday değil
            scores[a] = float(v)
        if len(scores) < 2:
            continue
        out.append({"name": r.PLAYER_NAME, "phase": ph,
                    "truth": truth, "scores": scores})
    return out


def make_split(items, train_frac=0.40, seed=17):
    """Faz içinde tabakalı bölme — her fazın hem TRAIN'de hem TEST'te temsili olsun."""
    rng = np.random.default_rng(seed)
    split = {}
    for ph in PHASES:
        idx = [i for i, it in enumerate(items) if it["phase"] == ph]
        rng.shuffle(idx)
        n_tr = int(round(len(idx) * train_frac))
        for j, i in enumerate(idx):
            split[items[i]["name"]] = "TRAIN" if j < n_tr else "TEST"
    return split


def predict(item, bias):
    best, bv = None, -9
    for a, v in item["scores"].items():
        s = v + bias.get(a, 0.0)
        if s > bv:
            best, bv = a, s
    return best


def accuracy(items, bias):
    if not items:
        return 0.0
    return float(np.mean([predict(it, bias) in it["truth"] for it in items]))


def objective(items, bias):
    pen = LAMBDA * sum(b * b for b in bias.values())
    return accuracy(items, bias) - pen


def tune(train, seed=0, rounds=25):
    """Koordinat yükselişi: her arketibin sapmasını sırayla tara."""
    rng = np.random.default_rng(seed)
    archs = sorted({a for it in train for a in it["scores"]})
    bias = {a: 0.0 for a in archs}
    best = objective(train, bias)
    grid = np.arange(-BIAS_MAX, BIAS_MAX + 1e-9, BIAS_STEP)

    for _ in range(rounds):
        improved = False
        order = list(archs)
        rng.shuffle(order)
        for a in order:
            cur = bias[a]
            for g in grid:
                if abs(g - cur) < 1e-9:
                    continue
                bias[a] = float(g)
                v = objective(train, bias)
                if v > best + 1e-9:
                    best, cur, improved = v, float(g), True
            bias[a] = cur
        if not improved:
            break
    return bias, best


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--form", required=True)
    ap.add_argument("--season", default="2025-2026")
    ap.add_argument("--train-frac", type=float, default=0.40)
    ap.add_argument("--seed", type=int, default=17)
    args = ap.parse_args()

    items = load_truth(Path(args.form), args.season)
    print(f"skorlanabilir etiket: {len(items)}")

    if SPLIT_PATH.exists():
        split = json.loads(SPLIT_PATH.read_text(encoding="utf-8"))
        print(f"mevcut bölme kullanıldı ({SPLIT_PATH.name})")
    else:
        split = make_split(items, args.train_frac, args.seed)
        SPLIT_PATH.write_text(json.dumps(split, ensure_ascii=False, indent=1),
                              encoding="utf-8")
        print(f"yeni bölme yazıldı ({SPLIT_PATH.name})")

    train = [it for it in items if split.get(it["name"]) == "TRAIN"]
    test = [it for it in items if split.get(it["name"]) == "TEST"]
    print(f"TRAIN {len(train)} · TEST {len(test)}")
    print()

    base_tr, base_te = accuracy(train, {}), accuracy(test, {})
    print(f"KALİBRASYONSUZ   train {base_tr*100:5.1f}%   test {base_te*100:5.1f}%")

    bias, _ = tune(train, seed=args.seed)
    tr, te = accuracy(train, bias), accuracy(test, bias)
    print(f"KALİBRE EDİLMİŞ  train {tr*100:5.1f}%   test {te*100:5.1f}%")
    print()
    print(f"TEST DEĞİŞİMİ: {(te-base_te)*100:+.1f} puan   <-- KARAR BUNA GÖRE")
    print()

    print("faz bazlı TEST:")
    for ph in PHASES:
        g = [it for it in test if it["phase"] == ph]
        if not g:
            continue
        b0, b1 = accuracy(g, {}), accuracy(g, bias)
        print(f"  {ph:5}{len(g):>3} oyuncu   {b0*100:5.1f}% -> {b1*100:5.1f}%"
              f"   ({(b1-b0)*100:+.1f})")
    print()
    print("öğrenilen sapmalar (sıfırdan farklı olanlar):")
    for a, b in sorted(bias.items(), key=lambda x: -abs(x[1])):
        if abs(b) > 1e-9:
            print(f"   {b:+.2f}  {a}")

    # URETIME DOSYA YAZILMIYOR — bkz. modul docstring'i. Sapmalar TEST'i
    # dusuruyor; yazilan bir bias.json ileride yanlislikla baglanirsa sistemi
    # bozar. Sonucu yalnizca rapor olarak birakiyoruz.
    verdict = ("KALIBRASYON ISE YARIYOR" if te > base_te
               else "KALIBRASYON ISE YARAMIYOR")
    REPORT_PATH.write_text(json.dumps({
        "verdict": verdict,
        "train_before": round(base_tr, 4), "train_after": round(tr, 4),
        "test_before": round(base_te, 4), "test_after": round(te, 4),
        "test_delta": round(te - base_te, 4),
        "n_train": len(train), "n_test": len(test),
        "learned_bias_NOT_applied": {a: round(b, 3)
                                     for a, b in bias.items() if abs(b) > 1e-9},
        "note": ("Sapmalar UYGULANMIYOR. TEST skoru dustugu icin kalibrasyon "
                 "reddedildi; dosya yalnizca kaydi tutuyor."),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print()
    print(f">>> {verdict} — uretime alinmadi")
    print(f"[OK] {REPORT_PATH.name} (yalnizca rapor)")


if __name__ == "__main__":
    main()
