/* Isı rampası — §1'in tek veri-görselleştirme paleti.
 *
 * Üçüncü yüzey de aynı beş rengi isteyince (companion nabzı, 3c'deki maç
 * kartı, ileride 2g) rampayı kopyalamak yerine buraya taşındı. Kopyalar
 * sessizce ayrışır ve "aynı sayı iki ekranda iki renk" hatası ölçülmeden
 * fark edilmez.
 *
 * §1'in iki kuralı buradan çıkıyor ve bileşenler onlara uymak zorunda:
 *   * Isı YALNIZCA veridir — navigasyon, buton, vurgu değil.
 *   * Sayısal değer her zaman rengin YANINDA gider. Renk tek başına anlam
 *     taşımaz (renk körlüğü değil, kalibrasyon meselesi: 3.4 ile 3.6 aynı
 *     basamağa düşer, ikisini ayıran şey rakamdır).
 */
export const RAMP = ["#2f5480", "#5b4fa8", "#9a3f96", "#d43a63", "#f5402e"];
export const NAMES = ["COLD", "FLAT", "GOOD", "GREAT", "HOT"];

/* Boş basamağın rengi. Yanmamış çubuk zeminin bir tık üstü. */
export const RAMP_OFF = "rgba(255,255,255,.12)";

/* Puanın rengi. 0/null nötr döner — "veri yok" ile "soğuk" aynı şey değil. */
export function inkFor(value, none = "#9aa0a6") {
  const step = Math.round(Number(value) || 0);
  return step >= 1 ? RAMP[Math.min(4, step - 1)] : none;
}

/* Beş çubuk: yanan her basamak KENDİ rengini alır, hepsi tepe rengini değil.
   3c'deki kart bunu böyle çiziyor — 1.2 puanlı bir maçta tek çubuk yanar ve
   o çubuk soğuk mavidir, kırmızının soluk hali değil. */
export function heatSteps(value) {
  const lit = Math.round(Number(value) || 0);
  return RAMP.map((color, index) => (index < lit ? color : RAMP_OFF));
}
