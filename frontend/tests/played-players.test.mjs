import test from "node:test";
import assert from "node:assert/strict";
import { playedPlayers } from "../src/rankit/redesign/playedPlayers.js";

test("15b: oynayan ilk 11 ve oyuna girenleri sıra ve gerçek kimlikle seçer", () => {
  const rows = playedPlayers([
    { side: "home", team: "Arsenal", team_id: 1,
      starters: [{ player_id: 7, name: "Saka", shirt_no: "7", played: true, position: "Winger" }],
      bench: [
        { player_id: 19, name: "Trossard", played: true, sub_in: 63, replaced: "Saka" },
        { player_id: 30, name: "Unused", played: false },
      ] },
    { side: "away", team: "Tottenham", team_id: 2,
      starters: [{ player_id: 1, name: "Vicario", played: true }], bench: [] },
  ]);
  assert.deepEqual(rows.map(player => [player.id, player.role, player.team]), [
    [7, "STARTED", "Arsenal"], [19, "CAME ON", "Arsenal"], [1, "STARTED", "Tottenham"],
  ]);
  assert.equal(rows[1].sub_in, 63);
  assert.equal(rows[1].replaced, "Saka");
});

test("15b: kadro yoksa veya oynadığı ve id'si doğrulanmadıysa sezon kadrosunu uydurmaz", () => {
  assert.deepEqual(playedPlayers(null), []);
  assert.deepEqual(playedPlayers([{ team: "A", starters: [
    { name: "Unlinked", played: true },
    { player_id: 1, name: "No play flag" },
    { player_id: 2, name: "Didn't play", played: false },
  ] }]), []);
});
