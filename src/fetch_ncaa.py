"""
NCAA D-I veri çekme (v3.x çok-lig).

Kaynak: barttorvik.com `getadvstats.php` — TÜM D-I oyuncularının tempo-free
advanced + ham box istatistikleri TEK istekte (JSON dizi-dizisi, ~5000 satır,
67 kolon). 67 kolon aritmetik kimliklerle çözüldü (bkz. eşleme aşağıda) ve
nba_api adlarına map'lenir ki AYNI skor motoru (build_score_table + FALLBACK
imzaları) hiç değişmeden çalışsın — tıpkı EuroLeague/G-League gibi.

Not: CBBpy (ESPN box-score scraper) sezon-seviyesi hazır stat vermiyor (maç-maç
scrape gerektirir); Torvik zaten onun sezon çıktısının süperseti. CBBpy ileride
maç-log / play-by-play özelliği için saklanıyor.

Kullanım:
    python src/fetch_ncaa.py                 # varsayılan 2025-26
    python src/fetch_ncaa.py --season 2024-25
"""

import sys, json, time, urllib.request
from pathlib import Path

import pandas as pd

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "config"))

# Rotasyon filtresi: gürültüyü (kısa süre oynayanlar) at, persantil havuzunu temiz tut.
# GP≥10 & MPG≥5: rotasyon minimumu korunur ama kapsam genişler (~3457→3903).
MIN_GP  = 10
MIN_MPG = 5.0

# SOS: konferans gücüne göre üretim iskontosu. En güçlü konf → 1.0, en zayıf → 1-K_SOS.
# K_SOS varsayılan; P5 backtest'te NBA-sonucu yordama gücüne göre ayarlanacak.
K_SOS = 0.15

# Torvik rol etiketi ([64]) → engine NBA_POSITION_MAP anahtarı
ROLE_MAP = {
    "Pure PG":    "Guard",
    "Scoring PG": "Guard",
    "Combo G":    "Guard",
    "Wing G":     "Guard-Forward",   # {Guard, Wing}
    "Wing F":     "Forward-Guard",   # {Forward, Wing}
    "Stretch 4":  "Forward",
    "PF/C":       "Forward-Center",  # {Big, Forward}
    "C":          "Center",          # {Big, Center}
}

# Torvik getadvstats kolon indeksleri (aritmetik kimliklerle doğrulandı)
# [0]isim [1]takım [2]konf [3]GP [4]Min% [5]ORtg [6]usg [7]eFG% [8]TS%
# [9]ORB% [10]DRB% [11]AST% [12]TO% [13]FTM [14]FTA [15]FT% [16]2PM [17]2PA [18]2P%
# [19]3PM [20]3PA [21]3P% [22]BLK% [23]STL% [24]FTr [25]sınıf [26]boy
# [32]id [36]rimM [54]MPG [57]OREB/g [58]DREB/g [59]REB/g [60]AST/g [61]STL/g
# [62]BLK/g [63]PTS/g [64]rol


def _season_year(season_label: str) -> int:
    """'2025-26' → 2026 (Torvik sezon-bitiş yılını ister)."""
    return int(season_label.split("-")[0]) + 1


def _cache_path(season: str, name: str) -> Path:
    safe = season.replace("/", "-")
    return DATA_DIR / f"ncaa__{safe}__{name}.parquet"


def _f(v, default=0.0):
    """Güvenli float (None/'' → default)."""
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _height_in(s) -> float:
    """'6-1' → 73 inç. Bozuksa 0."""
    try:
        ft, inch = str(s).split("-")
        return int(ft) * 12 + int(inch)
    except Exception:
        return 0.0


def _age_on(birth_str, ref_date) -> float:
    """'1999-10-15' + referans tarih → yaş (yıl, 1 ondalık). Bozuksa None."""
    try:
        from datetime import date
        y, m, d = map(int, str(birth_str).split("-"))
        return round((ref_date - date(y, m, d)).days / 365.25, 1)
    except Exception:
        return None


def _fetch_raw(year: int) -> list:
    """Torvik getadvstats — ham JSON (cache'li)."""
    raw_p = DATA_DIR / f"ncaa__torvik_raw__{year}.json"
    if raw_p.exists():
        return json.loads(raw_p.read_text(encoding="utf-8"))
    url = f"https://barttorvik.com/getadvstats.php?year={year}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    print(f"  Torvik çekiliyor: {url}")
    data = json.load(urllib.request.urlopen(req, timeout=60))
    raw_p.write_text(json.dumps(data), encoding="utf-8")
    time.sleep(0.5)
    return data


def _conf_strength(year: int) -> dict:
    """Konferans gücü = üye takımların ortalama AdjEM'i. Torvik getgamestats'ten
    ([27] = maç-bazlı opponent-adjusted marj) türetilir. Dönüş: {conf: adjem}.
    getgamestats CSV cache'lenir (~5MB)."""
    import csv, io
    import numpy as np
    from collections import defaultdict
    games_p = DATA_DIR / f"ncaa__torvik_games__{year}.csv"
    if games_p.exists():
        txt = games_p.read_text(encoding="utf-8")
    else:
        url = f"https://barttorvik.com/getgamestats.php?year={year}&csv=1"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        print(f"  Torvik maç-stats çekiliyor (SOS): {url}")
        txt = urllib.request.urlopen(req, timeout=90).read().decode("utf-8", "ignore")
        games_p.write_text(txt, encoding="utf-8")
        time.sleep(0.5)
    team_margins = defaultdict(list); team_conf = {}
    for r in csv.reader(io.StringIO(txt)):
        try:
            team_margins[r[2]].append(float(r[27])); team_conf[r[2]] = r[3]
        except Exception:
            continue
    team_adjem = {t: float(np.mean(m)) for t, m in team_margins.items() if len(m) >= 5}
    conf_teams = defaultdict(list)
    for t, ae in team_adjem.items():
        conf_teams[team_conf[t]].append(ae)
    return {c: float(np.mean(v)) for c, v in conf_teams.items() if len(v) >= 2}


def fetch_ncaa(season_label: str = "2025-26") -> pd.DataFrame:
    from datetime import date
    year = _season_year(season_label)
    rows = _fetch_raw(year)
    draft_ref = date(year, 6, 25)   # ~draft gecesi → prospect yaşı bu referansla

    conf_str = _conf_strength(year)   # {conf: AdjEM} — SOS için
    if conf_str:
        _amax, _amin = max(conf_str.values()), min(conf_str.values())
        _arange = (_amax - _amin) or 1.0
    else:
        _amax = _amin = 0.0; _arange = 1.0

    recs = []
    for r in rows:
        gp  = _f(r[3])
        mpg = _f(r[54])
        if gp < MIN_GP or mpg < MIN_MPG:
            continue

        # ham box → PER-GAME (NBA/G-League ile AYNI konvansiyon; imzalar per-game
        # NBA'de kalibre). Torvik atış sayıları [13-20] SEZON TOPLAMI → /GP ;
        # [57-63] zaten per-game verilir.
        ftm, fta = _f(r[13]) / gp, _f(r[14]) / gp
        fg2m, fg2a = _f(r[16]) / gp, _f(r[17]) / gp
        fg3m, fg3a = _f(r[19]) / gp, _f(r[20]) / gp
        fgm, fga = fg2m + fg3m, fg2a + fg3a
        pts  = _f(r[63])
        oreb = _f(r[57]); dreb = _f(r[58]); reb = _f(r[59])
        ast  = _f(r[60]); stl = _f(r[61]); blk = _f(r[62])

        # TOV per-game: TO%[12] tanımından — TOV = TO%·(FGA+0.44·FTA)/(1-TO%)
        to_frac = _f(r[12]) / 100.0
        tov = to_frac * (fga + 0.44 * fta) / (1 - to_frac) if 0 < to_frac < 0.99 else 0.0

        poss = fga + 0.44 * fta + tov       # per-game
        rim_m = _f(r[36]) / gp   # rim (paint) yapılan per-game → PCT_PTS_PAINT için

        recs.append({
            "PLAYER_ID":          str(int(_f(r[32]))) or r[0],
            "PLAYER_NAME":        r[0],
            "TEAM_ABBREVIATION":  r[1],
            "CONFERENCE":         r[2],
            "CONF_ADJEM":         conf_str.get(r[2]),
            "SOS_FACTOR":         (1 - K_SOS * (_amax - conf_str[r[2]]) / _arange)
                                  if r[2] in conf_str else 1.0,
            "CLASS":              r[25],
            "AGE":                _age_on(r[66], draft_ref),
            "BIRTHDATE":          r[66],
            "IMAGE_URL":          "",
            "POSITION":           ROLE_MAP.get(r[64], "Forward"),
            "TORVIK_ROLE":        r[64],
            "PLAYER_HEIGHT_INCHES": _height_in(r[26]),
            # ham box (sezon toplamı)
            "GP":   gp,
            "MIN":  mpg,
            "PTS":  pts, "REB": reb, "OREB": oreb, "DREB": dreb,
            "AST":  ast, "STL": stl, "BLK": blk, "TOV": tov,
            "FGM":  fgm, "FGA": fga, "FG3M": fg3m, "FG3A": fg3a,
            "FTM":  ftm, "FTA": fta,
            "FG_PCT":  (fgm / fga) if fga else 0.0,
            "FG3_PCT": _f(r[21]),
            "FT_PCT":  _f(r[15]),
            # advanced (oran → fraction, nba_api konvansiyonu)
            "USG_PCT":   _f(r[6]) / 100.0,
            "TS_PCT":    _f(r[8]) / 100.0,
            "EFG_PCT":   _f(r[7]) / 100.0,
            "AST_PCT":   _f(r[11]) / 100.0,
            "OREB_PCT":  _f(r[9]) / 100.0,
            "DREB_PCT":  _f(r[10]) / 100.0,
            "REB_PCT":   (_f(r[9]) + _f(r[10])) / 2.0 / 100.0,
            "STL_PCT":   _f(r[23]) / 100.0,
            "BLK_PCT":   _f(r[22]) / 100.0,
            "OFF_RATING": _f(r[5]),
            "MIN_PCT":   _f(r[4]) / 100.0,
            "POSS":      poss,
            # play-type türevleri (motor FALLBACK'te kullanır)
            "PCT_PTS_3PT":   (3 * fg3m / pts) if pts else 0.0,
            "PCT_PTS_PAINT": (2 * rim_m * gp / pts) if pts else 0.0,
            # basit verimlilik indeksi (EuroLeague PIR muadili, display)
            "PIR": (pts + reb + ast + stl + blk) - (fga - fgm) - (fta - ftm) - tov,
        })

    df = pd.DataFrame(recs)
    return df.reset_index(drop=True)


def run(season_label: str = "2025-26"):
    merged_p = _cache_path(season_label, "merged")
    if merged_p.exists():
        print(f"[cache] Merged mevcut: {merged_p.name} (silip yeniden çekebilirsin)")
    else:
        df = fetch_ncaa(season_label)
        if df.empty:
            print("[HATA] Boş veri döndü — sezon/yıl kontrol et")
            return
        try:
            from compute_bpm import compute_bpm
            df = compute_bpm(df)
            print("  BPM proxy hesaplandı")
        except Exception as e:
            print(f"  [UYARI] BPM proxy: {e}")
        df.to_parquet(merged_p)
        print(f"[OK] Merged: {merged_p.name} ({len(df)} oyuncu, {df.shape[1]} kolon)")

    scores_p = _cache_path(season_label, "player_scores")
    if scores_p.exists():
        print(f"[cache] Scores mevcut: {scores_p.name}")
    else:
        print("Skor tablosu hesaplanıyor (FALLBACK imzaları)...")
        from score_compat import build_score_table
        st = build_score_table(season_label, league="ncaa")
        st.to_parquet(scores_p)
        print(f"[OK] Scores: {scores_p.name} ({len(st)} oyuncu)")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="NCAA D-I veri çekici (Torvik)")
    ap.add_argument("--season", default="2025-26")
    args = ap.parse_args()
    run(args.season)
