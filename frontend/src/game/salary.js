// ── Salary Cap % sistemi (v3.6 Faz C) ────────────────────────────────────────
// Tier kotaları yerine bütçe: %100 cap ile başla, 9 sözleşmeyi sığdır.
// Maliyet overall'dan türeyen sürekli eğri — bant/kota yok, sadece para.
//   0.95+ → ~%30   0.85 → ~%22   0.75 → ~%15   0.65 → ~%10   0.55 altı → %4 taban

export const START_BUDGET = 100;
export const MIN_COST     = 4;

// v3.6-C4: eğri GERÇEK overall dağılımına kalibre edildi (2025-26: max 0.877,
// p99 0.773, p50 0.449 — 0.85+ ligde 1 kişi!). Eski pivot süpermax bandını boş
// bırakıyor, oyuncuların %73'ünü %4'e yığıyordu. Yeni bantlar (2025-26):
//   0.80+ → 30 (süpermax, ~4 kişi: Jokić/SGA/Dončić/Wemby)
//   0.75  → ~25 (max kulübü)   0.70 → 21   0.65 → 17
//   0.60  → 13 (starter)       0.55 → 10   0.50 → 7    ≤0.45 → 4-5
export function costOf(player) {
  const o = parseFloat(player?.overall_score || 0) || 0;
  if (o <= 0.28) return MIN_COST;
  const t = Math.min(1, (o - 0.28) / 0.52);      // 0.28..0.80 → 0..1
  return Math.max(MIN_COST, Math.round(30 * Math.pow(t, 1.7)));
}

// Takım içi yıldız primi (v3.6-C3): kontratlar gerçekte takım-göreli —
// kötü takımın en iyi adamı da ucuza oynamaz. Rosterın en iyi 3 oyuncusuna
// taban fiyat: %14 / %10 / %7. Kalite eğrisi zaten üstündeyse etkisiz;
// zayıf rosterda bilinçli "bad contract" tuzağı yaratır.
const TEAM_STAR_FLOORS = [14, 10, 7];

export function applyTeamPricing(players) {
  const ranked = players
    .map((p, i) => ({ i, o: parseFloat(p?.overall_score || 0) || 0 }))
    .sort((a, b) => b.o - a.o);
  const rankOf = new Map(ranked.map((x, r) => [x.i, r]));
  return players.map((p, i) => {
    const r = rankOf.get(i);
    const floor = r < TEAM_STAR_FLOORS.length ? TEAM_STAR_FLOORS[r] : 0;
    return { ...p, _cost: Math.max(costOf(p), floor) };
  });
}

// Fiyat okuyucu: takım-fiyatlaması uygulanmışsa onu, yoksa saf eğriyi kullan
export function priceOf(player) {
  return player?._cost ?? costOf(player);
}

export function costColor(c) {
  if (c >= 25) return "#a78bfa";   // süperstar sözleşmesi
  if (c >= 18) return "#facc15";   // yıldız
  if (c >= 12) return "#34d399";   // starter
  if (c >= 8)  return "#38bdf8";   // rotasyon
  return "#fb923c";                // minimum sözleşme
}

// Dizilimdeki toplam harcama (_cost pick anında oyuncuya işlenir)
export function totalSpent(lineupPlayers) {
  return lineupPlayers.reduce((a, p) => a + (p?._cost ?? (p ? costOf(p) : 0)), 0);
}

// Bu pick'te harcanabilecek maksimum: kalan slotların her birine %4 rezerv bırak
export function maxSpendNow(budgetLeft, slotsLeftIncludingThis) {
  return budgetLeft - Math.max(0, slotsLeftIncludingThis - 1) * MIN_COST;
}
