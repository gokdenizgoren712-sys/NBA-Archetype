/* ONARIM Aşama 16 — web Inspector ve puanlama akışı (BUILD §9, §19–21).
   Saf kurallar doğrudan (inspectorView.js, collectibleState.js), çizim ve
   kalkan/eşik kuralları kaynak sözleşmesiyle. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TABS, defaultTab, entryDirty, entryFromDetail, inspectorPhase, matchLabel, positionShort, primaryAction, teamAbbr, toggleHalf,
} from "../src/rankit/web/inspectorView.js";
import { collectibleSentence } from "../src/rankit/collectibleState.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");
const web = (f) => src("rankit", "web", f);

const match = (over = {}) => ({
  status: "finished", score: "3 – 1", my_rating: null,
  home: { name: "Arsenal", short: "Arsenal" }, away: { name: "Tottenham Hotspur", short: "Tottenham" }, ...over,
});

test("§9 beş evre, sekmeler değişmez, bitmiş maçta önce Community", () => {
  assert.deepEqual(TABS, ["Match", "Community", "Companion"]);
  assert.equal(inspectorPhase(match({ status: "upcoming" })), "scheduled");
  assert.equal(inspectorPhase(match({ status: "upcoming", lineups: [{}] })), "lineup");
  assert.equal(inspectorPhase(match({ status: "live" })), "live");
  assert.equal(inspectorPhase(match()), "unrated");
  assert.equal(inspectorPhase(match({ my_rating: 4 })), "rated");
  assert.equal(defaultTab("unrated"), "Community");
  assert.equal(defaultTab("rated"), "Community");
  assert.equal(defaultTab("live"), "Match");
  assert.equal(defaultTab("scheduled"), "Match");
});

test("§9 tablosu: evre başına tek birincil eylem; puansız davet yıldız gelene kadar pasif (§9.3)", () => {
  assert.equal(primaryAction("Match", "scheduled").kind, "watchlist");
  assert.equal(primaryAction("Match", "lineup", { watchlisted: true }).label, "In your watchlist");
  assert.equal(primaryAction("Match", "live").label, "Watch with your Companion");
  assert.equal(primaryAction("Match", "unrated").label, "Rate this match");
  assert.equal(primaryAction("Match", "rated"), null);                    // "—"
  assert.deepEqual(primaryAction("Community", "unrated", { rating: 0 }), { kind: "log", label: "Log this match", disabled: true });
  assert.equal(primaryAction("Community", "unrated", { rating: 3.5 }).disabled, false);
  assert.equal(primaryAction("Community", "rated", { rating: 4, dirty: false }), null);
  assert.equal(primaryAction("Community", "rated", { rating: 4, dirty: true }).label, "Update your entry");
  assert.equal(primaryAction("Community", "live", { rating: 4 }), null);   // canlıda puan yok (§9.1)
  assert.equal(primaryAction("Companion", "live"), null);                 // çubuğu CompanionPanel'in
});

test("başlık etiketi: skor yalnız oynanmış maçta ve kalkan kapatmıyorsa", () => {
  assert.equal(teamAbbr({ short: "Tottenham" }), "TOT");
  assert.equal(teamAbbr({ short: "PSG" }), "PSG");
  assert.equal(matchLabel(match()), "ARS 3–1 TOT");
  assert.equal(matchLabel(match(), { scoreHidden: true }), "ARS vs TOT");
  assert.equal(matchLabel(match({ status: "upcoming", score: null })), "ARS vs TOT");
});

test("klavye yarım yıldız, taslak farkı, mevki kısaltması", () => {
  assert.equal(toggleHalf(4), 3.5);
  assert.equal(toggleHalf(3.5), 4);
  assert.equal(toggleHalf(0), 0);
  const saved = entryFromDetail({ my_rating: 4, my_classic: false, my_tags: ["Upset"], my_review: "x", my_potm_id: 7, my_respect_ids: [3, 9] });
  assert.equal(entryDirty({ ...saved }, saved), false);
  assert.equal(entryDirty({ ...saved, respect: [9, 3] }, saved), false);   // sıra fark değil
  assert.equal(entryDirty({ ...saved, classic: true }, saved), true);
  assert.equal(entryDirty({ ...saved, review: "y" }, saved), true);
  assert.equal(positionShort("Keeper"), "GK");
  assert.equal(positionShort("Attacker"), "FW");
});

test("7e cümlesi yalnız olanı söyler: seri ancak uç ilerlettiyse", () => {
  assert.equal(collectibleSentence({ rating: 5, classic: true }, 1), "Five stars, stamped a Classic. It's on your shelf and in tonight's streak.");
  assert.equal(collectibleSentence({ rating: 3.5, classic: false }, 0), "3.5 stars. It's on your shelf.");
  assert.equal(collectibleSentence({ rating: 4 }, null), "Four stars. It's on your shelf.");
});

test("15z yazdıkça kaydeder — gövdede YALNIZ inceleme; rating alanı hiç gitmez", () => {
  const s = web("Inspector.jsx");
  assert.match(s, /rankitApi\.log\(\{ match_id: detail\.id, entry_id: entryId, review: text, tz_offset: tzOffset\(\) \}\)/);
  const persist = s.slice(s.indexOf("const persist = async"), s.indexOf("useEffect(() => () => clearTimeout"));
  assert.doesNotMatch(persist, /rating/);
  // Kayıt yoksa taslak yerelde kalır, "Log" ile gider.
  assert.match(s, /if \(!entryId \|\| text === lastSaved\.current\) return;/);
});

test("Log / Update telefonla aynı yoldan: saveRating → createCollectible → 7e", () => {
  for (const f of ["Inspector.jsx", "QuickRate.jsx"]) {
    const s = web(f);
    assert.match(s, /await saveRating\(\{/, f);
    assert.match(s, /onCollectible\?\.\(createCollectible\(/, f);
    assert.match(s, /\.\.\.ratingField\(\{ touched: true, hasEntry: !!entryId, rating/, f);
  }
});

test("§3.1 / §5.5: 11a puanlamadan önce kalabalığı göstermez; Classic yüzdesi 20 puan altında yok", () => {
  const code = web("QuickRate.jsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /CROWD|communityHeat|community_rating/);
  assert.match(web("Inspector.jsx"), /const classicPct = count >= MIN_COMMUNITY_RATINGS && detail\.classic_count != null/);
});

test("§11.3 respect elmas, asla kalp; eski modal Inspector ve Watchalong emekli", () => {
  const review = web("ReviewArticle.jsx");
  assert.doesNotMatch(review, /Heart/);
  assert.match(review, /className=\{`riw-respect\$\{liked \? " on" : ""\}`\}/);
  const root = web("RankItWeb.jsx");
  assert.doesNotMatch(root, /function (Inspector|WatchalongPanel|ReviewArticle)\(/);
  assert.doesNotMatch(root, /riw-inspect-wrap" onClick=\{onClose\}>\s*<section className="riw-inspect"[^>]*aria-label="Match"/);
});

test("§19 yerleşim: 468 sağa sabit, ray çekilir; 7e 452 + 400, 60 aralık, .88 perde; 11a 560", () => {
  const css = web("rankit-inspector.css");
  assert.match(css, /\.riw\.has-inspector \{ grid-template-columns: minmax\(0, 1fr\) 468px; \}/);
  assert.match(css, /\.riw\.has-inspector \.riw-rail \{ display: none; \}/);
  assert.match(css, /\.riw-insp-head \{[^}]*height: 56px;/);
  assert.match(css, /\.riw-moment \{[^}]*background: rgba\(9, 10, 11, \.88\)/);
  assert.match(css, /\.riw-moment-stage \{[^}]*gap: 60px;/);
  assert.match(css, /\.riw-moment-card \{ width: 452px;/);
  assert.match(css, /\.riw-moment-copy \{ width: 400px;/);
  assert.match(css, /\.riw-quick \{\s*width: min\(560px, 100%\);/);
  // §6: yıldız = düğme, en az 44; kısa sekme 44.
  assert.match(css, /\.riw-rate button \{\s*min-width: 44px; min-height: 44px;/);
  assert.match(css, /\.riw-insp-tabs button::before \{[^}]*width: max\(100%, 44px\)/);
});

test("§20 R duvarın kartını puanlar: hover ya da klavye odağı; tam zamandan önce yalnız not", () => {
  const root = web("RankItWeb.jsx");
  assert.match(root, /if \(card\.raw\.status !== "finished"\) \{ setShortcutNote\("Ratings open at full time\."\); return; \}/);
  const cards = web("cards.jsx");
  assert.match(cards, /onMouseEnter=\{\(\) => hover\?\.\(card\)\}/);
  assert.match(cards, /if \(event\.key === "r" \|\| event\.key === "R"\) hover\?\.\(card\);/);
});
