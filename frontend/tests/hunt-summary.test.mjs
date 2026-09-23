/* Ekran 2c — Discover üstündeki The Hunt özeti. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { huntLine, huntPercent } from "../src/rankit/redesign/huntSummary.js";

test("2c: tahtadaki cumle birebir uretiliyor", () => {
  // Tahta: "38%" + "4 collections · two are one night from closing"
  const s = { collected: 21, total: 55, pct: 0.382, active: 4, one_left: 2 };
  assert.equal(huntPercent(s), "38%");
  assert.equal(huntLine(s), "4 collections · two are one night from closing");
});

test("2c: tekil hallerde dil dogru", () => {
  assert.equal(huntLine({ active: 1, one_left: 1 }), "1 collection · one is one night from closing");
  assert.equal(huntLine({ active: 3, one_left: 0 }), "3 collections");
});

test("2c: yuzde bilinmiyorsa UYDURULMUYOR", () => {
  // Acilmamis koleksiyonlar toplama girmiyor; hic sayilan yoksa pct null.
  for (const s of [{ pct: null, active: 2 }, { active: 2 }, {}, null, undefined]) {
    assert.equal(huntPercent(s), null, JSON.stringify(s));
  }
  // 0% gecerli bir olcum: hicbir sey toplanmamis ama koleksiyon acik.
  assert.equal(huntPercent({ pct: 0, active: 2 }), "0%");
});

test("2c: acik koleksiyon yoksa blok hic cizilmiyor", () => {
  assert.equal(huntLine({ active: 0, one_left: 0, pct: 0.5 }), null);
  assert.equal(huntLine(null), null);
});

test("2c: 10 ustu sayilar rakamla yaziliyor", () => {
  assert.equal(huntLine({ active: 14, one_left: 11 }), "14 collections · 11 are one night from closing");
});
