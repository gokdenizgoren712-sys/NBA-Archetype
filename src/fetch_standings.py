"""
G3 Backtest — takım galibiyet verisi (pre-1996 sezonlar).

1996-97 öncesi hist_merged dosyaları box-score bazlı (21-29 kolon, W YOK).
Bu script o sezonlar için nba_api LeagueStandingsV3'ten gerçek galibiyetleri çeker,
nba_api (TeamCity, TeamName) → oyuncu verisindeki bref-tarzı TEAM_ABBREVIATION'a
eşler ve data/<sezon>__team_wins.parquet [TEAM_ABBREVIATION, WINS, LOSSES] yazar.

1996-97+ için gerekmez (hist_merged'de W var; export max-W ile türetir).
Cache'li: parquet varsa atlar. Çalıştır:  python src/fetch_standings.py
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

# nba_api (TeamCity + " " + TeamName) → oyuncu verisindeki bref abbrev.
# LA'da iki takım olduğu için şehir+isim ile anahtarlanır (Lakers≠Clippers).
# SDC/KCK yalnız 1983-85; LAC/SAC sonrası. Doğrulandı: 5 sezonda abbrev sayısı
# standings sayısıyla birebir eşleşiyor.
NAME_TO_ABBREV = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Charlotte Hornets": "CHH",
    "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL",
    "Denver Nuggets": "DEN", "Detroit Pistons": "DET", "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU", "Indiana Pacers": "IND", "Kansas City Kings": "KCK",
    "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Jersey Nets": "NJN",
    "New York Knicks": "NYK", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHO", "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS", "San Diego Clippers": "SDC", "Seattle SuperSonics": "SEA",
    "Utah Jazz": "UTA", "Washington Bullets": "WSB",
}

# hist_merged'de W olmayan sezonlar (backtest örneklemindeki pre-1996 seçimleri)
DEFAULT_SEASONS = ["1983-84", "1986-87", "1990-91", "1991-92", "1994-95"]


def fetch_season_wins(season: str) -> pd.DataFrame:
    from nba_api.stats.endpoints import leaguestandingsv3
    df = leaguestandingsv3.LeagueStandingsV3(season=season, season_type="Regular Season").get_data_frames()[0]
    rows = []
    unmatched = []
    for _, r in df.iterrows():
        key = f"{r['TeamCity']} {r['TeamName']}".strip()
        ab = NAME_TO_ABBREV.get(key)
        if not ab:
            unmatched.append(key)
            continue
        rows.append({"TEAM_ABBREVIATION": ab, "WINS": int(r["WINS"]), "LOSSES": int(r["LOSSES"])})
    if unmatched:
        print(f"  ⚠ eşleşmeyen ({season}): {unmatched}")
    return pd.DataFrame(rows)


def main(seasons=None):
    seasons = seasons or DEFAULT_SEASONS
    for s in seasons:
        out = ROOT / "data" / f"{s}__team_wins.parquet"
        if out.exists():
            print(f"• {s}: cache var, atlandı ({out.name})")
            continue
        w = fetch_season_wins(s)
        if w.empty:
            print(f"✗ {s}: veri yok")
            continue
        w.to_parquet(out, index=False)
        champ = w.sort_values("WINS", ascending=False).iloc[0]
        print(f"✓ {s}: {len(w)} takım → {out.name}  (en iyi {champ.TEAM_ABBREVIATION}={champ.WINS}W)")
        time.sleep(0.8)   # stats.nba.com rate-limit


if __name__ == "__main__":
    args = sys.argv[1:]
    main(args if args else None)
