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
  for (const c of ["FootballVersusHire", "FootballVersusMatchup", "FootballVersusLegs", "FootballVersusFinal"]) assert.match(v, new RegExp(`<${c}`), c);
  // yedek, joker ve menajer artık Same Screen futbolunda da var
  assert.match(d, /doubleActive/);
  assert.match(d, /useCounter/);
  assert.match(v, /drawManagers\(4\)/);
  assert.match(v, /fixedMode === "same"/);
});

test("iki taraf rengi tek yerde (versus.css), kapsam sport-theme sarmalayıcısında", () => {
  const css = src("game", "ui", "versus.css");
  assert.match(css, /--seat-1: #7db2ff/);
  assert.match(css, /--seat-2: #ff8a96/);
  assert.match(src("game", "ui", "VersusUi.jsx"), /<GameStage sport=\{sport\} className=\{`sb-vs/);
});

test("With a Friend (basketbol): oda ekranları RoomUi'den, oyun ekranları Versus bileşenlerinden; sunucu mesajları aynı", () => {
  const p = src("pages", "WithAFriendGame.jsx");
  for (const c of ["RoomEntry", "RoomGate", "RoomShare", "RoomSetup", "RoomNotice", "BasketballVersusDraft", "BasketballVersusLocked", "BasketballVersusHire", "BasketballVersusMatchup", "BasketballVersusSeries", "BasketballVersusFinal"]) {
    assert.match(p, new RegExp(`<${c}`), c);
  }
  for (const m of ["pick_era", "pick_player", "place_pos", "use_joker", "use_counter_joker", "confirm_ban", "dismiss_counter", "rearrange_slot", "ready_for_coaches", "pick_coach", "advance_series"]) {
    assert.match(p, new RegExp(`type: "${m}"`), m);
  }
  assert.doesNotMatch(p, /SeatPanel|FullCourtBoard|RoomLobby/);
});

test("futbol odası: giriş ve kod paylaşımı RoomUi'de", () => {
  const v = src("pages", "football", "FootballVersus.jsx");
  assert.match(v, /<RoomEntry sport="football"/);
  assert.match(v, /<RoomShare sport="football"/);
  assert.match(v, /<RoomGate sport="football"/);
});

test("Online (basketbol): Board ve Live yeni bileşenlerde, ağ mantığı yerinde", () => {
  const p = src("pages", "OnlineGame.jsx");
  assert.match(p, /<OnlineBoard /);
  assert.match(p, /<OnlineLive /);
  assert.match(p, /\/api\/game\/challenge/);
  assert.match(p, /\/ws\/game\/matchmaking/);
  assert.match(p, /board\/at-score/);
  assert.doesNotMatch(p, /FullCourtBoard|RoomLobby|QueuePanel/);
});

test("Faz 7: kural penceresi erişilebilir (odak, Tab döngüsü, Esc), iki spor aynı bileşeni kullanıyor", () => {
  const r = src("game", "RulesSheet.jsx");
  assert.match(r, /role="dialog" aria-modal="true"/);
  assert.match(r, /e\.key === "Escape"/);
  assert.match(r, /e\.key !== "Tab"/);
  assert.match(r, /prev\?\.focus/);
  assert.match(src("game", "ModeAboutModal.jsx"), /sport="basketball"/);
  assert.match(src("game", "football", "ModeAbout.jsx"), /sport="football"/);
  assert.match(src("game", "ui", "rules.css"), /max-width: 700px/);
});

test("Faz 7: hata durumu boş durumdan ayrı (liderlik), hareket azaltma sonsuz animasyonları durduruyor", () => {
  assert.match(src("game", "ui", "LeaderboardCard.jsx"), /role="alert"/);
  assert.match(src("game", "LeaderboardPanel.jsx"), /Could not load the leaderboard/);
  assert.match(src("game", "football", "LeaderboardPanel.jsx"), /onRetry/);
  assert.match(src("game", "ui", "versus.css"), /prefers-reduced-motion: reduce[\s\S]*animation: none/);
  assert.match(src("game", "ui", "sport-theme.css"), /--sb-faint: +#80808a/);
});
