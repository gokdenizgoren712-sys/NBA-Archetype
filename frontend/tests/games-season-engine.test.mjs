/* Games Faz 2 — sezon motoru (src/game/seasonRun.js).
   Web paneli ve RankIt uygulaması aynı sezonu oynuyor: rotasyon editörü,
   Quick Sim, Rewrite History, gerçek bracket, dynasty ve skor tablosuna
   yazılan sezon sonucu burada sahte saat + sahte ağ ile sürülür. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("../../scripts/resolve-extless.mjs", import.meta.url);
const { createSeasonRun, deriveSeason, seasonsInEra, minuteBankOf } = await import("../src/game/seasonRun.js");
const { BASE_MINUTES } = await import("../src/game/seasonSim.js");
const { computeLineupFit } = await import("../src/game/lineupScore.js");
const { ERAS } = await import("../src/game/eras.js");

const SMALL_BALL = ERAS.find((e) => e.id === "small_ball");
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function fakeClock() {
  let now = 0, seq = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; q.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => q.delete(id),
    pending: () => q.size,
    async runAll(limit = 100000) {
      for (let i = 0; i < limit && q.size; i++) {
        const [id, t] = [...q.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        q.delete(id); now = t.at; t.fn();
      }
      await flush();
    },
  };
}

// Güçlü, gerçekçi alanlı dokuz kişilik kadro
const ARCH = ["Engine", "Spacer", "Stopper", "Anchor", "Finisher", "Ecosystem", "Force", "Hub", "Creator"];
const POS = ["PG", "SG", "SF", "PF", "C", "PG", "SF", "C", "SG"];
const nine = ARCH.map((a, i) => ({
  PLAYER_NAME: `P${i}`, POS5: POS[i], primary_arch: a, overall_score: 0.8 - i * 0.02,
  _season: "2016-17", _assignedPos: POS[i], [`score_${a}`]: 0.92, MIN: 32 - i,
}));
const starters = nine.slice(0, 5);
const bench = nine.slice(5);
const fit = computeLineupFit(starters, SMALL_BALL, null);

function schedule(season = "2015-16", team = "GSW", n = 20) {
  return {
    season, team, wins: 73, losses: 9, league_mean_win_pct: 0.5, league_std_win_pct: 0.15,
    games: Array.from({ length: n }, (_, g) => ({
      game_num: g + 1, date: `2015-11-${String(g + 1).padStart(2, "0")}`, opponent: g % 2 ? "SAS" : "CLE",
      is_home: g % 2 === 0, opp_win_pct: 0.5, team_pts: 110, opp_pts: 100,
    })),
  };
}

function setup({ inputs = {}, buildLeague, fetchJson } = {}) {
  const clock = fakeClock();
  const posts = [];
  const guest = [];
  const engine = createSeasonRun({
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    postJson: async (url, body, token) => { posts.push({ url, body, token }); return { ok: true }; },
    fetchJson: fetchJson || (async (url) => {
      if (/\/api\/historical\/[^/]+\/teams$/.test(url)) return { teams: [{ abbr: "GSW", wins: 73, losses: 9 }, { abbr: "SAS", wins: 67, losses: 15 }] };
      const m = url.match(/\/api\/historical\/([^/]+)\/team\/([^/]+)\/schedule$/);
      if (m) return schedule(m[1], m[2]);
      throw new Error(`unexpected ${url}`);
    }),
    buildLeague: buildLeague || (async () => { throw new Error("offline"); }),
  }, {
    players: starters, bench, simEra: SMALL_BALL, fit, affinity01: null, coach: null,
    gameScoreId: 7, isLoggedIn: true, token: "tok", onGuestResult: (b) => guest.push(b), ...inputs,
  });
  engine.actions.init();
  return { engine, clock, posts, guest, s: () => engine.getState(), d: () => deriveSeason(engine.getState(), engine.getInputs()) };
}

test("başlangıç: 9 kişilik taban dakikalar, dönemin gerçek sezonları", () => {
  const { s, d } = setup();
  assert.deepEqual(s().minutes, BASE_MINUTES);
  assert.equal(d().minuteBank, 0);
  assert.equal(s().stage, "idle");
  assert.equal(s().simMode, "quick");
  assert.deepEqual(seasonsInEra(SMALL_BALL, 2026), ["2014-15", "2015-16", "2016-17", "2017-18", "2018-19", "2019-20"]);
  assert.deepEqual(seasonsInEra(ERAS.find((e) => e.id === "parity"), 2026), ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"].slice(0, 6));
});

test("rotasyon: 240 dakika dolu iken artırılamaz, taban ±5 ve en az 6", () => {
  const { engine, s } = setup();
  engine.actions.bumpMinute(0, 1);
  assert.equal(s().minutes[0], 35);             // banka boş
  engine.actions.bumpMinute(0, -1);
  assert.equal(minuteBankOf(s().minutes), 1);
  engine.actions.bumpMinute(1, 1);
  assert.equal(s().minutes[1], 36);
  for (let i = 0; i < 10; i++) engine.actions.bumpMinute(5, -1);
  assert.equal(s().minutes[5], 20);             // 25 − 5
  for (let i = 0; i < 10; i++) engine.actions.bumpMinute(8, -1);
  assert.equal(s().minutes[8], 7);              // max(6, 12 − 5)
  for (let i = 0; i < 20; i++) engine.actions.bumpMinute(0, 1);
  assert.equal(s().minutes[0], 40);             // 35 + 5, banka yetse bile
});

test("Quick Sim: akış → done; ilk koşunun sonucu skor tablosuna, aynı satıra", async () => {
  const { engine, clock, posts, s, d } = setup();
  await engine.actions.run();
  assert.equal(s().stage, "regular");
  assert.equal(s().runCount, 1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "/api/game/season-result");
  assert.equal(posts[0].token, "tok");
  assert.equal(posts[0].body.game_id, 7);
  assert.equal(posts[0].body.season_result, s().result.resultKey);
  assert.equal(posts[0].body.wins, s().result.wins);
  assert.equal(posts[0].body.sim_era, "small_ball");
  await clock.runAll();
  assert.equal(s().stage, "done");
  assert.equal(s().revealGames, 82);
  assert.equal(d().shownWins + d().shownLosses, 82);
  // ikinci koşu ("Run It Back") yeni dynasty başlatır ama tabloya yazmaz
  await engine.actions.run();
  assert.equal(posts.length, 1);
});

test("misafir: sonuç ağa değil onGuestResult'a; noSave: hiçbir yere", async () => {
  let ctx = setup({ inputs: { isLoggedIn: false, token: null } });
  await ctx.engine.actions.run();
  assert.equal(ctx.posts.length, 0);
  assert.equal(ctx.guest.length, 1);
  assert.equal(ctx.guest[0].season_result, ctx.s().result.resultKey);
  ctx = setup({ inputs: { noSave: true } });
  await ctx.engine.actions.run();
  assert.equal(ctx.posts.length + ctx.guest.length, 0);
});

test("Skip to the end: akış atlanır, sonuç değişmez, sonrası bir kez çalışır", async () => {
  const { engine, clock, s } = setup();
  await engine.actions.run();
  const wins = s().result.wins;
  engine.actions.skipReveal();
  assert.equal(s().stage, "done");
  assert.equal(s().revealGames, 82);
  assert.equal(s().result.wins, wins);
  assert.equal(clock.pending(), 0);
  engine.actions.skipReveal();
  assert.equal(s().stage, "done");
});

test("dynasty: savunma yılı ilerletir, sonuç tabloya yalnız REPEAT/THREEPEAT ile yükselir", async () => {
  const { engine, clock, posts, s } = setup();
  await engine.actions.run();
  await clock.runAll();
  await engine.actions.defend();
  await clock.runAll();
  assert.equal(s().dynasty.year, 2);
  const titles = s().dynasty.titles;
  const upgrade = posts.slice(1).map((p) => p.body.season_result);
  if (titles === 2) assert.deepEqual(upgrade, ["REPEAT"]);
  else assert.deepEqual(upgrade, []);
});

test("Rewrite History: sezon → takım → program; lig kurulurken ilerleme, eksik ligde uyarı", async () => {
  const progress = [];
  const buildLeague = async (season, team, era, { onProgress }) => {
    progress.push([season, team, era.id]);
    onProgress(12, 29);
    return { teamRatings: {}, teamSeasons: {}, rosterByAbbr: {}, teamsExpected: 29, teamsBuilt: 10 };
  };
  const { engine, clock, s, d, posts } = setup({ buildLeague });
  engine.actions.setSimMode("history");
  assert.equal(d().rhActive, true);
  engine.actions.pickRhSeason("2015-16");
  assert.equal(s().rhLoading, true);
  await flush();
  assert.equal(s().rhStep, "team");
  assert.equal(s().rhTeams.length, 2);
  engine.actions.pickRhTeam("GSW");
  await flush();
  assert.equal(s().rhStep, "ready");
  assert.equal(s().rhSchedule.team, "GSW");
  await engine.actions.run();
  assert.deepEqual(progress, [["2015-16", "GSW", "small_ball"]]);
  assert.deepEqual(s().leagueProgress, { built: 12, total: 29 });
  assert.equal(s().leagueLoading, false);
  assert.match(s().leagueWarning, /^Only 10 of 29 teams built successfully/);
  assert.equal(s().result.gameLog.length, 20);           // gerçek programın uzunluğu
  assert.equal(s().result.gameSchedule.length, 20);
  // RH'de şampiyonluk bracket'ten; sentetik sonuç yazılmaz (yalnız MISSED kesin)
  assert.equal(s().dynasty.titles, 0);
  assert.deepEqual(posts.map((p) => p.body.season_result), s().result.madePlayoffs ? [] : ["MISSED"]);
  await clock.runAll();
  assert.equal(d().shownRealWins, 20);                     // gerçek GSW her maçı 110–100 aldı
});

test("Rewrite History: lig kurulamazsa açık uyarı, sezon yine gerçek programla oynanır", async () => {
  const { engine, s } = setup();
  engine.actions.setSimMode("history");
  engine.actions.pickRhSeason("2015-16");
  await flush();
  engine.actions.pickRhTeam("SAS");
  await flush();
  await engine.actions.run();
  assert.match(s().leagueWarning, /^Couldn't build the rest of the league/);
  assert.equal(s().result.realTeam ?? s().rhSchedule.team, "SAS");
  assert.equal(s().result.gameLog.length, 20);
});

test("gerçek bracket: kullanıcının takımı şampiyonsa rhTitleWon; sonuç yıl 1'de bir kez yazılır", async () => {
  const { engine, clock, s, posts } = setup();
  engine.actions.setSimMode("history");
  engine.actions.pickRhSeason("2015-16");
  await flush();
  engine.actions.pickRhTeam("GSW");
  await flush();
  await engine.actions.run();
  await clock.runAll();
  const before = posts.length;
  const series = (a, b, winner, round) => ({ teamA: { abbr: a }, teamB: { abbr: b }, winner: winner ? { abbr: winner } : null, round });
  engine.actions.updateBracket({ rounds: [[series("GSW", "HOU", null, "R1")]], champion: null });
  await flush();
  assert.equal(posts.length, before);                     // seri sürüyor — karar yok
  const done = { rounds: [[series("GSW", "HOU", "GSW", "R1")], [series("GSW", "POR", "GSW", "SEMI")], [series("GSW", "OKC", "GSW", "CF")], [series("GSW", "CLE", "GSW", "F")]], champion: { abbr: "GSW" } };
  engine.actions.updateBracket(done);
  await flush();
  assert.equal(s().rhTitleWon, true);
  assert.equal(posts.length, before + 1);
  assert.equal(posts.at(-1).body.season_result, "CHAMPION");
  assert.equal(posts.at(-1).body.real_team, "GSW");
  engine.actions.updateBracket(done);
  await flush();
  assert.equal(posts.length, before + 1);                 // ikinci kez yazılmaz
});

test("sabit sezon (Board Challenge): takımlar açılışta yüklenir, rakip takım listede yok", async () => {
  const { s, d } = setup({ inputs: { fixedSeason: "2015-16", excludeTeam: "SAS" } });
  assert.equal(s().simMode, "history");
  assert.equal(s().rhStep, "team");
  await flush();
  assert.deepEqual(d().visibleRhTeams.map((t) => t.abbr), ["GSW"]);
});

test("dispose: bekleyen akış durur, geç gelen cevap durumu bozmaz", async () => {
  const { engine, clock, s } = setup();
  await engine.actions.run();
  engine.actions.dispose();
  assert.equal(clock.pending(), 0);
  engine.actions.pickRhSeason("2015-16");
  engine.actions.dispose();
  await flush();
  assert.notEqual(s().rhStep, "team");
});

test("buildLeague: ilerleme bildirir; tam lig önbelleğe girer, eksik lig girmez", async () => {
  const { buildLeague, clearLeagueCache } = await import("../src/game/leagueSim.js");
  const realFetch = globalThis.fetch;
  let calls = 0;
  let broken = null;
  const teams = ["BOS", "CLE", "SAS", "TOR", "OKC", "LAC", "MIA", "ATL"];
  globalThis.fetch = async (url) => {
    calls++;
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
    if (/\/teams$/.test(url)) return ok({ teams: [{ abbr: "GSW" }, ...teams.map((abbr) => ({ abbr }))] });
    const p = url.match(/\/api\/game\/players\?season=([^&]+)&team=(.+)$/);
    if (p) return ok({ players: p[2] === broken ? [] : nine.map((x) => ({ ...x, PLAYER_NAME: `${p[2]} ${x.PLAYER_NAME}` })) });
    const sc = url.match(/\/team\/([^/]+)\/schedule$/);
    if (sc) return ok(schedule("2015-16", sc[1], 10));
    throw new Error(url);
  };
  try {
    clearLeagueCache();
    const progress = [];
    const a = await buildLeague("2015-16", "GSW", SMALL_BALL, { onProgress: (b, t) => progress.push([b, t]) });
    assert.equal(a.teamsExpected, 8);
    assert.equal(a.teamsBuilt, 8);
    assert.deepEqual(progress, [[0, 8], [6, 8], [8, 8]]);
    const after = calls;
    const b = await buildLeague("2015-16", "GSW", SMALL_BALL);
    assert.equal(calls, after);                       // önbellekten
    assert.equal(b.teamsBuilt, 8);
    // eksik lig önbelleğe girmez: bir sonraki çağrı yeniden çeker
    clearLeagueCache();
    broken = "MIA";
    const c = await buildLeague("2014-15", "GSW", SMALL_BALL);
    assert.equal(c.teamsBuilt, 7);
    const mid = calls;
    await buildLeague("2014-15", "GSW", SMALL_BALL);
    assert.ok(calls > mid);
  } finally {
    globalThis.fetch = realFetch;
    clearLeagueCache();
  }
});
