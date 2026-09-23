/* Skinler — BUILD §4.2, tahtalar 2j / 4d / 6a, sahibin karari 2026-09-23
   (10 serbest skin, her Hunt liginin kilitli skini). Saf jetonlar + kaynak
   sozlesmesi; sunucu tarafi tests/test_rankit_skins.py. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SKIN_ORDER, FREE_SKINS, LEAGUE_SKINS, SKIN_NAMES, SKIN_NOTES, skinTokens, lockCondition,
  skinTabs, tileCondition, applyLabel, unlockSentence, normalizeSkin,
} from "../src/rankit/redesign/skins.js";
import { createCollectible } from "../src/rankit/collectibleState.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("katalog sunucuyla ayni sirada ve ayni kimliklerle", () => {
  const py = read("..", "api", "rankit.py");
  const block = py.slice(py.indexOf("LEAGUE_SKINS = ("), py.indexOf("SKIN_RULES = "));
  const plainAt = block.search(/^SKINS = \(/m);
  const leagues = [...block.slice(0, plainAt).matchAll(/\("([a-z0-9]+)", "([^"]+)"\)/g)];
  const plain = [...block.slice(plainAt).matchAll(/\("([a-z0-9]+)", "[^"]+", /g)].map((m) => m[1]);
  assert.deepEqual(SKIN_ORDER, [...plain, ...leagues.map((m) => m[1])]);
  assert.deepEqual(Object.fromEntries(leagues.map((m) => [m[1], m[2]])), LEAGUE_SKINS);
});

test("yeni uye 10 skinle baslar; Gilt onlardan biri degil", () => {
  assert.equal(FREE_SKINS.length, 10);
  assert.ok(!FREE_SKINS.includes("gilt"));
  for (const id of SKIN_ORDER) {
    assert.ok(SKIN_NAMES[id], `${id} adsiz`);
    assert.ok(SKIN_NOTES[id], `${id} aciklamasiz`);
  }
  // Kilit kosulu yalniz kazanilan skinlerde; serbest skin kilitli gorunemez.
  for (const id of FREE_SKINS) assert.equal(lockCondition(id), null, id);
  for (const id of ["turf", "floodlight", ...Object.keys(LEAGUE_SKINS)]) assert.ok(lockCondition(id), id);
  assert.deepEqual(lockCondition("laliga"), ["FINISH A", "LA LIGA", "SEASON"]);
});

test("default jetonlari bugunku kartin degerleri — skin'siz kart degismedi", () => {
  const t = skinTokens("default", { homeColor: "#c8202f", awayColor: "#e9ecf2" });
  assert.equal(t.base, "linear-gradient(155deg,color-mix(in oklab,#c8202f 44%,#151618) 0%,#151618 54%,color-mix(in oklab,#e9ecf2 34%,#151618) 100%)");
  assert.equal(t.sheen, "repeating-linear-gradient(68deg,rgba(255,255,255,.055) 0 2px,transparent 2px 11px)");
  assert.deepEqual(
    [t.wash, t.ink, t.eyebrow, t.score, t.soft, t.faint, t.notch, t.classicNotch, t.gold, t.footer, t.rule, t.pill, t.pillLine, t.rest, t.gap, t.stub],
    [null, "#eceded", "#9aa0a6", "#fff", "#c9cccd", "rgba(255,255,255,.42)", "rgba(255,255,255,.22)", "#ffb11b", "#ffb11b",
      "rgba(9,10,11,.5)", "rgba(255,255,255,.09)", "rgba(0,0,0,.42)", "rgba(255,255,255,.14)", "rgba(255,255,255,.12)", "#151618", false]);
  assert.equal(normalizeSkin(null), "default");
  assert.equal(normalizeSkin("no-such-skin"), "default");
});

test("§2.2: parilti her skinde 68° (Broadsheet'in gazete cizgisi tahtadaki tek istisna)", () => {
  for (const id of SKIN_ORDER) {
    const { sheen } = skinTokens(id);
    if (id === "broadsheet" || sheen === "none") continue;
    assert.match(sheen, /^repeating-linear-gradient\(68deg,/, id);
  }
});

test("§1.2: kartin tamami yalniz Gilt'te altin olabilir", () => {
  const gold = /#ffb11b|rgba\(255,177,27/i;
  for (const id of SKIN_ORDER) {
    if (id === "gilt") continue;
    const t = skinTokens(id);
    for (const key of ["base", "wash", "sheen", "ink", "eyebrow", "score"]) {
      assert.doesNotMatch(String(t[key] ?? ""), gold, `${id}.${key}`);
    }
  }
});

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("metin her skinin zemin tonunda okunuyor (AA)", () => {
  for (const id of SKIN_ORDER) {
    const t = skinTokens(id);
    if (!/^#[0-9a-f]{6}$/i.test(t.gap) || !/^#[0-9a-f]{6}$/i.test(t.ink)) continue;
    assert.ok(contrast(t.ink, t.gap) >= 4.5, `${id}: ${t.ink} / ${t.gap} = ${contrast(t.ink, t.gap).toFixed(2)}`);
  }
  // Broadsheet acik bir KART: murekkep koyu, ikincil metin de AA.
  const b = skinTokens("broadsheet");
  assert.ok(contrast(b.ink, "#e8e4d9") >= 7);
  assert.ok(contrast(b.eyebrow, "#e8e4d9") >= 4.5);
  // §4.2 "gold darkens to #8a6a12": tahtanin degeri, 3.99:1. Damga bir
  // isaret (metin blogu degil) -> WCAG 1.4.11 grafik esigi 3:1.
  assert.ok(contrast(b.gold, "#e8e4d9") >= 3, "§4.2 gold darkens to #8a6a12");
});

test("2j: sekmeler ve kilitli karonun kosulu", () => {
  const list = [
    { id: "default", rule: null, locked: false, available: true },
    { id: "gilt", rule: "classic", locked: false, available: false },
    { id: "turf", rule: "collection", locked: true, available: false },
    { id: "laliga", rule: "league:La Liga", locked: true, available: false },
    { id: "premier", rule: "league:Premier League", locked: false, available: true },
  ];
  const tabs = skinTabs(list);
  assert.deepEqual(tabs.earned.map((s) => s.id), ["default", "premier"]);
  assert.deepEqual(tabs.locked.map((s) => s.id), ["gilt", "turf", "laliga"]);
  assert.deepEqual(tileCondition(list[1]), ["CLASSIC", "CARDS ONLY"]);
  assert.deepEqual(tileCondition(list[2]), ["FINISH A", "COLLECTION"]);
  assert.equal(tileCondition(list[4]), null, "acilmis lig skini onizlemeyle gorunur");
  assert.equal(applyLabel("laliga"), "Apply La Liga");
});

test("6a: kilit acilisi bir satir — uctan, kuyrukta yok", () => {
  const match = { id: 1, home: { short: "SEV", name: "Sevilla" }, away: { short: "BET", name: "Betis" }, competition: "La Liga" };
  const entry = { rating: 4 };
  const done = createCollectible(match, entry, { receipt: { entry_id: 9, skins_unlocked: [{ id: "laliga", name: "La Liga", rule: "league:La Liga" }] } });
  assert.deepEqual(done.skinsUnlocked.map((s) => s.id), ["laliga"]);
  assert.deepEqual(createCollectible(match, entry, { queued: true }).skinsUnlocked, []);
  assert.equal(unlockSentence({ id: "laliga" }), "You finished a La Liga season. It's in your skins.");
});

test("kaynak: skin kartin kendisine ve 6a'ya bagli", () => {
  const card = strip(read("src", "rankit", "redesign", "MatchCard.jsx"));
  const body = card.slice(card.indexOf("export default function MatchCard"));
  assert.match(body, /skinTokens\(skinId/);
  assert.doesNotMatch(body, /color: "#fff"|color: INK\b|INK_3|INK_2/, "kart metni hala sabit renkte");
  const mapper = read("src", "rankit", "redesign", "toMatchCardProps.js");
  assert.match(mapper, /skin: entry\.skin \|\| entry\.their_skin \|\| "default"/);
  const result = strip(read("src", "rankit", "redesign", "CollectibleResult.jsx"));
  assert.doesNotMatch(result, /<button type="button" disabled aria-describedby="result-skin-note">/, "Skin dugmesi hala kalici kapali");
  assert.match(result, /<SkinPicker /);
  assert.match(result, /skinsUnlocked\.map/);
  assert.match(result, /<MatchCard \{\.\.\.props\} skin=\{skin\}/);
});
