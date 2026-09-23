import test from "node:test";
import assert from "node:assert/strict";
import { appetiteOpen, appetiteValue, nextAppetite } from "../src/rankit/redesign/appetite.js";

test("2h: maç başlamadan önce okuma açık, kickoff ve sonrasında kapalı", () => {
  const match = { status: "upcoming", starts_at: "2026-09-22T20:00:00Z" };
  assert.equal(appetiteOpen(match, Date.parse("2026-09-22T19:59:59Z")), true);
  assert.equal(appetiteOpen(match, Date.parse(match.starts_at)), false);
  assert.equal(appetiteOpen({ ...match, status: "live" }, 0), false);
  assert.equal(appetiteOpen({ ...match, status: "finished" }, 0), false);
});

test("2h: 1–5 okuması aynı seçime ikinci kez basınca geri çekilir", () => {
  assert.equal(appetiteValue(null), null);
  assert.equal(appetiteValue(0), null);
  assert.equal(appetiteValue("3"), 3);
  assert.equal(appetiteValue(6), null);
  assert.equal(nextAppetite(null, 4), 4);
  assert.equal(nextAppetite(4, 4), null);
  assert.equal(nextAppetite(4, 2), 2);
});
