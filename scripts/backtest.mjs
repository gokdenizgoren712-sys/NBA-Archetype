// ── G3 Backtest harness ──────────────────────────────────────────────────────
// Gerçek tarihsel takımları (data/backtest/<sezon>.json — Python export) GERÇEK JS
// sim'ine sokar, sim'in beklenen galibiyet oranını gerçek galibiyet oranıyla
// karşılaştırır. Bu, oyun altyapısındaki her düzeltmenin "gerçekten iyileştirme mi"
// olduğunu ölçen CETVEL'dir (G3).
//
// Birincil ölçüt: galibiyet korelasyonu (Pearson + Spearman, pooled + sezon-içi ort).
// İkincil: şampiyon isabeti (gerçek şampiyon rating'e göre kaçıncı sırada).
// Beklenen galibiyet: deterministik (rating→logistic integrali) + Monte-Carlo ort.
//
// Çalıştır:  node --import ./scripts/loader-register.mjs scripts/backtest.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { computeTeamRating, simulateSeason, BASE_MINUTES, OPP_MEAN, OPP_STD, LOGISTIC_K } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BT = join(ROOT, "data", process.env.BT_DIR || "backtest");   // modern için BT_DIR=backtest_modern
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const MC_RUNS = 50;   // her takım için Monte-Carlo sezon sayısı

// ── Deterministik beklenen galibiyet oranı ───────────────────────────────────
// Sim'in playGame'i: P(win|opp,home) = sigmoid(4.5*(rating + jitter - opp + homeAdj)),
// jitter~U(-0.08,0.08), opp karışımı: %22 U(.70,.86) · %56 U(.52,.70) · %22 U(.38,.52),
// 41 ev / 41 deplasman (±0.03). Bu beklentiyi opp + jitter üzerinden sayısal integralle.
const sigmoid = x => 1 / (1 + Math.exp(-x));
// Deterministik beklenen galibiyet oranı — sim'in playGame + sampleOpponent'ını
// (self-consistent Normal rakip + LOGISTIC_K) sayısal integralle birebir yansıtır.
// Sabitler seasonSim'den import edilir → sim değişince harness oto-senkron.
const _GZ = []; for (let z = -4; z <= 4; z += 0.2) _GZ.push(z);
const _gpdf = z => Math.exp(-0.5 * z * z);
const _gsum = _GZ.reduce((a, z) => a + _gpdf(z), 0);
function expWinPct(rating) {
  const nJ = 21; let acc = 0;
  for (const home of [0.03, -0.03]) {
    let s = 0;
    for (const z of _GZ) {
      const opp = OPP_MEAN + OPP_STD * z; let jA = 0;
      for (let j = 0; j < nJ; j++) { const jit = -0.08 + 0.16 * ((j + 0.5) / nJ); jA += sigmoid(LOGISTIC_K * (rating + jit - opp + home)); }
      s += _gpdf(z) * (jA / nJ);
    }
    acc += 0.5 * (s / _gsum);
  }
  return acc;
}

// ── İstatistik yardımcıları ──────────────────────────────────────────────────
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function pearson(x, y) {
  const n = x.length; if (n < 2) return NaN;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy);
}
function ranks(a) {   // ortalama-sıra (ties → ortalama)
  const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const r = new Array(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
const spearman = (x, y) => pearson(ranks(x), ranks(y));
function rmse(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / (a.length || 1)); }
function mae(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / (a.length || 1); }
function linfit(x, y) {   // y ~ a + b·x
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { slope: b, intercept: my - b * mx };
}

// ── Veri yükle ───────────────────────────────────────────────────────────────
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const seasonFiles = readdirSync(BT).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();

// ── Ana döngü ────────────────────────────────────────────────────────────────
const rows = [];   // { season, era, team, realWinPct, detWinPct, mcWinPct, rating, isChamp }
for (const f of seasonFiles) {
  const rec = JSON.parse(readFileSync(join(BT, f), "utf-8"));
  // Opsiyonel: G1 varyant testi. BT_OVERALL_NORM=pctile → overall'ı sezon-içi
  // persantile çevir, sonra global dağılıma (mean 0.42, std 0.14) yeniden ölçekle
  // ki rating formülü ölçeği sabit kalsın, YALNIZCA cross-season hizası değişsin.
  if (process.env.BT_OVERALL_NORM === "pctile") {
    const GMEAN = 0.42, GSTD = 0.14, USTD = 0.2887;
    const valid = rec.players.filter(p => p.overall_score != null && !isNaN(+p.overall_score));
    const srt = [...valid].sort((a, b) => (+a.overall_score) - (+b.overall_score));
    const N = srt.length, pmap = new Map();
    let i = 0;
    while (i < N) { let j = i; while (j + 1 < N && +srt[j + 1].overall_score === +srt[i].overall_score) j++; const pr = N > 1 ? ((i + j) / 2) / (N - 1) : 0.5; for (let k = i; k <= j; k++) pmap.set(srt[k], pr); i = j + 1; }
    for (const p of rec.players) if (pmap.has(p)) p.overall_score = Math.min(1, Math.max(0, GMEAN + (pmap.get(p) - 0.5) * (GSTD / USTD)));
  }
  const simEra = ERAS.find(e => e.id === rec.era) || ERAS[5];
  const games = rec.games || 82;
  const byTeam = {};
  for (const p of rec.players) {
    const t = p.TEAM_ABBREVIATION;
    if (!t || MULTI.has(String(t).toUpperCase())) continue;
    (byTeam[t] ||= []).push(p);
  }
  for (const [team, plist] of Object.entries(byTeam)) {
    if (!(team in rec.realWins)) continue;
    const sorted = [...plist].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0));
    const roster = sorted.slice(0, 9);
    if (roster.length < 5) continue;
    const starters = roster.slice(0, 5);
    const bench = roster.slice(5, 9);
    const fit = computeLineupFit(starters, simEra);
    const aff = computeAffinity(starters, AFF);
    const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, starters.length + bench.length), agePenalty: 0 };
    const { rating } = computeTeamRating(starters, simEra, fit, aff, extras);
    const detWinPct = expWinPct(rating);
    let mcW = 0;
    for (let k = 0; k < MC_RUNS; k++) mcW += simulateSeason(starters, simEra, fit, aff, extras).wins;
    rows.push({
      season: rec.season, era: rec.era, team,
      realWinPct: rec.realWins[team] / games,
      detWinPct, mcWinPct: (mcW / MC_RUNS) / 82, rating,
      isChamp: team === rec.champion,
    });
  }
}

// ── Skorlar ──────────────────────────────────────────────────────────────────
const real = rows.map(r => r.realWinPct), det = rows.map(r => r.detWinPct), mc = rows.map(r => r.mcWinPct);
const real82 = real.map(v => v * 82), det82 = det.map(v => v * 82), mc82 = mc.map(v => v * 82);

// Sezon-içi ortalama korelasyon (G1 kör noktasını izole eder)
const bySeasonCorr = { pearson: [], spearman: [] };
const seasons = [...new Set(rows.map(r => r.season))];
for (const s of seasons) {
  const rs = rows.filter(r => r.season === s);
  if (rs.length < 3) continue;
  bySeasonCorr.pearson.push(pearson(rs.map(r => r.detWinPct), rs.map(r => r.realWinPct)));
  bySeasonCorr.spearman.push(spearman(rs.map(r => r.detWinPct), rs.map(r => r.realWinPct)));
}

// Şampiyon isabeti (rating'e göre sezon-içi sıra)
const champStats = [];
for (const s of seasons) {
  const rs = rows.filter(r => r.season === s).sort((a, b) => b.rating - a.rating);
  const ci = rs.findIndex(r => r.isChamp);
  if (ci >= 0) champStats.push({ season: s, rank: ci + 1, of: rs.length, team: rs[ci].team });
}

// Dönem kırılımı
const eraStats = [];
for (const e of ERAS) {
  const rs = rows.filter(r => r.era === e.id);
  if (!rs.length) continue;
  eraStats.push({
    era: e.id, n: rs.length,
    r: pearson(rs.map(r => r.detWinPct), rs.map(r => r.realWinPct)),
    rho: spearman(rs.map(r => r.detWinPct), rs.map(r => r.realWinPct)),
    rmse82: rmse(rs.map(r => r.detWinPct * 82), rs.map(r => r.realWinPct * 82)),
  });
}

// En kötü ıskalar
const worst = rows.map(r => ({ ...r, miss: (r.detWinPct - r.realWinPct) * 82 }))
  .sort((a, b) => Math.abs(b.miss) - Math.abs(a.miss)).slice(0, 12);

const fit = linfit(det82, real82);
const pool = {
  n: rows.length, seasons: seasons.length,
  pearson_det: pearson(det, real), spearman_det: spearman(det, real),
  pearson_mc: pearson(mc, real),
  withinSeason_pearson: mean(bySeasonCorr.pearson.filter(v => !isNaN(v))),
  withinSeason_spearman: mean(bySeasonCorr.spearman.filter(v => !isNaN(v))),
  rmse82_det: rmse(det82, real82), mae82_det: mae(det82, real82), rmse82_mc: rmse(mc82, real82),
  detVsMc_mae82: mae(det82, mc82),
  slope: fit.slope, intercept: fit.intercept,
  detWins82_range: [Math.min(...det82), Math.max(...det82)],
  realWins82_range: [Math.min(...real82), Math.max(...real82)],
};

// ── Rapor ────────────────────────────────────────────────────────────────────
const f2 = v => (v == null || isNaN(v)) ? " n/a" : (v >= 0 ? " " : "") + v.toFixed(3);
const f1 = v => (v == null || isNaN(v)) ? "n/a" : v.toFixed(1);
console.log("\n══════════════════════ G3 BACKTEST — CETVEL ══════════════════════");
console.log(`Örneklem: ${pool.n} takım-sezon, ${pool.seasons} sezon (6 dönem)\n`);
console.log("── BİRİNCİL: Galibiyet korelasyonu ──────────────────────────────");
console.log(`  Pearson  (det, pooled)     : ${f2(pool.pearson_det)}`);
console.log(`  Spearman (det, pooled)     : ${f2(pool.spearman_det)}`);
console.log(`  Pearson  (det, sezon-içi ⌀): ${f2(pool.withinSeason_pearson)}   ← G1 kör noktasından bağımsız`);
console.log(`  Spearman (det, sezon-içi ⌀): ${f2(pool.withinSeason_spearman)}`);
console.log(`  Pearson  (Monte-Carlo)     : ${f2(pool.pearson_mc)}`);
console.log("\n── Hata (galibiyet / 82 maç) ────────────────────────────────────");
console.log(`  RMSE (det)  : ${f1(pool.rmse82_det)} galibiyet   MAE: ${f1(pool.mae82_det)}`);
console.log(`  RMSE (MC)   : ${f1(pool.rmse82_mc)} galibiyet`);
console.log(`  det↔MC sapma: ${f1(pool.detVsMc_mae82)} galibiyet   ← ~0 olmalı (harness sağlaması)`);
console.log("\n── Yelpaze / sıkışma ────────────────────────────────────────────");
console.log(`  Gerçek galibiyet aralığı : ${f1(pool.realWins82_range[0])}–${f1(pool.realWins82_range[1])}`);
console.log(`  Sim beklenen galibiyet   : ${f1(pool.detWins82_range[0])}–${f1(pool.detWins82_range[1])}`);
console.log(`  Regresyon gerçek~sim: eğim ${f2(pool.slope)} (1.0 ideal; >1 sim SIKIŞTIRIYOR), sabit ${f1(pool.intercept)}`);
console.log("\n── İKİNCİL: Şampiyon isabeti (rating sırası) ────────────────────");
const cr = champStats.map(c => c.rank);
console.log(`  Ortalama sıra: ${f1(mean(cr))} / ~${Math.round(mean(champStats.map(c => c.of)))}   ` +
            `top-1: ${champStats.filter(c => c.rank === 1).length}/${champStats.length}  ` +
            `top-3: ${champStats.filter(c => c.rank <= 3).length}/${champStats.length}  ` +
            `top-5: ${champStats.filter(c => c.rank <= 5).length}/${champStats.length}`);
console.log("  " + champStats.map(c => `${c.season} ${c.team}#${c.rank}`).join("  "));
console.log("\n── Dönem kırılımı ───────────────────────────────────────────────");
for (const e of eraStats) console.log(`  ${e.era.padEnd(11)} n=${String(e.n).padStart(3)}  r=${f2(e.r)}  rho=${f2(e.rho)}  RMSE=${f1(e.rmse82)}`);
console.log("\n── En kötü 12 ıska (sim − gerçek, /82) ──────────────────────────");
for (const w of worst) console.log(`  ${w.season} ${w.team.padEnd(4)} gerçek ${String(Math.round(w.realWinPct * 82)).padStart(2)}  sim ${String(Math.round(w.detWinPct * 82)).padStart(2)}  Δ${w.miss >= 0 ? "+" : ""}${w.miss.toFixed(0)}`);
console.log("\n══════════════════════════════════════════════════════════════════\n");

writeFileSync(join(BT, "report.json"), JSON.stringify({ pool, eraStats, champStats, worst, rows }, null, 2));
console.log(`Rapor → data/backtest/report.json (${rows.length} takım-sezon)\n`);
