// ── G5: draft notu (lineupScore) ↔ sim rating kopukluğu ──────────────────────
//   node --import ./scripts/loader-register.mjs scripts/test_g5.mjs
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
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));

const D = [];
for (const f of readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort()) {
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
    const { rating } = computeTeamRating(starters, simEra, fit, aff, { bench, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: 0 });
    // Draft notu (lineupScore) — LineupGame'deki formül
    const lineupScore = Math.min(1, 0.45 * fit.avgQuality + 0.40 * fit.coverage + 0.15 * fit.roleFit);
    D.push({ season: rec.season, lineupScore, rating, y: rec.realWins[team] / games });
  }
}
const seasons = [...new Set(D.map(d => d.season))];
const within = (fa, fb) => { const ws = []; for (const s of seasons) { const sub = D.filter(d => d.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(fa), sub.map(fb))); } return mean(ws.filter(v => !isNaN(v))); };

console.log("\n════════ G5: draft notu ↔ sim rating ════════");
console.log(`Örneklem: ${D.length} takım`);
console.log(`  Spearman(lineupScore, sim rating) [sezon-içi] = ${within(d => d.lineupScore, d => d.rating).toFixed(4)}  (yüksek → tutarlı)`);
console.log(`  lineupScore → gerçek galibiyet [within]        = ${within(d => d.lineupScore, d => d.y).toFixed(4)}`);
console.log(`  sim rating  → gerçek galibiyet [within]        = ${within(d => d.rating, d => d.y).toFixed(4)}`);
console.log("  (draft notu sim'den belirgin düşük tahmin ediyorsa kopukluk var demektir)");
console.log("═══════════════════════════════════════════════\n");
