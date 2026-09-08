/* Uygulamanın maç nesnesi → redesign MatchCard propları.
 *
 * Adaptör AYRI bir dosyada çünkü Faz 2-3'te üç ekran (home, diary, discover)
 * aynı eşlemeye ihtiyaç duyacak ve eşlemeyi üç kez yazmak üç kez sapma demek.
 *
 * Uydurulan hiçbir alan yok: karşılığı olmayan prop boş geçiliyor ve kart
 * onu çizmiyor.
 */

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
  const { hideScores = false, compact = false, scoreSize, cardWidth, crestSize } = opts;
  const finished = match.status === "finished";

  /* Skor STRING olarak geçer (§2.5): "112–108" biçimlendirilmemeli.
     Uygulama tek bir `score` dizesi tutuyor, kart iki parça istiyor. */
  const parts = String(match.score || "").split(/\s*[–-]\s*/);
  const homeScore = finished && parts.length === 2 ? parts[0] : "";
  const awayScore = finished && parts.length === 2 ? parts[1] : "";

  /* Isı = topluluk puanı. İkisi de 0-5 ve ikisi de "kalabalık bu maçı nasıl
     buldu" sorusunu cevaplıyor; ayrı bir ısı metriği arka uçta YOK. Puan
     yoksa satır hiç çizilmiyor (heat 0). */
  const heat = Number(match.communityRating) || 0;

  return {
    comp: [match.competition, match.stage].filter(Boolean).join(" · "),
    finished,
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
    heat,
    classic: !!match.instantClassic,
    spoiler: hideScores && finished,
    ratings: match.ratings ? `${Number(match.ratings).toLocaleString()} ratings` : "",
    /* Ayak sol tarafı: damga yokken yayın/aşama bilgisi. Kart tarihi
       tekrar etmiyor — üst şerit zaten yazıyor. */
    footNote: finished ? (match.dominantTag || "") : (match.broadcaster || ""),
    compact,
    // Taban punto çağrı yerinden gelir (preset), hane sayısına göre kısılır.
    ...(scoreSize ? { scoreSize: fitScore(scoreSize, homeScore, awayScore, cardWidth, crestSize) } : null),
  };
}
