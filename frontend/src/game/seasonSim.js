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

// ── Era-meta kalite faktörü (v3.11 / P4) ─────────────────────────────────────
// Oyuncunun arketibinin (top-3 ağırlıklı) sim-era'daki pillar ağırlığına göre
// kalitesini modüle eder: şutör spacing döneminde ↑, rim döneminde ↓. Coverage'ın
// (MAX, doygun) aksine kaliteye uygulanınca era-meta HEM hissedilir HEM doğru
// (cetvel: same-era within-season Spearman 0.783→0.786, era-fit gerçek sinyal).
const ERA_META_AMP = 0.30;
const _ERA_MEAN_W = {};
for (const _e of Object.keys(ERA_PILLAR_WEIGHTS)) {
  const _v = Object.values(ERA_PILLAR_WEIGHTS[_e]);
  _ERA_MEAN_W[_e] = _v.reduce((a, b) => a + b, 0) / _v.length;
}
export function eraMetaFactor(player, simEra) {
  if (!simEra || !ERA_PILLAR_WEIGHTS[simEra.id]) return 1;
  const w = topArchWeights(player, 3);
  if (!w.length) return 1;
  let acc = 0, ws = 0;
  for (const [arch, wt] of w) {
    const pil = ARCH_PILLAR[arch];
    const ew = pil ? (ERA_PILLAR_WEIGHTS[simEra.id][pil] ?? 1) : 1;
    acc += wt * ew; ws += wt;
  }
  const raw = (ws > 0 ? acc / ws : 1) / (_ERA_MEAN_W[simEra.id] || 1);
  return 1 - ERA_META_AMP + ERA_META_AMP * raw;
}

// ── Oyuncunun sim era'daki profili ───────────────────────────────────────────
// _posPenalty: draft sırasında atanır (doğal=1.0, komşu mevki=0.90, uzak=0.75, FLEX=1.0)
export function playerSimProfile(player, simEra) {
  const overall = clamp01(parseFloat(player.overall_score || 0));
  const arch    = player.primary_arch || "";
  const { homeEra, dist, fitShift, distP, timeless } = eraDistFactor(player, simEra);
  const posP    = player._posPenalty ?? 1.0;
  const simQuality = clamp01(overall * distP * posP * eraMetaFactor(player, simEra));
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

// Fatigue (S6): 35dk üstü HIZLANAN yük (lineer değil). 36→~%0.6, 38→~%3, 40→~%7, 42→cap %10.
// Yıldızı aşırı oynatmak (40dk+) belirgin cezalı → dakika yönetimi anlamlı.
function fatigueOf(m)   { return Math.min(0.10, Math.pow(Math.max(0, m - 35), 1.5) * 0.006); }
function freshOf(mins)  { // starter dinçliği → playoff bonusu (cap +0.02)
  return Math.min(0.02, mins.slice(0, 5).reduce((a, m) => a + Math.max(0, 32 - m) * 0.002, 0));
}
// Dynasty yaşlanma (S6): lineer DEĞİL, hızlanan. Kadro çekirdeği her yıl yaşlanır,
// düşüş yıllar geçtikçe dikleşir. year=1→0, y2→~0.013, y3→~0.032, y5→~0.087 (5-peat çok zor).
export function agePenaltyFor(year) {
  const y = Math.max(0, (year || 1) - 1);
  return 0.008 * y + 0.005 * Math.pow(y, 1.7);
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
  // 2026-08 gerçekçilik denetimi (bkz. C:\...\scratchpad\variant-test.mjs, 12
  // sezon-koşusu × 4+ varyant): "tam lig" modunda (30 takımın hepsi
  // roster-bazlı) düz dakika-ağırlıklı ortalama, takım rating dağılımını
  // gerçek NBA'e göre fazla sıkıştırıyordu (galibiyet std'si 12.2→8.5,
  // ~%31 daralma → playoff upset oranı %35, gerçek ~%20-25 yerine) — 9
  // oyuncuyu düz ortalamak varyansı matematiksel olarak yutuyor, tam da
  // core overall_score motorunun (top-4-of-12 + ^1.5 üs) KAÇINDIĞI tuzak.
  // Varyans geri-germe (z-score stretch, sabit çapa RQ_ANCHOR≈lig-ortalama
  // roster kalitesi): ölçülen 12 sezonluk karşılaştırmada (MAE/korelasyon/
  // std/upset-oranı) tek başına en dengeli iyileşmeyi bu verdi — "peak-
  // ağırlıklı" (effQ^1.5) alternatifi test edildi, DAHA KÖTÜ çıktı (corr
  // 0.62→0.58), reddedildi.
  const RQ_ANCHOR = 0.60, RQ_STRETCH = 1.44;
  rosterQ = RQ_ANCHOR + (rosterQ - RQ_ANCHOR) * RQ_STRETCH;

  // Yıldız gücü: dakikası kısılan yıldız o kadar taşıyamaz
  const starPower = Math.max(...all.map(p => p.effQ * Math.min(1, p.minutes / 32)));
  const fresh = freshOf(minutes);

  // Ödül tag'leri: MVP/DPOY/Duo → regular, yüzükler → playoff, FMVP → Finals
  const fx = awardEffects(players, bench);
  const cover = benchCoverage(bench);
  if (cover.balanced) { fx.regular += 0.008; fx.notes.push("Balanced bench (G+F+C) +0.8"); }

  // NOT: rating bilerek clamp'lenmez — süper takımlar 1.0 tavanına yapışırsa
  // pozisyon/koç farkları tavanda kaybolur; logistic her aralıkla çalışır.
  // roleFit (v3.9.2): ÖNCE decouple edildi (eski sert eğri [0,0,.05,.22,.42,.58]
  // tahmini bozuyordu → within 0.756), SONRA lineupScore veri-dürüst hafif eğriye
  // [.06,.04,0,0,0,.06] çekilince SIM'e GERİ eklendi — yalnız 1-ball-dom'u (gerçekten
  // daha az kazanır: 38.6W) hafif cezalar, 2-4 nötr. Cetvel: within 0.782→0.783 (+).
  // v3.10: fit.roleFit artık DISPLAY'de synergy'yle harmanlı (bkz. lineupScore.js
  // computeLineupFit) — rating'e o hâliyle girerse affinity01'in aşağıdaki
  // (backtest-kalibreli, 0.15 ağırlıklı) katkısıyla synergy iki kere sayılır.
  // Simülasyon için HER ZAMAN saf ballDomFit'i kullan (yoksa — eski/backtest
  // çağrıları için — roleFit zaten saf, aynı değer).
  let rating = 0.42 * rosterQ
             + 0.18 * starPower
             + 0.28 * (fit?.coverage ?? 0.5)
             + 0.12 * (fit?.ballDomFit ?? fit?.roleFit ?? 1.0);
  if (affinity01 != null) rating += (affinity01 - 0.65) * 0.15;
  rating += coachRatingBonus(coach);
  rating += fx.regular;
  rating -= agePenalty;   // dynasty sezonları: kadro yaşlanır (Faz E)
  return { rating, profiles, benchProfiles, starPower, fresh, fx, benchBalanced: cover.balanced };
}

// ── Rakip modeli + tek maç (S4: cetvele fit edildi) ──────────────────────────
// v3.9: sabit el-yapımı karışım YERİNE self-consistent rakip — rakipler takım
// rating dağılımından (backtest fit) örneklenir. Ortalama takım .500 oynar
// (oto-merkez); k gerçekçi yelpaze verir. Eski k=4.5 + karışım her şeyi
// 30-54W'ye sıkıştırıyordu (cetvel: RMSE 10.0→7.9). NOT: rating formülü değişince
// fit_s4.mjs ile YENİDEN fit et (roleFit geri eklenince μ 0.560→0.679, k=9 kaldı).
export const OPP_MEAN   = 0.682;
export const OPP_STD    = 0.055;
// 2026-08 gerçekçilik denetimi: rosterQ varyans geri-germesiyle (yukarıda)
// birlikte test edildi (12 sezon-koşusu) — 8.5 tek başına dar dağılımı
// yeterince ayrıştırmıyordu (korelasyon 0.62, MAE 8.0). 11.0 + varyans
// geri-germe kombinasyonu en iyi sonucu verdi (korelasyon 0.74, MAE 6.8) —
// bkz. C:\...\scratchpad\variant-test.mjs. PLAYOFF_K ayrı, kendi
// kalibrasyonuyla (aşağıda) KASITLI OLARAK dokunulmadı.
export const LOGISTIC_K = 11.0;
// Playoff serileri regular sezondan daha yumuşak eğimli: gerçek 7-maçlık seriler
// daha çok sürpriz barındırır; k=11 favoriyi kilitleyip şampiyon title%'i ~%44'e
// çıkarıyordu. PLAYOFF_K en iyi takımı NBA-gerçekçi ~%25-30 title'a çeker.
export const PLAYOFF_K  = 9.5;   // sanity: gerçek şampiyonlar ~%27 title (roleFit geri eklenince μ yükseldi → yeniden tune)

// Box-Muller standart normal (0,1)
function randNormal(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Maç günü formu jitter'ı: aynı kadro her koşuda aynı sonucu almaz.
export function playGame(rating, opp, home, rand, k = LOGISTIC_K) {
  const jitter = (rand() - 0.5) * 0.16;
  const diff   = (rating + jitter) - opp + (home ? 0.03 : -0.03);
  return rand() < 1 / (1 + Math.exp(-k * diff));
}

// Rakip = lig dağılımından örnek (self-consistent). Ortalama takım (0.662) → .500.
function sampleOpponent(rand) {
  return Math.max(0.30, Math.min(0.95, OPP_MEAN + OPP_STD * randNormal(rand)));
}

// "Rewrite History": gerçek rakibin win_pct'ini OPP_MEAN/OPP_STD ölçeğine
// z-score ile oturt — yeni sabit icat etmiyoruz, var olan kalibre edilmiş
// dağılıma göreceli konumlandırıyoruz (bkz. plan: 82 maçlık gerçek takvim).
function realOpponentRating(oppWinPct, leagueMeanWinPct, leagueStdWinPct) {
  const std = leagueStdWinPct > 0.01 ? leagueStdWinPct : 0.15;
  const z = (oppWinPct - leagueMeanWinPct) / std;
  return Math.max(0.30, Math.min(0.95, OPP_MEAN + OPP_STD * z));
}

// Playoff rakip modeli (S5): rakip gücü hem TUR'a (survivorlar güçlenir) hem
// SENİN SEED'İNE bağlı. Üst seed erken turlarda daha zayıf rakip görür + daha çok
// ev sahibi olur (bracket avantajı). 1-seed R1'de ~8-seed'le (−0.5σ), 8-seed
// R1'de ~1-seed'le (+3σ, brutal). Finals'te seed önemini yitirir (iki elit takım).
const PLAYOFF_ROUNDS = [
  { key: "R1",   label: "First Round" },
  { key: "SEMI", label: "Conf. Semifinals" },
  { key: "CF",   label: "Conf. Finals" },
  { key: "F",    label: "NBA Finals" },
];
const RB_Z      = [1.2, 1.45, 1.75, 2.15]; // tur bazlı rakip gücü — oyun-hissi için yumuşatıldı (üst seed'ler daha ödüllü)
const SE_Z      = [1.9, 0.9, 0.4, 0.1];    // seed'in rakibi kolaylaştırma etkisi (turla söner)
const HOME_MAX  = [4, 3, 2, 2];            // bu seed'e kadar ev sahibi (üst seed daha çok hosts)
const OPP_Z_CAP = 1.9;   // Cinderella tabanı: alt seed'lere rakip gücü tavanı (6→~%0.6, 8→~%0.2 title)

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

// nGames: 82 varsayılan, ama Rewrite History'de kısaltılmış gerçek sezonlar da
// olabilir (1998-99 lockout 50 maç, 2019-20/21 COVID ~72 maç) — eşikler orantılı
// ölçeklenmezse kısa sezonda playoff'a kalan güçlü bir takım bile seed=8 (en zayıf)
// ya da hiç seed alamaz görünürdü.
function winsToSeed(wins, nGames = 82) {
  const s = nGames / 82;
  if (wins >= 60 * s) return 1;
  if (wins >= 56 * s) return 2;
  if (wins >= 52 * s) return 3;
  if (wins >= 48 * s) return 4;
  if (wins >= 45 * s) return 5;
  if (wins >= 43 * s) return 6;
  if (wins >= 42 * s) return 7;
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

  // Regular season: 82 maç. extras.realSchedule varsa (bkz. api/main.py
  // /api/historical/{season}/team/{abbr}/schedule) rastgele rakip/ev-deplasman
  // yerine GERÇEK takvim kullanılır — "Rewrite History" (bkz. plan dosyası).
  const real = extras.realSchedule;
  const nGames = real ? real.games.length : 82;
  const gameLog = [];        // AYNI KALIYOR (bool dizisi) — SeasonSimPanel'in
                              // filter(Boolean) mantığı objede kırılırdı.
  const gameSchedule = [];   // YENİ, paralel — sadece Rewrite History'de dolu.
  let wins = 0, streak = 0, bestStreak = 0, worstSkid = 0;
  for (let g = 0; g < nGames; g++) {
    const rg = real ? real.games[g] : null;
    // "Tam lig" modu (bkz. leagueSim.js buildLeague): extras.teamRatings doluysa
    // rakibin gücü artık gerçek win_pct'inden DEĞİL, o takımın KENDİ roster'ından
    // (computeTeamRating ile, aynı motorla) türetiliyor — win_pct-proxy sadece
    // teamRatings yoksa (Quick Sim, ya da lig henüz kurulmadıysa) fallback kalıyor.
    const oppRating = rg
      ? (extras.teamRatings?.[rg.opponent] ?? realOpponentRating(rg.opp_win_pct, real.league_mean_win_pct, real.league_std_win_pct))
      : sampleOpponent(rand);
    const isHome = rg ? rg.is_home : (g % 2 === 0);
    const won = playGame(effRating, oppRating, isHome, rand);
    gameLog.push(won);
    if (rg) {
      gameSchedule.push({
        gameNum: rg.game_num, date: rg.date, opponent: rg.opponent, isHome,
        won, realTeamPts: rg.team_pts, realOppPts: rg.opp_pts,
      });
    }
    if (won) {
      wins++;
      streak = streak > 0 ? streak + 1 : 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = streak < 0 ? streak - 1 : -1;
      worstSkid = Math.min(worstSkid, streak);
    }
  }
  const losses = nGames - wins;

  // Playooff kalifikasyonu: %50+ (eraball kuralı). nGames'e ORANTILI —
  // Rewrite History'de kısaltılmış gerçek sezonlar da olabilir (1998-99 lockout
  // 50 maç, 2019-20/2020-21 COVID ~72 maç) — sabit 41 o sezonlarda yanlış olurdu.
  const madePlayoffs = wins >= Math.ceil(nGames / 2);
  const seed = madePlayoffs ? winsToSeed(wins, nGames) : null;

  // Playoff koşusu: yıldız gücü + koç DNA'sı + yüzükler + taze bacaklar (Faz D)
  const playoffRating = 0.82 * effRating + 0.18 * starPower
                      + coachPlayoffBonus(coach) + (fx?.playoff ?? 0) + (fresh ?? 0);
  const playoffRounds = [];
  let champion = false;
  if (madePlayoffs) {
    for (let r = 0; r < PLAYOFF_ROUNDS.length; r++) {
      const round = PLAYOFF_ROUNDS[r];
      // Seed-duyarlı rakip (S5): üst seed erken turlarda daha zayıf rakip görür.
      const seedAdv = (4.5 - seed) / 3.5;   // +1 (1-seed) .. −1 (8-seed)
      const oppZ = Math.max(-1.0, Math.min(OPP_Z_CAP, RB_Z[r] - SE_Z[r] * seedAdv));
      const opp = clamp01(OPP_MEAN + OPP_STD * oppZ + (rand() - 0.5) * 0.05);
      const homeAdv = r === 3 ? (seed <= 2 || rand() < 0.5) : seed <= HOME_MAX[r];
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
function computeSeasonAwards({ profiles, benchProfiles, players, bench, wins, champion, realGames, isRH }, rand) {
  const factor = prof => prof ? prof.simQuality / Math.max(0.35, prof.overall) : 1;
  const line = (pl, prof, isBench) => {
    // Dakika payı: 35dk taban — 25dk'lık 6th man üretimin ~%71'ini, 12dk'lık ~%34'ünü verir
    const mShare = Math.min(1.15, (prof.minutes ?? (isBench ? 13 : 35)) / 35);
    if (realGames && realGames.length) {
      // "Rewrite History": sabit tek-seferlik formül YERİNE gerçek takvimdeki
      // HER maçı ayrı ayrı simüle edip ortalamasını alıyoruz — maç-maç varyans
      // (±18%, galibiyet/mağlubiyete hafif duyarlı) katıyor. Kullanıcı şikayeti:
      // box score'lar "gerçek istatistiğin sabit çarpanla yapıştırılmış hâli"
      // gibi hissettiriyordu (rastgelelik yok) — bu onu kökten çözüyor.
      const sums = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
      for (const g of realGames) {
        const noise = 1 + (rand() - 0.5) * 0.36 + (g.won ? 0.025 : -0.025);
        const f = factor(prof) * mShare * noise;
        sums.pts += Math.max(0, parseFloat(pl.PTS || 0)) * f;
        sums.reb += Math.max(0, parseFloat(pl.REB || 0)) * f;
        sums.ast += Math.max(0, parseFloat(pl.AST || 0)) * f;
        sums.stl += Math.max(0, parseFloat(pl.STL || 0)) * f;
        sums.blk += Math.max(0, parseFloat(pl.BLK || 0)) * f;
      }
      const n = realGames.length;
      return {
        name:  prof.name,
        min:   prof.minutes ?? (isBench ? 13 : 35),
        pts: +(sums.pts / n).toFixed(1), reb: +(sums.reb / n).toFixed(1), ast: +(sums.ast / n).toFixed(1),
        stl: +(sums.stl / n).toFixed(1), blk: +(sums.blk / n).toFixed(1),
        fg3: pl.FG3_PCT != null && !isNaN(+pl.FG3_PCT) ? Math.round(+pl.FG3_PCT * 100) : null,
        q:     prof.simQuality,
        bench: isBench,
      };
    }
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

  // S7: ödüller SİMÜLE box-line'a dayanır (sabit q-eşiği + rastgele zar yerine
  // üretim-tabanlı bar). MVP adaylığı = skor + all-around; DPOY = savunma
  // üretimi (STL/BLK) + savunma arketibi. Böylece 30/8/7'lik bir sezon MVP çeker.
  const mvpScore = l => l.pts + 0.45 * (l.ast + l.reb);
  const mvpBest = starterLines.reduce((a, b) => (mvpScore(b) > mvpScore(a) ? b : a), starterLines[0]);

  // League MVP: elit üretim + iyi takım (bar ~30 eşdeğer, galibiyetle artar)
  if (mvpBest && wins >= 50) {
    const odds = Math.min(0.88, (mvpScore(mvpBest) - 30) * 0.06 + (wins - 50) * 0.015);
    if (rand() < odds) awards.push(`🏅 League MVP — ${mvpBest.name}`);
  }
  // All-NBA / All-Star: kalite tabanlı tier seçimi
  for (const l of starterLines) {
    if (l.q >= 0.80)      awards.push(`🌟 All-NBA — ${l.name}`);
    else if (l.q >= 0.70) awards.push(`⭐ All-Star — ${l.name}`);
  }
  // DPOY: simüle savunma üretimi (STL + BLK) + savunma arketibi + takım başarısı
  const dpoyScore = (l, i) => l.stl + l.blk * 1.5
    + Math.max(parseFloat(players[i]["score_Anchor"] || 0), parseFloat(players[i]["score_Stopper"] || 0),
               parseFloat(players[i]["score_Two-Way"] || 0)) * 3.0;
  let dBest = 0;
  for (let i = 1; i < starterLines.length; i++)
    if (dpoyScore(starterLines[i], i) > dpoyScore(starterLines[dBest], dBest)) dBest = i;
  if (starterLines.length && wins >= 46) {
    const odds = Math.min(0.75, (dpoyScore(starterLines[dBest], dBest) - 4.2) * 0.14 + (wins - 46) * 0.01);
    if (rand() < odds) awards.push(`🛡 Defensive POY — ${starterLines[dBest].name}`);
  }
  // 6th Man: en iyi bench (üretim-tabanlı); gerçek 6MOY tag'i şansı artırır
  if (benchLines.length) {
    const b6 = benchLines.reduce((a, b) => (mvpScore(b) > mvpScore(a) ? b : a), benchLines[0]);
    const hasTag = benchProfiles.find(p => p.name === b6.name)?.sixth;
    if (mvpScore(b6) >= 14 && rand() < (hasTag ? 0.72 : 0.32))
      awards.push(`🔥 Sixth Man of the Year — ${b6.name}`);
  }
  // Finals MVP: şampiyonlukta en iyi üretim — RH'de gösterilmez, çünkü buradaki
  // `champion` her zaman İÇ SENTETİK Quick-Sim playoff'undan gelir (RH kullanıcıya
  // hiç göstermediği bir playoff), gerçek bracket'in Finals MVP'si ayrı yerde
  // (playoffBracket.js seriesMVP / ChampionModal) hesaplanıyor.
  if (!isRH && champion && mvpBest) awards.push(`🏆 Finals MVP — ${mvpBest.name}`);

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
    { profiles, benchProfiles, players, bench: extras.bench || [], wins, champion, realGames: gameSchedule, isRH: !!real },
    rand,
  );

  return {
    simEra, rating, playoffRating, profiles, benchProfiles, coach, starPower,
    tagNotes: fx?.notes ?? [], benchBalanced,
    statLines, awards,
    gameLog, gameSchedule, realTeam: real?.team ?? null, realSeason: real?.season ?? null,
    wins, losses,
    bestStreak, worstSkid: Math.abs(worstSkid),
    madePlayoffs, seed,
    playoffRounds, champion,
    playoffGameWins, seasonScore,
    resultKey, resultLabel: RESULT_LABEL[resultKey],
  };
}

// ── Faz B: "tam lig" organik ödülleri ────────────────────────────────────────
// computeSeasonAwards'ın TEK takımlık formüllerini (mvpScore/dpoyScore, AYNEN
// reuse) 30 takımın havuzuna genelleştirir — League MVP/All-NBA/All-Star/DPOY/
// 6MOY artık gerçekten simüle edilmiş 30 roster arasından çıkıyor, tek bir
// takımın 9 oyuncusundan değil (bkz. plan). teams: [{abbr, players, bench,
// statLines, wins}, ...] — statLines sırası [...players,...bench] ile
// birebir aynı (computeSeasonAwards'ın starterLines+benchLines deseni).
export function computeLeagueAwards(teams) {
  const mvpScore = l => l.pts + 0.45 * (l.ast + l.reb);
  const pool = [];
  for (const t of teams) {
    const roster = [...(t.players || []), ...(t.bench || [])];
    (t.statLines || []).forEach((l, i) => {
      pool.push({ line: l, teamAbbr: t.abbr, wins: t.wins || 0, raw: roster[i] || {} });
    });
  }
  if (!pool.length) return [];

  const leagueAwards = [];
  // League MVP: üretim + hafif takım-başarısı ağırlığı (gerçek MVP oylamasının
  // "iyi takım" eğilimini yansıtır, ama saf skor egemen kalır).
  const mvpBest = pool.reduce((a, b) =>
    (mvpScore(b.line) + b.wins * 0.15) > (mvpScore(a.line) + a.wins * 0.15) ? b : a, pool[0]);
  leagueAwards.push({ label: "League MVP", icon: "🏅", name: mvpBest.line.name, team: mvpBest.teamAbbr });

  // All-NBA (top-5) — sadece starter'lar arasından. All-Star kasıtlı olarak
  // yok: 30 takımlık havuzda 10 kişilik ek liste "Season Awards"ı gereksiz
  // kalabalıklaştırıyordu.
  const starters = pool.filter(p => !p.line.bench).sort((a, b) => mvpScore(b.line) - mvpScore(a.line));
  starters.slice(0, 5).forEach(p => leagueAwards.push({ label: "All-NBA", icon: "🌟", name: p.line.name, team: p.teamAbbr }));

  // DPOY: aynı savunma-üretim formülü (STL+BLK ağırlıklı + savunma arketibi)
  const dpoyScore = p => {
    const l = p.line, raw = p.raw;
    return l.stl + l.blk * 1.5 + Math.max(
      parseFloat(raw["score_Anchor"] || 0), parseFloat(raw["score_Stopper"] || 0), parseFloat(raw["score_Two-Way"] || 0),
    ) * 3.0;
  };
  const dBest = pool.reduce((a, b) => (dpoyScore(b) > dpoyScore(a) ? b : a), pool[0]);
  leagueAwards.push({ label: "Defensive POY", icon: "🛡", name: dBest.line.name, team: dBest.teamAbbr });

  // 6th Man: sadece bench havuzundan
  const benchPool = pool.filter(p => p.line.bench);
  if (benchPool.length) {
    const b6 = benchPool.reduce((a, b) => (mvpScore(b.line) > mvpScore(a.line) ? b : a), benchPool[0]);
    leagueAwards.push({ label: "Sixth Man of the Year", icon: "🔥", name: b6.line.name, team: b6.teamAbbr });
  }

  return leagueAwards;
}
