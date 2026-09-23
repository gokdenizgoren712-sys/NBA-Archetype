import test from "node:test";
import assert from "node:assert/strict";
import { liveFreshness } from "../src/rankit/redesign/liveFreshness.js";

test("15d: SQLite UTC damgası yerel saat sayılmaz; dört yoklama kaçınca bayat", () => {
  const match = { status: "live", live_updated_at: "2026-09-22 19:12:00" };
  const base = Date.parse("2026-09-22T19:12:00Z");
  assert.equal(liveFreshness(match, base + 179000), "fresh");
  assert.equal(liveFreshness(match, base + 181000), "stale");
  assert.equal(liveFreshness({ ...match, live_updated_at: "2026-09-22T19:12:00Z" }, base + 181000), "stale");
  assert.equal(liveFreshness({ ...match, live_updated_at: null }, base), "unknown");
  assert.equal(liveFreshness({ ...match, status: "finished" }, base), "not-live");
});

// --- B7: kartin kendisi de tazelik iddia etmemeli ---
import { toMatchCardProps } from "../src/rankit/redesign/toMatchCardProps.js";

const NOW = Date.parse("2026-09-22T20:00:00Z");
const liveMatch = extra => ({ status: "live", score: "2–1", competition: "X",
  home: { short: "HOM", color: "#111" }, away: { short: "AWY", color: "#222" }, ...extra });

test("B7: bayat canli kaynakta kart LIVE demiyor", () => {
  const props = toMatchCardProps(liveMatch({ live_updated_at: "2026-09-22 19:55:00" }), { nowMs: NOW });
  assert.equal(props.statusLabel, "DELAYED");
  assert.equal(props.liveStale, true);
  // Bilinen son skor bilgi olmaya devam ediyor; kaldirilan sey tazelik iddiasi.
  assert.equal(props.homeScore, "2");
  assert.equal(props.awayScore, "1");
});

test("B7: taze canli maç LIVE kaliyor", () => {
  const props = toMatchCardProps(liveMatch({ live_updated_at: "2026-09-22 19:59:30" }), { nowMs: NOW });
  assert.equal(props.statusLabel, "LIVE");
  assert.equal(props.liveStale, false);
});

test("B7: damga yoksa gecikme UYDURULMUYOR", () => {
  // "unknown" bayat degildir: bilmemek, bildigini soylemekten farkli.
  const props = toMatchCardProps(liveMatch({}), { nowMs: NOW });
  assert.equal(props.statusLabel, "LIVE");
  assert.equal(props.liveStale, false);
});

test("B7: canli olmayan mac bu yoldan etkilenmiyor", () => {
  const done = toMatchCardProps({ status: "finished", score: "3–0", competition: "X",
    home: { short: "H" }, away: { short: "A" }, live_updated_at: "2020-01-01 00:00:00" }, { nowMs: NOW });
  assert.equal(done.statusLabel, "FULL TIME");
  assert.equal(done.liveStale, false);
});
