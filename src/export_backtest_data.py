"""
G3 Backtest — veri export'u.

18 şampiyon-sezon (6 era × 3: her era'nın ilk / orta / son şampiyonu) için
oyuncuları game_players ile AYNI enrichment üzerinden data/backtest/<sezon>.json'a
döker + gerçek takım galibiyetlerini (hist_merged'de her takımın tam-sezon oynayan
oyuncusunun W'si = max W) + oyunun kullandığı affinity matrisini.

Node harness (scripts/backtest.mjs) bu JSON'ları okuyup gerçek JS sim'i çalıştırır.
Böylece sim ETL'i tek kaynaktan (Python enrichment) beslenir, tekrarlanabilir/çevrimdışı.

Çalıştır:  python src/export_backtest_data.py
"""
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
try:
    sys.stdout.reconfigure(encoding="utf-8")   # Windows cp1254 konsolunda ✓/unicode için
except Exception:
    pass

import pandas as pd          # noqa: E402
import api.main as M         # noqa: E402  (main.py kendi src/config path'ini kurar)

OUT = ROOT / "data" / "backtest"

# Sezon -> (era_id, şampiyon abbrev).
# Kullanıcı seçimi: her dönemin İLK, ORTA ve SON şampiyon sezonu; o sezonların
# TÜM takımları alınır (sezon-içi 15-70 galibiyet yelpazesi → korelasyon için ideal).
SEASONS = {
    "1983-84": ("magic_bird", "BOS"), "1986-87": ("magic_bird", "LAL"), "1990-91": ("magic_bird", "CHI"),
    "1991-92": ("jordan", "CHI"),     "1994-95": ("jordan", "HOU"),     "1998-99": ("jordan", "SAS"),
    "1999-00": ("dead_ball", "LAL"),  "2003-04": ("dead_ball", "DET"),  "2007-08": ("dead_ball", "BOS"),
    "2008-09": ("proto", "LAL"),      "2011-12": ("proto", "MIA"),      "2013-14": ("proto", "SAS"),
    "2014-15": ("small_ball", "GSW"), "2016-17": ("small_ball", "GSW"), "2019-20": ("small_ball", "LAL"),
    "2020-21": ("parity", "MIL"),     "2022-23": ("parity", "DEN"),     "2023-24": ("parity", "BOS"),
}

_MULTI = {"2TM", "3TM", "4TM", "TOT"}


def enrich_season(season: str) -> pd.DataFrame:
    """game_players ile AYNI enrichment — ama 60-oyuncu cap'i YOK (tüm takımlar lazım)."""
    full = M._load_historical().copy()
    full = full[full["SEASON"] == season]
    if full.empty:
        return full
    if "TEAM_ABBREVIATION" in full.columns:
        full = full[~full["TEAM_ABBREVIATION"].str.upper().isin(_MULTI)]
    full = M._gp_filter(full, 10)
    tl_cutoff = M._timeless_cutoff(full["overall_score"]) if "overall_score" in full.columns else 1.0
    df = full.copy()
    # Eksik box-stat sütunları (FG3_PCT / STL / BLK) hist_Base'den (game_players ile birebir)
    base_stats = M._load_hist_base_stats(season)
    if not base_stats.empty and "PLAYER_ID" in df.columns:
        missing = [c for c in base_stats.columns if c != "PLAYER_ID" and c not in df.columns]
        if missing:
            df = df.merge(base_stats[["PLAYER_ID"] + missing], on="PLAYER_ID", how="left")
    # Rebounding % (pace-bağımsız, cross-era) — bref_advanced'ten (P2 testi)
    bref_p = ROOT / "data" / f"{season}__bref_advanced.parquet"
    if bref_p.exists():
        _b = pd.read_parquet(bref_p, columns=["PLAYER_NAME", "TRB_PCT_bref"]).drop_duplicates("PLAYER_NAME")
        df = df.merge(_b, on="PLAYER_NAME", how="left").rename(columns={"TRB_PCT_bref": "REB_PCT"})
    df = M._fill_position_from_components(df)
    df["POS5"] = M._assign_pos5(df)
    sec = M._assign_secondary_pos(df, df["POS5"])
    if "POS_SECONDARY" in df.columns:
        b = df["POS_SECONDARY"].astype(str).str.strip().str.upper()
        df["POS5_SECONDARY"] = b.where(b.isin(["PG", "SG", "SF", "PF", "C"]), sec)
    else:
        df["POS5_SECONDARY"] = sec
    df.loc[df["POS5_SECONDARY"] == df["POS5"], "POS5_SECONDARY"] = ""
    if "overall_score" in df.columns:
        df["is_timeless"] = (df["overall_score"] >= tl_cutoff).astype(bool)
    df["_season"] = season   # eraDistFactor → getEra(_season) için (backtest'te simEra = ev era)
    score_cols = [c for c in df.columns if c.startswith("score_")]
    keep = ["PLAYER_ID", "PLAYER_NAME", "primary_arch", "overall_score", "POSITION", "POS5",
            "POS5_SECONDARY", "TEAM_ABBREVIATION", "GP", "MIN", "PTS", "REB", "AST",
            "STL", "BLK", "TOV", "FG3_PCT", "REB_PCT", "is_timeless", "_season"] + score_cols
    keep = [c for c in keep if c in df.columns]
    return df[keep].copy()


def real_records(season: str):
    """(wins_dict, games) döndürür. games = sezon uzunluğu (82; 1998-99=50,
    2019-20≈72, 2020-21=72 kısaltılmış) → harness win%'e normalize edebilsin.
    1) 1996-97+ : hist_merged, tam-sezon oyuncunun W'si (max W per takım), sıfır-fetch.
    2) pre-1996 : fetch_standings.py'nin data/<sezon>__team_wins.parquet dosyası."""
    p = ROOT / "data" / f"{season}__hist_merged.parquet"
    if p.exists():
        m = pd.read_parquet(p)
        if "W" in m.columns and "TEAM_ABBREVIATION" in m.columns and m["W"].notna().any():
            g = m.groupby("TEAM_ABBREVIATION")["W"].max()
            d = {str(k): int(v) for k, v in g.items() if str(k).upper() not in _MULTI}
            if "L" in m.columns:
                single = m[~m["TEAM_ABBREVIATION"].astype(str).str.upper().isin(_MULTI)]
                # min(82,...): takas TOT satırı gürültüsünü kırp; kısaltılmış sezonlar (<82) korunur
                games = min(82, int((single["W"].fillna(0) + single["L"].fillna(0)).max() or 82))
            else:
                games = 82
            if d:
                return d, (games or 82)
    p2 = ROOT / "data" / f"{season}__team_wins.parquet"
    if p2.exists():
        w = pd.read_parquet(p2)
        d = {str(r.TEAM_ABBREVIATION): int(r.WINS) for r in w.itertuples()
             if str(r.TEAM_ABBREVIATION).upper() not in _MULTI}
        games = int((w["WINS"] + w["LOSSES"]).max()) if "LOSSES" in w.columns else 82
        return d, (games or 82)
    return {}, 82


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # Affinity matrisi (oyunun /api/affinity ile aldığı harmanlı matris)
    aff = M.get_affinity_endpoint()
    (OUT / "affinity_matrix.json").write_text(
        json.dumps({"matrix": aff.get("matrix", {}), "archetypes": aff.get("archetypes", [])}),
        encoding="utf-8")
    print(f"✓ affinity_matrix.json  ({len(aff.get('archetypes', []))} arketip, kaynak={aff.get('source')})")

    index = []
    for season, (era, champ) in SEASONS.items():
        df = enrich_season(season)
        rw, games = real_records(season)
        players = M._safe(df)
        rec = {"season": season, "era": era, "champion": champ,
               "games": games, "realWins": rw, "players": players}
        (OUT / f"{season}.json").write_text(json.dumps(rec), encoding="utf-8")
        nteams = int(df["TEAM_ABBREVIATION"].nunique()) if not df.empty else 0
        print(f"✓ {season} [{era:10}] {champ}: {len(players):3} oyuncu, {nteams:2} takım, "
              f"{len(rw):2} W, {games}mac  (şampiyon {champ}={rw.get(champ, '?')}W)")
        index.append({"season": season, "era": era, "champion": champ, "games": games,
                      "players": len(players), "teams": nteams, "champWins": rw.get(champ)})
    (OUT / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"\nToplam {len(SEASONS)} sezon → {OUT}")


if __name__ == "__main__":
    main()
