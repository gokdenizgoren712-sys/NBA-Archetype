/* Redesign geçiş bayrakları.
 *
 * §0'ın kuralı: her faz ÇALIŞAN bir uygulamayla bitecek ve fazlar
 * birleştirilmeyecek. Bayrak bunun aracı — yeni kart açılırken eski yol
 * bozulmadan duruyor, kapatınca uygulama Faz 1 öncesine dönüyor.
 *
 * Öncelik: localStorage > env > varsayılan. localStorage kancası kasıtlı;
 * cihazda tek satırla açıp kapatabilmek, iki yolu yan yana karşılaştırmanın
 * tek pratik yolu:
 *   localStorage.setItem("rankit:flag:newCard", "1")   // aç
 *   localStorage.removeItem("rankit:flag:newCard")     // env'e geri dön
 */

function read(key, envValue, fallback) {
  try {
    const local = localStorage.getItem(`rankit:flag:${key}`);
    if (local !== null) return local === "1" || local === "true";
  } catch { /* gizli sekme / site verisi kapalı — env'e düş */ }
  if (envValue !== undefined) return envValue === "true" || envValue === true;
  return fallback;
}

/* Faz 2: home hero kartı. Varsayılan KAPALI — açıkça açılana kadar
   üretimdeki davranış değişmiyor. */
export const RANKIT_NEW_CARD = read(
  "newCard",
  import.meta.env?.VITE_RANKIT_NEW_CARD,
  false,
);
