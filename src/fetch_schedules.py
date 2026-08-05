"""
"Rewrite History" — gerçek takvim verisi.

hist_merged/bref (oyuncu verisi) sadece SEZON ortalaması taşıyor, hiçbir yerde
maç-bazlı takvim (tarih/rakip/skor) yok. Bu script nba_api'nin
LeagueGameFinder'ından (team mode) her sezon için takım başına 82 satırlık
gerçek takvimi çeker: data/<sezon>__schedule.parquet
[GAME_ID, GAME_DATE, TEAM_ABBREVIATION, OPP_ABBREVIATION, IS_HOME, WL, PTS, OPP_PTS].

Kısaltma normalizasyonu (ÖNEMLİ — empirik doğrulandı, bkz. _normalize_abbrev):
LeagueGameFinder ve leaguedashplayerstats (hist_merged'in kaynağı) AYNI nba_api
içinde bile 1996-97 sınırında farklı kısaltma kullanıyor (GOS/PHL/SAN/UTH eski-
tarz vs GSW/PHI/SAS/UTA modern; PHX/PHO ise leaguegamefinder HER ZAMAN "PHX"
derken hist_merged 1995-96'ya kadar "PHO" kullanıyor). Normalize etmezsek
schedule.parquet'teki takım kısaltmaları oyuncu verisindeki TEAM_ABBREVIATION
ile join'lenemez.

Cache'li: parquet varsa atlar. Çalıştır:  python src/fetch_schedules.py
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import pandas as pd   # noqa: E402

START_YEAR = 1983
END_YEAR   = 2024   # dahil; 2024-25 en son TAMAMLANMIŞ sezon (fetch_historical.py ile aynı sınır)


def season_str(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


_FIXED_ABBREV = {"GOS": "GSW", "PHL": "PHI", "SAN": "SAS", "UTH": "UTA"}


def _normalize_abbrev(ab: str, season: str) -> str:
    if ab in _FIXED_ABBREV:
        return _FIXED_ABBREV[ab]
    if ab == "PHX":
        year = int(season.split("-")[0])
        return "PHO" if year <= 1995 else "PHX"
    return ab


def fetch_season_schedule(season: str) -> pd.DataFrame:
    from nba_api.stats.endpoints import leaguegamefinder
    df = leaguegamefinder.LeagueGameFinder(
        season_nullable=season, season_type_nullable="Regular Season",
        player_or_team_abbreviation="T",
    ).get_data_frames()[0]
    if df.empty:
        return df

    df = df[["GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_ABBREVIATION", "WL", "PTS"]].copy()
    df["TEAM_ABBREVIATION"] = df["TEAM_ABBREVIATION"].apply(lambda a: _normalize_abbrev(a, season))
    df["IS_HOME"] = df["MATCHUP"].str.contains(" vs. ")
    # Rakip kısaltmasını MATCHUP'tan çıkar ("CHI vs. IND" / "CHI @ IND" -> "IND")
    df["OPP_ABBREVIATION"] = df["MATCHUP"].str.split(r"\s(?:vs\.|@)\s", regex=True).str[1]
    df["OPP_ABBREVIATION"] = df["OPP_ABBREVIATION"].apply(lambda a: _normalize_abbrev(a, season))

    # Her GAME_ID'de iki satır var (ev+deplasman) — rakibin PTS'ini eşleştir.
    pts_by_game_team = df.set_index(["GAME_ID", "TEAM_ABBREVIATION"])["PTS"]
    def _opp_pts(row):
        try:
            return pts_by_game_team.loc[(row["GAME_ID"], row["OPP_ABBREVIATION"])]
        except KeyError:
            return None
    df["OPP_PTS"] = df.apply(_opp_pts, axis=1)

    out = df[["GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "OPP_ABBREVIATION",
              "IS_HOME", "WL", "PTS", "OPP_PTS"]].sort_values(["TEAM_ABBREVIATION", "GAME_DATE"])
    return out.reset_index(drop=True)


def main(seasons=None):
    seasons = seasons or [season_str(y) for y in range(START_YEAR, END_YEAR + 1)]
    for s in seasons:
        out = ROOT / "data" / f"{s}__schedule.parquet"
        if out.exists():
            print(f"• {s}: cache var, atlandı ({out.name})")
            continue
        try:
            sched = fetch_season_schedule(s)
        except Exception as e:
            print(f"✗ {s}: hata — {e}")
            time.sleep(1.0)
            continue
        if sched.empty:
            print(f"✗ {s}: veri yok")
            continue
        sched.to_parquet(out, index=False)
        n_teams = sched["TEAM_ABBREVIATION"].nunique()
        n_games = len(sched) // 2
        print(f"✓ {s}: {n_teams} takım, {len(sched)} satır (~{n_games} maç) → {out.name}")
        time.sleep(0.8)   # stats.nba.com rate-limit


if __name__ == "__main__":
    args = sys.argv[1:]
    main(args if args else None)
