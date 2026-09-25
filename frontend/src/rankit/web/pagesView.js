/* Masaüstü sayfalarının saf mantığı — 7f raf, 7g sezon ısı haritası, 7h okuma.
   Çizim ShelfPage / HeatMapPage / ReviewsPage'de; kurallar burada ve testli. */
import { toMatchCardProps } from "../redesign/toMatchCardProps.js";
import { fromApiMatch } from "../matchModel.js";
import { RAMP } from "../redesign/heat.js";

/* 7f kartı: rafın sahibinin kaydı kartı boyar (kişisel puan, Classic, skin).
   BAŞKASININ rafında, maçı sen puanlamadıysan onun puanı ve damgası bir
   hüküm (§3.1) — kapalı; kart yine onun skiniyle çizilir.
   174px'lik kompakt kart telefonun profil rafı düzeninde (`profileShelf`:
   durum satırı yok, sık aralık); Classic yalnız göz etiketindeki altın elmas
   (tahtada `ratings=""`), okunur hâli `aria` cümlesinde. */
export function shelfCardProps(card, { own = false, hideScores = false } = {}) {
  const sport = card?.sport;
  const base = toMatchCardProps(fromApiMatch(card), {
    hideScores, compact: true, scoreSize: sport === "Basketball" ? 16 : 21, cardWidth: 180, crestSize: 34,
  });
  const entry = card?.entry || {};
  const skin = entry.skin || "default";
  const who = own ? "YOUR" : "THEIR";
  if (!own && !(Number(card?.my_rating) > 0)) {
    // Topluluk sayısı da düşer: bir kartta "TOO FEW RATINGS", yanındakinde
    // boşluk — kapalı rafta hangisinin hüküm taşıdığını ele verirdi.
    return { ...base, profileShelf: true, hasVerdict: false, heat: 0, classic: false, ratings: "", ratingCount: null, skin, aria: "" };
  }
  const rating = Number(entry.rating) || 0;
  const aria = [rating ? `${own ? "your" : "their"} rating ${rating.toFixed(1)}` : "", entry.classic ? `${own ? "your" : "their"} Classic` : ""]
    .filter(Boolean).join(", ");
  return {
    ...base, profileShelf: true, ratingKind: "personal", ratingOwner: own ? "you" : "member", hasVerdict: false, heat: rating,
    heatLabel: `${who} RATING`, classic: !!entry.classic, ratings: "", skin, aria,
  };
}

/* "By competition": uç kartları turnuva sırasıyla verir, başlıkları istemci
   koyar. Diğer sıralarda tek grup, başlıksız. */
export function shelfGroups(cards = [], sort = "newest") {
  if (sort !== "competition") return [{ title: null, cards }];
  const groups = [];
  for (const card of cards) {
    const title = card.competition || "Other";
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.cards.push(card);
    else groups.push({ title, cards: [card] });
  }
  return groups;
}

/* 7g hücresi: `heat` rampa rengi (5'te ışıma), `too_few` kesikli, `unplayed`
   .04, `none` (o hafta maçı yok) boş. Renk tek başına değil (§6): her
   hücrenin okunur etiketi sayıyı ve durumu söyler. */
export function heatCell(cell, clubName = "") {
  const week = `matchweek ${cell?.week}`;
  const logged = cell?.logged ? ", you logged it" : "";
  if (cell?.state === "heat" && Number.isFinite(Number(cell.heat))) {
    const value = Number(cell.heat);
    const step = Math.max(1, Math.min(5, Math.round(value)));
    return { kind: "heat", color: RAMP[step - 1], glow: step === 5,
      label: `${clubName}, ${week}: heat ${value.toFixed(1)} from ${cell.ratings} ratings${logged}` };
  }
  if (cell?.state === "too_few") {
    return { kind: "too_few", label: `${clubName}, ${week}: too few ratings (${cell.ratings || 0})${logged}` };
  }
  if (cell?.state === "unplayed") return { kind: "unplayed", label: `${clubName}, ${week}: not played yet` };
  return { kind: "none", label: `${clubName}, ${week}: no match` };
}

/* Hafta başlığı sönük mü: o haftada hiç oynanmış maç yoksa (tahtada 23+). */
export function weekPlayed(clubs = [], index = 0) {
  return clubs.some((club) => ["heat", "too_few"].includes(club.cells?.[index]?.state));
}

/* 7h RATING SPREAD: beş çubuk, en yüksek sayı %100. Uç 20 puan altında
   `null` döner (§5.5) — o zaman çubuk yok, "TOO FEW RATINGS". */
export function spreadBars(spread) {
  if (!spread) return null;
  const counts = [1, 2, 3, 4, 5].map((star) => Number(spread[String(star)]) || 0);
  const max = Math.max(...counts);
  return counts.map((count, index) => ({
    star: index + 1, count, color: RAMP[index],
    pct: max > 0 ? Math.max(count > 0 ? 4 : 0, Math.round((count / max) * 100)) : 0,
  }));
}

/* ── Aşama 17, 2. parti: 8c turnuva · 12a kulüp · 11c arama ───────────────── */

/* 8c · 12a · 11c'nin kompakt TOPLULUK kartı (174, rafla aynı düzen). Göz
   etiketi yüzeye göre: turnuvada gün+saat ("SAT 16:30"), kulüpte ve aramada
   turnuva+hafta ("PREMIER LEAGUE · MW4"). Sayı satırı yok (tahtada
   `ratings=""`); ısı, 20 eşiği ve §3.1 kapısı kartın kendi kuralları. */
export function compactCardProps(match, { hideScores = false, eyebrow = "" } = {}) {
  const base = toMatchCardProps(fromApiMatch(match), {
    hideScores, compact: true, scoreSize: match?.sport === "Basketball" ? 16 : 21, cardWidth: 180, crestSize: 34,
  });
  return { ...base, profileShelf: true, ratings: "", ...(eyebrow ? { comp: eyebrow } : null) };
}

/* "Matchday 4" → "MW4", "Round 12" → "R12"; sayısız aşama olduğu gibi. */
export function stageShort(stage) {
  const text = String(stage || "").trim();
  const n = /\d+/.exec(text);
  if (!n) return text;
  if (/^(match ?day|match ?week|game ?week|week)\b/i.test(text)) return `MW${n[0]}`;
  if (/^round\b/i.test(text)) return `R${n[0]}`;
  return text;
}

export function cardEyebrow(match) {
  return [match?.competition, stageShort(match?.stage)].filter(Boolean).join(" · ").toUpperCase();
}

/* 8c göz etiketi: oynanmış maçta "SAT 16:30" (tahta); oynanmamışta saat
   zaten kartın gövdesinde — tekrar yerine gün ve tarih ("SAT 3 OCT"). */
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
export function kickoffEyebrow(iso, { upcoming = false } = {}) {
  const when = new Date(iso);
  if (!iso || Number.isNaN(when.getTime())) return "";
  const tail = upcoming ? dayMonth(when) : when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${WEEKDAY.format(when)} ${tail}`.toUpperCase();
}

export function ordinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  const tens = v % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[v % 10] || "th");
  return `${v}${suffix}`;
}

/* Açılışta oynanmakta olan hafta: tamamlanmamış ilk hafta, yoksa sonuncu
   (telefonun 3c kuralı). */
export function currentWeek(matchweeks = []) {
  const live = matchweeks.find((w) => w.finished < w.matches);
  return (live || matchweeks[matchweeks.length - 1] || null)?.stage || null;
}

/* 8c şeridi: seçili haftanın çevresinde en fazla `size` hafta, uçlarda
   kayar. Her hafta 44'lük hedef ister (§6) — 38 hafta tek satıra sığmaz. */
export function weekWindow(matchweeks = [], active = null, size = 5) {
  const i = Math.max(0, matchweeks.findIndex((w) => w.stage === active));
  const start = Math.max(0, Math.min(i - Math.floor(size / 2), matchweeks.length - size));
  return matchweeks.slice(start, start + size);
}

export function weekNumber(stage) {
  return (String(stage || "").match(/\d+/) || [String(stage || "")])[0];
}

/* 8c tablosu: futbolda P · GD · PTS (tahta), baskette galibiyet tablosu —
   "points" orada anlamsız, sayı farkı GD sütununda geliyor. */
export function standingColumns(sport) {
  const signed = (v) => (Number(v) > 0 ? `+${v}` : String(v ?? 0));
  if (sport === "Basketball") {
    return [
      { key: "won", label: "W", title: "Won" },
      { key: "lost", label: "L", title: "Lost" },
      { key: "gd", label: "DIFF", title: "Points difference", format: signed, wide: true },
    ];
  }
  return [
    { key: "played", label: "P", title: "Played" },
    { key: "gd", label: "GD", title: "Goal difference", format: signed },
    { key: "points", label: "PTS", title: "Points", strong: true },
  ];
}

/* 8c AVG HEAT hücresi: yalnız 20+ puanlı maçlardan (uç `avg_heat` null
   dönerse "TOO FEW" — uydurma çubuk yok, §5.5). */
export function avgHeatCell(row) {
  const value = row?.avg_heat;
  if (value == null || !Number.isFinite(Number(value))) {
    return { value: null, steps: 0, label: `Average heat: too few rated matches (${row?.heat_matches || 0})` };
  }
  const v = Number(value);
  return { value: v, steps: Math.max(0, Math.min(5, Math.round(v))), label: `Average heat ${v.toFixed(1)} across ${row.heat_matches} rated matches` };
}

/* 11c sekmeleri: sayılar uçtan (`counts`, gerçek toplamlar); "All" onların
   toplamı. Sekme sırası tahtadaki gibi, oyuncular sonda (telefonun 3e'si
   oyuncu arıyor — web'de kaybolmasın). */
export const SEARCH_TABS = [
  { key: "all", label: "All" },
  { key: "matches", label: "Matches", count: "matches" },
  { key: "teams", label: "Clubs", count: "teams" },
  { key: "members", label: "People", count: "members" },
  { key: "lists", label: "Lists", count: "lists" },
  { key: "players", label: "Players", count: "players" },
];

export function searchTotal(counts) {
  if (!counts) return 0;
  return SEARCH_TABS.reduce((sum, tab) => sum + (tab.count ? Number(counts[tab.count]) || 0 : 0), 0);
}

export function searchTabLabel(tab, counts) {
  if (!tab.count || !counts) return tab.label;
  return `${tab.label} ${(Number(counts[tab.count]) || 0).toLocaleString()}`;
}

/* 11c kulüp satırı: "Premier League · 4.3 avg heat"; 20 puanlı maç yoksa
   sayı yerine "too few ratings" (Codex listesi: null → TOO FEW RATINGS). */
export function clubLine(team) {
  const comp = team?.season_competition?.name || team?.competition || "";
  const heat = team?.season_avg_heat;
  const heatText = heat == null ? "too few ratings" : `${Number(heat).toFixed(1)} avg heat`;
  return [comp, comp || heat != null ? heatText : ""].filter(Boolean).join(" · ");
}

/* 11c kişi satırı: sorgu bir kulübe uyduysa "31 Arsenal matches logged".
   Uç kulübü ad olarak verir; sıfır kayıt satırı kalabalıklaştırır, yazılmaz. */
export function personLine(member) {
  const n = Number(member?.club_logged) || 0;
  if (!member?.club || n <= 0) return "";
  const club = typeof member.club === "string" ? member.club : member.club.short_name || member.club.name || "club";
  return `${n} ${club} ${n === 1 ? "match" : "matches"} logged`;
}

/* 11c liste satırı: "12 matches · by @selin" (uçta `total`). */
export function listLine(list) {
  const n = Number(list?.total ?? list?.match_count ?? 0) || 0;
  return [`${n} ${n === 1 ? "match" : "matches"}`, list?.username ? `by @${list.username}` : ""].filter(Boolean).join(" · ");
}

/* 12a NEXT satırı: bu hafta içindeyse "Sunday 16:30" (tahta), daha
   uzaksa "Sun 11 Oct · 16:30"; ardından avdaki koleksiyon ("counts toward
   The 38" — başlık "London Derbies" da olabilir, "The 38" de; ikisine de
   oturan tek cümle). */
export function nextLine(match, now = new Date()) {
  const when = new Date(match?.starts_at);
  if (!match?.starts_at || Number.isNaN(when.getTime())) return "";
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const soon = when - now >= 0 && when - now < 6 * 24 * 3600 * 1000;
  const day = soon
    ? new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(when)
    : `${new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(when)} ${dayMonth(when)}`;
  const collections = (match.collections || []).filter(Boolean);
  return [soon ? `${day} ${time}` : `${day} · ${time}`, collections.length ? `counts toward ${collections.join(" and ")}` : ""]
    .filter(Boolean).join(" · ");
}

/* ── Aşama 17, 3. parti: 8b profil · 10a kişiler · 12b listeler · 12c av ─── */

/* 8b "RANK 4 OF 7": kademe sayısı uçta yok; rankit_rank.TIERS yedi basamak
   (New Voice → Archivist). Değişirse bu sabit ve testi birlikte değişir. */
export const TIER_COUNT = 7;

export function rankCard(rank) {
  const r = rank?.rank;
  if (!r) return null;
  const progress = Math.max(0, Math.min(1, Number(r.progress) || 0));
  return {
    tier: r.tier, name: r.name, label: `RANK ${r.tier} OF ${TIER_COUNT}`, emblem: String(r.tier).padStart(2, "0"),
    points: Number(r.points) || 0, pct: Math.round(progress * 100),
    next: r.next_name ? `${String(r.next_name).toUpperCase()} AT ${Number(r.next_at).toLocaleString()}` : "TOP OF THE LADDER",
  };
}

/* 10a uyum: yalnız en az `min_shared` ortak maçta yüzde (telefonun kuralı —
   %72 → üç çubuk, yuvarlama değil TABAN). Az ortakta sayı uydurulmaz. */
export function agreementView(overlap) {
  const shared = Number(overlap?.shared) || 0;
  const min = Math.max(10, Number(overlap?.min_shared) || 10);
  const raw = Number(overlap?.pct);
  if (shared < min || overlap?.pct == null || !Number.isFinite(raw)) {
    return { pct: null, steps: 0, color: null, shared, agree: Number(overlap?.agree) || 0,
      short: "Too few to compare", long: shared ? `Only ${shared} shared ${shared === 1 ? "match" : "matches"} — too few to compare taste` : "No shared matches yet" };
  }
  const p = Math.max(0, Math.min(1, raw));
  const steps = Math.max(1, Math.min(5, Math.floor(p * 5)));
  const agree = Number(overlap.agree) || 0;
  return { pct: Math.round(p * 100), steps, color: RAMP[steps - 1], shared, agree, short: `${Math.round(p * 100)}%`,
    long: `${agree} of ${shared} shared` };
}

/* "Runs about a star warmer than you" — eğilim yarım yıldıza yuvarlanır. */
export function leaningLine(bias) {
  if (bias == null || !Number.isFinite(Number(bias))) return "";
  const halves = Math.round(Math.abs(Number(bias)) * 2);
  if (!halves) return "Rates about the same as you";
  const size = halves === 1 ? "half a star" : halves === 2 ? "a full star" : `${halves / 2} stars`;
  return `Runs ${size} ${Number(bias) < 0 ? "colder" : "hotter"} than you`;
}

export function personStats(person) {
  const n = Number(person?.matches) || 0;
  const c = Number(person?.classics) || 0;
  return [`${n.toLocaleString()} logged`, c ? `${c.toLocaleString()} ${c === 1 ? "classic" : "classics"}` : ""].filter(Boolean).join(" · ");
}

/* 12b sol sütun: "12 matches · 8 rated" / "7 matches · private" /
   "5 matches · 34 respects" — gizli liste respect toplamaz, onu söyler. */
export function ownedListLine(list) {
  const n = Number(list?.match_count) || 0;
  const count = `${n} ${n === 1 ? "match" : "matches"}`;
  if (list?.visibility === "private") return `${count} · private`;
  const respect = Number(list?.respect) || 0;
  if (respect > 0) return `${count} · ${respect} ${respect === 1 ? "respect" : "respects"}`;
  return `${count} · ${Number(list?.rated) || 0} rated`;
}

export function savedListLine(list) {
  const n = Number(list?.match_count ?? list?.total) || 0;
  return [list?.username ? `by @${list.username}` : "", `${n} ${n === 1 ? "match" : "matches"}`].filter(Boolean).join(" · ");
}

/* 12b ilerleme: listedeki maçlardan puanladıkların. */
export function listProgress(matches = []) {
  const total = matches.length;
  const rated = matches.filter((m) => Number(m.my_rating) > 0).length;
  return { rated, total, pct: total ? Math.round((rated / total) * 100) : 0 };
}

/* "6 Sep" — en-GB Eylül'ü "Sept" yazıyor; tahtalar ve diğer aylar üç harf. */
export function dayMonth(when) {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).formatToParts(when);
  const day = parts.find((x) => x.type === "day")?.value || "";
  const month = (parts.find((x) => x.type === "month")?.value || "").slice(0, 3);
  return `${day} ${month}`.trim();
}

/* "14 Sep" (8b girdisi); 12b/12c kart göz etiketi büyük harfle "14 SEP". */
export function shortDate(iso) {
  const when = new Date(iso);
  if (!iso || Number.isNaN(when.getTime())) return "";
  return dayMonth(when);
}

export function dateEyebrow(iso) {
  return shortDate(iso).toUpperCase();
}

/* 12c THE FULL GRID: toplananlar (kart) → oynanmış ama puanlanmamışlar
   (kesikli, "played") → sıradaki (kırmızı çerçeve) → kalanlar (kesikli,
   tarihli). Uç üç ayrı dizi veriyor; sıra burada, tek yerde. */
export function huntGrid(detail) {
  const collected = (detail?.collected_matches || []).map((match) => ({ kind: "collected", match }));
  const open = (detail?.open_matches || []).map((match) => ({ kind: "open", match }));
  const upcoming = (detail?.upcoming_matches || []).map((match, i) => ({ kind: i === 0 ? "next" : "missing", match }));
  return [...collected, ...open, ...upcoming];
}

/* ── Aşama 17, 4. parti: 11d etkinlik ─────────────────────────────────────── */

/* 11d YOUR DIARY · LAST 28 NIGHTS: gece başına bir çubuk — boy senin
   yıldızın (o gecenin en yükseği), renk topluluk ısısı (yalnız 20+ puanla;
   azsa nötr — uydurma renk yok, §5.5). Boş gece .07, kısa. */
export function diaryNights(entries = [], now = new Date(), days = 28) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const byNight = new Map();
  for (const e of entries) {
    const night = String(e.watched_date || "").slice(0, 10);
    if (!night) continue;
    const prev = byNight.get(night);
    if (!prev || (Number(e.rating) || 0) > (Number(prev.rating) || 0)) byNight.set(night, e);
  }
  const out = [];
  let logged = 0;
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const night = key(d);
    const e = byNight.get(night);
    if (!e) { out.push({ night, empty: true, height: 22, color: null, label: `${night}: nothing logged` }); continue; }
    logged += entries.filter((x) => String(x.watched_date || "").slice(0, 10) === night).length;
    const rating = Number(e.rating) || 0;
    const heat = Number(e.rating_count) >= 20 && Number(e.community_rating) > 0 ? Number(e.community_rating) : null;
    out.push({
      night, empty: false, height: rating ? Math.max(12, Math.round((rating / 5) * 100)) : 12,
      color: heat == null ? "rgba(255,255,255,.28)" : RAMP[Math.max(0, Math.min(4, Math.round(heat) - 1))],
      label: `${night}: ${rating ? `your ${rating.toFixed(1)}` : "logged, not rated"}${heat == null ? "" : `, community heat ${heat.toFixed(1)}`}`,
    });
  }
  return { nights: out, logged };
}

/* /activity girdisi → ReviewArticle satırı (respect, yanıtlar, iplik). */
export function feedReviewRow(item) {
  return {
    id: item.entry_id, username: item.user?.username, rating: item.rating, review: item.review, classic: item.classic,
    spoiler: item.spoiler, respect: item.respect, respected: item.respected, replies: item.replies,
    created_at: item.at, on_the_night: item.on_the_night, is_mine: false, followed: false,
  };
}

/* ── 8a Discover: süzgeçler rayda, sayılarıyla (§23.1 — çekmece yok) ──────── */

/* Süzgeç durumu adreste yaşar (paylaşılabilir, ray ile duvar aynı kaynağı
   okur). Varsayılanlar adrese yazılmaz. */
export const DISCOVER_SORTS = [
  { key: "hottest", label: "Hottest" },
  { key: "soonest", label: "Soonest" },
  { key: "reviewed", label: "Most reviewed" },
];

export function discoverFilters(params) {
  const get = (k) => (params && typeof params.get === "function" ? params.get(k) : params?.[k]) || "";
  const heat = Number(get("heat"));
  const sort = get("sort");
  return {
    sport: get("sport") || "All",
    status: get("status") || "All",
    competition: get("comp") || "All",
    season: get("season") || "All",
    minHeat: Number.isFinite(heat) && heat > 0 ? Math.min(5, heat) : null,
    sort: DISCOVER_SORTS.some((s) => s.key === sort) ? sort : "hottest",
  };
}

export function discoverParams(f) {
  const out = {};
  if (f.sport && f.sport !== "All") out.sport = f.sport;
  if (f.status && f.status !== "All") out.status = f.status;
  if (f.competition && f.competition !== "All") out.comp = f.competition;
  if (f.season && f.season !== "All") out.season = f.season;
  if (f.minHeat) out.heat = String(f.minHeat);
  if (f.sort && f.sort !== "hottest") out.sort = f.sort;
  return out;
}

export function activeFilterCount(f) {
  return ["sport", "status", "competition", "season"].filter((k) => f[k] && f[k] !== "All").length + (f.minHeat ? 1 : 0);
}

/* "Rated Good or better · 3.0+" — basamak adı tabanın yuvarlanmış hâli. */
export function heatFloorLabel(value) {
  if (!value) return { name: "", color: null, text: "Any heat — unrated matches included" };
  const step = Math.max(1, Math.min(5, Math.round(value)));
  const name = ["Cold", "Flat", "Good", "Great", "Hot"][step - 1];
  return { name, color: RAMP[step - 1], text: `Rated ${name} or better · ${Number(value).toFixed(1)}+` };
}

const STATUS_LABEL = { live: "LIVE", upcoming: "UPCOMING", finished: "FINISHED" };
export function discoverEyebrow(total, f) {
  const n = Number(total) || 0;
  return [`${n.toLocaleString()} ${n === 1 ? "MATCH" : "MATCHES"}`, f.sport !== "All" ? f.sport.toUpperCase() : "",
    f.status !== "All" ? STATUS_LABEL[f.status] || f.status.toUpperCase() : "", f.competition !== "All" ? f.competition.toUpperCase() : "",
    f.minHeat ? `${Number(f.minHeat).toFixed(1)}+` : ""].filter(Boolean).join(" · ");
}

export function facetCount(facets, dim, value) {
  const hit = (facets?.[dim] || []).find((x) => x.value === value);
  return hit ? Number(hit.count) || 0 : 0;
}

/* ── 14b bildirim menüsü ─────────────────────────────────────────────────── */

/* Üç kanal, tahtadaki sırayla; boş kanal da görünür (anahtarı ya da "yok"
   notu orada). Bilinmeyen kanal SOCIAL'a düşer. */
export function notificationGroups(items = []) {
  const groups = [
    { key: "heat", label: "HEAT ALERTS", items: [] },
    { key: "social", label: "SOCIAL", items: [] },
    { key: "collections", label: "COLLECTIONS", items: [] },
  ];
  for (const item of items) (groups.find((g) => g.key === item.channel) || groups[1]).items.push(item);
  return groups;
}

/* §15: kalkan açıkken puanlamadığın maçın kulüp adları da düşer — satır
   yine doğru yüzeyi açar, yalnız adı söylemez. */
export function shieldNotification(item, hideScores) {
  if (!hideScores || item?.viewer_rated !== false || !item?.match) return item;
  return { ...item, match: "a match you haven't rated", match_short: null, shielded: true };
}

/* 14a "SET UP · 3 THINGS": bağlandın · bir şey seçtin · kalkana karar
   verdin. Tahtada kalkan açık ama üçüncü çizgi sönük — varsayılan bir karar
   değil; dokunulunca yanar. */
export function welcomeSteps({ connected = false, picks = 0, shieldDecided = false } = {}) {
  return [!!connected, Number(picks) > 0, !!shieldDecided];
}

/* ── 11b skin ve paylaşım ─────────────────────────────────────────────────── */

/* 2j/11b karosunun kart özeti (telefonun thumbCard kuralı): kalkan
   açıksa skor "—". */
export function skinThumbCard(props, competition = "") {
  const hidden = props?.spoiler;
  return {
    eyebrow: competition || "", homeColor: props?.homeColor, awayColor: props?.awayColor,
    homeAbbr: props?.homeAbbr, awayAbbr: props?.awayAbbr,
    homeScore: hidden ? "—" : props?.homeScore || "—", awayScore: hidden ? "—" : props?.awayScore || "—",
    score: hidden || !props?.homeScore ? "—" : `${props.homeScore}–${props.awayScore}`,
  };
}

export function skinCounts(list = []) {
  const earned = list.filter((s) => !s.locked && s.available).length;
  return { earned, locked: list.length - earned };
}

/* 8d boş durum: TEK eylem söyler ve durur — örnek fikstür, önerilen
   arkadaş, dolgu kart yok. Isı tabanı varsa onu düşürmeyi, yoksa süzgeçleri
   temizlemeyi önerir. */
export function discoverEmpty(f) {
  if (f?.minHeat) {
    const lower = Math.round((f.minHeat - 1.5) * 2) / 2;
    const note = `Minimum heat is at ${Number(f.minHeat).toFixed(1)} and nothing here has cleared it.`;
    // 1.0'ın altı taban değil: düşürmek yerine kaldırmayı öner (yoksa "0.5'e
    // düşür" aynı yerde döner).
    return lower >= 1
      ? { title: "No matches match those filters.", note, action: { label: `Lower it to ${lower.toFixed(1)}`, patch: { minHeat: lower } } }
      : { title: "No matches match those filters.", note, action: { label: "Remove the minimum heat", patch: { minHeat: null } } };
  }
  if (activeFilterCount(f || {}) > 0) {
    return { title: "No matches match those filters.", note: "Nothing in the catalog fits every filter at once.",
      action: { label: "Clear filters", patch: { sport: "All", status: "All", competition: "All", season: "All", minHeat: null } } };
  }
  return { title: "No matches yet.", note: "The catalog fills as fixtures are published.", action: null };
}
