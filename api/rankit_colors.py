# -*- coding: utf-8 -*-
"""Yer tutucu kulup renkleri -- TEK KAYNAK.

Kaynakta gercek kulup rengi olmayan takimlar (FotMob lig/takim uclari ve
EuroLeague API'si renk vermiyor) bu paletten ada gore KARARLI bir renk alir.
Sahibin karari (2026-09-21): 12 renkli palet, "ilerleyen surecte duzenleriz".
Paleti degistirmek icin yalnizca CLUB_PALETTE'i duzenle; senkron
(src/rankit_sync.py) ve bir kerelik yeniden boyama (api/db.py) buradan okur.

Eski 6'li palet tasarimin altin (#FFB11B) ve `positive` (#3FB08C) token'larini
kulup rengi diye dagitiyordu: 1.023 futbol kulubunun 169'u altindi ve kartlarda
altin butcesini (BUILD §1.2) bozuyordu. Bu palet altin ailesini, `positive`i,
isi rampasini ve Primary Arch'in teal'ini (#00A3AF) bilerek disarida birakir;
sari da altinla karismasin diye yok. NBA takimlari gercek renklerini
(rankit_sync.NBA_COLORS) kullanir, bu palete dusmez.

Bagimliliksiz (yalnizca hashlib): api/db.py acilista bunu iceri aliyor.
"""
import hashlib

CLUB_PALETTE = (
    "#C8102E",  # kirmizi
    "#7A263A",  # bordo
    "#D86018",  # turuncu
    "#6B3E26",  # kahve
    "#5E7D2A",  # zeytin
    "#00843D",  # yesil
    "#1B4D3E",  # koyu yesil
    "#007A78",  # camgobegi
    "#6CABDD",  # gok mavisi
    "#0B3D91",  # kraliyet mavisi
    "#1D2D5C",  # lacivert
    "#592C82",  # mor
)

# Yalnizca eski uydurma renkleri TANIMAK icin; yeni renk uretmez.
_LEGACY_PALETTE = ("#FFB11B", "#3FB08C", "#7B61FF", "#D34E4E", "#1D78B5", "#C65FA5")


def _pick(palette, name: str) -> str:
    return palette[int(hashlib.md5(name.encode("utf-8")).hexdigest()[:4], 16) % len(palette)]


def club_color(name: str) -> str:
    """Ada gore kararli yer tutucu renk: ayni kulup her senkronda ayni rengi alir."""
    return _pick(CLUB_PALETTE, name)


def legacy_club_color(name: str) -> str:
    """Eski 6'li paletin bu ada verdigi renk. Uydurma rengi tanimak icin."""
    return _pick(_LEGACY_PALETTE, name)
