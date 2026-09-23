/* Canlı kadro satırındaki mevki kısaltması (ekran 15d).
 *
 * Tahta (`RankIt Redesign.dc.html#15d`) dar sütunda kısa kod istiyor:
 * `GK`, `CB`, `AM`, `ST`. Uygulama bunun yerine sağlayıcının HAM sayısal
 * kodunu basıyordu (`11`, `32`, `83`) — `position_code || position` sırası
 * ham kodu öne alıyordu. Ekranda "Kyle Walker-Peters 32" yazması bir mevki
 * değil, sızmış bir iç kimlik.
 *
 * Tahtanın `CB` / `AM` ayrımı bizde YOK: arka uç bilerek beş kaba mevkiye
 * indiriyor (`rankit_live_sync.POSITION_CODES` → Keeper / Defender /
 * Midfielder / Winger / Striker). Ham koddan `CB` türetmek, sahip olmadığımız
 * bir kesinliği uydurmak olurdu; bildiğimiz kadarı kısaltılıyor.
 *
 * Seçici ekranı (15b) uzun biçimi kullanmaya devam ediyor — tahtada orada da
 * uzun yazıyor ("Goalkeeper", "Centre back"); dar olan canlı satır.
 */

const SHORT = {
  keeper: "GK",
  goalkeeper: "GK",
  defender: "DF",
  midfielder: "MF",
  winger: "WG",
  striker: "ST",
  forward: "ST",
};

export function positionAbbr(position) {
  const key = String(position || "").trim().toLowerCase();
  if (!key) return "";
  // Bilinmeyen bir etiket gelirse ham hâli DEĞİL, hiçbir şey gösterilmez:
  // yanlış bir kısaltma uydurmaktansa sütun boş kalır.
  return SHORT[key] || "";
}
