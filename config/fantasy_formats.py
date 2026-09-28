# -*- coding: utf-8 -*-
"""Basketbol fantezi lig formatları — Yahoo varsayılanları + özel ligler için şema.

Bu dosya fantezi modülünün TEK KURAL KAYNAĞI: skor ağırlıkları, kategoriler,
kadro slotları ve slot→pozisyon uygunluğu burada tanımlı. Arketip skorlarıyla
(`overall_score`, persantil tabanlı) KARIŞTIRILMAMALI — fantezi puanı ham
istatistik üzerinden hesaplanır (bkz. docs/fantasy-scoring-backend-report.md §2).

Kaynaklar (2026-09-28'de doğrulandı):
  - Yahoo Help SLN6919 "Default league settings": kadro, H2H Points ağırlıkları,
    9-cat kategoriler, playoff 20-22. hafta / 6 takım, 10 (public) ya da 12
    (private) takım.
  - NBA.com "How to play Yahoo High Score": PTS 1 / REB 1 / AST 2 / BLK 3 /
    STL 3, TO yok; 6 starter, 10 kişilik kadro, kadro haftada bir kurulur,
    her starter'ın haftadaki EN İYİ TEK maçı sayılır.
    → High Score slot isimleri ("Guard", "Frontcourt", "FLEX/UTIL") ikincil
      kaynaktan geliyor; ilk canlı ligde Yahoo ekranından teyit edilmeli.

Pozisyon kodları Yahoo'nunkiyle aynı: PG, SG, SF, PF, C. Oyuncunun hangi
kodlara uygun olduğu src/fantasy/positions.py'de üretilir.
"""

from __future__ import annotations

from copy import deepcopy

POSITIONS = ("PG", "SG", "SF", "PF", "C")

# Slot → bu slota konabilecek pozisyonlar. Yedek (BN) ve IL her oyuncuyu alır
# ama skor üretmez; ayrı tutuluyor ki kadro optimizasyonu onları saymasın.
SLOT_ELIGIBILITY = {
    "PG":   ("PG",),
    "SG":   ("SG",),
    "G":    ("PG", "SG"),
    "SF":   ("SF",),
    "PF":   ("PF",),
    "F":    ("SF", "PF"),
    "C":    ("C",),
    "Util": POSITIONS,
    # High Score'un sadeleştirilmiş slotları
    "FC":   ("SF", "PF", "C"),
    "BN":   POSITIONS,
    "IL":   POSITIONS,
}
NON_SCORING_SLOTS = ("BN", "IL")

# Kategori tanımı: stat anahtarı, yön (+1 büyük iyi, -1 küçük iyi) ve
# yüzde kategorilerinde pay/payda. Yüzdeler ORTALAMA ALINARAK değil, toplam
# isabet / toplam deneme olarak birleşir — büyük hacimli bir oyuncunun FG%'si
# takım FG%'sini düşük hacimliden daha çok etkiler.
CATEGORIES = {
    "FG%": {"direction": 1, "ratio": ("FGM", "FGA")},
    "FT%": {"direction": 1, "ratio": ("FTM", "FTA")},
    "3PM": {"direction": 1, "stat": "FG3M"},
    "PTS": {"direction": 1, "stat": "PTS"},
    "REB": {"direction": 1, "stat": "REB"},
    "AST": {"direction": 1, "stat": "AST"},
    "STL": {"direction": 1, "stat": "STL"},
    "BLK": {"direction": 1, "stat": "BLK"},
    "TO":  {"direction": -1, "stat": "TOV"},
}

_YAHOO_ROSTER = {
    "starters": ["PG", "SG", "G", "SF", "PF", "F", "C", "C", "Util", "Util"],
    "bench": 3,
    "il": 3,
}

_YAHOO_COMMON = {
    "teams": 12,               # private/prize lig varsayılanı; public 10
    "draft": "snake",
    "lineup_cadence": "daily",
    "regular_season_weeks": 19,
    "playoff_weeks": (20, 21, 22),
    "playoff_teams": 6,
    "max_weekly_adds": 4,
}

FORMATS = {
    "yahoo_h2h_9cat": {
        "label": "H2H 9-Cat (Yahoo default)",
        "kind": "categories",
        "matchup": "h2h",
        "categories": ["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"],
        "roster": _YAHOO_ROSTER,
        **_YAHOO_COMMON,
    },
    # Yaygın varyant: top kaybı sayılmaz. Yahoo'da varsayılan değil ama çok
    # sayıda lig bunu seçiyor, o yüzden hazır ön ayar olarak var.
    "yahoo_h2h_8cat": {
        "label": "H2H 8-Cat (no turnovers)",
        "kind": "categories",
        "matchup": "h2h",
        "categories": ["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK"],
        "roster": _YAHOO_ROSTER,
        **_YAHOO_COMMON,
    },
    "yahoo_roto_9cat": {
        "label": "Rotisserie 9-Cat",
        "kind": "categories",
        "matchup": "roto",
        "categories": ["FG%", "FT%", "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO"],
        "roster": _YAHOO_ROSTER,
        **_YAHOO_COMMON,
    },
    "yahoo_h2h_points": {
        "label": "H2H Points (Yahoo default)",
        "kind": "points",
        "matchup": "h2h",
        "weights": {"PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0},
        "roster": _YAHOO_ROSTER,
        **_YAHOO_COMMON,
    },
    "yahoo_high_score": {
        "label": "High Score (Yahoo)",
        "kind": "high_score",
        "matchup": "h2h",
        "weights": {"PTS": 1.0, "REB": 1.0, "AST": 2.0, "STL": 3.0, "BLK": 3.0},
        "roster": {"starters": ["G", "G", "FC", "FC", "FC", "Util"], "bench": 4, "il": 0},
        **{**_YAHOO_COMMON, "lineup_cadence": "weekly"},
    },
}

DEFAULT_FORMAT = "yahoo_h2h_9cat"

# Özel ligde kullanıcının oynayabileceği sınırlar — API girdisi bunlarla
# doğrulanır (ör. 40 takımlı bir lig simülasyonu sunucuyu boğmasın).
LIMITS = {"teams": (6, 16), "starters": (5, 15), "bench": (0, 10), "il": (0, 5)}


class FormatError(ValueError):
    """Geçersiz format tanımı."""


def validate_format(fmt: dict) -> dict:
    """Bir format sözlüğünü doğrular; hatada FormatError fırlatır, geçerliyse
    aynı sözlüğü döner. Hem hazır ön ayarlar hem özel ligler buradan geçer."""
    kind = fmt.get("kind")
    if kind not in ("categories", "points", "high_score"):
        raise FormatError(f"unknown format kind: {kind!r}")

    if kind == "categories":
        cats = fmt.get("categories") or []
        if not cats:
            raise FormatError("category format needs at least one category")
        unknown = [c for c in cats if c not in CATEGORIES]
        if unknown:
            raise FormatError(f"unknown categories: {unknown}")
        if len(set(cats)) != len(cats):
            raise FormatError("duplicate categories")
    else:
        weights = fmt.get("weights") or {}
        if not weights:
            raise FormatError(f"{kind} format needs scoring weights")
        allowed = {"PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV",
                   "FGM", "FGA", "FTM", "FTA", "FG3M", "FG3A", "PF", "DD2", "TD3"}
        bad = [k for k in weights if k not in allowed]
        if bad:
            raise FormatError(f"unknown scoring stats: {bad}")

    roster = fmt.get("roster") or {}
    starters = roster.get("starters") or []
    bad_slots = [s for s in starters if s not in SLOT_ELIGIBILITY or s in NON_SCORING_SLOTS]
    if bad_slots:
        raise FormatError(f"invalid starter slots: {bad_slots}")
    for key, (lo, hi) in LIMITS.items():
        val = len(starters) if key == "starters" else (fmt.get("teams") if key == "teams" else roster.get(key, 0))
        if val is None or not (lo <= val <= hi):
            raise FormatError(f"{key} must be between {lo} and {hi}, got {val}")
    return fmt


def get_format(key: str = DEFAULT_FORMAT, **overrides) -> dict:
    """Hazır bir formatın bağımsız bir kopyasını döner. `overrides` üst seviye
    anahtarları değiştirir (ör. teams=10) — sonuç yeniden doğrulanır."""
    if key not in FORMATS:
        raise FormatError(f"unknown format: {key!r}")
    fmt = deepcopy(FORMATS[key])
    fmt.update(deepcopy(overrides))
    fmt["key"] = key
    return validate_format(fmt)


for _k in FORMATS:  # modül yüklenirken ön ayarların kendisi de doğrulansın
    validate_format(FORMATS[_k])
