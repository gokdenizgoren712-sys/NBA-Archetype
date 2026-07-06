// ── Oyuncu tag sistemi (v3.5 Faz 2.5) ────────────────────────────────────────
// Gerçek ödül geçmişi (1983+, kariyer toplamları) + veri türevli tag'ler.
// İsimler nba_api PLAYER_NAME formatında tutulur.

// MVP sayıları (kariyer)
export const MVP_COUNT = {
  "Kareem Abdul-Jabbar": 6, "Michael Jordan": 5, "LeBron James": 4,
  "Larry Bird": 3, "Magic Johnson": 3, "Moses Malone": 3, "Nikola Jokic": 3,
  "Karl Malone": 2, "Tim Duncan": 2, "Steve Nash": 2, "Stephen Curry": 2,
  "Giannis Antetokounmpo": 2,
  "Charles Barkley": 1, "Hakeem Olajuwon": 1, "David Robinson": 1,
  "Shaquille O'Neal": 1, "Allen Iverson": 1, "Kevin Garnett": 1,
  "Dirk Nowitzki": 1, "Kobe Bryant": 1, "Derrick Rose": 1, "Kevin Durant": 1,
  "Russell Westbrook": 1, "James Harden": 1, "Joel Embiid": 1,
  "Shai Gilgeous-Alexander": 1,
};

// DPOY sayıları
export const DPOY_COUNT = {
  "Dikembe Mutombo": 4, "Ben Wallace": 4, "Rudy Gobert": 4,
  "Dwight Howard": 3,
  "Sidney Moncrief": 2, "Mark Eaton": 2, "Dennis Rodman": 2,
  "Hakeem Olajuwon": 2, "Alonzo Mourning": 2, "Kawhi Leonard": 2,
  "Alvin Robertson": 1, "Michael Cooper": 1, "Michael Jordan": 1,
  "David Robinson": 1, "Gary Payton": 1, "Metta World Peace": 1,
  "Marcus Camby": 1, "Kevin Garnett": 1, "Tyson Chandler": 1,
  "Marc Gasol": 1, "Joakim Noah": 1, "Draymond Green": 1,
  "Giannis Antetokounmpo": 1, "Marcus Smart": 1, "Jaren Jackson Jr.": 1,
  "Victor Wembanyama": 1,
};

// Finals MVP sayıları
export const FMVP_COUNT = {
  "Michael Jordan": 6, "LeBron James": 4,
  "Magic Johnson": 3, "Shaquille O'Neal": 3, "Tim Duncan": 3,
  "Larry Bird": 2, "Kareem Abdul-Jabbar": 2, "Hakeem Olajuwon": 2,
  "Kobe Bryant": 2, "Kawhi Leonard": 2, "Kevin Durant": 2,
  "Moses Malone": 1, "James Worthy": 1, "Joe Dumars": 1, "Isiah Thomas": 1,
  "Chauncey Billups": 1, "Dwyane Wade": 1, "Tony Parker": 1, "Paul Pierce": 1,
  "Dirk Nowitzki": 1, "Andre Iguodala": 1, "Giannis Antetokounmpo": 1,
  "Stephen Curry": 1, "Nikola Jokic": 1, "Jaylen Brown": 1,
  "Shai Gilgeous-Alexander": 1,
};

// Şampiyonluk yüzükleri (önemli katkı verenler)
export const RING_COUNT = {
  "Robert Horry": 7, "Kareem Abdul-Jabbar": 6, "Michael Jordan": 6, "Scottie Pippen": 6,
  "Magic Johnson": 5, "Michael Cooper": 5, "Dennis Rodman": 5, "Steve Kerr": 5,
  "Ron Harper": 5, "Kobe Bryant": 5, "Derek Fisher": 5, "Tim Duncan": 5,
  "LeBron James": 4, "Shaquille O'Neal": 4, "Tony Parker": 4, "Manu Ginobili": 4,
  "Stephen Curry": 4, "Klay Thompson": 4, "Draymond Green": 4, "Andre Iguodala": 4,
  "Larry Bird": 3, "Kevin McHale": 3, "Robert Parish": 3, "Dennis Johnson": 3,
  "James Worthy": 3, "Byron Scott": 3, "A.C. Green": 3, "Horace Grant": 4,
  "John Paxson": 3, "Toni Kukoc": 3, "Luc Longley": 3, "Bruce Bowen": 3,
  "Danny Green": 3, "Shaun Livingston": 3, "Udonis Haslem": 3, "Dwyane Wade": 3,
  "Rick Fox": 3, "Kevon Looney": 3,
  "Isiah Thomas": 2, "Joe Dumars": 2, "Bill Laimbeer": 2, "Vinnie Johnson": 2,
  "Hakeem Olajuwon": 2, "Kenny Smith": 2, "Sam Cassell": 2, "David Robinson": 2,
  "Kawhi Leonard": 2, "Pau Gasol": 2, "Lamar Odom": 2, "Andrew Bynum": 2,
  "Chris Bosh": 2, "Ray Allen": 2, "Mario Chalmers": 2, "Shane Battier": 2,
  "Kevin Durant": 2, "Jrue Holiday": 2, "Kentavious Caldwell-Pope": 2,
  "Rajon Rondo": 2, "Danny Ainge": 2, "Mychal Thompson": 2,
  "Moses Malone": 1, "Julius Erving": 1, "Maurice Cheeks": 1, "Andrew Toney": 1,
  "Clyde Drexler": 1, "Avery Johnson": 1, "Sean Elliott": 1, "Metta World Peace": 1,
  "Trevor Ariza": 1, "Kevin Garnett": 1, "Paul Pierce": 1, "Kendrick Perkins": 1,
  "Dirk Nowitzki": 1, "Jason Kidd": 1, "Jason Terry": 1, "Shawn Marion": 1,
  "Tyson Chandler": 1, "Kyrie Irving": 1, "Kevin Love": 1, "Tristan Thompson": 1,
  "J.R. Smith": 1, "Kyle Lowry": 1, "Pascal Siakam": 1, "Fred VanVleet": 1,
  "Marc Gasol": 1, "Serge Ibaka": 1, "Anthony Davis": 1, "Dwight Howard": 1,
  "Giannis Antetokounmpo": 1, "Khris Middleton": 1, "Brook Lopez": 1, "Bobby Portis": 1,
  "Nikola Jokic": 1, "Jamal Murray": 1, "Michael Porter Jr.": 1, "Aaron Gordon": 1,
  "Jayson Tatum": 1, "Jaylen Brown": 1, "Derrick White": 1, "Al Horford": 1,
  "Kristaps Porzingis": 1, "Shai Gilgeous-Alexander": 1, "Jalen Williams": 1,
  "Chet Holmgren": 1, "Luguentz Dort": 1, "Andrew Wiggins": 1, "Mike Miller": 2,
};

// Sixth Man of the Year kazananları
export const SIXTH_MAN = new Set([
  "Bobby Jones", "Kevin McHale", "Bill Walton", "Ricky Pierce", "Roy Tarpley",
  "Eddie Johnson", "Detlef Schrempf", "Cliff Robinson", "Dell Curry",
  "Anthony Mason", "Toni Kukoc", "John Starks", "Danny Manning",
  "Darrell Armstrong", "Rodney Rogers", "Aaron McKie", "Corliss Williamson",
  "Bobby Jackson", "Antawn Jamison", "Ben Gordon", "Mike Miller",
  "Leandro Barbosa", "Manu Ginobili", "Jason Terry", "Jamal Crawford",
  "Lamar Odom", "James Harden", "J.R. Smith", "Lou Williams", "Eric Gordon",
  "Montrezl Harrell", "Jordan Clarkson", "Tyler Herro", "Malcolm Brogdon",
  "Naz Reid", "Payton Pritchard",
]);

// Dynamic Duo çiftleri — ikisi de kadrodaysa aktifleşir
export const DUOS = [
  ["Michael Jordan", "Scottie Pippen"],
  ["John Stockton", "Karl Malone"],
  ["Shaquille O'Neal", "Kobe Bryant"],
  ["Stephen Curry", "Klay Thompson"],
  ["Stephen Curry", "Draymond Green"],
  ["LeBron James", "Dwyane Wade"],
  ["LeBron James", "Kyrie Irving"],
  ["LeBron James", "Anthony Davis"],
  ["Tim Duncan", "Tony Parker"],
  ["Tim Duncan", "Manu Ginobili"],
  ["Kobe Bryant", "Pau Gasol"],
  ["Magic Johnson", "Kareem Abdul-Jabbar"],
  ["Larry Bird", "Kevin McHale"],
  ["Hakeem Olajuwon", "Clyde Drexler"],
  ["Gary Payton", "Shawn Kemp"],
  ["Kevin Durant", "Russell Westbrook"],
  ["Kevin Durant", "Stephen Curry"],
  ["Nikola Jokic", "Jamal Murray"],
  ["Giannis Antetokounmpo", "Khris Middleton"],
  ["Jayson Tatum", "Jaylen Brown"],
  ["Isiah Thomas", "Joe Dumars"],
  ["Steve Nash", "Amar'e Stoudemire"],
  ["Dirk Nowitzki", "Jason Terry"],
  ["Patrick Ewing", "John Starks"],
  ["Shai Gilgeous-Alexander", "Jalen Williams"],
  ["Chris Paul", "Blake Griffin"],
  ["Damian Lillard", "CJ McCollum"],
  ["Kevin Garnett", "Paul Pierce"],
  ["Penny Hardaway", "Shaquille O'Neal"],
];

// Era-aşırı yıldızlar: mesafe cezası neredeyse sıfır.
// v3.6-C6: 0.75 geri 0.85'e alındı. 0.75 SADECE modern dağılıma (max 0.877)
// kalibre edilmişti; ama oyun çoğunlukla TARİHSEL oyuncu çekiyor ve tarihsel
// overall'lar şişik (max 0.980). 0.75'te her tarihsel sezon ~12-13 oyuncuya
// timeless veriyordu (Gary Payton 0.756 dahil). 0.85'te sezon başına ~2.3
// gerçek efsane (zirve Jordan/Magic/Bird/Isiah) — "her devirde oynar" hissi.
const TIMELESS_MIN_OVERALL = 0.85;

// ── Tag açıklamaları (UI modalı için) ────────────────────────────────────────
export const TAG_INFO = [
  { key: "MVP",       label: "MVP",          color: "#facc15",
    desc: "Regular-season MVP winners. Boosts your team rating all season — the more MVPs on the roster, the bigger the boost (capped)." },
  { key: "DPOY",      label: "DPOY",         color: "#38bdf8",
    desc: "Defensive Player of the Year winners. Defensive impact beyond the stat sheet — season-long rating boost." },
  { key: "CHAMPION",  label: "Champion",     color: "#fbbf24",
    desc: "Championship rings as a key contributor. Elevates their game in the playoffs — every ring adds playoff rating." },
  { key: "FMVP",      label: "Finals MVP",   color: "#fb923c",
    desc: "Proven on the biggest stage. Activates only in the Finals series — the FMVP gene wins Game 7s." },
  { key: "SIXTH",     label: "6th Man",      color: "#f97316",
    desc: "Sixth Man of the Year winners. +10% impact when playing off the bench. No effect when starting." },
  { key: "VERSATILE", label: "Versatile",    color: "#a78bfa",
    desc: "Fits multiple positions without penalty — computed from the Versatile archetype tag, not hand-picked." },
  { key: "TIMELESS",  label: "Timeless",     color: "#c084fc",
    desc: "All-time-great peak seasons (overall ≥ 85) shrug off era distance. Minimal penalty no matter how far from home they play — think peak Jordan, Magic, Bird." },
  { key: "DUO",       label: "Dynamic Duo",  color: "#34d399",
    desc: "Draft both partners to activate a rating boost for the pair. Check a player's tag to see who the partner is." },
];

// ── Tag çıkarımı ─────────────────────────────────────────────────────────────
// Dönen: [{key, label, color, detail}] — UI chip'leri için
export function getPlayerTags(player, { onBench = false } = {}) {
  if (!player) return [];
  const name = player.PLAYER_NAME || "";
  const tags = [];
  const overall = parseFloat(player.overall_score || 0) || 0;
  const versatile = (parseFloat(player["score_Versatile"] ?? 0) || 0) >= 0.75;

  if (MVP_COUNT[name])  tags.push({ key: "MVP",      label: `MVP×${MVP_COUNT[name]}`,       color: "#facc15", detail: "Regular season rating boost" });
  if (DPOY_COUNT[name]) tags.push({ key: "DPOY",     label: `DPOY×${DPOY_COUNT[name]}`,     color: "#38bdf8", detail: "Defensive rating boost" });
  if (RING_COUNT[name]) tags.push({ key: "CHAMPION", label: `🏆×${RING_COUNT[name]}`,       color: "#fbbf24", detail: "Playoff rating boost per ring" });
  if (FMVP_COUNT[name]) tags.push({ key: "FMVP",     label: `FMVP×${FMVP_COUNT[name]}`,     color: "#fb923c", detail: "Boost in Finals games" });
  if (SIXTH_MAN.has(name)) tags.push({ key: "SIXTH", label: "6TH MAN",                       color: "#f97316", detail: onBench ? "Active: +10% off the bench" : "Boost only when on the bench" });
  if (versatile) tags.push({ key: "VERSATILE", label: "VERSATILE", color: "#a78bfa", detail: "Plays any position with no penalty" });
  if (overall >= TIMELESS_MIN_OVERALL) tags.push({ key: "TIMELESS", label: "TIMELESS", color: "#c084fc", detail: "Minimal era distance penalty" });

  const partners = DUOS.filter(d => d.includes(name)).map(d => d.find(n => n !== name));
  if (partners.length) tags.push({ key: "DUO", label: "DYNAMIC DUO", color: "#34d399", detail: `Partner: ${partners.join(" / ")}` });

  return tags;
}

export function isTimeless(player) {
  return (parseFloat(player?.overall_score || 0) || 0) >= TIMELESS_MIN_OVERALL;
}

export function isSixthMan(name) { return SIXTH_MAN.has(name); }

// ── Sim etkileri ─────────────────────────────────────────────────────────────
// Tüm kadro (starters + bench) üzerinden ödül bonusları.
// Dönen değerler rating ölçeğinde (0.01 ≈ ~1 galibiyet).
export function awardEffects(starters, bench = []) {
  const roster = [...starters, ...bench];
  const names = new Set(roster.map(p => p.PLAYER_NAME));
  const notes = [];

  let regular = 0, playoff = 0, finals = 0;

  let mvpSum = 0, dpoySum = 0, ringSum = 0, fmvpSum = 0;
  for (const p of roster) {
    const n = p.PLAYER_NAME || "";
    if (MVP_COUNT[n])  mvpSum  += MVP_COUNT[n];
    if (DPOY_COUNT[n]) dpoySum += DPOY_COUNT[n];
    if (RING_COUNT[n]) ringSum += RING_COUNT[n];
    if (FMVP_COUNT[n]) fmvpSum += FMVP_COUNT[n];
  }
  if (mvpSum)  { const v = Math.min(0.012, mvpSum  * 0.003); regular += v; notes.push(`MVP pedigree +${(v*100).toFixed(1)}`); }
  if (dpoySum) { const v = Math.min(0.010, dpoySum * 0.003); regular += v; notes.push(`DPOY defense +${(v*100).toFixed(1)}`); }
  if (ringSum) { const v = Math.min(0.024, ringSum * 0.003); playoff += v; notes.push(`Championship DNA +${(v*100).toFixed(1)} (playoffs)`); }
  if (fmvpSum) { const v = Math.min(0.030, fmvpSum * 0.008); finals  += v; notes.push(`Finals MVP gene +${(v*100).toFixed(1)} (Finals only)`); }

  // Dynamic Duo: her aktif çift +0.012, en fazla 2 çift
  const activeDuos = DUOS.filter(([a, b]) => names.has(a) && names.has(b));
  if (activeDuos.length) {
    const v = Math.min(0.024, activeDuos.length * 0.012);
    regular += v;
    for (const [a, b] of activeDuos.slice(0, 2))
      notes.push(`Dynamic Duo: ${a.split(" ").slice(-1)[0]} + ${b.split(" ").slice(-1)[0]} +1.2`);
  }

  return { regular, playoff, finals, notes, activeDuos };
}
