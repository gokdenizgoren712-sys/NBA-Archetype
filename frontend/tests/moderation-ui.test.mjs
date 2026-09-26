/* Magaza hazirligi — Paket B arayuzu (docs/RANKIT_STORE_BLOCKERS_PLAN.md B5-B7).
   Inceleyici her kullanici iceriginin yaninda Report ve Block arar; bu testler
   menunun HER yuzeyde durdugunu, sebeplerin sunucuyla ayni oldugunu, engelin
   ekrandan hemen kalktigini ve sartlarin kayitta zorunlu oldugunu kilitler. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REPORT_REASONS, canActOn, NOUNS } from "../src/rankit/redesign/contentActionsModel.js";
import { LEGAL_PAGES } from "../src/rankit/openExternal.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

// Yuzey -> gosterdigi icerik turleri. Yeni bir kullanici icerigi yuzeyi
// eklenirse buraya da eklenmeli.
const SURFACES = [
  [["rankit", "redesign", "AllReviews.jsx"], ["review"]],
  [["rankit", "redesign", "FriendsFeed.jsx"], ["review"]],
  [["rankit", "redesign", "ReviewThread.jsx"], ["review", "comment"]],
  [["rankit", "redesign", "ListShelf.jsx"], ["list"]],
  [["rankit", "redesign", "CompanionPanel.jsx"], ["message"]],
  [["rankit", "redesign", "MemberProfile.jsx"], ["user"]],
  [["rankit", "web", "ReviewArticle.jsx"], ["review", "comment"]],
  [["rankit", "web", "ListsPage.jsx"], ["list"]],
  [["rankit", "web", "ShelfPage.jsx"], ["user"]],
];

test("Report / Block menusu her kullanici icerigi yuzeyinde", () => {
  for (const [path, types] of SURFACES) {
    const code = src(...path);
    assert.match(code, /import ContentActions from "(\.\/|\.\.\/redesign\/)ContentActions"/, path.join("/"));
    for (const type of types) {
      // Sabit tur ("review") ya da ifade (FriendsFeed: metinsiz kayitta hesap).
      assert.match(code, new RegExp(`<ContentActions type=(?:"${type}"|\\{[^}]*"${type}")`), `${path.join("/")}: ${type}`);
    }
  }
});

test("sikayet sebepleri sunucunun kabul ettikleriyle ayni", () => {
  const api = readFileSync(join(root, "api", "rankit.py"), "utf8");
  const server = api.match(/REPORT_REASONS = \(([^)]*)\)/)[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1));
  assert.deepEqual(REPORT_REASONS.map(([key]) => key), server);
  const targets = api.match(/REPORT_TARGETS = \(([^)]*)\)/)[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1));
  assert.deepEqual(Object.keys(NOUNS).sort(), [...targets].sort());
});

test("menu yalniz oturum acikken ve baskasinin iceriginde", () => {
  assert.equal(canActOn({ id: 2, username: "b" }, { id: 1 }), true);
  assert.equal(canActOn({ id: 1, username: "a" }, { id: "1" }), false);
  assert.equal(canActOn({ id: 2 }, null), false);
  assert.equal(canActOn({ id: null, username: "x" }, { id: 1 }), false);
});

test("engel olayi sheet kapanirken duyuruluyor; yuzeyler engellenenleri hemen suzuyor", () => {
  const sheet = src("rankit", "redesign", "ContentActions.jsx");
  assert.match(sheet, /if \(blockedNow\.current\) announceBlock\(author\.id, true\)/);
  assert.match(sheet, /useDialog\(/);
  assert.match(sheet, /We&apos;ll review this within 24 hours/);
  for (const path of [["rankit", "redesign", "AllReviews.jsx"], ["rankit", "redesign", "FriendsFeed.jsx"],
    ["rankit", "redesign", "ReviewThread.jsx"], ["rankit", "redesign", "CompanionPanel.jsx"],
    ["rankit", "redesign", "ListShelf.jsx"], ["rankit", "web", "ReviewArticle.jsx"]]) {
    assert.match(src(...path), /useBlockedAuthors\(\)/, path.join("/"));
  }
});

test("Settings: PRIVACY & SAFETY altinda engellenenler ve engel kaldirma", () => {
  const settings = src("rankit", "redesign", "Settings.jsx");
  assert.match(settings, /<Group title="PRIVACY & SAFETY">/);
  assert.match(settings, /rankitApi\.blocks\(\)/);
  assert.match(settings, /rankitApi\.unblock\(row\.id\)/);
  assert.match(settings, /announceBlock\(row\.id, false\)/);
});

test("Community Guidelines her yerden ulasilabilir", () => {
  assert.ok(LEGAL_PAGES.some(([p]) => p === "/community-guidelines"));
  assert.match(src("App.jsx"), /path="\/community-guidelines"/);
  assert.match(src("rankit", "redesign", "FirstRun.jsx"), /externalLinkProps\("\/community-guidelines"\)/);
  assert.match(src("components", "Footer.jsx"), /to="\/community-guidelines"/);
  const terms = src("pages", "legal", "TermsOfService.jsx");
  assert.match(terms, /zero tolerance/);
  assert.match(terms, /within 24 hours/);
});

test("kayit: sartlar onay kutusu zorunlu ve sunucuya gidiyor", () => {
  const register = src("pages", "Register.jsx");
  assert.match(register, /type="checkbox" required checked=\{agreed\}/);
  assert.match(register, /if \(!agreed\)/);
  assert.match(register, /accept_terms: true/);
  assert.match(src("components", "GoogleSignIn.jsx"), /By continuing with Google you agree/);
  assert.match(src("components", "TermsBanner.jsx"), /termsCurrent !== false/);
});

test("admin sikayet kuyrugu: rota, menu baglantisi, bes eylem", () => {
  assert.match(src("App.jsx"), /path="\/admin\/reports"/);
  assert.match(src("pages", "admin", "ArticleList.jsx"), /to="\/admin\/reports"/);
  const page = src("pages", "admin", "Reports.jsx");
  for (const action of ["hide", "unhide", "dismiss", "delete", "ban"]) {
    assert.match(page, new RegExp(`btn\\("${action}"`), action);
  }
});
