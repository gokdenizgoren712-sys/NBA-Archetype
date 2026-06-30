"""
BBref player sayfalarindan birincil + ikincil pozisyon ceker.

Her oyuncu icin /players/{initial}/{slug}.html'i scrape eder,
"Position: Small Forward, Power Forward" -> ["SF", "PF"] seklinde parse eder.

Calistir:
  python src/fetch_bref_player_positions.py
  python src/fetch_bref_player_positions.py --limit 200   # test icin
  python src/fetch_bref_player_positions.py --force       # cache'i yeniden cek

Cikti: data/bref_player_positions.parquet
       (PLAYER_NAME, BREF_SLUG, POS_PRIMARY, POS_SECONDARY, POS_ALL)
"""

import sys
import time
import json
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import requests
from bs4 import BeautifulSoup
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "src"))

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NbaArchetypeResearch/1.0; educational use only)"
    )
}
SLEEP = 2.5  # BBref rate limit

# Pozisyon string -> standart kod
POS_MAP = {
    "point guard": "PG",
    "shooting guard": "SG",
    "small forward": "SF",
    "power forward": "PF",
    "center": "C",
    "forward": "SF",   # genellikle SF
    "guard": "SG",     # genellikle SG
    "forward-center": "PF",
    "center-forward": "C",
    "guard-forward": "SG",
    "forward-guard": "SF",
}


def _parse_positions(text: str) -> list:
    """
    'Small Forward, Power Forward, Point Guard' ->  ['SF', 'PF', 'PG']
    """
    if not text:
        return []
    # "and" ile ayir, virgul ile ayir
    text = text.lower().replace(" and ", ",").replace("\n", " ")
    parts = [p.strip() for p in text.split(",") if p.strip()]
    result = []
    for p in parts:
        code = POS_MAP.get(p)
        if code and code not in result:
            result.append(code)
    return result


def fetch_player_positions(slug: str) -> list:
    """
    BBref slug'dan pozisyon listesi ceker.
    slug ornek: 'j/jamesle01'
    """
    initial = slug.split("/")[0] if "/" in slug else slug[0]
    url = f"https://www.basketball-reference.com/players/{initial}/{slug.split('/')[-1]}.html"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code != 200:
            return []
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
        for p_tag in soup.find_all("p"):
            txt = p_tag.get_text()
            if "Position" in txt:
                # "Position:\n  Small Forward, Power Forward" seklinde
                after = txt.split("Position:")[-1]
                # Shoots: veya Handedness: ile kesilir
                for stop in ["Shoots:", "Handedness:", "Born:", "Nationality:", "▪"]:
                    if stop in after:
                        after = after[:after.index(stop)]
                return _parse_positions(after.strip())
    except Exception as e:
        print(f"    [HATA] {slug}: {e}")
    return []


def build_player_positions(limit: int = 0, force: bool = False) -> pd.DataFrame:
    out_p = DATA / "bref_player_positions.parquet"

    # Mevcut cache'i yukle (resume destegi)
    existing = {}
    if out_p.exists() and not force:
        ex_df = pd.read_parquet(out_p)
        existing = dict(zip(ex_df["BREF_SLUG"], ex_df["POS_ALL"]))
        print(f"  Mevcut cache: {len(existing)} oyuncu")

    # historical__labeled'daki oyuncular + bref_pergame'deki slug'lar
    slug_map = {}  # slug -> player_name

    # Tum bref_pergame dosyalarindan slug topla
    for f in sorted(DATA.glob("*bref_pergame.parquet")):
        df = pd.read_parquet(f)
        if "BREF_SLUG" in df.columns and "PLAYER_NAME" in df.columns:
            for _, row in df[["PLAYER_NAME", "BREF_SLUG"]].drop_duplicates("BREF_SLUG").iterrows():
                slug = str(row["BREF_SLUG"] or "").strip()
                if slug:
                    slug_map[slug] = row["PLAYER_NAME"]

    print(f"  Toplam unique oyuncu slug: {len(slug_map)}")

    # Zaten cekilmisleri atla
    todo = [(slug, name) for slug, name in slug_map.items() if slug not in existing]
    print(f"  Cekilecek: {len(todo)}")
    if limit:
        todo = todo[:limit]
        print(f"  Limit uygulanidi: {limit}")

    est_min = len(todo) * SLEEP / 60
    print(f"  Tahmini sure: {est_min:.0f} dakika")

    new_rows = []
    for i, (slug, name) in enumerate(todo):
        if i % 50 == 0 and i > 0:
            # Ara kayit
            _save(existing, new_rows, slug_map, out_p)
            print(f"  [{i}/{len(todo)}] ara kayit yapildi")

        positions = fetch_player_positions(slug)
        existing[slug] = positions
        new_rows.append({
            "PLAYER_NAME": name,
            "BREF_SLUG": slug,
            "POS_PRIMARY": positions[0] if len(positions) > 0 else "",
            "POS_SECONDARY": positions[1] if len(positions) > 1 else "",
            "POS_ALL": positions,
        })
        print(f"  [{i+1}/{len(todo)}] {name}: {positions}")
        time.sleep(SLEEP)

    _save(existing, new_rows, slug_map, out_p)
    return pd.read_parquet(out_p)


def _save(existing: dict, new_rows: list, slug_map: dict, out_p: Path):
    """Mevcut + yeni verileri birlestirip kaydet."""
    rows = []
    for slug, positions in existing.items():
        name = slug_map.get(slug, "")
        pos_list = list(positions) if positions is not None else []
        rows.append({
            "PLAYER_NAME": name,
            "BREF_SLUG": slug,
            "POS_PRIMARY": pos_list[0] if len(pos_list) > 0 else "",
            "POS_SECONDARY": pos_list[1] if len(pos_list) > 1 else "",
            "POS_ALL": pos_list,
        })
    df = pd.DataFrame(rows).drop_duplicates("BREF_SLUG")
    df.to_parquet(out_p)
    print(f"  Kaydedildi: {len(df)} oyuncu -> {out_p.name}")


def patch_position_lookup(player_pos_df: pd.DataFrame) -> None:
    """
    position_lookup.parquet'taki POS_SECONDARY'yi BBref player page verisiyle gunceller.
    Ayni zamanda historical__labeled.parquet'e de uygular.
    """
    lkp_p = DATA / "position_lookup.parquet"
    if not lkp_p.exists():
        print("  position_lookup.parquet bulunamadi")
        return

    lkp = pd.read_parquet(lkp_p)
    # BREF_SLUG'a gore join yapabilmek icin bref_pergame dosyalarindan slug ekle
    slug_name = {}
    for f in sorted(DATA.glob("*bref_pergame.parquet")):
        df = pd.read_parquet(f)
        if "BREF_SLUG" in df.columns:
            for _, row in df[["PLAYER_NAME", "BREF_SLUG"]].iterrows():
                if row["BREF_SLUG"]:
                    slug_name[row["PLAYER_NAME"]] = str(row["BREF_SLUG"])

    lkp["_slug"] = lkp["PLAYER_NAME"].map(slug_name)

    pos_map = dict(zip(player_pos_df["BREF_SLUG"], zip(
        player_pos_df["POS_PRIMARY"], player_pos_df["POS_SECONDARY"]
    )))

    def _get_primary(row):
        slug = row.get("_slug")
        if slug and slug in pos_map:
            return pos_map[slug][0]
        return row.get("POS_PRIMARY", row.get("POSITION", ""))

    def _get_secondary(row):
        slug = row.get("_slug")
        if slug and slug in pos_map:
            return pos_map[slug][1]
        return row.get("POS_SECONDARY", "")

    lkp["POS_PRIMARY"] = lkp.apply(_get_primary, axis=1)
    lkp["POS_SECONDARY"] = lkp.apply(_get_secondary, axis=1)
    lkp.drop(columns=["_slug"], inplace=True, errors="ignore")
    lkp.to_parquet(lkp_p)
    print(f"  position_lookup.parquet guncellendi: {len(lkp)} kayit")

    # historical__labeled.parquet'e de uygula
    hist_p = DATA / "historical__labeled.parquet"
    if hist_p.exists():
        from build_position_lookup import patch_historical
        patch_historical(lkp)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Test icin ilk N oyuncu")
    parser.add_argument("--force", action="store_true", help="Cache sifirla")
    parser.add_argument("--patch-only", action="store_true",
                        help="Sadece position_lookup'u guncelle (scrape yapma)")
    args = parser.parse_args()

    if args.patch_only:
        p = DATA / "bref_player_positions.parquet"
        if p.exists():
            print("=== Patch Only ===")
            patch_position_lookup(pd.read_parquet(p))
        else:
            print("bref_player_positions.parquet bulunamadi")
        sys.exit(0)

    print("=== BBref Player Pozisyon Scraper ===")
    df = build_player_positions(limit=args.limit, force=args.force)
    print(f"\n  Toplam: {len(df)} oyuncu")

    print("\n=== position_lookup Guncelleme ===")
    patch_position_lookup(df)
    print("\nTamamlandi.")
