"""
Comparables engine (P4) — "genç X'e benziyor".

Bir prospect'in arketip vektörünü, 1983+ NBA oyuncularının GİRİŞ (ilk sezon,
rookie) arketip profilleriyle cosine benzerliğiyle eşler. Her komparablın
kariyer ZİRVESİ (max BPM) sonucu gösterilir → "girişte X'e benziyordu, o da
[zirve] oldu." Yaş gerektirmez: ilk sezon = 'genç' proxy'si.

Cosine SHAPE'i (stil) ölçer, büyüklüğü değil → lig-arası persantil baz farkını
yumuşatır (kolej FALLBACK vs NBA skorları farklı bazda ama aynı 12-arketip ekseni).
"""
import numpy as np
import pandas as pd
from functools import lru_cache

CORE = ["Engine", "Ecosystem", "Hub", "Connector", "Creator", "Anchor",
        "Spacer", "Finisher", "Force", "Initiator", "Stopper", "Rim Runner"]
SC = [f"score_{c}" for c in CORE]


def _outcome(bpm) -> str:
    """Kariyer zirve BPM → sonuç etiketi."""
    if bpm is None or (isinstance(bpm, float) and np.isnan(bpm)):
        return "?"
    if bpm >= 6:  return "Superstar"
    if bpm >= 4:  return "All-Star"
    if bpm >= 2:  return "Quality Starter"
    if bpm >= 0:  return "Starter"
    if bpm >= -2: return "Rotation"
    return "Fringe"


def _pos_group(pos) -> str:
    """Pozisyon → kaba grup (G/W/B). Hem kısaltma (PG/SG/SF/PF/C) hem kelime
    (Guard/Forward/Center, Forward-Center...) formunu tanır."""
    p = str(pos).upper().strip()
    if p in ("PG", "SG", "G", "GUARD", "GUARD-FORWARD"):        return "G"
    if p in ("SF", "PF", "F", "GF", "FG", "FORWARD", "FORWARD-GUARD"): return "W"
    if p in ("C", "FC", "CF", "CENTER", "FORWARD-CENTER", "CENTER-FORWARD"): return "B"
    return ""


@lru_cache(maxsize=2)
def _load_pool(hist_path: str):
    """historical__labeled → (pool_df, merkezlenmiş+normalize giriş-matrisi, ortalama-vektör).
    Cosine ayırt ediciliği için vektörler ORTALAMADAN sapma olarak alınır (stil sinyali)."""
    df = pd.read_parquet(hist_path)
    df = df[df["GP"].fillna(0) >= 30].copy()
    df["_syr"] = df["SEASON"].str[:4].astype(int)
    cols = [c for c in SC if c in df.columns]
    rows, vecs = [], []
    for name, g in df.groupby("PLAYER_NAME"):
        g = g.sort_values("_syr")
        entry = g.iloc[0]
        v = entry[cols].fillna(0).to_numpy(dtype=float)
        if v.shape[0] != len(SC):
            continue
        peak = float(g["BPM"].max()) if "BPM" in g.columns and g["BPM"].notna().any() else np.nan
        rows.append({
            "name": name,
            "entry_season": entry.get("SEASON", ""),
            "entry_arch": entry.get("primary_arch", ""),
            "pos_group": _pos_group(entry.get("POSITION", "")),
            "peak_bpm": None if np.isnan(peak) else round(peak, 1),
            "outcome": _outcome(peak),
            "seasons": int(len(g)),
        })
        vecs.append(v)
    pool = pd.DataFrame(rows)
    M = np.asarray(vecs, dtype=float)
    mean_vec = M.mean(axis=0)
    Mc = M - mean_vec                       # ortalamadan sapma = stil
    norms = np.linalg.norm(Mc, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return pool, Mc / norms, mean_vec


def find_comparables(vec, hist_path, k: int = 5, pos=None, min_seasons: int = 2):
    """vec (CORE sırasında 12 arketip skoru) → en yakın k komparabl.
    pos verilirse (prospect POS5/pozisyon) aynı pozisyon grubuna filtrelenir."""
    pool, Mn, mean_vec = _load_pool(str(hist_path))
    v = np.asarray(vec, dtype=float) - mean_vec   # aynı merkeze çek
    nv = np.linalg.norm(v) or 1.0
    sims = Mn @ (v / nv)
    want = _pos_group(pos) if pos else ""
    order = np.argsort(-sims)
    out = []
    for i in order:
        r = pool.iloc[int(i)]
        if r["seasons"] < min_seasons:
            continue
        if want and r["pos_group"] and r["pos_group"] != want:
            continue
        pb = r["peak_bpm"]
        pb = None if pb is None or (isinstance(pb, float) and np.isnan(pb)) else round(float(pb), 1)
        out.append({
            "name": str(r["name"]),
            "entry_arch": str(r["entry_arch"]),
            "entry_season": str(r["entry_season"]),
            "peak_bpm": pb,
            "outcome": r["outcome"],
            "similarity": round(float(sims[int(i)]), 3),
        })
        if len(out) >= k:
            break
    return out
