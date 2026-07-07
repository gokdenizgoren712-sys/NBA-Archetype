// ── P2 testi: rebounding yeni sinyal mi? ─────────────────────────────────────
// Ribaunt (REB_PCT) galibiyeti tahmin ediyor mu + mevcut rating'e marjinal
// değer katıyor mu? Arketipler ribauntu yakalamıyor → potansiyel yeni sinyal.
//   node --import ./scripts/loader-register.mjs scripts/test_p2.mjs
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
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const rebOf = p => { const v = parseFloat(p.REB_PCT); return isNaN(v) ? 8 : v; };  // null→~ortalama-altı

const D = [];
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
    const { rating } = computeTeamRating(starters, simEra, fit, aff, extras);
    const rebs = starters.map(rebOf);
    D.push({ season: rec.season, rating,
             rebMax: Math.max(...rebs), rebAvg: mean(rebs), rebSum: rebs.reduce((a, b) => a + b, 0),
             y: rec.realWins[team] / games });
  }
}
const seasons = [...new Set(D.map(d => d.season))];
function within(fn) { const ws = []; for (const s of seasons) { const sub = D.filter(d => d.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(fn), sub.map(d => d.y))); } return mean(ws.filter(v => !isNaN(v))); }

console.log("\n════════ P2 REBOUNDING TESTİ — within-season Spearman ════════");
console.log("── Ribaunt metriği TEK BAŞINA → galibiyet ──");
for (const k of ["rebMax", "rebAvg", "rebSum"]) console.log(`  ${k.padEnd(8)} ${within(d => d[k]).toFixed(4)}`);
// en iyi metrik marjinal: rating + w·z(reb)
const bestK = ["rebMax", "rebAvg", "rebSum"].sort((a, b) => within(d => d[b]) - within(d => d[a]))[0];
const vals = D.map(d => d[bestK]); const m = mean(vals), s = std(vals);
D.forEach(d => d.rz = (d[bestK] - m) / s);
console.log(`\n── rating + w·z(${bestK}) marjinal (base rating: ${within(d => d.rating).toFixed(4)}) ──`);
for (const w of [0, 0.01, 0.02, 0.03, 0.05, 0.08]) console.log(`  w=${w.toFixed(2)}  ${within(d => d.rating + w * d.rz).toFixed(4)}`);
console.log("═══════════════════════════════════════════════════════════════\n");
