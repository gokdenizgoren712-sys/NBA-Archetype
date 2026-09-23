import test from "node:test";
import assert from "node:assert/strict";
import { formatWhen } from "../src/rankit/formatWhen.js";

test("maç zamanı tarih ve saati bir kez birleştirir", () => {
  const shown = formatWhen("2026-09-21T20:30:00+03:00");
  assert.match(shown.date, /^\d{2} [A-Za-z]{3,4} 2026$/);
  assert.match(shown.time, /^\d{2}:\d{2}$/);
  assert.equal(shown.full, `${shown.date} · ${shown.time}`);
});

test("eksik veya geçersiz maç zamanı güvenli biçimde döner", () => {
  assert.deepEqual(formatWhen(null), { date: "", time: "", full: "" });
  assert.deepEqual(formatWhen("not-a-date"), { date: "not-a-date", time: "", full: "not-a-date" });
});
