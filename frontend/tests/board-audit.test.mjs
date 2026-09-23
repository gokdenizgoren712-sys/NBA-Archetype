/* 2026-09-24 tahta denetimi — 2a/2b (Home), 2q (Friends), 2i/3d (yarışma),
   2f/2g/15a (maç sayfasının başı), 3j (hızlı puanlama), 3e/3f küçük kusurlar.
   Saf yardımcılar + kaynak sözleşmesi; ağ yok. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tonightRows, tonightLabel, tonightStatus } from "../src/rankit/redesign/homeTonight.js";
import {
  feedAgo, feedSub, initials, collectionLine, collectionPercent, feedCardMatch, verdictCovered,
} from "../src/rankit/redesign/feedItems.js";
import { competitionEyebrow, competitionSub, currentStage } from "../src/rankit/redesign/competitionHead.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", "src", "rankit", ...p), "utf8");
const NOW = Date.parse("2026-09-23T20:00:00Z");

test("2a: gunun listesi canli once, sonra saat, en sonda bitenler", () => {
  const rows = tonightRows([
    { id: 1, status: "finished", starts_at: "2026-09-23T17:00:00Z" },
    { id: 2, status: "upcoming", starts_at: "2026-09-23T21:00:00Z" },
    { id: 3, status: "live", starts_at: "2026-09-23T19:00:00Z" },
    { id: 4, status: "upcoming", starts_at: "2026-09-23T20:30:00Z" },
  ]);
  assert.deepEqual(rows.map((m) => m.id), [3, 4, 2, 1]);
  assert.equal(tonightLabel(4), "TONIGHT · 4 MATCHES");
  assert.equal(tonightLabel(1, true), "TODAY · 1 MATCH");
});

test("2a: satir durumu — canli 'LIVE · 73'' + Join, bayat kaynak LIVE demez, bitmis ve puanlanmamis 'Rate'", () => {
  const live = tonightStatus({ status: "live", live_minute: "73", sport: "Football", updated_at: new Date(NOW).toISOString() }, NOW);
  assert.equal(live.action, "Join");
  assert.match(live.text, /^(LIVE · 73'|DELAYED)$/);
  assert.deepEqual(tonightStatus({ status: "finished" }), { kind: "finished", text: "FULL TIME", action: "Rate" });
  assert.equal(tonightStatus({ status: "finished", my_rating: 4 }).action, null, "puanladiysan 'Rate' yok");
  assert.equal(tonightStatus({ status: "upcoming", time: "21:00" }).text, "KICK-OFF 21:00");
});

test("2q: alt satir ve zaman — bolgesiz SQLite zamani UTC okunur", () => {
  assert.equal(feedAgo("2026-09-23 18:00:00", NOW), "2h ago", "UTC, yerel degil");
  assert.equal(feedAgo("2026-09-23T19:59:40Z", NOW), "just now");
  assert.equal(feedAgo("2026-09-22 20:00:00", NOW), "yesterday");
  assert.equal(feedSub({ kind: "entry", on_the_night: true, at: "2026-09-23 18:00:00" }, NOW), "on the night · 2h ago");
  assert.equal(feedSub({ kind: "collection", at: "2026-09-23 15:00:00" }, NOW), "closed a collection · 5h ago");
  assert.equal(initials("@deniz"), "DE");
});

test("2q: koleksiyon cumlesi ve halka yuzdesi uctan", () => {
  assert.deepEqual(collectionLine({ title: "Madrid Derbies", collected: 6, total: 6, kind: "club_season" }),
    { title: "Madrid Derbies", tail: "— 6 of 6 rated this season." });
  assert.equal(collectionLine({ title: "Every London Derby", collected: 12, total: 12, kind: "curated" }).tail, "— 12 of 12 rated.");
  assert.equal(collectionPercent({ collected: 7, total: 12 }), 58);
  assert.equal(collectionPercent({ collected: 0, total: 0 }), null);
});

test("2q: kart ARKADASIN, isi toplulugun; puanlamadiysan hukum kapali (§3.1)", () => {
  const item = { kind: "entry", viewer_rated: false, match: { id: 1, status: "finished", home_short: "ARS", away_short: "TOT",
    home_score: 3, away_score: 1, community_rating: null, rating_count: 4, home_color: "#c8202f" } };
  const m = feedCardMatch(item);
  assert.equal(m.score, "3 – 1");
  assert.equal(m.my_rating, null);
  assert.equal(m.home.color, "#c8202f");
  assert.equal(verdictCovered(item), true);
  assert.equal(verdictCovered(item, true), false, "Reveal anyway acar");
  assert.equal(verdictCovered({ ...item, viewer_rated: true }), false);
});

test("2i: baslik uctan — ulke · sezon, spor · kulup sayisi · oynanmis son hafta", () => {
  const detail = {
    competition: { country: "England", season: "2026/27", sport: "Football" },
    standings: Array.from({ length: 20 }, () => ({})),
    matchweeks: [{ stage: "Matchweek 3", finished: 10 }, { stage: "Matchweek 4", finished: 7 }, { stage: "Matchweek 5", finished: 0 }],
  };
  assert.equal(competitionEyebrow(detail.competition), "ENGLAND · 2026/27");
  assert.equal(currentStage(detail.matchweeks), "Matchweek 4");
  assert.equal(competitionSub(detail), "Football · 20 clubs · Matchweek 4");
  assert.equal(competitionSub({ competition: { sport: "Basketball" }, standings: [{}, {}], matchweeks: [] }), "Basketball · 2 teams");
});

test("kaynak: denetimde duzeltilen baglantilar yerinde", () => {
  const app = read("RankItPrototype.jsx");
  const css = read("rankit-v030.css");
  // 2a/2b: tek kalkan kontrolu; ikinci "Hide scores" yalniz bayrak kapaliyken.
  assert.match(app, /\{!RANKIT_NEW_CARD && <button className=\{`ri-hide-score/);
  assert.match(app, /className="ri-shield-row"/);
  assert.match(css, /\.ri-shield\.on\{color:#3fb08c/, "kalkan acikken yesil (tahta), altin degil");
  // 2a: hero'nun altinda gunun listesi.
  assert.match(app, /<section className="ri-section ri-tonight">/);
  // 2q: Friends takip ettiklerinin akisi (/activity), Home akisi degil.
  assert.match(app, /<FriendsFeed hideScores=\{hideScores\}/);
  assert.match(read("rankitApi.js"), /activity: \(\{ scope = "following"/);
  // 2f/2g: Match sekmesinde hero, digerlerinde kompakt satir.
  assert.match(app, /\{section === "Match" \? <div className="ri-v03-hero is-2f">/);
  assert.match(app, /<div className="ri-sheet-compact">/);
  // 3d: POTM cetveli istenebilir (varsayilan sunucunun ilk cetveli).
  assert.match(read("redesign", "CompetitionPlayers.jsx"), /potm: "Player of the Match"/);
  // 3j: "Last 7 days" kapali kart.
  assert.match(app, /aria-expanded=\{catchupOpen\}/);
  // 3f + tum diyaloglar: programatik odaklanan panelde tarayici halkasi yok.
  assert.match(css, /\[role="dialog"\]\[tabindex="-1"\]:focus\{outline:none\}/);
  // 3e: arama sayfasinda halka hapta, icteki kutu yok.
  assert.match(css, /\.ri-find-field input:focus-visible\{outline:0\}/);
});
