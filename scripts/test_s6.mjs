// ── S6 sanity: dynasty yaşlanma eğrisi ───────────────────────────────────────
// Güçlü bir şampiyonu dynasty yıl 1-6 boyunca (agePenaltyFor) koşup title% ve
// ort galibiyetin HIZLANARAK düştüğünü doğrular. Cetvel ölçmez → MC-sanity.
//   node --import ./scripts/loader-register.mjs scripts/test_s6.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { simulateSeason, BASE_MINUTES, agePenaltyFor } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const N = 300;

// Güçlü şampiyon: 2016-17 GSW
const rec = JSON.parse(readFileSync(join(BT, "2016-17.json"), "utf-8"));
const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
const plist = rec.players.filter(p => p.TEAM_ABBREVIATION === rec.champion && !MULTI.has(String(p.TEAM_ABBREVIATION).toUpperCase()));
const sorted = [...plist].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
const starters = sorted.slice(0, 5), bench = sorted.slice(5, 9);
const fit = computeLineupFit(starters, simEra);
const aff = computeAffinity(starters, AFF);

console.log(`\n════════ S6 SANITY — dynasty yaşlanma (${rec.champion} '16-17, ${N} sim/yıl) ════════`);
console.log("yıl  agePenalty  ort-W   title%");
for (let year = 1; year <= 6; year++) {
  const ap = agePenaltyFor(year);
  const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: ap };
  let w = 0, t = 0;
  for (let i = 0; i < N; i++) { const r = simulateSeason(starters, simEra, fit, aff, extras); w += r.wins; if (r.champion) t++; }
  console.log(`  ${year}    ${ap.toFixed(3).padStart(6)}     ${(w / N).toFixed(1).padStart(4)}   ${(t / N * 100).toFixed(1).padStart(5)}%`);
}
console.log("═══════════════════════════════════════════════════════════════\n");
