// BUILD §6 + §26 icin regresyon kalkani. Bu iki kural olculmesi kolay ama
// unutulmasi da kolay: altin bir odak halkasi ya da 34px'lik bir filtre
// pill'i tek bir satirla geri gelir. Test CSS metnini okuyor, tarayici
// gerekmiyor — gercek geometri kabulu ayri (ONARIM/frontend_code notlari).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RANKIT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
const files = [
  ...readdirSync(RANKIT).filter(f => f.endsWith(".css")).map(f => join(RANKIT, f)),
  join(RANKIT, "web", "rankit-web.css"),
];
// Yorumlar cikariliyor: bu dosyalarda kurallarin gerekcesi yorumda yaziyor ve
// yorum metni "outline:..." ornegi icerdigi icin tarayiciya yem oluyor.
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sheets = files.map(path => ({ path, css: strip(readFileSync(path, "utf8")) }));

// Altinin her yazilisi: jeton, hex, rgb/rgba.
const GOLD = /var\(--ri-gold\)|#ffb11b|rgba?\(\s*255\s*,\s*177\s*,\s*27/i;

test("§26: hicbir odak halkasi altin degil", () => {
  const offenders = [];
  for (const { path, css } of sheets) {
    // outline kisayolu ve outline-color: ikisi de halkanin rengini verir.
    for (const m of css.matchAll(/outline(-color)?\s*:\s*([^;}]+)/g)) {
      if (GOLD.test(m[2])) offenders.push(`${path}: outline${m[1] || ""}:${m[2].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `altin odak halkasi:\n${offenders.join("\n")}`);
});

test("§26: odak halkasi tek jetondan geliyor ve ink", () => {
  const all = sheets.map(s => s.css).join("\n");
  // Iki yuzey de jetonu tanimlamali: .rankit-app (telefon) ve .riw (web).
  assert.match(all, /\.rankit-app[^{]*\{[^}]*--ri-focus:\s*#eceded/,
    "--ri-focus telefon yuzeyinde tanimli degil");
  assert.match(all, /\.riw[^{]*\{[^}]*--ri-focus:\s*#eceded/,
    "--ri-focus web yuzeyinde tanimli degil");
  // Halka geometrisi: 2px kalinlik. Ofset 2px; negatif ofset yalniz kirpilan
  // kapsayicilarda bilerek kullaniliyor, onlar ayrik.
  const widths = [...all.matchAll(/outline\s*:\s*(\d+(?:\.\d+)?)px solid var\(--ri-focus\)/g)]
    .map(m => m[1]);
  assert.ok(widths.length >= 10, `beklenenden az odak halkasi bulundu: ${widths.length}`);
  assert.deepEqual([...new Set(widths)], ["2"], "odak halkasi 2px olmali");
  const positive = [...all.matchAll(/outline-offset\s*:\s*(\d+(?:\.\d+)?)px/g)].map(m => m[1]);
  assert.deepEqual([...new Set(positive)], ["2"], "pozitif ofset yalniz 2px olabilir");
});

test("§6: filtre pill'leri 48, diger hedefler 44", () => {
  const all = sheets.map(s => s.css).join("\n");
  for (const sel of [".ri-sport-scroll button", ".ri-diary-filters button",
                     ".ri-catalog-filters button", ".ri-filter-pills button"]) {
    const rule = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{[^}]*min-height:\\s*48px`);
    assert.match(all, rule, `${sel} icin min-height:48px yok`);
  }
  for (const sel of [".ri-section-head button", ".ri-detail-tabs button"]) {
    const rule = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{[^}]*min-height:\\s*44px`);
    assert.match(all, rule, `${sel} icin min-height:44px yok`);
  }
});

test("§1.5: tip tabani 9px", () => {
  // "Floor is 9px. One exception: skin-grid thumbnails (6.5-8.5px)."
  // Istisna YALNIZ 2j izgara karolari; secicinin kendi metni (.ri-skins-*)
  // tabana tabi.
  const EXCEPTIONS = [/\.ri-skin-(thumb|eyebrow|score|report|locked)\b/];
  const size = /font(?:-size)?\s*:\s*(?:[^;{}]*?\s)?(\d+(?:\.\d+)?)px/i;
  const offenders = [];
  for (const { path, css } of sheets) {
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = rule[1].trim();
      if (EXCEPTIONS.some(re => re.test(selector))) continue;
      for (const decl of rule[2].split(";")) {
        if (!/^\s*font(-size)?\s*:/i.test(decl)) continue;
        const m = size.exec(`${decl};`);
        if (m && Number(m[1]) < 9) offenders.push(`${path}: ${selector.slice(0, 60)} -> ${m[1]}px`);
      }
    }
  }
  assert.deepEqual(offenders, [], `9px altinda tip:\n${offenders.slice(0, 20).join("\n")}`);
});

test("§1.5: satir ici JSX stillerinde de taban 9px", () => {
  /* CSS taramasi JSX'teki `style={{ font: "700 7px ..." }}` yazimini GORMUYOR.
     StreakRing'in "NIGHTS" etiketi tam bu bosluktan 7px kalmisti: dosya CSS
     degil, deger satir ici. Bu test o bosluğu kapatiyor. */
  const dir = join(RANKIT, "redesign");
  const offenders = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsx"))) {
    const src = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(/font(?:Size)?:\s*"(?:[^"]*?\s)?(\d+(?:\.\d+)?)px/g)) {
      if (Number(m[1]) < 9) offenders.push(`${file}: ${m[0]}`);
    }
    for (const m of src.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\s*[,}]/g)) {
      if (Number(m[1]) < 9) offenders.push(`${file}: fontSize ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `satir ici 9px alti tip:\n${offenders.join("\n")}`);
});
