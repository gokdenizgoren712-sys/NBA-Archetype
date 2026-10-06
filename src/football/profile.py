# -*- coding: utf-8 -*-
"""Futbol oyuncu profili: rol profili, açıklama, benzer oyuncular, birim çubukları.

Hepsi saf fonksiyon (DataFrame/dict girer, dict çıkar) ve DETERMİNİSTİK — açıklama
metni persantillerden şablonla üretilir, serbest metin üreten model çağrısı yok.
(docs/BACKEND_PROMPT_UI_V3_FOOTBALL.md: B13, B16, B17, B18, B20)
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

MIN_PEERS = 8            # bundan az akran varsa karşılaştırma grubu faza genişler

# ── B16: rol profili metrikleri ─────────────────────────────────────────────
# (key, label, kolon, kısa etiket). Etiket "faza uyan beş metrik" olarak
# oyuncunun pozisyonuna göre seçilir; kolonlar per-90 değerdir (save_pct hariç,
# o bir oran). Pressing için tek başına "baskı" kolonu yok: top kazanma
# (recoveries_90) en yakın vekil — etiket bu yüzden sade tutuldu.
_M = {
    "dribbling":        ("Dribbling", "dribbles_succeeded_90", "DRIB"),
    "chance_creation":  ("Chance creation", "chances_created_90", "CHANCES"),
    "crossing":         ("Crossing", "accurate_crosses_90", "CROSS"),
    "aerial_duels":     ("Aerial duels", "aerials_won_90", "AERIAL"),
    "pressing":         ("Pressing", "recoveries_90", "PRESS"),
    "finishing":        ("Finishing", "expected_goals_90", "xG"),
    "progression":      ("Progressive passing", "passes_into_final_third_90", "PROG"),
    "tackling":         ("Tackling", "tackles_90", "TACKLE"),
    "interceptions":    ("Interceptions", "interceptions_90", "INT"),
    "clearances":       ("Clearances", "clearances_90", "CLEAR"),
    "shot_stopping":    ("Shot stopping", "save_pct", "SAVE%"),
    "goals_prevented":  ("Goals prevented", "goals_prevented_90", "PREV"),
    "distribution":     ("Distribution", "pass_pct", "DIST%"),
    "claiming":         ("Claiming crosses", "keeper_high_claim_90", "CLAIM"),
    "sweeping":         ("Sweeping", "keeper_sweeper_90", "SWEEP"),
}

RATIO_COLS = {"save_pct", "pass_pct"}      # 0..1 oran, 90 dakika başına değil

PROFILE_BY_POSITION = {
    "W":  ["dribbling", "chance_creation", "crossing", "aerial_duels", "pressing"],
    "AM": ["dribbling", "chance_creation", "crossing", "aerial_duels", "pressing"],
    "ST": ["finishing", "chance_creation", "aerial_duels", "dribbling", "pressing"],
    "CM": ["chance_creation", "progression", "dribbling", "tackling", "pressing"],
    "DM": ["tackling", "interceptions", "progression", "aerial_duels", "pressing"],
    "CB": ["tackling", "interceptions", "aerial_duels", "clearances", "progression"],
    "FB": ["tackling", "interceptions", "crossing", "dribbling", "progression"],
    "GK": ["shot_stopping", "goals_prevented", "distribution", "claiming", "sweeping"],
}
_PHASE_DEFAULT = {"fwd": "W", "mid": "CM", "def": "CB", "gk": "GK"}

POSITION_PLURAL = {
    "W": "wingers", "AM": "attacking midfielders", "ST": "strikers",
    "CM": "central midfielders", "DM": "defensive midfielders",
    "CB": "centre-backs", "FB": "full-backs", "GK": "goalkeepers",
}
PHASE_PLURAL = {"fwd": "attackers", "mid": "midfielders", "def": "defenders", "gk": "goalkeepers"}
LEAGUE_LABEL = {
    "premier-league": "Premier League", "la-liga": "La Liga", "serie-a": "Serie A",
    "bundesliga": "Bundesliga", "ligue-1": "Ligue 1",
}


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(f) or math.isinf(f)) else f


def _season_short(season: str) -> str:
    s = str(season).replace("/", "-")
    a, _, b = s.partition("-")
    return f"{a}-{b[-2:]}" if b else s


def percentile_of(value: float, peers: np.ndarray) -> int:
    """Akran değerleri içinde orta-sıra persantili [0..100] (eşitlikte yarım pay)."""
    below = float((peers < value).sum())
    equal = float((peers == value).sum())
    return int(round(100.0 * (below + 0.5 * equal) / len(peers)))


def _peer_frame(df: pd.DataFrame, row: pd.Series):
    """(akran DataFrame, metin). Önce aynı lig+sezon+POZİSYON, küçükse FAZ."""
    base = df[(df["LEAGUE"] == row["LEAGUE"]) & (df["SEASON"] == row["SEASON"])]
    if "qualified" in base.columns:
        base = base[base["qualified"].fillna(False).astype(bool)]
    for scope, plural in (("POSITION", POSITION_PLURAL.get(row["POSITION"])),
                          ("PHASE", PHASE_PLURAL.get(row["PHASE"]))):
        peers = base[base[scope] == row[scope]]
        if len(peers) >= MIN_PEERS and plural:
            lg = LEAGUE_LABEL.get(row["LEAGUE"], str(row["LEAGUE"]))
            return peers, f"vs {plural} · {lg} · {_season_short(row['SEASON'])}"
    return None, None


def role_profile(df: pd.DataFrame, row: pd.Series) -> dict:
    """B16. {role_profile:[{key,label,pct,value,short}], peer_group:str|None}.

    Verisi olmayan metrik atlanır (kaleci metrikleri kaleci olmayanda NaN):
    sahte yüzde uydurmak yerine daha az öğe dönüyor."""
    peers, text = _peer_frame(df, row)
    if peers is None:
        return {"role_profile": [], "peer_group": None}
    keys = PROFILE_BY_POSITION.get(row["POSITION"]) or PROFILE_BY_POSITION[
        _PHASE_DEFAULT.get(row["PHASE"], "CM")]
    out = []
    for k in keys:
        label, col, short = _M[k]
        v = _num(row.get(col))
        if v is None or col not in peers.columns:
            continue
        pv = pd.to_numeric(peers[col], errors="coerce").dropna().to_numpy(float)
        if len(pv) < MIN_PEERS:
            continue
        out.append({"key": k, "label": label, "pct": percentile_of(v, pv),
                    "value": round(v, 2), "short": short,
                    "unit": "ratio" if col in RATIO_COLS else "per_90"})
    return {"role_profile": out, "peer_group": text}


# ── B17: açıklama ────────────────────────────────────────────────────────────
def confidence_note(minutes) -> str:
    m = _num(minutes)
    if m is None:
        return "No minutes on record, so there is nothing to read yet."
    n = f"{int(round(m)):,}"
    if m >= 2000:
        return f"Played {n} minutes, so the read is solid."
    if m >= 1200:
        return f"Played {n} minutes, a fair sample."
    if m >= 600:
        return f"Played {n} minutes, so treat the read as indicative."
    return f"Only {n} minutes, so the read is thin."


def _ordinal(n: int) -> str:
    suf = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def description(row: pd.Series, profile: dict, updated_at: str | None) -> dict:
    """B17. Şablonlu, deterministik; metin yalnız persantillerden kurulur."""
    arch = row.get("primary_arch")
    arch = str(arch) if isinstance(arch, str) and arch else None
    conf = row.get("confidence")
    alt = row.get("alt_arch")
    if arch is None:
        headline = "Not scored yet"
    elif conf == "prototype":
        headline = f"Prototype {arch}"
    elif conf == "between roles" and isinstance(alt, str) and alt:
        headline = f"{arch} leaning {alt}"
    else:
        headline = arch

    items = sorted(profile.get("role_profile") or [], key=lambda x: -x["pct"])
    evidence = [{"label": i["short"], "value": i["value"], "pct": i["pct"]} for i in items[:3]]
    if len(items) >= 3:
        a, b, w = items[0], items[1], items[-1]
        summary = (f"Strongest in {a['label'].lower()} ({_ordinal(a['pct'])} percentile) and "
                   f"{b['label'].lower()} ({_ordinal(b['pct'])}); least involved in "
                   f"{w['label'].lower()} ({_ordinal(w['pct'])}).")
    elif items:
        a = items[0]
        summary = f"Best marks in {a['label'].lower()} ({_ordinal(a['pct'])} percentile)."
    else:
        summary = "Not enough comparable players to describe this role yet."
    return {"headline": headline, "summary": summary, "evidence": evidence,
            "confidence_note": confidence_note(row.get("MINUTES_TOTAL")),
            "updated_at": updated_at}


# ── B13: sıra ────────────────────────────────────────────────────────────────
def rank_in_phase(df: pd.DataFrame, row: pd.Series):
    """(rank, pool): sezon overall_score sıralamasında AYNI FAZDA 1-tabanlı sıra
    (eşitlikte yarışma sırası: kendinden kesin büyük sayısı + 1)."""
    ph = pd.to_numeric(df.loc[df["PHASE"] == row["PHASE"], "overall_score"],
                       errors="coerce").dropna()
    mine = _num(row.get("overall_score"))
    if mine is None:
        return None, int(len(ph))
    return int((ph > mine).sum()) + 1, int(len(ph))


# ── B18: benzer oyuncular ────────────────────────────────────────────────────
def similar_players(df: pd.DataFrame, row: pd.Series, limit: int = 3) -> list[dict]:
    """Aynı faz + aynı sezon, merkezlenmiş kosinüs (src/comparables.py ile aynı
    yöntem: arketip vektöründen ORTALAMA çıkarılır, yani "kaç puan" değil "hangi
    biçim" karşılaştırılır). Oyuncunun kendisi hariç; çift satırlı oyuncu tek sayılır."""
    pool = df[(df["PHASE"] == row["PHASE"]) & df["primary_arch"].notna()]
    cols = [c for c in pool.columns if c.startswith("score_") and pool[c].notna().any()]
    if not cols or int(row["PLAYER_ID"]) not in set(pool["PLAYER_ID"].astype(int)):
        return []
    pool = (pool.sort_values("MINUTES_TOTAL", ascending=False)
                .drop_duplicates("PLAYER_ID").reset_index(drop=True))
    M = pool[cols].fillna(0.0).to_numpy(float)
    M = M - M.mean(axis=1, keepdims=True)            # satır içi merkezleme
    norms = np.linalg.norm(M, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Mn = M / norms
    me = int(np.flatnonzero(pool["PLAYER_ID"].to_numpy() == int(row["PLAYER_ID"]))[0])
    sims = Mn @ Mn[me]
    sims[me] = -np.inf
    order = [i for i in np.argsort(-sims, kind="stable") if np.isfinite(sims[i])][:limit]
    return [{"player_id": int(pool.at[i, "PLAYER_ID"]), "name": str(pool.at[i, "PLAYER_NAME"]),
             "primary_arch": str(pool.at[i, "primary_arch"]),
             "match_pct": int(round(100 * max(0.0, float(sims[i]))))} for i in order]
