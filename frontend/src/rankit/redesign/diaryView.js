/* Günlük (Activity → Diary) — ekranlar 2d (timeline, ısı şeridi) ve 2e (raf).
 *
 * Saf mantık ayrı dosyada; `Diary.jsx` yalnız çiziyor. Kaynak:
 * `RankIt Redesign.dc.html#2d` / `#2e`.
 *
 * Sahibin kararı (2026-09-23): 2e'deki sağ üst "Newest" bir sıralama
 * yazısı değil, günlüğün FİLTRE BARINI açan tetikleyici. Watched / Classics /
 * Watchlist / Lists seçenekleri sayfanın üstünde pill olarak durmuyor, o barın
 * içinde; sayfa tahtadaki sade hâline dönüyor.
 */
import { inkFor } from "./heat.js";

export const SHOW = ["Watched", "Classics", "Watchlist", "Lists"];
export const DIARY_SORTS = ["Newest", "Oldest", "Top rated"];
export const WATCH_SORTS = ["Match date", "Added", "Competition"];

/* Bu görünümde hangi sıralamalar anlamlı. Listelerin sırası yok. */
export function sortsFor(show) {
  if (show === "Watchlist") return WATCH_SORTS;
  if (show === "Lists") return [];
  return DIARY_SORTS;
}

export function defaultSort(show) {
  return sortsFor(show)[0] || null;
}

export function filterDiary(entries = [], show = "Watched") {
  return show === "Classics" ? entries.filter((e) => e.classic) : entries;
}

const byDate = (a, b) => String(a.watched_date || "").localeCompare(String(b.watched_date || ""))
  || (Number(a.id) || 0) - (Number(b.id) || 0);

/* Newest = uçtan gelen sıra (izleme tarihi, sonra kayıt). "Top rated" kendi
   puanın; puansız izleme kaydı en sona. */
export function sortDiary(entries = [], sort = "Newest") {
  const list = [...entries];
  if (sort === "Oldest") return list.sort(byDate);
  if (sort === "Top rated") {
    return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byDate(b, a));
  }
  return list.sort((a, b) => byDate(b, a));
}

export function sortWatchlist(list = [], sort = "Match date") {
  const copy = [...list];
  if (sort === "Competition") return copy.sort((a, b) => String(a.competition || "").localeCompare(String(b.competition || "")));
  if (sort === "Added") return copy.sort((a, b) => Number(b.id) - Number(a.id));
  return copy.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

/* Ay başlıkları yalnız tarihe göre sıralıyken anlamlı; puana göre sırada
   aynı ay tekrar tekrar başlık açardı. */
export function groupsByMonth(sort) {
  return sort === "Newest" || sort === "Oldest";
}

const plural = (n, one, many) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/* 2e: "142 WATCHED · 11 CLASSICS". Profile (6b) ile AYNI tanım: izlenen =
   farklı maç (tekrar izleme ikinci maç değil), Classic = puanlı ve damgalı
   farklı maç. Eskiden kayıt sayılıyordu; aynı hesap Profile'da 2, günlükte 7
   diyordu (ölçüldü). */
export function statLine({ show = "Watched", entries = [], watchlist = [], lists = [] } = {}) {
  const watched = new Set(entries.map((e) => e.match_id)).size;
  const classics = new Set(entries.filter((e) => e.classic && e.rating != null).map((e) => e.match_id)).size;
  if (show === "Classics") return plural(classics, "CLASSIC", "CLASSICS");
  if (show === "Watchlist") return `${watchlist.length.toLocaleString("en-GB")} ON YOUR WATCHLIST`;
  if (show === "Lists") return plural(lists.length, "LIST", "LISTS");
  return `${watched.toLocaleString("en-GB")} WATCHED · ${plural(classics, "CLASSIC", "CLASSICS")}`;
}

/* Tetikleyicinin yazısı: varsayılan görünümde yalnız sıralama ("Newest",
   tahtadaki gibi); başka bir görünümdeyken o da söylenir. */
export function triggerLabel(show = "Watched", sort = "Newest") {
  if (show === "Lists") return "Lists";
  return show === "Watched" ? sort : `${show} · ${sort}`;
}

/* Yerel takvim günü — toISOString UTC'ye kayıyordu (gece yarısından sonra
   bir kullanıcının "bugün"ü dünü gösterirdi). */
export function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const STRIP_EMPTY = 22;   // tahtada boş gece %22, rgba(255,255,255,.07)
const STRIP_FLOOR = 30;          // kaydı olan en kısa çubuk boş geceden ayrışsın

/* 2d: "LAST 28 NIGHTS · 19 logged". "Height is your stars, colour is
   community heat." Bir gecede birden çok maç varsa en yüksek puanlın.
   Topluluk ısısı yoksa (§5.5: 20 puanın altı) renk YOK — nötr çizilir,
   uydurulmaz. */
export function heatStrip(entries = [], today = new Date()) {
  const byNight = new Map();
  for (const e of entries) {
    if (!e.watched_date) continue;
    const list = byNight.get(e.watched_date) || [];
    list.push(e);
    byNight.set(e.watched_date, list);
  }
  const nights = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12);
    const date = localDay(d);
    const list = byNight.get(date);
    if (!list) { nights.push({ date, logged: false, height: STRIP_EMPTY, color: null }); continue; }
    const best = [...list].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))[0];
    const stars = Number(best.rating) || 0;
    nights.push({
      date, logged: true, stars,
      height: Math.max(STRIP_FLOOR, Math.round((stars / 5) * 100)),
      color: rowHeat(best),
    });
  }
  return { nights, logged: nights.filter((n) => n.logged).length };
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

const noon = (iso) => new Date(`${iso}T12:00:00`);

/* 2d satırının tarih sütunu: "14" / "SUN". */
export function dayParts(iso) {
  const d = noon(iso);
  if (Number.isNaN(d.getTime())) return { day: "", weekday: "" };
  return { day: String(d.getDate()), weekday: WEEKDAY.format(d).toUpperCase() };
}

export function monthLabel(iso) {
  const d = noon(iso);
  return Number.isNaN(d.getTime()) ? "" : MONTH.format(d);
}

/* 2d: "Arsenal 3–1 Tottenham". Skor gizliyse "Arsenal vs Tottenham". */
export function rowTitle(e, hidden = false) {
  const home = e.home_short || e.home_name || "";
  const away = e.away_short || e.away_name || "";
  if (hidden || e.home_score == null || e.away_score == null) return `${home} vs ${away}`;
  return `${home} ${e.home_score}–${e.away_score} ${away}`;
}

/* Satırın sağındaki 4px çubuk: topluluk ısısı ya da nötr. §3.1: yıldızsız
   izleme kaydında topluluğun hükmü KAPALI ("Rate it first") — renk de sayı da
   yok. §5.5: 20 puanın altında ısı yok. */
export function rowVerdict(e) {
  return e.rating != null && e.community_rating != null ? Number(e.community_rating) : null;
}

export function rowHeat(e) {
  const v = rowVerdict(e);
  return v != null ? inkFor(v) : null;
}
