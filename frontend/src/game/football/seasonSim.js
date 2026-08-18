// Futbol sezon simülasyonu — kurduğun XI'i gerçek bir ligde 38 maç oynatır.
//
// BASKETBOL TARAFINDAN FARKI
// ──────────────────────────
// game/seasonSim.js katsayılarını elle seçiyor (o tarafta başka çare yok:
// kullanıcının kurduğu beşlinin gerçek bir maç kaydı yok). Futbolda var —
// aynı sezonun 2245 gerçek ilk-11'i, hem bizim kimya/kalite girdimiz hem
// gerçek gol çıktısıyla. Bu yüzden buradaki katsayılar UYDURULMADI,
// src/football/calibrate_sim.py ile o maçlardan regresyonla çıkarıldı ve
// data/football__sim_coeffs.json'dan API üzerinden geliyor.
//
// Gol dağılımının Poisson olduğu da varsayılmadı, ölçüldü: ortalama 1.32 /
// varyans 1.27, gözlenen frekanslar Poisson beklentisiyle neredeyse birebir.
//
// DÜRÜSTLÜK: kimyanın katsayısı kalitenin ~1/4'ü, ve kalite kontrol edilince
// kimyanın R²'ye katkısı ~0.001. Yani bu simülasyon "iyi kimya maç kazandırır"
// demiyor; ölçülen kadarını veriyor. UI de bunu böyle söylüyor.

// ── Tohumlanabilir RNG (mulberry32) — aynı tohum aynı sezonu verir ──────────
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Knuth'un çarpım yöntemi — lambda küçük (futbolda <4), fazlası gereksiz.
function poisson(lambda, rand) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

function lambdaFor(c, quality, chemistry, oppQuality, isHome) {
  return Math.max(
    c.floor,
    c.const + c.quality * quality + c.chemistry * chemistry +
      c.opp_quality * oppQuality + c.home * (isHome ? 1 : 0)
  );
}

/** Tek maç: iki tarafın gol sayısı. */
export function playMatch(coeffs, home, away, rand) {
  const f = coeffs.goals_for, a = coeffs.goals_against;
  const floor = coeffs.lambda_floor ?? 0.15;
  const cf = { ...f, floor }, ca = { ...a, floor };

  // Ev sahibinin attığı gol iki yoldan tahmin edilebilir: kendi hücumundan
  // (goals_for) ve rakibin savunmasından (goals_against). İkisinin ortalaması
  // tek başına birine güvenmekten daha kararlı — iki regresyon da aynı veriden
  // geliyor ve neredeyse antisimetrik, ortalamak gürültüyü azaltıyor.
  const hFor = lambdaFor(cf, home.quality, home.chemistry, away.quality, true);
  const hAgainstAway = lambdaFor(ca, away.quality, away.chemistry, home.quality, false);
  const aFor = lambdaFor(cf, away.quality, away.chemistry, home.quality, false);
  const aAgainstHome = lambdaFor(ca, home.quality, home.chemistry, away.quality, true);

  const lh = Math.max(floor, (hFor + hAgainstAway) / 2);
  const la = Math.max(floor, (aFor + aAgainstHome) / 2);
  return { hg: poisson(lh, rand), ag: poisson(la, rand), lh, la };
}

// ── Fikstür: çift devreli lig ────────────────────────────────────────────────
// Berger tablosu (circle method) — her takım herkesle ikişer kez, ev/deplasman
// dengeli. Gerçek takvim sırası değil ama maç kümesi birebir aynı; puan
// tablosu takvim sırasından etkilenmiyor.
export function buildFixtures(teamIds) {
  const ids = [...teamIds];
  if (ids.length % 2) ids.push(null); // bay
  const n = ids.length, rounds = n - 1, half = n / 2;
  const first = [];
  let arr = ids.slice(1);
  for (let r = 0; r < rounds; r++) {
    const round = [];
    const line = [ids[0], ...arr];
    for (let i = 0; i < half; i++) {
      const h = line[i], a = line[n - 1 - i];
      if (h == null || a == null) continue;
      // Tur numarasına göre ev/deplasman çevir — tek takımın hep evde
      // başlamasını engeller.
      round.push(r % 2 ? [a, h] : [h, a]);
    }
    first.push(round);
    arr = [arr[arr.length - 1], ...arr.slice(0, -1)];
  }
  // İkinci devre: aynı eşleşmeler ters saha
  const second = first.map((round) => round.map(([h, a]) => [a, h]));
  return [...first, ...second];
}

const EMPTY = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

// ── Golü oyunculara dağıtma ─────────────────────────────────────────────────
// Takımın attığı gol sayısı yukarıdaki kalibre modelden geliyor; KİMİN attığı
// oyuncuların gerçek goals_90 payına göre çekiliyor. Yani gol toplamı modele,
// dağılımı gerçek sezonun verisine sadık kalıyor: Haaland'ın payı Rice'ınkinden
// büyük çünkü ölçülen goals_90'ı büyük, elle atanmış bir "forvet katsayısı"
// değil. goals_90 hiç yoksa (eski sezonlarda boş olabiliyor) faza göre
// makul bir taban kullanılıyor, aksi hâlde kimse gol atamaz.
const FALLBACK_G = { fwd: 0.35, mid: 0.10, def: 0.04, gk: 0.0 };
const FALLBACK_A = { fwd: 0.20, mid: 0.16, def: 0.07, gk: 0.0 };

function weights(players, key, fallback) {
  const w = players.map((p) => {
    const v = Number(p[key]);
    return Number.isFinite(v) && v > 0 ? v : (fallback[p.PHASE] ?? 0.05);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  return sum > 0 ? w.map((x) => x / sum) : w.map(() => 1 / Math.max(1, w.length));
}

function pick(cum, rand) {
  const r = rand();
  for (let i = 0; i < cum.length; i++) if (r <= cum[i]) return i;
  return cum.length - 1;
}

function cumulative(w) {
  const c = []; let s = 0;
  for (const x of w) { s += x; c.push(s); }
  return c;
}

/**
 * Tam sezon.
 * @param you    {name, quality, chemistry} — kullanıcının XI'i
 * @param clubs  [{team, quality, chemistry}] — rakipler (aynı ligden)
 * @param coeffs API'den gelen kalibre katsayılar
 * @param opts   {seed, replaceTeam} — replaceTeam verilirse o kulüp yerine
 *               geçersin (lig 20 takım kalır); verilmezse lig 21 takım olur.
 */
export function simulateSeason(you, clubs, coeffs, opts = {}) {
  const rand = makeRng(opts.seed ?? ((Math.random() * 1e9) | 0));
  const YOU = "__you__";

  let pool = clubs.filter((c) => c.team !== opts.replaceTeam);
  const teams = { [YOU]: { ...you, team: YOU, isYou: true } };
  pool.forEach((c) => { teams[c.team] = c; });

  const ids = Object.keys(teams);
  const fixtures = buildFixtures(ids);

  const table = {};
  ids.forEach((id) => { table[id] = EMPTY(); });
  const yourMatches = [];

  // Oyuncu istatistikleri yalnızca SENİN kadron için tutuluyor — rakip
  // kulüplerin oyuncu listesi zaten elimizde yok, sadece takım gücü var.
  const squad = (you.players || []).filter((p) => p && p.PHASE !== "gk");
  const keeper = (you.players || []).find((p) => p && p.PHASE === "gk") || null;
  const gCum = squad.length ? cumulative(weights(squad, "goals_90", FALLBACK_G)) : null;
  const aCum = squad.length ? cumulative(weights(squad, "assists_90", FALLBACK_A)) : null;
  const stat = {};
  (you.players || []).forEach((p) => {
    stat[p.PLAYER_NAME] = { name: p.PLAYER_NAME, phase: p.PHASE, pos: p.POSITION,
                            arch: p.primary_arch, goals: 0, assists: 0, cs: 0 };
  });

  fixtures.forEach((round, ri) => {
    round.forEach(([hid, aid]) => {
      const { hg, ag } = playMatch(coeffs, teams[hid], teams[aid], rand);
      [[hid, hg, ag], [aid, ag, hg]].forEach(([id, gf, ga]) => {
        const t = table[id];
        t.p++; t.gf += gf; t.ga += ga;
        const r = gf > ga ? "W" : gf === ga ? "D" : "L";
        t[r.toLowerCase()]++;
        t.pts += r === "W" ? 3 : r === "D" ? 1 : 0;
        t.form.push(r);
      });
      if (hid === YOU || aid === YOU) {
        const home = hid === YOU;
        const gf = home ? hg : ag, ga = home ? ag : hg;
        yourMatches.push({
          round: ri + 1,
          opponent: teams[home ? aid : hid].team,
          home, gf, ga,
          result: gf > ga ? "W" : gf === ga ? "D" : "L",
        });
        // Gol atanları çek; asisti golün ~%70'ine ver (gerçek futbolda her
        // gol asistli değil — solo goller, ikinci toplar, kendi kaleye).
        for (let g = 0; g < gf && gCum; g++) {
          const scorer = squad[pick(gCum, rand)];
          if (scorer) stat[scorer.PLAYER_NAME].goals++;
          if (rand() < 0.7) {
            const assister = squad[pick(aCum, rand)];
            if (assister && assister.PLAYER_NAME !== scorer?.PLAYER_NAME)
              stat[assister.PLAYER_NAME].assists++;
          }
        }
        if (ga === 0 && keeper) stat[keeper.PLAYER_NAME].cs++;
      }
    });
  });

  const standings = ids
    .map((id) => ({
      team: id === YOU ? you.name || "Your XI" : id,
      isYou: id === YOU,
      ...table[id],
      gd: table[id].gf - table[id].ga,
      form: table[id].form.slice(-5),
    }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    .map((r, i) => ({ ...r, pos: i + 1 }));

  const me = standings.find((s) => s.isYou);
  const players = Object.values(stat)
    .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals);
  return {
    standings,
    you: me,
    matches: yourMatches,
    players,
    // Ödüller kadronun İÇİNDEN — rakip kulüplerin oyuncu listesi yok, o yüzden
    // "lig gol kralı" diyemeyiz, "senin gol kralın" diyebiliriz. Abartmamak için
    // isimlendirme de öyle.
    awards: {
      topScorer: players.filter((p) => p.goals > 0)[0] || null,
      topAssists: [...players].sort((a, b) => b.assists - a.assists)
        .filter((p) => p.assists > 0)[0] || null,
      keeper: keeper ? stat[keeper.PLAYER_NAME] : null,
    },
    champion: standings[0],
    seed: opts.seed,
  };
}

/**
 * Aynı kadroyu N kez oynatır — tek sezon futbolda çok gürültülü (maç başına
 * R²=0.14), tek bir 38 maçlık koşu şans eseri 5 sıra kayabilir. Dağılım
 * göstermek tek sonuç göstermekten dürüst.
 */
export function simulateMany(you, clubs, coeffs, runs = 200, opts = {}) {
  const positions = [];
  const points = [];
  let titles = 0, top4 = 0, relegated = 0;
  const n = clubs.filter((c) => c.team !== opts.replaceTeam).length + 1;

  for (let i = 0; i < runs; i++) {
    const r = simulateSeason(you, clubs, coeffs, { ...opts, seed: (opts.seed ?? 1) + i * 7919 });
    positions.push(r.you.pos);
    points.push(r.you.pts);
    if (r.you.pos === 1) titles++;
    if (r.you.pos <= 4) top4++;
    if (r.you.pos > n - 3) relegated++;
  }
  const sorted = [...positions].sort((a, b) => a - b);
  const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    runs,
    medianPos: pct(0.5),
    bestPos: sorted[0],
    worstPos: sorted[sorted.length - 1],
    p10: pct(0.1),
    p90: pct(0.9),
    meanPts: points.reduce((a, b) => a + b, 0) / runs,
    titlePct: titles / runs,
    top4Pct: top4 / runs,
    relegationPct: relegated / runs,
    positions,
  };
}
