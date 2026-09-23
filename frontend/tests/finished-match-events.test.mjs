import test from "node:test";
import assert from "node:assert/strict";
import { finishedMatchEvents, finishedMatchEventState } from "../src/rankit/redesign/finishedMatchEvents.js";

test("2f: sağlayıcı anları yalnız bitmiş maçta Match sekmesine geçer", () => {
  const moments = [{ id: 2, minute: 71, label: "Red card - Away" }, { id: 1, minute: 12, label: "Goal - Home" }];
  assert.deepEqual(finishedMatchEvents("live", "live", moments), []);
  assert.deepEqual(finishedMatchEvents("finished", "live", moments), []);
  assert.deepEqual(finishedMatchEvents("finished", "finished", moments).map((event) => event.id), [1, 2]);
});

test("2f: eksik, bozuk veya doğrulanmamış an uydurulmaz", () => {
  assert.deepEqual(finishedMatchEvents("finished", "finished", null), []);
  assert.deepEqual(finishedMatchEvents("finished", "finished", [
    { minute: "", label: "No minute" },
    { minute: 19, label: "" },
    { minute: 90, label: "Goal - Home" },
  ]).map((event) => event.label), ["Goal - Home"]);
});

test("2f: maç yanıtındaki taraflı gol, kart ve değişiklikler asıl kaynaktır", () => {
  const match = { status: "finished", events_checked: true, events: [
    { minute: 63, kind: "substitution", side: "home", label: "Neto for Madueke" },
    { minute: 11, kind: "goal", side: "away", label: "Goal - Sporting" },
    { minute: 72, kind: "card", side: "home", label: "Red card - Chelsea" },
  ] };
  const state = finishedMatchEventState(match, { status: "finished", moments: [{ minute: 5, label: "Older companion event" }] });
  assert.equal(state.checked, true);
  assert.deepEqual(state.events.map(event => [event.minute, event.kind, event.side]), [
    [11, "goal", "away"], [63, "substitution", "home"], [72, "card", "home"],
  ]);
});

test("2f: doğrulanmış boş olay ile kaynağı taranmamış maç ayrıdır; canlı Match boş kalır", () => {
  assert.deepEqual(finishedMatchEventState({ status: "finished", events: [], events_checked: true }, null),
    { events: [], checked: true });
  assert.deepEqual(finishedMatchEventState({ status: "finished", events: [], events_checked: false }, null),
    { events: [], checked: false });
  assert.deepEqual(finishedMatchEventState({ status: "live", events: [{ minute: 73, label: "Goal" }] },
    { status: "finished", moments: [{ minute: 73, label: "Goal" }] }), { events: [], checked: false });
});
