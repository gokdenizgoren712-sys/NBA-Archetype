// ── Salary Cap % sistemi (v3.6 Faz C) ────────────────────────────────────────
// Tier kotaları yerine bütçe: %100 cap ile başla, 9 sözleşmeyi sığdır.
// Maliyet overall'dan türeyen sürekli eğri — bant/kota yok, sadece para.
//   0.95+ → ~%30   0.85 → ~%22   0.75 → ~%15   0.65 → ~%10   0.55 altı → %4 taban

export const START_BUDGET = 100;
export const MIN_COST     = 4;

// v3.6-C3: alt uç kademelendirildi — eski eğri 0.55 altında herkesi %4'e
// düzlüyordu ("bütün roster aynı fiyat" tekdüzeliği). Yeni eğri:
//   0.95→30  0.85→22  0.80→19  0.75→16  0.70→13  0.65→10  0.60→7  0.55→5  ≤0.45→4
// Mükemmel dengeli 9'lu (0.85..0.45) tam %100 eder.
export function costOf(player) {
  const o = parseFloat(player?.overall_score || 0) || 0;
  if (o <= 0.35) return MIN_COST;
  const t = Math.min(1, (o - 0.35) / 0.60);      // 0.35..0.95 → 0..1
  return Math.max(MIN_COST, Math.round(30 * Math.pow(t, 1.6)));
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
