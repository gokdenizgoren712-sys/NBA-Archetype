// ── Era-meta kalite modülasyonu testi ────────────────────────────────────────
// Fikir: oyuncunun kalitesini, arketibinin sim-era'daki pillar ağırlığına göre
// modüle et (şutör spacing döneminde ↑, rim döneminde ↓). AMP gücü ayarlar.
// Test: same-era within-season Spearman (accuracy maliyeti) + cross-era swing.
//   node --import ./scripts/loader-register.mjs scripts/test_erameta.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { computeTeamRating, BASE_MINUTES, topArchWeights } from "../frontend/src/game/seasonSim.js";
import { ERAS, ERA_PILLAR_WEIGHTS, ARCH_PILLAR } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));

const eraMeanW = {};
for (const e of ERAS) eraMeanW[e.id] = mean(Object.values(ERA_PILLAR_WEIGHTS[e.id]));

// oyuncunun top-3 arketibinin era-pillar ağırlığı ortalaması / era ortalaması
function metaFactor(p, era) {
  const w = topArchWeights(p, 3);
  if (!w.length) return 1;
  let acc = 0, ws = 0;
  for (const [arch, wt] of w) { const pil = ARCH_PILLAR[arch]; const ew = pil ? (ERA_PILLAR_WEIGHTS[era.id][pil] ?? 1) : 1; acc += wt * ew; ws += wt; }
  return (ws > 0 ? acc / ws : 1) / eraMeanW[era.id];
}
// overall'ı AMP ile ölçekle → hem coverage-quality hem sim-quality etkilenir
function adj(p, era, AMP) {
  const mf = metaFactor(p, era);
  const o = parseFloat(p.overall_score) || 0;
  return { ...p, overall_score: Math.min(1, o * (1 - AMP + AMP * mf)) };
}

// ── Same-era backtest: her AMP için within-season Spearman ───────────────────
const teams = [];
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
    teams.push({ season: rec.season, simEra, starters: sorted.slice(0, 5), bench: sorted.slice(5, 9), y: rec.realWins[team] / games });
  }
}
function within(AMP) {
  const rows = teams.map(t => {
    const st = t.starters.map(p => adj(p, t.simEra, AMP)), bn = t.bench.map(p => adj(p, t.simEra, AMP));
    const fit = computeLineupFit(st, t.simEra);
    const aff = computeAffinity(st, AFF);
    const { rating } = computeTeamRating(st, t.simEra, fit, aff, { bench: bn, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: 0 });
    return { season: t.season, rating, y: t.y };
  });
  const seasons = [...new Set(rows.map(r => r.season))]; const ws = [];
  for (const s of seasons) { const sub = rows.filter(r => r.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(r => r.rating), sub.map(r => r.y))); }
  return mean(ws.filter(v => !isNaN(v)));
}

// ── Cross-era swing: GSW spacing kadrosu, AMP başına ─────────────────────────
const gsw = (() => { const rec = JSON.parse(readFileSync(join(BT, "2016-17.json"), "utf-8")); const pl = rec.players.filter(p => p.TEAM_ABBREVIATION === "GSW"); const s = [...pl].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0)).slice(0, 9); return { starters: s.slice(0, 5), bench: s.slice(5, 9) }; })();
function swing(AMP) {
  const rats = ERAS.map(era => {
    const st = gsw.starters.map(p => adj(p, era, AMP)), bn = gsw.bench.map(p => adj(p, era, AMP));
    const fit = computeLineupFit(st, era); const aff = computeAffinity(st, AFF);
    return computeTeamRating(st, era, fit, aff, { bench: bn, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: 0 }).rating;
  });
  return { swing: Math.max(...rats) - Math.min(...rats), best: ERAS[rats.indexOf(Math.max(...rats))].id, worst: ERAS[rats.indexOf(Math.min(...rats))].id };
}

console.log("\n════════ ERA-META KALİTE MODÜLASYONU ════════");
console.log("AMP   same-era Spearman   GSW cross-era rating swing");
for (const AMP of [0, 0.15, 0.30, 0.50]) {
  const w = within(AMP), s = swing(AMP);
  console.log(`${AMP.toFixed(2)}  ${w.toFixed(4)}            ${s.swing.toFixed(3)}  (en iyi: ${s.best}, en kötü: ${s.worst})`);
}
console.log("\n(AMP=0 mevcut; swing↑ = era daha hissedilir; Spearman↓ = same-era accuracy maliyeti)");
console.log("═══════════════════════════════════════════════════\n");
