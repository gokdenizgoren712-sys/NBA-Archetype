# -*- coding: utf-8 -*-
"""Trend etiketleri — son 4 sezonun dakika başı üretim yönü (yükseliş / sabit / düşüş).

Ölçü: sezon başına 36 dakikada Yahoo puanı (PTS_WEIGHTS: format-nötr, tek sayı). Yalnız ≥400 dakikalık sezonlar sayılır;
oyuncuda en az 2 böyle sezon gerekir (çaylak / tek sezonluk oyuncu etiketsiz). Eğim = dakika ağırlıklı doğrusal regresyon
(sezon → üretim), ortalama üretime bölünüp yüzde / sezon yapılır. ±%4 / sezon eşiği: havuzun ~%32'si yükselişte, %43'ü sabit,
%24'ü düşüşte (2023-26, 715 oyuncu-sezon).

DÜRÜST NOT (backtest, aynı 715 durum): etiket projeksiyonun hatasını (gerçek − tahmin) anlamlı biçimde açıklamıyor
(korelasyon +0.07; yükselişte +%0.6, sabitte −%2.0, düşüşte −%1.8, standart hata ~%1.5). Projeksiyon son üç sezonu zaten 7:2:1
ağırlıklıyor ve yaş eğrisini uyguluyor — yani etiket yeni bir tahmin değil, projeksiyonun hangi gidişatı gördüğünü ANLATIR.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from src.fantasy.projections import PTS_WEIGHTS, prev_season

MIN_SEASON_MINUTES = 400
THRESHOLD_PCT = 4.0                 # ± yüzde / sezon
WINDOW = 4
TREND_LABELS = ("rising", "steady", "declining")


def _season_rates(logs: pd.DataFrame) -> pd.Series:
    g = logs.groupby("PLAYER_ID")
    t = g[list(PTS_WEIGHTS) + ["MIN"]].sum()
    t = t[t["MIN"] >= MIN_SEASON_MINUTES]
    rate = sum(t[k] * w for k, w in PTS_WEIGHTS.items()) / t["MIN"] * 36
    return pd.DataFrame({"rate": rate, "MIN": t["MIN"]})


def trend_table(logs: dict[str, pd.DataFrame], target: str) -> pd.DataFrame:
    """PLAYER_ID, TREND ('rising' | 'steady' | 'declining'), TREND_PCT (% / sezon), TREND_SEASONS, TREND_SERIES (JSON)."""
    seasons = [prev_season(target, i) for i in range(1, WINDOW + 1)]
    seasons = [s for s in seasons if s in logs][::-1]                           # eski → yeni
    frames = [_season_rates(logs[s]).assign(x=i, season=s).reset_index() for i, s in enumerate(seasons)]
    if not frames:
        return pd.DataFrame(columns=["PLAYER_ID", "TREND", "TREND_PCT", "TREND_SEASONS", "TREND_SERIES"])
    allr = pd.concat(frames, ignore_index=True)
    rows = []
    for pid, g in allr.groupby("PLAYER_ID"):
        if len(g) < 2:
            continue
        x, y, w = g["x"].to_numpy(float), g["rate"].to_numpy(float), g["MIN"].to_numpy(float)
        xm, ym = np.average(x, weights=w), np.average(y, weights=w)
        slope = float(np.sum(w * (x - xm) * (y - ym)) / max(np.sum(w * (x - xm) ** 2), 1e-9))
        pct = slope / ym * 100.0
        label = "rising" if pct >= THRESHOLD_PCT else "declining" if pct <= -THRESHOLD_PCT else "steady"
        series = {r.season: round(float(r.rate), 1) for r in g.itertuples()}
        rows.append({"PLAYER_ID": int(pid), "TREND": label, "TREND_PCT": round(pct, 1), "TREND_SEASONS": int(len(g)),
                     "TREND_SERIES": json.dumps(series)})
    return pd.DataFrame(rows)


def add_trends(proj: pd.DataFrame, logs: dict[str, pd.DataFrame], target: str) -> pd.DataFrame:
    """Projeksiyon tablosuna trend sütunlarını ve FLAGS'e rising / steady / declining ekler."""
    t = trend_table(logs, target)
    out = proj.drop(columns=[c for c in t.columns if c != "PLAYER_ID" and c in proj.columns]).merge(t, on="PLAYER_ID", how="left")
    if "FLAGS" in out.columns:
        strip = lambda f: [x for x in (f if isinstance(f, str) else "").split(",") if x and x not in TREND_LABELS]   # noqa: E731
        out["FLAGS"] = [",".join(strip(f) + ([a] if a else [])) for f, a in zip(out["FLAGS"], out["TREND"].fillna(""))]
    return out
