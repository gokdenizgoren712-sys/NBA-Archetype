// ── S5 sanity: seed önemli mi + şampiyon title% makul mü ─────────────────────
// Tüm takımları N kez sim'e sokar; her playoff görünümünü SEED'e göre etiketler,
// seed başına title% raporlar. "Seed matters" bunu doğrular. Şampiyon (18 gerçek)
// title% ayrıca. Cetvel playoff'u ölçmez — bu MC-sanity.
//   node --import ./scripts/loader-register.mjs scripts/test_s5.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { simulateSeason, BASE_MINUTES } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const N = 60;
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function buildTeam(players, simEra) {
  const sorted = [...players].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
  const starters = sorted.slice(0, 5), bench = sorted.slice(5, 9);
  const fit = computeLineupFit(starters, simEra);
  const aff = computeAffinity(starters, AFF);
  const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, starters.length + bench.length), agePenalty: 0 };
  return { starters, simEra, fit, aff, extras };
}

const seedApp = {}, seedTitle = {};   // seed → appearances / titles
const champTitles = [];
const files = readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
for (const f of files) {
  const rec = JSON.parse(readFileSync(join(BT, f), "utf-8"));
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const byTeam = {};
  for (const p of rec.players) { const t = p.TEAM_ABBREVIATION; if (!t || MULTI.has(String(t).toUpperCase())) continue; (byTeam[t] ||= []).push(p); }
  for (const [team, plist] of Object.entries(byTeam)) {
    if (!(team in rec.realWins) || plist.length < 5) continue;
    const T = buildTeam(plist, simEra);
    let titles = 0;
    for (let i = 0; i < N; i++) {
      const r = simulateSeason(T.starters, T.simEra, T.fit, T.aff, T.extras);
      if (r.madePlayoffs) { seedApp[r.seed] = (seedApp[r.seed] || 0) + 1; if (r.champion) seedTitle[r.seed] = (seedTitle[r.seed] || 0) + 1; }
      if (r.champion) titles++;
    }
    if (team === rec.champion) champTitles.push(titles / N);
  }
}
console.log("\n════════ S5 SANITY — seed matters? ════════");
console.log("seed  görünüm   title%   (bracket avantajı seed'le artmalı)");
for (let s = 1; s <= 8; s++) {
  const app = seedApp[s] || 0, tit = seedTitle[s] || 0;
  if (!app) continue;
  console.log(`  ${s}    ${String(app).padStart(6)}   ${(tit / app * 100).toFixed(1).padStart(5)}%`);
}
console.log(`\nGerçek şampiyonlar (18, çoğu 1-2 seed): ort title% = ${(mean(champTitles) * 100).toFixed(1)}%  (hedef ~%25-35)`);
console.log("═══════════════════════════════════════════\n");
