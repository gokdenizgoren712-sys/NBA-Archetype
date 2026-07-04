// ── Sezon simülasyonu motoru (v3.5 Faz 1) ────────────────────────────────────
// Draft edilen 5'liyi seçilen simülasyon era'sında 82 maçlık sezona sokar,
// %50+ galibiyetle playoff bracket'ine gider. Takım gücü arketip verisinden:
//   sim kalitesi (overall × era-meta ağırlığı × era-uzaklık cezası)
//   + pillar kapsaması + rol uyumu + arketip affinity.

import { ERA_ARCH_WEIGHTS, getEra, eraIndex } from "./eras";

const clamp01 = v => Math.min(1, Math.max(0, v));

// Era uzaklık cezası — kendi dönemi = tam güç, her adım uzaklıkta artan kayıp
const DIST_PENALTY = [1.00, 0.95, 0.89, 0.82, 0.74, 0.66];

// ── Oyuncunun sim era'daki profili ───────────────────────────────────────────
export function playerSimProfile(player, simEra) {
  const overall = clamp01(parseFloat(player.overall_score || 0));
  const arch    = player.primary_arch || "";
  const archW   = Math.min(1.15, Math.max(0.75, (ERA_ARCH_WEIGHTS[simEra.id] || {})[arch] ?? 1.0));
  const homeEra = getEra(player._season);
  const dist    = Math.abs(eraIndex(homeEra) - eraIndex(simEra));
  const distP   = DIST_PENALTY[Math.min(dist, DIST_PENALTY.length - 1)];
  const simQuality = clamp01(overall * archW * distP);
  return { name: player.PLAYER_NAME, arch, homeEra, dist, archW, distP, overall, simQuality };
}

// ── Takım reytingi ───────────────────────────────────────────────────────────
export function computeTeamRating(players, simEra, fit, affinity01 = null) {
  const profiles  = players.map(p => playerSimProfile(p, simEra));
  const avgQ      = profiles.reduce((a, b) => a + b.simQuality, 0) / profiles.length;
  const starPower = Math.max(...profiles.map(p => p.simQuality));
  let rating = 0.42 * avgQ
             + 0.18 * starPower
             + 0.28 * (fit?.coverage ?? 0.5)
             + 0.12 * (fit?.roleFit  ?? 1.0);
  if (affinity01 != null) rating += (affinity01 - 0.65) * 0.15;
  return { rating: clamp01(rating), profiles, starPower };
}

// ── Tek maç ──────────────────────────────────────────────────────────────────
// Maç günü formu jitter'ı: aynı kadro her koşuda aynı sonucu almaz.
// k=4.5: yumuşak eğim — süper takım bile her maçı almaz (82-0 imkânsız olmalı).
function playGame(rating, opp, home, rand) {
  const jitter = (rand() - 0.5) * 0.16;
  const diff   = (rating + jitter) - opp + (home ? 0.03 : -0.03);
  return rand() < 1 / (1 + Math.exp(-4.5 * diff));
}

// Lig rakip dağılımı: %22 contender, %56 orta, %22 tanker (ortalama ≈ 0.61
// → rating 0.60 civarı bir lineup ~.500 oynar)
function sampleOpponent(rand) {
  const r = rand();
  if (r < 0.22) return 0.70 + rand() * 0.16;
  if (r < 0.78) return 0.52 + rand() * 0.18;
  return 0.38 + rand() * 0.14;
}

const PLAYOFF_ROUNDS = [
  { key: "R1",   label: "First Round",       base: 0.61 },
  { key: "SEMI", label: "Conf. Semifinals",  base: 0.69 },
  { key: "CF",   label: "Conf. Finals",      base: 0.76 },
  { key: "F",    label: "NBA Finals",        base: 0.83 },
];

// Best-of-7, 2-2-1-1-1 formatı
function playSeries(myRating, opp, homeAdv, rand) {
  let w = 0, l = 0;
  const games = [];
  while (w < 4 && l < 4) {
    const gameNo = w + l;
    const home = [0, 1, 4, 6].includes(gameNo) ? homeAdv : !homeAdv;
    const won = playGame(myRating, opp, home, rand);
    games.push(won);
    won ? w++ : l++;
  }
  return { w, l, won: w === 4, games };
}

function winsToSeed(wins) {
  if (wins >= 60) return 1;
  if (wins >= 56) return 2;
  if (wins >= 52) return 3;
  if (wins >= 48) return 4;
  if (wins >= 45) return 5;
  if (wins >= 43) return 6;
  if (wins >= 42) return 7;
  return 8;
}

// ── Tam sezon ────────────────────────────────────────────────────────────────
export function simulateSeason(players, simEra, fit, affinity01 = null) {
  const rand = Math.random;
  const { rating, profiles, starPower } = computeTeamRating(players, simEra, fit, affinity01);

  // Sezon formu: sakatlık/kimya şansı vekili — koşudan koşuya ±3 galibiyet oynatır
  const seasonForm = (rand() - 0.5) * 0.06;
  const effRating  = clamp01(rating + seasonForm);

  // Regular season: 82 maç
  const gameLog = [];
  let wins = 0, streak = 0, bestStreak = 0, worstSkid = 0;
  for (let g = 0; g < 82; g++) {
    const won = playGame(effRating, sampleOpponent(rand), g % 2 === 0, rand);
    gameLog.push(won);
    if (won) {
      wins++;
      streak = streak > 0 ? streak + 1 : 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = streak < 0 ? streak - 1 : -1;
      worstSkid = Math.min(worstSkid, streak);
    }
  }
  const losses = 82 - wins;

  // Playooff kalifikasyonu: %50+ (eraball kuralı)
  const madePlayoffs = wins >= 41;
  const seed = madePlayoffs ? winsToSeed(wins) : null;

  // Playoff koşusu: yıldız gücü playoffta daha çok konuşur
  const playoffRating = clamp01(0.82 * effRating + 0.18 * starPower);
  const playoffRounds = [];
  let champion = false;
  if (madePlayoffs) {
    for (let r = 0; r < PLAYOFF_ROUNDS.length; r++) {
      const round = PLAYOFF_ROUNDS[r];
      const seedEdge = r === 0 ? (8 - seed) * 0.008 : 0;   // yüksek seed R1'de daha zayıf rakip
      const opp = clamp01(round.base + (rand() - 0.5) * 0.05 - seedEdge);
      const homeAdv = r === 3 ? rand() < 0.5 : seed <= 4;
      const series = playSeries(playoffRating, opp, homeAdv, rand);
      playoffRounds.push({ ...round, opp, ...series });
      if (!series.won) break;
      if (r === 3) champion = true;
    }
  }

  const playoffGameWins = playoffRounds.reduce((a, b) => a + b.w, 0);
  const seasonScore = wins + playoffGameWins + (champion ? 15 : 0);

  const resultKey = champion ? "CHAMPION"
    : !madePlayoffs ? "MISSED"
    : playoffRounds.length === 4 ? "FINALS"
    : playoffRounds.length === 3 ? "CF"
    : playoffRounds.length === 2 ? "SEMI"
    : "R1";

  const RESULT_LABEL = {
    CHAMPION: "NBA CHAMPIONS",
    FINALS:   "Lost in the NBA Finals",
    CF:       "Lost in the Conference Finals",
    SEMI:     "Lost in the Conference Semifinals",
    R1:       "Lost in the First Round",
    MISSED:   "Missed the Playoffs",
  };

  return {
    simEra, rating, playoffRating, profiles, starPower,
    gameLog, wins, losses,
    bestStreak, worstSkid: Math.abs(worstSkid),
    madePlayoffs, seed,
    playoffRounds, champion,
    playoffGameWins, seasonScore,
    resultKey, resultLabel: RESULT_LABEL[resultKey],
  };
}
