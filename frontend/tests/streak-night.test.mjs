import { test } from "node:test";
import assert from "node:assert/strict";
import { nightStatus } from "../src/rankit/redesign/streakNight.js";

test("3j: gece sayildiysa puanlamak seriyi KORUMUYOR", () => {
  const s = nightStatus({ streak: 6, tonight_counted: true, at_risk: false });
  assert.equal(s.keepsStreak, false, "gece sayildiginda satir seri vaadi vermemeli");
  assert.equal(s.tone, "counted");
  assert.match(s.note, /already counts/);
});

test("3j: seri risk altindaysa hem satir hem uyari cikiyor", () => {
  const s = nightStatus({ streak: 6, tonight_counted: false, at_risk: true });
  assert.equal(s.keepsStreak, true);
  assert.equal(s.tone, "at-risk");
  assert.equal(s.note, "Your 6-night streak needs one rating tonight.");
});

test("3j: seri yokken korunacak bir sey yok", () => {
  const s = nightStatus({ streak: 0, tonight_counted: false, at_risk: false });
  assert.deepEqual(s, { tone: null, keepsStreak: false, note: null });
});

test("3j: dinlenme gecesi risk degildir", () => {
  // Uc bu gece hic mac yoksa at_risk=false uretiyor (§7.2) — ekran da
  // "seri risk altinda" demiyor, seri 9 gece olsa bile.
  const s = nightStatus({ streak: 9, tonight_counted: false, at_risk: false });
  assert.equal(s.note, null);
  assert.equal(s.keepsStreak, false);
});

test("3j: sayisiz veya eksik yanit uydurma satir uretmez", () => {
  for (const data of [undefined, {}, { at_risk: true }, { at_risk: true, streak: null },
                      { at_risk: true, streak: 0 }]) {
    assert.equal(nightStatus(data).note, null, JSON.stringify(data));
  }
});

test("3j: bayraklar yalniz gercek true ise okunuyor", () => {
  // Eski kod `streak > 0` bakiyordu; "1"/"true" gibi degerler kazara
  // dogruymus gibi okunmasin.
  assert.equal(nightStatus({ streak: 4, at_risk: "true" }).tone, null);
  assert.equal(nightStatus({ streak: 4, tonight_counted: 1 }).tone, null);
});
