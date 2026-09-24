/* ONARIM Aşama 13 — durumlar ve erişilebilirlik (BUILD §5, §6).
   Tarayıcıda ölçülen kusurların kuralları yerinde mi; kaynak sözleşmesi. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.jsx$/.test(name) ? [path] : [];
});

test("§6: hukum kapisinin metin dugmesi iki yuzeyde de 44px dokunma alani tasiyor", () => {
  assert.match(read("redesign", "CommunityVerdictGate.jsx"), /className="ri-gate-action"/);
  assert.match(read("redesign", "MatchCard.jsx"), /className="ri-gate-action"/);
  assert.match(read("rankit-v030.css"), /\.ri-gate-action::after[^{]*\{\s*content:"";position:absolute;[^}]*height:44px/);
  assert.match(read("web", "rankit-web.css"), /\.riw \.ri-gate-action::after\{content:"";position:absolute;[^}]*height:44px/);
});

test("§6: kisa sekmeler, basliktaki baglantilar ve 34px kapat dugmeleri 44px", () => {
  const css = read("rankit-v030.css");
  assert.match(css, /\.ri-segment\.is-tabs,\.ri-competition-tabs,\.ri-match-sheet>\.ri-detail-tabs\) button::before\{[^}]*width:max\(100%,44px\)/);
  assert.match(css, /\.ri-sheet-close::after,\.rankit-app \.ri-rank-head button::after\{content:"";position:absolute;inset:-5px\}/);
  assert.match(css, /\.ri-kicker-comp::after/);
});

test("§6: isi kaydiricisinin GIRDISI 44px, 8px iz yalniz cizimde", () => {
  const css = read("rankit-v030.css");
  assert.match(css, /\.ri-drawer-heat input\{[^}]*height:44px/);
  assert.match(css, /\.ri-drawer-heat input::-webkit-slider-runnable-track\{height:8px/);
});

test("§5.3 / 3l: cevrimdisinda onbellekteki KARTIN TAMAMI .62, icteki gorsel ikinci kez solmuyor", () => {
  const css = read("rankit-v030.css");
  assert.match(css, /\.rankit-app\.is-offline :is\(\.ri-card-slot,\.ri-hero-slot,[^)]*\)\{opacity:\.62\}/);
  assert.match(css, /\.rankit-app\.is-offline :is\(\.ri-card-slot,\.ri-hero-slot\) img\{opacity:1\}/);
});

test("§5.1: telefon kodunda donen cark yok — yalniz iskelet", () => {
  const offenders = walk(root).filter(f => !f.includes(`${join("rankit", "web")}`))
    .filter(f => /className="[^"]*\bri-spin\b|Loader2|animate-spin/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
