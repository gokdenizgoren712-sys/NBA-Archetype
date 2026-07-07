// ── S4 kalibrasyon fit'i ─────────────────────────────────────────────────────
// report.json'daki 514 (rating, gerçek galibiyet%) çiftine iki rating→galibiyet
// modelini fit eder, cetvel (RMSE) hangisini seçtiğini söyler. rating S4'ten
// bağımsız olduğundan mevcut report yeterli — sim'i değiştirmeden fit ederiz.
//
//   A) fit-in-place: mevcut sampleOpponent karması, merkez kaydırma c + eğim k
//   B) self-consistent: rakip ~ Normal(μ_rating, σ_rating), eğim k (oto .500 merkez)
//
// Çalıştır:  node scripts/fit_s4.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BT = join(__dirname, "..", "data", "backtest");
const rows = JSON.parse(readFileSync(join(BT, "report.json"), "utf-8")).rows;
const R = rows.map(r => r.rating);
const Y = rows.map(r => r.realWinPct);   // gerçek galibiyet oranı [0,1]

const sigmoid = x => 1 / (1 + Math.exp(-x));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}
const rmse82 = pred => Math.sqrt(mean(pred.map((p, i) => ((p - Y[i]) * 82) ** 2)));

// ── Model A: mevcut karma + merkez kaydırma c ────────────────────────────────
const OPP = [{ w: 0.22, lo: 0.70, hi: 0.86 }, { w: 0.56, lo: 0.52, hi: 0.70 }, { w: 0.22, lo: 0.38, hi: 0.52 }];
function winA(rating, k, c) {
  const nJ = 11, nO = 24; let acc = 0;
  for (const home of [0.03, -0.03]) {
    let ca = 0;
    for (const cm of OPP) {
      let oa = 0;
      for (let i = 0; i < nO; i++) {
        const opp = cm.lo + (cm.hi - cm.lo) * ((i + 0.5) / nO) + c;
        let ja = 0;
        for (let j = 0; j < nJ; j++) { const jit = -0.08 + 0.16 * ((j + 0.5) / nJ); ja += sigmoid(k * (rating + jit - opp + home)); }
        oa += ja / nJ;
      }
      ca += cm.w * (oa / nO);
    }
    acc += 0.5 * ca;
  }
  return acc;
}

// ── Model B: self-consistent Normal(μ_R, σ_R) ────────────────────────────────
const muR = mean(R), sigR = std(R);
const GRID = []; for (let z = -4; z <= 4; z += 0.2) GRID.push(z);
const pdf = z => Math.exp(-0.5 * z * z);
const pdfSum = GRID.reduce((a, z) => a + pdf(z), 0);
function winB(rating, k) {
  const nJ = 11; let acc = 0;
  for (const home of [0.03, -0.03]) {
    let s = 0;
    for (const z of GRID) {
      const opp = muR + sigR * z; let ja = 0;
      for (let j = 0; j < nJ; j++) { const jit = -0.08 + 0.16 * ((j + 0.5) / nJ); ja += sigmoid(k * (rating + jit - opp + home)); }
      s += pdf(z) * (ja / nJ);
    }
    acc += 0.5 * (s / pdfSum);
  }
  return acc;
}

function evalModel(fn) { const pred = R.map(fn); return { rmse: rmse82(pred), r: pearson(pred, Y), lo: Math.min(...pred) * 82, hi: Math.max(...pred) * 82 }; }

// ── Baseline (mevcut k=4.5, c=0) ─────────────────────────────────────────────
const base = evalModel(r => winA(r, 4.5, 0));

// ── A fit: grid (k, c) ───────────────────────────────────────────────────────
let bestA = { rmse: 1e9 };
for (let k = 3; k <= 22; k += 0.25) for (let c = -0.02; c <= 0.16; c += 0.005) {
  const m = evalModel(r => winA(r, k, c)); if (m.rmse < bestA.rmse) bestA = { ...m, k, c };
}
// ── B fit: grid k ────────────────────────────────────────────────────────────
let bestB = { rmse: 1e9 };
for (let k = 3; k <= 22; k += 0.25) { const m = evalModel(r => winB(r, k)); if (m.rmse < bestB.rmse) bestB = { ...m, k }; }

const f2 = v => v.toFixed(3), f1 = v => v.toFixed(1);
console.log("\n══════════════ S4 FIT — cetvel karşılaştırması ══════════════");
console.log(`Örneklem: ${R.length} takım | gerçek galibiyet aralığı ${f1(Math.min(...Y) * 82)}–${f1(Math.max(...Y) * 82)}`);
console.log(`Rating havuzu: μ=${f2(muR)} σ=${f2(sigR)}\n`);
console.log(`BASELINE (k=4.5, c=0)      RMSE=${f1(base.rmse)}  r=${f2(base.r)}  sim-aralık ${f1(base.lo)}–${f1(base.hi)}`);
console.log(`A) fit-in-place            RMSE=${f1(bestA.rmse)}  r=${f2(bestA.r)}  sim-aralık ${f1(bestA.lo)}–${f1(bestA.hi)}   → k=${bestA.k.toFixed(2)}, c=${bestA.c.toFixed(3)}`);
console.log(`B) self-consistent Normal  RMSE=${f1(bestB.rmse)}  r=${f2(bestB.r)}  sim-aralık ${f1(bestB.lo)}–${f1(bestB.hi)}   → k=${bestB.k.toFixed(2)} (μ=${f2(muR)}, σ=${f2(sigR)})`);
console.log(`\nKAZANAN: ${bestA.rmse <= bestB.rmse ? "A (fit-in-place)" : "B (self-consistent)"}  (en düşük RMSE)`);
console.log("═══════════════════════════════════════════════════════════════\n");
