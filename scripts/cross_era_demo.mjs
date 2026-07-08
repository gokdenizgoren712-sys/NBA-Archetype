// ── Cross-era demo: era-meta kadroyu ne kadar etkiliyor? ─────────────────────
// Sabit bir kadroyu 6 era'nın HER BİRİNDE simüle edip coverage/rating swing'ini
// gösterir. Backtest same-era olduğu için bunu ölçemez; bu cross-era etkiyi görür.
//   node --import ./scripts/loader-register.mjs scripts/cross_era_demo.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { computeTeamRating, BASE_MINUTES } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);

function loadRoster(season, team) {
  const rec = JSON.parse(readFileSync(join(BT, `${season}.json`), "utf-8"));
  const pl = rec.players.filter(p => p.TEAM_ABBREVIATION === team && !MULTI.has(String(p.TEAM_ABBREVIATION).toUpperCase()));
  const sorted = [...pl].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
  return { starters: sorted.slice(0, 5), bench: sorted.slice(5, 9) };
}

function demo(label, season, team) {
  const { starters, bench } = loadRoster(season, team);
  const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: 0 };
  console.log(`\n${label} (${season} ${team})`);
  console.log("  era          coverage  avgQual   rating   →beklenen-W");
  const cov = [], rat = [];
  const expW = r => {  // basit deterministik: opp~N(0.679,0.054), k=9 yaklaşık
    let s = 0; for (let z = -3; z <= 3; z += 0.3) { const opp = 0.679 + 0.054 * z; s += Math.exp(-0.5 * z * z) * (1 / (1 + Math.exp(-9 * (r - opp)))); }
    let n = 0; for (let z = -3; z <= 3; z += 0.3) n += Math.exp(-0.5 * z * z);
    return Math.round(82 * s / n);
  };
  for (const era of ERAS) {
    const fit = computeLineupFit(starters, era);
    const aff = computeAffinity(starters, AFF);
    const { rating } = computeTeamRating(starters, era, fit, aff, extras);
    cov.push(fit.coverage); rat.push(rating);
    console.log(`  ${era.id.padEnd(11)}  ${fit.coverage.toFixed(3)}    ${fit.avgQuality.toFixed(3)}    ${rating.toFixed(3)}    ${expW(rating)}`);
  }
  const swing = a => (Math.max(...a) - Math.min(...a));
  console.log(`  → coverage swing: ${swing(cov).toFixed(3)}  |  rating swing: ${swing(rat).toFixed(3)}  (≈${expW(Math.max(...rat)) - expW(Math.min(...rat))} galibiyet fark)`);
}

console.log("════════ ERA-META ETKİSİ (aynı kadro, 6 farklı sim-era) ════════");
demo("SPACING kadrosu (şutörler)", "2016-17", "GSW");
demo("İÇ-SAVUNMA kadrosu", "2003-04", "DET");
console.log("\n(coverage swing = saf era-meta; rating swing = meta + era-uzaklık cezası)");
console.log("═══════════════════════════════════════════════════════════════\n");
