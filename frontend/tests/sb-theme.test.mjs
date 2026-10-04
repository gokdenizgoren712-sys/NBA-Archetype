/* Spin & Build tasarım token'ları (docs/GAME_UI_REBUILD_PLAN.md, Faz 0).
   Değerler mockup'tan (Basketball/Football.dc.html) ve brief'ten birebir. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPORT_THEMES, sportTheme, gameClass } from "../src/game/ui/sportTheme.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "src", "game", "ui", "sport-theme.css"), "utf8");

test("spor accent'leri: basketbol altın, futbol yeşil — tek değişken seti", () => {
  assert.match(css, /\.sb-game\.sport-basketball \{\s*--sb-accent: #FFB11B;/);
  assert.match(css, /\.sb-game\.sport-football \{\s*--sb-accent: #3FB08C;/);
  assert.equal(SPORT_THEMES.basketball.accent, "#FFB11B");
  assert.equal(SPORT_THEMES.football.accent, "#3FB08C");
});

test("draft boyutları ve etiketler: 9 (5+4) / 18 (11+7), Team↔Club, Year↔Season", () => {
  const b = sportTheme("basketball"), f = sportTheme("football");
  assert.deepEqual([b.draftSize, b.starters, b.bench], [9, 5, 4]);
  assert.deepEqual([f.draftSize, f.starters, f.bench], [18, 11, 7]);
  assert.equal(b.starters + b.bench, b.draftSize);
  assert.equal(f.starters + f.bench, f.draftSize);
  assert.deepEqual([b.teamWord, b.yearWord], ["Team", "Year"]);
  assert.deepEqual([f.teamWord, f.yearWord], ["Club", "Season"]);
  assert.deepEqual([b.simGames, f.simGames], [82, 40]);
});

test("bilinmeyen spor basketbola düşer; sarmalayıcı sınıfı doğru", () => {
  assert.equal(sportTheme("hockey").key, "basketball");
  assert.equal(gameClass("football"), "sb-game sport-football");
  assert.equal(gameClass("basketball", "x"), "sb-game sport-basketball x");
});

test("mockup paleti: zemin, panel, durum ve mevki renkleri", () => {
  for (const [k, v] of Object.entries({
    "--sb-page": "#0a0a0c", "--sb-side": "#0b0b0d", "--sb-canvas": "#0c0e10",
    "--sb-text": "#f2f2f4", "--sb-opp": "#5b9dff",
    "--sb-good": "#4cd98c", "--sb-special": "#c58bff",
    "--sb-pos-pg": "#5b9dff", "--sb-pos-sg": "#4fd6c8", "--sb-pos-sf": "#9be564",
    "--sb-pos-pf": "#FFB11B", "--sb-pos-c": "#ff6b6b",
  })) assert.match(css, new RegExp(k + ": *" + v + ";"), k);
  assert.match(css, /--sb-panel:\s*rgba\(12, 14, 16, \.92\);/);
  assert.match(css, /background-size: 24px 24px;/);
});

test("hiçbir oyun stili tek spora sabit accent yazmaz (accent dışında #FFB11B/#3FB08C geçmez)", () => {
  const rest = css
    .replace(/\.sb-game\.sport-basketball \{[^}]*\}/, "")
    .replace(/\.sb-game\.sport-football \{[^}]*\}/, "");
  // Mevki rengi PF altın ve tanımı sabit; onun dışında accent hex'i serbest kalmamalı.
  const hits = (rest.match(/#3FB08C/gi) || []).length + (rest.match(/#FFB11B/gi) || []).length;
  assert.equal(hits, 1, "yalnız --sb-pos-pf #FFB11B olabilir");
});

test("hareket azaltma: süreler ~0 olur ve odak halkası accent renginde", () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-duration: \.05ms !important/);
  assert.match(css, /\.sb-game :focus-visible \{\s*outline: 2px solid var\(--sb-accent\);/);
});
