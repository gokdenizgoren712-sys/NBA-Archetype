# -*- coding: utf-8 -*-
"""2026-27 ödül aday raporu: tüm ödüller için üretim modelleri, yüzdelerle (docs/AWARDS_2026-27_CANDIDATES.md).

Her bölüm: model, ölçülen başarı (videonun ölçütü), aday tablosu. Hepsi walk-forward modellerden; sentetik hype λ = 0.4 (yalnız MIP).

    python -m src.awards.report
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from src.awards import award_run as ar
from src.awards import allrookie as ar_mod
from src.awards import coy as coy_mod
from src.awards import mip_hype as mh
from src.awards import mip_model as mm
from src.awards import roy as roy_mod
from src.awards import team_awards as ta

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "AWARDS_2026-27_CANDIDATES.md"


def softmax_win(d: pd.DataFrame, col: str) -> pd.Series:
    """Son sezon satırları için kalibre P(kazanır): walk-forward kazanan olabilirliğiyle seçilen sıcaklıkta softmax (sezon içinde toplam 1)."""
    cal = mm.calibrate(d, col)
    cur = d[(d["T"] == d["T"].max()) & d[col].notna()]
    z = cal["beta"] * cur[col].to_numpy()
    p = np.exp(z - z.max()) / np.exp(z - z.max()).sum()
    return pd.Series(p, index=cur.index)


def md_table(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for _, r in df.iterrows():
        out.append("| " + " | ".join("" if (isinstance(v, float) and np.isnan(v)) else str(v) for v in r.tolist()) + " |")
    return "\n".join(out)


def section_continuity(award: str, title: str, n: int = 12) -> str:
    d = ar.run(award)
    h = [mm.finisher_hits(d, "L_BASE", range(a, 2027)).mean() for a in (2023, 2011, 2000)]
    t10, t3, med = ar.winner_stats(d, "L_BASE")
    tbl = ar.candidates_table(d, award, n=n)
    return (f"## {title}\n\nÖlçülen başarı (ilk 10 tahminden gerçek top-10 finisher; liste başına): 2023–26 **{h[0]:.2f}**, 2011–26 **{h[1]:.2f}**, 2000–26 **{h[2]:.2f}**; "
            f"kazanan ilk 10'da %{t10 * 100:.0f}, ilk 3'te %{t3 * 100:.0f}.\n\n{md_table(tbl)}\n")


def section_smoy(n: int = 12) -> str:
    d = ar.run("smoy")
    ok = d["GS_FRAC"].isna() | (d["GS_FRAC"] < 0.5)                  # yedek süzgeci (geçen sezon çoğunlukla başlayanlar elenir)
    d["L_BASE"] = d["L_BASE"].where(ok, d["L_BASE"] - 100.0)
    h = [mm.finisher_hits(d, "L_BASE", range(a, 2027)).mean() for a in (2023, 2011, 2000)]
    t10, t3, med = ar.winner_stats(d, "L_BASE")
    cur = d[d["T"] == d["T"].max()].copy()
    cur = cur[cur["L_BASE"] > -50]
    ev = d[(d["T"] >= 2000) & (d["T"] <= 2026) & (d["LABELED"] == 1) & (d["L_BASE"] > -50)]
    rows = []
    z = 0.6 * cur["L_BASE"].to_numpy()
    cur["P1"] = np.exp(z - z.max()) / np.exp(z - z.max()).sum()
    for k in (3, 10):
        y = ((ev["RANK_N"] <= k) & ev["RANK_N"].notna()).astype(int)
        clf = LogisticRegression(C=1e6, max_iter=1000).fit(ev[["L_BASE"]].to_numpy(), y.to_numpy())
        cur[f"P{k}"] = clf.predict_proba(cur[["L_BASE"]].to_numpy())[:, 1]
    cur["P3"], cur["P10"] = np.maximum(cur["P3"], cur["P1"]), np.maximum(cur["P10"], cur["P3"])
    top = cur.sort_values("L_BASE", ascending=False).head(n)
    tbl = pd.DataFrame({"Oyuncu": top["PLAYER_NAME"], "Takım": top["TEAM_ABBREVIATION"], "Yaş": top["AGE"].astype(int),
                        "Geçen sezon başlangıç oranı": (top["GS_FRAC"] * 100).round(0).astype("Int64").astype(str) + "%",
                        "İlk 3 %": (top["P3"] * 100).round(1), "İlk 10 %": (top["P10"] * 100).round(1)}).reset_index(drop=True)
    return (f"## 6MOY (Yılın Altıncı Adamı)\n\nGS (başlangıç oranı) özellikleriyle ve yedek süzgeciyle (geçen sezon maçların yarısından fazlasında başlayanlar elenir). "
            f"Ölçülen başarı: 2023–26 **{h[0]:.2f}**, 2011–26 **{h[1]:.2f}**, 2000–26 **{h[2]:.2f}**; kazanan ilk 10'da %{t10 * 100:.0f}, ilk 3'te %{t3 * 100:.0f}.\n\n{md_table(tbl)}\n")


def section_team(award: str) -> str:
    sp = ta.SPEC[award]
    d = ta.run(award)
    k = sp["k"]
    h = [ta.made_hits(d, "L_BASE", range(a, 2027), k).mean() for a in (2023, 2011, 2000)]
    ev = d[(d["T"] >= 2000) & (d["T"] <= 2026) & (d["LABELED"] == 1) & d["L_BASE"].notna()]
    pl = LogisticRegression(C=1e6, max_iter=1000).fit(ev[["L_BASE"]].to_numpy(), ev["MADE"].to_numpy())
    cur = d[d["T"] == d["T"].max()].copy()
    cur["P_MAKE"] = pl.predict_proba(cur[["L_BASE"]].to_numpy())[:, 1]
    cur["POS"] = cur["SLUG"].map(ta.positions(int(d["T"].max()) - 1)).fillna("F")
    top = cur.sort_values("P_MAKE", ascending=False).head(k + 8)
    tbl = pd.DataFrame({"Oyuncu": top["PLAYER_NAME"], "Takım": top["TEAM_ABBREVIATION"], "Yaş": top["AGE"].astype(int), "Poz.": top["POS"],
                        "Takıma girme %": (top["P_MAKE"] * 100).round(1)}).reset_index(drop=True)
    txt = (f"## {sp['name']}\n\nÖlçülen başarı (modelin ilk {k}'inden takıma girenler; liste başına): 2023–26 **{h[0]:.1f}**, 2011–26 **{h[1]:.1f}**, "
           f"2000–26 **{h[2]:.1f}** / {k}.\n\n{md_table(tbl)}\n")
    if award == "allnba":
        txt += "\nPozisyon kısıtlı (2 G + 2 F + 1 C) açgözlü dizilim:\n\n"
        for i, tm in enumerate(ta.teams(cur, 3), 1):
            txt += f"- **{i}. takım:** " + ", ".join(tm) + "\n"
    return txt


def section_coy(n: int = 10) -> str:
    d = coy_mod.build()
    d["L_COY"] = coy_mod.walk_forward(d, coy_mod.FEATS)
    h = [mm.finisher_hits(d, "L_COY", range(a, 2027)).mean() for a in (2011, 2000)]
    pw = softmax_win(d, "L_COY")
    d["P_WIN"] = pw
    cur = d[d["T"] == d["T"].max()].sort_values("L_COY", ascending=False).head(n)
    tbl = pd.DataFrame({"Koç": cur["COACH"], "Takım": cur["TEAM"], "Kazanır %": (cur["P_WIN"] * 100).round(1), "Geçen sezon galibiyet %": (cur["PREV_WIN_PCT"] * 100).round(0),
                        "Koçluk sezonu": cur["COACH_EXP"], "Yaz yetenek değişimi (VORP)": cur["TALENT_DELTA"].round(1), "Skor": cur["L_COY"].round(2)}).reset_index(drop=True)
    return (f"## COY (Yılın Koçu)\n\nKoç verisi eklendi (kıdem, franchise kıdemi, geçen sezon takım gücü, yaz yetenek değişimi). Ölçülen başarı (ilk 10 tahminden gerçek "
            f"top-10 finisher, 30 koç içinden; rastgele ≈ 2.6–2.9): 2011–26 **{h[0]:.2f}**, 2000–26 **{h[1]:.2f}**. Zayıf ödül: tabanlar (geçen sezon galibiyet yüzdesi) "
            f"aynı seviyede.\n\n{md_table(tbl)}\n")


def section_roy(n: int = 10) -> str:
    d = pd.read_parquet(ROOT / "data" / "awards__roy_walkforward.parquet") if (ROOT / "data" / "awards__roy_walkforward.parquet").exists() else roy_mod.build()
    d["L_ROY"] = d["L_ROY"] if "L_ROY" in d.columns else roy_mod.walk_forward(d, roy_mod.FEATS)
    d["P_WIN"] = softmax_win(d, "L_ROY")
    cur = d[d["T"] == d["T"].max()].sort_values("L_ROY", ascending=False).head(n)
    tbl = pd.DataFrame({"Oyuncu": cur["PLAYER_NAME"], "Takım": cur["TEAM_ABBREVIATION"], "Pick": cur["PICK"].astype("Int64"), "Kazanır %": (cur["P_WIN"] * 100).round(1),
                        "Kolej 40 dk sayı": cur["C_PTS40"].round(1), "Kolej BPM": cur["C_BPM"].round(1), "Kolej yaşı": cur["C_AGE"].round(1)}).reset_index(drop=True)
    return ("## ROY (Yılın Çaylağı)\n\nSıralama draft sırası ile belirleniyor; kolej istatistikleri (Torvik, 2008-09 → 2025-26) eklendi ve ölçüldü, pick'in ötesinde tutarlı "
            "kazanç vermedi (top-5/5: 2.54–2.69 vs 2.62).\n\n" + md_table(tbl) + "\n")


def section_allrookie(n: int = 14) -> str:
    d = ar_mod.load()
    d["L_MODEL"] = roy_mod.walk_forward(d, roy_mod.FEATS, first=1996)
    d["L_ORDER"] = -d["PICK_F"]
    h = [ar_mod.made_hits(d, "L_MODEL", range(a, 2027)).mean() for a in (2014, 2000)]
    b = [ar_mod.made_hits(d, "L_ORDER", range(a, 2027)).mean() for a in (2014, 2000)]
    ev = d[(d["T"] >= 2000) & (d["T"] <= 2026) & (d["LABELED"] == 1) & d["L_MODEL"].notna()]
    pl = LogisticRegression(C=1e6, max_iter=1000).fit(ev[["L_MODEL"]].to_numpy(), ev["MADE"].to_numpy())
    cur = d[d["T"] == d["T"].max()].copy()
    cur["P_MAKE"] = pl.predict_proba(cur[["L_MODEL"]].to_numpy())[:, 1]
    top = cur.sort_values("P_MAKE", ascending=False).head(n)
    tbl = pd.DataFrame({"Oyuncu": top["PLAYER_NAME"], "Takım": top["TEAM_ABBREVIATION"], "Pick": top["PICK"].astype("Int64"),
                        "Takıma girme %": (top["P_MAKE"] * 100).round(1)}).reset_index(drop=True)
    return ("## All-Rookie (10 çaylak, 2 takım)" + chr(10) + chr(10)
            + f"Ölçülen başarı (modelin ilk 10'undan takıma girenler; liste başına): 2014–26 **{h[0]:.2f}**, 2000–26 **{h[1]:.2f}** / 10; "
            + f"yalnız draft sırası **{b[0]:.2f}** / **{b[1]:.2f}**: model sırayı geçmiyor, All-Rookie neredeyse tamamen draft sırası + dakika."
            + chr(10) + chr(10) + md_table(tbl) + chr(10))


def section_mip(n: int = 10) -> str:
    lst = mh.predict(top=n)
    tbl = pd.DataFrame({"Oyuncu": lst["PLAYER_NAME"], "Takım": lst["TEAM_ABBREVIATION"], "Yaş": lst["AGE"].astype(int),
                        "Hype'sız sıra": lst["rk_nohype"], "Hype": lst["hype"].round(2), "Top-10 finisher %": (lst["P_top10"] * 100).round(1)})
    return ("## MIP (En Çok Gelişen Oyuncu)\n\nÜretim modeli + sentetik hype (λ = 0.4). Ölçülen başarı: 2023–26 **2.00 (8/40)**, 2011–26 **1.81**, 2000–26 **1.85** "
            "isabet / 10 (rastgele ≈ 0.17).\n\n" + md_table(tbl) + "\n")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parts = ["# 2026-27 ödül adayları (yüzdelerle)", "",
             "Bu dosya `python -m src.awards.report` ile üretilir; her ödül için walk-forward (yalnızca geçmişle eğitilmiş) üretim modeli ve ölçülen başarısı gösterilir. "
             "Yüzdeler kalibre edilmiştir (geçmiş sezonlarda tutarlı); yine de **olasılıktır, tahmin değil**. Clutch POY yapılmadı.", ""]
    for fn, args in ((section_continuity, ("mvp", "MVP (Most Valuable Player)")), (section_continuity, ("dpoy", "DPOY (Savunma Yılın Oyuncusu)")),
                     (section_smoy, ()), (section_team, ("allnba",)), (section_team, ("alldef",)), (section_coy, ()), (section_roy, ()), (section_allrookie, ()), (section_mip, ())):
        parts.append(fn(*args))
        print("tamam:", fn.__name__, args[:1], flush=True)
    DOC.write_text("\n".join(parts), encoding="utf-8")
    print("yazıldı:", DOC)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
