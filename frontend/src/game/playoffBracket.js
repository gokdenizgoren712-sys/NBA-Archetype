// ── Rewrite History: gerçek playoff bracket'i ────────────────────────────────
// Konferans haritası + tarihi format kuralları (play-in/best-of-5-7) + bracket
// motoru. leagueSim.js'in ürettiği teamRatings/teamSeasons üzerine kurulur —
// yeni bir simülasyon motoru değil, mevcut playGame()'i (seasonSim.js) reuse
// eder (bkz. plan: C:\Users\ggore\.claude\plans\fancy-cooking-gizmo.md).
import { playGame, PLAYOFF_K } from "./seasonSim";
import { gameBoxLine } from "./headToHead";

// data/*__schedule.parquet üzerinde elle doğrulanmış TÜM 39 TEAM_ABBREVIATION
// kodu (güncel 30 + tarihi/taşınmış 9) — bkz. plan "Doğrulanmış tarihi
// gerçekler". Sadece mevcut 30'u kapsamak yetersiz: eski sezonlarda SEA/VAN/
// NJN/CHH/NOK/NOH/KCK/SDC/PHO gibi kodlar geçiyor.
export const TEAM_CONFERENCE = {
  // Doğu
  ATL: "East", BOS: "East", BKN: "East", NJN: "East", CHA: "East", CHH: "East",
  CHI: "East", CLE: "East", DET: "East", IND: "East", MIA: "East", MIL: "East",
  NYK: "East", ORL: "East", PHI: "East", TOR: "East", WAS: "East",
  // Batı
  DAL: "West", DEN: "West", GSW: "West", HOU: "West", LAC: "West", SDC: "West",
  LAL: "West", MEM: "West", VAN: "West", MIN: "West", NOP: "West", NOH: "West",
  NOK: "West", OKC: "West", SEA: "West", PHX: "West", PHO: "West", POR: "West",
  SAC: "West", KCK: "West", SAS: "West", UTA: "West",
};

// 1983-84 (veri setinin ilk sezonu) zaten 16 takım/best-of-5 ilk tur
// formatında — best-of-3 bu aralıkta hiç yok. 2002-03'ten (2003 playoff'ları)
// itibaren ilk tur da best-of-7. 2020-21'den itibaren Play-In Tournament.
export function playoffFormat(season) {
  const playoffYear = parseInt(season.split("-")[0], 10) + 1;
  return {
    hasPlayIn: playoffYear >= 2021,
    firstRoundBestOf: playoffYear <= 2002 ? 5 : 7,   // yarı final ve sonrası hep best-of-7
  };
}

const HOME_PATTERN = { 4: [0, 1, 4, 6], 3: [0, 1, 4] };   // best-of-7 (2-2-1-1-1) / best-of-5 (2-2-1)

// İki takım (rating'e göre) — winsNeeded'e ulaşan kazanır. homeAdvA: A'nın
// üst seed (ev sahibi avantajlı taraf) olup olmadığı.
export function playSeriesN(ratingA, ratingB, homeAdvA, rand, winsNeeded, boostA = 0, k) {
  const pattern = HOME_PATTERN[winsNeeded] || HOME_PATTERN[4];
  let wA = 0, wB = 0;
  const games = [];
  while (wA < winsNeeded && wB < winsNeeded) {
    const gameNo = wA + wB;
    const aHome = pattern.includes(gameNo) ? homeAdvA : !homeAdvA;
    const aWon = playGame(ratingA + boostA, ratingB, aHome, rand, k || PLAYOFF_K);
    games.push(aWon);
    aWon ? wA++ : wB++;
  }
  return { wA, wB, aWon: wA === winsNeeded, games };
}

// Konferans sıralaması — teamSeasons'daki HER takımın KENDİ simüle
// wins/losses'ı (gerçek win_pct'ten DEĞİL) + kullanıcının kendi simüle
// rekoru. Play-in dönemiyse 7-10 arası seed'ler play-in'e gider (aşağıda
// initBracket bunu ele alır), değilse direkt 1-8.
export function buildConferenceStandings(teamSeasons, userAbbr, userWins, userLosses) {
  const entries = [];
  for (const [abbr, season] of Object.entries(teamSeasons)) {
    const conf = TEAM_CONFERENCE[abbr];
    if (!conf) { console.warn(`[playoffBracket] Bilinmeyen takım kısaltması, konferans haritasında yok: ${abbr}`); continue; }
    entries.push({ abbr, conference: conf, wins: season.wins, losses: season.losses, isUser: false });
  }
  const userConf = TEAM_CONFERENCE[userAbbr];
  if (userConf) {
    entries.push({ abbr: userAbbr, conference: userConf, wins: userWins, losses: userLosses, isUser: true });
  } else {
    console.warn(`[playoffBracket] Kullanıcının takımı (${userAbbr}) konferans haritasında yok.`);
  }

  const byConf = { East: [], West: [] };
  for (const e of entries) {
    const winPct = e.wins + e.losses > 0 ? e.wins / (e.wins + e.losses) : 0;
    byConf[e.conference]?.push({ ...e, winPct });
  }
  byConf.East.sort((a, b) => b.winPct - a.winPct);
  byConf.West.sort((a, b) => b.winPct - a.winPct);
  byConf.East.forEach((e, i) => { e.seed = i + 1; });
  byConf.West.forEach((e, i) => { e.seed = i + 1; });
  return byConf;
}

function ratingOf(abbr, userAbbr, userRating, teamRatings) {
  return abbr === userAbbr ? userRating : (teamRatings[abbr] ?? 0.5);
}

// Faz D: playoff-özel box score + organik Konferans Finalleri/Finals MVP.
// rosterInfo: {abbr: {players, bench, profiles, benchProfiles}} — 29 arka
// plan takımı için leagueSim.js'in ürettiği rosterByAbbr + teamSeasons'daki
// profiles/benchProfiles. userRoster aynı şekil, kullanıcının kendi kadrosu.
function rosterOf(bracket, abbr) {
  return abbr === bracket.userAbbr ? bracket.userRoster : bracket.rosterInfo?.[abbr];
}

// Bir takımın tek maçlık box-line'larını üretir (henüz seriye YAZILMAZ —
// reconcileGameLines'ın her iki tarafı da bilmesi gerekiyor, bkz. aşağı).
function genTeamLines(bracket, abbr, rand) {
  const roster = rosterOf(bracket, abbr);
  if (!roster) return [];
  const all = [...(roster.players || []).map((p, i) => [p, roster.profiles?.[i]]),
               ...(roster.bench || []).map((p, i) => [p, roster.benchProfiles?.[i]])];
  const lines = [];
  for (const [rawPlayer, prof] of all) {
    if (!prof) continue;
    lines.push(gameBoxLine(rawPlayer, prof, rand));
  }
  // 2026-08 denetimi: dynasty yaşlanması (agePenaltyFor) regular-season
  // box-score'a (computeSeasonAwards, seasonSim.js) uygulandı ama playoff
  // box-score'ları hep tazeydi — Yıl 5'te takım kaydı düşerken oyuncunun
  // playoff üretimi/Finals MVP adaylığı Yıl 1'dekiyle birebir aynı kalırdı.
  // Sadece kullanıcının kendi takımı yaşlanır — diğer 29 takım her sezon
  // taze gerçek roster'la yeniden kuruluyor (leagueSim.js), onlara uygulanmaz.
  if (abbr === bracket.userAbbr && bracket.agePenalty) {
    const ageFactor = Math.max(0.5, 1 - bracket.agePenalty);
    for (const l of lines) {
      l.pts = Math.round(l.pts * ageFactor);
      l.reb = Math.round(l.reb * ageFactor);
      l.ast = Math.round(l.ast * ageFactor);
      l.stl = Math.round(l.stl * ageFactor);
      l.blk = Math.round(l.blk * ageFactor);
    }
  }
  return lines;
}

// Maçın GERÇEK kazananı (playGame() — takım rating'inden, PLAYOFF_K'lı bir
// olasılıktan) ile box-score toplamı (gameBoxLine — oyuncu başına BAĞIMSIZ
// jitter) FARKLI rastgelelik kaynağı — reconcile edilmezse "118 sayı attı
// ama kaybetti" gibi anlamsız sonuçlar çıkabiliyordu (kullanıcı raporu,
// 2026-08). Kaybeden takımın box toplamı kazanandan yüksekse, kazananın
// oyuncu skorlarını KÜÇÜK gerçekçi bir marjla (3-12 sayı) öne geçirecek
// şekilde ORANTILI ölçekle — bireysel oyuncu PAYLARI (kim daha çok/az
// attı) bozulmaz, sadece takım toplamının ölçeği düzelir.
function reconcileGameLines(linesA, linesB, aWon, rand) {
  const sum = lines => lines.reduce((a, l) => a + l.pts, 0);
  const ptsA = sum(linesA), ptsB = sum(linesB);
  const winnerLines = aWon ? linesA : linesB;
  const winnerPts = aWon ? ptsA : ptsB;
  const loserPts = aWon ? ptsB : ptsA;
  if (winnerPts <= loserPts) {
    const margin = 3 + Math.floor(rand() * 10);
    const scale = (loserPts + margin) / Math.max(1, winnerPts);
    for (const l of winnerLines) l.pts = Math.round(l.pts * scale);
  }
}

// Reconcile edilmiş line'ları seriye yazar: hem kümülatif SERİ toplamına
// (boxTotals{A,B} — seriesMVP/computeUserPlayoffStatLines bunu okur) hem de
// "en son oynanan TEK maç" anlık görüntüsüne (lastGameBox{A,B} — her
// stepBracket'te ÜZERİNE YAZILIR, biriktirmez; Finals UI'ı "maç maç
// ilerlerken sadece o anki maçın box score'u, aşağı doğru birikmesin"
// isteği için bunu gösteriyor, bkz. PlayoffBracketView.jsx).
function commitGameLines(series, teamKey, lines) {
  const totalsKey = teamKey === "A" ? "boxTotalsA" : "boxTotalsB";
  const lastKey = teamKey === "A" ? "lastGameBoxA" : "lastGameBoxB";
  if (!series[totalsKey]) series[totalsKey] = {};
  const totals = series[totalsKey];
  for (const line of lines) {
    const cur = totals[line.name] || { name: line.name, bench: line.bench, games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
    cur.games++; cur.pts += line.pts; cur.reb += line.reb; cur.ast += line.ast; cur.stl += line.stl; cur.blk += line.blk;
    totals[line.name] = cur;
  }
  series[lastKey] = lines;
}

// Bir serinin box-score havuzundan (iki takım birden) MVP seç — mevcut
// seasonSim.js mvpScore mantığıyla aynı (pts + 0.45*(ast+reb)), ortalamaya
// göre.
export function seriesMVP(series) {
  const pool = [];
  for (const key of ["boxTotalsA", "boxTotalsB"]) {
    const totals = series[key];
    if (!totals) continue;
    const abbr = key === "boxTotalsA" ? series.teamA.abbr : series.teamB.abbr;
    for (const t of Object.values(totals)) {
      if (!t.games) continue;
      pool.push({
        name: t.name, abbr,
        pts: +(t.pts / t.games).toFixed(1), reb: +(t.reb / t.games).toFixed(1), ast: +(t.ast / t.games).toFixed(1),
      });
    }
  }
  if (!pool.length) return null;
  const score = p => p.pts + 0.45 * (p.ast + p.reb);
  return pool.reduce((a, b) => (score(b) > score(a) ? b : a), pool[0]);
}

// Kullanıcının kendi playoff istatistikleri — oynadığı HER seriden (userAbbr
// teamA ya da teamB olan, kazanmış/kaybetmiş fark etmez) kendi tarafının
// boxTotalsA/B'sini toplar, maç-başı ortalamaya çevirir. "Season Awards"
// bloğundaki Regular Season/Playoffs toggle bunu result.statLines ile
// karşılaştırır (bkz. SeasonSimPanel.jsx).
export function computeUserPlayoffStatLines(bracket) {
  if (!bracket?.userAbbr) return [];
  const totals = {};
  for (const round of bracket.rounds) {
    for (const series of round) {
      const isA = series.teamA.abbr === bracket.userAbbr;
      const isB = series.teamB.abbr === bracket.userAbbr;
      if (!isA && !isB) continue;
      const box = isA ? series.boxTotalsA : series.boxTotalsB;
      if (!box) continue;
      for (const t of Object.values(box)) {
        const cur = totals[t.name] || { name: t.name, bench: t.bench, games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
        cur.games += t.games; cur.pts += t.pts; cur.reb += t.reb; cur.ast += t.ast; cur.stl += t.stl; cur.blk += t.blk;
        totals[t.name] = cur;
      }
    }
  }
  return Object.values(totals)
    .filter(t => t.games > 0)
    .map(t => ({
      name: t.name, bench: t.bench, games: t.games,
      pts: +(t.pts / t.games).toFixed(1), reb: +(t.reb / t.games).toFixed(1),
      ast: +(t.ast / t.games).toFixed(1), stl: +(t.stl / t.games).toFixed(1), blk: +(t.blk / t.games).toFixed(1),
    }))
    .sort((a, b) => b.pts - a.pts);
}

// Sabit slot bracket (TV grafiğindeki gibi, re-seeding YOK): 1v8,4v5,3v6,2v7.
function firstRoundPairs(seeded) {
  const bySeed = {};
  for (const t of seeded) bySeed[t.seed] = t;
  return [[bySeed[1], bySeed[8]], [bySeed[4], bySeed[5]], [bySeed[3], bySeed[6]], [bySeed[2], bySeed[7]]];
}

// Play-in mini-bracket (best-of-1, gerçek NBA formatı): 7v8 kazananı 7-seed,
// kaybedeni 9v10 kazananıyla oynar (kazanan 8-seed). TÜM takımlar (kullanıcı
// dahil) roster-bazlı reytingle oynar.
function resolvePlayIn(seeded, userAbbr, userRating, teamRatings, rand) {
  const bySeed = {};
  for (const t of seeded) bySeed[t.seed] = t;
  const r = (t) => ratingOf(t.abbr, userAbbr, userRating, teamRatings);
  const g78 = playGame(r(bySeed[7]), r(bySeed[8]), true, rand, PLAYOFF_K);
  const seed7 = g78 ? bySeed[7] : bySeed[8];
  const loser78 = g78 ? bySeed[8] : bySeed[7];
  const g910 = playGame(r(bySeed[9]), r(bySeed[10]), true, rand, PLAYOFF_K);
  const winner910 = g910 ? bySeed[9] : bySeed[10];
  const gFinal = playGame(r(loser78), r(winner910), true, rand, PLAYOFF_K);
  const seed8 = gFinal ? loser78 : winner910;
  const top6 = seeded.filter((t) => t.seed <= 6);
  return [...top6, { ...seed7, seed: 7 }, { ...seed8, seed: 8 }];
}

// Bracket kurulumu: East/West sıralamaları + (varsa) play-in çözümü + round-1
// eşleşmeleri. Oynamaya başlamaz — stepBracket() bekler (round-gating).
// rosterInfo/userRoster (opsiyonel): verilirse Faz D'nin playoff box-score +
// organik MVP hesabı devreye girer (bkz. rosterOf/accumulateBoxScores).
export function initBracket(season, teamSeasons, teamRatings, userAbbr, userRating, userWins, userLosses, rand = Math.random, rosterInfo = null, userRoster = null, agePenalty = 0) {
  const format = playoffFormat(season);
  let standings = buildConferenceStandings(teamSeasons, userAbbr, userWins, userLosses);

  // 2026-08 denetimi: SeasonSimPanel'in lig-kurulumu eşiği GLOBAL bir sayım
  // (teamsBuilt >= 20, 29 takımın ~%69'u) — ama build hataları konferanslar
  // arasında EŞİT dağılmayabilir. 20 takım kurulsa bile (uyarı zaten
  // gösteriliyor ama Playoffs butonu yine de aktif kalıyor) o 20'si tek bir
  // konferansta toplanmışsa öbür konferans 8'in (ya da play-in'de 10'un)
  // altında kalabilir — firstRoundPairs/resolvePlayIn undefined bir takıma
  // ("bySeed[8]" vb.) .abbr okumaya çalışıp TypeError'la çökerdi, kullanıcıya
  // hiçbir mesaj göstermeden. Burada açık, yakalanabilir bir hata fırlat —
  // çağıran taraf (SeasonSimPanel.jsx) bunu leagueWarning olarak gösterir.
  const minPerConf = format.hasPlayIn ? 10 : 8;
  for (const conf of ["East", "West"]) {
    if (standings[conf].length < minPerConf) {
      throw new Error(
        `Not enough ${conf} Conference teams built to run the playoffs (${standings[conf].length} of ${minPerConf} needed) — try "Run It Back" to rebuild the league.`
      );
    }
  }

  if (format.hasPlayIn) {
    standings = {
      East: resolvePlayIn(standings.East, userAbbr, userRating, teamRatings, rand),
      West: resolvePlayIn(standings.West, userAbbr, userRating, teamRatings, rand),
    };
  }

  const makeSeries = (round, conference, teamA, teamB, winsNeeded) => ({
    round, conference,
    teamA: { ...teamA, rating: ratingOf(teamA.abbr, userAbbr, userRating, teamRatings) },
    teamB: { ...teamB, rating: ratingOf(teamB.abbr, userAbbr, userRating, teamRatings) },
    winsNeeded, wA: 0, wB: 0, games: [], winner: null,
  });

  // format.firstRoundBestOf toplam maç sayısı (5/7) — winsNeeded seriyi
  // KAZANMAK için gereken galibiyet sayısı (3/4, HOME_PATTERN'in anahtarlarıyla
  // aynı), ikisi farklı şey, doğrudan geçirmek bug'dı (bkz. bug fix notu).
  const firstRoundWinsNeeded = Math.ceil(format.firstRoundBestOf / 2);
  const round1 = [];
  for (const conf of ["East", "West"]) {
    const pairs = firstRoundPairs(standings[conf].slice(0, 8));
    for (const [a, b] of pairs) round1.push(makeSeries("R1", conf, a, b, firstRoundWinsNeeded));
  }

  return {
    season, format, standings, rounds: [round1], userAbbr, userRating, teamRatings,
    rosterInfo, userRoster, champion: null, agePenalty,
  };
}

const ROUND_ORDER = ["R1", "SEMI", "CF", "F"];

// Round'daki TÜM seriler kararlanınca sonraki round'un eşleşmelerini kurar
// (oynamaya BAŞLAMAZ — bir sonraki stepBracket'i bekler).
function advanceIfRoundComplete(bracket) {
  const curRoundIdx = bracket.rounds.length - 1;
  const curRound = bracket.rounds[curRoundIdx];
  if (curRound.some((s) => !s.winner)) return;   // hâlâ karara bağlanmamış seri var
  const curKey = ROUND_ORDER[curRoundIdx];
  if (curKey === "F") return;   // Finals sonrası ilerleme yok

  if (curKey === "CF") {
    const east = curRound.find((s) => s.conference === "East").winner;
    const west = curRound.find((s) => s.conference === "West").winner;
    bracket.rounds.push([makeFinalsSeries(bracket, east, west)]);
    return;
  }

  const nextRound = [];
  for (const conf of ["East", "West"]) {
    const winners = curRound.filter((s) => s.conference === conf).map((s) => s.winner);
    // Sabit slot: round1'in [1v8,4v5,3v6,2v7] sırası korunuyor —
    // ardışık ikişer galip eşleşir (1v8/4v5 galipleri vs 3v6/2v7 galipleri).
    for (let i = 0; i < winners.length; i += 2) {
      nextRound.push(makeSeriesFromWinners(bracket, ROUND_ORDER[curRoundIdx + 1], conf, winners[i], winners[i + 1]));
    }
  }
  bracket.rounds.push(nextRound);
}

function makeSeriesFromWinners(bracket, round, conference, teamA, teamB) {
  const r = (abbr) => ratingOf(abbr, bracket.userAbbr, bracket.userRating, bracket.teamRatings);
  return {
    round, conference,
    teamA: { abbr: teamA.abbr, seed: teamA.seed, isUser: teamA.abbr === bracket.userAbbr, rating: r(teamA.abbr) },
    teamB: { abbr: teamB.abbr, seed: teamB.seed, isUser: teamB.abbr === bracket.userAbbr, rating: r(teamB.abbr) },
    winsNeeded: 4, wA: 0, wB: 0, games: [], winner: null,   // yarı final ve sonrası hep best-of-7 → 4 galibiyet
  };
}
function makeFinalsSeries(bracket, teamA, teamB) {
  return makeSeriesFromWinners(bracket, "F", null, teamA, teamB);
}

// Mevcut round'daki HENÜZ KARARLANMAMIŞ her seriye tam 1 maç ekler. Round'un
// TÜMÜ bitince sonraki round'u kurar (oynamaya başlamaz). Finals bitince
// bracket.champion set edilir.
export function stepBracket(bracket, rand = Math.random) {
  const curRound = bracket.rounds[bracket.rounds.length - 1];
  for (const series of curRound) {
    if (series.winner) continue;
    const homeAdvA = series.wA + series.wB === 0 ? (series.teamA.seed ?? 0) <= (series.teamB.seed ?? 99) : series._homeAdvA;
    series._homeAdvA = homeAdvA;
    const pattern = HOME_PATTERN[series.winsNeeded] || HOME_PATTERN[4];
    const gameNo = series.wA + series.wB;
    const aHome = pattern.includes(gameNo) ? homeAdvA : !homeAdvA;
    const aWon = playGame(series.teamA.rating, series.teamB.rating, aHome, rand, PLAYOFF_K);
    series.games.push({ aWon, aHome });
    const linesA = genTeamLines(bracket, series.teamA.abbr, rand);
    const linesB = genTeamLines(bracket, series.teamB.abbr, rand);
    reconcileGameLines(linesA, linesB, aWon, rand);
    commitGameLines(series, "A", linesA);
    commitGameLines(series, "B", linesB);
    aWon ? series.wA++ : series.wB++;
    if (series.wA === series.winsNeeded) series.winner = series.teamA;
    else if (series.wB === series.winsNeeded) series.winner = series.teamB;
  }
  advanceIfRoundComplete(bracket);
  const lastRound = bracket.rounds[bracket.rounds.length - 1];
  if (ROUND_ORDER[bracket.rounds.length - 1] === "F" && lastRound[0]?.winner) {
    bracket.champion = lastRound[0].winner;
  }
  return bracket;
}

// 2026-08 denetimi: leaderboard'a yazılan "season_result" (CHAMPION/FINALS/
// CF/SEMI/R1) RH'de hâlâ seasonSim.js'in İÇ sentetik Quick-Sim playoff'undan
// geliyordu — kullanıcı gerçek bracket'i hiç oynamadan/kaybederken bile
// leaderboard'da sahte bir "CHAMPION" görünebiliyordu (bkz. rhTitleWon/
// Defend the Title fix'iyle AYNI kök sebep, sadece burada UI değil DB'ye
// yazılan veri). Bu fonksiyon kullanıcının GERÇEK bracket'teki kaderini
// bulur: en son (en ileri round) karara bağlanmış serisine bakar. Hâlâ
// hayattaysa (serisi henüz bitmedi, ya da kazandı ama sonraki round henüz
// kurulmadı) null döner — backend'de "TBD" durumu yok, çağıran taraf null
// döndüğünde hiç postlamamalı (satırın mevcut durumunu korumak, sentetik
// bir değer göndermekten daha doğru).
export function deriveRhResultKey(bracket, userAbbr) {
  if (!bracket || !userAbbr) return null;
  if (bracket.champion?.abbr === userAbbr) return "CHAMPION";
  for (let i = bracket.rounds.length - 1; i >= 0; i--) {
    const series = bracket.rounds[i].find((s) => s.teamA.abbr === userAbbr || s.teamB.abbr === userAbbr);
    if (!series) continue;
    if (!series.winner) return null;                 // bu round hâlâ oynanıyor
    if (series.winner.abbr !== userAbbr) {
      return series.round === "F" ? "FINALS" : series.round;   // "CF" | "SEMI" | "R1"
    }
    return null;                                      // bu round'u kazandı, kader hâlâ belli değil
  }
  return null;
}
