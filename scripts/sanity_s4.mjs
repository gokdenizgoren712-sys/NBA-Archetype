// ── S4 canlı-his + playoff sanity ────────────────────────────────────────────
// Gerçek şampiyonları (ve kontrast takımları) tam sim'de N kez koşup galibiyet
// dağılımı + title%/Finals% raporlar. Cetvel playoff'u ölçmez; bu, playoff
// base kalibrasyonunun ve genel his'in makul olduğunu doğrular.
//   node --import ./scripts/loader-register.mjs scripts/sanity_s4.mjs
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
const N = 300;

function buildTeam(players, simEra) {
  const sorted = [...players].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
  const starters = sorted.slice(0, 5), bench = sorted.slice(5, 9);
  const fit = computeLineupFit(starters, simEra);
  const aff = computeAffinity(starters, AFF);
  const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, starters.length + bench.length), agePenalty: 0 };
  return { starters, simEra, fit, aff, extras };
}
function mcStats(t) {
  let w = 0, title = 0, finals = 0, madePO = 0;
  const wins = [];
  for (let i = 0; i < N; i++) {
    const r = simulateSeason(t.starters, t.simEra, t.fit, t.aff, t.extras);
    w += r.wins; wins.push(r.wins);
    if (r.champion) title++;
    if (r.playoffRounds.length === 4) finals++;
    if (r.madePlayoffs) madePO++;
  }
  wins.sort((a, b) => a - b);
  return { meanW: w / N, p10: wins[Math.floor(N * 0.1)], p90: wins[Math.floor(N * 0.9)],
           title: title / N, finals: finals / N, madePO: madePO / N };
}

const files = readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
console.log(`\n════════ S4 SANITY — gerçek şampiyonlar (${N} sim/takım) ════════`);
console.log("sezon    şampiyon  ort-W  (p10–p90)  title%  Finals%  PO%");
const champTitles = [];
for (const f of files) {
  const rec = JSON.parse(readFileSync(join(BT, f), "utf-8"));
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const plist = rec.players.filter(p => p.TEAM_ABBREVIATION === rec.champion && !MULTI.has(String(p.TEAM_ABBREVIATION).toUpperCase()));
  if (plist.length < 5) { console.log(`${rec.season} ${rec.champion}: kadro yok`); continue; }
  const s = mcStats(buildTeam(plist, simEra));
  champTitles.push(s.title);
  console.log(`${rec.season} ${rec.champion.padEnd(4)}     ${s.meanW.toFixed(1).padStart(4)}  (${String(s.p10).padStart(2)}–${String(s.p90).padStart(2)})    ${(s.title * 100).toFixed(0).padStart(3)}%    ${(s.finals * 100).toFixed(0).padStart(3)}%   ${(s.madePO * 100).toFixed(0).padStart(3)}%`);
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\nŞampiyon ortalama title%: ${(mean(champTitles) * 100).toFixed(1)}%  (makul aralık ~%15-35; NBA'de en iyi takım ~%25 alır)`);
console.log("═══════════════════════════════════════════════════════════════\n");
