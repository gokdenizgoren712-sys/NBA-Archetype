// ── Sezon simülasyonu motoru (v3.5 Faz 1) ────────────────────────────────────
// Draft edilen 5'liyi seçilen simülasyon era'sında 82 maçlık sezona sokar,
// %50+ galibiyetle playoff bracket'ine gider. Takım gücü arketip verisinden:
//   sim kalitesi (overall × era-meta ağırlığı × era-uzaklık cezası)
//   + pillar kapsaması + rol uyumu + arketip affinity.

import { getEra, eraIndex, ERA_PILLAR_WEIGHTS, ARCH_PILLAR } from "./eras";
import { coachRatingBonus, coachPlayoffBonus } from "./coaches";
import { awardEffects, isTimeless, isSixthMan } from "./awards";

const clamp01 = v => Math.min(1, Math.max(0, v));

// Era uzaklık cezası (v3.6-C5) — YUMUŞATILDI. Eski eğri [1,.94,.86,.77,.67,.56]
// 5 era uzakta −%44 yiyordu; 48 overall'lık bir rol oyuncusu 0.32'ye düşüp takım
// ortalamasını eziyordu. Yeni eğri max −%22.
export const DIST_PENALTY = [1.00, 0.97, 0.93, 0.88, 0.83, 0.78];

// 12 core arketip — top-N hesapları bunun üzerinden.
export const CORE_NOUNS = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor",
                           "Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

// Oyuncunun en yüksek skorlu ilk N arketibi, skorla normalize AĞIRLIKLAR olarak.
// [[arch, weight], ...]. Böylece "sadece birincil arketip" saçmalığından çıkıp
// oyuncunun gerçek profilini (ör. 0.85 Spacer + 0.82 Stopper + 0.6 Connector)
// tüm arketip-tabanlı hesaplarda kullanabiliyoruz.
export function topArchWeights(player, n = 3) {
  const scored = CORE_NOUNS
    .map(a => [a, parseFloat(player?.[`score_${a}`] ?? 0) || 0])
    .filter(([, s]) => s > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n);
  const sum = scored.reduce((acc, [, s]) => acc + s, 0);
  if (sum <= 0) return player?.primary_arch ? [[player.primary_arch, 1]] : [];
  return scored.map(([a, s]) => [a, s / sum]);
}

// Arketip-era uyumu, uzaklığı MODÜLE eder (arketip-kör değil artık).
// v3.8: primary yerine TOP-3 arketibin ağırlıklı pillar-era uyumu. Oyuncunun
// sütunlarını sim era ortalamada ÇOK seviyorsa (≥1.15) bir era daha yakınmış gibi
// (−1); hiç değer vermiyorsa (≤0.80) bir era daha uzakmış gibi (+1). Yalnızca
// seyahat edenlere (ev era'sında etki yok → Phase B ilkesi korunur).
export function eraFitShift(player, simEra) {
  const weights = topArchWeights(player, 3);
  if (!weights.length) return 0;
  let wAvg = 0, wsum = 0;
  for (const [arch, w] of weights) {
    const pillar = ARCH_PILLAR[arch];
    const eraW = pillar ? ((ERA_PILLAR_WEIGHTS[simEra.id] || {})[pillar] ?? 1.0) : 1.0;
    wAvg += w * eraW; wsum += w;
  }
  wAvg = wsum > 0 ? wAvg / wsum : 1.0;
  return wAvg >= 1.15 ? -1 : wAvg <= 0.80 ? 1 : 0;
}

// Tek kaynak: draft skoru (LineupGame) ve sim aynı uzaklık hesabını kullanır.
export function eraDistFactor(player, simEra) {
  const homeEra  = getEra(player._season);
  const rawDist  = Math.abs(eraIndex(homeEra) - eraIndex(simEra));
  const fitShift = rawDist === 0 ? 0 : eraFitShift(player, simEra);
  const effDist  = Math.max(0, Math.min(DIST_PENALTY.length - 1, rawDist + fitShift));
  const timeless = isTimeless(player);
  let distP = DIST_PENALTY[effDist];
  if (timeless) distP = 1.0;   // TIMELESS: era mesafesi TAMAMEN sıfır (gerçekten zamansız)
  return { homeEra, dist: rawDist, effDist, fitShift, distP, timeless };
}

// ── Oyuncunun sim era'daki profili ───────────────────────────────────────────
// _posPenalty: draft sırasında atanır (doğal=1.0, komşu mevki=0.90, uzak=0.75, FLEX=1.0)
export function playerSimProfile(player, simEra) {
  const overall = clamp01(parseFloat(player.overall_score || 0));
  const arch    = player.primary_arch || "";
  const { homeEra, dist, fitShift, distP, timeless } = eraDistFactor(player, simEra);
  const posP    = player._posPenalty ?? 1.0;
  const simQuality = clamp01(overall * distP * posP);
  return { name: player.PLAYER_NAME, arch, homeEra, dist, fitShift, distP, posP, overall, simQuality, timeless };
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

// ── Dakika sistemi (v3.6 Faz D) ──────────────────────────────────────────────
// Varsayılan rotasyon: 5 starter × 35dk + bench 25/15/13/12 = tam 240 dk.
// Her dakika ±5 oynatılabilir; 36dk üstü fatigue cezası, 32dk altı starter
// playoff'a taze bacak bonusu taşır.
export const BASE_MINUTES = [35, 35, 35, 35, 35, 25, 15, 13, 12];
export const MINUTE_FLEX  = 5;

function fatigueOf(m)   { return Math.min(0.09, Math.max(0, m - 36) * 0.015); } // 39dk→−4.5%, 40dk→−6%
function freshOf(mins)  { // starter dinçliği → playoff bonusu (cap +0.02)
  return Math.min(0.02, mins.slice(0, 5).reduce((a, m) => a + Math.max(0, 32 - m) * 0.002, 0));
}

// ── Takım reytingi ───────────────────────────────────────────────────────────
// extras: { bench, coach, minutes: [9 dk], agePenalty } — katkılar dakika-ağırlıklı.
export function computeTeamRating(players, simEra, fit, affinity01 = null, extras = {}) {
  const { bench = [], coach = null, agePenalty = 0 } = extras;
  const minutes = (extras.minutes && extras.minutes.length === players.length + bench.length)
    ? extras.minutes
    : BASE_MINUTES.slice(0, players.length + bench.length);

  const mkProf = (p, i, isBench) => {
    const prof = { ...playerSimProfile(p, simEra), bench: isBench, minutes: minutes[i] ?? (isBench ? 13 : 35) };
    if (isBench && isSixthMan(p.PLAYER_NAME)) {
      prof.simQuality = clamp01(prof.simQuality * 1.10);   // SIXTH MAN: sadece bench'te
      prof.sixth = true;
    }
    prof.fatigue = fatigueOf(prof.minutes);
    prof.effQ = clamp01(prof.simQuality * (1 - prof.fatigue));
    return prof;
  };
  const profiles      = players.map((p, i) => mkProf(p, i, false));
  const benchProfiles = bench.map((p, i) => mkProf(p, players.length + i, true));

  // Dakika-ağırlıklı kadro kalitesi (eski sabit 0.78/0.22 payların yerini aldı)
  const all = [...profiles, ...benchProfiles];
  const totalMin = all.reduce((a, p) => a + p.minutes, 0) || 240;
  let rosterQ = all.reduce((a, p) => a + p.effQ * p.minutes, 0) / totalMin;
  // Bench draft edilmemişse (eski çağrılar): kalan dakikalar zayıf bench varsayımı
  if (!benchProfiles.length) {
    const sQ = profiles.reduce((a, b) => a + b.effQ, 0) / profiles.length;
    rosterQ = (rosterQ * totalMin + sQ * 0.70 * (240 - totalMin)) / 240;
  }

  // Yıldız gücü: dakikası kısılan yıldız o kadar taşıyamaz
  const starPower = Math.max(...all.map(p => p.effQ * Math.min(1, p.minutes / 32)));
  const fresh = freshOf(minutes);

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
  rating -= agePenalty;   // dynasty sezonları: kadro yaşlanır (Faz E)
  return { rating, profiles, benchProfiles, starPower, fresh, fx, benchBalanced: cover.balanced };
}

// ── Rakip modeli + tek maç (S4: cetvele fit edildi) ──────────────────────────
// v3.9: sabit el-yapımı karışım YERİNE self-consistent rakip — rakipler takım
// rating dağılımından (backtest fit: μ=0.662, σ=0.044) örneklenir. Ortalama
// takım .500 oynar (oto-merkez); k=11 gerçekçi yelpaze (~13-60W) verir. Eski
// k=4.5 + karışım her şeyi 30-54W'ye sıkıştırıyordu (cetvel: RMSE 10.0→8.1).
export const OPP_MEAN   = 0.662;
export const OPP_STD    = 0.044;
export const LOGISTIC_K = 11.0;
// Playoff serileri regular sezondan daha yumuşak eğimli: gerçek 7-maçlık seriler
// daha çok sürpriz barındırır; k=11 favoriyi kilitleyip şampiyon title%'i ~%44'e
// çıkarıyordu. PLAYOFF_K en iyi takımı NBA-gerçekçi ~%25-30 title'a çeker.
export const PLAYOFF_K  = 6.0;   // sanity: gerçek şampiyonlar ~%27 title (NBA'de en iyi takım ~%25)

// Box-Muller standart normal (0,1)
function randNormal(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Maç günü formu jitter'ı: aynı kadro her koşuda aynı sonucu almaz.
function playGame(rating, opp, home, rand, k = LOGISTIC_K) {
  const jitter = (rand() - 0.5) * 0.16;
  const diff   = (rating + jitter) - opp + (home ? 0.03 : -0.03);
  return rand() < 1 / (1 + Math.exp(-k * diff));
}

// Rakip = lig dağılımından örnek (self-consistent). Ortalama takım (0.662) → .500.
function sampleOpponent(rand) {
  return Math.max(0.30, Math.min(0.95, OPP_MEAN + OPP_STD * randNormal(rand)));
}

// Playoff rakipleri: yeni self-consistent merkeze göre (S4). Rakip = lig
// dağılımının üst kuantilleri (tur ilerledikçe güçlenir): μ + z·σ, z=[0.6,1.1,1.7,2.3].
const PLAYOFF_ROUNDS = [
  { key: "R1",   label: "First Round",       base: OPP_MEAN + 0.6 * OPP_STD },  // ~0.688
  { key: "SEMI", label: "Conf. Semifinals",  base: OPP_MEAN + 1.1 * OPP_STD },  // ~0.710
  { key: "CF",   label: "Conf. Finals",      base: OPP_MEAN + 1.7 * OPP_STD },  // ~0.737
  { key: "F",    label: "NBA Finals",        base: OPP_MEAN + 2.3 * OPP_STD },  // ~0.763
];

// Best-of-7, 2-2-1-1-1 formatı. boost: seri bazlı ek reyting (ör. FMVP geni Finals'te)
function playSeries(myRating, opp, homeAdv, rand, boost = 0) {
  let w = 0, l = 0;
  const games = [];
  while (w < 4 && l < 4) {
    const gameNo = w + l;
    const home = [0, 1, 4, 6].includes(gameNo) ? homeAdv : !homeAdv;
    const won = playGame(myRating + boost, opp, home, rand, PLAYOFF_K);
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
  const { rating, profiles, benchProfiles, starPower, fresh, fx, benchBalanced } =
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

  // Playoff koşusu: yıldız gücü + koç DNA'sı + yüzükler + taze bacaklar (Faz D)
  const playoffRating = 0.82 * effRating + 0.18 * starPower
                      + coachPlayoffBonus(coach) + (fx?.playoff ?? 0) + (fresh ?? 0);
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

  // ── Sezon ödülleri (Faz 3) ───────────────────────────────────────────────────
// Simüle box-stat: gerçek PTS/REB/AST × (sim etkinliği / gerçek overall) × dakika payı.
// Ödüller bu istatistik + takım başarısı + şans üzerinden dağıtılır.
function computeSeasonAwards({ profiles, benchProfiles, players, bench, wins, champion }, rand) {
  const factor = prof => prof ? prof.simQuality / Math.max(0.35, prof.overall) : 1;
  const line = (pl, prof, isBench) => {
    // Dakika payı: 35dk taban — 25dk'lık 6th man üretimin ~%71'ini, 12dk'lık ~%34'ünü verir
    const mShare = Math.min(1.15, (prof.minutes ?? (isBench ? 13 : 35)) / 35);
    const f = factor(prof) * mShare;
    const st = k => +(Math.max(0, parseFloat(pl[k] || 0)) * f).toFixed(1);
    return {
      name:  prof.name,
      min:   prof.minutes ?? (isBench ? 13 : 35),
      pts: st("PTS"), reb: st("REB"), ast: st("AST"),
      stl: st("STL"), blk: st("BLK"),
      fg3: pl.FG3_PCT != null && !isNaN(+pl.FG3_PCT) ? Math.round(+pl.FG3_PCT * 100) : null,
      q:     prof.simQuality,
      bench: isBench,
    };
  };
  const starterLines = players.map((pl, i) => line(pl, profiles[i], false));
  const benchLines   = bench.map((pl, i) => line(pl, benchProfiles[i], true));

  const awards = [];
  const best = starterLines.reduce((a, b) => (b.q > a.q ? b : a), starterLines[0]);

  // League MVP: 55+ galibiyet + dominant sezon → şans, kalite ve galibiyetle artar
  if (best && wins >= 55 && best.q >= 0.85) {
    const odds = Math.min(0.85, (best.q - 0.80) * 3 + (wins - 55) * 0.02);
    if (rand() < odds) awards.push(`🏅 League MVP — ${best.name}`);
  }
  // All-NBA / All-Star seçimleri
  for (const l of starterLines) {
    if (l.q >= 0.80)      awards.push(`🌟 All-NBA — ${l.name}`);
    else if (l.q >= 0.70) awards.push(`⭐ All-Star — ${l.name}`);
  }
  // DPOY: en iyi savunma kompoziti (Anchor/Stopper/Two-Way) × sim etkinliği
  const defs = players.map((pl, i) => ({
    name: profiles[i].name,
    d: Math.max(
      parseFloat(pl["score_Anchor"] || 0), parseFloat(pl["score_Stopper"] || 0),
      parseFloat(pl["score_Two-Way"] || 0),
    ) * factor(profiles[i]),
  }));
  const defBest = defs.reduce((a, b) => (b.d > a.d ? b : a), defs[0]);
  if (defBest && defBest.d >= 0.80 && wins >= 48 && rand() < Math.min(0.7, (defBest.d - 0.72) * 2.5)) {
    awards.push(`🛡 Defensive POY — ${defBest.name}`);
  }
  // 6th Man: en iyi bench oyuncusu (gerçek 6MOY tag'i şansı artırır)
  if (benchLines.length) {
    const b6 = benchLines.reduce((a, b) => (b.q > a.q ? b : a), benchLines[0]);
    const hasTag = benchProfiles.find(p => p.name === b6.name)?.sixth;
    if (b6.q >= 0.50 && rand() < (hasTag ? 0.70 : 0.30)) {
      awards.push(`🔥 Sixth Man of the Year — ${b6.name}`);
    }
  }
  // Finals MVP: şampiyonlukta en iyi starter
  if (champion && best) awards.push(`🏆 Finals MVP — ${best.name}`);

  return { statLines: [...starterLines, ...benchLines], awards };
}

const RESULT_LABEL = {
    CHAMPION: "NBA CHAMPIONS",
    FINALS:   "Lost in the NBA Finals",
    CF:       "Lost in the Conference Finals",
    SEMI:     "Lost in the Conference Semifinals",
    R1:       "Lost in the First Round",
    MISSED:   "Missed the Playoffs",
  };

  const { statLines, awards } = computeSeasonAwards(
    { profiles, benchProfiles, players, bench: extras.bench || [], wins, champion }, rand,
  );

  return {
    simEra, rating, playoffRating, profiles, benchProfiles, coach, starPower,
    tagNotes: fx?.notes ?? [], benchBalanced,
    statLines, awards,
    gameLog, wins, losses,
    bestStreak, worstSkid: Math.abs(worstSkid),
    madePlayoffs, seed,
    playoffRounds, champion,
    playoffGameWins, seasonScore,
    resultKey, resultLabel: RESULT_LABEL[resultKey],
  };
}
