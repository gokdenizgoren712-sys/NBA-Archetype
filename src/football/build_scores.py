# -*- coding: utf-8 -*-
"""FotMob oyuncu-sezon tablosu -> arketip skorları.

YÖNTEM VE NEDEN
───────────────
Faz + lig + sezon havuzunda persantil -> imza ağırlıklarıyla bileşik skor ->
pozisyon maskesi -> oyuncu bazlı argmax. (src/engine.py'nin basketbol tarafında
yaptığının futbol karşılığı; ortak olan yöntem, metrikler değil.)

Neden kümeleme DEĞİL: 2015/16 StatsBomb verisinde üç atama stratejisi
kullanıcının 72 oyunculuk ground truth'una karşı yarıştırıldı —
    Hungarian birebir küme->arketip   %56.9
    açgözlü argmax                    %54.2
    kümeleme yok, maskeli imza        %62.5   <- bu
Kümeleme kaleci ve defansta belirgin şekilde kaybetti çünkü GMM ~dengeli
kümeler üretir, oysa gerçek dağılım dengesiz (18 kalecinin 11'i Shot Stopper).
Orta sahada kümeleme öndeydi (14/18 vs 9/18); bu fark n=18'de anlamlı
sayılmaz, o yüzden basit ve şeffaf olan yol seçildi. Ayrıca bu yolda
karttaki en yüksek çubuk ile etiket TANIM GEREĞİ aynı — iki ayrı sistemin
çeliştiği kafa karışıklığı ortadan kalkıyor.

Kümeleme büsbütün atılmadı: src/football/cluster.py duruyor ve "bu oyuncu
grubu hiçbir arketibe benzemiyor = sözlükte eksik rol var" teşhisi için
hâlâ değerli.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "config"))

from football_signatures import (  # noqa: E402
    DERIVED, PHASES, signatures_for, archetypes_for, metrics_for,
    min_minutes_for, minutes_weight,
)


def fill_derived(df):
    """DERIVED'a sonradan eklenen oranları parquet'te yoksa burada hesaplar.

    fetch_fotmob.derive() bunları çekim anında yazıyor, ama DERIVED'a yeni bir
    oran eklendiğinde 11 bin maçlık arşivi yeniden çekmek gerekmesin diye
    build aşamasında da tamamlanıyor. Payda 0 -> NaN (derive() ile aynı kural:
    'oranı düşük' değil 'hiç denemedi').
    """
    for name, (num, den) in DERIVED.items():
        if name in df.columns or num not in df.columns or den not in df.columns:
            continue
        d = pd.to_numeric(df[den], errors="coerce").replace(0, np.nan)
        df[name] = pd.to_numeric(df[num], errors="coerce") / d
    return df


def to_percentiles(df, cols):
    """Havuz İÇİNDE [0..1] persantil (engine.compute_percentiles deseni).

    Eksik değer 0.5'e değil, HAVUZ MEDYANINA değil, NaN'a bırakılıp
    ağırlıktan düşülür — 'ortalama bir oyuncu' varsaymak, o metriği hiç
    kaydetmemiş oyuncuyu haksız yere ortalamaya çeker.
    """
    out = pd.DataFrame(index=df.index)
    for c in cols:
        if c in df.columns:
            s = pd.to_numeric(df[c], errors="coerce")
            out[c] = s.rank(pct=True).clip(upper=0.999)
    return out


def build_phase(df, phase, season_max=None):
    """Tek (lig, sezon, faz) havuzunu skorlar."""
    sigs = signatures_for(phase)
    names = archetypes_for(phase)
    cols = [c for c in metrics_for(phase) if c in df.columns]
    pct = to_percentiles(df, cols)

    # Kimlik + HAM metrikler birlikte taşınır: kartın Stats sekmesi ham per-90
    # değerleri gösteriyor, ayrı bir detay çağrısı yapmak istemiyoruz.
    ident = ["PLAYER_ID", "PLAYER_NAME", "TEAM", "LEAGUE", "SEASON",
             "PHASE", "POSITION", "MINUTES_TOTAL", "MINUTES_PHASE", "APPS"]
    raw_cols = [c for c in df.columns if c not in ident]
    res = df[ident + raw_cols].copy()

    raw = {}
    for name in names:
        sig = sigs[name]
        num = np.zeros(len(df))
        den = np.zeros(len(df))
        for m, spec in sig["metrics"].items():
            if m not in pct.columns:
                continue
            v = pct[m].to_numpy(dtype=float)
            ok = ~np.isnan(v)
            if not spec["higher"]:
                v = 1.0 - v
            num[ok] += spec["w"] * v[ok]
            den[ok] += spec["w"]
        total_w = sum(s["w"] for s in sig["metrics"].values())
        s = np.where(den > 0, num / np.maximum(den, 1e-9), np.nan)
        # ağırlığın yarısından azı elde varsa skor güvenilmez
        s = np.where(den >= 0.5 * total_w, s, np.nan)
        raw[name] = s
        res[f"score_{name}"] = s
        res[f"cover_{name}"] = den / total_w

    # Pozisyon maskesi — imzanın positions'ı oyuncunun pozisyonunu
    # içermiyorsa o arketip aday DEĞİL (sert maske: faz içi pozisyonlar
    # gerçekten farklı roller, yumuşatmaya gerek yok)
    masked = pd.DataFrame(raw, index=res.index)
    for name in names:
        allowed = sigs[name].get("positions") or ()
        if allowed:
            masked.loc[~res.POSITION.isin(allowed), name] = np.nan

    best = masked.idxmax(axis=1)
    top1 = masked.max(axis=1)
    second = masked.apply(lambda r: r.drop(labels=[r.idxmax()]).max()
                          if r.notna().any() else np.nan, axis=1)

    # ── overall_score: "bu oyuncu ne kadar iyi" ────────────────────────────
    # primary_score "bu role ne kadar benziyor" der; kartın rozetinde
    # gösterilmesi gereken o DEĞİL. Basketbol tarafındaki overall_score ile
    # aynı iskelet (src/score_compat.py):
    #   comp   = en iyi K arketip skorunun ortalaması, her biri ^1.5
    #   overall = 0.60·comp + 0.40·(bağımsız kalite kanalı)
    # ^1.5 orta skorları bastırır (0.65^1.5=0.52) ama eliti korur (0.97^1.5=0.96).
    #
    # comp = 0.70·en iyi + 0.25·ikinci + 0.05·üçüncü — NBA'deki "top-4
    # ORTALAMASI" DEĞİL.
    # Neden farklı: NBA'in 12 nounu birbiriyle ÖRTÜŞÜR (Jokić gerçekten hem Hub
    # hem Engine hem Creator'da yüksek), o yüzden orada ortalama almak
    # "çok yönlülük" ölçer. Futbolda faz içi arketipler TANIM GEREĞİ birbirini
    # dışlar — bir Poacher tanımı gereği Creator değildir. Top-3 ortalaması
    # denendi ve uzmanları eziyordu: uyumu 85 üstü 92 oyuncu rozetle uyum
    # arasında ortalama 15.5 puan kaybediyordu (Bruno Fernandes 95 uyum -> 69
    # rozet, çünkü 95'i Complete Forward 52 ve Pressing Forward 29 ile
    # ortalanıyordu). 0.70/0.30 rolünde mükemmelliği ödüllendirir, gerçek bir
    # ikinci boyuta ölçülü bonus verir, olunmayan rolleri hesaba katmaz.
    #
    # BPM'in futbol karşılığı FotMob maç reytingi: arketip sisteminden TAMAMEN
    # bağımsız, bütüncül bir kalite ölçüsü — tam da BPM'in NBA'de oynadığı rol.
    # Faz havuzu İÇİNDE persantile çevriliyor çünkü reyting pozisyona göre
    # yanlı (kaleciler 6.56-7.73'e sıkışık, forvetler 4.47-8.33'e yayılı);
    # sabit aralık kullanmak bütün kalecileri orta banda hapsederdi.
    #
    # Arketipler EŞİT ağırlıklı (NBA'deki NOUN_WEIGHTS'in karşılığı yok):
    # "Creator, Defensive Fullback'ten daha değerlidir" demek için elimizde
    # doğrulanmış bir dayanak yok, uydurmak istemiyoruz. Ground truth sonrası
    # tartışılabilir.
    powed = np.sort(np.nan_to_num(masked.to_numpy(dtype=float), nan=0.0) ** 1.5,
                    axis=1)[:, ::-1]
    comp = pd.Series(0.70 * powed[:, 0] + 0.25 * powed[:, 1] + 0.05 * powed[:, 2],
                     index=res.index)

    if "rating" in res.columns and res["rating"].notna().any():
        quality = res["rating"].rank(pct=True).clip(upper=0.999)
    else:
        quality = comp                      # reyting yoksa tek kanala düş

    # ── 3. kanal: DOĞRUDAN SONUÇ (gol, asist, clean sheet) ─────────────────
    # Süreç metrikleri (comp) ve bütüncül kalite (reyting) oyunun nasıl
    # oynandığını ölçüyor; bunlar ise sonucu doğrudan değiştiren şeyler.
    # Ağırlık faza göre: kalecinin ürünü clean sheet, forvetin ürünü gol+asist.
    #
    # BİLİNEN ZAAF: clean sheet TAKIMA bağlı — kötü bir takımdaki iyi bir
    # stoper burada cezalanır (basketbol tarafındaki artı/eksi eleştirisinin
    # aynısı). Bu yüzden ağırlığı sınırlı (%15) ve savunmada bile gol+asist
    # ile harmanlanıyor.
    OUTPUT_MIX = {"gk": (1.00, 0.00), "def": (0.70, 0.30),
                  "mid": (0.35, 0.65), "fwd": (0.15, 0.85)}
    w_cs, w_ga = OUTPUT_MIX.get(phase, (0.30, 0.70))
    cs = (res["clean_sheet_pct"].rank(pct=True).clip(upper=0.999)
          if "clean_sheet_pct" in res.columns and res["clean_sheet_pct"].notna().any()
          else pd.Series(0.5, index=res.index))
    ga_raw = (pd.to_numeric(res.get("goals_90"), errors="coerce").fillna(0)
              + pd.to_numeric(res.get("assists_90"), errors="coerce").fillna(0))
    ga = ga_raw.rank(pct=True).clip(upper=0.999)
    output = (w_cs * cs.fillna(0.5) + w_ga * ga)
    res["output_score"] = output

    overall_raw = 0.55 * comp + 0.30 * quality + 0.15 * output

    # ── Dakika ağırlığı — argmax'tan SONRA uygulanır ki rol seçimi değişmesin
    smax = season_max or res["MINUTES_TOTAL"].max()
    w = res["MINUTES_TOTAL"].map(lambda m: minutes_weight(m, smax))
    res["minutes_weight"] = w
    for name in names:
        res[f"score_{name}"] = 0.5 + (res[f"score_{name}"] - 0.5) * w
    top1 = 0.5 + (top1 - 0.5) * w
    second = 0.5 + (second - 0.5) * w
    # overall HAVUZ ORTALAMASINA çekilir (0.5'e değil) — NBA'in Bayesian
    # shrinkage'ıyla aynı fikir: az örneklemli oyuncu "ortalama oyuncu"
    # varsayımına yaklaşsın, yapay olarak 0.5'e değil.
    pool_mean = float(overall_raw[w >= 0.999].mean()) if (w >= 0.999).any() \
        else float(overall_raw.mean())
    res["overall_score"] = pool_mean + (overall_raw - pool_mean) * w

    res["primary_arch"] = best
    res["primary_score"] = top1
    res["alt_arch"] = masked.apply(
        lambda r: (r.drop(labels=[r.idxmax()]).idxmax()
                   if r.notna().sum() > 1 else None), axis=1)
    res["alt_score"] = second
    # Güven = birinci ile ikinci arasındaki fark. Kümeleme posterior'undan
    # farklı olarak bu doğrudan "bu etiket ne kadar net" sorusunu ölçüyor.
    res["margin"] = (top1 - second).fillna(0.0)
    res["confidence"] = pd.cut(
        res["margin"], bins=[-0.01, 0.03, 0.08, 1.0],
        labels=["between roles", "clear", "prototype"]).astype(str)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    ap.add_argument("--min-minutes", type=int, default=None,
                    help="elle eşik; verilmezse sezon uzunluğundan türetilir")
    args = ap.parse_args()

    files = sorted(DATA.glob(f"football__*__{args.season}__fotmob.parquet"))
    if not files:
        print(f"[HATA] {args.season} icin fotmob parquet yok"); sys.exit(1)

    out = []
    for f in files:
        df = fill_derived(pd.read_parquet(f))
        # Eşik her (lig, sezon) için AYRI hesaplanır — ligler farklı uzunlukta
        # (Bundesliga 34 hafta, diğerleri 38) ve devam eden sezonlar kısa.
        smax = df.MINUTES_TOTAL.max()
        thr = args.min_minutes or min_minutes_for(smax)
        lg = df.LEAGUE.iloc[0] if len(df) else f.name

        # Eşiğin altındakiler HAVUZDAN çıkar (persantili bozmasınlar) ama
        # tablodan çıkmaz: kartları görünsün, sadece skorsuz ve uyarılı.
        qual = df[df.MINUTES_TOTAL >= thr]
        unqual = df[df.MINUTES_TOTAL < thr]
        print(f"  [{lg}] esik {thr} dk -> {len(qual)} skorlanacak, "
              f"{len(unqual)} yetersiz dakika")

        for ph in PHASES:
            sub = qual[qual.PHASE == ph]
            if len(sub) < 8:
                print(f"  [atla] {lg}/{ph}: {len(sub)} oyuncu")
                continue
            r = build_phase(sub.reset_index(drop=True), ph, season_max=smax)
            r["qualified"] = True
            r["min_minutes"] = thr
            out.append(r)
            n_bad = r.primary_arch.isna().sum()
            print(f"  {lg:18}{ph:5}{len(r):>4} oyuncu, "
                  f"{r.primary_arch.nunique()} arketip"
                  + (f", {n_bad} skorlanamadi" if n_bad else ""))

        if len(unqual):
            u = unqual.reset_index(drop=True).copy()
            u["qualified"] = False
            u["min_minutes"] = thr
            for c in ("primary_arch", "alt_arch", "confidence"):
                u[c] = None
            for c in ("primary_score", "alt_score", "margin", "minutes_weight",
                      "overall_score", "output_score"):
                u[c] = np.nan
            out.append(u)

    res = pd.concat(out, ignore_index=True)
    p = DATA / f"football__{args.season}__scores.parquet"
    res.to_parquet(p, index=False)
    print(f"\n[OK] {p.name}  {len(res)} satir, {res.PLAYER_ID.nunique()} oyuncu")
    print(res.groupby("PHASE").primary_arch.value_counts().to_string())


if __name__ == "__main__":
    main()
