/* Gunluk govdesinde `rating` alani olmali mi? (§5.4 "never discard work the
   user already did", B2.)

   Uc uc durumu ayiriyor:
     alan yok   -> puana DOKUNULMUYOR (mevcut puan korunur)
     alan null  -> puan SILINIR
     alan sayi  -> puan yazilir
   Istemcinin eski kalibi (`rating: rating || null`) bu ayrimi kullanmiyordu:
   yerel `rating` herhangi bir sebeple 0'sa (detay yaniti gelmeden kaydetme,
   bayat/eksik `my_rating` tasiyan bir mac nesnesi, cevrimdisi kopya) yalniz
   inceleme yazan kullanicinin SUNUCUDAKI puani siliniyordu.

   Yeni kayitta alani atlamak da null demek — ucta `not existing` dalinda
   `body.rating` zaten None. Yani "emin degilsen gonderme" her iki yonde de
   guvenli: var olan puan korunur, olmayan puan olmamaya devam eder. */

export function ratingField({ touched, hasEntry, rating }) {
  // Kullanici yildizlara dokunduysa niyeti belli: sayiysa yaz, sifirsa sil.
  if (touched) return { rating: rating || null };
  // Dokunmadi ve ortada bir kayit var (ya da var olup olmadigini bilmiyoruz):
  // alan hic gonderilmiyor.
  if (hasEntry) return {};
  // Dokunmadi, kayit da yok: ilk kayit puansiz olarak ifade ediliyor.
  return { rating: rating || null };
}
