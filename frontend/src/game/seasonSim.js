// ── Sezon simülasyonu motoru (v3.5 Faz 1) ────────────────────────────────────
// Draft edilen 5'liyi seçilen simülasyon era'sında 82 maçlık sezona sokar,
// %50+ galibiyetle playoff bracket'ine gider. Takım gücü arketip verisinden:
//   sim kalitesi (overall × era-meta ağırlığı × era-uzaklık cezası)
//   + pillar kapsaması + rol uyumu + arketip affinity.

import { ERA_ARCH_WEIGHTS, getEra, eraIndex } from "./eras";
import { coachRatingBonus, coachPlayoffBonus } from "./coaches";
import { awardEffects, isTimeless, isSixthMan } from "./awards";

const clamp01 = v => Math.min(1, Math.max(0, v));

// Era uzaklık cezası — kendi dönemi = tam güç, her adım uzaklıkta artan kayıp
const DIST_PENALTY = [1.00, 0.95, 0.89, 0.82, 0.74, 0.66];

// ── Oyuncunun sim era'daki profili ───────────────────────────────────────────
// _posPenalty: draft sırasında atanır (doğal=1.0, komşu mevki=0.90, uzak=0.75, FLEX=1.0)
// TIMELESS (overall ≥ 0.90): era mesafe cezası neredeyse sıfırlanır
export function playerSimProfile(player, simEra) {
  const overall = clamp01(parseFloat(player.overall_score || 0));
  const arch    = player.primary_arch || "";
  const archW   = Math.min(1.15, Math.max(0.75, (ERA_ARCH_WEIGHTS[simEra.id] || {})[arch] ?? 1.0));
  const homeEra = getEra(player._season);
  const dist    = Math.abs(eraIndex(homeEra) - eraIndex(simEra));
  const timeless = isTimeless(player);
  let distP = DIST_PENALTY[Math.min(dist, DIST_PENALTY.length - 1)];
  if (timeless) distP = Math.max(distP, 0.95);
  const posP    = player._posPenalty ?? 1.0;
  const simQuality = clamp01(overall * archW * distP * posP);
  return { name: player.PLAYER_NAME, arch, homeEra, dist, archW, distP, posP, overall, simQuality, timeless };
}

// ── Bench pozisyon dengesi ───────────────────────────────────────────────────
// Bench'te G + F + C gruplarının hepsi varsa küçük buff (+0.008)
function posGroup(player) {
  const raw = String(player?.POS5 || player?.POSITION || "").toUpperCase().trim();
  if (raw === "C" || raw.startsWith("CENTER")) return "C";
  if (raw === "PG" || raw === "SG" || raw.startsWith("G") || raw.includes("GUARD")) return "G";
  return "F";
}

export function benchCoverage(bench = []) {
  const groups = new Set(bench.map(posGroup));
  return { G: groups.has("G"), F: groups.has("F"), C: groups.has("C"),
           balanced: groups.has("G") && groups.has("F") && groups.has("C") };
}

// ── Takım reytingi ───────────────────────────────────────────────────────────
// extras: { bench: [], coach: null } — Faz 2. Starter'lar dakikanın ~%78'ini taşır.
export function computeTeamRating(players, simEra, fit, affinity01 = null, extras = {}) {
  const { bench = [], coach = null } = extras;
  const profiles      = players.map(p => playerSimProfile(p, simEra));
  const benchProfiles = bench.map(p => {
    const prof = { ...playerSimProfile(p, simEra), bench: true };
    // SIXTH MAN: bench'ten gelince +10% (starter'ken etkisiz)
    if (isSixthMan(p.PLAYER_NAME)) {
      prof.simQuality = clamp01(prof.simQuality * 1.10);
      prof.sixth = true;
    }
    return prof;
  });

  const startersQ = profiles.reduce((a, b) => a + b.simQuality, 0) / profiles.length;
  const benchQ    = benchProfiles.length
    ? benchProfiles.reduce((a, b) => a + b.simQuality, 0) / benchProfiles.length
    : startersQ * 0.70;   // bench draft edilmediyse ligin zayıf bench varsayımı
  const rosterQ   = 0.78 * startersQ + 0.22 * benchQ;

  // Yıldız gücü: bench yıldızı kısıtlı dakikada oynar (×0.85)
  const starPower = Math.max(
    ...profiles.map(p => p.simQuality),
    ...benchProfiles.map(p => p.simQuality * 0.85),
  );

  // Ödül tag'leri: MVP/DPOY/Duo → regular, yüzükler → playoff, FMVP → Finals
  const fx = awardEffects(players, bench);
  const cover = benchCoverage(bench);
  if (cover.balanced) { fx.regular += 0.008; fx.notes.push("Balanced bench (G+F+C) +0.8"); }

  // NOT: rating bilerek clamp'lenmez — süper takımlar 1.0 tavanına yapışırsa
  // pozisyon/koç farkları tavanda kaybolur; logistic her aralıkla çalışır.
  let rating = 0.42 * rosterQ
             + 0.18 * starPower
             + 0.28 * (fit?.coverage ?? 0.5)
             + 0.12 * (fit?.roleFit  ?? 1.0);
  if (affinity01 != null) rating += (affinity01 - 0.65) * 0.15;
  rating += coachRatingBonus(coach);
  rating += fx.regular;
  return { rating, profiles, benchProfiles, starPower, fx, benchBalanced: cover.balanced };
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

// Best-of-7, 2-2-1-1-1 formatı. boost: seri bazlı ek reyting (ör. FMVP geni Finals'te)
function playSeries(myRating, opp, homeAdv, rand, boost = 0) {
  let w = 0, l = 0;
  const games = [];
  while (w < 4 && l < 4) {
    const gameNo = w + l;
    const home = [0, 1, 4, 6].includes(gameNo) ? homeAdv : !homeAdv;
    const won = playGame(myRating + boost, opp, home, rand);
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
export function simulateSeason(players, simEra, fit, affinity01 = null, extras = {}) {
  const rand = Math.random;
  const { rating, profiles, benchProfiles, starPower, fx, benchBalanced } =
    computeTeamRating(players, simEra, fit, affinity01, extras);
  const coach = extras.coach || null;

  // Sezon formu: sakatlık/kimya şansı vekili — koşudan koşuya ±3 galibiyet oynatır
  const seasonForm = (rand() - 0.5) * 0.06;
  const effRating  = rating + seasonForm;

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

  // Playoff koşusu: yıldız gücü + koç DNA'sı + Championship yüzük bonusu
  const playoffRating = 0.82 * effRating + 0.18 * starPower
                      + coachPlayoffBonus(coach) + (fx?.playoff ?? 0);
  const playoffRounds = [];
  let champion = false;
  if (madePlayoffs) {
    for (let r = 0; r < PLAYOFF_ROUNDS.length; r++) {
      const round = PLAYOFF_ROUNDS[r];
      const seedEdge = r === 0 ? (8 - seed) * 0.008 : 0;   // yüksek seed R1'de daha zayıf rakip
      const opp = clamp01(round.base + (rand() - 0.5) * 0.05 - seedEdge);
      const homeAdv = r === 3 ? rand() < 0.5 : seed <= 4;
      // FMVP geni yalnızca Finals serisinde devreye girer
      const seriesBoost = r === 3 ? (fx?.finals ?? 0) : 0;
      const series = playSeries(playoffRating, opp, homeAdv, rand, seriesBoost);
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
    simEra, rating, playoffRating, profiles, benchProfiles, coach, starPower,
    tagNotes: fx?.notes ?? [], benchBalanced,
    gameLog, wins, losses,
    bestStreak, worstSkid: Math.abs(worstSkid),
    madePlayoffs, seed,
    playoffRounds, champion,
    playoffGameWins, seasonScore,
    resultKey, resultLabel: RESULT_LABEL[resultKey],
  };
}
