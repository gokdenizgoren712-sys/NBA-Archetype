/* API maç satırı → uygulamanın maç nesnesi. Telefon ve web AYNI eşlemeyi
   kullanıyor: ortak MatchCard (redesign/MatchCard.jsx) iki yüzeyde aynı
   nesneden çizilsin, kart kuralları (ısı eşiği, kalkan, Classic) bir yüzeyde
   açık öbüründe kapalı kalmasın diye. Aşama 15'e kadar RankItPrototype.jsx'in
   içindeydi. */
import { formatWhen } from "./formatWhen";

export function fromApiMatch(m) {
  if (!m) return m;
  const { date: fullDate, time, full } = formatWhen(m.starts_at);
  return {
    ...m,
    // `date` tam dize olarak KALIYOR: fikstür listesi ve bildirimlerde tek
    // zaman referansı o. Kart ve maç sayfası ise parçaları ayrı kullanır,
    // yoksa aynı kartta saat iki, maç sayfasında tarih iki kez yazılıyordu.
    date: full,
    dateOnly: fullDate,
    time,
    communityRating: m.community_rating,
    ratings: m.rating_count || 0,
    reviewCount: m.review_count || 0,
    reviews: Array.isArray(m.reviews) ? m.reviews : [],
    player: m.potm?.name,
    playerNo: m.potm?.shirt_no,
    instantClassic: m.instant_classic,
    dominantTag: m.dominant_tag,
    friends: [],
  };
}
