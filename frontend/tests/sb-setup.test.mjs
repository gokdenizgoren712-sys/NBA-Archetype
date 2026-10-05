/* Spin & Build — Faz 1 giriş ekranları (docs/GAME_UI_REBUILD_PLAN.md).
   Mockup: In Site 3a/3b/3g/4g, Football Single Player 11a. Metin final. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ERA_UI } from "../src/game/ui/eraUi.js";
import { COURT_SLOTS, PITCH_LINES, COURT_LINES, footballSlotPos, slotLabel } from "../src/game/ui/boardGeometry.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

test("mod seçimi: dört kart, mockup metni, iki spor aynı bileşen", () => {
  const m = src("game", "ui", "ModeSelect.jsx");
  for (const t of ["Spin & Build", "Same Screen", "With a Friend", "Online Opponent",
    "Build solo and chase the leaderboard.", "Two players, one device, take turns.",
    "Share a 6-character code. Build privately, then face off.", "Jump into an open room and get matched.",
    "Spin a team and season. Pick one player. Fill your lineup."]) assert.ok(m.includes(t), t);
  assert.match(src("pages", "GameModeSelect.jsx"), /<ModeSelect sport="basketball"/);
  assert.match(src("pages", "football", "FootballModeSelect.jsx"), /<ModeSelect sport="football"/);
});

test("eski ModeGrid ve ProcessSteps kaldırıldı, eski mod/idle/step CSS'i silindi", () => {
  assert.equal(existsSync(join(here, "..", "src", "game", "ModeGrid.jsx")), false);
  assert.equal(existsSync(join(here, "..", "src", "game", "ProcessSteps.jsx")), false);
  const css = src("game", "game.css");
  assert.doesNotMatch(css, /\.g-modes?\b|\.g-mode-|\.g-fb-idle|\.g-step-|\.g-pstep|\.g-lb-head/);
});

test("dönem kartları: 6 dönem, mockup renkleri ve ▲/▼ etiketleri", () => {
  assert.deepEqual(Object.keys(ERA_UI), ["magic_bird", "jordan", "dead_ball", "proto", "small_ball", "parity"]);
  assert.equal(ERA_UI.small_ball.color, "#4cd98c");
  assert.equal(ERA_UI.magic_bird.up, "Ecosystems, Bigs");
  assert.equal(ERA_UI.parity.dn, "One-dimensional roles");
});

test("hub: mockup adımları, kural setleri ve kort önizlemesi", () => {
  const g = src("pages", "LineupGame.jsx");
  for (const t of ["Pick era", "Spin & draft 9", "Hire coach", "Simulate 82",
    "Distance & style fit", "5 starters + 4 bench", "Offense & defense grades", "Playoffs & awards glory"])
    assert.ok(g.includes(t), t);
  assert.match(g, /<SetupHub sport="basketball"/);
  assert.match(g, /<EraStep eras=\{ERAS\}/);
  assert.equal(COURT_SLOTS.length, 5);
  assert.equal(COURT_LINES[0], "M1 1H99V69H1Z");
});

test("futbol girişi: diziliş + lig + liderlik tek ekran, 7 diziliş, yatay saha", () => {
  const f = src("pages", "football", "FootballGame.jsx");
  assert.match(f, /<ShapeStep shape=\{shape\}/);
  const s = src("game", "ui", "ShapeStep.jsx");
  assert.match(s, /SHAPE_KEYS\.map/);
  assert.match(s, /Choose your <span className="sb-accent">shape<\/span>/);
  assert.equal(PITCH_LINES.length, 5);
  // kendi kalen solda: y=93 (GK) → left=7
  assert.deepEqual(footballSlotPos({ x: 50, y: 93 }), { left: 7, top: 50 });
  assert.equal(slotLabel({ id: "LCB", pos: "CB" }), "CB");
  assert.equal(slotLabel({ id: "LW", pos: "W" }), "W");
});

test("liderlik: iki spor aynı kartı kullanır, futbol persantili dürüstçe etiketler", () => {
  assert.match(src("game", "LeaderboardPanel.jsx"), /<LeaderboardCard/);
  const f = src("game", "football", "LeaderboardPanel.jsx");
  assert.match(f, /<LeaderboardCard/);
  assert.match(f, /RANKED AGAINST/);
  assert.match(src("game", "LeaderboardPanel.jsx"), /LINEUP FIT SCORE OUT OF 100/);
});
