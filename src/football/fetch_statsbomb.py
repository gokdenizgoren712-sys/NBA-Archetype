"""
StatsBomb açık verisinden futbol oyuncu metrikleri (olay → per-90).

NEDEN STATSBOMB, FBREF DEĞİL
────────────────────────────
FBref bu ortamın her yolundan erişilemez durumda (Cloudflare 403: doğrudan
istek, tarayıcı ve WebFetch dahil). StatsBomb açık verisi ise GitHub'da
barınıyor ve erişilebilir. Üstelik olay (event) seviyesinde — FBref'in
yayınladığı toplamların ham kaynağı — yani:

  • FBref'in HİÇ yayınlamadığı metrikleri türetebiliyoruz (Pressure olayları
    FBref'ten yıllar önce kaldırılmıştı; presleme arketipleri için kritik),
  • her olayda `position` alanı, her maçta `lineups` dosyası var → oyuncunun
    HANGİ pozisyonda kaç dakika oynadığı biliniyor. Bu, yol haritasında
    "FBref dakikayı pozisyon kırılımıyla vermiyor" diye kabul ettiğimiz
    yaklaşıklığı tamamen ortadan kaldırıyor: çok-fazlı oyuncu ataması artık
    tahmin değil, ölçüm.

KAPSAM (2026-08 itibarıyla doğrulandı)
──────────────────────────────────────
2015/16 sezonunda dört lig TAM: Premier League 380, La Liga 380, Serie A 380,
Ligue 1 377 maç. Bundesliga 2015/16'da yalnızca 34 maç var (tek takım) —
lig-içi persantil için yetersiz olduğundan KAPSAM DIŞI bırakıldı.

Kullanım:
    python src/football/fetch_statsbomb.py --league premier-league
    python src/football/fetch_statsbomb.py --all
"""

import argparse
import json
import math
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PrimaryArch/1.0)"}

# competition_id / season_id — competitions.json'dan doğrulandı
LEAGUES = {
    "premier-league": {"comp": 2,  "season": 27, "label": "Premier League", "expect": 380},
    "la-liga":        {"comp": 11, "season": 27, "label": "La Liga",        "expect": 380},
    "serie-a":        {"comp": 12, "season": 27, "label": "Serie A",        "expect": 380},
    "ligue-1":        {"comp": 7,  "season": 27, "label": "Ligue 1",        "expect": 377},
}
SEASON_LABEL = "2015-16"

# ── Saha geometrisi (StatsBomb: 120x80 yarda, hücum yönü +x) ────────────────
PITCH_X, PITCH_Y = 120.0, 80.0
GOAL = (120.0, 40.0)
BOX_X, BOX_Y0, BOX_Y1 = 102.0, 18.0, 62.0
FINAL_THIRD_X = 80.0
DEF_THIRD_X = 40.0
# "Savunmanın %40'ı" — ilerletici pas tanımında hariç tutulan bölge (FBref deseni)
OWN_40_PCT_X = 48.0
PROGRESSIVE_YARDS = 10.0


def _dist_to_goal(x, y):
    return math.hypot(GOAL[0] - x, GOAL[1] - y)


def _in_box(x, y):
    return x >= BOX_X and BOX_Y0 <= y <= BOX_Y1


def _third(x):
    if x < DEF_THIRD_X:
        return "def"
    return "mid" if x < FINAL_THIRD_X else "att"


def _is_progressive(start, end, complete):
    """FBref'in ilerletici tanımının sadeleştirilmiş hâli: tamamlanmış olacak,
    savunmanın %40'ından başlamayacak, ve kaleye olan mesafeyi >=10 yarda
    kısaltacak. Ceza sahasına giren her tamamlanmış aksiyon da ilerleticidir."""
    if not complete or not start or not end:
        return False
    sx, sy = start[0], start[1]
    ex, ey = end[0], end[1]
    if _in_box(ex, ey) and not _in_box(sx, sy):
        return True
    if sx < OWN_40_PCT_X:
        return False
    return (_dist_to_goal(sx, sy) - _dist_to_goal(ex, ey)) >= PROGRESSIVE_YARDS


# ── StatsBomb pozisyon adı → (faz, alt-pozisyon) ────────────────────────────
# Kullanıcı kararı: kanatlar ve saf 10 numaralar FORVET, kanat bekler DEFANS.
POSITION_MAP = {
    "Goalkeeper":                  ("gk",  "GK"),
    "Right Back":                  ("def", "FB"),
    "Left Back":                   ("def", "FB"),
    "Right Wing Back":             ("def", "FB"),
    "Left Wing Back":              ("def", "FB"),
    "Center Back":                 ("def", "CB"),
    "Right Center Back":           ("def", "CB"),
    "Left Center Back":            ("def", "CB"),
    "Center Defensive Midfield":   ("mid", "DM"),
    "Right Defensive Midfield":    ("mid", "DM"),
    "Left Defensive Midfield":     ("mid", "DM"),
    "Center Midfield":             ("mid", "CM"),
    "Right Center Midfield":       ("mid", "CM"),
    "Left Center Midfield":        ("mid", "CM"),
    # 4-4-2'de "Right/Left Midfield" kanat rolüdür — kullanıcı kuralı gereği
    # (kanatlar forvet sayılır) fwd/W'ye gidiyor. İlk denemede mid/CM'ye
    # eşlenmişti ve Zaha ile Navas orta saha arketipi almıştı, açık hataydı.
    "Right Midfield":              ("fwd", "W"),
    "Left Midfield":               ("fwd", "W"),
    "Center Attacking Midfield":   ("fwd", "ST"),   # saf 10 numara → forvet
    "Right Attacking Midfield":    ("fwd", "W"),
    "Left Attacking Midfield":     ("fwd", "W"),
    "Right Wing":                  ("fwd", "W"),
    "Left Wing":                   ("fwd", "W"),
    "Striker":                     ("fwd", "ST"),
    "Center Forward":              ("fwd", "ST"),
    "Right Center Forward":        ("fwd", "ST"),
    "Left Center Forward":         ("fwd", "ST"),
    "Secondary Striker":           ("fwd", "ST"),
}


def _get(url, tries=3):
    for i in range(tries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=90)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return None
        except Exception:
            if i == tries - 1:
                raise
    return None


def _blank():
    return defaultdict(float)


# Topa temas eden olay tipleri (Pressure ve Dribbled Past bilinçli olarak DIŞARIDA
# — ikisi de top-dışı savunma aksiyonu, dokunuş değil).
TOUCH_TYPES = {
    "Pass", "Ball Receipt*", "Carry", "Shot", "Clearance", "Miscontrol",
    "Dribble", "Interception", "Block", "Ball Recovery", "Duel", "Goal Keeper",
    "Dispossessed",
}


def _clock(t):
    """StatsBomb lineup damgası 'MM:SS' (maç dakikası, uzatma dahil: '91:05').
    HH:MM DEĞİL — bu ayrım kaçırılırsa dakikalar ~60x şişer."""
    if not t:
        return None
    parts = str(t).split(":")
    try:
        return int(parts[0]) + (int(parts[1]) / 60.0 if len(parts) > 1 else 0.0)
    except (ValueError, IndexError):
        return None


def _accumulate(events, lineups, agg, mins):
    """Tek maçı topla. agg[player_id] -> ham sayaçlar, mins[(pid,phase)] -> dakika."""
    # Maçın gerçek bitiş dakikası — 'to: null' (sonuna kadar oynadı) için sabit
    # 95 varsaymak yerine son olayın dakikasını kullan.
    end_minute = max((e.get("minute", 0) or 0) for e in events) + 1 if events else 90

    # 1) Dakika ve pozisyon — lineups dosyasından (from/to damgaları)
    names, teams = {}, {}
    for side in lineups:
        for p in side.get("lineup", []):
            pid = p["player_id"]
            names[pid] = p["player_name"]
            teams[pid] = side.get("team_name", "")
            for pos in p.get("positions", []):
                pname = pos.get("position")
                if pname not in POSITION_MAP:
                    continue
                phase, sub = POSITION_MAP[pname]
                a, b = _clock(pos.get("from")), _clock(pos.get("to"))
                if a is None:
                    continue
                if b is None:      # maç sonuna kadar oynadı
                    b = end_minute
                played = max(0.0, b - a)
                mins[(pid, phase)] += played
                mins[(pid, phase, sub)] += played

    # 2) Olaylardan ham metrikler
    for e in events:
        pl = e.get("player")
        if not pl:
            continue
        pid = pl["id"]
        a = agg[pid]
        names.setdefault(pid, pl.get("name", ""))
        t = e["type"]["name"]
        loc = e.get("location")

        # "Dokunuş" = topa GERÇEKTEN temas edilen olaylar. Pressure/Dribbled Past
        # gibi top-dışı olaylar sayılmamalı — sayılırsa bir presleyici, topu hiç
        # görmeden ligin en çok "dokunan" oyuncusu gibi görünüyor.
        if loc and t in TOUCH_TYPES:
            a[f"touch_{_third(loc[0])}"] += 1
            if _in_box(loc[0], loc[1]):
                a["touch_attpen"] += 1

        if t == "Pass":
            d = e.get("pass", {})
            complete = "outcome" not in d          # outcome yoksa tamamlanmış
            a["pass_att"] += 1
            a["pass_cmp"] += 1 if complete else 0
            length = d.get("length") or 0
            if length >= 30:
                a["long_att"] += 1
                a["long_cmp"] += 1 if complete else 0
            end = d.get("end_location")
            if _is_progressive(loc, end, complete):
                a["prg_p"] += 1
                if loc and end:
                    a["prg_dist"] += max(0.0, _dist_to_goal(loc[0], loc[1]) - _dist_to_goal(end[0], end[1]))
            if complete and end and _in_box(end[0], end[1]):
                a["ppa"] += 1
            if complete and end and end[0] >= FINAL_THIRD_X and loc and loc[0] < FINAL_THIRD_X:
                a["pass_1_3"] += 1
            if d.get("cross"):
                a["crs"] += 1
                if complete and end and _in_box(end[0], end[1]):
                    a["crspa"] += 1
            if d.get("switch"):
                a["sw"] += 1
            if d.get("shot_assist"):
                a["kp"] += 1
            if d.get("goal_assist"):
                a["assist"] += 1
            if d.get("aerial_won"):
                a["aer_won"] += 1

        elif t == "Carry":
            end = (e.get("carry") or {}).get("end_location")
            if _is_progressive(loc, end, True):
                a["prg_c"] += 1
            if end and _in_box(end[0], end[1]) and loc and not _in_box(loc[0], loc[1]):
                a["carry_cpa"] += 1
            if end and end[0] >= FINAL_THIRD_X and loc and loc[0] < FINAL_THIRD_X:
                a["carry_1_3"] += 1

        elif t == "Shot":
            d = e.get("shot", {})
            if (d.get("type") or {}).get("name") != "Penalty":
                a["sh"] += 1
                a["npxg"] += d.get("statsbomb_xg") or 0.0

        elif t == "Duel":
            dt = (e.get("duel") or {}).get("type", {}).get("name", "")
            if dt == "Tackle":
                a["tkl"] += 1
                if loc:
                    a[f"tkl_{_third(loc[0])}"] += 1
                oc = (e.get("duel") or {}).get("outcome", {}).get("name", "")
                if oc in ("Won", "Success", "Success In Play", "Success Out"):
                    a["tkl_w"] += 1
            elif dt == "Aerial Lost":
                a["aer_lost"] += 1

        elif t == "Interception":
            a["intc"] += 1
        elif t == "Block":
            a["blocks"] += 1
        elif t == "Clearance":
            a["clr"] += 1
            if (e.get("clearance") or {}).get("aerial_won"):
                a["aer_won"] += 1
        elif t == "Ball Recovery":
            a["recov"] += 1
        elif t == "Pressure":
            a["press"] += 1
            if loc:
                a[f"press_{_third(loc[0])}"] += 1
        elif t == "Dribble":
            a["takeon_att"] += 1
            if (e.get("dribble") or {}).get("outcome", {}).get("name") == "Complete":
                a["takeon_succ"] += 1
        elif t == "Miscontrol":
            a["mis"] += 1
        elif t == "Dispossessed":
            a["dis"] += 1
        elif t == "Foul Committed":
            a["fls"] += 1
        elif t == "Foul Won":
            a["fld"] += 1
        elif t == "Ball Receipt*":
            a["pass_rec"] += 1
            if loc and loc[0] >= FINAL_THIRD_X:
                a["prg_r"] += 1
        elif t == "Goal Keeper":
            gk = (e.get("goalkeeper") or {}).get("type", {}).get("name", "")
            a["gk_actions"] += 1
            if gk == "Shot Saved":
                a["gk_save"] += 1
            elif gk == "Goal Conceded":
                a["gk_ga"] += 1
            elif gk == "Shot Faced":
                a["gk_sota"] += 1
            elif gk in ("Collected", "Punch", "Claim"):
                a["gk_claim"] += 1
            elif gk in ("Smother", "Sweeper Keeper"):
                a["gk_opa"] += 1
            if loc and loc[0] > BOX_X:
                a["gk_out_of_box"] += 1
            if loc:
                a["gk_dist_sum"] += loc[0]
                a["gk_dist_n"] += 1

    return names, teams


# ── Kanonik per-90 tablosu ──────────────────────────────────────────────────
def _per90(a, minutes):
    """Ham sayaçları config/football_signatures.py'nin beklediği kanonik
    metrik adlarına çevirir. Bölen: oynanan dakika / 90."""
    n = minutes / 90.0
    if n <= 0:
        return None
    g = lambda k: a.get(k, 0.0)
    p90 = lambda k: g(k) / n
    pass_att, aer = g("pass_att"), g("aer_won") + g("aer_lost")
    out = {
        # oyun kurma / pas
        "PassAtt_90": p90("pass_att"),
        "PassCmp_pct": (g("pass_cmp") / pass_att) if pass_att else 0.0,
        "LongCmp_pct": (g("long_cmp") / g("long_att")) if g("long_att") else 0.0,
        "PrgP_90": p90("prg_p"),
        "PrgDist_90": p90("prg_dist"),
        "PrgC_90": p90("prg_c"),
        "PrgR_90": p90("prg_r"),
        "KP_90": p90("kp"),
        "PPA_90": p90("ppa"),
        "CrsPA_90": p90("crspa"),
        "Crs_90": p90("crs"),
        "Sw_90": p90("sw"),
        "PassRec_90": p90("pass_rec"),
        "Carries_1_3_90": p90("carry_1_3"),
        "Carries_CPA_90": p90("carry_cpa"),
        # hücum
        "npxG_90": p90("npxg"),
        "Sh_90": p90("sh"),
        "npxG_per_Sh": (g("npxg") / g("sh")) if g("sh") else 0.0,
        "xAG_90": p90("assist"),          # açık veride xAG yok → gerçek asist vekil
        "SCA_90": p90("kp"),              # şut yaratan aksiyon vekili
        "GCA_90": p90("assist"),
        "Touch_AttPen_90": p90("touch_attpen"),
        # savunma
        "Tkl_90": p90("tkl"),
        "TklW_90": p90("tkl_w"),
        "Tkl_Def3rd_90": p90("tkl_def"),
        "Tkl_Mid3rd_90": p90("tkl_mid"),
        "Tkl_Att3rd_90": p90("tkl_att"),
        "Int_90": p90("intc"),
        "Blocks_90": p90("blocks"),
        "Clr_90": p90("clr"),
        "Recov_90": p90("recov"),
        "Press_90": p90("press"),
        "Press_Att3rd_90": p90("press_att"),
        "AerWon_90": p90("aer_won"),
        "AerWon_pct": (g("aer_won") / aer) if aer else 0.0,
        # top taşıma / kayıp
        "TakeOn_Att_90": p90("takeon_att"),
        "TakeOn_Succ_90": p90("takeon_succ"),
        "Mis_90": p90("mis"),
        "Dis_90": p90("dis"),
        "Fls_90": p90("fls"),
        "Fld_90": p90("fld"),
        # bölge dokunuşları
        "Touch_Def3rd_90": p90("touch_def"),
        "Touch_Mid3rd_90": p90("touch_mid"),
        "Touch_Att3rd_90": p90("touch_att"),
        # kaleci
        "Save_pct": (g("gk_save") / (g("gk_save") + g("gk_ga"))) if (g("gk_save") + g("gk_ga")) else 0.0,
        "GA_90": p90("gk_ga"),
        "OPA_90": p90("gk_out_of_box"),
        "DefAction_AvgDist": (g("gk_dist_sum") / g("gk_dist_n")) if g("gk_dist_n") else 0.0,
        "Cross_Stp_90": p90("gk_claim"),
        "GK_Recov_90": p90("recov"),
        "GK_PassAtt_90": p90("pass_att"),
        "GK_PassCmp_pct": (g("pass_cmp") / pass_att) if pass_att else 0.0,
        "Launch_pct": (g("long_att") / pass_att) if pass_att else 0.0,
    }
    return out


def build_league(key: str, min_minutes: int = 600, workers: int = 10) -> pd.DataFrame:
    cfg = LEAGUES[key]
    matches = _get(f"{BASE}/matches/{cfg['comp']}/{cfg['season']}.json") or []
    ids = [m["match_id"] for m in matches]
    print(f"[{cfg['label']}] {len(ids)} maç (beklenen ~{cfg['expect']})")

    agg = defaultdict(_blank)
    mins = defaultdict(float)
    names, teams = {}, {}
    done = [0]

    def one(mid):
        ev = _get(f"{BASE}/events/{mid}.json")
        lu = _get(f"{BASE}/lineups/{mid}.json")
        return ev, lu

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for ev, lu in ex.map(one, ids):
            done[0] += 1
            if not ev or not lu:
                continue
            n, t = _accumulate(ev, lu, agg, mins)
            names.update(n)
            teams.update(t)
            if done[0] % 50 == 0:
                print(f"   {done[0]}/{len(ids)} maç işlendi")

    # (oyuncu, faz) satırları — çok fazlı oyuncu birden fazla satır alır
    rows = []
    phase_minutes = {k: v for k, v in mins.items() if len(k) == 2}
    sub_minutes = {k: v for k, v in mins.items() if len(k) == 3}

    # Oyuncunun TOPLAM dakikası — per-90'ın paydası bu olmalı. Olaylar oyuncunun
    # sahada geçirdiği sürenin TAMAMINI kapsıyor; paydaya sadece o fazdaki dakikayı
    # koymak, iki faz oynayan oyuncunun tüm oranlarını yapay olarak şişiriyordu
    # (Ramsey: 109 pas/90 → gerçekte ~60). Faz dakikası yalnızca "bu oyuncu bu
    # fazda sayılacak kadar oynadı mı" eşiği için kullanılır.
    total_minutes = defaultdict(float)
    for (pid, _phase), v in phase_minutes.items():
        total_minutes[pid] += v

    for (pid, phase), played in phase_minutes.items():
        if played < min_minutes:
            continue
        m = _per90(agg[pid], total_minutes[pid])
        if not m:
            continue
        subs = {k[2]: v for k, v in sub_minutes.items() if k[0] == pid and k[1] == phase}
        sub = max(subs, key=subs.get) if subs else ""
        rows.append({
            "PLAYER_ID": pid, "PLAYER_NAME": names.get(pid, ""),
            "TEAM": teams.get(pid, ""), "LEAGUE": cfg["label"], "SEASON": SEASON_LABEL,
            "PHASE": phase, "POSITION": sub,
            "MINUTES_PHASE": played, "MINUTES_TOTAL": total_minutes[pid], **m,
        })

    df = pd.DataFrame(rows)
    print(f"[{cfg['label']}] {len(df)} (oyuncu × faz) satırı, {df['PLAYER_ID'].nunique()} benzersiz oyuncu")
    return df


def run(key: str, min_minutes: int = 600):
    out = DATA_DIR / f"football__{key}__{SEASON_LABEL}__merged.parquet"
    if out.exists():
        print(f"[cache] {out.name} mevcut — silip yeniden çekebilirsin")
        return pd.read_parquet(out)
    df = build_league(key, min_minutes=min_minutes)
    if df.empty:
        print("[HATA] boş sonuç")
        return df
    df.to_parquet(out)
    print(f"[OK] {out.name}")
    return df


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="StatsBomb açık verisi → futbol oyuncu metrikleri")
    ap.add_argument("--league", choices=sorted(LEAGUES), help="tek lig")
    ap.add_argument("--all", action="store_true", help="dört ligin hepsi")
    ap.add_argument("--min-minutes", type=int, default=600)
    args = ap.parse_args()
    if args.all:
        for k in LEAGUES:
            run(k, args.min_minutes)
    elif args.league:
        run(args.league, args.min_minutes)
    else:
        ap.error("--league ya da --all ver")
