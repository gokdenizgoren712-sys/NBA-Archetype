// ── P1 varyant testi (coverage derinliği) ────────────────────────────────────
// 4 MAX-pillar'ını (creation, rim, perim, finishing) derinlik-duyarlı yapmayı
// test eder. spacing zaten derinlik-duyarlı (effShooters) → dokunulmaz.
// computeLineupFit perPlayer + per-pillar cov döndürür → sim'e dokunmadan test.
//   node --import ./scripts/loader-register.mjs scripts/test_p1.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { computeTeamRating, BASE_MINUTES } from "../frontend/src/game/seasonSim.js";
import { ERAS, ERA_PILLAR_WEIGHTS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);

const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));

const top2 = vals => { const s = [...vals].sort((a, b) => b - a); return Math.min(1, s[0] + 0.3 * (s[1] || 0)); };
const noisyOr = vals => Math.min(1, 1 - vals.reduce((a, v) => a * (1 - Math.max(0, Math.min(1, v))), 1));

const rows = { 0: [], 1: [], 2: [] };
const files = readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
for (const f of files) {
  const rec = JSON.parse(readFileSync(join(BT, f), "utf-8"));
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const W = ERA_PILLAR_WEIGHTS[simEra.id];
  const games = rec.games || 82;
  const byTeam = {};
  for (const p of rec.players) { const t = p.TEAM_ABBREVIATION; if (!t || MULTI.has(String(t).toUpperCase())) continue; (byTeam[t] ||= []).push(p); }
  const covW = (c, s, r, pe, fi) => { const m = { creation: c, spacing: s, rim_protection: r, perimeter_d: pe, finishing: fi }; let ws = 0, wd = 0; for (const k in W) { ws += W[k]; wd += m[k] * W[k]; } return wd / ws; };
  for (const [team, plist] of Object.entries(byTeam)) {
    if (!(team in rec.realWins)) continue;
    const sorted = [...plist].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9);
    if (sorted.length < 5) continue;
    const starters = sorted.slice(0, 5), bench = sorted.slice(5, 9);
    const fit = computeLineupFit(starters, simEra);
    const aff = computeAffinity(starters, AFF);
    const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, starters.length + bench.length), agePenalty: 0 };
    const { rating } = computeTeamRating(starters, simEra, fit, aff, extras);
    const pp = fit.perPlayer;
    const cre = pp.map(p => p.creation), rim = pp.map(p => p.rimProt), per = pp.map(p => p.perimD), fin = pp.map(p => p.finishing);
    const cov0 = fit.coverage;
    const cov1 = covW(top2(cre), fit.spacing, top2(rim), top2(per), top2(fin));
    const cov2 = covW(noisyOr(cre), fit.spacing, noisyOr(rim), noisyOr(per), noisyOr(fin));
    const y = rec.realWins[team] / games;
    rows[0].push({ season: rec.season, x: rating, y });
    rows[1].push({ season: rec.season, x: rating - 0.28 * cov0 + 0.28 * cov1, y });
    rows[2].push({ season: rec.season, x: rating - 0.28 * cov0 + 0.28 * cov2, y });
  }
}

function report(rs) {
  const pooled = spearman(rs.map(r => r.x), rs.map(r => r.y));
  const seasons = [...new Set(rs.map(r => r.season))]; const ws = [];
  for (const s of seasons) { const sub = rs.filter(r => r.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(r => r.x), sub.map(r => r.y))); }
  return { pooled, within: mean(ws.filter(v => !isNaN(v))) };
}
const names = ["0) MAX (mevcut)", "1) top-2 harman (max+0.3·2.)", "2) azalan-getiri (noisy-OR)"];
console.log("\n════════ P1 VARYANT TESTİ — within-season Spearman ════════");
let best = -1, bestV = 0;
for (const v of [0, 1, 2]) { const r = report(rows[v]); if (r.within > best) { best = r.within; bestV = v; } console.log(`${names[v].padEnd(30)} within=${r.within.toFixed(4)}  pooled=${r.pooled.toFixed(4)}`); }
console.log(`\nKAZANAN: ${names[bestV]}`);
console.log("═══════════════════════════════════════════════════════════\n");
