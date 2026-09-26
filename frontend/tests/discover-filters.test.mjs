/* Ekran 6c — Discover filtre çekmecesi (saf mantık + yerleşim sözleşmesi). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  toggle, activeCount, toCatalogQuery, showLabel, heatStep, heatFromStep, heatName, heatNameColor,
  HEAT_LEVELS, EMPTY_FILTERS, DATES,
} from "../src/rankit/redesign/discoverFilters.js";

test("6c: pill'e ikinci dokunus filtreyi kaldirir ('All' pill'i yok)", () => {
  assert.equal(toggle("All", "Football"), "Football");
  assert.equal(toggle("Football", "Football"), "All");
  assert.equal(toggle("Football", "Basketball"), "Basketball");
});

test("6c: isi esigi kartin isi adiyla ayni kurali kullaniyor", () => {
  // Kart NAMES[Math.round(heat)-1] yaziyor: 2.5 "GOOD". "Good or better"
  // 2.5'ten baslamazsa GOOD yazan kart filtreden duserdi.
  assert.equal(HEAT_LEVELS.find((l) => l.name === "Good").min, 2.5);
  assert.equal(Math.round(2.5), 3, "2.5 kartta GOOD (3. isim) olarak gorunur");
  assert.equal(heatName(2.5), "Good");
  assert.equal(heatNameColor("Good"), "#9a3f96", "tahtadaki renk (rampanin GOOD basamagi)");
});

test("6c: kaydirici 0 = sinir yok, 1..4 seviyeler; gidis-donus kayipsiz", () => {
  assert.equal(heatFromStep(0), null);
  for (const level of HEAT_LEVELS) assert.equal(heatFromStep(heatStep(level.min)), level.min);
  assert.equal(heatStep(null), 0);
});

test("6c: katalog sorgusu — min_heat yalniz secildiyse, sahne kucuk harf", () => {
  assert.deepEqual(toCatalogQuery({ ...EMPTY_FILTERS }),
    { sport: "All", competition: "All", season: "All", status: "All", minHeat: null, when: "All" });
  assert.deepEqual(toCatalogQuery({ ...EMPTY_FILTERS, sport: "Football", status: "Live", minHeat: 2.5 }),
    { sport: "Football", competition: "All", season: "All", status: "live", minHeat: 2.5, when: "All" });
  // Tarih süzgeci: yalnız bilinen pencereler uca gider, sayılır.
  assert.equal(toCatalogQuery({ ...EMPTY_FILTERS, when: "tomorrow" }).when, "tomorrow");
  assert.equal(toCatalogQuery({ ...EMPTY_FILTERS, when: "yesterday" }).when, "All");
  assert.equal(activeCount({ ...EMPTY_FILTERS, when: "weekend" }), 1);
  assert.deepEqual(DATES.map(([v]) => v), ["today", "tomorrow", "weekend", "next7", "past7"]);
});

test("6c: 'Show N matches' sayisi uctan, uydurulmuyor", () => {
  assert.equal(showLabel(62), "Show 62 matches");
  assert.equal(showLabel(1), "Show 1 match");
  assert.equal(showLabel(0), "No matches");
  assert.equal(showLabel(null, { counting: true }), "Counting…");
  assert.equal(showLabel(null, { failed: true }), "Show matches", "hata sayi uydurmaz");
});

test("etkin filtre sayisi isi esigini de sayiyor", () => {
  assert.equal(activeCount({ ...EMPTY_FILTERS }), 0);
  assert.equal(activeCount({ ...EMPTY_FILTERS, sport: "Football", minHeat: 3.5 }), 2);
});

test("2c/6c: filtreler SAYFANIN USTUNDE degil, soldan cekmecede", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
  const app = readFileSync(join(root, "RankItPrototype.jsx"), "utf8");
  const discover = app.slice(app.indexOf("function DiscoverView"), app.indexOf("function DiscoverView") + 12000);
  assert.doesNotMatch(discover, /className=\{`ri-filter-panel ri-filter-redesign/,
    "satir ici filtre paneli Discover'a geri gelmis");
  assert.match(discover, /<FilterDrawer /);
  const css = readFileSync(join(root, "rankit-v030.css"), "utf8");
  assert.match(css, /\.ri-drawer\{position:absolute;left:0;top:0;bottom:0;width:288px;max-width:85%/,
    "cekmece soldan ve tahtanin genisliginde degil");
});
