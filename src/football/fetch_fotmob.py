# -*- coding: utf-8 -*-
"""FotMob -> futbol oyuncu-sezon per-90 tablosu (5 büyük lig).

NEDEN FOTMOB
────────────
Denenen kaynaklar ve sonuçları docs'ta değil burada özetli dursun:
  StatsBomb açık : 52 metrik ama 5 büyük lig için SADECE 2015/16
  Sofascore      : 76 metrik, 14/15+ — ama IP'ye Cloudflare challenge takıldı
  FBref/WhoScored: 403 / TLS kesintisi (ISP)
  Promiedos      : erişilebilir ama oyuncu metriği YOK (takım düzeyi)
  API-Football   : ücretli anahtar + ~12 metrik
  FotMob         : 54 metrik, 2016/17+, ERİŞİLEBİLİR  <- bu

METRİK ZAMAN ÇİZELGESİ (probe: data/fotmob_season_probe.json)
  2016/17+  çekirdek 12: accurate_passes, touches, tackles, interceptions,
            clearances, aerial_duels_won, successful_dribbles, chances_created,
            accurate_crosses, recoveries, duels_won, accurate_long_balls
            + kaleci: saves, acted_as_sweeper, high_claim, punches, throws
  2020/21+  xG ailesi: expected_goals, expected_assists, xgot, xg_non_penalty
  2024/25+  kaleci: goals_prevented, xgot_faced
  (Ligue 1'de çekirdek 2015/16'da da var)
Bu yüzden imza seçimi sezona göre kademeli olmalı — eski sezonda olmayan
metrik ağırlıktan DÜŞÜLÜR, uydurulmaz (engine.select_signatures deseni).

HIZ — DİKKAT
────────────
Sofascore'u 0.83 istek/sn ile yakıp challenge yedik. Buradaki varsayılan
çok daha yavaş (PAUSE) ve her maç diske cache'lenir; yarıda kalan koşu
kaldığı yerden devam eder, istek harcamaz.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from curl_cffi import requests as cr

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
CACHE = DATA / "fotmob_cache"
API = "https://www.fotmob.com/api/data"

LEAGUES = {"premier-league": 47, "la-liga": 87, "serie-a": 55,
           "bundesliga": 54, "ligue-1": 53}
EARLIEST = {"premier-league": 2016, "la-liga": 2016, "serie-a": 2016,
            "bundesliga": 2016, "ligue-1": 2015}

PAUSE = 2.5           # istekler arası saniye
MAX_BLOCK_STREAK = 5  # üst üste 403/429 -> temiz çık, cache korunur


class Blocked(Exception):
    pass


_streak = 0


def api(path, tries=3):
    global _streak
    for i in range(tries):
        try:
            r = cr.get(f"{API}/{path}", impersonate="chrome124", timeout=30)
        except Exception:
            time.sleep(3 * (i + 1))
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
            if _streak >= MAX_BLOCK_STREAK:
                raise Blocked(f"{_streak} ardışık {r.status_code}")
            time.sleep(15 * (i + 1))
    return None


# ── Pozisyon: formasyon sırasından slot türet ───────────────────────────────
# FotMob de Sofascore gibi 11'i formasyon sırasında veriyor (doğrulandı:
# Liverpool 4-2-3-1 -> Alisson | Frimpong Konaté van Dijk Kerkez | ...).
# Kullanıcı kuralı: kanatlar + saf 10 numara FORVET, kanat bekler DEFANS.
def slots_for(formation):
    if not formation or not re.fullmatch(r"\d(-\d)+", str(formation)):
        return None
    lines = [int(x) for x in str(formation).split("-")]
    if sum(lines) != 10:
        return None

    out = [("gk", "GK")]
    back = lines[0]
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
    # Üçlü savunmanın önündeki geniş oyuncu = kanat bek -> DEFANS
    wide = ("def", "FB") if back == 3 else ("fwd", "W")

    for li, size in enumerate(mids):
        deepest = (li == 0)
        if size == 5:
            out += [wide] + [("mid", "CM")] * 3 + [wide]
        elif size == 4:
            out += [wide, ("mid", "CM"), ("mid", "CM"), wide]
        elif size == 3:
            if deepest:
                # ÜÇÜNÜ DE CM SAY. Önceki sürüm ilk sıradakini DM varsayıyordu
                # ama FotMob bir hattı DERİNLİĞE göre değil YANAL SIRAYA göre
                # diziyor (dörtlü savunmada doğrulandı: sağ bek, stoper,
                # stoper, sol bek). Yani 4-3-3'te "listede önce yazılan"
                # pivot demek değil — Ødegaard sırf ilk sırada olduğu için
                # 986 dakika DM sayılıyordu ve bu onu Mezzala/Late Runner'a
                # (CM'e maskeli) aday olmaktan çıkarıyordu.
                # Gerçek pivot ancak diziliş onu AYRI BİR HAT olarak yazarsa
                # bilinir (4-1-4-1'in "1"i gibi) — o da aşağıdaki size==1 dalı.
                out += [("mid", "CM")] * 3
            else:
                # Santraforun arkasındaki üçlünün ORTASI saf on numaradır.
                # Faz olarak forvet (kullanıcı kuralı) ama pozisyon kodu ST
                # DEĞİL, AM: bir on numarayı santrafor saymak onu Poacher /
                # Target Man'e aday yapıyordu, oysa o rollerin hiçbirini
                # oynamıyor.
                out += [("fwd", "W"), ("fwd", "AM"), ("fwd", "W")]
        elif size == 2:
            # En derin ikili = çift pivot (DM). Ama ÖNDEKİ ikili (3-4-2-1'in
            # "2"si, 4-2-2-2'nin ikinci "2"si) santraforun arkasındaki hücum
            # bandıdır — kullanıcı kuralıyla "saf on numaralar FORVET".
            # Bu satır orta saha sayarken Kenan Yıldız 3-4-2-1'de 20 maç
            # boyunca orta sahaya düşüyordu.
            out += [("mid", "DM")] * 2 if deepest else [("fwd", "W")] * 2
        elif size == 1:
            # 3-4-1-2'nin "1"i de saf on numara -> AM
            out += [("mid", "DM")] if deepest else [("fwd", "AM")]
        else:
            out += [("mid", "CM")] * size

    out += ([("fwd", "W"), ("fwd", "ST"), ("fwd", "W")] if fwd == 3
            else [("fwd", "ST")] * fwd)
    return out[:11] if len(out) >= 11 else None


# usualPlayingPositionId: 0=GK 1=D 2=M 3=F (yedekler ve formasyon
# okunamayan maçlar için kaba geri düşüş)
COARSE = {0: ("gk", "GK"), 1: ("def", "CB"), 2: ("mid", "CM"), 3: ("fwd", "ST")}


# ── Çekme ───────────────────────────────────────────────────────────────────
def seasons_of(lid):
    j = api(f"leagues?id={lid}")
    time.sleep(PAUSE)
    return (j or {}).get("allAvailableSeasons") or []


def finished_matches(lid, season):
    j = api(f"leagues?id={lid}&season={season.replace('/', '%2F')}")
    time.sleep(PAUSE)
    am = ((j or {}).get("fixtures") or {}).get("allMatches") or []
    return [m for m in am if (m.get("status") or {}).get("finished")]


def match_details(mid):
    f = CACHE / f"{mid}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    j = api(f"matchDetails?matchId={mid}")
    time.sleep(PAUSE)
    if j is not None:
        CACHE.mkdir(parents=True, exist_ok=True)
        # Sadece ihtiyacımız olanı sakla — tam yanıt ~2 MB, disk şişmesin
        slim = {"content": {
            "playerStats": (j.get("content") or {}).get("playerStats") or {},
            "lineup": (j.get("content") or {}).get("lineup") or {}}}
        f.write_text(json.dumps(slim), encoding="utf-8")
        return slim
    return None


# FotMob'un bazı stat key'lerine lokalizasyon eki sızmış ("tackles" yerine
# "matchstats.headers.tackles" gibi). Kolon adları temiz kalsın diye eşliyoruz.
KEY_FIX = {
    "matchstats.headers.tackles": "tackles",
    "big_chance_created_team_title": "big_chances_created",
    "big_chance_missed_title": "big_chances_missed",
    "expected_goals_on_target_variant": "xgot",
    "expected_goals_on_target_faced": "xgot_faced",
    "rating_title": "rating",
}


def flat_stats(player):
    """FotMob'un gruplu stats yapısını düz {key: value} sözlüğüne indirger.
    'fractionWithPercentage' (16/25 gibi) hem başarılı hem deneme üretir."""
    out = {}
    for grp in player.get("stats") or []:
        for _, item in (grp.get("stats") or {}).items():
            if not isinstance(item, dict):
                continue
            key = item.get("key")
            s = item.get("stat") or {}
            v = s.get("value")
            if key is None or v is None or not isinstance(v, (int, float)):
                continue
            key = KEY_FIX.get(key, key)
            out[key] = v
            tot = s.get("total")
            if isinstance(tot, (int, float)):
                out[f"{key}_att"] = tot
    return out


AVG_FIELDS = {"rating"}                # maç başına ortalama, per-90 anlamsız
MAX_FIELDS = {"physical_metrics_topspeed"}   # hız zaten oran — sezonun en yükseği
SKIP_FIELDS = {"minutes_played", "fantasy_points"}

# Çok-fazlı oyuncu eşiği. Kullanıcının kuralı "hem orta saha hem forvet
# oynayan oyuncu iki ayrı arketip alır" — ama bu GERÇEK çift rol için,
# maçtan maça diziliş oynamasından doğan gürültü için değil. Eşiksiz
# bırakınca 400 oyuncunun 132'si çok-fazlı çıkıyordu (bir sol bek hem
# def hem mid hem fwd). İkincil faz ancak hem oranı hem mutlak dakikası
# yeterliyse kendi arketibini hak eder.
SECOND_PHASE_SHARE = 0.30
SECOND_PHASE_MINUTES = 450


def collect(slug, season):
    lid = LEAGUES[slug]
    ms = finished_matches(lid, season)
    if not ms:
        print(f"  [{slug} {season}] bitmiş maç yok"); return None
    print(f"  [{slug} {season}] {len(ms)} maç")

    acc, mins_total, meta = {}, {}, {}
    for i, m in enumerate(ms, 1):
        d = match_details(m["id"])
        if i % 40 == 0:
            print(f"     {i}/{len(ms)}")
        if not d:
            continue
        lu = (d["content"].get("lineup") or {})

        # ── Clean sheet: FotMob doğrudan vermiyor ama türetilebilir.
        # Bir takımın o maçta yediği gol = O TAKIMIN kalecisinin
        # goals_conceded'i. Her maçta iki takımın da kalecisi kayıtlı
        # (60/60 örneklemde doğrulandı), yani ek istek gerekmiyor.
        conceded = {}
        for p in (d["content"].get("playerStats") or {}).values():
            if not p.get("isGoalkeeper"):
                continue
            st = flat_stats(p)
            if (st.get("minutes_played") or 0) <= 0:
                continue
            tid = p.get("teamId")
            conceded[tid] = conceded.get(tid, 0) + (st.get("goals_conceded") or 0)

        # oyuncu id -> (faz, pozisyon)  formasyon sırasından
        pos_of = {}
        for side in ("homeTeam", "awayTeam"):
            t = lu.get(side) or {}
            slots = slots_for(t.get("formation"))
            for idx, p in enumerate(t.get("starters") or []):
                if slots and idx < len(slots):
                    pos_of[p.get("id")] = slots[idx]

        for pid_s, p in (d["content"].get("playerStats") or {}).items():
            st = flat_stats(p)
            mins = st.get("minutes_played") or 0
            if not mins:
                continue
            pid = p.get("id") or int(pid_s)
            phase, pos = pos_of.get(pid) or COARSE.get(
                p.get("usualPosition"), ("mid", "CM"))
            if p.get("isGoalkeeper"):
                phase, pos = "gk", "GK"

            mins_total[pid] = mins_total.get(pid, 0) + mins
            meta[pid] = {"PLAYER_NAME": p.get("name", ""),
                         "TEAM": p.get("teamName", "")}
            a = acc.setdefault((pid, phase),
                               {"MINUTES_PHASE": 0, "APPS": 0,
                                "CS": 0, "CS_APPS": 0, "_pos": {},
                                "_c": {}, "_avg": {}, "_max": {}})
            a["MINUTES_PHASE"] += mins
            a["APPS"] += 1
            # POSITION dakikaya göre BASKIN slottan gelir. Önceki sürüm
            # setdefault ile İLK rastlanan maçtan alıyordu ve dosya sırası
            # rastgele olduğu için Ødegaard 36 maçın 3'ünde girdiği pivot
            # slotu yüzünden sezon boyu "DM" sayılıyordu. Bu sadece etiket
            # değil: POSITION skorlama maskesini belirliyor, yani o yüzden
            # Mezzala/Late Runner'a (CM'e maskeli) hiç aday olamıyordu.
            a["_pos"][pos] = a["_pos"].get(pos, 0) + mins
            # Clean sheet yalnızca maçın çoğunu oynayanlara sayılır (futbolun
            # kendi kuralı kalecide 60 dk; burada tüm mevkiler için 45 dk).
            tid = p.get("teamId")
            if mins >= 45 and tid in conceded:
                a["CS_APPS"] += 1
                if conceded[tid] == 0:
                    a["CS"] += 1
            for k, v in st.items():
                if k in SKIP_FIELDS:
                    continue
                if k in AVG_FIELDS:
                    a["_avg"][k] = a["_avg"].get(k, 0.0) + v
                elif k in MAX_FIELDS:
                    a["_max"][k] = max(a["_max"].get(k, v), v)
                else:
                    a["_c"][k] = a["_c"].get(k, 0) + v
    return acc, mins_total, meta


def keep_phases(acc, mins_total):
    """Her oyuncu için hangi faz(lar) satır hak ediyor?

    Baskın faz her zaman kalır. İkincil faz ancak oyuncunun dakikalarının
    SECOND_PHASE_SHARE'ini VE en az SECOND_PHASE_MINUTES'ı orada geçirmişse
    kalır — yoksa tek maçlık diziliş değişiklikleri sahte arketip üretiyor.
    """
    by_player = {}
    for (pid, phase), a in acc.items():
        by_player.setdefault(pid, []).append((phase, a["MINUTES_PHASE"]))
    keep = set()
    for pid, lst in by_player.items():
        lst.sort(key=lambda x: -x[1])
        tot = mins_total.get(pid, 0) or 1
        keep.add((pid, lst[0][0]))
        for phase, mp in lst[1:]:
            if mp >= SECOND_PHASE_MINUTES and mp / tot >= SECOND_PHASE_SHARE:
                keep.add((pid, phase))
    return keep


def to_table(acc, mins_total, meta, slug, season):
    keep = keep_phases(acc, mins_total)
    rows = []
    for (pid, phase), a in acc.items():
        if (pid, phase) not in keep:
            continue
        tot = mins_total.get(pid, 0)
        if tot <= 0:
            continue
        # baskın pozisyon = o fazda en çok dakika oynadığı slot
        dom_pos = max(a["_pos"], key=a["_pos"].get) if a.get("_pos") else "CM"
        r = {"PLAYER_ID": pid, "PLAYER_NAME": meta[pid]["PLAYER_NAME"],
             "TEAM": meta[pid]["TEAM"], "LEAGUE": slug, "SEASON": season,
             "PHASE": phase, "POSITION": dom_pos,
             "MINUTES_PHASE": a["MINUTES_PHASE"], "MINUTES_TOTAL": tot,
             "APPS": a["APPS"],
             "CLEAN_SHEETS": a["CS"],
             "clean_sheet_pct": (a["CS"] / a["CS_APPS"]) if a["CS_APPS"] else None}
        # per-90 paydası TOPLAM dakika (faz dakikası değil) — iki fazda
        # oynayan oyuncunun hızı şişmesin (fetch_statsbomb.py ile aynı karar)
        for k, v in a["_c"].items():
            r[f"{k}_90"] = v * 90.0 / tot
        for k, v in a["_avg"].items():
            r[k] = v / a["APPS"] if a["APPS"] else None
        for k, v in a.get("_max", {}).items():
            r[k] = v
        rows.append(r)
    return derive(pd.DataFrame(rows))


def derive(df):
    """İmzaların kullandığı türetilmiş oranları ekler (config.DERIVED).

    Oranlar per-90 kolonlardan hesaplanır; per-90 paydası ikisinde de aynı
    olduğu için sonuç sezon toplamlarından hesaplamakla birebir aynı.
    Payda 0 ise NaN — sıfır yazmak 'oranı düşük' demek olurdu, oysa
    'hiç denemedi' demek (persantilde farklı yerlere düşer).
    """
    sys.path.insert(0, str(ROOT / "config"))
    from football_signatures import DERIVED, DERIVED_SAVE  # noqa: F401

    if df.empty:
        return df
    for name, (num, den) in DERIVED.items():
        if num in df.columns and den in df.columns:
            # np.nan (pd.NA DEĞİL) — pd.NA object dtype'a düşürüp
            # sonraki astype/parquet yazımını patlatıyor
            d = pd.to_numeric(df[den], errors="coerce").replace(0, np.nan)
            df[name] = pd.to_numeric(df[num], errors="coerce") / d
    sv, ga = DERIVED_SAVE
    if sv in df.columns and ga in df.columns:
        s = pd.to_numeric(df[sv], errors="coerce")
        faced = s + pd.to_numeric(df[ga], errors="coerce")
        df["save_pct"] = s / faced.replace(0, np.nan)
        # Karşılaşılan isabetli şut — kalecinin iş yükü. %80 kurtarış oranı
        # 30 şutta başka, 150 şutta başka anlama gelir.
        df["sot_faced_90"] = faced
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="premier-league",
                    choices=list(LEAGUES) + ["all"])
    ap.add_argument("--season", default="2025/2026",
                    help="'2025/2026' veya 'all' (kesme noktasından bugüne)")
    ap.add_argument("--min-minutes", type=int, default=450)
    args = ap.parse_args()

    for slug in (list(LEAGUES) if args.league == "all" else [args.league]):
        if args.season == "all":
            ss = [s for s in seasons_of(LEAGUES[slug])
                  if int(s.split("/")[0]) >= EARLIEST[slug]]
        else:
            ss = [args.season]
        for season in ss:
            out = DATA / f"football__{slug}__{season.replace('/', '-')}__fotmob.parquet"
            if out.exists():
                print(f"[atla] {out.name}"); continue
            try:
                got = collect(slug, season)
            except Blocked as e:
                print(f"\n[DUR] {e}\n      cache korundu — aynı komutu sonra "
                      f"tekrar çalıştır, kaldığı yerden devam eder.")
                sys.exit(2)
            if not got:
                continue
            df = to_table(*got, slug, season)
            if df.empty:
                print(f"  [{slug} {season}] satır yok"); continue
            df = df[df.MINUTES_TOTAL >= args.min_minutes]
            if df.empty:
                # Boşluk kontrolü dakika filtresinden ÖNCE yapılıyordu, o yüzden
                # henüz başlamamış bir sezon (2026/27) boş parquet olarak
                # yazılıyor ve sezon listesine giriyordu.
                print(f"  [{slug} {season}] dakika eşiğini geçen yok, yazılmadı")
                continue
            df.to_parquet(out, index=False)
            print(f"  [OK] {out.name}  {len(df)} satır, "
                  f"{df.PLAYER_ID.nunique()} oyuncu, {df.shape[1]} kolon")


if __name__ == "__main__":
    main()
