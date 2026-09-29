# -*- coding: utf-8 -*-
"""Yahoo tarzı pozisyon uygunluğu (PG / SG / SF / PF / C).

NBA'in kendi pozisyon kodu (G, F, C, G-F, F-C ...) Yahoo'nun slotlarına
doğrudan oturmuyor: "G" bir oyuncunun PG mi SG mi olduğunu söylemiyor, ama
kadro kurarken fark ediyor (PG slotuna SG konamaz). Yahoo API'ye erişene kadar
(docs/FANTASY_PLAN.md Faz 5) uygunluğu geçen sezonun oyun profilinden
tahmin ediyoruz; bilinen sapmalar config/fantasy_position_overrides.py'ye.

Kural özeti (eşikler 2025-26 dağılımına göre: AST% medyan 0.12, üst çeyrek 0.20):
  G         : AST% ≥ 0.22 → PG · AST% ≤ 0.13 → SG · arası → PG,SG
  G-F / F-G : SG,SF (+PG, oyun kurucu profiliyse)
  F         : REB% ≥ 0.11 ya da 36 dk'da BLK ≥ 1.0 → PF · 36 dk'da 3PA ≥ 5 ve
              REB% < 0.09 → SF · arası → SF,PF
  F-C / C-F : PF,C
  C         : C (+PF, 36 dk'da 3PA ≥ 6 ise — gerçekten açılan uzunlar;
              4.0 Jokić'i PF,C yapıyordu, Yahoo onu C listeler)
İstatistik yoksa ya da örneklem küçükse (<10 maç veya <10 dk) yalnızca
NBA koduna göre geniş atama yapılır (G → PG,SG vb.).

Çıktı: data/{season}__fantasy_positions.parquet
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.fantasy_formats import POSITIONS  # noqa: E402
from config.fantasy_position_overrides import POSITION_OVERRIDES  # noqa: E402
from src.fantasy.reference import norm_name, yahoo_positions  # noqa: E402

DATA_DIR = ROOT / "data"

PG_AST, SG_AST = 0.22, 0.13
PF_REB, SF_REB = 0.11, 0.09
PF_BLK36, SF_FG3A36, C_STRETCH_FG3A36 = 1.0, 5.0, 6.0
MIN_GP, MIN_MPG = 10, 10.0

RAW_ONLY = {
    "G": ["PG", "SG"], "F": ["SF", "PF"], "C": ["C"],
    "G-F": ["SG", "SF"], "F-G": ["SG", "SF"], "F-C": ["PF", "C"], "C-F": ["PF", "C"],
}


def eligible_positions(raw: str | None, profile: dict | None) -> list[str]:
    """Tek oyuncu için uygunluk. `profile` yoksa (çaylak, az dakika) geniş atama."""
    raw = raw.strip() if isinstance(raw, str) else ""   # playerindex bazen NaN veriyor
    if raw not in RAW_ONLY:
        return []  # bilinmeyen kod: boş — build uyarı basar
    if not profile:
        return list(RAW_ONLY[raw])

    ast, reb = profile["AST_PCT"], profile["REB_PCT"]
    blk36, fg3a36 = profile["BLK36"], profile["FG3A36"]

    if raw == "G":
        if ast >= PG_AST:
            return ["PG"]
        if ast <= SG_AST:
            return ["SG"]
        return ["PG", "SG"]
    if raw in ("G-F", "F-G"):
        return (["PG"] if ast >= PG_AST else []) + ["SG", "SF"]
    if raw == "F":
        if reb >= PF_REB or blk36 >= PF_BLK36:
            return ["PF"]
        if fg3a36 >= SF_FG3A36 and reb < SF_REB:
            return ["SF"]
        return ["SF", "PF"]
    if raw in ("F-C", "C-F"):
        return ["PF", "C"]
    return (["PF"] if fg3a36 >= C_STRETCH_FG3A36 else []) + ["C"]


def load_profiles(stats_season: str) -> dict[int, dict]:
    """PLAYER_ID → oyun profili (yeterli örneklemi olanlar)."""
    base = pd.read_parquet(DATA_DIR / f"{stats_season}__player_Base.parquet")
    adv = pd.read_parquet(DATA_DIR / f"{stats_season}__player_Advanced.parquet")
    df = base[["PLAYER_ID", "GP", "MIN", "FG3A", "BLK"]].merge(
        adv[["PLAYER_ID", "AST_PCT", "REB_PCT"]], on="PLAYER_ID", how="inner")
    df = df[(df["GP"] >= MIN_GP) & (df["MIN"] >= MIN_MPG)]
    df["BLK36"] = df["BLK"] / df["MIN"] * 36
    df["FG3A36"] = df["FG3A"] / df["MIN"] * 36
    return {int(r.PLAYER_ID): {"AST_PCT": r.AST_PCT, "REB_PCT": r.REB_PCT,
                               "BLK36": r.BLK36, "FG3A36": r.FG3A36}
            for r in df.itertuples(index=False)}


def build_positions(rosters: pd.DataFrame, stats_season: str = "2025-26",
                    target_season: str = "2026-27", write: bool = True) -> pd.DataFrame:
    profiles = load_profiles(stats_season)
    yahoo_pos = yahoo_positions(target_season)
    rows = []
    for r in rosters.itertuples(index=False):
        pid = int(r.PLAYER_ID)
        if pid in POSITION_OVERRIDES:
            elig, source = list(POSITION_OVERRIDES[pid]), "override"
        elif norm_name(r.PLAYER_NAME) in yahoo_pos:
            # Yahoo'nun kendi uygunluğu (config/reference/) kural tabanlı tahminden önce gelir.
            elig, source = list(yahoo_pos[norm_name(r.PLAYER_NAME)]), "yahoo"
        else:
            prof = profiles.get(pid)
            elig = eligible_positions(r.POSITION_RAW, prof)
            # "unknown": NBA henüz pozisyon kodu vermemiş (iki yönlü / kadro
            # sınırı oyuncular). Uygunluk boş kalır, sadece Util'e yazılabilir.
            source = "unknown" if not elig else ("profile" if prof else "raw")
        rows.append({"PLAYER_ID": pid, "PLAYER_NAME": r.PLAYER_NAME,
                     "TEAM_ABBREVIATION": r.TEAM_ABBREVIATION, "POSITION_RAW": r.POSITION_RAW,
                     "ELIGIBLE": ",".join(p for p in POSITIONS if p in elig), "SOURCE": source})
    out = pd.DataFrame(rows)
    empty = out[out["ELIGIBLE"] == ""]
    if not empty.empty:
        print(f"[uyarı] {len(empty)} oyuncunun pozisyonu atanamadı: "
              f"{empty['PLAYER_NAME'].head(5).tolist()}")
    if write:
        out.to_parquet(DATA_DIR / f"{target_season}__fantasy_positions.parquet", index=False)
        print(f"[build] {target_season} pozisyon uygunluğu: {len(out)} oyuncu "
              f"({(out['SOURCE'] == 'yahoo').sum()} Yahoo, {(out['SOURCE'] == 'profile').sum()} profil, "
              f"{(out['SOURCE'] == 'raw').sum()} yalnız NBA kodu)")
    return out
