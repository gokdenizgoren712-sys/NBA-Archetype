/* PKCE — uygulama ile giriş kodunu birbirine bağlar.

   Giriş sitede biter ve kod `rankit://auth?code=...` bağlantısıyla uygulamaya
   döner. Aynı şemayı kaydeden başka bir uygulama bu bağlantıyı yakalayabilir.
   Bu yüzden akışı başlatan uygulama bir gizli doğrulayıcı üretir, siteye yalnız
   özetini (challenge) verir; sunucu kodu o özete bağlar ve takasta doğrulayıcının
   kendisini ister (api/main.py mobile-code / mobile-exchange). Yakalanan kod
   doğrulayıcı olmadan işe yaramaz.

   Doğrulayıcı cihazda 10 dakika bekler: kullanıcı tarayıcıda giriş yaparken
   uygulama arka plana düşse de akış bozulmaz; iki kez dokunulursa aynısı kullanılır. */

export const PKCE_KEY = "rankit:pkce";
export const PKCE_TTL_MS = 10 * 60 * 1000;

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeOf(verifier, cryptoImpl) {
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

function read(storage, now) {
  try {
    const saved = JSON.parse(storage.getItem(PKCE_KEY) || "null");
    if (saved && typeof saved.verifier === "string" && now - saved.at < PKCE_TTL_MS) return saved;
  } catch { /* bozuk kayıt: yenisi üretilir */ }
  return null;
}

/** Bekleyen doğrulayıcıyı döndürür (yoksa üretir). Kripto yoksa null: eski akış. */
export async function pkceStart({ storage = globalThis.localStorage, now = Date.now(), cryptoImpl = globalThis.crypto } = {}) {
  if (!cryptoImpl?.subtle || !cryptoImpl.getRandomValues) return null;
  let saved = read(storage, now);
  if (!saved) {
    const verifier = b64url(cryptoImpl.getRandomValues(new Uint8Array(32)));
    saved = { verifier, challenge: await challengeOf(verifier, cryptoImpl), at: now };
    try { storage.setItem(PKCE_KEY, JSON.stringify(saved)); } catch { return null; }
  }
  return { verifier: saved.verifier, challenge: saved.challenge };
}

/** Takas için doğrulayıcı (süresi geçmişse null). */
export function pkceVerifier({ storage = globalThis.localStorage, now = Date.now() } = {}) {
  return read(storage, now)?.verifier || null;
}

export function pkceClear({ storage = globalThis.localStorage } = {}) {
  try { storage.removeItem(PKCE_KEY); } catch { /* yok say */ }
}
