/* Spin & Build — Faz 4: Same Screen ortak kareleri (docs/GAME_UI_REBUILD_PLAN.md). Mockup 7a–7i, 8a–8h. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

test("Same Screen basketbol: sayfa yalnız yeni sahneleri çiziyor, mantık yerinde", () => {
  const p = src("pages", "SameScreenGame.jsx");
  for (const c of ["BasketballVersusDraft", "BasketballVersusLocked", "BasketballVersusHire", "BasketballVersusMatchup", "BasketballVersusSeries", "BasketballVersusFinal"]) {
    assert.match(p, new RegExp(`<${c}`), c);
  }
  assert.match(p, /<EraStep sport="basketball"/);
  assert.match(p, /<SetupHub /);
  // oyun kuralları dokunulmadan: karşı-joker, ban, snake sırası, best-of-7
  assert.match(p, /useCounterJoker/);
  assert.match(p, /seriesW\[1\] >= 4 \|\| seriesW\[2\] >= 4/);
  assert.doesNotMatch(p, /PlayerSeatPanel|SeatRoster|FullCourtBoard/);
});

test("draft: karşı-joker şeridi gerçek karşı-jokerleri (BAN / Force Team / Force Year) bağlıyor", () => {
  const a = src("game", "ui", "VersusBasketball.jsx");
  assert.match(a, /counter\.onUse\("ban"\)/);
  assert.match(a, /counter\.onUse\("forceTeam"\)/);
  assert.match(a, /counter\.onUse\("forceYear"\)/);
  assert.match(src("game", "ui", "VersusUi.jsx"), /Use a joker on the shared spin before you pick\./);
});

test("seri: 7 maç çipi, seçilen maçın box score'u, 4 galibiyette 'See result'", () => {
  const a = src("game", "ui", "VersusBasketball.jsx");
  assert.match(a, /Array\.from\(\{ length: 7 \}/);
  assert.match(a, /label: "See result"/);
  assert.match(a, /Box score/);
});

test("futbol Same Screen: giriş, draft, kilitli XI, eleme ve final yeni dilde; draft mantığı draft.js'te", () => {
  const d = src("game", "football", "SameScreenDraft.jsx");
  assert.match(d, /<FootballVersusEntry/);
  assert.match(d, /<FootballVersusDraft/);
  assert.match(d, /<FootballVersusLocked/);
  assert.match(d, /import \* as D from "\.\/draft"/);
  const v = src("pages", "football", "FootballVersus.jsx");
  assert.match(v, /<FootballVersusTie/);
  assert.match(v, /<FootballVersusFinal/);
  assert.match(v, /fixedMode === "same"/);
});

test("iki taraf rengi tek yerde (versus.css), kapsam sport-theme sarmalayıcısında", () => {
  const css = src("game", "ui", "versus.css");
  assert.match(css, /--seat-1: #7db2ff/);
  assert.match(css, /--seat-2: #ff8a96/);
  assert.match(src("game", "ui", "VersusUi.jsx"), /<GameStage sport=\{sport\} className=\{`sb-vs/);
});
