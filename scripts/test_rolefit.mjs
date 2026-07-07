// ── roleFit yeniden tasarım testi ────────────────────────────────────────────
// Kullanıcı içgörüsü: 2 ball-dominant IDEAL (çoğu iyi takım), 1 yakın, 0/3+ cezalı.
// (1) ballDom sayısına göre gerçek galibiyet — "2 optimal mi?" doğrula.
// (2) within-season Spearman: no-roleFit vs +eski-eğri vs +yeni-eğri.
//   node --import ./scripts/loader-register.mjs scripts/test_rolefit.mjs
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

// eğriler (index = ballDom sayısı 0..5), roleFit = 1 - PEN[n]
const PEN_OLD = [0, 0, 0.05, 0.22, 0.42, 0.58];
const PEN_NEW = [0.06, 0.04, 0.00, 0.00, 0.00, 0.06];   // veri-dürüst final: 1 hafif, 2-4 nötr, 0/5 hafif
const bd = st => st.filter(p => Math.max((parseFloat(p["score_Engine"]) || 0) * 1.05, parseFloat(p["score_Ecosystem"]) || 0) >= 0.80).length;

const rows = { 0: [], 1: [], 2: [] };
const byCount = {};   // ballDom → [realWinPct...]
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
    const { rating } = computeTeamRating(starters, simEra, fit, aff, extras);   // roleFit'siz (mevcut)
    const n = bd(starters);
    const y = rec.realWins[team] / games;
    (byCount[Math.min(n, 4)] ||= []).push(y);
    rows[0].push({ season: rec.season, x: rating, y });
    rows[1].push({ season: rec.season, x: rating + 0.12 * (1 - (PEN_OLD[Math.min(n, 5)] ?? 0.58)), y });
    rows[2].push({ season: rec.season, x: rating + 0.12 * (1 - (PEN_NEW[Math.min(n, 5)] ?? 0.40)), y });
  }
}
console.log("\n════════ roleFit YENİDEN TASARIM ════════");
console.log("── ballDom sayısı → gerçek galibiyet (2 optimal mi?) ──");
for (const c of [0, 1, 2, 3, 4]) { const a = byCount[c] || []; if (!a.length) continue; console.log(`  ${c}${c === 4 ? "+" : " "} ball-dom: n=${String(a.length).padStart(3)}  ort ${(mean(a) * 82).toFixed(1)}W`); }
function within(rs) { const seasons = [...new Set(rs.map(r => r.season))]; const ws = []; for (const s of seasons) { const sub = rs.filter(r => r.season === s); if (sub.length >= 3) ws.push(spearman(sub.map(r => r.x), sub.map(r => r.y))); } return mean(ws.filter(v => !isNaN(v))); }
console.log("\n── within-season Spearman ──");
console.log(`  0) roleFit YOK (mevcut)      ${within(rows[0]).toFixed(4)}`);
console.log(`  1) + ESKİ eğri [0,0,.05,.22] ${within(rows[1]).toFixed(4)}`);
console.log(`  2) + YENİ eğri [.10,.05,0,.12] ${within(rows[2]).toFixed(4)}`);
console.log("═══════════════════════════════════════════\n");
