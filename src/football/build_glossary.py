# -*- coding: utf-8 -*-
"""Arketip sözlüğünü config/football_signatures.py'den ÜRETİR.

NEDEN ÜRETİLİYOR, ELLE YAZILMIYOR
─────────────────────────────────
Basketbol tarafında sözlük sayfasının verisi (frontend/src/data/glossary.js)
elle yazılmış: metrik ağırlıkları imzalardan kopyalanmış. İmza değiştiğinde
sayfa sessizce eskiyor ve kullanıcıya motorun ARTIK KULLANMADIĞI bir ağırlık
gösteriliyor. Futbolda bu riski hiç açmıyoruz — sayfa doğrudan motorun
okuduğu dosyadan üretiliyor, dolayısıyla sapması imkânsız.

Bu oturumda imzalar üç kez değişti (kaleci hacim→oran, pairs skordan çıktı,
Inside Forward incelemesi); elle tutulan bir kopya üçünde de yanlış olurdu.

ÇALIŞTIRMA
    python src/football/build_glossary.py
    -> frontend/src/data/footballGlossary.js
İmzalarda değişiklik yapan herkes bunu yeniden koşturmalı.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "frontend" / "src" / "data" / "footballGlossary.js"
sys.path.insert(0, str(ROOT / "config"))

from football_signatures import PHASES, signatures_for, archetypes_for  # noqa: E402

PHASE_LABEL = {"gk": "Goalkeeper", "def": "Defence", "mid": "Midfield", "fwd": "Attack"}
PHASE_HEX = {"gk": "#F2C14E", "def": "#4C9BE8", "mid": "#3FB08C", "fwd": "#E8654C"}

# Metrik -> okunur ad. Ham FotMob anahtarları kullanıcıya bir şey söylemiyor
# ("physical_metrics_number_of_sprints_90"), sayfada bunlar görünecek.
LABELS = {
    "goals_90": "Goals", "assists_90": "Assists",
    "total_shots_90": "Shots", "sot_pct": "Shots on target %",
    "expected_goals_non_penalty_90": "Non-penalty xG", "xgot_90": "xG on target",
    "npxg_per_shot": "xG per shot", "expected_assists_90": "Expected assists",
    "chances_created_90": "Chances created", "big_chances_created_90": "Big chances created",
    "touches_90": "Touches", "touches_opp_box_90": "Touches in opposition box",
    "accurate_passes_att_90": "Passes attempted", "pass_pct": "Pass accuracy",
    "passes_into_final_third_90": "Passes into the final third",
    "long_balls_accurate_90": "Long balls completed", "long_pct": "Long-ball accuracy",
    "long_share": "Share of passes played long", "ft_share": "Share of passes that progress",
    "accurate_crosses_90": "Crosses completed", "accurate_crosses_att_90": "Crosses attempted",
    "corners_90": "Corners",
    "dribbles_succeeded_90": "Take-ons completed",
    "dribbles_succeeded_att_90": "Take-ons attempted", "dribble_pct": "Take-on success %",
    "dispossessed_90": "Dispossessed", "was_fouled_90": "Fouled",
    "fouls_90": "Fouls committed", "Offsides_90": "Offsides",
    "tackles_90": "Tackles", "interceptions_90": "Interceptions",
    "clearances_90": "Clearances", "headed_clearance_90": "Headed clearances",
    "blocked_shots_90": "Blocks", "recoveries_90": "Recoveries",
    "defensive_actions_90": "Defensive actions", "dribbled_past_90": "Dribbled past",
    "duel_won_90": "Duels won", "ground_duels_won_90": "Ground duels won",
    "ground_duel_pct": "Ground duel win %",
    "aerials_won_90": "Aerials won", "aerial_pct": "Aerial win %",
    "saves_90": "Saves", "save_pct": "Save %", "saves_inside_box_90": "Saves inside the box",
    "goals_prevented_90": "Goals prevented", "keeper_diving_save_90": "Diving saves",
    "keeper_high_claim_90": "High claims", "keeper_sweeper_90": "Sweeper actions",
    "sweep_rate": "Share of actions outside the box", "punches_90": "Punches",
    "physical_metrics_distance_covered_90": "Distance covered",
    "physical_metrics_number_of_sprints_90": "Sprints",
    "physical_metrics_topspeed": "Top speed",
}

# Kapsaması düşük metrikler — sayfada işaretlenmeli, yoksa kullanıcı
# "neden bu arketip hiç çıkmıyor" sorusunun cevabını göremiyor.
THIN = {"physical_metrics_distance_covered_90",
        "physical_metrics_number_of_sprints_90",
        "physical_metrics_topspeed"}


def main():
    out = []
    for ph in PHASES:
        sigs = signatures_for(ph)
        for name in archetypes_for(ph):
            s = sigs[name]
            mets = sorted(s["metrics"].items(), key=lambda kv: -kv[1]["w"])
            out.append({
                "name": name,
                "phase": ph,
                "phaseLabel": PHASE_LABEL[ph],
                "color": PHASE_HEX[ph],
                "desc": s.get("desc", ""),
                "positions": list(s.get("positions") or []),
                "threshold": s.get("percentile_threshold"),
                "metrics": [{"key": k, "label": LABELS.get(k, k),
                             "w": round(v["w"], 3), "higher": v["higher"],
                             "thin": k in THIN}
                            for k, v in mets],
            })

    body = json.dumps(out, ensure_ascii=False, indent=1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME.\n"
        "// Kaynak: config/football_signatures.py\n"
        "// Yeniden üret: python src/football/build_glossary.py\n"
        "//\n"
        "// Sözlük sayfası motorun okuduğu imzalardan üretiliyor; elle tutulan\n"
        "// bir kopya imza her değiştiğinde sessizce eskiyordu.\n"
        f"export const FOOTBALL_ARCHETYPES = {body};\n",
        encoding="utf-8")

    n_thin = sum(1 for a in out for m in a["metrics"] if m["thin"])
    print(f"[OK] {len(out)} arketip -> {OUT.relative_to(ROOT)}")
    print(f"     faz dagilimi: " +
          ", ".join(f"{PHASE_LABEL[p]} {sum(1 for a in out if a['phase']==p)}" for p in PHASES))
    print(f"     dusuk kapsamali metrik referansi: {n_thin}")
    unlabelled = {m["key"] for a in out for m in a["metrics"] if m["label"] == m["key"]}
    if unlabelled:
        print(f"     [UYARI] etiketsiz metrik: {sorted(unlabelled)}")


if __name__ == "__main__":
    main()
