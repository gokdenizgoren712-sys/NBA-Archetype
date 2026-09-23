/* Uygulamanın maç nesnesi → redesign MatchCard propları.
 *
 * Adaptör AYRI bir dosyada çünkü Faz 2-3'te üç ekran (home, diary, discover)
 * aynı eşlemeye ihtiyaç duyacak ve eşlemeyi üç kez yazmak üç kez sapma demek.
 *
 * Uydurulan hiçbir alan yok: karşılığı olmayan prop boş geçiliyor ve kart
 * onu çizmiyor.
 */
import { hidesScore } from "../rankitPrefs.js";
import { communityHeat, communityRatingCount, expectedHeat, expectedInterestCount, hasCommunityVerdict, hasOwnRating } from "./heat.js";
import { broadcastLabel } from "./broadcastLabel.js";
import { liveFreshness } from "./liveFreshness.js";


/* 3 harfli rozet. Kısa ad zaten kısaysa onu kullan, değilse sesli harfleri
   atmadan ilk üç harfi al — "Tottenham" → "TOT", "Man City" → "MAN". */
function abbr(team) {
  const short = (team?.short || team?.name || "").trim();
  if (!short) return "";
  const first = short.split(/\s+/)[0];
  return (first.length <= 3 ? first : first.slice(0, 3)).toUpperCase();
}

/* Açık formalar koyu mürekkep ister (§1: Tottenham gibi kitler #101318).
   Kulüp rengi API'den geliyor; parlaklığı ondan türetiyoruz, sabit liste yok. */
function crestInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.42 ? "#101318" : "#ffffff";
}

/* §2.5: "football and basketball scores cannot share one size".
   Ama sorun puntodan büyük: §2.4'ün düzeni orta sütuna
   `kart − 2×(crest×1.414) − 36 dolgu − 26 boşluk` bırakıyor. 268'lik web wall
   preset'inde bu 30px eder ve dokümanın önerdiği 30px'lik 6 haneli skor
   103px yer kaplar — yani tavsiye kendi geometrisine sığmıyor.

   Burada punto SÜTUNDAN türetiliyor: Rajdhani 700 rakamları ~0.58em geniş,
   ayırıcı ve boşluklar payla birlikte. Sonuç asla preset tabanını aşmaz,
   ama armanın altına da girmez. */
function fitScore(base, homeScore, awayScore, cardWidth, crestSize) {
  const text = `${homeScore}${awayScore}`;
  if (!text) return base;
  if (!cardWidth || !crestSize) return base;
  const column = cardWidth - 2 * (crestSize * 1.414) - 36 - 26;
  if (column <= 0) return base;
  // rakamlar + ayırıcı ("–" ve iki yanındaki 8px boşluk)
  const glyphs = text.replace(/\s/g, "").length;
  const perGlyph = 0.58;
  const separator = 16 + base * 0.34;
  const fits = (column - separator) / (glyphs * perGlyph);
  return Math.max(18, Math.min(base, Math.floor(fits)));
}

export function toMatchCardProps(match, opts = {}) {
  if (!match) return null;
  const { hideScores = false, compact = false, scoreSize, cardWidth, crestSize,
          nowMs = Date.now() } = opts;
  const finished = match.status === "finished";
  const hasScore = finished || match.status === "live";

  /* Skor STRING olarak geçer (§2.5): "112–108" biçimlendirilmemeli.
     Uygulama tek bir `score` dizesi tutuyor, kart iki parça istiyor. */
  const parts = String(match.score || "").split(/\s*[–-]\s*/);
  const homeScore = hasScore && parts.length === 2 ? parts[0] : "";
  const awayScore = hasScore && parts.length === 2 ? parts[1] : "";

  /* Isı = topluluk puanı. İkisi de 0-5 ve ikisi de "kalabalık bu maçı nasıl
     buldu" sorusunu cevaplıyor; ayrı bir ısı metriği arka uçta YOK. Puan
     yoksa satır hiç çizilmiyor (heat 0). */
  // Beklenen ilgi (2h/16c) ayrı bir sinyal; maç öncesine bitmiş maçın
  // topluluk hükmünü taşımıyoruz. Backend okuma sayısını ayrı döndürüyor.
  const stale = liveFreshness(match, nowMs) === "stale";
  const heat = finished ? communityHeat(match) : null;
  const ratingCount = finished ? communityRatingCount(match) : null;
  const plannedHeat = !finished && match.status !== "live" ? expectedHeat(match) : null;
  const plannedCount = !finished && match.status !== "live" ? expectedInterestCount(match) : null;

  return {
    comp: [match.competition, match.stage].filter(Boolean).join(" · "),
    finished,
    status: match.status,
    sport: match.sport,
    /* B7 / 15d: canli kaynak dort yoklamayi (3 dk) kacirdiysa kart "LIVE"
       diyemez — o an dogru oldugunu iddia eden bir skorun yaninda duruyor.
       Isaret notr: "DELAYED", sicak renk yok. Skor kaldiriliyor DEGIL (bilinen
       son skor hala bilgi), yalniz tazelik iddiasi kaldiriliyor. */
    liveStale: stale,
    statusLabel: (stale ? "DELAYED"
      : ({live:"LIVE", upcoming:"UPCOMING", finished:"FULL TIME", postponed:"POSTPONED", cancelled:"CANCELLED"})[match.status])
      || "TO BE CONFIRMED",
    homeAbbr: abbr(match.home), awayAbbr: abbr(match.away),
    homeShort: match.home?.short || match.home?.name || "",
    awayShort: match.away?.short || match.away?.name || "",
    homeScore, awayScore,
    kickoff: match.time || "",
    homeColor: match.home?.color || "#3a3f47",
    awayColor: match.away?.color || "#2a2e34",
    homeCrestInk: crestInk(match.home?.color),
    awayCrestInk: crestInk(match.away?.color),
    homeCrestUrl: match.home?.crest_url || "",
    awayCrestUrl: match.away?.crest_url || "",
    heat: heat ?? 0,
    expectedHeat: plannedHeat ?? 0,
    expectedRatingCount: plannedCount,
    heatLabel: plannedCount !== null ? "EXPECTED" : "",
    ratingCount,
    hasVerdict: finished && hasCommunityVerdict(match),
    userRated: hasOwnRating(match),
    classic: finished && !!match.instantClassic,
    // 3g "Keep hiding until I rate" — kural rankitPrefs'te tek yerde;
    // burada tekrar yazilsaydi bir ekranda acik bir ekranda kapali olurdu.
    spoiler: hidesScore(hideScores, match),
    ratings: ratingCount !== null ? `${ratingCount.toLocaleString()} ratings` : "",
    /* Ayak sol tarafı: damga yokken yayın/aşama bilgisi. Kart tarihi
       tekrar etmiyor — üst şerit zaten yazıyor. */
    footNote: finished ? (match.dominantTag || "") : broadcastLabel(match),
    compact,
    // Taban punto çağrı yerinden gelir (preset), hane sayısına göre kısılır.
    ...(scoreSize ? { scoreSize: fitScore(scoreSize, homeScore, awayScore, cardWidth, crestSize) } : null),
  };
}


/* Gunluk satiri MAC nesnesiyle AYNI sekle sahip degil: /diary duz sutunlar
   donduruyor (home_short, home_color, ...) ve `id` MACIN degil KAYDIN id'si.
   toMatchCardProps'u dogrudan uygulamak takim adlarini undefined birakir,
   skoru yok eder ve kart tiklaninca yanlis maci acar — web tarafinda
   diaryToCard ayni sebeple ayri duruyor. */
export function diaryToMatchCardProps(entry, opts = {}) {
  if (!entry) return null;
  const score = entry.home_score == null ? null : `${entry.home_score} – ${entry.away_score}`;
  const props = toMatchCardProps({
    id: entry.match_id,
    competition: entry.competition,
    sport: entry.sport,
    status: entry.status,
    time: "",
    home: { name: entry.home_name, short: entry.home_short, color: entry.home_color, crest_url: entry.home_crest },
    away: { name: entry.away_name, short: entry.away_short, color: entry.away_color, crest_url: entry.away_crest },
    score,
    // Rafta gosterilen isi KULLANICININ kendi puani, toplulugunki degil:
    // burasi kendi gunlugun, kalabaligin ortalamasi degil.
    communityRating: entry.rating,
    my_rating: entry.rating,
  }, opts);
  return { ...props, ratingKind: "personal", heat: Number(entry.rating) || 0,
    // 2j: kaydin skini kartin kendisini boyar (defter, raf); yoksa varsayilan.
    skin: entry.skin || entry.their_skin || "default",
    heatLabel: "YOUR RATING", classic: !!entry.classic,
    ratings: entry.classic ? "YOUR CLASSIC" : "YOUR DIARY" };
}
