/* ONARIM Aşama 17 — masaüstünün kazandığı ekranlar (BUILD §22).
   7f raf · 7g sezon ısı haritası · 7h iki sütunlu okuma. Saf kurallar
   doğrudan (pagesView.js), yönlendirme/kapı/hedef kuralları kaynak
   sözleşmesiyle. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEARCH_TABS, TIER_COUNT, agreementView, avgHeatCell, cardEyebrow, clubLine, compactCardProps, currentWeek, dateEyebrow, dayMonth, heatCell,
  huntGrid, kickoffEyebrow, leaningLine, listLine, listProgress, nextLine, ordinal, ownedListLine, personLine, personStats, rankCard, savedListLine,
  searchTabLabel, searchTotal, shelfCardProps, shelfGroups, spreadBars, stageShort, standingColumns, weekNumber, weekPlayed, weekWindow,
  DISCOVER_SORTS, activeFilterCount, diaryNights, discoverEmpty, discoverEyebrow, discoverFilters, discoverParams, facetCount, feedReviewRow,
  heatFloorLabel, notificationGroups, shieldNotification, skinCounts, skinThumbCard, welcomeSteps,
} from "../src/rankit/web/pagesView.js";
import { RAMP } from "../src/rankit/redesign/heat.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");
const web = (f) => src("rankit", "web", f);
const code = (f) => web(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const css = () => web("rankit-pages.css");

const card = (over = {}) => ({
  id: 7, sport: "Football", status: "finished", score: "2 – 1", competition: "Premier League",
  home: { name: "Arsenal" }, away: { name: "Chelsea" }, heat: 4.2, rating_count: 40,
  entry: { id: 91, rating: 4.5, classic: true, skin: "gold" }, my_rating: null, ...over,
});

test("7f kendi rafın: kart senin puanınla ve Classic damganla boyanır", () => {
  const p = shelfCardProps(card(), { own: true });
  assert.equal(p.ratingKind, "personal");
  assert.equal(p.heat, 4.5);
  assert.equal(p.heatLabel, "YOUR RATING");
  assert.equal(p.classic, true);
  assert.equal(p.ratings, "", "Classic yalnız göz etiketindeki elmas (tahta ratings=\"\")");
  assert.equal(p.aria, "your rating 4.5, your Classic");
  assert.equal(p.profileShelf, true, "174px: durum satırı yok");
  assert.equal(p.skin, "gold");
  assert.equal(p.hasVerdict, false);
});

test("§3.1 başkasının rafı: maçı puanlamadıysan onun puanı ve damgası kapalı", () => {
  const covered = shelfCardProps(card(), { own: false });
  assert.equal(covered.heat, 0);
  assert.equal(covered.classic, false);
  assert.equal(covered.ratings, "");
  assert.equal(covered.hasVerdict, false);
  assert.equal(covered.skin, "gold", "kart yine sahibinin skiniyle çizilir");
  assert.equal(covered.aria, "", "okunur cümle de hükmü sızdırmaz");
  const open = shelfCardProps(card({ my_rating: 3 }), { own: false });
  assert.equal(open.heat, 4.5);
  assert.equal(open.heatLabel, "THEIR RATING");
  assert.equal(open.aria, "their rating 4.5, their Classic");
});

test("7f 'By competition' ardışık kartları tek başlık altında toplar; diğer sıralar tek grup", () => {
  const cards = [card({ id: 1 }), card({ id: 2 }), card({ id: 3, competition: "LaLiga" }), card({ id: 4, competition: null })];
  assert.deepEqual(shelfGroups(cards, "newest"), [{ title: null, cards }]);
  const groups = shelfGroups(cards, "competition");
  assert.deepEqual(groups.map((g) => [g.title, g.cards.length]), [["Premier League", 2], ["LaLiga", 1], ["Other", 1]]);
});

test("7g hücre: rampa rengi, 5'te ışıma, 20 altı kesikli, oynanmamış ve boş ayrı; her biri okunur etiketli (§6)", () => {
  const hot = heatCell({ week: 12, state: "heat", heat: 4.8, ratings: 64, logged: true }, "Arsenal");
  assert.equal(hot.kind, "heat");
  assert.equal(hot.color, RAMP[4]);
  assert.equal(hot.glow, true);
  assert.equal(hot.label, "Arsenal, matchweek 12: heat 4.8 from 64 ratings, you logged it");
  const mild = heatCell({ week: 3, state: "heat", heat: 2.4, ratings: 25 }, "Arsenal");
  assert.equal(mild.color, RAMP[1]);
  assert.equal(mild.glow, false);
  const few = heatCell({ week: 4, state: "too_few", ratings: 7 }, "Arsenal");
  assert.equal(few.kind, "too_few");
  assert.equal(few.color, undefined, "20 puan altında uydurma renk yok (§5.5)");
  assert.match(few.label, /too few ratings \(7\)/);
  assert.equal(heatCell({ week: 30, state: "unplayed" }, "Arsenal").kind, "unplayed");
  assert.equal(heatCell({ week: 5, state: "none" }, "Arsenal").kind, "none");
});

test("7g hafta başlığı: o hafta hiç oynanmış maç yoksa sönük", () => {
  const clubs = [
    { cells: [{ state: "heat" }, { state: "unplayed" }, { state: "none" }] },
    { cells: [{ state: "none" }, { state: "unplayed" }, { state: "too_few" }] },
  ];
  assert.deepEqual([0, 1, 2].map((i) => weekPlayed(clubs, i)), [true, false, true]);
});

test("7h RATING SPREAD: 20 altı yok (§5.5); beş çubuk, en yüksek %100, rampa rengi", () => {
  assert.equal(spreadBars(null), null);
  const bars = spreadBars({ 1: 1, 2: 0, 3: 10, 4: 20, 5: 5 });
  assert.deepEqual(bars.map((b) => b.pct), [5, 0, 50, 100, 25]);
  assert.deepEqual(bars.map((b) => b.color), RAMP);
  assert.deepEqual(bars.map((b) => b.star), [1, 2, 3, 4, 5]);
  assert.equal(spreadBars({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 400 })[0].pct, 4, "tek puan bile görünür bir çizgi");
});

test("yönlendirme: /rankit öneki web yüzeyi, sıradan sayfalar dışarıda; dört yeni rota", () => {
  const app = src("App.jsx").replace(/\r\n/g, "\n");
  const body = app.match(/function cleanPath[\s\S]*?\n}\n\nfunction isRankItWeb\(pathname\) \{[\s\S]*?\n}\n/)[0];
  const plain = app.match(/const RANKIT_PLAIN_PAGES = \[[\s\S]*?\];/)[0];
  const isRankItWeb = new Function(`${plain}\n${body}\nreturn isRankItWeb;`)();
  for (const path of ["/rankit", "/rankit/", "/rankit/shelf", "/rankit/member/4/shelf", "/rankit/competition/2/heat", "/rankit/match/9/reviews"]) {
    assert.equal(isRankItWeb(path), true, path);
  }
  for (const path of ["/rankit/app", "/rankit/download", "/rankit/mobile-auth", "/rankit/_preview/match-card", "/rankitx", "/players"]) {
    assert.equal(isRankItWeb(path), false, path);
  }
  for (const route of ["/rankit/shelf", "/rankit/member/:memberId/shelf", "/rankit/competition/:competitionId/heat", "/rankit/match/:matchId/reviews"]) {
    assert.match(app, new RegExp(`path="${route.replace(/[/:]/g, (c) => `\\${c}`)}"\\s+element=\\{<RankItWeb section="\\w+" />\\}`), route);
  }
});

test("ray yalnız ana sayfa ve Discover'da; diğer sayfalar tam genişlik", () => {
  const shell = code("RankItWeb.jsx");
  assert.match(shell, /const RAIL_SECTIONS = new Set\(\["home", "discover"\]\);/);
  assert.match(shell, /\{withRail && \(section === "discover"/);
  // 8a: Discover'da ray süzgeçlerin kendisi (§23.1 — çekmece yok), ana sayfada 7a rayı.
  assert.match(shell, /<aside className="riw-rail riw-filter-rail" aria-label="Filters">/);
  assert.match(shell, /: <WebRail isLoggedIn=/);
  assert.match(shell, /\$\{withRail \? "" : " no-rail"\}/);
  assert.match(css(), /\.riw\.no-rail:not\(\.has-inspector\) \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test("7f: yedi sütun 1440'ta, görünür sıralar (açılır liste yok), yüzerli sayfa", () => {
  const shelf = code("ShelfPage.jsx");
  assert.match(css(), /\.riw-shelf-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(170px, 1fr\)\); gap: 13px;/);
  assert.match(shelf, /const PAGE = 100;/);
  assert.doesNotMatch(shelf, /<select/);
  assert.deepEqual([...shelf.matchAll(/\{ key: "(\w+)", label: "([^"]+)"/g)].map((m) => m[2]),
    ["Newest", "Highest rated", "Classics only", "By competition"]);
  assert.match(shelf, /crestSize=\{34\}/);
  assert.match(css(), /\.riw-shelf-slot \{ height: 174px;/);
});

test("7g: lejant zorunlu (rampa, altın elmas, kesikli); hücreler role=cell ve etiketli", () => {
  const heat = code("HeatMapPage.jsx");
  for (const text of ["COLD", "HOT", "YOU LOGGED IT", "TOO FEW RATINGS"]) assert.match(heat, new RegExp(`>${text}<`));
  assert.match(heat, /role="cell" aria-label=\{view\.label\} title=\{view\.label\}/);
  assert.match(heat, /132px repeat\(\$\{weeks\.length \|\| 1\}, minmax\(0, 1fr\)\)/);
  const c = css();
  assert.match(c, /\.riw-heat-cell \{ position: relative; height: 20px; border-radius: 3px; \}/);
  assert.match(c, /\.riw-heat-cell\.is-unplayed \{ background: rgba\(255, 255, 255, \.04\); \}/);
  assert.match(c, /\.riw-heat-cell\.is-too_few \{[^}]*dashed/);
});

test("7h: §3.1 kapısı, iki sütun, uzun metin kesilmez, sıralar görünür", () => {
  const read = code("ReviewsPage.jsx");
  assert.match(read, /communityVerdictCovered\(/);
  assert.match(read, /\{covered \|\| scoreHidden \? \(/);
  assert.match(read, /<CommunityVerdictGate /);
  assert.match(read, /\{!covered && !scoreHidden && \(/, "dağılım ve etiketler de hüküm — kapalıyken yok");
  assert.match(read, /variant="long"/);
  assert.match(read, /disabled: !isLoggedIn/);
  const c = css();
  assert.match(c, /\.riw-read \{ display: grid; grid-template-columns: 392px minmax\(0, 1fr\);/);
  assert.match(c, /\.riw-read-columns \{ column-count: 2; column-gap: 22px;/);
  assert.match(c, /\.riw-review-text p \{[^}]*font: 400 13px\/1\.65/);
  assert.doesNotMatch(c, /\.riw-review-text[^{]*\{[^}]*(line-clamp|text-overflow)/, "masaüstü kesmek zorunda değil");
  const article = code("ReviewArticle.jsx");
  assert.match(article, /split\(\/\\n\{2,\}\/\)/);
});

test("girişler: Inspector 'All N ›' okumaya, profil (8b) rafa (turnuva → 7g 8c testinde)", () => {
  assert.match(code("Inspector.jsx"), /<Link to=\{`\/rankit\/match\/\$\{detail\.id\}\/reviews`\} className="riw-insp-all" onClick=\{onMinimize\}>/,
    "okuma sayfası tam genişlik; denetçi küçülür, taslak köşede bekler");
  const shell = code("RankItWeb.jsx");
  assert.match(code("ProfilePage.jsx"), /<Link to="\/rankit\/shelf" className="riw-profile-more">Open the full wall ›<\/Link>/);
});

test("§6 hedefler ≥44 ve odak halkası; §1.5 tip tabanı 9px", () => {
  const c = css();
  assert.match(c, /\.riw-sortbar button \{[^}]*height: 38px;/);
  assert.match(c, /\.riw-sortbar button::after \{ content: ""; position: absolute; left: 0; right: 0; top: -3px; bottom: -3px; \}/);
  assert.match(c, /\.riw-review-long > footer button \{[^}]*min-height: 44px;/);
  assert.match(c, /\.riw-page-more button \{[^}]*min-height: 44px;/);
  assert.match(c, /\.riw-insp-all::after \{[^}]*top: -17px; bottom: -17px; \}/);
  assert.match(c, /\.riw-page :is\(button, a\):focus-visible \{ outline: 2px solid [^;]+; outline-offset: 2px; \}/);
  // §1.5 istisnası: 2j/11b skin karosu kartın küçük resmi (6.5–8.5px serbest) — yalnız o kurallar.
  const scanned = c.replace(/\.riw \.ri-skin[^{]*\{[^}]*\}/g, "");
  const sizes = [...scanned.matchAll(/font: \d+ ([\d.]+)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 10);
  const small = sizes.filter((s) => s < 9);
  assert.deepEqual(small, [], `9px altı yazı: ${small}`);
});

test("§1.2 altın bütçesi: seçili sıra nötr, altın değil", () => {
  const selected = css().match(/\.riw-sortbar button\[aria-pressed="true"\] \{([^}]*)\}/)[1];
  assert.match(selected, /rgba\(255, 255, 255, \.06\)/);
  assert.doesNotMatch(selected, /gold|#ffb11b/i);
});

test("paylaşılan kart: sayfa ve kart tek kapı; başkasının puanı 'YOU' değil", () => {
  const card = src("rankit", "redesign", "MatchCard.jsx");
  assert.match(card, /const communityRevealed = ownReveal \|\| props\.communityRevealed === true;/);
  assert.match(card, /if \(value\) props\.onCommunityReveal\?\.\(\);/);
  assert.match(card, /props\.ratingOwner === "member" \? "RATED " : "YOU "/);
  const read = code("ReviewsPage.jsx");
  assert.match(read, /communityRevealed=\{revealed\} onCommunityReveal=\{\(\) => setRevealed\(true\)\}/);
  assert.match(code("ShelfPage.jsx"), /Their ratings and Classics stay covered on matches you haven't rated\./);
});

/* ── 2. parti: 8c turnuva · 12a kulüp · 11c arama ─────────────────────────── */

test("8c/12a/11c yardımcıları: hafta kısaltması, göz etiketi, sıra eki", () => {
  assert.equal(stageShort("Matchday 4"), "MW4");
  assert.equal(stageShort("Round 12"), "R12");
  assert.equal(stageShort("Final"), "Final");
  assert.equal(cardEyebrow({ competition: "Premier League", stage: "Matchday 5" }), "PREMIER LEAGUE · MW5");
  assert.match(kickoffEyebrow("2026-09-20T15:30:00Z"), /^[A-Z]{3} \d{2}:\d{2}$/, "oynanmış: gün + saat (tahta: SAT 16:30)");
  assert.match(kickoffEyebrow("2026-10-10T13:30:00Z", { upcoming: true }), /^[A-Z]{3} \d{1,2} [A-Z]{3}$/, "oynanmamış: saat kartta — tekrar yok");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  assert.equal(ordinal(null), "");
});

test("8c şeridi: açılışta oynanan hafta; beşli pencere uçlarda kayar", () => {
  const weeks = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ stage: `Matchday ${n}`, matches: 10, finished: n <= 4 ? 10 : n === 5 ? 3 : 0 }));
  assert.equal(currentWeek(weeks), "Matchday 5");
  assert.equal(currentWeek(weeks.map((w) => ({ ...w, finished: 10 }))), "Matchday 7");
  assert.equal(currentWeek([]), null);
  const names = (list) => list.map((w) => weekNumber(w.stage)).join(",");
  assert.equal(names(weekWindow(weeks, "Matchday 1")), "1,2,3,4,5");
  assert.equal(names(weekWindow(weeks, "Matchday 4")), "2,3,4,5,6");
  assert.equal(names(weekWindow(weeks, "Matchday 7")), "3,4,5,6,7");
  assert.equal(names(weekWindow(weeks.slice(0, 3), "Matchday 2")), "1,2,3");
});

test("8c tablosu: futbolda P·GD·PTS (tahta), baskette W·L·DIFF; AVG HEAT 20 altında yok (§5.5)", () => {
  assert.deepEqual(standingColumns("Football").map((c) => c.label), ["P", "GD", "PTS"]);
  assert.deepEqual(standingColumns("Basketball").map((c) => c.label), ["W", "L", "DIFF"]);
  assert.equal(standingColumns("Football")[1].format(8), "+8");
  assert.equal(standingColumns("Football")[1].format(-3), "-3");
  const hot = avgHeatCell({ avg_heat: 4.3, heat_matches: 4 });
  assert.equal(hot.value, 4.3);
  assert.equal(hot.steps, 4);
  assert.match(hot.label, /Average heat 4\.3 across 4 rated matches/);
  const none = avgHeatCell({ avg_heat: null, heat_matches: 0 });
  assert.equal(none.value, null);
  assert.equal(none.steps, 0, "uydurma çubuk yok");
});

test("11c: sekme sayıları uçtan; All toplamı; kulüp/kişi/liste satırları", () => {
  const counts = { matches: 284, teams: 2, members: 24, lists: 8, players: 0, collections: 3 };
  assert.equal(searchTotal(counts), 318, "tahta: 318 RESULTS = 284+2+24+8");
  assert.deepEqual(SEARCH_TABS.map((t) => searchTabLabel(t, counts)), ["All", "Matches 284", "Clubs 2", "People 24", "Lists 8", "Players 0"]);
  assert.equal(clubLine({ season_competition: { name: "Premier League" }, season_avg_heat: 4.3 }), "Premier League · 4.3 avg heat");
  assert.equal(clubLine({ season_competition: { name: "WSL" }, season_avg_heat: null }), "WSL · too few ratings");
  assert.equal(personLine({ club: "Arsenal", club_logged: 31 }), "31 Arsenal matches logged");
  assert.equal(personLine({ club: { short_name: "Arsenal" }, club_logged: 1 }), "1 Arsenal match logged");
  assert.equal(personLine({ club: "Arsenal", club_logged: 0 }), "", "sıfır kayıt yazılmaz");
  assert.equal(listLine({ total: 12, username: "selin" }), "12 matches · by @selin");
});

test("12a NEXT: bu hafta 'Sunday 16:30', uzaksa tarih; avdaki koleksiyon", () => {
  const now = new Date("2026-10-08T10:00:00Z");
  assert.match(nextLine({ starts_at: "2026-10-11T15:30:00Z", collections: ["The 38"] }, now), /^[A-Z][a-z]+day \d{2}:\d{2} · counts toward The 38$/);
  assert.match(nextLine({ starts_at: "2026-10-25T15:30:00Z", collections: [] }, now), /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} · \d{2}:\d{2}$/);
});

test("topluluk kartı (8c/12a/11c): kompakt, sayı satırı yok, göz etiketi yüzeyden; kapı sığsın diye satır uzar", () => {
  const p = compactCardProps({ id: 1, sport: "Football", status: "finished", competition: "Premier League", stage: "Matchday 2",
    home: { name: "A" }, away: { name: "B" }, heat: 4, rating_count: 30 }, { eyebrow: "SAT 16:30" });
  assert.equal(p.compact, true);
  assert.equal(p.profileShelf, true);
  assert.equal(p.ratings, "");
  assert.equal(p.comp, "SAT 16:30");
  assert.match(css(), /\.riw-shelf-slot\.is-community \{ height: auto; min-height: 174px; \}/);
  for (const f of ["CompetitionPage.jsx", "ClubInspector.jsx", "SearchPage.jsx"]) {
    assert.match(code(f), /className="riw-card-slot riw-shelf-slot is-community"/, f);
  }
});

test("§23: turnuva kendi sayfası, kulüp Inspector'da (açık maç küçülür, taslak köşede)", () => {
  const shell = code("RankItWeb.jsx");
  assert.match(shell, /if \(kind === "competition"\) \{ setEntity\(null\); setClubId\(null\); navigate\(`\/rankit\/competition\/\$\{id\}`\); return; \}/);
  assert.match(shell, /if \(kind === "team"\) \{ setEntity\(null\); setInspectMinimized\(true\); setClubId\(id\); return; \}/);
  assert.match(shell, /const docked = \(!!inspectId && !inspectMinimized\) \|\| !!clubId;/);
  assert.match(shell, /onBackToMatch=\{inspectId \? restoreMatch : undefined\}/);
  assert.doesNotMatch(shell, /function CompetitionBody\(/, "çekmecedeki sekmeli turnuva gitti");
  const app = src("App.jsx");
  assert.match(app, /path="\/rankit\/competition\/:competitionId"\s+element=\{<RankItWeb section="competition" \/>\}/);
});

test("8c: tablo ve hafta yan yana, AVG HEAT sütunu, 7g bağlantısı; yalan takip durumu yok", () => {
  const page = code("CompetitionPage.jsx");
  assert.match(page, /<th scope="col" className="is-heat">AVG HEAT<\/th>/);
  assert.match(page, /<Link to=\{`\/rankit\/competition\/\$\{competitionId\}\/heat`\} className="riw-comp-heatlink">/);
  assert.doesNotMatch(page, /target_type: "competition"/, "uç turnuva için following döndürmüyor");
  assert.match(page, /onOpenClub=\{\(id\) => onOpenEntity\("team", id\)\}/);
  const c = css();
  assert.match(c, /\.riw-comp-left \{ width: 596px; flex: none;/);
  assert.match(c, /\.riw-comp-cards \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 13px; \}/);
  assert.match(c, /\.riw-comp-strip \{ display: flex; align-items: center; gap: 13px;/, "30 görünür + 13 aralık (§1.6 ölçeği): 44'lük dokunma alanları arasında boşluk kalmaz");
  assert.match(c, /\.riw-comp-pill::after, \.riw-comp-step::after \{ content: ""; position: absolute; inset: -7px; \}/);
});

test("12a: odak panele, Escape yalnız kulübü kapatır, küçük maç klavyeyi dinlemez", () => {
  const club = code("ClubInspector.jsx");
  assert.match(club, /heading\.current\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(club, /if \(event\.key !== "Escape" \|\| event\.defaultPrevented\) return;/);
  assert.match(club, /\{onBackToMatch && <button type="button" onClick=\{onBackToMatch\} aria-label="Back to the match">/);
  assert.match(club, /data\.venue\]\.filter\(Boolean\)/, "venue null → satırda yok");
  assert.match(code("Inspector.jsx"), /if \(panel\.current\?\.closest\("\[hidden\]"\)\) return;/);
  const insp = web("rankit-inspector.css");
  assert.doesNotMatch(insp, /\.riw-club-row/, "raydaki takip edilen kulüp satırıyla çakışmasın");
  assert.match(insp, /\.riw-club-foot button \{[^}]*height: 44px;/);
});

test("11c: tek istek (hottest), sekme adreste; sayfa kökü başlık arama alanıyla çakışmaz", () => {
  const page = code("SearchPage.jsx");
  assert.match(page, /rankitApi\.search\(term, "All", "All", "hottest"\)/);
  assert.match(page, /className="riw-page riw-results"/);
  assert.doesNotMatch(page, /"riw-page riw-search"/, "rankit-web.css .riw-search max-width 340");
  assert.match(code("RankItWeb.jsx"), /const searchTab = section === "search" \? \(searchParams\.get\("tab"\) \|\| "all"\) : "all";/);
  assert.match(src("rankit", "rankitApi.js"), /match_sort=\$\{encodeURIComponent\(matchSort\)\}/);
  const c = css();
  assert.match(c, /\.riw-search-follow::after, \.riw-search-state::after \{ content: ""; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; \}/);
  assert.match(c, /\.riw-search-follow, \.riw-search-state \{[^}]*min-width: 44px; height: 32px;/);
});

/* ── 3. parti: 8b profil · 10a kişiler · 12b listeler · 12c av ─────────────── */

test("8b kademe kartı: RANK N OF 7 (TIERS ile aynı sayı), sonraki kademeye çubuk", () => {
  const tiers = readFileSync(join(here, "..", "..", "api", "rankit_rank.py"), "utf8").match(/^TIERS = \[([\s\S]*?)^\]/m)[1];
  assert.equal([...tiers.matchAll(/\(\d+, "/g)].length, TIER_COUNT, "rankit_rank.TIERS ile TIER_COUNT ayrıştı");
  const card = rankCard({ rank: { tier: 4, name: "Terrace Regular", points: 2855, next_name: "Season Ticket", next_at: 3500, progress: 0.82 } });
  assert.equal(card.label, "RANK 4 OF 7");
  assert.equal(card.emblem, "04");
  assert.equal(card.pct, 82);
  assert.equal(card.next, "SEASON TICKET AT 3,500");
  assert.equal(rankCard({ rank: { tier: 7, name: "Archivist", points: 16000, progress: 1 } }).next, "TOP OF THE LADDER");
  assert.equal(rankCard(null), null);
});

test("§13.3 on ortak maçtan azsa yüzde yok; §13.1 çubuk tabanı (72% → üç)", () => {
  assert.equal(agreementView({ shared: 9, agree: 9, pct: 1, min_shared: 10 }).pct, null);
  assert.equal(agreementView({ shared: 6, agree: 4, pct: null }).long, "Only 6 shared matches — too few to compare taste");
  const a = agreementView({ shared: 77, agree: 62, pct: 0.805, min_shared: 10 });
  assert.deepEqual([a.pct, a.steps, a.color, a.long], [81, 4, RAMP[3], "62 of 77 shared"]);
  assert.equal(agreementView({ shared: 20, agree: 14, pct: 0.72 }).steps, 3);
  assert.equal(leaningLine(1.02), "Runs a full star hotter than you");
  assert.equal(leaningLine(-0.4), "Runs half a star colder than you");
  assert.equal(leaningLine(0.1), "Rates about the same as you");
  assert.equal(leaningLine(null), "");
  assert.equal(personStats({ matches: 284, classics: 31 }), "284 logged · 31 classics");
  assert.equal(personStats({ matches: 7, classics: 0 }), "7 logged");
});

test("12b satırları ve ilerleme; tarih üç harf (en-GB 'Sept' değil)", () => {
  assert.equal(ownedListLine({ match_count: 12, rated: 8, visibility: "public" }), "12 matches · 8 rated");
  assert.equal(ownedListLine({ match_count: 7, visibility: "private", respect: 9 }), "7 matches · private");
  assert.equal(ownedListLine({ match_count: 5, respect: 34, visibility: "public" }), "5 matches · 34 respects");
  assert.equal(savedListLine({ username: "deniz", match_count: 38 }), "by @deniz · 38 matches");
  assert.deepEqual(listProgress([{ my_rating: 4 }, { my_rating: null }, { my_rating: 2.5 }]), { rated: 2, total: 3, pct: 67 });
  assert.equal(dayMonth(new Date("2026-09-06T12:00:00Z")), "6 Sep");
  assert.equal(dateEyebrow("2026-09-28T12:00:00Z"), "28 SEP");
});

test("12c ızgara sırası: toplanan → oynanmış-puansız → sıradaki → kalanlar", () => {
  const grid = huntGrid({
    collected_matches: [{ id: 1 }], open_matches: [{ id: 2 }, { id: 3 }], upcoming_matches: [{ id: 4 }, { id: 5 }],
  });
  assert.deepEqual(grid.map((g) => `${g.kind}:${g.match.id}`), ["collected:1", "open:2", "open:3", "next:4", "missing:5"]);
  assert.deepEqual(huntGrid({}), []);
});

test("yönlendirme: kişiler, listeler (seçili), av (seçili); liste artık sayfa", () => {
  const app = src("App.jsx");
  for (const [route, section] of [["/rankit/people", "people"], ["/rankit/lists/:listId", "lists"], ["/rankit/hunt", "hunt"], ["/rankit/hunt/:collectionId", "hunt"]]) {
    assert.match(app, new RegExp(`path="${route.replace(/[/:]/g, (c) => `\\${c}`)}"\\s+element=\\{<RankItWeb section="${section}" \\/>\\}`), route);
  }
  const shell = code("RankItWeb.jsx");
  assert.match(shell, /if \(kind === "list"\) \{ setEntity\(null\); setClubId\(null\); navigate\(`\/rankit\/lists\/\$\{id\}`\); return; \}/);
  assert.doesNotMatch(shell, /function (Lists|Profile)\(/, "eski sekmeli profil ve liste yığını gitti");
  assert.doesNotMatch(shell, /\bdiscoverTab\b|setDiscoverTab/, "Discover sekme durumu (ve efektteki setState) kalktı");
  assert.match(shell, /onClick=\{\(\) => \{ if \(key === "lists"\) navigate\("\/rankit\/lists"\); \}\}/);
});

test("8b: sol sütun (kimlik, kademe, üç sayaç, üç satır), sağda raf + son girdiler; ayarlar dişlide, eksiksiz", () => {
  const page = code("ProfilePage.jsx");
  assert.match(page, /<Link to="\/rankit\/people\?tab=following"><b>\{\(stats\.following_people \?\? 0\)\.toLocaleString\(\)\}<\/b> following<\/Link>/);
  assert.match(page, /<Link to="\/rankit\/people\?tab=followers">followers<\/Link>/, "§13.2: erişim var, sayı yok");
  for (const to of ["/rankit/lists", "/rankit/hunt", "/rankit/shelf"]) assert.match(page, new RegExp(`to="${to.replace(/\//g, "\\/")}"`), to);
  assert.match(page, /rankitApi\.shelf\(\{ sort: "newest", limit: 5 \}\)/);
  assert.match(page, /aria-label="Settings" aria-pressed=\{view === "settings"\}/);
  const settings = code("SettingsPanel.jsx");
  for (const s of ["Broadcast country", "Hide scores by default", "Reduce motion", "Update RankIt", "Privacy policy"]) assert.match(settings, new RegExp(s), s);
  assert.match(css(), /\.riw-profile-side \{\s*width: 340px;/);
  assert.match(css(), /\.riw-profile-shelf \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); gap: 13px; \}/);
});

test("10a: §13.4 dört durum, altın yalnız iki eylemde; takipçi listesinin boyu da yazılmaz (§13.2)", () => {
  const page = code("PeoplePage.jsx");
  assert.match(page, /relationshipState\(value, !!person\.follows_you\)/);
  assert.match(page, /\{ key: "followers", label: "Followers" \}/);
  assert.match(page, /\{list && kind === "following" && <span>/);
  assert.match(page, /kind === "following" \? `\$\{remaining\.toLocaleString\(\)\} more` : "Show more"/);
  const c = css();
  assert.match(c, /\.riw-rel\.is-mutual \{ border-color: rgba\(63, 176, 140, \.4\); color: #3fb08c; \}/);
  assert.match(c, /\.riw-rel:is\(\.is-follow, \.is-follow-back, \.is-cta\) \{ background: var\(--ri-gold, #ffb11b\);/);
  const base = c.match(/\.riw-rel \{([^}]*)\}/)[1];
  assert.doesNotMatch(base, /gold|#ffb11b/, "FOLLOWING nötr");
  assert.match(c, /\.riw-rel::after \{ content: ""; position: absolute; left: 0; right: 0; top: -5px; bottom: -5px; \}/);
});

test("§24 liste ≠ koleksiyon: listede yazar + paylaş, koleksiyonda halka + ödül; bileşenler ayrı", () => {
  const lists = code("ListsPage.jsx");
  const hunt = code("HuntPage.jsx");
  assert.match(lists, /LIST BY @/);
  assert.match(lists, /Share<\/button>/);
  assert.doesNotMatch(lists, /ringFill|skin_reward/);
  assert.match(hunt, /ringFill\(pct\)/);
  assert.match(hunt, /FINISHING THIS UNLOCKS/);
  assert.doesNotMatch(hunt, /\bShare\b|respectList|saveList/);
  assert.equal((hunt.match(/rankitApi\.collection\(/g) || []).length, 1, "ayrıntı tek istek");
  assert.match(lists, /rankitApi\.listsMine\(\)/);
  assert.match(lists, /\{list\.visibility !== "private" && <button type="button" onClick=\{share\}>/, "özel liste paylaşılmaz");
  assert.match(lists, /rankitApi\.updateList\(list\.id, \{ title: title\.trim\(\), description, visibility, ranked \}\)/);
});

test("12b/12c karoları: kart olmayan maç kart gibi davranmaz (ısı, skor yok); hedefler ≥44", () => {
  const tile = code("MatchTile.jsx");
  assert.doesNotMatch(tile, /heat|score/i);
  assert.match(tile, /<button type="button" className=\{`riw-tile is-\$\{kind\}`\}/);
  const c = css();
  assert.match(c, /\.riw-tile \{\s*min-width: 0; min-height: 174px;/);
  assert.match(c, /\.riw-tile\.is-next \{ justify-content: space-between; background: #121315; border: 1px solid #d43a63; \}/);
  assert.match(c, /\.riw-hunt-grid \{ display: grid; grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); gap: 13px; \}/);
  assert.match(c, /\.riw-entry header button::after \{[^}]*top: -15px; bottom: -15px; \}/);
  assert.match(c, /\.riw-lists-new::after \{[^}]*top: -6px; bottom: -6px; \}/);
});

/* ── 4. parti: 11d · 8a · 14b · 14a · 11b · 8d ─────────────────────────────── */

test("11d günlük şeridi: 28 gece, boy senin yıldızın, renk topluluk ısısı (20 altı nötr, §5.5)", () => {
  const now = new Date(2026, 8, 25);
  const { nights, logged } = diaryNights([
    { watched_date: "2026-09-24", rating: 4, rating_count: 25, community_rating: 4.6 },
    { watched_date: "2026-09-24", rating: 2 },
    { watched_date: "2026-09-20", rating: 3, rating_count: 3, community_rating: 4.9 },
    { watched_date: "2026-07-01", rating: 5 },
  ], now);
  assert.equal(nights.length, 28);
  assert.equal(logged, 3, "28 geceden eskisi sayılmaz");
  const d24 = nights.find((n) => n.night === "2026-09-24");
  assert.deepEqual([d24.height, d24.color], [80, RAMP[4]]);
  const d20 = nights.find((n) => n.night === "2026-09-20");
  assert.equal(d20.color, "rgba(255,255,255,.28)", "20 puan altında uydurma ısı rengi yok");
  assert.equal(nights.find((n) => n.night === "2026-09-21").empty, true);
  assert.deepEqual(Object.keys(feedReviewRow({ entry_id: 8, user: { username: "deniz" }, respect: 2, respected: true, replies: 1, at: "x" })).sort(),
    ["classic", "created_at", "followed", "id", "is_mine", "on_the_night", "rating", "replies", "respect", "respected", "review", "spoiler", "username"]);
});

test("11d: akış solda (following / mutuals), kayıt sağda; Watchlist kaybolmadı; §3.1 kapısı akışta", () => {
  const page = code("ActivityPage.jsx");
  assert.match(page, /\{ key: "following", label: "Everyone you follow" \}/);
  assert.match(page, /\{ key: "mutuals", label: "Mutuals only" \}/);
  assert.match(page, /verdictCovered\(item, revealed\)/);
  assert.match(page, /item\.review_withheld \|\| covered \?/);
  assert.match(page, /rankitApi\.watchlist\(\)/);
  assert.match(page, /rankitApi\.catalog\(\{ status: "live", limit: 3 \}\)/);
  assert.match(css(), /\.riw-activity-side \{ width: 340px;/);
  assert.match(code("RankItWeb.jsx"), /activity: <ActivityPage scope=\{activityScope\}/);
});

test("8a: süzgeç durumu adreste; varsayılanlar yazılmaz; ray Discover'da süzgeçlerin kendisi (§23.1)", () => {
  const f = discoverFilters(new URLSearchParams("sport=Football&status=live&heat=3&sort=soonest&comp=Premier%20League"));
  assert.deepEqual(f, { sport: "Football", status: "live", competition: "Premier League", season: "All", minHeat: 3, when: "All", sort: "soonest" });
  assert.deepEqual(discoverParams({ ...f, sort: "hottest", minHeat: null }), { sport: "Football", status: "live", comp: "Premier League" });
  assert.equal(discoverFilters(new URLSearchParams("sort=bogus")).sort, "hottest");
  assert.equal(activeFilterCount(f), 4);
  assert.equal(discoverEyebrow(62, { ...f, competition: "All" }), "62 MATCHES · FOOTBALL · LIVE · 3.0+");
  assert.deepEqual(heatFloorLabel(3), { name: "Good", color: RAMP[2], text: "Rated Good or better · 3.0+" });
  assert.equal(facetCount({ sport: [{ value: "Football", count: 148 }] }, "sport", "Football"), 148);
  assert.equal(facetCount(null, "sport", "Football"), 0);
  assert.deepEqual(DISCOVER_SORTS.map((s) => s.label), ["Hottest", "Soonest", "Most reviewed"]);
  const filters = code("DiscoverFilters.jsx");
  for (const t of ["FILTERS", "SPORT", "STAGE", "MINIMUM HEAT", "COMPETITION"]) assert.match(filters, new RegExp(`>${t}<`), t);
  assert.doesNotMatch(code("RankItWeb.jsx"), /riw-drawer|filterOpen/, "çekmece yok");
  assert.match(css(), /\.riw-fopt \{[^}]*height: 40px;/);
  assert.match(css(), /\.riw-fgroup2 \{ display: flex; flex-direction: column; gap: 4px;/, "40 + 4 = 44 adım (§6)");
});

test("14b: başlıkta açılır menü, üç kanal; §15 kalkanda puanlamadığın maçın adı düşer; sıcak maç 13a gibi", () => {
  assert.deepEqual(notificationGroups([{ channel: "heat" }, { channel: "social" }, { channel: "weird" }, { channel: "collections" }]).map((g) => [g.label, g.items.length]),
    [["HEAT ALERTS", 1], ["SOCIAL", 2], ["COLLECTIONS", 1]]);
  const item = { match: "Arsenal vs Tottenham", viewer_rated: false };
  assert.equal(shieldNotification(item, false), item);
  assert.equal(shieldNotification({ ...item, viewer_rated: true }, true).match, "Arsenal vs Tottenham");
  const shielded = shieldNotification(item, true);
  assert.equal(shielded.match, "a match you haven't rated");
  assert.equal(shielded.shielded, true);
  const menu = code("NotificationsMenu.jsx");
  assert.match(menu, /import \{ AlertSentence \} from "\.\.\/redesign\/Alerts";/, "cümleler telefonla tek kaynak");
  assert.doesNotMatch(menu, /running hot\./i, "puanlanmamış maçta ısı hükmü yok");
  assert.match(menu, /has finished\./);
  assert.match(menu, /role="switch" aria-checked=\{heatOn\}/);
  assert.match(menu, /rankitApi\.saveSettings\(\{ alerts_running_hot: next \}\)/);
  assert.match(menu, /if \(item\.collection_id\) return navigate\(`\/rankit\/hunt\/\$\{item\.collection_id\}`\);/);
  assert.match(code("WebShell.jsx"), /\{isLoggedIn && bell\}/);
  assert.match(css(), /\.riw-switch::after \{[^}]*top: -10px; bottom: -10px; \}/);
});

test("14a: tek ekran; üç çizgi (bağlandın · seçtin · kalkana karar verdin); tanıdık sayısı uydurulmaz", () => {
  assert.deepEqual(welcomeSteps({ connected: true, picks: 2, shieldDecided: false }), [true, true, false]);
  assert.deepEqual(welcomeSteps({}), [false, false, false]);
  const page = code("WelcomePage.jsx");
  assert.match(page, /data\?\.primary_arch_connections \? `\$\{data\.primary_arch_connections\} people you know are already here` : ""/);
  assert.match(page, /rankitApi\.saveOnboarding\(\{ competitions: \[\.\.\.comps\], clubs: \[\.\.\.clubs\], skipped \}\)/);
  assert.match(page, /finish\(true, "\/rankit"\)/, "Skip kurulumu kapatır");
  const shell = code("RankItWeb.jsx");
  assert.match(shell, /if \(alive && d && d\.done === false\) navigate\("\/rankit\/welcome", \{ replace: true \}\);/);
  assert.match(shell, /if \(section === "welcome"\) \{/);
  assert.match(src("App.jsx"), /path="\/rankit\/welcome"\s+element=\{<RankItWeb section="welcome" \/>\}/);
});

test("11b: kilitli karo koşul gösterir (önizleme değil); önizleme canlı iki boyut; paylaşım görsel taklidi yapmaz", () => {
  const page = code("SkinPage.jsx");
  assert.match(page, /\{lines \? <LockedTile id=\{s\.id\} lines=\{lines\} \/> : <SkinThumb id=\{s\.id\} card=\{card\} \/>\}/);
  assert.match(page, /<SharedMatchCard \{\.\.\.wide\} skin=\{chosen\}/);
  assert.match(page, /<SharedMatchCard \{\.\.\.compact\} skin=\{chosen\}/);
  assert.doesNotMatch(page, /download|4:5|16:9/i, "dışa aktarım yokken oran düğmesi yok");
  assert.deepEqual(skinCounts([{ locked: false, available: true }, { locked: true }, { locked: false, available: false }]), { earned: 1, locked: 2 });
  assert.equal(skinThumbCard({ spoiler: true, homeScore: "3", awayScore: "1" }).score, "—");
  const overlay = code("CollectibleOverlay.jsx");
  assert.match(overlay, /onClick=\{\(\) => onSkin\?\.\(entryId\)\} disabled=\{!entryId \|\| queued \|\| !onSkin\}/);
  assert.doesNotMatch(overlay, /Skins are chosen in the RankIt app/);
  assert.match(src("App.jsx"), /path="\/rankit\/card\/:entryId"\s+element=\{<RankItWeb section="card" \/>\}/);
});

test("8d: iskelet kart geometrisiyle; boş durum tek eylem; çevrimdışında %62 ve bağlanınca yükleme", () => {
  const sk = code("Skeletons.jsx");
  assert.match(sk, /<SkeletonCard crestSize=\{56\} cut=\{22\} artHeight=\{132\} scoreSize=\{46\} \/>/);
  assert.match(sk, /<SkeletonCard compact crestSize=\{34\}/);
  for (const f of ["RankItWeb.jsx", "ShelfPage.jsx", "ProfilePage.jsx", "SearchPage.jsx", "CompetitionPage.jsx"]) {
    assert.doesNotMatch(code(f), /className="riw-(shelf-)?skeleton" \/>/, f);
  }
  assert.deepEqual(discoverEmpty({ sport: "All", status: "live", competition: "All", season: "All", minHeat: 4.5 }).action,
    { label: "Lower it to 3.0", patch: { minHeat: 3 } });
  assert.equal(discoverEmpty({ sport: "All", status: "All", competition: "All", season: "All", minHeat: 2 }).action.label, "Remove the minimum heat");
  assert.equal(discoverEmpty({ sport: "Football", status: "All", competition: "All", season: "All", minHeat: null }).action.label, "Clear filters");
  assert.equal(discoverEmpty({ sport: "All", status: "All", competition: "All", season: "All", minHeat: null }).action, null);
  assert.match(css(), /\.riw\.is-offline \[data-match-card\] \{ opacity: \.62; \}/);
  const net = web("useNetwork.js");
  assert.match(net, /const on = \(\) => \{ setOnline\(true\); flush\(\); \};/);
  assert.match(code("RankItWeb.jsx"), /You're offline/);
});
