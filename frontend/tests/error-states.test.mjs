/* §5.4 — üç hata birbirinden ayrı. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  "..", "src", "rankit", "redesign", "States.jsx"), "utf8");
const body = src.replace(/\/\*[\s\S]*?\*\//g, "");

test("§5.4: 401 'yeniden giris' diyor, cevrimdisindan ayri", () => {
  assert.match(body, /error\?\.status === 401/, "401 ayirt edilmiyor");
  assert.match(body, /Sign in to see this/);
  assert.match(body, /Connection unavailable/, "cevrimdisi dali kayboldu");
});

test("§5.4: 401'de bos bir 'Retry' sozu verilmiyor", () => {
  // Ayni istek ayni sonucu verir; dugme kullaniciyi kandirir.
  assert.match(body, /action=\{needsSignIn \? undefined : "Retry"\}/);
  assert.match(body, /onAction=\{needsSignIn \? undefined : onRetry\}/);
});

test("§5.4: 401 disinda tekrar denemek HALA aciK", () => {
  assert.match(body, /"Retry"/);
  assert.match(body, /onRetry/);
});
