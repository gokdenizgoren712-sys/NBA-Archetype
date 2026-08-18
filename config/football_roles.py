# -*- coding: utf-8 -*-
"""Futbol takım kurgusu — fonksiyonel roller ve arketip uyum önseli.

BASKETBOLDAN AYRI. config/roles.py'nin futbol karşılığı ama içeriği tamamen
farklı: orada 11 slot basketbol işlevlerinden (spacing, rim protection…),
burada 8 slot futbol işlevlerinden türetiliyor.

BİR FUTBOL XI'İ NEDEN BASKETBOL LINEUP'INDAN FARKLI
────────────────────────────────────────────────────
1. 10 saha oyuncusu + kaleci. Kaleci uyum hesabına GİRMEZ (kullanıcı kararı):
   kalecinin rolü diğer onla etkileşmiyor, kendi başına değerlendirilir.
2. ŞEKİL zorunlu. Basketbolda beş oyuncu herhangi bir dizilimde olabilir;
   futbolda 10 oyuncu geçerli bir dizilişe bölünmek zorunda (savunma hattı
   3-5, orta saha 2-5, hücum 1-3). Bir XI'i "10 iyi oyuncu" diye seçemezsin.
3. GENİŞLİK futbola özgü bir boyut. Basketbolda spacing'in karşılığı gibi
   görünür ama değil: spacing herkesin şut atabilmesi, genişlik ise sahanın
   dış koridorlarını FİZİKSEL olarak işgal etmek. On tane Inside Forward'lı
   takım dar kalır ve savunulması kolaylaşır — kalitesi yüksek olsa bile.

AFFINITY MATRİSİ — İKİ KAYNAK
──────────────────────────────
AFFINITY_PRIOR: elle yazılmış önsel (aşağıda). Futbol bilgisine dayanır,
hiçbir veriye karşı sınanmadı. config/roles.py'deki basketbol matrisiyle
aynı statüde: SABİT kalır, sezona özel ampirik veriyle global olarak
GÜNCELLENMEZ.

Ampirik matris ise src/football/affinity.py tarafından gerçek maç
sonuçlarından üretilir (cache'teki ilk 11'ler + skorlar) ve yalnızca onu
üreten sezon/lige ait çağrılarda AÇIKÇA parametre olarak geçirilir.
Basketbol tarafındaki aynı ayrım, aynı gerekçe.
"""

from __future__ import annotations

# ── 8 fonksiyonel slot ───────────────────────────────────────────────────────
# Her slot "bir takımın ihtiyaç duyduğu iş"i temsil eder; birden fazla arketip
# aynı işi farklı biçimde yapabilir, ağırlık o biçimin işe uygunluğudur.
ROLE_SLOTS = {
    "Build-up": {          # topu arkadan çıkarmak
        "Ball-Playing CB": 1.00, "Inverted Fullback": 0.85, "Regista": 0.95,
        "Metronome": 0.90, "Distributor": 0.70, "Sweeper Keeper": 0.45,
        "Anchor": 0.55,
    },
    "Progression": {       # topu son üçe taşımak
        "Regista": 1.00, "Mezzala": 0.85, "Ball-Playing CB": 0.70,
        "Box-to-Box": 0.65, "Take-On Merchant": 0.75, "Creator": 0.70,
        "Metronome": 0.55,
    },
    "Chance creation": {   # son pas
        "Creator": 1.00, "Mezzala": 0.85, "Touchline Winger": 0.80,
        "Overlapping Fullback": 0.70, "Complete Forward": 0.70,
        "Regista": 0.50, "Inside Forward": 0.45,
    },
    "Finishing": {         # golü atmak
        "Poacher": 1.00, "Complete Forward": 0.95, "Inside Forward": 0.85,
        "Target Man": 0.75, "Late Runner": 0.70, "Creator": 0.40,
    },
    "Width": {             # kanat koridorlarını işgal etmek
        "Touchline Winger": 1.00, "Overlapping Fullback": 0.90,
        "Take-On Merchant": 0.60, "Inside Forward": 0.35,
    },
    "Pressing": {          # topsuz baskı
        "Pressing Forward": 1.00, "Ball-Winner": 0.90, "Box-to-Box": 0.70,
        "Stopper": 0.45, "Defensive Fullback": 0.45,
    },
    "Defensive solidity": {  # savunma sağlamlığı
        "Stopper": 1.00, "Defensive Fullback": 0.85, "Anchor": 0.90,
        "Ball-Winner": 0.70, "Ball-Playing CB": 0.60, "Inverted Fullback": 0.50,
    },
    "Aerial presence": {   # duran top ve havada varlık (iki uçta birden)
        "Target Man": 1.00, "Stopper": 0.95, "Anchor": 0.55,
        "Complete Forward": 0.40, "Defensive Fullback": 0.35,
    },
}

# ── Diziliş kısıtı ───────────────────────────────────────────────────────────
# 10 saha oyuncusu geçerli bir şekle bölünmeli. Yaygın dizilişlerin faz
# dağılımı (savunma, orta saha, hücum) — kullanıcının faz tanımıyla uyumlu:
# kanatlar ve saf 10 numaralar HÜCUM, kanat bekler SAVUNMA sayılır.
VALID_SHAPES = {
    "4-3-3":   {"def": 4, "mid": 3, "fwd": 3},
    "4-2-3-1": {"def": 4, "mid": 2, "fwd": 4},
    "4-4-2":   {"def": 4, "mid": 2, "fwd": 4},
    "3-5-2":   {"def": 5, "mid": 3, "fwd": 2},
    "3-4-2-1": {"def": 5, "mid": 2, "fwd": 3},
    "4-1-4-1": {"def": 4, "mid": 3, "fwd": 3},
    "5-3-2":   {"def": 5, "mid": 3, "fwd": 2},
    "4-4-1-1": {"def": 4, "mid": 2, "fwd": 4},
}

# ── Arketip-arketip uyum ÖNSELİ ──────────────────────────────────────────────
# Sadece SIFIRDAN FARKLI çiftler yazılıdır; geri kalan her çift nötr (0.0).
# Pozitif = birbirini tamamlar, negatif = birbirinin işini tekrarlar veya
# aynı boşluğu bırakır. Aralık kabaca [-0.35, +0.35].
#
# UYARI: bunların hiçbiri ölçülmedi. Futbol sezgisinden yazıldı ve ampirik
# matris hazır olunca yerini ona bırakacak. Frontend'de "prior" olarak
# etiketlenmeli, ölçülmüş bir şey gibi sunulmamalı.
_PAIRS = {
    # ── Tamamlayıcılar
    ("Ball-Playing CB", "Anchor"): 0.22,           # arkadan çıkışa perde
    ("Ball-Playing CB", "Regista"): 0.20,
    ("Regista", "Ball-Winner"): 0.30,              # kuran + koruyan klasiği
    ("Metronome", "Ball-Winner"): 0.26,
    ("Regista", "Late Runner"): 0.24,              # derinden atan + koşan
    ("Metronome", "Mezzala"): 0.20,
    ("Creator", "Poacher"): 0.34,                  # veren + bitiren
    ("Creator", "Target Man"): 0.24,
    ("Mezzala", "Poacher"): 0.26,
    ("Touchline Winger", "Target Man"): 0.32,      # orta + kafa
    ("Touchline Winger", "Poacher"): 0.22,
    ("Overlapping Fullback", "Inside Forward"): 0.30,   # bek dışarı, kanat içeri
    ("Inverted Fullback", "Touchline Winger"): 0.28,    # bek içeri, kanat dışarı
    ("Overlapping Fullback", "Anchor"): 0.18,      # bindiren bekin arkasını kapatan
    ("Stopper", "Ball-Playing CB"): 0.28,          # mücadeleci + kuran ikili
    ("Stopper", "Sweeper Keeper"): 0.16,
    ("Pressing Forward", "Ball-Winner"): 0.24,     # baskı zinciri
    ("Pressing Forward", "Front-Foot"): 0.0,       # (rol kaldırıldı, yer tutucu)
    ("Take-On Merchant", "Late Runner"): 0.20,     # çalım + arkadan gelen koşu
    ("Box-to-Box", "Anchor"): 0.22,
    ("Complete Forward", "Touchline Winger"): 0.18,
    ("Defensive Fullback", "Touchline Winger"): 0.20,   # savunan bek + hücum eden kanat
    ("Sweeper Keeper", "Ball-Playing CB"): 0.20,   # yüksek hat

    # ── Çakışanlar / aynı boşluğu bırakanlar
    ("Overlapping Fullback", "Touchline Winger"): -0.24,  # aynı koridorda iki kişi
    ("Inverted Fullback", "Regista"): -0.20,              # ikisi de merkeze gelir
    ("Inverted Fullback", "Metronome"): -0.18,
    ("Regista", "Metronome"): -0.26,                      # aynı işi yapan iki derin kurucu
    ("Poacher", "Target Man"): -0.16,                     # iki sabit dokuz
    ("Inside Forward", "Inside Forward"): -0.22,          # genişlik kalmaz
    ("Take-On Merchant", "Take-On Merchant"): -0.20,
    ("Creator", "Creator"): -0.14,
    ("Anchor", "Anchor"): -0.24,
    ("Ball-Winner", "Ball-Winner"): -0.12,
    ("Overlapping Fullback", "Overlapping Fullback"): -0.10,  # iki bek bindirirse arka açık
    ("Stopper", "Stopper"): 0.10,                         # stoper ikilisi normaldir
    ("Defensive Fullback", "Defensive Fullback"): -0.14,  # hücumda genişlik yok
    ("Pressing Forward", "Pressing Forward"): -0.10,
}


def affinity_prior(a: str, b: str) -> float:
    """İki arketip arasındaki elle-yazılmış uyum önseli (simetrik)."""
    return _PAIRS.get((a, b), _PAIRS.get((b, a), 0.0))


def slot_strength(archetype: str, slot: str) -> float:
    """Bir arketibin bir fonksiyonel slotu doldurma gücü [0..1]."""
    return ROLE_SLOTS.get(slot, {}).get(archetype, 0.0)


def shape_of(counts: dict) -> str | None:
    """Faz sayımı geçerli bir dizilişe uyuyor mu? Uyuyorsa adını döner."""
    for name, need in VALID_SHAPES.items():
        if all(counts.get(k, 0) == v for k, v in need.items()):
            return name
    return None
