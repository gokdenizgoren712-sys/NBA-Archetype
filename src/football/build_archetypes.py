"""
Futbol arketip tablosu — kümelemeyi tüm oyuncu havuzuna uygular.

Her (lig, faz) için ayrı kümeleme koşar (lig-içi persantil kararı gereği),
sonuçları tek bir tabloda birleştirir ve API'nin okuyacağı parquet'i yazar.

Kullanım:
    python src/football/build_archetypes.py
    python src/football/build_archetypes.py --ground-truth   # 12'lik taslak da yaz
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "src" / "football"))
sys.path.insert(0, str(ROOT / "config"))

from cluster import (cluster_phase, pick_representatives,        # noqa: E402
                     signature_score, to_percentiles)
from football_signatures import PHASES, signatures_for, metrics_for  # noqa: E402

DATA = ROOT / "data"
SEASON = "2015-16"
LEAGUES = ["premier-league", "la-liga", "serie-a"]


def build_league(key: str):
    src = DATA / f"football__{key}__{SEASON}__merged.parquet"
    if not src.exists():
        print(f"[atla] {src.name} yok")
        return None, None
    df = pd.read_parquet(src)
    out_rows, diags = [], []

    for phase in PHASES:
        sub = df[df["PHASE"] == phase].copy()
        sigs = signatures_for(phase)
        if len(sub) < len(sigs) * 4:
            print(f"  [{phase}] {len(sub)} oyuncu — {len(sigs)} küme için az, atlandı")
            continue
        res, diag = cluster_phase(sub, phase)

        # Arketip skorları: kümeden bağımsız, imzaya göre sürekli [0..1] skor.
        # Basketbol tarafındaki score_* kolonlarının birebir muadili — kart
        # radar grafiği ve "ikincil rol" bunları kullanacak.
        cols = [c for c in metrics_for(phase) if c in sub.columns]
        pct = to_percentiles(sub, cols)
        for name, sig in sigs.items():
            res[f"score_{name}"] = [signature_score(pct.loc[i], sig) for i in sub.index]

        score_cols = [f"score_{n}" for n in sigs]
        res["primary_arch"] = res[score_cols].idxmax(axis=1).str.replace("score_", "", regex=False)
        res["primary_score"] = res[score_cols].max(axis=1)

        out_rows.append(res)
        diags.append(diag)
        print(f"  [{phase}] {len(sub):>3} oyuncu, {len(sigs)} arketip, "
              f"zayıf eşleşme: {len(diag['weak_matches'])}")

    if not out_rows:
        return None, None
    return pd.concat(out_rows, ignore_index=True), diags


def main(write_gt: bool):
    all_rows, all_diags, gt_rows = [], {}, []
    for key in LEAGUES:
        print(f"\n=== {key} ===")
        res, diags = build_league(key)
        if res is None:
            continue
        all_rows.append(res)
        all_diags[key] = diags
        if write_gt:
            for phase in PHASES:
                sub = res[res["PHASE"] == phase]
                if sub.empty:
                    continue
                reps = pick_representatives(sub, n=12, ambiguous=2)
                reps = reps.assign(LEAGUE_KEY=key)
                gt_rows.append(reps)

    if not all_rows:
        print("[HATA] hiç veri yok")
        return
    full = pd.concat(all_rows, ignore_index=True)
    out = DATA / f"football__{SEASON}__player_scores.parquet"
    full.to_parquet(out)
    print(f"\n[OK] {out.name}  ({len(full)} satır, {full.PLAYER_ID.nunique()} oyuncu)")

    diag_path = DATA / f"football__{SEASON}__cluster_diagnostics.json"
    diag_path.write_text(json.dumps(all_diags, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"[OK] {diag_path.name}")

    if gt_rows:
        gt = pd.concat(gt_rows, ignore_index=True)
        keep = ["LEAGUE", "LEAGUE_KEY", "PHASE", "POSITION", "PLAYER_NAME", "TEAM",
                "MINUTES_TOTAL", "suggested_archetype", "cluster_confidence",
                "alt_archetype", "pick_reason"]
        gt = gt[[c for c in keep if c in gt.columns]]
        gp = DATA / f"football__{SEASON}__ground_truth_draft.csv"
        gt.to_csv(gp, index=False, encoding="utf-8-sig")
        print(f"[OK] {gp.name}  ({len(gt)} satır)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ground-truth", action="store_true")
    a = ap.parse_args()
    main(a.ground_truth)
