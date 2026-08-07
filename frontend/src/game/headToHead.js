// ── Same Screen: iki draft edilmiş roster'ı best-of-7 seride karşılaştırır ────
// Reyting hesabı seasonSim.js'deki AYNI motor (computeTeamRating, playGame,
// PLAYOFF_K) — sadece rakip "lig dağılımından örneklenmiş" bir sayı değil,
// diğer oyuncunun GERÇEK draft edilmiş takımı.

import { POSITIONS, BENCH_SLOTS } from "./positions";
import { computeLineupFit } from "./lineupScore";
import { computeTeamRating, playGame, PLAYOFF_K } from "./seasonSim";

// 2-2-1-1-1 format: seat 1 evinde oynar (0-indexli maç no) — playSeries'teki
// [0,1,4,6] deseniyle aynı.
const HOME_GAMES_FOR_SEAT1 = [0, 1, 4, 6];

function buildSide(lineup, coach, simEra) {
  const players = POSITIONS.map((p) => lineup[p]).filter(Boolean);
  const bench = BENCH_SLOTS.map((p) => lineup[p]).filter(Boolean);
  const fit = computeLineupFit([...players, ...bench], simEra);
  const teamRating = computeTeamRating(players, simEra, fit, null, { bench, coach });
  return { players, bench, fit, ...teamRating };
}

export function buildMatchup(lineups, coaches, simEra) {
  return {
    1: buildSide(lineups[1], coaches[1], simEra),
    2: buildSide(lineups[2], coaches[2], simEra),
  };
}

// Tek MAÇLIK stat satırı (sezon ortalaması değil) — aynı factor/dakika-payı
// mantığı ama ±15% maç-içi jitter, aksi halde her maç birebir aynı sayıları
// üretirdi.
export function gameBoxLine(rawPlayer, prof, rand) {
  const mShare = Math.min(1.15, (prof.minutes ?? (prof.bench ? 13 : 35)) / 35);
  const factor = prof.simQuality / Math.max(0.35, prof.overall);
  const jitter = 0.85 + rand() * 0.30;
  const f = factor * mShare * jitter;
  const st = (k) => Math.max(0, Math.round((parseFloat(rawPlayer[k]) || 0) * f));
  return {
    name: prof.name, bench: prof.bench, min: prof.minutes,
    pts: st("PTS"), reb: st("REB"), ast: st("AST"), stl: st("STL"), blk: st("BLK"),
  };
}

function boxForSide(side, rand) {
  const starters = side.players.map((p, i) => gameBoxLine(p, side.profiles[i], rand));
  const bench = side.bench.map((p, i) => gameBoxLine(p, side.benchProfiles[i], rand));
  return [...starters, ...bench];
}

// gameIndex: 0-6 (bu serideki kaçıncı maç). Dönüş: {gameIndex, home, winner, box:{1,2}, teamPts:{1,2}}
export function simulateOneGame(matchup, gameIndex, rand = Math.random) {
  const home1 = HOME_GAMES_FOR_SEAT1.includes(gameIndex);
  const won1 = playGame(matchup[1].rating, matchup[2].rating, home1, rand, PLAYOFF_K);

  const box1 = boxForSide(matchup[1], rand);
  const box2 = boxForSide(matchup[2], rand);
  const teamPts1 = box1.reduce((a, l) => a + l.pts, 0);
  let teamPts2 = box2.reduce((a, l) => a + l.pts, 0);
  // Kazanan tarafın sayısı berabere/ters düşmesin diye küçük bir düzeltme —
  // playGame'in win/loss kararı asıl gerçek, box score sadece o kararı yansıtsın.
  if (won1 && teamPts2 >= teamPts1) teamPts2 = teamPts1 - 1 - Math.floor(rand() * 4);
  if (!won1 && teamPts1 >= teamPts2) {
    const fixed1 = teamPts2 - 1 - Math.floor(rand() * 4);
    return { gameIndex, home: home1 ? 1 : 2, winner: 2, box: { 1: box1, 2: box2 }, teamPts: { 1: Math.max(0, fixed1), 2: teamPts2 } };
  }
  return { gameIndex, home: home1 ? 1 : 2, winner: won1 ? 1 : 2, box: { 1: box1, 2: box2 }, teamPts: { 1: teamPts1, 2: Math.max(0, teamPts2) } };
}
