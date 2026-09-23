/* Ekran 15c sözleşmesi — görsel kaynak `RankIt Redesign.dc.html#15c`,
   davranış `BUILD.md` §11.1.

   Bu ekranın METNİ sözleşmenin kendisi: yazar, kelimelerini seçmeden önce
   kimlerin ne göreceğini bilmeli. O yüzden kopya birebir çivileniyor.
   Bileşen React; DOM'suz koşulduğu için denetim kaynak üzerinden. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(HERE, "..", "src", "rankit", "redesign", "ReviewComposer.jsx"), "utf8");
// Yorumlar cikariliyor: kurallarin gerekcesi yorumda YAZILI ("asla Post"),
// ve etiket taramasi kendi gerekcemizi bulup yanlis alarm veriyordu.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sheet = readFileSync(join(HERE, "..", "src", "rankit", "RankItPrototype.jsx"), "utf8");

test("15c: tahtadaki kopya birebir duruyor", () => {
  for (const line of [
    "Write about the night",
    "OUTFIT · WHAT YOU SAY, NOT WHAT THE PRODUCT SAYS",
    "THIS WILL BE SPOILER-SHIELDED",
    "CONTAINS SPOILERS · TAP TO SHOW",
    "Write as if they will read it anyway.",
  ]) {
    assert.ok(src.includes(line), `tahtadaki satir kayip: "${line}"`);
  }
});

test("§11.1: dugme 'Save to your entry', asla 'Post'", () => {
  assert.match(src, />Save to your entry</);
  assert.doesNotMatch(src, /\bPost\b/, "inceleme bir gonderi degil, girdinin alani");
});

test("§11.1: ekran girdiye GERI yaziyor, kendi kaydini atmiyor", () => {
  // Kaydet, cagirana metni verip kapaniyor; sunucuya yazmak girdinin isi.
  assert.match(src, /const save = \(\) => \{ onChange\(text\); onClose\(\); \};/);
  assert.doesNotMatch(src, /rankitApi/, "composer dogrudan API cagirmamali");
});

test("15c: sayac 4.000 sinirini ve binlik ayiraci gosteriyor", () => {
  assert.match(src, /maxLength=\{4000\}/);
  assert.match(src, /toLocaleString\('en-GB'\)/);
  assert.equal((4000).toLocaleString("en-GB"), "4,000");
});

test("§11.1: composer girdiden aciliyor, satir ici textarea kalmadi", () => {
  assert.match(sheet, /ri-review-trigger/, "girdide composer'i acan satir yok");
  assert.doesNotMatch(sheet, /className="ri-review-input"/,
    "eski satir ici inceleme kutusu hala duruyor; 15c tek yazma yeri olmali");
});

test("15c: kisisel puan sozlugu UYDURULMUYOR", () => {
  // Tahtada yalniz "All-timer" geciyor, BUILD bes kademeli bir sozluk
  // tanimlamiyor; isi adlari da buraya konamaz (§5.5).
  for (const word of ["All-timer", "COLD", "FLAT", "GREAT"]) {
    assert.ok(!src.includes(`>${word}<`), `uydurulmus puan kelimesi: ${word}`);
  }
});
