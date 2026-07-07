// ── S2 varyant testi (yıldız/kadro çift-sayımı) ──────────────────────────────
// computeTeamRating rating + starPower + profiles döndürdüğü için 3 varyantı
// sim'e DOKUNMADAN rekonstrükte edip within-season Spearman'la kıyaslarız.
// Ölçek değişimi Spearman'ı (rank) bozmaz → S4 re-fit gerekmeden ranking sinyali.
//   node --import ./scripts/loader-register.mjs scripts/test_s2.mjs
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

// variant: 0=current, 1=marginal starPower, 2=exclude-top from rosterQ
const rows = { 0: [], 1: [], 2: [] };
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
    const { rating, starPower, profiles, benchProfiles } = computeTeamRating(starters, simEra, fit, aff, extras);
    const all = [...profiles, ...benchProfiles];
    const tot = all.reduce((a, p) => a + p.minutes, 0);
    const rosterQ = all.reduce((a, p) => a + p.effQ * p.minutes, 0) / tot;
    let ti = 0; for (let i = 1; i < all.length; i++) if (all[i].effQ > all[ti].effQ) ti = i;
    const rest = all.filter((_, i) => i !== ti); const rMin = rest.reduce((a, p) => a + p.minutes, 0);
    const rosterQ_ex = rMin > 0 ? rest.reduce((a, p) => a + p.effQ * p.minutes, 0) / rMin : rosterQ;
    const y = rec.realWins[team] / games;
    rows[0].push({ season: rec.season, x: rating, y });
    rows[1].push({ season: rec.season, x: rating - 0.18 * starPower + 0.18 * Math.max(0, starPower - rosterQ), y });
    rows[2].push({ season: rec.season, x: rating - 0.42 * rosterQ + 0.42 * rosterQ_ex, y });
  }
}

function report(name, rs) {
  const pooled = spearman(rs.map(r => r.x), rs.map(r => r.y));
  const seasons = [...new Set(rs.map(r => r.season))];
  const ws = [];
  for (const s of seasons) { const sub = rs.filter(r => r.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(r => r.x), sub.map(r => r.y))); }
  return { pooled, within: mean(ws.filter(v => !isNaN(v))) };
}
const names = ["0) mevcut (star çift-sayım)", "1) marjinal starPower", "2) kadro star-hariç"];
console.log("\n════════ S2 VARYANT TESTİ — within-season Spearman ════════");
let best = -1, bestV = 0;
for (const v of [0, 1, 2]) { const r = report(names[v], rows[v]); const flag = r.within > best ? " ←" : ""; if (r.within > best) { best = r.within; bestV = v; } console.log(`${names[v].padEnd(30)} within=${r.within.toFixed(4)}  pooled=${r.pooled.toFixed(4)}${flag}`); }
console.log(`\nKAZANAN: ${names[bestV]}  (en yüksek within-season Spearman)`);
console.log("═══════════════════════════════════════════════════════════\n");
