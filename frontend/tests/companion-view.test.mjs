import test from "node:test";
import assert from "node:assert/strict";
import { companionMinute, measuredPulse, measuredRise } from "../src/rankit/redesign/companionView.js";

test("5b: sağlayıcı dakikası çift kesme işaretine dönüşmez", () => {
  assert.equal(companionMinute("73'"), "73'");
  assert.equal(companionMinute("45+2"), "45+2'");
  assert.equal(companionMinute("HT"), "HT");
  assert.equal(companionMinute(73, "Basketball"), "73m");
  assert.equal(companionMinute(null), null);
});

test("5b/6d: 20 okuma olmadan ısı ve ölçülmemiş gece farkı uydurulmaz", () => {
  assert.equal(measuredPulse(4.8, 19), null);
  assert.equal(measuredPulse(4.8, 20), 4.8);
  assert.equal(measuredPulse(null, 200), null);
  assert.equal(measuredRise(null), "—");
  assert.equal(measuredRise(1.84), "+1.8");
  assert.equal(measuredRise(-0.5), "-0.5");
});

// --- ONARIM Aşama 9 / ekran 6d: odanın kapanışı tahtanın cümlesiyle ---
test("6d: kapanış cümlesi nedenini söylüyor (tahtadan birebir)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { join, dirname } = await import("node:path");
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
    "..", "src", "rankit", "redesign", "CompanionPanel.jsx"), "utf8");
  assert.match(src, /ROOM CLOSED AT FULL TIME/);
  assert.match(src, /a watchalong is the match, not a group chat that outlives it/,
    "tahtanin gerekceli cumlesi kayip");
  assert.doesNotMatch(src, /The thread stays read-only after full time/,
    "duz tekrar hala duruyor");
});
