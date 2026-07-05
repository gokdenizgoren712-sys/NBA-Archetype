// ── Salary Cap % sistemi (v3.6 Faz C) ────────────────────────────────────────
// Tier kotaları yerine bütçe: %100 cap ile başla, 9 sözleşmeyi sığdır.
// Maliyet overall'dan türeyen sürekli eğri — bant/kota yok, sadece para.
//   0.95+ → ~%30   0.85 → ~%22   0.75 → ~%15   0.65 → ~%10   0.55 altı → %4 taban

export const START_BUDGET = 100;
export const MIN_COST     = 4;

export function costOf(player) {
  const o = parseFloat(player?.overall_score || 0) || 0;
  if (o <= 0.40) return MIN_COST;
  const t = Math.min(1, (o - 0.40) / 0.55);      // 0.40..0.95 → 0..1
  return Math.max(MIN_COST, Math.round(30 * Math.pow(t, 1.6)));
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
