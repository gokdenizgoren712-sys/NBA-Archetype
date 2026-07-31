"""
Basketball Reference'dan oyuncu pozisyon + OBPM/DBPM verisi çeker.

BBR, nba_api'den farklı olarak PG/SG/SF/PF/C ayrımını gerçek oyun rolüne göre yapar
(ör. Wembanyama → C, nba_api "Forward-Center" diyor ama BBR C gösterir).
Ayrıca OBPM (Offensive Box Plus/Minus) ve DBPM (Defensive Box Plus/Minus) metrikleri
de BBR'den çekilir — nba_api'de bu metrikler yoktur.

Kullanım:
    python src/fetch_bref_positions.py
"""

import time
import re
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# BBR sezon yılı: 2025-26 sezonu → URL'de NBA_2026
BBR_YEAR     = 2026   # varsayılan: canlı/güncel sezon (geriye dönük uyumluluk)


def _bbr_urls(bbr_year: int) -> tuple[str, str]:
    return (
        f"https://www.basketball-reference.com/leagues/NBA_{bbr_year}_per_game.html",
        f"https://www.basketball-reference.com/leagues/NBA_{bbr_year}_advanced.html",
    )


def _bbr_cache_paths(bbr_year: int) -> tuple[Path, Path]:
    return (
        DATA / f"bref_positions_{bbr_year}.parquet",
        DATA / f"bref_advanced_{bbr_year}.parquet",
    )


BBR_URL, BBR_ADV_URL = _bbr_urls(BBR_YEAR)
CACHE, CACHE_ADV = _bbr_cache_paths(BBR_YEAR)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

# BBR pozisyon → standart 5 pozisyon
_BBR_POS_MAP = {
    "PG": "PG", "SG": "SG", "SF": "SF", "PF": "PF", "C": "C",
    # çift pozisyonlar: birincisi öncelikli
    "PG-SG": "PG", "SG-PG": "SG", "SG-SF": "SG", "SF-SG": "SF",
    "SF-PF": "SF", "PF-SF": "PF", "PF-C": "PF",  "C-PF": "C",
    "PG-SF": "PG", "SF-PG": "SF",
}


def _normalize_name(name: str) -> str:
    """Aksan/karakter normalizasyonu (BBR vs nba_api isim eşleştirme için)."""
    import unicodedata
    s = unicodedata.normalize("NFKD", str(name))
    s = s.encode("ascii", "ignore").decode("ascii")
    # noktalama ve suffix temizle (Jr., Sr., II, III, IV)
    import re
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[.\-]", " ", s)   # nokta ve tire → boşluk
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


# BBR adı → nba_api adı için manuel overrides (format farkı çok büyük olanlar)
_MANUAL_MAP: dict[str, str] = {
    # bref_norm: nba_api_norm
    "a j green":        "aj green",
    "adama alpha bal":  "adama bal",
    "daron holmes":     "daron holmes",        # II suffix
    "darius brown":     "darius brown",        # BBR "II" suffix
    "robert williams":  "robert williams",     # III suffix
    "ron holland":      "ronald holland",
    "tre scott":        "trevon scott",
    "jimmy butler":     "jimmy butler",        # BBR sade, nba_api "III" li
    "trey jemison":     "trey jemison",        # III suffix
    "walter clayton":   "walter clayton",      # Jr. suffix
    "xavier tillman":   "xavier tillman",      # Sr. suffix
    "gg jackson":       "gg jackson",          # II suffix
    "egor dmin":        "egor demin",          # BBR Kiril-yo vs nba_api Latin-e-umlaut
}


def fetch_bref_positions(use_cache: bool = True, bbr_year: int = BBR_YEAR) -> pd.DataFrame:
    """
    BBR per-game sayfasından oyuncu adı + BBR pozisyonu çeker.
    bbr_year: BBR'nin sezon-bitiş-yılı formatı (2025-26 sezonu -> 2026,
    2013-14 sezonu -> 2014) — tarihsel sezonları geriye dönük çekebilmek için.

    Dönen DataFrame sütunları:
        bref_name       : BBR ismi (ASCII normalize)
        bref_pos_raw    : BBR ham pozisyon (ör. "C", "PF-C", "SG-SF")
        bref_pos        : 5 pozisyona indirilmiş (PG/SG/SF/PF/C)
    """
    url, _ = _bbr_urls(bbr_year)
    cache, _ = _bbr_cache_paths(bbr_year)
    if use_cache and cache.exists():
        print(f"[bref] Cache yüklendi: {cache.name}")
        return pd.read_parquet(cache)

    print(f"[bref] Cekiliyor: {url}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    # requests bazen Latin-1 varsayar; BBR UTF-8 gonderir
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", {"id": "per_game_stats"})
    if table is None:
        raise RuntimeError("BBR tablosu bulunamadı — sayfa yapısı değişmiş olabilir.")

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        # Başlık satırlarını atla
        if "class" in tr.attrs and "thead" in tr.attrs["class"]:
            continue
        td_pos  = tr.find("td", {"data-stat": "pos"})
        td_name = tr.find("td", {"data-stat": "name_display"})
        if td_pos is None or td_name is None:
            continue
        name    = td_name.get_text(strip=True)
        pos_raw = td_pos.get_text(strip=True)
        if not name or not pos_raw:
            continue
        rows.append({"bref_name": name, "bref_pos_raw": pos_raw})

    df = pd.DataFrame(rows).drop_duplicates("bref_name")
    df["bref_pos"] = df["bref_pos_raw"].map(_BBR_POS_MAP).fillna("SF")

    df.to_parquet(cache)
    print(f"[bref] {len(df)} oyuncu kaydedildi -> {cache.name}")
    return df


def fetch_bref_advanced(use_cache: bool = True, bbr_year: int = BBR_YEAR) -> pd.DataFrame:
    """
    BBR advanced stats sayfasından OBPM ve DBPM çeker.
    bbr_year: bkz. fetch_bref_positions().
    Dönen DataFrame: bref_name, OBPM, DBPM, BPM
    """
    _, url = _bbr_urls(bbr_year)
    _, cache = _bbr_cache_paths(bbr_year)
    if use_cache and cache.exists():
        print(f"[bref-adv] Cache yuklendi: {cache.name}")
        return pd.read_parquet(cache)

    print(f"[bref-adv] Cekiliyor: {url}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", {"id": "advanced"})
    if table is None:
        raise RuntimeError("BBR advanced tablosu bulunamadi — sayfa yapisi degismis olabilir.")

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "class" in tr.attrs and "thead" in tr.attrs["class"]:
            continue
        td_name = tr.find("td", {"data-stat": "name_display"})
        td_obpm = tr.find("td", {"data-stat": "obpm"})
        td_dbpm = tr.find("td", {"data-stat": "dbpm"})
        td_bpm  = tr.find("td", {"data-stat": "bpm"})
        if td_name is None:
            continue
        name = td_name.get_text(strip=True)
        if not name:
            continue
        def _float(td):
            try: return float(td.get_text(strip=True))
            except: return None
        rows.append({
            "bref_name": name,
            "OBPM": _float(td_obpm),
            "DBPM": _float(td_dbpm),
            "BPM":  _float(td_bpm),
        })

    # Birden fazla takımda oynayan oyuncular için son satırı (total) tut
    df = pd.DataFrame(rows)
    df = df.groupby("bref_name", as_index=False).last()
    df.to_parquet(cache)
    print(f"[bref-adv] {len(df)} oyuncu kaydedildi -> {cache.name}")
    return df


def merge_bref_positions(season: str = "2025-26") -> pd.DataFrame:
    """
    Mevcut merged parquet'e BBR pozisyonunu ekler; eşleşemeyen oyuncular
    için orijinal nba_api POSITION string'i korunur.

    bref_pos sütunu, _assign_pos5()'in POSITION sütunu yerine kullanılacak.
    """
    safe   = season.replace("/", "-")
    merged = DATA / f"{safe}__merged.parquet"
    if not merged.exists():
        raise FileNotFoundError(f"{merged} bulunamadı — önce fetch_data.py çalıştır.")

    bbr_year = int(season.split("-")[0]) + 1   # "2023-24" -> 2024 (BBR sezon-bitiş formatı)
    df   = pd.read_parquet(merged)
    bref = fetch_bref_positions(bbr_year=bbr_year)
    adv  = fetch_bref_advanced(bbr_year=bbr_year)

    # İsim normalizasyonu
    df["_norm"]   = df["PLAYER_NAME"].apply(_normalize_name)
    bref["_norm"] = bref["bref_name"].apply(_normalize_name)
    adv["_norm"]  = adv["bref_name"].apply(_normalize_name)

    # Manuel mapping her iki BBR tablosuna da uygula
    bref["_norm"] = bref["_norm"].apply(lambda x: _MANUAL_MAP.get(x, x))
    adv["_norm"]  = adv["_norm"].apply(lambda x: _MANUAL_MAP.get(x, x))

    # Pozisyon merge
    df = df.merge(bref[["_norm", "bref_pos_raw", "bref_pos"]], on="_norm", how="left")

    # OBPM/DBPM/BPM merge — df, fetch_data.py'nin compute_bpm() proxy'sinden
    # (NBA'de gerçek-vs-proxy kalibrasyon karşılaştırması için eklendi) zaten
    # OBPM/DBPM/BPM içerebiliyor. İsim çakışması yüzünden pandas.merge bunları
    # sessizce _x/_y suffix'ine düşürüp bare "OBPM"/"BPM" kolonunu YOK ediyordu
    # — sonra build_score_table()'daki "OBPM yoksa proxy hesapla" fallback'i
    # tetikleniyor, gerçek B-Ref BPM'i (Jokić 14.2) sessizce proxy'ye (9.08)
    # düşürüyordu (2026-07 modifier denetiminde bulundu). Gerçek B-Ref DEĞERİ
    # HER ZAMAN önceliklidir; proxy yalnızca eşleşmeyen oyuncular için fallback.
    proxy_cols = [c for c in ("OBPM", "DBPM", "BPM") if c in df.columns]
    if proxy_cols:
        proxy = df[["_norm"] + proxy_cols].rename(columns={c: f"{c}_proxy" for c in proxy_cols})
        df = df.drop(columns=proxy_cols)
        df = df.merge(adv[["_norm", "OBPM", "DBPM", "BPM"]], on="_norm", how="left")
        df = df.merge(proxy, on="_norm", how="left")
        for c in proxy_cols:
            df[c] = df[c].fillna(df[f"{c}_proxy"])
        df = df.drop(columns=[f"{c}_proxy" for c in proxy_cols])
    else:
        df = df.merge(adv[["_norm", "OBPM", "DBPM", "BPM"]], on="_norm", how="left")
    df = df.drop(columns=["_norm"])

    # Eşleşemeyen → bref_pos boş, nba_api string'i korunur
    n_matched = df["bref_pos"].notna().sum()
    n_total   = len(df)
    print(f"[bref] Eşleşen: {n_matched}/{n_total} oyuncu")

    # Kaç tanesi eşleşmedi?
    unmatched = df[df["bref_pos"].isna()]["PLAYER_NAME"].tolist()
    if unmatched:
        safe_names = [n.encode("ascii","replace").decode() for n in unmatched[:10]]
        print(f"[bref] Eslesmeyen ({len(unmatched)}): {safe_names}{'...' if len(unmatched)>10 else ''}")

    merged_out = DATA / f"{safe}__merged_bref.parquet"
    df.to_parquet(merged_out)
    print(f"[bref] Guncellendi -> {merged_out.name}")
    return df


if __name__ == "__main__":
    df = merge_bref_positions("2025-26")

    # Kritik oyuncuların pozisyonunu kontrol et
    check = ["Victor Wembanyama", "Joel Embiid", "Nikola Jokic", "LeBron James",
             "Dyson Daniels", "Jayson Tatum", "Shai Gilgeous-Alexander"]
    sub = df[df["PLAYER_NAME"].isin(check)][["PLAYER_NAME","POSITION","bref_pos_raw","bref_pos"]]
    print("\n--- Kritik oyuncular ---")
    for _, row in sub.iterrows():
        name = row["PLAYER_NAME"].encode("ascii","replace").decode()
        print(f"  {name:<30} nba_api:{row['POSITION']:<16} bref_raw:{str(row.get('bref_pos_raw','')):>4}  bref_pos:{row.get('bref_pos','N/A')}")
