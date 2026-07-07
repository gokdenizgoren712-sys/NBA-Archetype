// ── S7 sanity: ödül dağıtımı üretim-tabanlı mı ───────────────────────────────
//   node --import ./scripts/loader-register.mjs scripts/test_s7.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { simulateSeason, BASE_MINUTES } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const N = 400;

function run(season, team) {
  const rec = JSON.parse(readFileSync(join(BT, `${season}.json`), "utf-8"));
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const plist = rec.players.filter(p => p.TEAM_ABBREVIATION === team && !MULTI.has(String(p.TEAM_ABBREVIATION).toUpperCase()));
  const sorted = [...plist].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
  const starters = sorted.slice(0, 5), bench = sorted.slice(5, 9);
  const fit = computeLineupFit(starters, simEra);
  const aff = computeAffinity(starters, AFF);
  const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: 0 };
  const cnt = { MVP: {}, DPOY: {}, "6MOY": {} }; let mvp = 0, dpoy = 0, sixth = 0, w = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateSeason(starters, simEra, fit, aff, extras); w += r.wins;
    for (const a of r.awards) {
      if (a.includes("MVP") && !a.includes("Finals")) { mvp++; const n = a.split("— ")[1]; cnt.MVP[n] = (cnt.MVP[n] || 0) + 1; }
      else if (a.includes("Defensive")) { dpoy++; const n = a.split("— ")[1]; cnt.DPOY[n] = (cnt.DPOY[n] || 0) + 1; }
      else if (a.includes("Sixth")) { sixth++; const n = a.split("— ")[1]; cnt["6MOY"][n] = (cnt["6MOY"][n] || 0) + 1; }
    }
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, c]) => `${n} ${(c / N * 100).toFixed(0)}%`).join(", ");
  console.log(`\n${season} ${team} — ort ${(w / N).toFixed(1)}W`);
  console.log(`  MVP:  ${(mvp / N * 100).toFixed(0).padStart(3)}%  → ${top(cnt.MVP) || "—"}`);
  console.log(`  DPOY: ${(dpoy / N * 100).toFixed(0).padStart(3)}%  → ${top(cnt.DPOY) || "—"}`);
  console.log(`  6MOY: ${(sixth / N * 100).toFixed(0).padStart(3)}%  → ${top(cnt["6MOY"]) || "—"}`);
}
console.log("════════ S7 SANITY — ödül dağıtımı ════════");
run("2016-17", "GSW");   // süper takım (KD + Curry)
run("1994-95", "DEN");   // zayıf-orta takım (Mutombo = savunma)
run("2013-14", "SAS");   // dengeli şampiyon
console.log("═══════════════════════════════════════════\n");
