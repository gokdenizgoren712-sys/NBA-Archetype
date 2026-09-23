import test from "node:test";
import assert from "node:assert/strict";
import { broadcastLabel } from "../src/rankit/redesign/broadcastLabel.js";

test("kart yalnız ülkeye göre doğrulanmış veya alışılmış yayını gösterir", () => {
  assert.equal(broadcastLabel({ broadcaster: "Demo Sports" }), "Broadcast details pending");
  assert.equal(broadcastLabel({ broadcast: { confidence: null, channels: [] } }), "Broadcast details pending");
  assert.equal(broadcastLabel({ broadcast: { confidence: "confirmed", channels: [{ name: "ESPN" }] } }), "Watch on ESPN");
  assert.equal(broadcastLabel({ broadcast: { confidence: "typical", channels: [{ name: "TNT" }] } }), "Typical coverage: TNT");
  assert.equal(broadcastLabel({ broadcast: { confidence: "unknown", channels: [{ name: "Channel" }] } }), "Broadcast details pending");
});
