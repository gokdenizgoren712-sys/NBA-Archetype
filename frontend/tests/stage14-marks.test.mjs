/* ONARIM Aşama 14 — marka ve launcher (BUILD §7, ekran 4i).
   Kaynak sözleşmesi: yeni işaret tek bileşen, eski madalyon hiçbir yerde,
   Primary Arch kural girintisi + küçük varyant, Android uyarlanabilir ikon. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");
const res = (...p) => readFileSync(join(here, "..", "android", "app", "src", "main", ...p), "utf8");
const CARD = "M0 0H16.5L24 7.5V24H7.5L0 16.5Z";

test("§7.2: RankIt isareti kart silueti + maskeyle oyulmus yildiz, maske kimligi ornek basina", () => {
  const mark = src("rankit", "redesign", "BrandMark.jsx");
  assert.ok(mark.includes(`const CARD = "${CARD}"`));
  assert.match(mark, /translate\(12 12\.6\) scale\(\$\{scale\}\) translate\(-12 -12\.4\)/);
  assert.match(mark, /size <= 16 \? 0\.62 : 0\.6/);
  assert.match(mark, /useId\(\)/);
  assert.match(mark, /<mask id=\{id\}>/);
});

test("4i: eski 12-gen + R madalyonu telefon, mobil kabuk ve web'den emekli; hepsi ayni bileseni kullaniyor", () => {
  const files = [["rankit", "RankItPrototype.jsx"], ["rankit", "RankItMobileApp.jsx"], ["rankit", "web", "cards.jsx"]];
  for (const f of files) {
    const s = src(...f);
    assert.doesNotMatch(s, /M16 35V13h10\.2|function (RankItMark|MobileMark)\(|<text[^>]*>R<\/text>|>R<\/text>/, f.join("/"));
  }
  assert.match(src("rankit", "RankItPrototype.jsx"), /import \{ RankItMark \} from "\.\/redesign\/BrandMark"/);
  assert.match(src("rankit", "RankItPrototype.jsx"), /<div className="ri-brand"><RankItMark size=\{24\}\/>/);
  assert.match(src("rankit", "RankItMobileApp.jsx"), /mark=\{<RankItMark size=\{24\}\/>\}/);
  assert.match(src("rankit", "web", "cards.jsx"), /export \{ RankItMark \} from "\.\.\/redesign\/BrandMark"/);
});

test("2a / §7.2 kilit: isaret 24, aralik 10, kelime 21 .03em, eyebrow 9px .14em; 4g eyebrow altta ortali", () => {
  const css = src("rankit", "rankit-v030.css");
  assert.match(css, /\.rankit-app \.ri-brand\{gap:10px;/);
  assert.match(css, /\.rankit-app \.ri-brand strong\{font:700 21px\/1 var\(--font-logo\);letter-spacing:\.03em;/);
  assert.match(css, /\.rankit-app \.ri-brand small\{font:700 9px\/1 var\(--font-logo\);letter-spacing:\.14em;color:#7f868b;margin-top:5px\}/);
  assert.match(css, /\.ri-first-brand\{flex-direction:column;align-items:center;gap:7px\}/);
  assert.match(src("rankit", "redesign", "FirstRun.jsx"),
    /<span>\{mark\}<strong aria-label="RankIt">RANK<span>IT<\/span><\/strong><\/span>\s*<small>BY PRIMARY ARCH<\/small>/);
});

test("§7.3 / 4i: Primary Arch kurali bir birim iceride, 24px altinda dolu insa", () => {
  const brand = src("components", "BrandIcons.jsx");
  assert.match(brand, /const RULE = "M 6 24 H 42"/);
  assert.doesNotMatch(brand, /M 4 24 H 44/);
  assert.match(brand, /if \(size < 24\)/);
  assert.match(brand, /size <= 16 \? 6 : 5\.2/);
  assert.match(brand, /<polygon points=\{DODECAGON\} fill="#FFB11B" mask=/);
});

test("§7.1: launcher uyarlanabilir, stok robot ve beyaz zemin gitti, geometri webdekiyle ayni", () => {
  assert.match(res("AndroidManifest.xml"), /android:icon="@drawable\/rankit_launcher"/);
  assert.match(res("AndroidManifest.xml"), /android:roundIcon="@drawable\/rankit_launcher"/);
  const adaptive = res("res", "drawable-anydpi-v26", "rankit_launcher.xml");
  for (const layer of ["background", "foreground", "monochrome"]) assert.match(adaptive, new RegExp(`<${layer} android:drawable="@drawable/rankit_icon_`));
  for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const x = res("res", "mipmap-anydpi-v26", f);
    assert.doesNotMatch(x, /@mipmap\/ic_launcher_foreground|@color\/ic_launcher_background/, f);
  }
  assert.doesNotMatch(res("res", "values", "ic_launcher_background.xml"), /#FFFFFF/i);
  const fg = res("res", "drawable", "rankit_icon_foreground.xml");
  assert.match(fg, /android:fillType="evenOdd"/);
  // BrandMark.jsx'teki CARD ve .6 olcekli yildiz, vektor sozdiziminde.
  assert.match(fg, /M0,0H16\.5L24,7\.5V24H7\.5L0,16\.5Z M12,6\.36L13\.8,10\.5L18\.3,10\.92/);
  assert.doesNotMatch(res("res", "drawable", "rankit_launcher.xml"), /#00A3AF/i);
});
