/* Kaydin etiketleri (§9.4 "TAGS & PLAYERS": en fazla 3). Telefonun maç
   sayfasi ve web Inspector'i AYNI listeyi kullaniyor — iki yuzeyde farkli
   etiket sozlugu olsaydi toplulugun "en cok soylenen" sayilari bolunurdu.
   Asama 16'ya kadar RankItPrototype.jsx'in icindeydi. */
const FOOTBALL = ["Nail-biter", "Great Atmosphere", "Comeback", "Penalty Drama", "Goal Fest", "Tactical Battle", "Upset", "Late Winner", "Derby Energy"];
const BASKETBALL = ["Nail-biter", "Great Atmosphere", "Comeback", "Overtime", "Clutch Performance", "Shootout", "Defensive Masterclass", "Upset", "Buzzer Beater"];

export const MAX_ENTRY_TAGS = 3;

export function entryTagOptions(sport) {
  return sport === "Football" ? FOOTBALL : BASKETBALL;
}
