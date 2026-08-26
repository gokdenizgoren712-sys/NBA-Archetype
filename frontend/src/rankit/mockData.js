// ── RankIt demo verisi — YALNIZ YEREL GELİŞTİRME ────────────────────────────
// Bu dosya API'siz çalışırken ekranı doldurmak için var. Production'da HİÇBİRİ
// dönmüyor: sahte maç göstermek, kullanıcıya var olmayan bir karşılaşmayı
// puanlatmak demek — ve API bir an düştüğünde bunun olduğu fark bile edilmiyor.
//
// Bileşenler bu dizileri hem başlangıç state'i hem de fallback olarak
// kullanıyor (birden fazla yerde). Boşaltmayı tek noktada yapmak, o çağrı
// yerlerinin hepsini tek tek düzeltmekten hem daha az riskli hem de kalıcı:
// yarın yeni bir fallback eklenirse o da otomatik olarak production'da boş
// kalır. Boş dizide mevcut "empty state" arayüzü devreye giriyor.
const EMPTY = import.meta.env.PROD;

const devMatches = [
  {
    id: "nyk-bos-2026",
    sport: "Basketball",
    competition: "NBA · Eastern Conference",
    status: "finished",
    date: "Yesterday · 21:30",
    home: { name: "New York Knicks", short: "NYK", color: "#F58426" },
    away: { name: "Boston Celtics", short: "BOS", color: "#007A33" },
    score: "118 – 114",
    communityRating: 4.4,
    ratings: 12840,
    player: "Jalen Brunson",
    playerNo: "11",
    editorial: true,
    broadcaster: "S Sport Plus",
    reviews: 328,
    dominantTag: "Comeback",
    friends: ["Mert", "Ece", "Deniz"],
    summary: "A fourth-quarter comeback, a packed Garden and one final possession that decided everything.",
  },
  {
    id: "ars-rma-2026",
    sport: "Football",
    competition: "UEFA Champions League · Quarter-final",
    status: "upcoming",
    date: "Tonight · 22:00",
    home: { name: "Arsenal", short: "ARS", color: "#EF0107" },
    away: { name: "Real Madrid", short: "RMA", color: "#FEBE10" },
    broadcaster: "tabii Spor",
    editorial: true,
    watchlisted: true,
    friends: ["Can", "Ece", "Arda", "Selin"],
  },
  {
    id: "fcb-int-2026",
    sport: "Football",
    competition: "UEFA Champions League",
    status: "finished",
    date: "Saturday · 22:00",
    home: { name: "Barcelona", short: "BAR", color: "#A50044" },
    away: { name: "Inter", short: "INT", color: "#00529F" },
    score: "3 – 3",
    communityRating: 4.7,
    ratings: 23104,
    player: "Lamine Yamal",
    playerNo: "10",
    broadcaster: "TRT 1",
    reviews: 611,
    dominantTag: "Goal Fest",
    instantClassic: true,
    friends: ["Burak", "Mina"],
    summary: "Six goals and no safe moment. A European night built for the diary.",
  },
  {
    id: "den-okc-2026",
    sport: "Basketball",
    competition: "NBA · Western Conference",
    status: "upcoming",
    date: "Tomorrow · 04:30",
    home: { name: "Denver Nuggets", short: "DEN", color: "#FEC524" },
    away: { name: "Oklahoma City Thunder", short: "OKC", color: "#007AC1" },
    broadcaster: "NBA League Pass",
    friends: ["Mert", "Bora"],
  },
];

const devActivity = [
  { user: "Ece", initials: "EC", action: "rated", match: devMatches[0], rating: 4.5, text: "That final Brunson possession was pure theatre." },
  { user: "Mert", initials: "MK", action: "marked a Classic", match: devMatches[2], rating: 5, text: "The kind of match you remember by where you watched it." },
  { user: "Deniz", initials: "DA", action: "added to watchlist", match: devMatches[1], text: "Saving this one for the knockout-night atmosphere." },
];

const devLists = [
  { title: "Games that felt like cinema", count: 18, accent: "#FFB11B" },
  { title: "All-time Champions League nights", count: 32, accent: "#3FB08C" },
  { title: "Garden classics", count: 12, accent: "#1d428a" },
];


export const matches  = EMPTY ? [] : devMatches;
export const activity = EMPTY ? [] : devActivity;
export const lists    = EMPTY ? [] : devLists;
