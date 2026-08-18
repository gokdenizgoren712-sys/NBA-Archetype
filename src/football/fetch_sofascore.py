# -*- coding: utf-8 -*-
"""Sofascore -> futbol oyuncu-sezon per-90 tablosu (5 büyük lig).

NEDEN SOFASCORE
───────────────
StatsBomb açık veride 5 büyük ligin TAM kapsaması yalnızca 2015/16 — kullanıcı
o sezonun oyuncularını hatırlamadığı için ground truth kurulamıyordu. Sofascore
14/15'ten bugüne kadar maç bazlı oyuncu istatistiği veriyor ve StatsBomb'da
ölü olan kaleci metriklerini (totalKeeperSweeper, goodHighClaim, goalsPrevented)
gerçekten dolduruyor. Ayrıntı: docs/football-data-sources.md.

METRİK ZAMAN ÇİZELGESİ (probe ile ölçüldü, data/sofascore_season_probe.json)
  2014/15+  çekirdek 27: pas, orta, müdahale, arayı kesme, hava topu, çalım,
            kilit pas, temas, ikili mücadele, uzun top, yarı-saha pasları,
            kaleci (keeperSweeper/goodHighClaim/punches/saves)
  2016/17+  possessionLostCtrl, wonTackle
  2021/22+  goalsPrevented          <- Shot Stopper'ın gerçek metriği
  2022/23+  expectedGoals/Assists/OnTarget
  2024/25+  fiziksel (kilometersCovered, sprint, topSpeed)
  2025/26+  totalProgression, progressiveBallCarriesCount, ballCarriesCount
Bu yüzden imza seçimi sezona göre kademeli olmalı (engine.select_signatures
deseni) — eski sezonda olmayan metrik ağırlıktan düşülür, uydurulmaz.

HIZ SINIRI — DİKKAT
───────────────────
Sofascore resmî API değil ve IP bazlı hız sınırı uyguluyor: ~20 dakikada
~1000 istekten sonra tüm uç noktalar 403 dönmeye başladı (parmak izi meselesi
değil, curl_cffi'nin beş taklidi de aynı anda kesildi). Bu yüzden:
  - varsayılan gecikme YÜKSEK (PAUSE), agresifleştirme
  - her maç diske cache'lenir; tekrar çalıştırma istek harcamaz
  - 403 görülünce üstel bekleme, ısrarcıysa temiz çıkış (kaldığı yerden devam)
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
from curl_cffi import requests as cr

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
CACHE = DATA / "sofascore_cache"
BASE = "https://api.sofascore.com/api/v1"

LEAGUES = {
    "premier-league": 17,
    "la-liga": 8,
    "serie-a": 23,
    "bundesliga": 35,
    "ligue-1": 34,
}
# Her ligin çekirdek metriklerinin başladığı sezon (probe sonucu)
EARLIEST = {"premier-league": "14/15", "la-liga": "15/16", "serie-a": "15/16",
            "bundesliga": "15/16", "ligue-1": "15/16"}

PAUSE = 1.6          # istekler arası saniye — hız sınırı yüzünden bilinçli yüksek
MAX_403_STREAK = 6   # üst üste bu kadar 403 -> bu koşuyu bitir, cache'i koru


# ── HTTP ────────────────────────────────────────────────────────────────────
class RateLimited(Exception):
    pass


_streak = 0


def api(path, tries=3):
    """Sofascore GET. 403 üst üste gelirse RateLimited fırlatır."""
    global _streak
    for i in range(tries):
        try:
            r = cr.get(BASE + path, impersonate="chrome124", timeout=30)
        except Exception:
            time.sleep(2 * (i + 1))
            continue
        if r.status_code == 200:
            _streak = 0
            try:
                return r.json()
            except Exception:
                return None
        if r.status_code == 404:
            _streak = 0
            return None
        if r.status_code in (403, 429):
            _streak += 1
            if _streak >= MAX_403_STREAK:
                raise RateLimited(f"{_streak} ardışık {r.status_code}")
            time.sleep(8 * (i + 1))
    return None


# ── Pozisyon: formasyon sırasından slot türet ───────────────────────────────
# Sofascore kadroyu formasyon sırasında verir: index 0 kaleci, sonra savunma
# hattı (sağdan sola), sonra orta saha hatları, en son forvet hattı.
# Kullanıcının kuralı: kanatlar ve saf 10 numaralar FORVET, kanat bekler DEFANS.
def slots_for(formation, n_players=11):
    """'4-2-3-1' -> [(faz, pozisyon), ...] 11 elemanlı."""
    if not formation or not re.fullmatch(r"\d(-\d)+", str(formation)):
        return None
    lines = [int(x) for x in str(formation).split("-")]
    if sum(lines) != 10:
        return None

    out = [("gk", "GK")]
    back = lines[0]
    # Savunma hattı
    if back == 3:
        out += [("def", "CB")] * 3
    elif back == 4:
        out += [("def", "FB"), ("def", "CB"), ("def", "CB"), ("def", "FB")]
    elif back == 5:
        out += [("def", "FB")] + [("def", "CB")] * 3 + [("def", "FB")]
    else:
        out += [("def", "CB")] * back

    mids = lines[1:-1] if len(lines) > 2 else []
    fwd = lines[-1] if len(lines) > 1 else 0

    for li, size in enumerate(mids):
        deepest = (li == 0)
        # Üçlü savunmanın önündeki geniş oyuncular KANAT BEK'tir -> DEFANS
        # (kullanıcı kuralı: "kanat bekler defans kabul edilecek").
        # Dörtlü savunmanın önündekiler kanattır -> FORVET.
        wide = ("def", "FB") if back == 3 else ("fwd", "W")
        if size == 5:
            out += [wide] + [("mid", "CM")] * 3 + [wide]
        elif size == 4:
            out += [wide, ("mid", "CM"), ("mid", "CM"), wide]
        elif size == 3:
            if deepest and len(mids) > 1:
                out += [("mid", "CM")] * 3          # derin üçlü
            elif deepest:
                out += [("mid", "DM"), ("mid", "CM"), ("mid", "CM")]
            else:
                out += [("fwd", "W"), ("fwd", "ST"), ("fwd", "W")]   # 10'lu bant
        elif size == 2:
            out += [("mid", "DM")] * 2 if deepest else [("mid", "CM")] * 2
        elif size == 1:
            out += [("mid", "DM")] if deepest else [("fwd", "ST")]
        else:
            out += [("mid", "CM")] * size

    if fwd == 3:
        out += [("fwd", "W"), ("fwd", "ST"), ("fwd", "W")]
    else:
        out += [("fwd", "ST")] * fwd

    return out[:11] if len(out) >= 11 else None


COARSE = {"G": ("gk", "GK"), "D": ("def", "CB"), "M": ("mid", "CM"), "F": ("fwd", "ST")}


# ── Çekme ───────────────────────────────────────────────────────────────────
def season_id(tid, year):
    js = api(f"/unique-tournament/{tid}/seasons")
    if not js:
        return None
    for s in js["seasons"]:
        if s["year"] == year:
            return s["id"]
    return None


def list_events(tid, sid):
    """Sezonun tamamlanmış maçları (sayfalı)."""
    evs, page = [], 0
    while page < 30:
        js = api(f"/unique-tournament/{tid}/season/{sid}/events/last/{page}")
        time.sleep(PAUSE)
        if not js or not js.get("events"):
            break
        evs += [e for e in js["events"]
                if (e.get("status") or {}).get("type") == "finished"]
        if not js.get("hasNextPage"):
            break
        page += 1
    return evs


def lineup(match_id):
    """Maç kadrosu — diskte cache'li, tekrar çağrı istek harcamaz."""
    f = CACHE / f"{match_id}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    js = api(f"/event/{match_id}/lineups")
    time.sleep(PAUSE)
    if js is not None:
        CACHE.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(js), encoding="utf-8")
    return js


def collect(slug, year):
    """Bir lig-sezonu topla -> (oyuncu, faz) bazlı toplam sözlüğü."""
    tid = LEAGUES[slug]
    sid = season_id(tid, year)
    if not sid:
        print(f"  [{slug} {year}] sezon bulunamadi"); return None
    time.sleep(PAUSE)
    evs = list_events(tid, sid)
    print(f"  [{slug} {year}] {len(evs)} tamamlanmis mac")

    acc, mins_total, meta = {}, {}, {}
    done = 0
    for e in evs:
        lu = lineup(e["id"])
        done += 1
        if done % 50 == 0:
            print(f"     {done}/{len(evs)}")
        if not lu:
            continue
        for side in ("home", "away"):
            blk = lu.get(side) or {}
            players = blk.get("players") or []
            slots = slots_for(blk.get("formation"))
            team = (e[f"{side}Team"] or {}).get("name", "")
            starter_i = 0
            for p in players:
                st = p.get("statistics") or {}
                mins = st.get("minutesPlayed") or 0
                if not mins:
                    continue
                pl = p["player"]
                pid = pl["id"]
                sub = p.get("substitute", False)
                if not sub and slots and starter_i < len(slots):
                    phase, pos = slots[starter_i]
                else:
                    phase, pos = COARSE.get(p.get("position") or pl.get("position") or "M",
                                            ("mid", "CM"))
                if not sub:
                    starter_i += 1

                mins_total[pid] = mins_total.get(pid, 0) + mins
                meta[pid] = {"PLAYER_NAME": pl.get("name", ""), "TEAM": team}
                key = (pid, phase)
                a = acc.setdefault(key, {"POSITION": pos, "MINUTES_PHASE": 0,
                                         "APPS": 0, "_c": {}, "_avg": {}, "_max": {}})
                a["MINUTES_PHASE"] += mins
                a["APPS"] += 1
                for k, v in st.items():
                    if not isinstance(v, (int, float)) or k == "minutesPlayed":
                        continue
                    if k in AVG_FIELDS:
                        a["_avg"][k] = a["_avg"].get(k, 0.0) + v
                    elif k in MAX_FIELDS:
                        a["_max"][k] = max(a["_max"].get(k, v), v)
                    else:
                        a["_c"][k] = a["_c"].get(k, 0) + v
    return acc, mins_total, meta


# Toplanamayan alanlar: maç başına ortalama / sezon maksimumu.
# Bunları per-90'a çevirmek anlamsız olurdu (7.2'lik reyting × 90/dk = saçma).
AVG_FIELDS = {"rating"}
MAX_FIELDS = {"topSpeed"}


def to_table(acc, mins_total, meta, slug, year):
    rows = []
    for (pid, phase), a in acc.items():
        tot = mins_total.get(pid, 0)
        if tot <= 0:
            continue
        r = {"PLAYER_ID": pid, "PLAYER_NAME": meta[pid]["PLAYER_NAME"],
             "TEAM": meta[pid]["TEAM"], "LEAGUE": slug, "SEASON": year,
             "PHASE": phase, "POSITION": a["POSITION"],
             "MINUTES_PHASE": a["MINUTES_PHASE"], "MINUTES_TOTAL": tot,
             "APPS": a["APPS"]}
        # Sayım metrikleri per-90; payda TOPLAM dakika (faz dakikası değil) —
        # iki fazda oynayan oyuncunun hızı şişmesin diye (StatsBomb yolundaki
        # kararla aynı, bkz. fetch_statsbomb.py).
        for k, v in a["_c"].items():
            r[f"{k}_90"] = v * 90.0 / tot
        for k, v in a["_avg"].items():
            r[k] = v / a["APPS"] if a["APPS"] else None
        for k, v in a["_max"].items():
            r[k] = v
        rows.append(r)
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="premier-league", choices=list(LEAGUES) + ["all"])
    ap.add_argument("--season", default="25/26", help="'25/26' veya 'all'")
    ap.add_argument("--min-minutes", type=int, default=270)
    args = ap.parse_args()

    slugs = list(LEAGUES) if args.league == "all" else [args.league]
    for slug in slugs:
        if args.season == "all":
            js = api(f"/unique-tournament/{LEAGUES[slug]}/seasons")
            time.sleep(PAUSE)
            if not js:
                print(f"[{slug}] sezon listesi alinamadi"); continue
            lo = EARLIEST[slug]
            years = [s["year"] for s in js["seasons"]]
            years = [y for y in years if _yk(y) >= _yk(lo)]
        else:
            years = [args.season]

        for year in years:
            out = DATA / f"football__{slug}__{year.replace('/', '-')}__sofascore.parquet"
            if out.exists():
                print(f"[atla] {out.name} zaten var"); continue
            try:
                got = collect(slug, year)
            except RateLimited as e:
                print(f"\n[DUR] hiz siniri: {e}\n      cache korundu, ayni komutu sonra "
                      f"tekrar calistir — kaldigi yerden devam eder.")
                sys.exit(2)
            if not got:
                continue
            df = to_table(*got, slug, year)
            if df.empty:
                print(f"  [{slug} {year}] satir yok"); continue
            df = df[df.MINUTES_TOTAL >= args.min_minutes]
            df.to_parquet(out, index=False)
            print(f"  [OK] {out.name}  {len(df)} satir, {df.PLAYER_ID.nunique()} oyuncu")


def _yk(y):
    a = int(str(y).split("/")[0])
    return a + 2000 if a < 50 else a + 1900


if __name__ == "__main__":
    main()
