"""
G2 Modern backtest — export.

Modern-skorlanmış (COMPONENT_SIGNATURES) 6 sezonu backtest JSON'una döker.
Gerçek galibiyet: merged'deki W (max per takım, tarihsel ≥1996 ile aynı yöntem).
Node harness bunu BT_DIR=backtest_modern ile okur → modern skorlama yolunu doğrular.

Çalıştır:  python src/export_modern_backtest.py
(önce: python src/fetch_modern_seasons.py)
"""
import sys
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import pandas as pd  # noqa: E402

OUT = ROOT / "data" / "backtest_modern"
MULTI = {"2TM", "3TM", "4TM", "TOT"}

# sezon -> (era_id, şampiyon). getEra: 2014-2020 small_ball, 2020+ parity.
SEASONS = {
    "2016-17": ("small_ball", "GSW"), "2017-18": ("small_ball", "GSW"), "2018-19": ("small_ball", "TOR"),
    "2021-22": ("parity", "GSW"),     "2022-23": ("parity", "DEN"),     "2023-24": ("parity", "BOS"),
}


def timeless_cutoff(s, floor=0.80):
    vals = sorted([v for v in s.dropna()], reverse=True)
    return max(floor, vals[1]) if len(vals) >= 2 else floor


def export(season, era, champ):
    sc = pd.read_parquet(ROOT / "data" / f"{season}__player_scores.parquet")
    m = pd.read_parquet(ROOT / "data" / f"{season}__merged.parquet")
    miss = [c for c in ["W", "L", "FG3_PCT"] if c not in sc.columns and c in m.columns]
    if miss and "PLAYER_ID" in sc.columns:
        sc = sc.merge(m[["PLAYER_ID"] + miss].drop_duplicates("PLAYER_ID"), on="PLAYER_ID", how="left")
    if "GP" in sc.columns:
        sc = sc[sc["GP"].fillna(0) >= 20].copy()
    if "overall_score" in sc.columns:
        tl = timeless_cutoff(sc["overall_score"])
        sc["is_timeless"] = (sc["overall_score"] >= tl)
    sc["_season"] = season

    # Gerçek galibiyet: merged W (max per takım)
    m2 = m[~m["TEAM_ABBREVIATION"].astype(str).str.upper().isin(MULTI)]
    g = m2.groupby("TEAM_ABBREVIATION")["W"].max()
    real_wins = {str(k): int(v) for k, v in g.items()}
    games = 82
    if "L" in m2.columns:
        games = min(82, int((m2["W"].fillna(0) + m2["L"].fillna(0)).max() or 82))

    score_cols = [c for c in sc.columns if c.startswith("score_")]
    keep = ["PLAYER_NAME", "primary_arch", "overall_score", "TEAM_ABBREVIATION", "MIN",
            "PTS", "REB", "AST", "STL", "BLK", "FG3_PCT", "is_timeless", "_season"] + score_cols
    keep = [c for c in keep if c in sc.columns]
    players = json.loads(sc[keep].to_json(orient="records"))   # NaN→null, numpy→native
    rec = {"season": season, "era": era, "champion": champ, "games": games,
           "realWins": real_wins, "players": players}
    (OUT / f"{season}.json").write_text(json.dumps(rec), encoding="utf-8")
    return len(players), int(sc["TEAM_ABBREVIATION"].nunique()), real_wins.get(champ)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # affinity matrisi (harness için) — mevcut backtest'ten kopyala
    src_aff = ROOT / "data" / "backtest" / "affinity_matrix.json"
    if src_aff.exists():
        shutil.copy(src_aff, OUT / "affinity_matrix.json")
    for season, (era, champ) in SEASONS.items():
        n, nt, cw = export(season, era, champ)
        print(f"✓ {season} [{era:10}] {champ}: {n} oyuncu, {nt} takım, şampiyon {champ}={cw}W")
    print(f"\n{len(SEASONS)} modern sezon → {OUT}")


if __name__ == "__main__":
    main()
