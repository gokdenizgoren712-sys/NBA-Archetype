/* ONARIM Aşama 15 — web temeli (BUILD §§16–18, ekran 7a).
   Tarayıcıda 1440 / 1000 / 390 genişlikte ölçülenlerin kaynak sözleşmesi. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");
const shell = () => src("rankit", "web", "WebShell.jsx");
const web = () => src("rankit", "web", "RankItWeb.jsx");
const css = () => src("rankit", "web", "rankit-web.css");

test("§17 başlık: dört gezinme, Rank elması masaüstünde yok", () => {
  const nav = shell().match(/const NAV = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...nav.matchAll(/label: "(\w+)"/g)].map((m) => m[1]), ["Home", "Discover", "Activity", "Lists"]);
  assert.doesNotMatch(nav, /rank: true/);
  assert.match(css(), /\.riw-top \{[^}]*height: var\(--riw-top\)/);
  assert.match(css(), /--riw-top: 78px;/);
  assert.match(css(), /\.riw-topnav a\.on \{ color: var\(--ri-gold, #ffb11b\); background: rgba\(255, 255, 255, \.06\); \}/);
});

test("§17 arama gerçek bir alan: `/` odaklar, Enter sonuç sayfası, modal yok", () => {
  const s = shell();
  assert.match(s, /<form role="search" className="riw-search"/);
  assert.match(s, /<input ref=\{field\} type="search"/);
  assert.match(s, /event\.key !== "\/"/);
  assert.match(s, /<kbd aria-hidden="true">\/<\/kbd>/);
  const w = web();
  assert.match(w, /navigate\(`\/rankit\/search\?q=\$\{encodeURIComponent\(term\)\}`\)/);
  assert.doesNotMatch(w, /findOpen|riw-find-wrap/);
  assert.match(src("App.jsx"), /<Route path="\/rankit\/search"\s+element=\{<RankItWeb section="search" \/>\} \/>/);
  // Aşama 17: sonuçlar 11c'nin tam sayfası (SearchPage) — modal değil.
  assert.match(w, /search: <SearchPage query=\{urlQuery\}/);
});

test("§17 ray: YOUR STANDING · THE HUNT · FOLLOWING, kulüp Inspector'da açılır", () => {
  const s = shell();
  const labels = [...s.matchAll(/<RailLabel>([^<]+)<\/RailLabel>/g)].map((m) => m[1]);
  assert.deepEqual(labels.slice(0, 3), ["YOUR STANDING", "THE HUNT", "FOLLOWING"]);
  assert.match(s, /onOpenEntity\("team", club\.id\)/);
  assert.match(css(), /--riw-rail: 232px;/);
  assert.match(src("rankit", "web", "useShellData.js"), /rankitApi\.onboarding\(\)\.then\(d => alive && setClubs\(\{ key: accountId, data: d\.followed_clubs/);
});

test("§18 duvar 320 ve kart telefonla AYNI bileşen", () => {
  assert.match(css(), /\.riw-wall \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(320px, 1fr\)\)/);
  assert.match(css(), /grid-auto-columns: max\(320px, calc\(\(100% - 36px\) \/ 3\)\)/);
  const cards = src("rankit", "web", "cards.jsx");
  assert.match(cards, /import SharedMatchCard from "\.\.\/redesign\/MatchCard"/);
  assert.match(cards, /const WALL = \{ scoreSize: 46, cardWidth: 320, crestSize: 56 \}/);
  assert.match(cards, /<SharedMatchCard \{\.\.\.props\} artHeight=\{132\} crestSize=\{56\}/);
  assert.doesNotMatch(cards, /export function MatchCard|className=\{`ri-match-card/);
  assert.doesNotMatch(web(), /<MatchCard\b/);
});

test("iki yüzey tek eşleme: fromApiMatch ve RankIt günü paylaşılıyor", () => {
  assert.match(src("rankit", "matchModel.js"), /export function fromApiMatch\(m\)/);
  assert.match(src("rankit", "RankItPrototype.jsx"), /import \{ fromApiMatch \} from "\.\/matchModel"/);
  assert.doesNotMatch(src("rankit", "RankItPrototype.jsx"), /function (fromApiMatch|rankitDayContext)\(/);
  assert.match(src("rankit", "redesign", "homeTonight.js"), /export function rankitDayContext\(/);
  assert.match(web(), /rankitApi\.home\("All", day\.start, day\.end,/);
});

test("7a sitenin üst barı RankIt web rotalarında çekilir; /rankit/app kapsam dışı", () => {
  const app = src("App.jsx");
  assert.match(app, /if \(isRankItWeb\(location\.pathname\)\) return null;/);
  // Aşama 17: sabit küme yerine /rankit öneki; sıradan sayfalar açıkça dışarıda.
  const plain = app.match(/const RANKIT_PLAIN_PAGES = \[([\s\S]*?)\];/)[1];
  for (const page of ["/rankit/app", "/rankit/download", "/rankit/mobile-auth", "/rankit/_preview"]) {
    assert.match(plain, new RegExp(`"${page}"`));
  }
  assert.match(app, /if \(path !== "\/rankit" && !path\.startsWith\("\/rankit\/"\)\) return false;/);
});

test("§25 ≤820: telefonun beşlisi altta, Rank ortada (2026-09-02 kararı)", () => {
  const tabs = shell().match(/const PHONE_TABS = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...tabs.matchAll(/label: "(\w+)"/g)].map((m) => m[1]), ["Home", "Discover", "Rank", "Activity", "Profile"]);
  assert.match(css(), /\.riw-phone-tabs \{ display: none; \}/);
  assert.match(css(), /@media \(max-width: 820px\) \{[\s\S]*?\.riw-phone-tabs \{\s*position: fixed;/);
});

test("§6 hedefler: 38'lik gezinme, 40'lık arama, 30'luk oklar ve kısa kullanıcı adları 44", () => {
  const c = css();
  assert.match(c, /\.riw-topnav a::after \{ content: ""; position: absolute; left: 0; right: 0; top: -3px; bottom: -3px; \}/);
  assert.match(c, /\.riw-search label::after \{ content: ""; position: absolute;[^}]*top: -3px; bottom: -3px; \}/);
  assert.match(c, /\.riw-arrows button::after \{ content: ""; position: absolute; inset: -7px; \}/);
  assert.match(c, /\.riw-follow-who::after \{[^}]*width: max\(calc\(100% \+ 8px\), 44px\)/);
  // Arama alanında tek halka (label), input'unki kapalı.
  assert.match(c, /\.riw-search input:focus-visible \{ outline: none; \}/);
});

test("günlük duvarı: anahtar KAYIT, maç değil (yeniden izleme iki kart)", () => {
  // Aşama 17: web'in günlük duvarı 7f rafı (ve 8b'nin raf önizlemesi) oldu —
  // aynı kural orada: her kayıt bir kart, anahtar kaydın id'si.
  for (const f of ["ShelfPage.jsx", "ProfilePage.jsx"]) {
    assert.match(src("rankit", "web", f), /key=\{(card|c)\.entry\?\.id \|\| (card|c)\.id\}/, f);
  }
  assert.match(web(), /<WallCard key=\{m\.key \?\? m\.id\}/);
});
