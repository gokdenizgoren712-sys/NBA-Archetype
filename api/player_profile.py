# -*- coding: utf-8 -*-
"""NBA oyuncu profili ek alanları (UI v3, B7 / B13 / B14) — saf fonksiyonlar, main.py'den çağrılır.

  rank, pool, age        : overall_score sıralamasındaki yer (1 tabanlı) ve havuz boyutu (skoru olanlar), sezon yaşı
  lineup_count           : gerçek beşlilerden (MIN ≥ MIN_LINEUP_MINUTES) oyuncuyu içerenlerin sayısı
  confidence             : "solid" | "early read" (oynanan maça göre)
  strengths / weaknesses : metrik, değer ve YAKIN ROL GRUBUNDA (aynı POS5, ≥20 maç) persantil — pivotun asist azlığı zayıflık sayılmasın
  role_text              : arketipin bu oyuncuda nasıl göründüğünü anlatan tek cümle
  recent_seasons         : son üç sezon maç başı PTS / REB / AST / STL / BLK / 3PM

Hepsi NaN'sız: eksik değer None.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

MIN_LINEUP_MINUTES = 100        # src/affinity.py ile aynı eşik
SOLID_GP = 40                   # bu kadar maçtan sonra okuma "solid"
PEER_MIN_GP, PEER_MIN_MPG = 20, 10.0
STRENGTH_FLOOR, WEAKNESS_CEIL = 70, 40

# (sütun, etiket, birim, yön, ölçek)  yön: +1 büyük iyi, −1 küçük iyi
METRICS = [
    ("PTS", "Scoring", "per game", 1, 1.0),
    ("REB", "Rebounding", "per game", 1, 1.0),
    ("AST", "Playmaking", "per game", 1, 1.0),
    ("STL", "Steals", "per game", 1, 1.0),
    ("BLK", "Rim protection", "per game", 1, 1.0),
    ("FG3M", "Three-point volume", "per game", 1, 1.0),
    ("TS_PCT", "Shooting efficiency", "TS%", 1, 100.0),
    ("USG_PCT", "Usage", "% of possessions", 1, 100.0),
    ("OBPM", "Offensive impact", "BPM", 1, 1.0),
    ("DBPM", "Defensive impact", "BPM", 1, 1.0),
    ("DEF_RATING", "Defensive rating", "pts per 100", -1, 1.0),
]
# Zayıflık sayılabilecek metrikler: kullanım / sayı hacmi düşük olmak kusur değil
WEAK_ELIGIBLE = {"TS_PCT", "STL", "BLK", "AST", "REB", "DEF_RATING", "DBPM", "OBPM"}


def _num(v, nd: int = 1):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else round(f, nd)


def _peers(df: pd.DataFrame, row: pd.Series) -> pd.DataFrame:
    base = df[(df["GP"] >= PEER_MIN_GP) & (df["MIN"] >= PEER_MIN_MPG)]
    pos = row.get("POS5")
    same = base[base["POS5"] == pos] if pos and "POS5" in base.columns else base
    return same if len(same) >= 25 else base


def _percentile(series: pd.Series, value: float, direction: int) -> int | None:
    s = series.dropna().to_numpy(float)
    if len(s) < 10 or value is None:
        return None
    better = (s < value).sum() + 0.5 * (s == value).sum()
    pct = better / len(s) * 100.0
    return int(round(pct if direction > 0 else 100.0 - pct))


def _metric_rows(df: pd.DataFrame, row: pd.Series) -> list[dict]:
    peers = _peers(df, row)
    out = []
    for col, label, unit, direction, scale in METRICS:
        if col not in df.columns:
            continue
        v = _num(row.get(col), 4)
        if v is None:
            continue
        pct = _percentile(peers[col] if col in peers.columns else pd.Series(dtype=float), v, direction)
        if pct is None:
            continue
        out.append({"key": col, "label": label, "value": _num(v * scale, 1), "unit": unit, "percentile": pct})
    return out


def lineup_count(lineups: pd.DataFrame, player_id) -> int:
    """Oyuncunun yer aldığı gerçek beşlilerin sayısı (yalnız yeterli dakikası olanlar)."""
    if lineups is None or lineups.empty or player_id is None or pd.isna(player_id):
        return 0
    ok = lineups[lineups["MIN"] >= MIN_LINEUP_MINUTES]
    needle = f"-{int(player_id)}-"
    return int(ok["GROUP_ID"].astype(str).str.contains(needle, regex=False).sum())


def per_game_row(season: str, row: pd.Series) -> dict:
    """Maç başı satır; 3'lük isabet tarihsel tabloda yoksa deneme × isabet yüzdesinden türetilir."""
    fg3m = row.get("FG3M")
    if fg3m is None or pd.isna(fg3m):
        a, p = row.get("FG3A"), row.get("FG3_PCT")
        fg3m = a * p if a is not None and p is not None and pd.notna(a) and pd.notna(p) else None
    return {"season": season, "pts": _num(row.get("PTS")), "reb": _num(row.get("REB")), "ast": _num(row.get("AST")),
            "stl": _num(row.get("STL")), "blk": _num(row.get("BLK")), "fg3m": _num(fg3m)}


def recent_seasons(hist: pd.DataFrame, name_match: pd.DataFrame | None, current: pd.Series | None, current_season: str = "2025-26",
                   n: int = 3) -> list[dict]:
    """En yeni sezon önde, en çok n sezon. `current`: canlı sezonun skor satırı (tarihsel tablo onu içermez)."""
    rows: list[dict] = []
    seen: set[str] = set()
    if current is not None:
        rows.append(per_game_row(current_season, current))
        seen.add(current_season)
    if name_match is not None and not name_match.empty:
        h = name_match.sort_values("SEASON", ascending=False)
        for _, r in h.iterrows():
            if r["SEASON"] in seen:
                continue
            seen.add(r["SEASON"])
            rows.append(per_game_row(str(r["SEASON"]), r))
    rows.sort(key=lambda x: x["season"], reverse=True)
    return rows[:n]


def role_text(name: str, arch: str, tier: str, strengths: list[dict]) -> str:
    if not arch:
        return ""
    first = name.split()[0] if name else "This player"
    if len(strengths) >= 2:
        what = f"{strengths[0]['label'].lower()} and {strengths[1]['label'].lower()} carry the role"
    elif strengths:
        what = f"{strengths[0]['label'].lower()} carries the role"
    else:
        what = "no single skill stands out yet"
    tier_txt = f" Rated {tier.lower()} among this season's ranked players." if tier else ""
    article = "an" if arch[:1].lower() in "aeiou" else "a"
    return f"{first} plays as {article} {arch}: {what}.{tier_txt}"


def profile_extras(df: pd.DataFrame, row: pd.Series, lineups: pd.DataFrame, hist: pd.DataFrame, name_match: pd.DataFrame | None) -> dict:
    ranked = df[df["overall_score"].notna()] if "overall_score" in df.columns else df.iloc[0:0]
    score = row.get("overall_score")
    rank = None
    if pd.notna(score) and len(ranked):
        rank = int((ranked["overall_score"] > score).sum()) + 1
    gp = int(row["GP"]) if pd.notna(row.get("GP")) else 0
    metrics = _metric_rows(df, row)
    strengths = sorted([m for m in metrics if m["percentile"] >= STRENGTH_FLOOR], key=lambda m: -m["percentile"])[:3]
    if len(strengths) < 2:                                   # güçlü yanı belirgin olmayan oyuncuda da en iyi iki metrik gösterilsin
        strengths = sorted(metrics, key=lambda m: -m["percentile"])[:2]
    weak = sorted([m for m in metrics if m["key"] in WEAK_ELIGIBLE and m["percentile"] <= WEAKNESS_CEIL and m not in strengths],
                  key=lambda m: m["percentile"])[:2]
    arch = row.get("primary_arch") if isinstance(row.get("primary_arch"), str) else ""
    tier = row.get("overall_tier") if isinstance(row.get("overall_tier"), str) else ""
    pid = row.get("PLAYER_ID")
    return {
        "rank": rank,
        "pool": int(len(ranked)),
        "age": int(row["AGE"]) if pd.notna(row.get("AGE")) else None,
        "lineup_count": lineup_count(lineups, pid),
        "confidence": "solid" if gp >= SOLID_GP else "early read",
        "role_text": role_text(str(row.get("PLAYER_NAME", "")), arch, tier, strengths),
        "strengths": strengths,
        "weaknesses": weak,
        "recent_seasons": recent_seasons(hist, name_match, row),
    }
