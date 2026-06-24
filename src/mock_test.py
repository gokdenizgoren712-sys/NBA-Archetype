"""
Mock test: gerçek nba_api verisi YOK iken pipeline'ın çalıştığını kanıtlar.
Her oyuncuya, GERÇEK etiketindeki bileşenlere uygun sentetik metrikler enjekte eder
(+ gürültü), sonra motorun bu bileşenleri geri bulup bulamadığını ölçer.
"""
import numpy as np
import pandas as pd
import re, sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "config"))
from engine import predict_components, validate_components, jaccard_composite, optimize_thresholds
from signatures import COMPONENT_SIGNATURES

np.random.seed(7)

# 1) Ground truth: 40 oyuncunun etiketlerini bileşenlere ayır
df_tags = pd.read_excel('/mnt/project/nba_scouting_tags.xlsx', sheet_name='Top 41', header=1)
df_tags = df_tags.dropna(subset=['Oyuncu'])

COMP_LIST = ["Point-of-Attack","Three-Level","Off-Ball","Half-Court","Pick-and-Roll","3-and-D",
    "All-Around","Foul-Drawing","Pull-Up","Shotmaker","Shotmaking","Two-Way","Point-Center","Point-Forward",
    "Rim Runner","Rim-Running","Rim Running","Heliocentric","Jumbo","Downhill","Pressure","Scoring","Speed",
    "Versatile","Defensive","Gravity","Scalable","Stretch","Tempo","Switchable","Slashing","Playmaking",
    "Secondary","Connector","Engine","Ecosystem","Hub","Conductor","Creator","Fulcrum","Anchor","Spacer",
    "Finisher","Force","Initiator","Unicorn","Stopper","Guard","Wing","Forward","Big","Center"]

def parse(label):
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

ground_truth = {row['Oyuncu']: parse(row['Etiket']) for _, row in df_tags.iterrows()}

# Sadece imzası tanımlı bileşenleri test ediyoruz (config'de olanlar)
defined = set(COMPONENT_SIGNATURES.keys())
gt_defined = {p: (c & defined) for p, c in ground_truth.items()}

# 2) Mock metrik tablosu üret
#    Tüm metrikleri topla
all_metrics = sorted({m for c in COMPONENT_SIGNATURES.values() for m in c["metrics"]})
players = list(ground_truth.keys())
n = len(players)

# Taban: herkes için standart normal -> sonra persantile çevrilecek zaten
data = {m: np.random.normal(0, 1, n) for m in all_metrics}
mock = pd.DataFrame(data, index=range(n))
mock['PLAYER_NAME'] = players

# 3) Etikete uygun sinyal enjekte et: oyuncu bir bileşeni taşıyorsa,
#    o bileşenin metriklerini doğru yönde it (higher=True ise +, False ise -)
SIGNAL = 1.6  # sinyal gücü (gürültüye karşı)
for i, p in enumerate(players):
    for comp in gt_defined[p]:
        for m, spec in COMPONENT_SIGNATURES[comp]["metrics"].items():
            push = SIGNAL * spec["w"] * (1 if spec["higher"] else -1)
            mock.at[i, m] += push

# 4) Motoru çalıştır
scores, positives = predict_components(mock, only=list(defined))

# 5) Doğrula
val = validate_components(positives, gt_defined, mock['PLAYER_NAME'])
print("="*70)
print("KATMAN 1 — Bileşen doğrulama (mock veri, sinyal+gürültü)")
print("="*70)
print(val.to_string(index=False))

validatable = val[val['validatable']]
print(f"\nDoğrulanabilir bileşenler ortalama F1: {validatable['F1'].mean():.3f}")
print(f"(n_true>=2 olan {len(validatable)} bileşen üzerinden)")

jac = jaccard_composite(positives, gt_defined, mock['PLAYER_NAME'])
print("\n" + "="*70)
print("KATMAN 2 — Kompozit yeniden kurma (Jaccard) — ilk 12 oyuncu")
print("="*70)
print(jac.head(12)[['player','jaccard','exact']].to_string(index=False))
print(f"\nOrtalama Jaccard: {jac['jaccard'].mean():.3f}")
print(f"Tam eşleşme oranı: {jac['exact'].mean():.1%}")

# 6) EŞİK OPTİMİZASYONU: 40 oyuncudan F1-maksimize eden eşikleri öğren
print("\n" + "="*70)
print("EŞİK OPTİMİZASYONU — 'önce elle, sonra optimize' (optimize ayağı)")
print("="*70)
opt = optimize_thresholds(scores, gt_defined, mock['PLAYER_NAME'])

# optimize edilmiş eşiklerle pozitiflikleri yeniden hesapla
import numpy as _np
positives_opt = pd.DataFrame(index=mock.index)
for comp in scores.columns:
    if comp in opt:
        cut = _np.quantile(scores[comp], opt[comp]["percentile"])
        positives_opt[comp] = scores[comp] >= cut
    else:
        positives_opt[comp] = positives[comp]

val_opt = validate_components(positives_opt, gt_defined, mock['PLAYER_NAME'])
merged = val[['component','n_true','F1']].merge(
    val_opt[['component','F1']], on='component', suffixes=('_elle','_opt'))
merged['Δ'] = (merged['F1_opt'] - merged['F1_elle']).round(3)
print(merged[merged['n_true']>=2].to_string(index=False))
v2 = val_opt[val_opt['validatable']]
print(f"\nElle eşik ort. F1:      {validatable['F1'].mean():.3f}")
print(f"Optimize eşik ort. F1:  {v2['F1'].mean():.3f}")
print("\n[NOT] MOCK veride sinyal yapaydır; gerçek veride optimizasyon kazancı")
print("      daha anlamlı olur çünkü metrikler arası gerçek korelasyon vardır.")
