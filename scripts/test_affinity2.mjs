// ── Affinity DERİN analiz (A1/A2/A3/A4) ──────────────────────────────────────
//   node --import ./scripts/loader-register.mjs scripts/test_affinity2.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeLineupFit, computeAffinity } from "../frontend/src/game/lineupScore.js";
import { computeTeamRating, BASE_MINUTES, topArchWeights, CORE_NOUNS } from "../frontend/src/game/seasonSim.js";
import { ERAS } from "../frontend/src/game/eras.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const AFF = JSON.parse(readFileSync(join(BT, "affinity_matrix.json"), "utf-8")).matrix;
const MULTI = new Set(["2TM", "3TM", "4TM", "TOT"]);
const CREATORS = new Set(["Engine", "Ecosystem", "Hub", "Creator", "Initiator"]);
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) || 1; };
function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxx <= 0 || syy <= 0) ? NaN : sxy / Math.sqrt(sxx * syy); }
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
const spearman = (x, y) => pearson(ranks(x), ranks(y));

// ── Takımları topla ──────────────────────────────────────────────────────────
const T = [];
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
    const extras = { bench, coach: null, minutes: BASE_MINUTES.slice(0, 9), agePenalty: 0 };
    const { rating } = computeTeamRating(starters, simEra, fit, aff, extras);
    const affTerm = aff != null ? (aff - 0.65) * 0.15 : 0;
    // arketip kümesi (primary) + 5'li özellikler
    const archs = starters.map(p => p.primary_arch).filter(Boolean);
    const distinct = new Set(archs).size;
    const nCreators = archs.filter(a => CREATORS.has(a)).length;
    T.push({ season: rec.season, team, rating, base: rating - affTerm, aff: aff ?? 0.65,
      coverage: fit.coverage, spacing: fit.spacing, rim: fit.rim_protection,
      distinct, nCreators, starters, y: rec.realWins[team] / games });
  }
}
const seasons = [...new Set(T.map(t => t.season))];
const within = fn => { const ws = []; for (const s of seasons) { const sub = T.filter(t => t.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(fn), sub.map(t => t.y))); } return mean(ws.filter(v => !isNaN(v))); };

console.log("\n════════════ AFFINITY DERİN ANALİZ ════════════");
console.log(`Örneklem: ${T.length} takım\n`);

// ── A4: dağılım / taban merkezleme ───────────────────────────────────────────
const affs = T.map(t => t.aff);
console.log("── A4: affinity dağılımı (taban 0.65 merkezli mi?) ──");
console.log(`  ort=${mean(affs).toFixed(3)}  std=${std(affs).toFixed(3)}  min=${Math.min(...affs).toFixed(3)}  max=${Math.max(...affs).toFixed(3)}`);
console.log(`  taban 0.65 → çoğu takım ${mean(affs) > 0.65 ? "POZİTİF" : "negatif"} katkı alıyor (ort katkı ${((mean(affs) - 0.65) * 0.15 * 82).toFixed(2)} galibiyet-eşdeğeri)`);

// ── A2: coverage örtüşmesi ───────────────────────────────────────────────────
console.log("\n── A2: affinity ↔ coverage örtüşmesi ──");
console.log(`  Pearson(affinity, coverage) = ${pearson(T.map(t => t.aff), T.map(t => t.coverage)).toFixed(3)}  (yüksek → mükerrer)`);
console.log(`  Pearson(affinity, rating)   = ${pearson(T.map(t => t.aff), T.map(t => t.rating)).toFixed(3)}`);

// ── A1: veri-türevi matris (win-togetherness) vs el-yapımı ───────────────────
// Her arketip çifti için: o çifti (2 farklı starter'da) içeren takımların ort win% → normalize.
const pairWin = {}, pairN = {};
for (const t of T) {
  const set = [...new Set(t.starters.map(p => p.primary_arch).filter(Boolean))];
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
    const k = [set[i], set[j]].sort().join("|");
    pairWin[k] = (pairWin[k] || 0) + t.y; pairN[k] = (pairN[k] || 0) + 1;
  }
}
// normalize: pair ort win% → z → 0.65 + z*0.08 (el-yapımı ölçeğe benzet)
const pairVals = Object.keys(pairWin).filter(k => pairN[k] >= 8).map(k => pairWin[k] / pairN[k]);
const pm = mean(pairVals), ps = std(pairVals);
const derived = {};
for (const k of Object.keys(pairWin)) {
  if (pairN[k] < 8) continue;
  const z = (pairWin[k] / pairN[k] - pm) / ps;
  const [a, b] = k.split("|");
  (derived[a] ||= {})[b] = 0.65 + z * 0.08; (derived[b] ||= {})[a] = 0.65 + z * 0.08;
}
const affDerived = starters => computeAffinity(starters, derived);
const withDerived = t => { const a = affDerived(t.starters); return t.base + (a != null ? (a - 0.65) * 0.15 : 0); };
console.log("\n── A1: el-yapımı matris vs veri-türevi (win-togetherness, IN-SAMPLE üst sınır) ──");
console.log(`  affinitysiz base            within=${within(t => t.base).toFixed(4)}`);
console.log(`  el-yapımı matris (mevcut)   within=${within(t => t.rating).toFixed(4)}`);
console.log(`  veri-türevi matris          within=${within(withDerived).toFixed(4)}   (in-sample iyimser)`);

// ── A3: 5'li sinerji özellikleri (pairwise ötesi) ───────────────────────────
console.log("\n── A3: 5'li kompozisyon özellikleri (marjinal within, base=" + within(t => t.base).toFixed(4) + ") ──");
for (const [name, fn] of [
  ["arketip çeşitliliği (distinct)", t => t.distinct],
  ["tek-playmaker (nCreators==1)", t => (t.nCreators === 1 ? 1 : 0)],
  ["2 playmaker ideal (|nCreators-2| ceza)", t => -Math.abs(t.nCreators - 2)],
  ["spacing×rim etkileşimi", t => t.spacing * t.rim],
]) {
  const vals = T.map(fn), m = mean(vals), s = std(vals);
  T.forEach((t, i) => t._fz = (vals[i] - m) / s);
  let bestW = 0, bestS = within(t => t.base);
  for (const w of [0.01, 0.02, 0.04, 0.06]) { const sp = within(t => t.base + w * t._fz); if (sp > bestS) { bestS = sp; bestW = w; } }
  console.log(`  ${name.padEnd(38)} tek başına=${within(fn).toFixed(3)}  en iyi marjinal within=${bestS.toFixed(4)}${bestW ? ` (w=${bestW})` : " (yardım yok)"}`);
}
console.log("═══════════════════════════════════════════════════\n");
