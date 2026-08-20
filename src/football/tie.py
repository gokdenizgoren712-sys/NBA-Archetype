# -*- coding: utf-8 -*-
"""Çift maçlı eleme — SUNUCU tarafı çözücü.

NEDEN SUNUCUDA
──────────────
Kafa kafaya modda sonucu istemcide hesaplamak, oyuncunun kendi skorunu
bildirmesi demek olurdu. İki taraf da aynı sonucu görmeli ve sonuç kimsenin
makinesinde üretilmemeli. Bu yüzden eleme burada çözülüyor; istemci yalnızca
KADROYU gönderiyor, kalite/kimya da sunucuda hesaplanıyor.

frontend/src/game/football/headToHead.js ile AYNI mantık: aynı kalibre
katsayılar (data/football__sim_coeffs.json), iki ayak, toplam skor, uzatma
(ikinci ayağın sahasında), penaltılar. Deplasman golü kuralı YOK — UEFA
2021'de kaldırdı.

İki uygulamanın ayrı durması bilinçli: istemci tarafı anlık önizleme için
(Same Screen'de sunucuya hiç gitmiyoruz), sunucu tarafı resmî sonuç için.
Katsayılar tek dosyadan geldiği için sayısal olarak aynı davranıyorlar.
"""

from __future__ import annotations

import math
import random

ET_SHARE = 0.28      # uzatma 30 dk; takımlar ihtiyatlı, 30/90'ın biraz altı
PEN_RATE = 0.75      # büyük turnuvalarda uzun dönem penaltı isabeti


def _lam(c: dict, quality: float, chem: float, opp_q: float,
         is_home: bool, floor: float) -> float:
    return max(floor, c["const"] + c["quality"] * quality + c["chemistry"] * chem
               + c["opp_quality"] * opp_q + c["home"] * (1.0 if is_home else 0.0))


def _poisson(lam: float, rng: random.Random) -> int:
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= L:
            return k - 1


def _match_lambdas(coeffs: dict, home: dict, away: dict) -> tuple[float, float]:
    """JS playMatch ile aynı: hücum ve rakip savunma tahminlerinin ortalaması."""
    cf, ca = coeffs["goals_for"], coeffs["goals_against"]
    floor = coeffs.get("lambda_floor", 0.15)
    h_for = _lam(cf, home["quality"], home["chemistry"], away["quality"], True, floor)
    h_ag = _lam(ca, away["quality"], away["chemistry"], home["quality"], False, floor)
    a_for = _lam(cf, away["quality"], away["chemistry"], home["quality"], False, floor)
    a_ag = _lam(ca, home["quality"], home["chemistry"], away["quality"], True, floor)
    return max(floor, (h_for + h_ag) / 2), max(floor, (a_for + a_ag) / 2)


def _leg(coeffs, home, away, rng):
    lh, la = _match_lambdas(coeffs, home, away)
    return _poisson(lh, rng), _poisson(la, rng), lh, la


def _shootout(a: dict, b: dict, rng: random.Random) -> dict:
    def rate(side, other):
        return max(0.55, min(0.88, PEN_RATE + (side["quality"] - other["quality"]) * 0.25))
    ra, rb = rate(a, b), rate(b, a)
    sa = sb = 0
    kicks = []
    for i in range(5):
        ka, kb = rng.random() < ra, rng.random() < rb
        sa += ka; sb += kb
        kicks.append({"round": i + 1, "a": bool(ka), "b": bool(kb)})
        left = 5 - i - 1
        if sa > sb + left or sb > sa + left:
            break
    while sa == sb and len(kicks) < 30:
        ka, kb = rng.random() < ra, rng.random() < rb
        sa += ka; sb += kb
        kicks.append({"round": len(kicks) + 1, "a": bool(ka), "b": bool(kb), "sudden": True})
    return {"a": sa, "b": sb, "kicks": kicks, "winner": "a" if sa > sb else "b"}


def play_tie(coeffs: dict, a: dict, b: dict, seed: int | None = None) -> dict:
    """İki ayak, toplam skor, gerekirse uzatma ve penaltı."""
    rng = random.Random(seed)
    h1, a1, _, _ = _leg(coeffs, a, b, rng)          # 1. ayak: a evinde
    h2, a2, _, _ = _leg(coeffs, b, a, rng)          # 2. ayak: b evinde

    agg_a, agg_b = h1 + a2, a1 + h2
    out = {
        "legs": [
            {"home": a["name"], "away": b["name"], "hg": h1, "ag": a1},
            {"home": b["name"], "away": a["name"], "hg": h2, "ag": a2},
        ],
        "aggA": agg_a, "aggB": agg_b, "extraTime": None, "shootout": None,
    }
    if agg_a != agg_b:
        out["winner"] = "a" if agg_a > agg_b else "b"
        out["decidedBy"] = "aggregate"
        return out

    # Uzatma ikinci ayağın sahasında — gerçek futbol kuralı, ev sahibi b
    lh, la = _match_lambdas(coeffs, b, a)
    eh, ea = _poisson(lh * ET_SHARE, rng), _poisson(la * ET_SHARE, rng)
    out["extraTime"] = {"hg": eh, "ag": ea, "host": b["name"]}
    agg_a += ea; agg_b += eh
    out["aggA"], out["aggB"] = agg_a, agg_b
    if agg_a != agg_b:
        out["winner"] = "a" if agg_a > agg_b else "b"
        out["decidedBy"] = "extra time"
        return out

    so = _shootout(a, b, rng)
    out["shootout"] = so
    out["winner"] = so["winner"]
    out["decidedBy"] = "penalties"
    return out


def tie_odds(coeffs: dict, a: dict, b: dict, runs: int = 400,
             seed: int = 1) -> dict:
    """Tek eleme çok gürültülü — asıl gösterilecek sayı kazanma ORANI."""
    wa = pens = et = 0
    for i in range(runs):
        t = play_tie(coeffs, a, b, seed=seed + i * 7919)
        if t["winner"] == "a":
            wa += 1
        if t["decidedBy"] == "penalties":
            pens += 1
        elif t["decidedBy"] == "extra time":
            et += 1
    return {"runs": runs, "aWinPct": wa / runs, "bWinPct": 1 - wa / runs,
            "penaltiesPct": pens / runs, "extraTimePct": et / runs}
