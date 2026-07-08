// ── P3/P4/P5 pillar incelemesi ───────────────────────────────────────────────
// P3: pillar arketip çarpanları (Eco×1.10 vb.) — çarpanlar kapalı vs açık
// P4: ERA_PILLAR_WEIGHTS — era-ağırlıklı vs uniform
// P5: coverage örten oyuncunun kalitesi — MAX vs kalite-ağırlıklı MAX
// Her varyant, cov_old ölçeğine z-eşlenip rating'e konur → within-season Spearman.
//   node --import ./scripts/loader-register.mjs scripts/test_pillars.mjs
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
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));
const _s = (p, k) => Math.max(0, parseFloat(p[`score_${k}`]) || 0);
const mx = (...a) => Math.min(1, Math.max(...a));

// çarpansız pillar (P3) — raw noun MAX
function pillarsNoMult(p) {
  return {
    creation: mx(_s(p, "Ecosystem"), _s(p, "Engine"), _s(p, "Hub"), _s(p, "Creator"), _s(p, "Initiator")),
    spacing: mx(_s(p, "Spacer"), _s(p, "3-and-D"), _s(p, "Stretch"), _s(p, "Gravity"), _s(p, "Three-Level")),
    rim_protection: mx(_s(p, "Anchor"), _s(p, "Force"), _s(p, "Rim Runner")),
    perimeter_d: mx(_s(p, "Stopper"), _s(p, "Two-Way"), _s(p, "Point-of-Attack"), _s(p, "Defensive")),
    finishing: mx(_s(p, "Finisher"), _s(p, "Rim Runner"), _s(p, "Force"), _s(p, "Slashing")),
  };
}
const PILLARS = ["creation", "spacing", "rim_protection", "perimeter_d", "finishing"];
function covWeighted(covs, W) { let ws = 0, wd = 0; for (const k of PILLARS) { ws += W[k]; wd += covs[k] * W[k]; } return wd / ws; }

const rows = [];
for (const f of readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort()) {
  const rec = JSON.parse(readFileSync(join(BT, f), "utf-8"));
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const W = ERA_PILLAR_WEIGHTS[simEra.id], UNI = { creation: 1, spacing: 1, rim_protection: 1, perimeter_d: 1, finishing: 1 };
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
    const pp = fit.perPlayer;
    // per-pillar MAX (mevcut, çarpanlı) — fit'ten
    const covCur = { creation: fit.creation, spacing: fit.spacing, rim_protection: fit.rim_protection, perimeter_d: fit.perimeter_d, finishing: fit.finishing };
    // P3: çarpansız
    const nm = starters.map(pillarsNoMult);
    const covP3 = {}; for (const k of PILLARS) covP3[k] = Math.max(...nm.map(x => x[k]));
    // P5: kalite-ağırlıklı MAX (spacing hariç — o zaten derinlik-duyarlı, dokunma)
    const covP5 = { spacing: fit.spacing };
    for (const k of ["creation", "rim_protection", "perimeter_d", "finishing"]) {
      const map = { rim_protection: "rimProt", perimeter_d: "perimD" };
      const key = map[k] || k;
      covP5[k] = Math.max(...pp.map(x => x[key] * x.quality));
    }
    rows.push({
      season: rec.season, base: rating - 0.28 * fit.coverage, y: rec.realWins[team] / games,
      cur: fit.coverage,
      p3: covWeighted(covP3, W),        // çarpansız + era
      p4: covWeighted(covCur, UNI),     // çarpanlı + uniform (era kapalı)
      p5: covWeighted(covP5, W),        // kalite-ağırlıklı + era
    });
  }
}
const seasons = [...new Set(rows.map(r => r.season))];
// z-eşle: varyant coverage'ı cur'un ort/std'ine getir (yalnız ranking değişsin)
function zmatch(key) {
  const cur = rows.map(r => r.cur), v = rows.map(r => r[key]);
  const cm = mean(cur), csd = std(cur), vm = mean(v), vsd = std(v);
  return rows.map(r => cm + (r[key] - vm) / vsd * csd);
}
function within(scoreArr) { const ws = []; for (const s of seasons) { const idx = rows.map((r, i) => r.season === s ? i : -1).filter(i => i >= 0); if (idx.length >= 3) ws.push(spearman(idx.map(i => scoreArr[i]), idx.map(i => rows[i].y))); } return mean(ws.filter(v => !isNaN(v))); }
const ratingWith = zc => rows.map((r, i) => r.base + 0.28 * zc[i]);

console.log("\n════════ P3/P4/P5 PILLAR TESTİ — within-season Spearman ════════");
console.log(`  MEVCUT (çarpanlı + era + MAX)        ${within(rows.map(r => r.base + 0.28 * r.cur)).toFixed(4)}`);
console.log(`  P3: çarpansız (mult=1)              ${within(ratingWith(zmatch("p3"))).toFixed(4)}`);
console.log(`  P4: uniform era weights             ${within(ratingWith(zmatch("p4"))).toFixed(4)}`);
console.log(`  P5: kalite-ağırlıklı coverage       ${within(ratingWith(zmatch("p5"))).toFixed(4)}`);
console.log("═══════════════════════════════════════════════════════════════\n");
