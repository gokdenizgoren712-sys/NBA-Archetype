// ── Rating bileşen ablasyonu ─────────────────────────────────────────────────
// within-season Spearman'ı bileşen bileşen ekleyerek her birinin marjinal
// katkısını ölçer. "Tavanın sınırlayıcısı ne?" sorusuna cevap.
//   node --import ./scripts/loader-register.mjs scripts/test_ablation.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { computeTeamRating, BASE_MINUTES } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));

const T = [];   // { season, rosterQ, starPower, coverage, roleFit, affT, fxReg, y }
const files = readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
for (const f of files) {
  const rec = JSON.parse(readFileSync(join(BT, f), "utf-8"));
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const games = rec.games || 82;
  const byTeam = {};
  for (const p of rec.players) { const t = p.TEAM_ABBREVIATION; if (!t || MULTI.has(String(t).toUpperCase())) continue; (byTeam[t] ||= []).push(p); }
  for (const [team, plist] of Object.entries(byTeam)) {
    if (!(team in rec.realWins)) continue;
    const sorted = [...plist].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
    if (sorted.length < 5) continue;
    const starters = sorted.slice(0, 5), bench = sorted.slice(5, 9);
    const fit = computeLineupFit(starters, simEra);
    const aff = computeAffinity(starters, AFF);
    const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, starters.length + bench.length), agePenalty: 0 };
    const { starPower, profiles, benchProfiles, fx } = computeTeamRating(starters, simEra, fit, aff, extras);
    const all = [...profiles, ...benchProfiles]; const tot = all.reduce((a, p) => a + p.minutes, 0);
    const rosterQ = all.reduce((a, p) => a + p.effQ * p.minutes, 0) / tot;
    T.push({ season: rec.season, rosterQ, starPower, coverage: fit.coverage, roleFit: fit.roleFit,
             affT: aff != null ? (aff - 0.65) * 0.15 : 0, fxReg: fx?.regular || 0, y: rec.realWins[team] / games });
  }
}
const seasons = [...new Set(T.map(t => t.season))];
function withinSp(scoreFn) { const ws = []; for (const s of seasons) { const sub = T.filter(t => t.season === s); if (sub.length < 3) continue; ws.push(spearman(sub.map(scoreFn), sub.map(t => t.y))); } return mean(ws.filter(v => !isNaN(v))); }

const steps = [
  ["overall kalite (0.42·rosterQ)", t => 0.42 * t.rosterQ],
  ["+ starPower (0.18)", t => 0.42 * t.rosterQ + 0.18 * t.starPower],
  ["+ coverage (0.28)", t => 0.42 * t.rosterQ + 0.18 * t.starPower + 0.28 * t.coverage],
  ["+ roleFit (0.12)", t => 0.42 * t.rosterQ + 0.18 * t.starPower + 0.28 * t.coverage + 0.12 * t.roleFit],
  ["+ affinity + fx (= TAM)", t => 0.42 * t.rosterQ + 0.18 * t.starPower + 0.28 * t.coverage + 0.12 * t.roleFit + t.affT + t.fxReg],
];
console.log("\n════════ RATING BİLEŞEN ABLASYONU — within-season Spearman ════════");
let prev = 0;
for (const [name, fn] of steps) { const s = withinSp(fn); console.log(`${name.padEnd(34)} ${s.toFixed(4)}   Δ${(s - prev >= 0 ? "+" : "") + (s - prev).toFixed(4)}`); prev = s; }
// tek başına her bileşen
console.log("\n── Tek başına (her biri yalnız) ──");
for (const [name, key] of [["rosterQ", "rosterQ"], ["starPower", "starPower"], ["coverage", "coverage"], ["roleFit", "roleFit"], ["affinity", "affT"]]) {
  console.log(`  ${name.padEnd(12)} ${withinSp(t => t[key]).toFixed(4)}`);
}
console.log("═══════════════════════════════════════════════════════════════════\n");
