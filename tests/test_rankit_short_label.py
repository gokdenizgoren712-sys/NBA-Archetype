# -*- coding: utf-8 -*-
"""_short_label must never hand out a mid-word cut.

Neden bu test var
------------------
`sync_football`/`sync_euroleague`, sağlayıcı bir kısa ad vermediğinde eskiden
`name[:12]` yapıyordu — kelimenin ortasından kesen kör bir dilim:
"Crystal Palace" -> "Crystal Pala", "FC Milsami Orhei" -> "FC Milsami O",
"Real Sociedad" -> "Real Socieda". Bunların hiçbiri kart sütununu TAŞMIYOR
(12 karakter genelde sığıyor), yani CSS'teki ellipsis hiç devreye girmiyor —
bozuk hâl olduğu gibi gidiyor ve yazım hatası gibi okunuyor. Canlı veride
doğrulandı: 350 takımın short_name'i bu kalıptaydı.

Bu test, düzeltmenin gerçekten kelime sınırında kestiğini ve sağlayıcının
kendi kısa adına hiç dokunmadığını sabitliyor.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from rankit_sync import _short_label  # noqa: E402


def test_provider_short_name_is_never_touched():
    """Sağlayıcının kendi editoryal kararı — kısa da olsa, tuhaf da olsa aynen kullanılır."""
    assert _short_label("Ars", "Arsenal") == "Ars"
    assert _short_label("Nottm Forest", "Nottingham Forest") == "Nottm Forest"


def test_fallback_never_cuts_mid_word():
    """Sağlayıcı kısa ad vermediğinde, sonuç HER ZAMAN gerçek bir kelime/öbek olmalı."""
    cases = {
        "Crystal Palace": "Crystal Palace",         # 14 karakter, limitin altında -> tam ad
        "Real Sociedad": "Real Sociedad",           # 13 karakter -> tam ad
        "FC Milsami Orhei": "FC Milsami Orhei",     # tam 16 karakter -> tam ad
        "Bayern München": "Bayern München",         # 14 karakter (aksan dahil) -> tam ad
        "Real Betis Balompie": "Real Betis",        # 19 karakter -> son kelime sınırı (16 içinde)
        "Union St.Gilloise": "Union St.Gillois",    # 17 karakter, erken boşluk yok -> sert kesim
    }
    for name, expected in cases.items():
        got = _short_label(None, name)
        assert got == expected, f"{name!r} -> {got!r}, beklenen {expected!r}"


def test_fallback_falls_back_to_hard_cut_when_no_early_boundary():
    """Tek uzun kelime/tirelenmiş isimde erken boşluk yoksa, limitte sert kesim olur
    — ve bu durumda kart sütununun CSS ellipsis'i devreye girer, veri katmanı değil."""
    got = _short_label(None, "Savigneux-Montbrison")
    assert len(got) == 16
    assert got == "Savigneux-Montbr"


def test_short_or_empty_names_pass_through():
    assert _short_label(None, "Como") == "Como"
    assert _short_label(None, "") == ""
    assert _short_label("", "Como") == "Como"
