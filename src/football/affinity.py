# -*- coding: utf-8 -*-
"""Futbol arketip uyumu — XI kurgusu ve ampirik uyum matrisi.

İKİ AYRI İŞ
───────────
1) empirical_matrix() — GERÇEK maç sonuçlarından arketip-arketip uyumu.
   Basketbolda bu leaguedashlineups'ın NET_RATING'inden geliyor; FotMob'da
   öyle bir uç nokta yok, AMA cache'te her maçın ilk 11'i ve skoru var:
   bir takımın yediği gol = kendi kalecisinin goals_conceded'i, attığı gol =
   rakip kalecininki. Yani skor tablosu tamamen türetilebilir (ek istek yok).

2) lineup_fit() — verilen 10 saha oyuncusu için uyum skoru.
   Kaleci HESABA GİRMEZ (kullanıcı kararı): rolü diğer onla etkileşmiyor.

DURUM: ALTYAPI. Ağırlıklar ve önsel matris sınanmadı; gerçek ground truth
gelince kalibre edilecek. Frontend bunu "prior" olarak etiketlemeli.

ÖRNEKLEM GÜRÜLTÜSÜ — basketbol tarafındaki MIN_LINEUP_MINUTES'in karşılığı:
bir arketip çifti kaç maçta birlikte sahaya çıktıysa o kadar güvenilir.
MIN_PAIR_MATCHES altındaki çiftler ampirik matriste NaN bırakılır ve
önsele düşülür — uydurma bir sayı üretilmez.
"""

from __future__ import annotations

import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
CACHE = DATA / "fotmob_cache"
sys.path.insert(0, str(ROOT / "config"))

from football_roles import (  # noqa: E402
    ROLE_SLOTS, VALID_SHAPES, affinity_prior, slot_strength, shape_of,
)

MIN_PAIR_MATCHES = 40      # bu altındaki çift güvenilmez -> önsele düş
GK_PHASE = "gk"


# ── 1. Ampirik matris ───────────────────────────────────────────────────────
def _match_outcomes(path: Path):
    """Bir maç dosyasından (takım_id -> {atilan, yenilen, oyuncu_id'leri})."""
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    ps = (d.get("content") or {}).get("playerStats") or {}
    if not ps:
        return None

    conceded, squads = {}, {}
    # Takım xG'si: tek maçın GOLÜ Poisson gürültüsüyle dolu (takım içinde
    # kalitenin bile R²'si 0.02), xG çok daha az gürültülü. Kimya gibi küçük
    # etkileri ölçebilmek için gerekli.
    xg = {}
    for p in ps.values():
        tid = p.get("teamId")
        if tid is None:
            continue
        mins = 0
        pxg = 0.0
        for grp in p.get("stats") or []:
            for _, item in (grp.get("stats") or {}).items():
                if not isinstance(item, dict):
                    continue
                k = item.get("key")
                if k == "minutes_played":
                    mins = (item.get("stat") or {}).get("value") or 0
                elif k == "expected_goals":
                    pxg = (item.get("stat") or {}).get("value") or 0.0
        if mins <= 0:
            continue
        xg[tid] = xg.get(tid, 0.0) + float(pxg)
        squads.setdefault(tid, set()).add(p.get("id"))
        if p.get("isGoalkeeper"):
            gc = 0
            for grp in p.get("stats") or []:
                for _, item in (grp.get("stats") or {}).items():
                    if isinstance(item, dict) and item.get("key") == "goals_conceded":
                        gc = (item.get("stat") or {}).get("value") or 0
            conceded[tid] = conceded.get(tid, 0) + gc

    if len(conceded) != 2:
        return None                      # iki takımın da kalecisi yoksa skor çıkmaz
    ids = list(conceded)
    scored = {ids[0]: conceded[ids[1]], ids[1]: conceded[ids[0]]}
    return {t: {"scored": scored[t], "conceded": conceded[t],
                "xg": xg.get(t), "xg_against": xg.get(ids[1] if t == ids[0] else ids[0]),
                "players": squads.get(t, set())} for t in ids}


def empirical_matrix(scores_path: Path, min_pair=MIN_PAIR_MATCHES, verbose=True):
    """Arketip çiftlerinin birlikte oynadığı maçlardaki gol farkından uyum.

    Uyum tanımı: çiftin birlikte sahada olduğu maçlardaki ORTALAMA GOL FARKI,
    lig ortalamasına göre merkezlenmiş ve [-0.35, 0.35] aralığına ölçeklenmiş
    (önsel matrisle aynı aralık, ikisi harmanlanabilsin diye).

    DÖNÜŞ: (matris DataFrame, teşhis dict)
    """
    sc = pd.read_parquet(scores_path)
    # oyuncu -> arketip (kaleci hariç; birden çok faz varsa daha çok dakikalı)
    # Dakika eşiğini geçemeyen oyuncunun primary_arch'ı NaN — onlar havuzdan
    # çıkar, yoksa sorted() str ile float'ı karşılaştırmaya çalışıp patlıyor.
    sc = sc[(sc.PHASE != GK_PHASE) & sc.primary_arch.notna()]
    sc = sc.sort_values("MINUTES_PHASE", ascending=False)
    arch_of = {int(k): str(v) for k, v in zip(sc.PLAYER_ID, sc.primary_arch)}

    # ── TAKIM GÜCÜ KONTROLÜ — bu adım olmadan matris anlamsız ────────────────
    # İlk sürüm ham gol farkı kullanıyordu ve ölçtüğü şey sinerji değil TAKIM
    # KALİTESİ çıktı: en uyumlu 8 çiftin 4'ünde Complete Forward vardı (sistemin
    # en nadir, en elit arketibi — 10 kişi, hepsi büyük kulüplerde), en uyumsuz
    # 8'in 5'inde Ball-Winner (en yaygın orta saha rolü, zayıf takımlarda yoğun).
    # Yani "bu ikili iyi anlaşıyor" değil "bu ikiliyi iyi takımlar kuruyor"
    # diyordu. Önselle korelasyon -0.13 çıkmıştı, yani hiç.
    #
    # Çözüm: her maç için iki takımın oyuncu kalitesinden BEKLENEN gol farkını
    # kestir, KALINTIYA bak. Kalıntı = "bu kadro, gücünün gerektirdiğinden
    # daha iyi/kötü sonuç aldı mı" — sinerjinin gerçek tanımı bu.
    strength_of = dict(zip(sc.PLAYER_ID.astype(int), sc.overall_score))

    def team_strength(pids):
        vals = [strength_of[p] for p in pids if p in strength_of
                and pd.notna(strength_of[p])]
        return float(np.mean(vals)) if vals else None

    # 1. geçiş: beklenen gol farkını kalibre et (tek katsayılı doğrusal uyum)
    obs = []
    for f in CACHE.glob("*.json"):
        o = _match_outcomes(f)
        if not o or len(o) != 2:
            continue
        t = list(o)
        s0, s1 = team_strength(o[t[0]]["players"]), team_strength(o[t[1]]["players"])
        if s0 is None or s1 is None:
            continue
        obs.append((s0 - s1, o[t[0]]["scored"] - o[t[0]]["conceded"]))
    if len(obs) >= 50:
        dx = np.array([x for x, _ in obs]); dy = np.array([y for _, y in obs])
        k_strength = float(np.polyfit(dx, dy, 1)[0])
    else:
        k_strength = 0.0

    pair_gd, pair_n = {}, {}
    all_gd = []
    used = skipped = 0
    for f in CACHE.glob("*.json"):
        out = _match_outcomes(f)
        if not out:
            skipped += 1
            continue
        used += 1
        tids = list(out)
        strengths = {t: team_strength(out[t]["players"]) for t in tids}
        for tid, info in out.items():
            raw_gd = info["scored"] - info["conceded"]
            opp = [t for t in tids if t != tid]
            me, other = strengths.get(tid), (strengths.get(opp[0]) if opp else None)
            # Beklenen farkı düş — kalan, kadronun gücünün ötesindeki performans
            gd = raw_gd - (k_strength * (me - other)
                           if (me is not None and other is not None) else 0.0)
            squad_archs = [arch_of[pid] for pid in info["players"] if pid in arch_of]
            archs = sorted(set(squad_archs))
            if len(archs) < 2:
                continue
            all_gd.append(gd)
            for a, b in combinations(archs, 2):
                k = (a, b)
                pair_gd[k] = pair_gd.get(k, 0.0) + gd
                pair_n[k] = pair_n.get(k, 0) + 1
            for a in archs:                      # aynı arketipten iki oyuncu
                if squad_archs.count(a) > 1:
                    k = (a, a)
                    pair_gd[k] = pair_gd.get(k, 0.0) + gd
                    pair_n[k] = pair_n.get(k, 0) + 1

    if not all_gd:
        return None, {"error": "maç bulunamadı"}
    base = float(np.mean(all_gd))

    names = sorted({a for k in pair_gd for a in k})
    M = pd.DataFrame(np.nan, index=names, columns=names, dtype=float)
    raw = {}
    for k, tot in pair_gd.items():
        n = pair_n[k]
        if n < min_pair:
            continue
        raw[k] = tot / n - base
    if raw:
        vals = np.array(list(raw.values()))
        lim = max(abs(vals).max(), 1e-9)
        for (a, b), v in raw.items():
            s = 0.35 * v / lim
            M.loc[a, b] = s
            M.loc[b, a] = s

    diag = {
        "matches_used": used, "matches_skipped": skipped,
        "strength_coef_k": round(k_strength, 3),
        "strength_controlled": bool(k_strength),
        "league_mean_residual": round(base, 3),
        "pairs_total": len(pair_n),
        "pairs_reliable": len(raw),
        "pairs_dropped_low_n": len(pair_n) - len(raw),
        "min_pair_matches": min_pair,
    }
    if verbose:
        print(f"  {used} maç kullanıldı, {skipped} atlandı")
        print(f"  {len(raw)}/{len(pair_n)} çift güvenilir (>= {min_pair} maç)")
    return M, diag


def blended(a: str, b: str, emp=None) -> float:
    """Ampirik değer varsa onu, yoksa önseli kullan."""
    if emp is not None and a in emp.index and b in emp.columns:
        v = emp.loc[a, b]
        if pd.notna(v):
            return float(v)
    return affinity_prior(a, b)


# ── 2. XI uyum skoru ────────────────────────────────────────────────────────
def lineup_fit(rows: list, emp=None) -> dict:
    """10 saha oyuncusu için uyum skoru.

    rows: [{PLAYER_NAME, PHASE, POSITION, primary_arch, primary_score, ...}]
          Kaleci verilirse SESSİZCE ATILIR — uyum hesabına girmiyor.

    Üç bileşen:
      slots  (0.45) — sekiz fonksiyonel işin ne kadarı karşılanıyor
      pairs  (0.35) — arketip çiftlerinin birbirini tamamlaması
      shape  (0.20) — geçerli bir dizilişe oturuyor mu, dengeli mi
    """
    rows = [r for r in rows if r.get("PHASE") != GK_PHASE]
    if len(rows) < 2:
        return {"error": "en az 2 saha oyuncusu gerekli"}

    # DİKKAT: `if r.get("primary_arch")` yetmiyor — pandas NaN bir float ve
    # bool(nan) True. Skorlanmamış bir oyuncu (ör. ara transferde ikinci
    # satırı, dakikası eşiğin altında) XI'e karışınca NaN arketip listeye
    # giriyor, Counter'a ANAHTAR oluyor ve JSON'a NaN anahtar yazılamadığı
    # için istek 500 dönüyordu. Metin olmayan her şey burada eleniyor.
    def _arch(r):
        a = r.get("primary_arch")
        return a if isinstance(a, str) and a else None

    archs = [a for a in (_arch(r) for r in rows) if a]
    # oyuncunun rolü ne kadar netse katkısı o kadar gerçek
    conf = {}
    for r in rows:
        a = _arch(r)
        if not a:
            continue
        try:
            s = float(r.get("primary_score") or 0.5)
        except (TypeError, ValueError):
            s = 0.5
        conf[a] = max(0.35, 0.5 if s != s else s)     # s != s  -> NaN
    if len(archs) < 2:
        return {"error": "en az 2 skorlanmis saha oyuncusu gerekli"}

    # ── slotlar: her iş için havuzdaki en iyi + derinlik
    slot_scores = {}
    for slot in ROLE_SLOTS:
        vals = sorted((slot_strength(a, slot) * conf.get(a, 0.5) for a in archs),
                      reverse=True)
        if not vals:
            slot_scores[slot] = 0.0
            continue
        best = vals[0]
        depth = min(1.0, sum(1 for v in vals if v >= 0.55) / 2.0)
        slot_scores[slot] = min(1.0, 0.70 * best + 0.30 * depth)
    slots = float(np.mean(list(slot_scores.values())))

    # ── çiftler: ortalama uyum, [-0.35,0.35] -> [0,1]
    pv = [blended(a, b, emp) for a, b in combinations(archs, 2)]
    pairs = float(np.clip(0.5 + np.mean(pv) / 0.7, 0, 1)) if pv else 0.5

    # ── şekil: faz dağılımı geçerli bir dizilişe uyuyor mu
    counts = {}
    for r in rows:
        counts[r.get("PHASE")] = counts.get(r.get("PHASE"), 0) + 1
    name = shape_of(counts)
    if name:
        shape = 1.0
    else:
        # en yakın geçerli dizilişe uzaklık
        best = min(sum(abs(counts.get(k, 0) - v) for k, v in need.items())
                   for need in VALID_SHAPES.values())
        shape = max(0.0, 1.0 - best / 6.0)

    # ── çeşitlilik: aynı rolden kaç tane var ────────────────────────────────
    # AYRI BİR BİLEŞEN olmak zorunda. İlk sürümde yalnızca `pairs` vardı ve
    # 45 çiftin ortalaması alındığı için üç Regista'nın ürettiği 3 negatif
    # çift eriyip gidiyordu — arama gerçekten Pedri+Çalhanoğlu+Modrić'li bir
    # orta saha öneriyordu. Futbolda aynı rolden üçü, bir işin üç kez
    # yapılması ve başka işlerin hiç yapılmaması demek.
    from collections import Counter
    cnt = Counter(archs)
    excess = sum(max(0, c - 2) for c in cnt.values())      # 2'ye kadar normal
    pair_dupes = sum(1 for c in cnt.values() if c == 2)
    diversity = float(np.clip(1.0 - 0.28 * excess - 0.04 * pair_dupes, 0, 1))

    # ── AĞIRLIKLAR — pairs neden 0 ──────────────────────────────────────────
    # 17.936 gerçek ilk-11 üzerinde ölçüldü (10 sezon, 3 lig):
    #   • pairs'in takım-içi (kulüp+sezon sabit etkisi) sonuç ilişkisi
    #     +0.004, yani 0.5 standart hata — sıfırdan ayırt edilemiyor.
    #     Karşılaştırma: slots 5.4 SE, diversity 2.4 SE.
    #   • Kulüpler arası +0.042 görünüyordu ama o TAKIM KİMLİĞİ: iyi takımın
    #     çiftleri de "uyumlu" çıkıyor, çiftler uyumlu olduğu için kazanmıyor.
    #   • Daha kötüsü, pairs neredeyse SABİT: herkeste ~0.52 çıkıyor.
    #     Nominal ağırlığı %30'du ama skorun DEĞİŞKENLİĞİNE katkısı %3.2.
    #     Yani bir bileşen değil, gizlenmiş bir taban puanıydı.
    # Çıkarınca takım-içi ilişki değişmiyor (+0.0375 -> +0.0368, farkın
    # kendisi gürültü) ama skorun kullanılabilir aralığı 1.46 kat genişliyor.
    #
    # Arketip uyumu iddiası KAYBOLMUYOR: slots "sekiz işin kaçı karşılanıyor",
    # diversity "aynı rol kaç kez tekrarlanıyor" — ikisi de uyum ölçüsü ve
    # ikisi de ölçümde ayakta kalıyor. Ayakta kalmayan, İKİLİ arketip
    # yakınlığı fikriydi.
    #
    # pairs hesaplanmaya devam ediyor ve yanıtta duruyor — teşhis için
    # değerli, ama bileşik skoru artık taşımıyor.
    total = 0.60 * slots + 0.15 * shape + 0.25 * diversity
    weakest = min(slot_scores, key=slot_scores.get)
    strongest = max(slot_scores, key=slot_scores.get)
    return {
        "score": round(float(total), 4),
        "slots": round(slots, 4),
        # Bileşik skora GİRMİYOR (bkz. yukarıdaki ağırlık notu) — teşhis için
        # duruyor. Arayüz gösterirse "skora dahil değil" diye işaretlemeli.
        "pairs": round(pairs, 4),
        "pairs_in_score": False,
        "shape": round(shape, 4),
        "diversity": round(diversity, 4),
        "archetype_counts": dict(cnt),
        "formation": name,
        "phase_counts": counts,
        "slot_scores": {k: round(v, 3) for k, v in slot_scores.items()},
        "strongest": strongest,
        "weakest": weakest,
        "n_outfield": len(rows),
        "source": "empirical+prior" if emp is not None else "prior",
    }


def duo_fit(a_row: dict, b_row: dict, emp=None) -> dict:
    """İki oyuncunun birbirine uyumu."""
    a, b = a_row.get("primary_arch"), b_row.get("primary_arch")
    if not a or not b:
        return {"error": "arketip yok"}
    v = blended(a, b, emp)
    shared = [s for s in ROLE_SLOTS
              if slot_strength(a, s) >= 0.6 and slot_strength(b, s) >= 0.6]
    covers = sorted({s for s in ROLE_SLOTS
                     if max(slot_strength(a, s), slot_strength(b, s)) >= 0.6})
    return {
        "score": round(float(np.clip(0.5 + v / 0.7, 0, 1)), 4),
        "affinity": round(float(v), 4),
        "overlapping_roles": shared,
        "covered_roles": covers,
        "source": "empirical" if (emp is not None and a in emp.index
                                  and pd.notna(emp.loc[a, b])) else "prior",
    }


# ── 3. En uyumlu XI araması ─────────────────────────────────────────────────
def best_xi(players: list, shape: str = "4-3-3", emp=None,
            quality_weight: float = 0.35, restarts: int = 6, seed: int = 0):
    """Havuzdan verilen dizilişe en uyumlu 10 saha oyuncusunu arar.

    TAM ARAMA İMKANSIZ: 400 oyuncudan 10 seçmek C(400,10) ≈ 2.6e19. Bunun
    yerine açgözlü kurulum + yerel takas iyileştirmesi, birkaç farklı
    başlangıçtan (restarts) tekrarlanır. Optimum garanti etmez; "iyi ve
    tutarlı" bir XI verir.

    quality_weight: saf uyum mu, yoksa oyuncu kalitesi de mi sayılsın.
      0.0  -> sadece uyum (zayıf ama birbirine yakışan oyuncular çıkabilir)
      1.0  -> sadece kalite (uyum hiç bakılmaz, en iyi 10 oyuncu)
    """
    rng = np.random.default_rng(seed)
    need = VALID_SHAPES.get(shape)
    if not need:
        return {"error": f"bilinmeyen diziliş: {shape}"}

    pool = {ph: [p for p in players if p.get("PHASE") == ph and p.get("primary_arch")]
            for ph in need}
    for ph, n in need.items():
        if len(pool[ph]) < n:
            return {"error": f"{ph} fazında yeterli oyuncu yok ({len(pool[ph])}/{n})"}
    for ph in pool:
        pool[ph].sort(key=lambda p: -(p.get("overall_score") or 0))

    def value(sel):
        fit = lineup_fit(sel, emp)
        if "error" in fit:
            return -1, fit
        q = float(np.mean([p.get("overall_score") or 0.5 for p in sel]))
        return (1 - quality_weight) * fit["score"] + quality_weight * q, fit

    best_sel, best_val, best_fit = None, -1, None
    for r in range(restarts):
        # başlangıç: ilk turda kaliteye göre en iyiler, sonrakilerde rastgele
        sel = []
        for ph, n in need.items():
            cand = pool[ph]
            if r == 0:
                sel += cand[:n]
            else:
                top = cand[:max(n * 4, n)]
                idx = rng.choice(len(top), size=n, replace=False)
                sel += [top[i] for i in idx]

        cur, fit = value(sel)
        improved = True
        rounds = 0
        while improved and rounds < 12:
            improved = False
            rounds += 1
            for i, out_p in enumerate(list(sel)):
                ph = out_p["PHASE"]
                in_squad = {p["PLAYER_ID"] for p in sel}
                for cand in pool[ph][:40]:
                    if cand["PLAYER_ID"] in in_squad:
                        continue
                    trial = list(sel)
                    trial[i] = cand
                    v, f = value(trial)
                    if v > cur + 1e-6:
                        sel, cur, fit, improved = trial, v, f, True
                        break
        if cur > best_val:
            best_sel, best_val, best_fit = sel, cur, fit

    order = {"def": 0, "mid": 1, "fwd": 2}
    best_sel = sorted(best_sel, key=lambda p: (order.get(p["PHASE"], 9),
                                               -(p.get("overall_score") or 0)))
    return {
        "shape": shape,
        "combined_value": round(float(best_val), 4),
        "quality_weight": quality_weight,
        "fit": best_fit,
        "players": [{
            "PLAYER_ID": int(p["PLAYER_ID"]), "PLAYER_NAME": p["PLAYER_NAME"],
            "TEAM": p.get("TEAM"), "LEAGUE": p.get("LEAGUE"),
            "PHASE": p["PHASE"], "POSITION": p.get("POSITION"),
            "primary_arch": p["primary_arch"],
            "overall_score": round(float(p.get("overall_score") or 0), 4),
        } for p in best_sel],
    }


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    ap.add_argument("--min-pair", type=int, default=MIN_PAIR_MATCHES)
    args = ap.parse_args()

    p = DATA / f"football__{args.season}__scores.parquet"
    if not p.exists():
        print(f"[HATA] {p.name} yok"); sys.exit(1)
    print(f"[{args.season}] ampirik uyum matrisi hesaplaniyor…")
    M, diag = empirical_matrix(p, args.min_pair)
    if M is None:
        print("[HATA]", diag); sys.exit(1)
    out = DATA / f"football__{args.season}__affinity.parquet"
    M.to_parquet(out)
    (DATA / f"football__{args.season}__affinity_diag.json").write_text(
        json.dumps(diag, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[OK] {out.name}  {M.shape[0]}x{M.shape[1]}")
    print(f"     {json.dumps(diag, ensure_ascii=False)}")
