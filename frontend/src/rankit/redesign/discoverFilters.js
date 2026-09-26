/* Discover filtreleri — ekran 6c ("filter drawer, pushed over").
 *
 * Saf mantık ayrı dosyada: çekmece bileşeni yalnız çiziyor. Kaynak:
 * `RankIt Redesign.dc.html#6c`, `BUILD.md` §23 tablosu ("Filter drawer (6c)"
 * mobilde; web'de ray, 8a).
 */

export const SPORTS = ["Football", "Basketball"];
export const STAGES = ["Live", "Upcoming", "Finished"];

/* Tarih süzgeci (sahibin 2026-09-26 isteği) — telefon çekmecesi ve web rayı
   aynı listeyi kullanır. Değerler uçla aynı (`/catalog?when=`); gün
   kullanıcının yerel takvim günü, kartın TODAY / TOMORROW etiketiyle aynı. */
export const DATES = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
  ["next7", "Next 7 days"],
  ["past7", "Past 7 days"],
];
export const isDate = (value) => DATES.some(([v]) => v === value);

/* MINIMUM HEAT seçenekleri. Eşik, kartın ISI ADINI nasıl verdiğine göre:
   kart `NAMES[Math.round(heat) - 1]` kullanıyor, yani 2.5 "GOOD" yazıyor.
   "Good or better" filtresi 2.5'ten başlamazsa GOOD yazan bir kart filtreden
   düşerdi — ekranda söylenenle filtrenin yaptığı ayrışırdı. Cold eşik olarak
   anlamsız (her puanlı maç en az Cold), o yüzden yok. */
export const HEAT_LEVELS = [
  { name: "Flat", min: 1.5 },
  { name: "Good", min: 2.5 },
  { name: "Great", min: 3.5 },
  { name: "Hot", min: 4.5 },
];

export const EMPTY_FILTERS = Object.freeze({
  sport: "All", status: "All", minHeat: null, competition: "All", season: "All", when: "All",
});

/* Pill'ler "radyo + kapatılabilir": seçili olana yeniden dokunmak "All"a döner.
   6c'de "All" pill'i yok; hiçbir şey seçili değilse filtre yoktur. */
export function toggle(current, value) {
  return current === value ? "All" : value;
}

export function toggleHeat(current, min) {
  return current === min ? null : min;
}

export function heatName(min) {
  return HEAT_LEVELS.find((level) => level.min === min)?.name || null;
}

export function activeCount(f) {
  return ["sport", "status", "competition", "season", "when"].filter((k) => f[k] && f[k] !== "All").length
    + (Number.isFinite(f.minHeat) ? 1 : 0);
}

/* Katalog ucunun beklediği biçim. */
export function toCatalogQuery(f) {
  return {
    sport: f.sport || "All",
    competition: f.competition || "All",
    season: f.season || "All",
    status: f.status && f.status !== "All" ? f.status.toLowerCase() : "All",
    minHeat: Number.isFinite(f.minHeat) ? f.minHeat : null,
    when: isDate(f.when) ? f.when : "All",
  };
}

/* "Show 62 matches" — sayı UÇTAN (`total`), tahmin değil. */
export function showLabel(count, { counting = false, failed = false } = {}) {
  if (counting) return "Counting…";
  if (failed || !Number.isFinite(count)) return "Show matches";
  if (count === 0) return "No matches";
  return `Show ${count.toLocaleString("en-GB")} ${count === 1 ? "match" : "matches"}`;
}

/* Kaydırıcı (6c): 0 = "Any", 1..4 = HEAT_LEVELS. Yerel range girdisi —
   klavyeyle ok tuşlarıyla da kullanılır. */
export function heatStep(minHeat) {
  const i = HEAT_LEVELS.findIndex((level) => level.min === minHeat);
  return i < 0 ? 0 : i + 1;
}

export function heatFromStep(step) {
  const n = Number(step);
  return n >= 1 && n <= HEAT_LEVELS.length ? HEAT_LEVELS[n - 1].min : null;
}

/* Seviyenin adı kendi ısı renginde (6c: "Good" #9a3f96 = rampanın GOOD
   basamağı). Rampa sırası heat.js NAMES ile aynı: Cold, Flat, Good, Great, Hot. */
const RAMP_BY_NAME = { Flat: "#5b4fa8", Good: "#9a3f96", Great: "#d43a63", Hot: "#f5402e" };
export function heatNameColor(name) {
  return RAMP_BY_NAME[name] || null;
}
