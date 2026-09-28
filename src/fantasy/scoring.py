# -*- coding: utf-8 -*-
"""Maç başı fantezi puanı — points ve high_score formatları için.

Kategori formatları tek bir sayıya indirgenmez (her kategori ayrı yarışır);
onların değerlemesi Faz 1'de (z-score / G-score) yapılacak.
"""

from __future__ import annotations

import pandas as pd


def fantasy_points(games: pd.DataFrame, weights: dict[str, float]) -> pd.Series:
    """Her satır (bir oyuncunun bir maçı) için ağırlıklı toplam.

    Eksik bir stat kolonu sessizce 0 sayılmaz — yanlış puan üretmektense hata.
    """
    missing = [s for s in weights if s not in games.columns]
    if missing:
        raise KeyError(f"game rows lack scoring stats: {missing}")
    total = pd.Series(0.0, index=games.index)
    for stat, w in weights.items():
        total = total + games[stat].astype(float) * w
    return total.round(2)


def score_games(games: pd.DataFrame, fmt: dict) -> pd.Series:
    """Formata göre maç puanı. Kategori formatında anlamsız olduğu için hata."""
    if fmt["kind"] not in ("points", "high_score"):
        raise ValueError(f"{fmt['kind']} formats are not scored per game as a single number")
    return fantasy_points(games, fmt["weights"])
