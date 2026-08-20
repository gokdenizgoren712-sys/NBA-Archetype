// ── Kafa kafaya: iki XI, çift maçlı eleme ────────────────────────────────────
//
// Basketbol tarafındaki headToHead.js yedi maçlık seri oynatıyor. Futbolda
// öyle bir format yok; gerçek karşılığı ÇİFT MAÇLI ELEME: iki maç, her takım
// birer kez ev sahibi, toplam skor. Eşitlik bozulmazsa uzatma, o da yetmezse
// penaltılar.
//
// Deplasman golü kuralı YOK — UEFA 2021'de kaldırdı, 2026'da oynanan bir
// oyunda uygulamak yanlış olurdu.
//
// Maç motoru sezon simülasyonuyla AYNI: playMatch, aynı kalibre katsayılar.
// Ayrı bir "eleme modeli" uydurmuyoruz — tek fark rakibin lig dağılımından
// gelen bir sayı değil, öbür oyuncunun gerçekten kurduğu XI olması.

import { makeRng, playMatch } from "./seasonSim.js";

// Uzatma 30 dakika = normal sürenin üçte biri. Gol beklentisi de o oranda,
// ama birebir değil: uzatmada takımlar daha ihtiyatlı oynuyor ve tarihsel
// olarak dakika başına gol normal sürenin altında kalıyor. 0.28 bunu
// yansıtan makul bir kesir (30/90 = 0.33'ün biraz altı).
const ET_SHARE = 0.28;
// Penaltı dönüştürme oranı — büyük turnuvalarda uzun dönem ortalaması ~%75.
const PEN_RATE = 0.75;

function poissonFrom(lambda, rand) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

/** Tek ayak. side objeleri {name, quality, chemistry}. */
function playLeg(coeffs, home, away, rand) {
  const { hg, ag } = playMatch(coeffs, home, away, rand);
  return { hg, ag };
}

/** Uzatma: aynı lambda'ların ET_SHARE'i kadar. */
function playExtraTime(coeffs, home, away, rand) {
  const r = playMatch(coeffs, home, away, rand);
  return {
    hg: poissonFrom(r.lh * ET_SHARE, rand),
    ag: poissonFrom(r.la * ET_SHARE, rand),
  };
}

/**
 * Penaltılar. Beşer atış, eşitse ani ölüm.
 * Kalite farkı küçük bir etki yapıyor — penaltı büyük ölçüde kura ama
 * tamamen değil; daha iyi kadronun daha iyi nişancıları var.
 */
function playShootout(a, b, rand) {
  const rate = (side, other) =>
    Math.max(0.55, Math.min(0.88,
      PEN_RATE + (side.quality - other.quality) * 0.25));
  const ra = rate(a, b), rb = rate(b, a);
  let sa = 0, sb = 0;
  const kicks = [];
  for (let i = 0; i < 5; i++) {
    const ka = rand() < ra, kb = rand() < rb;
    if (ka) sa++; if (kb) sb++;
    kicks.push({ round: i + 1, a: ka, b: kb });
    // Erken bitiş: kalan atışlar sonucu değiştiremiyorsa dur
    const left = 5 - i - 1;
    if (sa > sb + left || sb > sa + left) break;
  }
  while (sa === sb) {                       // ani ölüm
    const ka = rand() < ra, kb = rand() < rb;
    if (ka) sa++; if (kb) sb++;
    kicks.push({ round: kicks.length + 1, a: ka, b: kb, sudden: true });
    if (kicks.length > 30) break;           // teorik sonsuz döngüye karşı
  }
  return { a: sa, b: sb, kicks, winner: sa > sb ? "a" : "b" };
}

/**
 * ÇİFT MAÇLI ELEME.
 * @param a,b   {name, quality, chemistry}
 * @returns     iki ayak, toplam skor, gerekiyorsa uzatma ve penaltı
 */
export function playTie(coeffs, a, b, opts = {}) {
  const rand = makeRng(opts.seed ?? ((Math.random() * 1e9) | 0));

  // 1. ayak: a evinde. 2. ayak: b evinde.
  const leg1 = playLeg(coeffs, a, b, rand);
  const leg2 = playLeg(coeffs, b, a, rand);

  let aggA = leg1.hg + leg2.ag;
  let aggB = leg1.ag + leg2.hg;

  const out = {
    legs: [
      { home: a.name, away: b.name, hg: leg1.hg, ag: leg1.ag },
      { home: b.name, away: a.name, hg: leg2.hg, ag: leg2.ag },
    ],
    aggA, aggB, extraTime: null, shootout: null,
  };

  if (aggA !== aggB) {
    out.winner = aggA > aggB ? "a" : "b";
    out.decidedBy = "aggregate";
    return out;
  }

  // Uzatma, ikinci ayağın sahasında (b evinde)
  const et = playExtraTime(coeffs, b, a, rand);
  out.extraTime = { hg: et.hg, ag: et.ag, host: b.name };
  aggA += et.ag; aggB += et.hg;
  out.aggA = aggA; out.aggB = aggB;

  if (aggA !== aggB) {
    out.winner = aggA > aggB ? "a" : "b";
    out.decidedBy = "extra time";
    return out;
  }

  const so = playShootout(a, b, rand);
  out.shootout = so;
  out.winner = so.winner;
  out.decidedBy = "penalties";
  return out;
}

/**
 * Tek eleme çok gürültülü — futbolda iki maç bir kadronun daha iyi olduğunu
 * kanıtlamaz. N kez oynatıp kazanma oranını veriyoruz; gösterilecek sayı bu,
 * tek elemenin sonucu değil.
 */
export function tieOdds(coeffs, a, b, runs = 400, opts = {}) {
  let wa = 0, pens = 0, et = 0;
  let gfA = 0, gfB = 0;
  for (let i = 0; i < runs; i++) {
    const t = playTie(coeffs, a, b, { seed: (opts.seed ?? 1) + i * 7919 });
    if (t.winner === "a") wa++;
    if (t.decidedBy === "penalties") pens++;
    if (t.decidedBy === "extra time") et++;
    gfA += t.aggA; gfB += t.aggB;
  }
  return {
    runs,
    aWinPct: wa / runs,
    bWinPct: 1 - wa / runs,
    penaltiesPct: pens / runs,
    extraTimePct: et / runs,
    avgAggA: gfA / runs,
    avgAggB: gfB / runs,
  };
}

/**
 * Bir XI'i kafa kafaya girecek hâle getirir: sezon panelindeki kalite tanımıyla
 * BİREBİR aynı olmalı, yoksa iki mod farklı sayılar üretir.
 */
export function buildSide(name, starters, chemistry, positionPenalty = 0, managerBonus = 0) {
  const mean = starters?.length
    ? starters.reduce((a, p) => a + (p.overall_score || 0), 0) / starters.length
    : 0.5;
  return {
    name: name || "XI",
    quality: Math.max(0.25, Math.min(0.95, mean - positionPenalty + managerBonus)),
    chemistry: chemistry ?? 0.65,
    players: starters || [],
  };
}
