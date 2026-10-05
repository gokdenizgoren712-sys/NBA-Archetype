/* Spin & Build — Faz 3: koç/menajer, sonuç sayfaları (docs/GAME_UI_REBUILD_PLAN.md). Mockup 3d/4d/3e/11c. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

test("koç/menajer: tek bileşen, iki spor; CTA 'Hire <ad>'", () => {
  const c = src("game", "CoachPicker.jsx");
  assert.match(c, /sport = "basketball"/);
  assert.match(c, /\["Attack", o\.att\], \["Defence", o\.def\]/);
  assert.match(c, /\["Offense", o\.off\], \["Defense", o\.def\]/);
  assert.match(c, /`Hire \$\{full\}`/);
  assert.match(src("pages", "LineupGame.jsx"), /<CoachPicker sport="basketball"/);
  assert.match(src("pages", "football", "FootballGame.jsx"), /<CoachPicker sport="football" shape=\{shape\}/);
});

test("basketbol sonuç: Lineup Fit + Five Pillars | rotasyon; sezon motoru ScoreReveal'da", () => {
  const r = src("game", "ui", "ResultStage.jsx");
  assert.match(r, /LINEUP FIT/);
  assert.match(r, /PillarBars/);
  assert.match(r, /240 \/ 240 MIN/);
  assert.match(r, /Simulate season/);
  const g = src("pages", "LineupGame.jsx");
  assert.match(g, /const sim = useSeasonSim\(/);
  assert.match(g, /<ResultStage /);
  assert.match(g, /<SeasonSimView sim=\{sim\} hideIdle/);
});

test("SeasonSimPanel: görünüm ayrıldı, eski kullanım (kendi motorunu kuran) aynı kaldı", () => {
  const s = src("game", "SeasonSimPanel.jsx");
  assert.match(s, /export function SeasonSimView/);
  assert.match(s, /export default function SeasonSimPanel\(props\)/);
  assert.match(s, /hideIdle && stage === "idle"/);
});

test("futbol: tek sonuç ekranı, eski render silindi", () => {
  const f = src("pages", "football", "FootballGame.jsx");
  assert.match(f, /className="sb-skin"/);
  assert.match(f, /<SquadResult /);
  assert.doesNotMatch(f, /fb-play|g-draft-head|g-fb-wheels/);
  assert.match(src("game", "football", "SquadResult.jsx"), /sb-fres-big/);
});

test("eski koç/sonuç CSS'i silindi", () => {
  const css = src("game", "game.css");
  assert.doesNotMatch(css, /\.g-coach|\.g-result-hero|\.g-result-grade|\.g-sq-cols|\.g-score-pct/);
});

test("Faz 3 dosyaları mevcut", () => {
  for (const f of ["result.css", "result-basketball.css", "PillarBars.jsx", "ResultStage.jsx"])
    assert.equal(existsSync(join(here, "..", "src", "game", "ui", f)), true, f);
});
