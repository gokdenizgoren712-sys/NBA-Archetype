/* Ekran 2q — "Friends · the feed as a shelf". Saf yardımcılar.
 *
 * Kaynak `RankIt Redesign.dc.html#2q`: takip ettiklerinin kayıtları bir
 * koleksiyon kartı olarak (avatar · @kullanıcı · "on the night · 2h ago" ·
 * yıldızlar, altında kompakt kart, yorum, respect ve yanıt sayısı) ve
 * kapattıkları koleksiyonlar ("Finished Madrid Derbies — 6 of 6 rated this
 * season."). Veri `GET /activity`; burada hiçbir şey türetilip uydurulmuyor.
 */

/* SQLite zaman damgası bölgesiz UTC ("2026-09-23 19:40:00"). Bölgesiz ISO'yu
   tarayıcı YEREL okur — saat dilimi kadar kayardı. */
function parseUtc(iso) {
  if (!iso) return null;
  const text = String(iso).replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function feedAgo(iso, now = Date.now()) {
  const then = parseUtc(iso);
  if (!then) return "";
  const mins = Math.max(0, Math.round((now - then.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/* 2q alt satırı: "on the night · 2h ago" / "closed a collection · 5h ago". */
export function feedSub(item, now = Date.now()) {
  const ago = feedAgo(item.at, now);
  const lead = item.kind === "collection" ? "closed a collection" : item.on_the_night ? "on the night" : "";
  return [lead, ago].filter(Boolean).join(" · ");
}

export function initials(username = "") {
  return String(username).replace(/^@/, "").slice(0, 2).toUpperCase() || "?";
}

/* "Finished Madrid Derbies — 6 of 6 rated this season." Kulüp sezonunda
   "this season", seçkide sezon yok. */
export function collectionLine(c = {}) {
  const tail = `${c.collected} of ${c.total} rated${c.kind === "club_season" ? " this season" : ""}.`;
  return { title: c.title || "a collection", tail: `— ${tail}` };
}

export function collectionPercent(c = {}) {
  const total = Number(c.total) || 0;
  return total > 0 ? Math.round((Number(c.collected) || 0) / total * 100) : null;
}

/* /activity maç yükü -> uygulamanın maç nesnesi (toMatchCardProps girdisi).
   Kartın ısısı TOPLULUĞUN (uç 20 eşiğini uyguluyor); izleyenin kendi puanı
   yalnız "puanladı mı" olarak — skor kalkanı buna bakıyor. */
export function feedCardMatch(item) {
  const m = item.match || {};
  const score = m.home_score == null || m.away_score == null ? "" : `${m.home_score} – ${m.away_score}`;
  return {
    id: m.id, status: m.status, starts_at: m.starts_at, sport: m.sport,
    competition: m.competition || "", stage: m.stage || "",
    home: { name: m.home_name, short: m.home_short, color: m.home_color, crest_url: m.home_crest },
    away: { name: m.away_name, short: m.away_short, color: m.away_color, crest_url: m.away_crest },
    score, community_rating: m.community_rating, rating_count: m.rating_count,
    my_rating: item.viewer_rated ? 1 : null,
  };
}

/* §3.1: arkadaşın yıldızları ve yorumu bir HÜKÜM. Maçı henüz puanlamadıysan
   kapalı; açmak senin elinde ("Rate it first — then see whether the room
   agreed with you"). */
export function verdictCovered(item, revealed = false) {
  return item.kind === "entry" && item.match?.status === "finished" && !item.viewer_rated && !revealed;
}
