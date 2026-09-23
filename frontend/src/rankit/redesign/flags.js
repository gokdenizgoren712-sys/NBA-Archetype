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

/* Faz 2: home hero kartı ve onunla gelen yüzeyler (2a başlık seri hapı +
   kalkan, yeni hero/discover kartları, ProfileRoot).

   2026-09-23: varsayılan AÇIK. Gerekçe: ONARIM Aşama 1-3 (ölçüm düzeneği,
   MatchCard kabul kapısı, grid/taşma geçişi) kapandı ve Aşama 4-10 boyunca
   bu yolun ekranları tahtalara karşı tek tek doğrulandı. Kapalı bırakmak
   artık "eski yolu koru" değil, yapılan işi gizlemek anlamına geliyordu.
   Kullanıcı kararı. Kapatmak hâlâ tek satır:
     localStorage.setItem("rankit:flag:newCard", "0") */
export const RANKIT_NEW_CARD = read(
  "newCard",
  import.meta.env?.VITE_RANKIT_NEW_CARD,
  true,
);
