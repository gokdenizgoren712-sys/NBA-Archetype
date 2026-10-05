/* Futbol Same Screen draft motoru (game/football/draft.js): 18'lik kadro, Pick 2, takas, ceza yalnız ilk 11'den. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../src/game/football/draft.js";
import { managerBonus, MANAGERS } from "../src/game/football/managers.js";

const gk = (id) => ({ PLAYER_ID: id, PLAYER_NAME: `GK${id}`, POSITION: "GK", PHASE: "gk", overall_score: 0.7 });
const cb = (id) => ({ PLAYER_ID: id, PLAYER_NAME: `CB${id}`, POSITION: "CB", PHASE: "def", overall_score: 0.7 });
const st = (id) => ({ PLAYER_ID: id, PLAYER_NAME: `ST${id}`, POSITION: "ST", PHASE: "fwd", overall_score: 0.7 });

test("kadro 18 slot: 11 saha + 7 yedek", () => {
  const d = D.createDraft({ shapes: { 1: "4-3-3", 2: "4-3-3" } });
  assert.equal(D.slotsOf(d, 1).length, 18);
  assert.equal(D.pitchOf(d, 1).length, 11);
  assert.equal(D.slotsOf(d, 1).filter((s) => s.bench).length, 7);
});

test("yedek slotu herkesi alır (kaleci dahil), saha kalesi yalnız kaleciyi", () => {
  const d = D.createDraft({ shapes: { 1: "4-3-3", 2: "4-3-3" } });
  assert.ok(D.openSlotsFor(d, 1, gk(1)).some((s) => s.id === "GK"));
  assert.ok(D.openSlotsFor(d, 1, gk(1)).some((s) => s.bench));
  assert.ok(!D.openSlotsFor(d, 1, cb(2)).some((s) => s.id === "GK"));
});

test("Pick 2: aynı koltuk aynı havuzdan bir kez daha seçer, sıra değişmez", () => {
  let d = D.setPool(D.createDraft({ shapes: { 1: "4-3-3", 2: "4-3-3" }, first: 1 }), { team: "T", season: "2020/21", players: [] });
  const seat = D.activeSeat(d);
  const r1 = D.pick(d, seat, cb(10), "LCB", { again: true });
  assert.ok(r1.ok);
  assert.equal(r1.state.phase, "drafting");
  assert.equal(D.activeSeat(r1.state), seat);
  const r2 = D.pick(r1.state, seat, cb(11), "RCB");
  assert.ok(r2.ok);
  assert.notEqual(D.activeSeat(r2.state), seat);   // normal seçim sırayı geçirir
});

test("takas: kaleci kuralı iki yönde korunur, normal takas çalışır", () => {
  let d = D.setPool(D.createDraft({ shapes: { 1: "4-3-3", 2: "4-3-3" } }), { team: "T", season: "2020/21", players: [] });
  const seat = D.activeSeat(d);
  d = D.pick(d, seat, gk(1), "GK").state;
  d = { ...d, queue: [seat, D.other(seat)], turnPos: 0 };
  d = D.pick(d, seat, st(2), "ST").state;
  assert.equal(D.swap(d, seat, "GK", "ST").ok, false);        // kaleci forvete giremez
  const ok = D.swap(d, seat, "ST", "SUB1");                    // forvet yedeğe geçer
  assert.ok(ok.ok);
  assert.equal(ok.state.squads[seat].SUB1.PLAYER_ID, 2);
  assert.equal(ok.state.squads[seat].ST, undefined);
});

test("pozisyon cezası yalnız ilk 11'den; yedekler ayrı döner", () => {
  let d = D.createDraft({ shapes: { 1: "4-3-3", 2: "4-3-3" } });
  d = { ...d, squads: { ...d.squads, 1: { LCB: { ...cb(1), _slot: "LCB" }, ST: { ...cb(2), _slot: "ST" }, SUB1: { ...st(3), _slot: "SUB1" } } } };
  const sq = D.squadOf(d, 1);
  assert.equal(sq.players.length, 2);
  assert.equal(sq.bench.length, 1);
  assert.ok(sq.positionPenalty > 0);                           // stoper forvette ceza yer
});

test("menajer: tercih ettiği dizilişle eşleşme bonusu belirgin büyük", () => {
  const m = MANAGERS.find((x) => x.shape === "4-3-3");
  assert.ok(managerBonus(m, "4-3-3").bonus > managerBonus(m, "5-3-2").bonus);
  assert.equal(managerBonus(null, "4-3-3").bonus, 0);
});
