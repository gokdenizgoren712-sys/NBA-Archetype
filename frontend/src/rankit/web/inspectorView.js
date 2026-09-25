/* Web Inspector'ın saf mantığı — BUILD §9 (beş evre), §19, ekranlar 16c · 15w ·
 * 7b · 15x · 7c · 16a · 7d · 16b.
 *
 * "One object at five points in a match's life. The tabs never change" —
 * sekmeler (Match · Community · Companion) evreden bağımsız; değişen yalnız
 * içerik ve alttaki tek birincil eylem. Bu dosya o tabloyu kod olarak tutuyor
 * ki çizim ile kural ayrışmasın.
 */

export const TABS = ["Match", "Community", "Companion"];

/* §9 tablosunun satırları. Kadro açıklanınca (XI) yalnız Match içeriği ve
   birincil eylem değişir; ayrı çizilmez (§9.1). */
export function inspectorPhase(detail) {
  if (!detail) return null;
  if (detail.status === "live") return "live";
  if (detail.status === "finished") return Number(detail.my_rating) > 0 ? "rated" : "unrated";
  return detail.lineups?.length ? "lineup" : "scheduled";
}

export const isFinished = (phase) => phase === "rated" || phase === "unrated";

/* Telefonla aynı varsayılan: bitmiş maçta önce topluluk (davet ya da kayıt),
   diğerlerinde künye. */
export function defaultTab(phase) {
  return isFinished(phase) ? "Community" : "Match";
}

/* 3 harfli rozet — kartın `abbr` kuralı: kısa ad zaten kısaysa o, değilse
   ilk kelimenin ilk üç harfi. "Tottenham" → "TOT". */
export function teamAbbr(team) {
  const short = String(team?.short || team?.short_name || team?.name || "").trim();
  if (!short) return "";
  const first = short.split(/\s+/)[0];
  return (first.length <= 3 ? first : first.slice(0, 3)).toUpperCase();
}

/* "CHE vs SPO" / "CHE 2–1 SPO". Skor yalnız oynanmış ya da oynanan maçta ve
   kalkan kapatmıyorsa (§3). */
export function matchLabel(detail, { scoreHidden = false } = {}) {
  if (!detail) return "";
  const home = teamAbbr(detail.home);
  const away = teamAbbr(detail.away);
  const played = detail.status === "live" || detail.status === "finished";
  const score = String(detail.score || "").replace(/\s+/g, "");
  return played && score && !scoreHidden ? `${home} ${score} ${away}` : `${home} vs ${away}`;
}

/* Alttaki tek birincil eylem (§9 tablosu "Primary action"). null = alt
   çubuk yok. Companion sekmesinin çubuğu CompanionPanel'in kendisi. */
export function primaryAction(tab, phase, { rating = 0, dirty = false, watchlisted = false } = {}) {
  if (tab === "Match") {
    if (phase === "scheduled" || phase === "lineup") {
      return { kind: "watchlist", label: watchlisted ? "In your watchlist" : "Add to watchlist" };
    }
    if (phase === "live") return { kind: "companion", label: "Watch with your Companion" };
    if (phase === "unrated") return { kind: "rate", label: "Rate this match" };
    return null;
  }
  if (tab === "Community") {
    // §9.3: "Primary action in a fixed footer, inert until there are stars."
    if (phase === "unrated") return { kind: "log", label: "Log this match", disabled: !(rating > 0) };
    if (phase === "rated" && dirty) return { kind: "log", label: "Update your entry", disabled: !(rating > 0) };
  }
  return null;
}

/* 15w "ON THE PITCH": tahta ince mevki yazıyor (CB, AM, ST); sağlayıcıdan
   yalnız kaba etiket geliyor (Keeper / Defender / Midfielder / Attacker).
   Olmayan inceliği uydurmuyoruz — kaba etiketin kısaltması. */
const POSITIONS = { keeper: "GK", goalkeeper: "GK", defender: "DF", midfielder: "MF", midfield: "MF", attacker: "FW", forward: "FW" };
export function positionShort(label) {
  const key = String(label || "").trim().toLowerCase();
  return POSITIONS[key] || (key ? key.slice(0, 2).toUpperCase() : "");
}

/* Yarım yıldız klavye kuralı (11a / 15x "." = half): tam puandan yarım
   aşağı, yarımdan tama. 0'da bir şey yapmaz. */
export function toggleHalf(rating) {
  const r = Number(rating) || 0;
  if (r <= 0) return 0;
  return Number.isInteger(r) ? r - 0.5 : Math.ceil(r);
}

/* Taslak ↔ kayıt karşılaştırması: "Update your entry" yalnız gerçekten bir
   şey değişince görünür. Oyuncu oyları ve inceleme metni de kaydın parçası. */
export function entryDirty(draft, saved) {
  if (!draft || !saved) return false;
  const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  return Number(draft.rating || 0) !== Number(saved.rating || 0)
    || !!draft.classic !== !!saved.classic
    || !same(draft.tags, saved.tags)
    || (draft.review || "") !== (saved.review || "")
    || (draft.potmId ?? null) !== (saved.potmId ?? null)
    || !same(draft.respect, saved.respect);
}

export function entryFromDetail(detail) {
  return {
    rating: Number(detail?.my_rating) || 0,
    classic: !!detail?.my_classic,
    tags: [...(detail?.my_tags || [])],
    review: detail?.my_review || "",
    potmId: detail?.my_potm_id ?? null,
    respect: [...(detail?.my_respect_ids || [])],
  };
}
