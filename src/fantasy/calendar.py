# -*- coding: utf-8 -*-
"""Fantezi hafta takvimi — gerçek fikstürden, takım × hafta maç sayısı.

Yahoo'da hafta Pazartesi-Pazar; 1. hafta açılış gününden ilk Pazar'a kadar
(kısa hafta). Her şey ABD Doğu (ET) gününe göre: fikstür UTC tutuyor ve
22:30 ET'deki bir maç UTC'de ertesi güne düşüyor — 2026-27 fikstüründe 921
maç bu yüzden yanlış güne düşerdi.

İki bilinçli varsayım (ilk canlı Yahoo liginde teyit edilmeli):
  - All-Star arası: arayı içeren hafta bir sonrakiyle BİRLEŞTİRİLİR
    (merge_all_star=True). Yahoo ekranı farklı çıkarsa False yapılır.
  - NBA Cup: her takımın 2 maçı gruplar bitene kadar tarihsiz. Bunlar
    PENDING olarak eleme penceresinin haftalarına beklenen değerle dağıtılır
    (çeyrek finale 30 takımdan 8'i çıkar → o haftaya 8/30 maç, kalanı sonraki
    haftaya). Fikstür güncellendiğinde yeniden üretilince PENDING sıfırlanır.
  - Cup finali (GAME_ID 0062...) normal sezon istatistiğine sayılmaz, alınmaz.

Girdi : data/{season}__rankit_schedule.parquet (RankIt sync'in ürettiği
        fikstür — burada yalnızca OKUNUR)
Çıktı : data/{season}__fantasy_weeks.parquet       (hafta, başlangıç, bitiş)
        data/{season}__fantasy_team_weeks.parquet  (takım × hafta)
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

GAMES_PER_TEAM = 82
REGULAR_SEASON_PREFIX = "00226"   # 002 = normal sezon, 26 = 2026-27
LIGHT_DAY_MAX_GAMES = 7           # ≤7 maçlı gün "hafif gün": günlük kadrolu liglerde yedekte kalma riski düşük
CUP_KNOCKOUT_TEAMS = 8


def load_schedule(season: str = "2026-27") -> tuple[pd.DataFrame, pd.DataFrame]:
    """(bilinen maçlar, tarihsiz Cup eleme maçları). Tarihler ET günü."""
    raw = pd.read_parquet(DATA_DIR / f"{season}__rankit_schedule.parquet")
    prefix = "002" + season[2:4]
    raw = raw[raw["GAME_ID"].str.startswith(prefix)].copy()   # Cup finali vb. dışarıda
    raw["DATE"] = (pd.to_datetime(raw["GAME_DATE_TIME"], utc=True)
                   .dt.tz_convert("America/New_York").dt.date)
    tbd = raw["HOME_ABBREVIATION"].isna() | raw["AWAY_ABBREVIATION"].isna()
    known = raw.loc[~tbd, ["GAME_ID", "DATE", "HOME_ABBREVIATION", "AWAY_ABBREVIATION"]]
    return known.reset_index(drop=True), raw.loc[tbd, ["GAME_ID", "DATE"]].reset_index(drop=True)


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def find_all_star_break(game_days: list[date]) -> tuple[date, date] | None:
    """Ocak-Mart arasındaki en uzun (≥4 gün) maçsız aralık: (ilk boş gün, son boş gün)."""
    days = sorted(set(game_days))
    best = None
    for a, b in zip(days, days[1:]):
        gap = (b - a).days - 1
        if gap >= 4 and a.month in (1, 2, 3) and (best is None or gap > best[2]):
            best = (a + timedelta(days=1), b - timedelta(days=1), gap)
    return (best[0], best[1]) if best else None


def build_weeks(game_days: list[date], merge_all_star: bool = True) -> pd.DataFrame:
    """Pazartesi-Pazar haftaları; 1. hafta açılış gününden başlar."""
    first, last = min(game_days), max(game_days)
    spans = []
    start = first
    while start <= last:
        end = min(_monday(start) + timedelta(days=6), last)
        spans.append([start, end, False])
        start = end + timedelta(days=1)

    brk = find_all_star_break(game_days) if merge_all_star else None
    if brk:
        i = next(i for i, (s, e, _) in enumerate(spans) if s <= brk[0] <= e)
        if i + 1 < len(spans):
            spans[i] = [spans[i][0], spans[i + 1][1], True]
            del spans[i + 1]

    return pd.DataFrame([
        {"WEEK": n, "START": s.isoformat(), "END": e.isoformat(),
         "DAYS": (e - s).days + 1, "ALL_STAR_MERGED": merged}
        for n, (s, e, merged) in enumerate(spans, start=1)
    ])


def _week_of(d: date, weeks: pd.DataFrame) -> int:
    iso = d.isoformat()
    hit = weeks[(weeks["START"] <= iso) & (weeks["END"] >= iso)]
    if hit.empty:
        raise ValueError(f"{d} is outside the season calendar")
    return int(hit["WEEK"].iloc[0])


def build_team_weeks(known: pd.DataFrame, tbd: pd.DataFrame, weeks: pd.DataFrame,
                     playoff_weeks: tuple[int, ...]) -> pd.DataFrame:
    """Takım × hafta: bilinen maç, back-to-back, hafif gün maçı, beklenen tarihsiz maç."""
    games = pd.concat([
        known.rename(columns={"HOME_ABBREVIATION": "TEAM"})[["GAME_ID", "DATE", "TEAM"]],
        known.rename(columns={"AWAY_ABBREVIATION": "TEAM"})[["GAME_ID", "DATE", "TEAM"]],
    ], ignore_index=True)
    per_day = known.groupby("DATE").size()
    games["LIGHT"] = games["DATE"].map(per_day) <= LIGHT_DAY_MAX_GAMES
    games = games.sort_values(["TEAM", "DATE"])
    # Back-to-back = takımın bir önceki maçı dün. Maçın İKİNCİ günü sayılır.
    games["B2B"] = games.groupby("TEAM")["DATE"].transform(
        lambda s: pd.to_datetime(s).diff().dt.days.eq(1))
    games["WEEK"] = games["DATE"].map(lambda d: _week_of(d, weeks))

    tw = (games.groupby(["TEAM", "WEEK"])
          .agg(GAMES=("GAME_ID", "size"), B2B=("B2B", "sum"), LIGHT_DAY_GAMES=("LIGHT", "sum"))
          .reset_index())
    # Maçı olmayan takım-haftaları da satır olarak olsun (0 maçlı hafta da bilgi).
    teams = sorted(games["TEAM"].unique())
    grid = pd.MultiIndex.from_product([teams, weeks["WEEK"]], names=["TEAM", "WEEK"]).to_frame(index=False)
    tw = grid.merge(tw, on=["TEAM", "WEEK"], how="left").fillna(0)
    for c in ("GAMES", "B2B", "LIGHT_DAY_GAMES"):
        tw[c] = tw[c].astype(int)

    # Tarihsiz Cup maçları: çeyrek final haftasına 8/30, geri kalan sonraki haftaya.
    tw["PENDING_EXPECTED"] = 0.0
    known_per_team = games.groupby("TEAM").size()
    pending = (GAMES_PER_TEAM - known_per_team).clip(lower=0)
    if not tbd.empty and pending.max() > 0:
        qf_week = _week_of(tbd["DATE"].min(), weeks)
        later_week = _week_of(tbd["DATE"].max(), weeks)
        share_qf = CUP_KNOCKOUT_TEAMS / len(teams)
        for team, n in pending.items():
            if qf_week == later_week:
                alloc = {qf_week: float(n)}
            else:
                alloc = {qf_week: share_qf, later_week: float(n) - share_qf}
            for wk, v in alloc.items():
                tw.loc[(tw["TEAM"] == team) & (tw["WEEK"] == wk), "PENDING_EXPECTED"] += round(v, 3)

    tw["GAMES_EXPECTED"] = tw["GAMES"] + tw["PENDING_EXPECTED"]
    tw["IS_PLAYOFF"] = tw["WEEK"].isin(playoff_weeks)
    return tw


def build_calendar(season: str = "2026-27", playoff_weeks: tuple[int, ...] = (20, 21, 22),
                   merge_all_star: bool = True, write: bool = True):
    known, tbd = load_schedule(season)
    weeks = build_weeks(list(known["DATE"]), merge_all_star=merge_all_star)
    weeks["IS_PLAYOFF"] = weeks["WEEK"].isin(playoff_weeks)
    tw = build_team_weeks(known, tbd, weeks, playoff_weeks)
    if write:
        weeks.to_parquet(DATA_DIR / f"{season}__fantasy_weeks.parquet", index=False)
        tw.to_parquet(DATA_DIR / f"{season}__fantasy_team_weeks.parquet", index=False)
        print(f"[build] {season} fantezi takvimi: {len(weeks)} hafta, "
              f"{tw['TEAM'].nunique()} takım, tarihsiz maç/takım {tw.groupby('TEAM')['PENDING_EXPECTED'].sum().max():.0f}")
    return weeks, tw
