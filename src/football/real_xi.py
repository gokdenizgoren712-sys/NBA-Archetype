# -*- coding: utf-8 -*-
"""Gerçek ilk 11'ler — sahada oynanmış kadrolar + sonuçları + bizim skorumuz.

NEDEN BU SAYFA FUTBOLDA BASKETBOLDAKİNDEN ZENGİN
─────────────────────────────────────────────────
Basketbolun "Real lineups" sekmesi nba_api'nin leaguedashlineups'ından geliyor:
beşli, dakika, net rating. FotMob'da öyle bir uç nokta yok — ama cache'te her
maçın GERÇEK ilk 11'i ve skoru duruyor. Yani burada gösterebileceğimiz şey daha
fazlası: bir maçın kadrosu + o maçın sonucu + BİZİM kimya skorumuz yan yana.

Bu bir doğrulama görünümü: "bu XI'e 78 verdik, gerçekte 3-0 kazandı". Ground
truth beklerken motorun kendi kendini sınadığı tek yer.

DİKKAT — bu bir NEDENSELLİK İDDİASI DEĞİL. Tek maçın sonucu gürültüdür; sayfa
da öyle sunmalı. Anlamlı olan toplu eğilim (yüksek kimyalı XI'ler ortalamada
daha iyi sonuç alıyor mu), tek satır değil.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
CACHE = DATA / "fotmob_cache"
sys.path.insert(0, str(ROOT / "src" / "football"))
sys.path.insert(0, str(ROOT / "config"))

from affinity import lineup_fit, _match_outcomes            # noqa: E402
from fetch_fotmob import LEAGUES, EARLIEST, finished_matches, flat_stats  # noqa: E402

MAP_PATH = DATA / "fotmob_match_index.json"


def build_match_index(force=False) -> dict:
    """match_id -> (league, season). Cache'te maçın hangi sezona ait olduğu
    yazmıyor (slim cache sadece kadro+istatistik tutuyor), bu yüzden fikstür
    listelerinden bir kez indeks çıkarıyoruz. Lig-sezon başına 1 istek."""
    if MAP_PATH.exists() and not force:
        return json.loads(MAP_PATH.read_text(encoding="utf-8"))

    idx = {}
    for slug, lid in LEAGUES.items():
        try:
            import fetch_fotmob as ff
            seasons = ff.seasons_of(lid)
        except Exception:
            continue
        for season in seasons:
            if int(season.split("/")[0]) < EARLIEST[slug]:
                continue
            ms = finished_matches(lid, season)
            for m in ms:
                idx[str(m["id"])] = {"league": slug,
                                     "season": season.replace("/", "-")}
            print(f"  [{slug} {season}] {len(ms)} maç indekslendi")
            time.sleep(0.4)
    MAP_PATH.write_text(json.dumps(idx), encoding="utf-8")
    return idx


def _starters(path: Path):
    """Maç dosyasından iki takımın ilk 11'i + formasyonu."""
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    lu = (d.get("content") or {}).get("lineup") or {}
    out = {}
    for side in ("homeTeam", "awayTeam"):
        t = lu.get(side) or {}
        st = t.get("starters") or []
        if len(st) < 11:
            continue
        out[t.get("id")] = {"name": t.get("name"),
                            "formation": t.get("formation"),
                            "ids": [p.get("id") for p in st],
                            # Ev sahipliği gol modelinde gerçek bir terim —
                            # simülasyon bunu uydurmasın diye veriden geliyor.
                            "is_home": side == "homeTeam"}
    return out or None


def build(season: str, emp=None, min_known: int = 8, limit: int | None = None):
    """Bir sezonun gerçek XI'lerini skorla."""
    scores = DATA / f"football__{season}__scores.parquet"
    if not scores.exists():
        print(f"[HATA] {scores.name} yok"); return None
    sc = pd.read_parquet(scores)
    sc = sc[sc["primary_arch"].notna()]
    # oyuncu -> satır (çok fazlıysa daha çok dakikalı olanı)
    sc = sc.sort_values("MINUTES_PHASE", ascending=False)
    by_id = {int(r.PLAYER_ID): r for r in sc.itertuples()}

    idx = build_match_index()
    rows = []
    files = sorted(CACHE.glob("*.json"))
    for i, f in enumerate(files, 1):
        info = idx.get(f.stem)
        if not info or info["season"] != season:
            continue
        st = _starters(f)
        out = _match_outcomes(f)
        if not st or not out:
            continue
        for tid, blk in st.items():
            res = out.get(tid)
            if not res:
                continue
            known = [by_id[p] for p in blk["ids"] if p in by_id]
            if len(known) < min_known:
                continue
            recs = [{"PLAYER_ID": r.PLAYER_ID, "PLAYER_NAME": r.PLAYER_NAME,
                     "PHASE": r.PHASE, "POSITION": r.POSITION,
                     "primary_arch": r.primary_arch,
                     "primary_score": r.primary_score,
                     "overall_score": r.overall_score} for r in known]
            fit = lineup_fit(recs, emp)
            if "error" in fit:
                continue
            gf, ga = res["scored"], res["conceded"]
            rows.append({
                "match_id": f.stem, "season": season,
                "league": info["league"], "team": blk["name"],
                "formation": blk["formation"], "is_home": blk["is_home"],
                "known_players": len(known),
                "chemistry": fit["score"], "slots": fit["slots"],
                "pairs": fit["pairs"], "diversity": fit.get("diversity"),
                "strongest": fit["strongest"], "weakest": fit["weakest"],
                "goals_for": gf, "goals_against": ga, "goal_diff": gf - ga,
                "result": "W" if gf > ga else "D" if gf == ga else "L",
                # xG: gölden çok daha düşük varyanslı sonuç ölçütü — kimya gibi
                # küçük etkiler golde gürültüye gömülüyor.
                "xg_for": res.get("xg"), "xg_against": res.get("xg_against"),
                "xg_diff": (None if res.get("xg") is None or res.get("xg_against") is None
                            else res["xg"] - res["xg_against"]),
                "avg_quality": float(pd.Series(
                    [r["overall_score"] for r in recs]).mean()),
                "players": json.dumps([r["PLAYER_NAME"] for r in recs],
                                      ensure_ascii=False),
                "archetypes": json.dumps([r["primary_arch"] for r in recs],
                                         ensure_ascii=False),
            })
            if limit and len(rows) >= limit:
                break
        if limit and len(rows) >= limit:
            break
        if i % 400 == 0:
            print(f"  {i}/{len(files)} dosya, {len(rows)} XI")

    if not rows:
        print("[HATA] hiç XI çıkmadı"); return None
    df = pd.DataFrame(rows)
    out_p = DATA / f"football__{season}__real_xi.parquet"
    df.to_parquet(out_p, index=False)
    print(f"[OK] {out_p.name}  {len(df)} gerçek XI")

    # Motorun kendi kendini sınadığı tek sayı: kimya ile sonuç ilişkisi
    if len(df) > 30:
        c = df["chemistry"].corr(df["goal_diff"])
        cq = df["avg_quality"].corr(df["goal_diff"])
        print(f"     kimya ~ gol farkı korelasyonu : {c:+.3f}")
        print(f"     kalite ~ gol farkı korelasyonu: {cq:+.3f}  (karşılaştırma için)")
    return df


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    aff_p = DATA / f"football__{args.season}__affinity.parquet"
    emp = pd.read_parquet(aff_p) if aff_p.exists() else None
    build(args.season, emp, limit=args.limit)
