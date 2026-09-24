/* Günlük — ekranlar 2d / 2e ve sahibin kararı (2026-09-23): filtreler
   sayfanın üstünde pill olarak değil, "Newest" tetikleyicisinin açtığı barda. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  statLine, triggerLabel, sortDiary, sortWatchlist, sortsFor, filterDiary, groupsByMonth,
  heatStrip, dayParts, monthLabel, rowTitle, rowHeat, localDay, STRIP_EMPTY,
} from "../src/rankit/redesign/diaryView.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", "src", "rankit", ...p), "utf8");

const E = (id, watched_date, rating, extra = {}) => ({ id, match_id: 100 + id, watched_date, rating, ...extra });

test("2e: sayim satiri tahtadaki kalipta", () => {
  const entries = [E(1, "2026-09-20", 4, { classic: 1 }), E(2, "2026-09-21", 3)];
  assert.equal(statLine({ entries }), "2 WATCHED · 1 CLASSIC");
  assert.equal(statLine({ show: "Classics", entries }), "1 CLASSIC");
  assert.equal(statLine({ show: "Watchlist", watchlist: [{}, {}, {}] }), "3 ON YOUR WATCHLIST");
  assert.equal(statLine({ show: "Lists", lists: [{}] }), "1 LIST");
  assert.equal(statLine({ entries: Array.from({ length: 142 }, (_, i) => E(i, "2026-09-01", 3, { classic: i < 11 })) }),
    "142 WATCHED · 11 CLASSICS");
});

test("sayim Profile (6b) ile ayni: tekrar izleme ikinci mac degil, Classic puanli damga", () => {
  const entries = [
    E(1, "2026-09-20", 4, { match_id: 7, classic: 1 }),
    E(2, "2026-09-22", 5, { match_id: 7, classic: 1 }),   // ayni macin tekrar izlemesi
    E(3, "2026-09-21", null, { match_id: 8, classic: 1 }), // puansiz damga sayilmaz
    E(4, "2026-09-21", 3, { match_id: 9 }),
  ];
  assert.equal(statLine({ entries }), "3 WATCHED · 1 CLASSIC");
});

test("tetikleyici varsayilanda yalniz 'Newest' (tahta), baska gorunumde onu da soyler", () => {
  assert.equal(triggerLabel("Watched", "Newest"), "Newest");
  assert.equal(triggerLabel("Classics", "Top rated"), "Classics · Top rated");
  assert.equal(triggerLabel("Watchlist", "Match date"), "Watchlist · Match date");
  assert.equal(triggerLabel("Lists", null), "Lists");
  assert.deepEqual(sortsFor("Lists"), [], "listelerin siralamasi yok");
});

test("siralamalar: Newest uc sirasi, Oldest ters, Top rated kendi puanin (puansiz en sonda)", () => {
  const list = [E(1, "2026-09-10", 3), E(2, "2026-09-12", null), E(3, "2026-09-12", 5), E(4, "2026-09-01", 4)];
  assert.deepEqual(sortDiary(list, "Newest").map((e) => e.id), [3, 2, 1, 4]);
  assert.deepEqual(sortDiary(list, "Oldest").map((e) => e.id), [4, 1, 2, 3]);
  assert.deepEqual(sortDiary(list, "Top rated").map((e) => e.id), [3, 4, 1, 2]);
  assert.deepEqual(filterDiary([E(1, "x", 3, { classic: 1 }), E(2, "x", 3)], "Classics").map((e) => e.id), [1]);
  assert.ok(groupsByMonth("Newest") && groupsByMonth("Oldest") && !groupsByMonth("Top rated"));
  const w = [{ id: 1, competition: "B", starts_at: "2026-10-02" }, { id: 2, competition: "A", starts_at: "2026-10-01" }];
  assert.deepEqual(sortWatchlist(w, "Match date").map((m) => m.id), [2, 1]);
  assert.deepEqual(sortWatchlist(w, "Competition").map((m) => m.id), [2, 1]);
  assert.deepEqual(sortWatchlist(w, "Added").map((m) => m.id), [2, 1]);
});

test("2d isi seridi: boy senin yildizin, renk topluluk isisi — isi yoksa renk YOK", () => {
  const today = new Date(2026, 8, 23, 20, 0);
  const strip = heatStrip([
    E(1, "2026-09-23", 5, { community_rating: 4.6 }),
    E(2, "2026-09-23", 2),
    E(3, "2026-09-20", 3),                          // topluluk isisi yok (§5.5)
    E(5, "2026-09-18", null, { community_rating: 4.2 }), // yildizsiz: hukum kapali (§3.1)
    E(4, "2026-08-01", 5, { community_rating: 3 }), // 28 gecenin disinda
  ], today);
  assert.equal(strip.nights.length, 28);
  assert.equal(strip.nights[27].date, "2026-09-23");
  assert.equal(strip.nights[0].date, "2026-08-27");
  assert.equal(strip.logged, 3);
  assert.equal(strip.nights[22].color, null, "yildizsiz gecede topluluk rengi yok");
  assert.deepEqual([strip.nights[27].height, strip.nights[27].color], [100, "#f5402e"], "gecenin en yuksek puanlisi");
  assert.equal(strip.nights[24].color, null, "20 puanin altinda renk uydurulmaz");
  assert.equal(strip.nights[24].height, 60);
  assert.equal(strip.nights[0].height, STRIP_EMPTY);
  assert.equal(localDay(new Date(2026, 0, 5, 0, 30)), "2026-01-05", "yerel gun, UTC degil");
});

test("2d satiri: gun + hafta gunu, 'Arsenal 3–1 Tottenham', skor gizliyse 'vs'", () => {
  assert.deepEqual(dayParts("2026-09-14"), { day: "14", weekday: "MON" });
  assert.equal(monthLabel("2026-09-14"), "September 2026");
  const e = { home_short: "Arsenal", away_short: "Tottenham", home_score: 3, away_score: 1 };
  assert.equal(rowTitle(e), "Arsenal 3–1 Tottenham");
  assert.equal(rowTitle(e, true), "Arsenal vs Tottenham");
  assert.equal(rowHeat({ rating: 4, community_rating: null }), null);
  assert.equal(rowHeat({ rating: 4, community_rating: 2.6 }), "#9a3f96");
  assert.equal(rowHeat({ rating: null, community_rating: 4.6 }), null, "§3.1: yildizsiz kayitta hukum kapali");
});

test("kaynak: filtreler sayfanin ustunde degil, 'Newest' barinda", () => {
  const app = read("RankItPrototype.jsx");
  const view = app.slice(app.indexOf("function ActivityView"), app.indexOf("function ProfileView"));
  assert.doesNotMatch(view, /\["Watched","Watchlist","Classics","Lists"\]\.map/, "pill satiri geri gelmis");
  assert.doesNotMatch(view, /className="ri-diary-toolbar"/);
  assert.match(view, /aria-expanded=\{barOpen\}/);
  assert.match(view, /\{barOpen && <DiaryFilterBar /);
  assert.match(view, /<DiaryHeatStrip /);
  const css = read("rankit-v030.css");
  assert.match(css, /\.ri-diary-cards\.is-redesign>div\{[^}]*background:none[^}]*clip-path:none/,
    "rafta eski kutu ikinci cerceve ciziyor");
  assert.match(css, /\.ri-dbar \.ri-diary-filters button\{[^}]*min-height:48px/, "§6: filtre secenekleri 48px");
});
