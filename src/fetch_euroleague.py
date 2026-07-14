"""
EuroLeague veri çekme (v3.6 çok-lig).

euroleague-api paketi (resmi euroleague.net feed'i) üzerinden oyuncu sezon
istatistiklerini çeker. Kolonlar nba_api adlarına eşlenir ki AYNI skor motoru
(build_score_table + FALLBACK imzaları) hiç değişmeden çalışsın.

Kurulum:
    pip install euroleague-api

Kullanım:
    python src/fetch_euroleague.py                 # varsayılan 2025-26
    python src/fetch_euroleague.py --season 2024-25
"""

import sys, time
from pathlib import Path

import pandas as pd

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))


def _season_start(season_label: str) -> int:
    """'2025-26' → 2025 (euroleague-api sezon başlangıç yılını ister)."""
    return int(season_label.split("-")[0])


def _cache_path(season: str, name: str) -> Path:
    safe = season.replace("/", "-")
    return DATA_DIR / f"euroleague__{safe}__{name}.parquet"


_ROMAN = {"Ii": "II", "Iii": "III", "Iv": "IV", "Jr.": "Jr.", "Sr.": "Sr."}

def _fix_case(s: str) -> str:
    """'VILLAR' → 'Villar', 'MCINTYRE' → 'McIntyre', roman rakamları düzelt."""
    if not s:
        return s
    out = s.title() if s.isupper() or s.islower() else s
    parts = out.split()
    fixed = []
    for w in parts:
        if w in _ROMAN:
            fixed.append(_ROMAN[w])
        elif w.startswith("Mc") and len(w) > 2:
            fixed.append("Mc" + w[2:].capitalize())
        else:
            fixed.append(w)
    return " ".join(fixed)

def _norm_name(raw: str) -> str:
    """'VILLAR, RAFA' → 'Rafa Villar' (euroleague SOYAD, AD — ikisi de büyük)."""
    if not isinstance(raw, str):
        return ""
    if "," in raw:
        last, first = [p.strip() for p in raw.split(",", 1)]
        return f"{_fix_case(first)} {_fix_case(last)}".strip()
    return _fix_case(raw.strip())


def _infer_position(row) -> str:
    """EuroLeague pozisyon vermiyor — per-game stat'tan PG/SG/SF/PF/C tahmini.
    Engine'in NOUN_POSITION_MASK'i için makul bir pozisyon yeterli."""
    # EuroLeague per-game hacmi NBA'den düşük (~30dk maç) — eşikler ona göre.
    ast = float(row.get("AST", 0) or 0)
    reb = float(row.get("REB", 0) or 0)
    blk = float(row.get("BLK", 0) or 0)
    if reb >= 4.8 or blk >= 0.8:
        return "C"
    if reb >= 3.6:
        return "PF"
    if ast >= 3.2 and reb < 3.5:
        return "PG"
    if ast >= 1.7:
        return "SG"
    return "SF"


def _pct(series: pd.Series) -> pd.Series:
    """Yüzdeleri 0-1 aralığına normalize et (euroleague bazen 0-100 döner)."""
    s = pd.to_numeric(series, errors="coerce").fillna(0)
    return (s / 100.0).where(s > 1.0, s)


def fetch_euroleague(season_label: str = "2025-26") -> pd.DataFrame:
    from euroleague_api.player_stats import PlayerStats

    yr = _season_start(season_label)
    ps = PlayerStats()

    trad = ps.get_player_stats_single_season(
        endpoint="traditional", season=yr, phase_type_code=None, statistic_mode="PerGame")
    print(f"[fetch] EuroLeague {season_label} traditional — {len(trad)} oyuncu")
    time.sleep(0.5)
    adv = ps.get_player_stats_single_season(
        endpoint="advanced", season=yr, phase_type_code=None, statistic_mode="PerGame")
    print(f"[fetch] EuroLeague {season_label} advanced — {len(adv)} oyuncu")

    out = pd.DataFrame()
    out["PLAYER_ID"]         = trad["player.code"].astype(str)
    out["PLAYER_NAME"]       = trad["player.name"].map(_norm_name)
    out["TEAM_ABBREVIATION"] = trad.get("player.team.code", trad.get("player.team.name", "")).astype(str)
    out["IMAGE_URL"]         = trad.get("player.imageUrl", "")
    if "player.age" in trad.columns:
        out["AGE"] = pd.to_numeric(trad["player.age"], errors="coerce")

    out["GP"]  = pd.to_numeric(trad["gamesPlayed"], errors="coerce").fillna(0)
    out["MIN"] = pd.to_numeric(trad["minutesPlayed"], errors="coerce").fillna(0)
    out["PTS"] = pd.to_numeric(trad["pointsScored"], errors="coerce").fillna(0)
    out["REB"] = pd.to_numeric(trad["totalRebounds"], errors="coerce").fillna(0)
    out["OREB"] = pd.to_numeric(trad["offensiveRebounds"], errors="coerce").fillna(0)
    out["DREB"] = pd.to_numeric(trad["defensiveRebounds"], errors="coerce").fillna(0)
    out["AST"] = pd.to_numeric(trad["assists"], errors="coerce").fillna(0)
    out["STL"] = pd.to_numeric(trad["steals"], errors="coerce").fillna(0)
    out["BLK"] = pd.to_numeric(trad["blocks"], errors="coerce").fillna(0)
    out["TOV"] = pd.to_numeric(trad["turnovers"], errors="coerce").fillna(0)

    fg2m = pd.to_numeric(trad["twoPointersMade"], errors="coerce").fillna(0)
    fg2a = pd.to_numeric(trad["twoPointersAttempted"], errors="coerce").fillna(0)
    fg3m = pd.to_numeric(trad["threePointersMade"], errors="coerce").fillna(0)
    fg3a = pd.to_numeric(trad["threePointersAttempted"], errors="coerce").fillna(0)
    out["FG3M"] = fg3m
    out["FG3A"] = fg3a
    out["FGM"]  = fg2m + fg3m
    out["FGA"]  = fg2a + fg3a
    out["FG_PCT"]  = (out["FGM"] / out["FGA"].replace(0, pd.NA)).fillna(0)
    out["FG3_PCT"] = _pct(trad["threePointersPercentage"])
    out["FTM"] = pd.to_numeric(trad["freeThrowsMade"], errors="coerce").fillna(0)
    out["FTA"] = pd.to_numeric(trad["freeThrowsAttempted"], errors="coerce").fillna(0)
    out["FT_PCT"] = _pct(trad["freeThrowsPercentage"])
    out["PIR"] = pd.to_numeric(trad["pir"], errors="coerce").fillna(0)

    # Advanced merge (player.code üzerinden)
    adv2 = pd.DataFrame({"PLAYER_ID": adv["player.code"].astype(str)})
    if "trueShootingPercentage" in adv.columns:
        adv2["TS_PCT"] = _pct(adv["trueShootingPercentage"])
    if "effectiveFieldGoalPercentage" in adv.columns:
        adv2["EFG_PCT"] = _pct(adv["effectiveFieldGoalPercentage"])
    if "possesions" in adv.columns:
        adv2["POSS"] = pd.to_numeric(adv["possesions"], errors="coerce").fillna(0)
    if "reboundsPercentage" in adv.columns:
        adv2["REB_PCT"] = _pct(adv["reboundsPercentage"])
    out = out.merge(adv2, on="PLAYER_ID", how="left")

    # USG proxy: takım-payı/possessions verisi yok → (FGA+0.44*FTA+TOV) hacmi MIN'e göre
    # dakika-normalize edilir (36-dk eşdeğeri), sonra [0,0.35] aralığına ölçeklenir.
    # Normalize etmeden ham hacim kullanmak, aynı toplam şut+ciroya sahip bir starter'la
    # bench oyuncusuna EŞİT usage veriyordu — az dakikada aynı hacim, gerçekte DAHA
    # yüksek usage demektir.
    if "USG_PCT" not in out.columns:
        usage = out["FGA"] + 0.44 * out["FTA"] + out["TOV"]
        min_safe = out["MIN"].replace(0, pd.NA)
        usage_per36 = (usage / min_safe * 36).fillna(0)
        out["USG_PCT"] = (usage_per36 / usage_per36.max()).fillna(0) * 0.35 if usage_per36.max() else 0

    # Pozisyon: euroleague vermiyor → stat çıkarımı (engine mask'i için)
    out["POSITION"] = out.apply(_infer_position, axis=1)

    return out.reset_index(drop=True)


def run(season_label: str = "2025-26"):
    merged_p = _cache_path(season_label, "merged")
    if merged_p.exists():
        print(f"[cache] Merged mevcut: {merged_p.name} (silip yeniden çekebilirsin)")
    else:
        df = fetch_euroleague(season_label)
        if df.empty:
            print("[HATA] Boş veri döndü — sezon henüz başlamamış olabilir")
            return
        try:
            from compute_bpm import compute_bpm
            df = compute_bpm(df)
            print("  BPM proxy hesaplandı")
        except Exception as e:
            print(f"  [UYARI] BPM proxy: {e}")
        df.to_parquet(merged_p)
        print(f"[OK] Merged: {merged_p.name} ({len(df)} oyuncu)")

    scores_p = _cache_path(season_label, "player_scores")
    if scores_p.exists():
        print(f"[cache] Scores mevcut: {scores_p.name}")
    else:
        print("Skor tablosu hesaplanıyor (FALLBACK imzaları)...")
        from score_compat import build_score_table
        st = build_score_table(season_label, league="euroleague")
        st.to_parquet(scores_p)
        print(f"[OK] Scores: {scores_p.name} ({len(st)} oyuncu)")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="EuroLeague veri çekici")
    ap.add_argument("--season", default="2025-26")
    args = ap.parse_args()
    run(args.season)
