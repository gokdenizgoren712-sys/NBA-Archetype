/* Games Faz 2 — Lineup Builder motoru (src/game/lineupDraft.js).
   Web sayfası ve RankIt uygulaması aynı motoru kullanıyor; kurallar burada
   sahte saat + sahte ağ ile uçtan uca sürülür. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Oyun modülleri Vite için uzantısız import ediyor; backtest.mjs'in çözümleyicisi.
register("../../scripts/resolve-extless.mjs", import.meta.url);
const { createLineupDraft, deriveDraft, SPIN_MS, NEXT_SPIN_MS, TIER_HUNT_LIMIT } = await import("../src/game/lineupDraft.js");
const { finalScore, gradeOf } = await import("../src/game/draftScore.js");
const { ERAS } = await import("../src/game/eras.js");
const { ALL_SLOTS } = await import("../src/game/positions.js");

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

// ── Sahte saat ────────────────────────────────────────────────────────────
function fakeClock() {
  let now = 0, seq = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { const id = ++seq; q.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => q.delete(id),
    pending: () => q.size,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...q.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        q.delete(due[0]); now = due[1].at; due[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

// ── Sahte oyuncular: her takım dokuz kişi, her mevkiden en az bir ─────────
const ARCH = ["Engine", "Spacer", "Stopper", "Anchor", "Finisher", "Ecosystem", "Force", "Hub", "Creator"];
const POS = ["PG", "SG", "SF", "PF", "C", "PG", "SF", "C", "SG"];
function roster(team, season, overall = 0.6) {
  return ARCH.map((a, i) => ({
    PLAYER_NAME: `${team} ${season} #${i}`, POS5: POS[i], POSITION: POS[i], primary_arch: a,
    overall_score: overall - i * 0.01, MIN: 30 - i, PTS: 20 - i, [`score_${a}`]: 0.9,
  }));
}

function fakeApi({ seasons = ["2014-15", "2015-16"], teams = ["GSW", "SAS"], players = roster } = {}) {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (url === "/api/game/seasons") return { seasons };
    if (url === "/api/affinity") return { matrix: null };
    let m = url.match(/^\/api\/game\/teams\?season=(.+)$/);
    if (m) return { teams };
    m = url.match(/^\/api\/game\/players\?season=(.+)&team=(.+)$/);
    if (m) return { players: players(decodeURIComponent(m[2]), decodeURIComponent(m[1])) };
    throw new Error(`unexpected ${url}`);
  };
  return { fetchJson, calls };
}

// Deterministik rastgelelik: sırayla verilen değerler, bitince 0.
const seq = (...xs) => () => (xs.length ? xs.shift() : 0);

async function setup(opts = {}) {
  const clock = fakeClock();
  const api = fakeApi(opts.api);
  const draft = createLineupDraft({ fetchJson: api.fetchJson, setTimer: clock.setTimer, clearTimer: clock.clearTimer, random: opts.random || seq() });
  draft.actions.init();
  await flush();
  return { draft, clock, api, s: () => draft.getState(), d: () => deriveDraft(draft.getState()) };
}

// Bir tur: çark → roster → ilk oyuncu → verilen slota
async function round(ctx, slot) {
  await ctx.clock.advance(SPIN_MS);          // sezon çarkı durur
  await ctx.clock.advance(SPIN_MS);          // takım çarkı durur → oyuncular
  assert.equal(ctx.s().phase, "pick_player");
  ctx.draft.actions.pickPlayer(ctx.s().players[0]);
  assert.equal(ctx.s().phase, "pick_pos");
  ctx.draft.actions.pickPos(slot);
  await ctx.clock.advance(NEXT_SPIN_MS);
}

test("init: sezonlar ve affinity yüklenir, oyun idle", async () => {
  const { s, api } = await setup();
  assert.deepEqual(s().seasons, ["2014-15", "2015-16"]);
  assert.equal(s().phase, "idle");
  assert.deepEqual(api.calls.slice(0, 2), ["/api/game/seasons", "/api/affinity"]);
});

test("dönem seçimi çarkı başlatır: sezon → takım → oyuncu listesi", async () => {
  const ctx = await setup({ random: seq(0.6, 0.6) });
  ctx.draft.actions.beginEraPick();
  assert.equal(ctx.s().phase, "pick_era");
  ctx.draft.actions.chooseEra(ERAS[4]);
  assert.equal(ctx.s().simEra.id, "small_ball");
  assert.equal(ctx.s().phase, "spin_season");
  assert.equal(ctx.s().spinSeasons, true);
  await ctx.clock.advance(SPIN_MS);
  assert.equal(ctx.s().chosenSeason, "2015-16");
  assert.equal(ctx.s().phase, "spin_team");
  assert.equal(ctx.s().targetTIdx, 1);
  await ctx.clock.advance(SPIN_MS);
  assert.equal(ctx.s().chosenTeam, "SAS");
  assert.equal(ctx.s().phase, "pick_player");
  assert.equal(ctx.s().players.length, 9);
});

test("tam draft: 9 yerleştirme → 4 koç adayı → koç → puan ortak formülle", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[4]);
  for (const slot of ALL_SLOTS) await round(ctx, slot);
  assert.equal(ctx.s().phase, "pick_coach");
  assert.equal(ctx.s().coachOptions.length, 4);
  assert.equal(ctx.d().filledSlots.length, 9);
  ctx.draft.actions.pickCoach(ctx.s().coachOptions[0]);
  assert.equal(ctx.s().phase, "complete");
  const { score, primaryCount } = ctx.d();
  assert.ok(ctx.s().fitResult);
  assert.deepEqual(score, finalScore(ctx.s().fitResult, primaryCount));
  assert.equal(score.grade, gradeOf(score.pct));
});

test("aynı oyuncu iki kez gelmez: kadrodakiler roster'dan düşer", async () => {
  const ctx = await setup({ api: { seasons: ["2015-16"], teams: ["GSW"] } });
  ctx.draft.actions.chooseEra(ERAS[4]);
  await round(ctx, "PG");
  await ctx.clock.advance(SPIN_MS * 2);
  const names = ctx.s().players.map((p) => p.PLAYER_NAME);
  assert.equal(names.length, 8);
  assert.ok(!names.includes(ctx.s().lineup.PG.PLAYER_NAME));
});

test("pozisyon: birincil mevki ★, başka mevki cezalı; bench ayrı işaretlenir", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  const pg = ctx.s().players.find((p) => p.POS5 === "PG");
  ctx.draft.actions.pickPlayer(pg);
  ctx.draft.actions.pickPos("PG");
  assert.equal(ctx.s().lineup.PG._isPrimary, true);
  assert.equal(ctx.d().primaryCount, 1);
  await ctx.clock.advance(NEXT_SPIN_MS + SPIN_MS * 2);
  const c = ctx.s().players.find((p) => p.POS5 === "C");
  ctx.draft.actions.pickPlayer(c);
  ctx.draft.actions.pickPos("B1");
  assert.equal(ctx.s().lineup.B1._isBench, true);
  assert.equal(ctx.s().lineup.B1._isPrimary, false);
});

test("seçimi iptal: oyuncu listesine döner", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[0]);
  await ctx.clock.advance(SPIN_MS * 2);
  ctx.draft.actions.pickPlayer(ctx.s().players[0]);
  ctx.draft.actions.cancelPick();
  assert.equal(ctx.s().phase, "pick_player");
  assert.equal(ctx.s().pickedPlayer, null);
});

test("Pick 2 jokeri: aynı rosterdan ikinci seçim, çark dönmez", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  assert.equal(ctx.d().jokerAvailable.double, true);
  ctx.draft.actions.jokerDouble();
  assert.equal(ctx.s().doubleActive, true);
  assert.equal(ctx.d().jokerAvailable.double, false);
  const first = ctx.s().players[0];
  ctx.draft.actions.pickPlayer(first);
  ctx.draft.actions.pickPos("PG");
  assert.equal(ctx.s().phase, "pick_player");
  assert.equal(ctx.s().doubleActive, false);
  assert.ok(!ctx.s().players.some((p) => p.PLAYER_NAME === first.PLAYER_NAME));
  assert.equal(ctx.clock.pending(), 0);
});

test("Year jokeri: sezon yeniden çevrilir, takım korunur; joker bir kez", async () => {
  const ctx = await setup({ api: { seasons: ["2014-15", "2015-16", "2016-17"], teams: ["GSW", "SAS"] }, random: seq(0, 0.9, 0.9) });
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  const { chosenSeason, chosenTeam } = ctx.s();
  ctx.draft.actions.jokerReYear();
  assert.equal(ctx.s().jokers.reYear, false);
  assert.equal(ctx.s().phase, "spin_season");
  await ctx.clock.advance(SPIN_MS);
  assert.notEqual(ctx.s().chosenSeason, chosenSeason);
  assert.equal(ctx.s().spinTeams, false);
  await ctx.clock.advance(250);
  assert.equal(ctx.s().chosenTeam, chosenTeam);
  assert.equal(ctx.s().phase, "pick_player");
  ctx.draft.actions.jokerReYear();
  assert.equal(ctx.s().phase, "pick_player");
});

test("Team jokeri: başka takıma çevirir", async () => {
  const ctx = await setup({ random: seq(0, 0, 0) });
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  assert.equal(ctx.s().chosenTeam, "GSW");
  ctx.draft.actions.jokerReTeam();
  assert.equal(ctx.s().phase, "spin_team");
  await ctx.clock.advance(2000);
  assert.equal(ctx.s().chosenTeam, "SAS");
  assert.equal(ctx.s().phase, "pick_player");
});

test("Discover jokeri: bir seçimlik açılır, seçimle kapanır", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  ctx.draft.actions.jokerDiscover();
  assert.equal(ctx.s().discoverActive, true);
  ctx.draft.actions.pickPlayer(ctx.s().players[0]);
  assert.equal(ctx.s().discoverActive, false);
});

test("takas: iki slot yer değiştirir, birincil işareti yeniden hesaplanır", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  const pg = ctx.s().players.find((p) => p.POS5 === "PG");
  ctx.draft.actions.pickPlayer(pg);
  ctx.draft.actions.pickPos("PG");
  ctx.draft.actions.slotTap("PG");
  assert.equal(ctx.s().moveSrc, "PG");
  ctx.draft.actions.slotTap("C");
  assert.equal(ctx.s().lineup.PG, null);
  assert.equal(ctx.s().lineup.C.PLAYER_NAME, pg.PLAYER_NAME);
  assert.equal(ctx.s().lineup.C._isPrimary, false);
  assert.equal(ctx.s().moveSrc, null);
});

test("Salary Cap: bütçeyi aşan oyuncu alınamaz, fiyat kaydedilir", async () => {
  const ctx = await setup({ api: { players: (t, s) => roster(t, s, 0.95) } });
  ctx.draft.actions.setMode("salarycap");
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  assert.equal(ctx.s().phase, "pick_player");
  const cap = ctx.d().spendCap;
  const cheap = ctx.s().players.find((p) => p._cost <= cap);
  const pricey = ctx.s().players.find((p) => p._cost > cap);
  if (pricey) {
    ctx.draft.actions.pickPlayer(pricey);
    assert.equal(ctx.s().phase, "pick_player");
  }
  ctx.draft.actions.pickPlayer(cheap);
  assert.equal(ctx.s().pickedPlayer._cost, cheap._cost);
});

test("Salary Cap: alınabilir oyuncu yoksa yeniden çevirir, 15. denemede wildcard", async () => {
  // Herkes süpermax (30): iki alımdan sonra kalan bütçe (40) yedi slota %4 rezerv
  // bırakınca en fazla 16 harcatır — hiçbir roster alınabilir değil.
  const everyoneStar = (t, s) => roster(t, s, 0.99).map((p) => ({ ...p, overall_score: 0.99 }));
  const ctx = await setup({ api: { players: everyoneStar } });
  ctx.draft.actions.setMode("salarycap");
  ctx.draft.actions.chooseEra(ERAS[4]);
  await round(ctx, "PG");
  await round(ctx, "SG");
  assert.equal(ctx.d().budgetLeft, 40);
  const messages = new Set();
  for (let i = 0; i < 800 && ctx.s().phase !== "pick_player"; i++) {
    await ctx.clock.advance(100);
    if (ctx.s().statusMsg) messages.add(ctx.s().statusMsg);
  }
  assert.equal(ctx.s().phase, "pick_player");
  assert.equal(ctx.s().wildcard, true);
  assert.ok(messages.has("No open-tier players on this roster — respinning (1)..."));
  assert.ok(messages.has(`No open-tier players on this roster — respinning (${TIER_HUNT_LIMIT - 1})...`));
  assert.equal(ctx.s().statusMsg, "Tier hunt exhausted — wildcard round: anyone is pickable");
  // wildcard: rezerv şartı düşer, kalan bütçenin tamamı harcanabilir
  assert.equal(ctx.d().spendCap, 40);
  ctx.draft.actions.pickPlayer(ctx.s().players[0]);
  assert.equal(ctx.s().phase, "pick_pos");
});

test("reset: bekleyen çark iptal, geç gelen cevap yok sayılır; mod ve sezonlar kalır", async () => {
  const ctx = await setup();
  ctx.draft.actions.setMode("salarycap");
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS);
  ctx.draft.actions.reset();
  assert.equal(ctx.clock.pending(), 0);
  await ctx.clock.advance(SPIN_MS * 3);
  assert.equal(ctx.s().phase, "idle");
  assert.equal(ctx.s().mode, "salarycap");
  assert.deepEqual(ctx.s().seasons, ["2014-15", "2015-16"]);
  assert.equal(ctx.s().simEra, null);
  assert.deepEqual(ctx.s().jokers, { reTeam: true, reYear: true, reBoth: true, double: true, discover: true });
});

test("API hatası: oyuncular gelmezse idle'a döner ve söyler", async () => {
  const clock = fakeClock();
  const fetchJson = async (url) => {
    if (url === "/api/game/seasons") return { seasons: ["2015-16"] };
    if (url === "/api/affinity") return {};
    if (url.startsWith("/api/game/teams")) return { teams: ["GSW"] };
    throw new Error("boom");
  };
  const draft = createLineupDraft({ fetchJson, setTimer: clock.setTimer, clearTimer: clock.clearTimer, random: seq() });
  draft.actions.init(); await flush();
  draft.actions.chooseEra(ERAS[4]);
  await clock.advance(SPIN_MS * 2);
  assert.equal(draft.getState().phase, "idle");
  assert.equal(draft.getState().statusMsg, "API error");
});

test("puan: kimya birincil başına +0.02, üst sınır 1; notlar eşiklerde", () => {
  assert.deepEqual(finalScore({ lineupScore: 0.70 }, 3), { chemBonus: 0.06, rawScore: 0.70, totalScore: 0.76, pct: 76, grade: "B" });
  assert.equal(finalScore({ lineupScore: 0.99 }, 5).pct, 100);
  assert.deepEqual([85, 84, 78, 77, 70, 69, 62, 61].map(gradeOf), ["S", "A", "A", "B", "B", "C", "C", "D"]);
});

test("web sayfası motoru ve ortak puanı kullanıyor, kendi kopyası yok", () => {
  const page = src("pages", "LineupGame.jsx");
  assert.match(page, /useLineupDraft\(\)/);
  assert.match(page, /finalScore\(fit, primaryCount\)/);
  assert.doesNotMatch(page, /const \[phase, setPhase\]/);
  assert.doesNotMatch(page, /pct>=85\?"S"/);
  assert.doesNotMatch(page, /wildcardRef/);
});

test("aynı oyuncu iki kez alınamaz: yerleştirmeden sonraki 400 ms'de eski listeden seçim yok sayılır", async () => {
  const ctx = await setup();
  ctx.draft.actions.chooseEra(ERAS[4]);
  await ctx.clock.advance(SPIN_MS * 2);
  const first = ctx.s().players[0];
  ctx.draft.actions.pickPlayer(first);
  ctx.draft.actions.pickPos("PG");
  // yeni çark henüz başlamadı: faz hâlâ pick_pos, liste eski
  assert.equal(ctx.s().phase, "pick_pos");
  ctx.draft.actions.pickPlayer(first);
  assert.equal(ctx.s().pickedPlayer, null);
  // oyuncu seçme anında bile kadrodaki biri reddedilir
  await ctx.clock.advance(NEXT_SPIN_MS + SPIN_MS * 2);
  ctx.draft.actions.pickPlayer({ ...first });
  assert.equal(ctx.s().phase, "pick_player");
  assert.equal(ctx.s().pickedPlayer, null);
});
