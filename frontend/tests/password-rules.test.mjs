/* Yeni şifre kuralı 6–18 karakter; sunucudaki _check_new_password ile aynı. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordProblem, PASSWORD_MIN, PASSWORD_MAX, PASSWORD_HINT } from "../src/lib/passwordRules.js";

test("6–18 karakter geçer, dışı açık bir mesajla reddedilir", () => {
  assert.equal(PASSWORD_MIN, 6);
  assert.equal(PASSWORD_MAX, 18);
  for (const ok of ["a".repeat(6), "a".repeat(12), "a".repeat(18)]) assert.equal(passwordProblem(ok), null);
  for (const bad of ["", "a".repeat(5), "a".repeat(19), null, undefined]) {
    assert.equal(passwordProblem(bad), `Password must be ${PASSWORD_HINT}`);
  }
});
