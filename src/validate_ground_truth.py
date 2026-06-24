"""
Tarihsel ground-truth doğrulama.

30 ikonik oyuncu için beklenen arketip → gerçek primary_arch karşılaştırması.
Her oyuncu için en iyi sezonlarından birinde tahmin edilmiş arketip beklentisi.

Kullanım:
    python src/validate_ground_truth.py            # tüm mevcut tarihsel sezonlar
    python src/validate_ground_truth.py 1995-96    # belirli sezon
"""

from pathlib import Path
import pandas as pd
import sys
import unicodedata

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# (oyuncu_adı, sezon, beklenen_arketip, notlar)
GROUND_TRUTH = [
    # ── Engines ─────────────────────────────────────────────
    ("Michael Jordan",    "1995-96", "Engine",     "Peak Jordan — max USG + scoring"),
    ("Kobe Bryant",       "2005-06", "Engine",     "81-puan sezonu"),
    ("LeBron James",      "2012-13", "Engine",     "MVP sezonu"),
    ("Dwyane Wade",       "2008-09", "Engine",     "Dominant guard sezon"),
    ("Allen Iverson",     "2000-01", "Engine",     "MVP — max volume scorer"),
    ("James Harden",      "2018-19", "Engine",     "36+ ppg sezonu"),
    # ── Creators / Playmakers ────────────────────────────────
    ("Magic Johnson",     "1986-87", "Creator",    "Laker three-peat run"),
    ("John Stockton",     "1991-92", "Creator",    "Elite AST + low TO"),
    ("Steve Nash",        "2005-06", "Creator",    "Back-to-back MVP"),
    ("Chris Paul",        "2008-09", "Creator",    "Peak CP3"),
    ("Jason Kidd",        "2001-02", "Creator",    "Assist machine + deft"),
    # ── Anchors / Bigs ──────────────────────────────────────
    ("Shaquille O'Neal",  "1999-00", "Anchor",     "Peak Shaq — dominant interior"),
    ("Hakeem Olajuwon",   "1993-94", "Anchor",     "Championship year"),
    ("David Robinson",    "1994-95", "Anchor",     "Scoring + defense"),
    ("Tim Duncan",        "2001-02", "Anchor",     "All-time big"),
    ("Nikola Jokic",      "2020-21", "Anchor",     "First MVP — unique playmaking"),
    # ── Spacers / 3-and-D ───────────────────────────────────
    ("Ray Allen",         "2005-06", "Spacer",     "Elite shooter"),
    ("Reggie Miller",     "1994-95", "Spacer",     "3PT specialist"),
    ("Klay Thompson",     "2015-16", "Spacer",     "Off-ball shooter"),
    # ── Rim Runners ─────────────────────────────────────────
    ("DeAndre Jordan",    "2013-14", "Rim Runner",  "Lob target + rim protector"),
    ("Clint Capela",      "2018-19", "Rim Runner",  "Harden lob partner"),
    # ── Stoppers ────────────────────────────────────────────
    ("Scottie Pippen",    "1995-96", "Stopper",    "Elite defender + playmaker"),
    ("Gary Payton",       "1995-96", "Stopper",    "DPOY — on-ball lockdown"),
    ("Kawhi Leonard",     "2015-16", "Stopper",    "Pre-superstar DPOY era"),
    ("Dennis Rodman",     "1995-96", "Stopper",    "Pure defensive/rebounding"),
    # ── Finishers ────────────────────────────────────────────
    ("Karl Malone",       "1996-97", "Finisher",   "Elite catch-and-finish PF"),
    ("Giannis Antetokounmpo","2019-20","Force",     "MVP — baskın fiziksellik; off-ball Finisher değil, Force/Initiator"),
    # ── Connectors ──────────────────────────────────────────
    ("Draymond Green",    "2015-16", "Connector",  "Quintessential connector"),
    ("Boris Diaw",        "2013-14", "Connector",  "Playmaking big"),
    # ── Force ───────────────────────────────────────────────
    ("Charles Barkley",   "1992-93", "Force",      "MVP — physical dominance"),
]

CORE_NOUNS = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor",
              "Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"]

def _strip_accents(s: str) -> str:
    """Aksanlı karakterleri ASCII karşılıklarına dönüştürür (Jokić → Jokic)."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )

def find_player_flags(df: pd.DataFrame, name: str) -> set:
    """Oyuncunun aktif arketip bayraklarını döndürür (boolean True olanlar)."""
    # 1) tam eşleşme
    match = df[df["PLAYER_NAME"].str.lower() == name.lower()]
    # 2) aksansız eşleşme (Jokić vs Jokic, Dončić vs Doncic)
    if match.empty:
        name_ascii = _strip_accents(name).lower()
        df_ascii = df["PLAYER_NAME"].apply(lambda x: _strip_accents(str(x)).lower())
        match = df[df_ascii == name_ascii]
    # 3) kelime bazlı fuzzy
    if match.empty:
        parts = _strip_accents(name).lower().split()
        df_ascii = df["PLAYER_NAME"].apply(lambda x: _strip_accents(str(x)).lower())
        mask = pd.Series([True] * len(df), index=df.index)
        for p in parts:
            mask &= df_ascii.str.contains(p, na=False)
        match = df[mask]
    if match.empty:
        return None   # bulunamadı
    row = match.iloc[0]
    # Önce boolean flagları kontrol et (birden fazla arketip aktif olabilir)
    avail = [c for c in CORE_NOUNS if c in row.index]
    active = set()
    for c in avail:
        v = row[c]
        try:
            if pd.notna(v) and bool(v):
                active.add(c)
        except (TypeError, ValueError):
            pass
    # Boolean flag yoksa primary_arch'a bak
    if not active and "primary_arch" in row.index and pd.notna(row["primary_arch"]):
        return {str(row["primary_arch"])}
    return active

def run(target_season: str = None):
    hist_path = DATA / "historical__labeled.parquet"
    current_path = DATA / "2025-26__player_scores.parquet"

    # Tüm sezonları yükle
    frames = {}
    if hist_path.exists():
        hdf = pd.read_parquet(hist_path)
        for s, g in hdf.groupby("SEASON"):
            frames[s] = g.reset_index(drop=True)
    if current_path.exists():
        frames["2025-26"] = pd.read_parquet(current_path)

    if not frames:
        print("[HATA] Hiç parquet yok. Önce fetch_data.py veya run_validation.py çalıştır.")
        sys.exit(1)

    total = correct = not_found = wrong_arch = 0
    print(f"\n{'='*70}")
    print(f"{'Oyuncu':<28} {'Sezon':<10} {'Beklenen':<14} {'Bulunan':<14} {'Sonuç'}")
    print(f"{'='*70}")

    for name, season, expected, note in GROUND_TRUTH:
        if target_season and season != target_season:
            continue
        df = frames.get(season)
        if df is None:
            status = "SEZON YOK"
        else:
            flags = find_player_flags(df, name)
            total += 1
            if flags is None:
                status = "BULUNAMADI"
                not_found += 1
            elif expected in flags:
                status = f"OK  (aktif: {', '.join(sorted(flags))})"
                correct += 1
            else:
                flags_str = ', '.join(sorted(flags)) if flags else "hic yok"
                status = f"YANLIS -> {flags_str}"
                wrong_arch += 1

        nm = name.encode("ascii","replace").decode()
        exp = expected.encode("ascii","replace").decode()
        print(f"{nm:<28} {season:<10} {exp:<14} {status}")

    if total > 0:
        acc = correct / total * 100
        print(f"\n{'='*70}")
        print(f"Doğruluk: {correct}/{total} ({acc:.1f}%)  |  Yanlış: {wrong_arch}  |  Bulunamadı: {not_found}")
        if acc >= 80:
            print("Durum: GECER")
        elif acc >= 60:
            print("Durum: KABUL EDILEBILIR (imza iyilestirmesi onerilir)")
        else:
            print("Durum: BASARISIZ -- imzalari gozden gecir")
        print()

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    run(target)
