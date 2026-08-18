# -*- coding: utf-8 -*-
"""Hedefli isimsiz oyuncu kartları — sözlüğün KARARSIZ olduğu yerler.

NEDEN
─────
Saha ground truth'u 89 etiket / 20 arketip = arketip başına ~4.5 örnek.
Standart hata ~5 puan; denenen imza varyantlarının hepsi birbirinin 2 puanı
içinde kalıyor, yani veri hangisinin doğru olduğunu söyleyemiyor. Rastgele
daha çok etiket toplamak yerine, motorun EN KARARSIZ olduğu oyuncuları
seçiyoruz: ilk iki arketip skoru birbirine en yakın olanlar. Orada verilen
her etiket, ayrımı doğrudan bilgilendiriyor.

Kaleci tarafında bu yöntem işe yaradı: isim gizliyken verilen 27 etiket,
isimliyle karşılaştırıldığında 14'ü değişti ve sistemin isabeti tabanın
altından üstüne çıktı.

İsim/takım/lig KART ÜZERİNDE YOK — cevap namdan değil sayılardan gelsin.
"""
import sys
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "config"))
from football_signatures import signatures_for, archetypes_for  # noqa: E402

PHASE_METRICS = {
    "def": [("Defending", ["tackles_90","interceptions_90","clearances_90",
                           "blocked_shots_90","ground_duels_won_90","aerials_won_90",
                           "dribbled_past_90"]),
            ("On the ball", ["accurate_passes_att_90","pass_pct","long_pct",
                             "passes_into_final_third_90","touches_90"]),
            ("Going forward", ["accurate_crosses_att_90","cross_pct","touches_opp_box_90",
                               "assists_90","chances_created_90","goals_90"])],
    "mid": [("Defending", ["tackles_90","interceptions_90","recoveries_90",
                           "defensive_actions_90","ground_duels_won_90","aerials_won_90"]),
            ("On the ball", ["accurate_passes_att_90","pass_pct","long_pct",
                             "passes_into_final_third_90","touches_90",
                             "dribbles_succeeded_90","dribble_pct"]),
            ("Attacking", ["touches_opp_box_90","total_shots_90","goals_90",
                           "assists_90","chances_created_90","expected_assists_90"])],
    "fwd": [("Scoring", ["goals_90","total_shots_90","expected_goals_non_penalty_90",
                         "sot_pct","touches_opp_box_90","npxg_per_shot"]),
            ("Creating", ["assists_90","chances_created_90","expected_assists_90",
                          "big_chances_created_90","accurate_crosses_att_90","cross_pct"]),
            ("Carrying & pressing", ["dribbles_succeeded_90","dribble_pct","touches_90",
                                     "recoveries_90","tackles_90","was_fouled_90"])],
}
PCT_KEYS = {"pass_pct","long_pct","cross_pct","dribble_pct","sot_pct","aerial_pct",
            "ground_duel_pct"}


def pick(df, phase, n):
    """İlk iki arketip skoru en yakın olan n oyuncu."""
    sigs = signatures_for(phase)
    archs = [a for a in archetypes_for(phase) if f"score_{a}" in df.columns]
    S = df[[f"score_{a}" for a in archs]].copy(); S.columns = archs
    for a in archs:
        allowed = sigs[a].get("positions") or ()
        if allowed:
            S.loc[~df.POSITION.isin(allowed), a] = np.nan
    # np.sort NaN'i SONA koyuyor; ters cevirince basa geciyor ve fark NaN
    # oluyordu -> secim de rastgeleye donuyordu. Once -inf'e cevir.
    M = np.nan_to_num(S.to_numpy(float), nan=-np.inf)
    srt = -np.sort(-M, axis=1)
    gap = srt[:, 0] - srt[:, 1]
    gap = np.where(np.isfinite(gap), gap, np.inf)   # 2 adayi olmayan hep sonda
    out = df.copy()
    out["_gap"] = gap
    out["_top2"] = [", ".join(S.columns[np.argsort(-np.nan_to_num(r, nan=-9))[:2]])
                    for r in S.to_numpy(float)]
    return out.nsmallest(n, "_gap")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2025-2026")
    ap.add_argument("--per-phase", type=int, default=12)
    a = ap.parse_args()

    d = pd.read_parquet(DATA / f"football__{a.season}__scores.parquet")
    d = d[d.qualified & d.primary_arch.notna()]
    out, key = [], []
    out += ["# Oyuncu kartları — isimsiz",
            "",
            f"{a.season} sezonu. **İsim, takım ve lig gizli.** Bu kartlar rastgele",
            "seçilmedi: motorun en KARARSIZ olduğu oyuncular, yani ilk iki arketip",
            "skoru birbirine en yakın olanlar. Senin cevabın tam da ayrımın",
            "belirsiz olduğu yerde bilgi taşıyor.", "",
            "Her satır: `ham per-90 değer (persantil)`. Persantil aynı ligdeki",
            "aynı fazdaki oyuncular arasında.", "", "---", ""]
    n = 0
    for phase, groups in PHASE_METRICS.items():
        g = d[d.PHASE == phase].copy()
        cols = [m for _, ms in groups for m in ms if m in g.columns]
        for c in cols:
            g[f"_p_{c}"] = g.groupby("LEAGUE")[c].rank(pct=True)
        sel = pick(g, phase, a.per_phase)
        names = [x for x in archetypes_for(phase)]
        out += [f"## {phase.upper()} — seçenekler: " + " · ".join(f"`{x}`" for x in names), ""]
        for _, r in sel.iterrows():
            n += 1
            cid = f"{phase.upper()}{n:02d}"
            key.append({"card": cid, "player": r.PLAYER_NAME, "team": r.TEAM,
                        "league": r.LEAGUE, "phase": phase, "position": r.POSITION,
                        "system": r.primary_arch, "top2": r._top2,
                        "gap": round(float(r._gap), 4)})
            out += [f"### {cid} · {r.POSITION} · {int(r.MINUTES_TOTAL)} dk · {int(r.APPS)} maç", ""]
            for label, ms in groups:
                parts = []
                for m in ms:
                    if m not in g.columns or pd.isna(r.get(m)):
                        continue
                    v = r[m]; p = r.get(f"_p_{m}")
                    vs = f"{v*100:.0f}%" if m in PCT_KEYS else f"{v:.2f}"
                    ps = f" ({p*100:.0f})" if pd.notna(p) else ""
                    parts.append(f"{m.replace('_90','').replace('_',' ')} **{vs}**{ps}")
                if parts:
                    out += [f"**{label}** — " + " · ".join(parts), ""]
            out += ["**ETIKET:** ", "", "---", ""]

    (DATA / "football_player_cards.md").write_text("\n".join(out), encoding="utf-8")
    pd.DataFrame(key).to_csv(DATA / "football_player_cards_key.csv",
                             index=False, encoding="utf-8-sig")
    print(f"[OK] {n} kart -> data/football_player_cards.md")
    print(f"     anahtar -> data/football_player_cards_key.csv")
    k = pd.DataFrame(key)
    print(f"\nortalama ilk-iki farkı: {k.gap.mean():.3f} (ne kadar kucuk o kadar kararsiz)")
    print("faz basina:", k.phase.value_counts().to_dict())


if __name__ == "__main__":
    main()
