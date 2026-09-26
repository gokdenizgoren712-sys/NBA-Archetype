/* Giriş sonrası yönlendirme yalnız site içine: açık yönlendirme (open
   redirect) ile kullanıcıyı sahte bir giriş sayfasına göndermek mümkün olmasın. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/safeNext.js";

test("site içi yollar geçer", () => {
  for (const p of ["/", "/rankit", "/basketball/game?mode=salarycap", "/a/b#c"]) assert.equal(safeNextPath(p), p);
});

test("dış adrese giden her biçim reddedilir", () => {
  for (const p of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "javascript:alert(1)",
                   "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/x", "", null, undefined, 42]) {
    assert.equal(safeNextPath(p), null, JSON.stringify(p));
  }
});
