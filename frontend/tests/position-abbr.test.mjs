/* Ekran 15d — canlı kadro satırındaki mevki. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { positionAbbr } from "../src/rankit/redesign/positionAbbr.js";

test("15d: arka ucun bes kaba mevkisi kisaltiliyor", () => {
  assert.equal(positionAbbr("Keeper"), "GK");
  assert.equal(positionAbbr("Defender"), "DF");
  assert.equal(positionAbbr("Midfielder"), "MF");
  assert.equal(positionAbbr("Winger"), "WG");
  assert.equal(positionAbbr("Striker"), "ST");
});

test("15d: HAM saglayici kodu asla mevki olarak gosterilmiyor", () => {
  // Asil kusur: `position_code || position` sirasi ekrana "32" basiyordu.
  for (const raw of [11, 32, 83, "11", "107"]) assert.equal(positionAbbr(raw), "");
});

test("15d: bilinmeyen etikette sutun bos kalir, kisaltma uydurulmaz", () => {
  for (const odd of ["", null, undefined, "Sweeper", "Trequartista"]) {
    assert.equal(positionAbbr(odd), "");
  }
});

test("15d: bileşen ham koda artik hic dokunmuyor", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
    "..", "src", "rankit", "redesign", "LiveLineup.jsx"), "utf8");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /position_code/,
    "canli kadro hala position_code okuyor");
});
