/* ONARIM Asama 4 — ortak gorunurluk politikasi (BUILD §3 / §3.1).
 *
 * Kural: skoru gormek ile odanin hukmunu gormek IKI AYRI karardir. Skor
 * acildiktan sonra da "Rate it first — then see whether the room agreed with
 * you" cumlesi ve ayri `REVEAL ANYWAY` durur. Ters yon (hukmu acmak skoru da
 * acar) BILEREK boyle: hukum kapisinin kendi metni zaten "CONTAINS SPOILERS"
 * diyor, kullanici spoiler'i kabul etmis oluyor — ve iki yuzey de ayni.
 *
 * Neden kaynak taramasi: iki dosya da buyuk JSX; kural tek bir olay
 * isleyicisinde yasiyor ve oradan kaymasi bir satirlik bir hata. 2026-09-23'te
 * web'de tam bu oldu: "Reveal match" hem skoru hem hukmu aciyordu, telefon
 * yalniz skoru aciyordu — ayni politikanin iki yuzeyde iki davranisi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RANKIT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
// Asama 16: web'in mac paneli RankItWeb.jsx'ten web/Inspector.jsx'e tasindi.
const web = readFileSync(join(RANKIT, "web", "Inspector.jsx"), "utf8");
const phone = readFileSync(join(RANKIT, "RankItPrototype.jsx"), "utf8");

/** "Reveal match" dugmesinin onClick govdesi. */
function revealMatchHandler(src) {
  const at = src.indexOf("ri-card-reveal");
  assert.notEqual(at, -1, "`ri-card-reveal` dugmesi bulunamadi");
  const from = src.indexOf("onClick", at);
  const to = src.indexOf("Reveal match", from);
  assert.ok(from !== -1 && to > from, "onClick govdesi okunamadi");
  return src.slice(from, to);
}

/* Web'de skor iki yerde acilir: kartin KENDI "reveal" dugmesi (yalniz kartin
   yerel durumu — Inspector'in hukum durumuna erisimi yok) ve canli hero'nun
   "Reveal score"u. Ikincisinin isleyicisi yalniz skoru acmali. */
function revealScoreHandler(src) {
  const at = src.indexOf("<LiveHero detail={detail} scoreHidden={scoreHidden}");
  assert.notEqual(at, -1, "canli hero bulunamadi");
  return src.slice(at, src.indexOf("/>", at));
}

test("§3.1: skoru acmak odanin hukmunu ACMIYOR — web", () => {
  const handler = revealScoreHandler(web);
  assert.match(handler, /setScoreRevealed\(true\)/, "skor acilmiyor");
  assert.doesNotMatch(handler, /setCommunityRevealed/,
    "skor acan dugme topluluk hukmunu de aciyor (§3.1 iki ayri karar)");
});

test("§3.1: skoru acmak odanin hukmunu ACMIYOR — telefon", () => {
  const handler = revealMatchHandler(phone);
  assert.match(handler, /setRevealed\(true\)/, "skor acilmiyor");
  assert.doesNotMatch(handler, /setCommunityRevealed/,
    "skor acan dugme topluluk hukmunu de aciyor (§3.1 iki ayri karar)");
});

test("hukum kapisi iki yuzeyde de ayni yonde davraniyor", () => {
  // Bu tarafi kasitli: hukmu acmak skoru da acar. Iki yuzeyin AYNI olmasi
  // Asama 4'un konusu; biri degisirse test bunu soyler.
  assert.match(web, /onReveal=\{\(\) => \{ setScoreRevealed\(true\); setCommunityRevealed\(true\); \}\}/,
    "web: hukum kapisi iki durumu birden acmiyor");
  assert.match(phone, /onReveal=\{\(\)=>\{setRevealed\(true\);setCommunityRevealed\(true\)\}\}/,
    "telefon: hukum kapisi iki durumu birden acmiyor");
});
