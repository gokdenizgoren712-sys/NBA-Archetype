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
import { hasOwnRating } from "../rankitPrefs.js";

export { hasOwnRating } from "../rankitPrefs.js";

export const RAMP = ["#2f5480", "#5b4fa8", "#9a3f96", "#d43a63", "#f5402e"];
export const NAMES = ["COLD", "FLAT", "GOOD", "GREAT", "HOT"];

/* Boş basamağın rengi. Yanmamış çubuk zeminin bir tık üstü. */
export const RAMP_OFF = "rgba(255,255,255,.12)";

/* BUILD §5.5: topluluk ısısı ancak 20 gerçek oyla oluşur. Tekil yıldız
   kullanıcıya aittir; bu kapıdan geçmez. Eksik sayaç da eşik aşılmış gibi
   yorumlanmaz. */
export const MIN_COMMUNITY_RATINGS = 20;

/* BUILD §9/§19: planned heat is a different signal from community heat. The
   backend may expose it for scheduled fixtures; until then it stays null and
   the UI must not invent an appetite score. */
export function expectedHeat(match) {
  const raw = match?.expected_heat ?? match?.expectedHeat;
  if (raw === null || raw === undefined || raw === "") return null;
  const count = expectedInterestCount(match);
  if (count === null || count < MIN_COMMUNITY_RATINGS) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 5 ? value : null;
}

/* The design copy calls this "members who want this one". Keep the accepted
   aliases narrow and explicit so a community rating count cannot accidentally
   be presented as pre-match interest. */
export function expectedInterestCount(match) {
  const raw = match?.expected_rating_count ?? match?.expectedRatingCount ??
    match?.want_count ?? match?.wantCount ?? match?.watchlist_count ?? match?.watchlistCount;
  if (raw === null || raw === undefined || raw === "") return null;
  const count = Number(raw);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

export function communityRatingCount(match) {
  const raw = match?.rating_count ?? match?.ratingCount ?? match?.ratings;
  if (raw === null || raw === undefined || raw === "") return null;
  const count = Number(raw);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

export function communityHeat(match) {
  const count = communityRatingCount(match);
  const value = Number(match?.community_rating ?? match?.communityRating);
  return count !== null && count >= MIN_COMMUNITY_RATINGS &&
    Number.isFinite(value) && value > 0 ? value : null;
}

/* BUILD §3.1: izledim/logladım bilgisi bir görüş değildir. */
export function hasCommunityVerdict(match) {
  if (match?.hasVerdict === true) return true;
  if (match?.hasVerdict === false) return false;
  const reviews = match?.review_count ?? match?.reviewCount ?? match?.reviews;
  const reviewCount = Array.isArray(reviews) ? reviews.length : Number(reviews) || 0;
  const adaptedHeat = Number(match?.heat);
  const adaptedRating = communityRatingCount(match) >= MIN_COMMUNITY_RATINGS && Number.isFinite(adaptedHeat) && adaptedHeat > 0;
  return communityHeat(match) !== null || adaptedRating || reviewCount > 0 ||
    !!(match?.instant_classic || match?.instantClassic || match?.classic_count || match?.dominant_tag || match?.dominantTag || match?.potm || match?.player || match?.tags?.length);
}

export function communityVerdictCovered(match, { revealed = false, personal = false } = {}) {
  const finished = match?.status === "finished" || match?.finished === true || match?.finished === "true";
  // Yerel yıldız taslağı ve çevrimdışı kuyruk henüz onaylanmış bir görüş değil.
  // Koleksiyon sonucundan "Edit" ile dönüldüğünde ise başarılı makbuz geçerlidir.
  const confirmedEntry = match?.__entry && !match.__entryPending &&
    hasOwnRating({ my_rating: match.__entry.rating });
  const rated = match?.userRated === true || match?.userRated === "true" || hasOwnRating(match) || confirmedEntry;
  return finished && hasCommunityVerdict(match) && !personal && !rated && !revealed;
}

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
