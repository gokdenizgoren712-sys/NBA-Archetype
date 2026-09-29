# -*- coding: utf-8 -*-
"""Yahoo referans verisi yükleyicisi (config/reference/, bkz. oradaki README).

Yahoo API gelene kadar (Faz 5) gerçek-dünya piyasa verisi: ADP, format başına Yahoo sıralaması,
Yahoo pozisyon uygunluğu ve takım. Eşleştirme isim üzerinden (aksan/ek/noktalama temizlenir) —
projede tek isim standardı yok (CLAUDE.md "BİLİNEN KISITLAR").
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
REF_DIR = ROOT / "config" / "reference"

MIN_PCT_DRAFTED = 50          # bunun altındaki ADP satırları az draftın ortalaması → güvenilmez
YAHOO_TEAM = {"NOR": "NOP", "PHO": "PHX", "UTH": "UTA"}
RANK_KINDS = {"yahoo_h2h_9cat": "9cat", "yahoo_h2h_points": "points", "yahoo_high_score": "highscore"}
_POS = {"G": ["PG", "SG"], "F": ["SF", "PF"]}
POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"]


def norm_name(name: str) -> str:
    n = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[^a-z ]", "", n.replace("-", " "))
    for suf in (" jr", " iii", " ii", " iv", " sr"):
        if n.endswith(suf):
            n = n[: -len(suf)]
    return n.strip()


def _codes(pos: str) -> list[str]:
    out: list[str] = []
    for p in str(pos).split(","):
        out += _POS.get(p.strip(), [p.strip()])
    return [p for p in POSITION_ORDER if p in out]


@lru_cache(maxsize=None)
def load_adp(season: str = "2026-27") -> pd.DataFrame | None:
    """Gerçek Yahoo ADP. Kolonlar: key, name, adp (Preseason, yoksa All Drafts), pct_drafted, reliable,
    yahoo_rank, tag. ADP'si olmayan satırlar (henüz draft edilmemiş) adp=NaN."""
    p = REF_DIR / f"yahoo_adp_{season}.tsv"
    if not p.exists():
        return None
    d = pd.read_csv(p, sep="\t", comment="#", header=None, dtype=str,
                    names=["order", "name", "pos", "team", "yahoo_rank", "pct", "adp_pre", "adp_all", "tag"])
    num = lambda s: pd.to_numeric(s.replace("-", None), errors="coerce")   # noqa: E731
    d["adp"] = num(d["adp_pre"]).fillna(num(d["adp_all"]))
    d["pct_drafted"] = num(d["pct"])
    d["yahoo_rank"] = num(d["yahoo_rank"])
    d["reliable"] = d["adp"].notna() & (d["pct_drafted"] >= MIN_PCT_DRAFTED)
    d["key"] = d["name"].map(norm_name)
    d["team"] = d["team"].map(lambda t: YAHOO_TEAM.get(t, t))
    d["tag"] = d["tag"].fillna("")
    return d.drop(columns=["order", "pct", "adp_pre", "adp_all"]).reset_index(drop=True)


@lru_cache(maxsize=None)
def load_rank(fmt_key: str, season: str = "2026-27") -> pd.DataFrame | None:
    """Yahoo'nun format başına değer sıralaması (ADP DEĞİL): key, name, rank, pos (liste), team."""
    kind = RANK_KINDS.get(fmt_key)
    p = REF_DIR / f"yahoo_rank_{kind}_{season}.tsv"
    if kind is None or not p.exists():
        return None
    d = pd.read_csv(p, sep="\t", comment="#", header=None, names=["rank", "name", "pos", "team"])
    d["key"] = d["name"].map(norm_name)
    d["team"] = d["team"].map(lambda t: YAHOO_TEAM.get(t, t))
    d["pos"] = d["pos"].map(_codes)
    return d


@lru_cache(maxsize=None)
def yahoo_positions(season: str = "2026-27") -> dict[str, list[str]]:
    """key → Yahoo pozisyon uygunluğu. Öncelik: 9-CAT listesi (250 oyuncu), sonra diğer sıralamalar, sonra ADP."""
    out: dict[str, list[str]] = {}
    for fmt in ("yahoo_h2h_9cat", "yahoo_h2h_points", "yahoo_high_score"):
        d = load_rank(fmt, season)
        if d is not None:
            for k, p in zip(d["key"], d["pos"]):
                if p and k not in out:
                    out[k] = p
    a = load_adp(season)
    if a is not None:
        raw = pd.read_csv(REF_DIR / f"yahoo_adp_{season}.tsv", sep="\t", comment="#", header=None, dtype=str,
                          names=["order", "name", "pos", "team", "r", "p", "a1", "a2", "tag"])
        for n, p in zip(raw["name"], raw["pos"]):
            k = norm_name(n)
            if k not in out and _codes(p):
                out[k] = _codes(p)
    return out
