/* Mobil giriş PKCE'si ve hesap silme yolları (güvenlik planı Faz 3).
   PKCE: uygulama doğrulayıcı üretir, siteye yalnız özetini verir; sunucu
   kodu özete bağlar (api/main.py mobile-code / mobile-exchange).
   Hesap silme: Google Play hem uygulama içinden hem web'den ister. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pkceStart, pkceVerifier, pkceClear, PKCE_KEY, PKCE_TTL_MS } from "../src/rankit/pkce.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("PKCE: özet = base64url(SHA-256(doğrulayıcı)), sunucunun beklediği 43 karakter", async () => {
  const storage = memoryStorage();
  const { verifier, challenge } = await pkceStart({ storage, now: 1000 });
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("PKCE: bekleyen doğrulayıcı yeniden kullanılır, süresi dolunca yenilenir, takastan sonra silinir", async () => {
  const storage = memoryStorage();
  const a = await pkceStart({ storage, now: 1000 });
  const b = await pkceStart({ storage, now: 1000 + 60_000 });       // iki kez dokunma
  assert.equal(a.verifier, b.verifier);
  assert.equal(pkceVerifier({ storage, now: 1000 + 60_000 }), a.verifier);
  assert.equal(pkceVerifier({ storage, now: 1000 + PKCE_TTL_MS + 1 }), null);
  const c = await pkceStart({ storage, now: 1000 + PKCE_TTL_MS + 1 });
  assert.notEqual(c.verifier, a.verifier);
  pkceClear({ storage });
  assert.equal(storage.getItem(PKCE_KEY), null);
});

test("PKCE: kripto yoksa eski akışa düşer (null), bozuk kayıt yenisiyle değişir", async () => {
  assert.equal(await pkceStart({ storage: memoryStorage(), cryptoImpl: null }), null);
  assert.equal(await pkceStart({ storage: memoryStorage(), cryptoImpl: {} }), null);
  const storage = memoryStorage();
  storage.setItem(PKCE_KEY, "{bozuk");
  assert.match((await pkceStart({ storage, now: 5 })).verifier, /^[A-Za-z0-9_-]{43}$/);
});

test("uygulama akışı özeti gönderiyor, takasta doğrulayıcıyı veriyor; site özeti koda bağlıyor", () => {
  const app = src("rankit", "RankItMobileApp.jsx");
  assert.match(app, /rankitMobileExchange\(code, pkceVerifier\(\)\)/);
  assert.match(app, /\/rankit\/mobile-auth\?challenge=\$\{pkce\.challenge\}/);
  const page = src("pages", "RankItMobileAuth.jsx");
  assert.match(page, /body: JSON\.stringify\(challenge \? \{ challenge \} : \{\}\)/);
  assert.match(page, /\^\[A-Za-z0-9_-\]\{43\}\$/);
});

test("hesap silme: web sayfası, profil bağlantısı ve uygulama içi yol var", () => {
  assert.match(src("App.jsx"), /path="\/account\/delete"\s+element=\{<AccountDelete \/>\}/);
  assert.match(src("pages", "Profile.jsx"), /to="\/account\/delete"/);
  assert.match(src("rankit", "web", "SettingsPanel.jsx"), /to="\/account\/delete"/);
  const settings = src("rankit", "redesign", "Settings.jsx");
  assert.match(settings, /\{onAccountDeleted && <DeleteAccount onDeleted=\{onAccountDeleted\}\/>\}/);
  assert.match(src("rankit", "RankItMobileApp.jsx"), /onAccountDeleted=\{user \? logout : undefined\}/);
  assert.match(src("rankit", "rankitApi.js"), /\/api\/account\/delete/);
});
