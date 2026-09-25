/* Ekran 2c — Discover'daki The Hunt özeti.
 *
 * Tahta (`RankIt Redesign.dc.html#2c`): büyük "38%", başlık "The Hunt",
 * altında "4 collections · two are one night from closing".
 *
 * Veri `GET /collections` → `summary` alanından geliyor; uç bu cümleyi zaten
 * biliyor (`rankit_hunt.index_summary` docstring'i birebir aynı örneği
 * yazıyor). Burada hiçbir sayı türetilmiyor, yalnız cümleye çevriliyor.
 */

import { RAMP } from "./heat.js";

const RING_OFF = "rgba(255,255,255,.08)";

/* Tahtadaki halka: ısı rampası ilerleme noktasına kadar, gerisi sönük.
   Rampa renkleri ilerlemeyle birlikte ısınıyor (tahta böyle çiziyor).
   Telefonun Hunt halkaları (2m/2n) ve web rayı (7a THE HUNT) aynı dolgu. */
export function ringFill(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
  const stops = RAMP.slice(0, Math.max(2, Math.ceil(p * RAMP.length)));
  return p > 0
    ? `conic-gradient(from -90deg,${stops.map((c, i) => `${c} ${(i / (stops.length - 1)) * p}turn`).join(",")},${RING_OFF} ${p}turn)`
    : RING_OFF;
}

// Tahta küçük sayıyı kelimeyle yazıyor ("two are one night from closing").
const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function huntPercent(summary) {
  const pct = summary?.pct;
  // Açılmamış koleksiyonlar toplama girmiyor; hiç sayılan yoksa yüzde YOK.
  // Sıfır ile "bilinmiyor" ayrı şeyler, o yüzden 0 uydurulmuyor.
  return typeof pct === "number" && Number.isFinite(pct) ? `${Math.round(pct * 100)}%` : null;
}

export function huntLine(summary) {
  const active = Number(summary?.active) || 0;
  const oneLeft = Number(summary?.one_left) || 0;
  if (!active) return null;
  const head = `${active} collection${active === 1 ? "" : "s"}`;
  if (!oneLeft) return head;
  const word = WORDS[oneLeft] || String(oneLeft);
  const tail = oneLeft === 1 ? "one is one night from closing"
                             : `${word} are one night from closing`;
  return `${head} · ${tail}`;
}

/* ── 2m satırı ve 2n cümlesi ─────────────────────────────────────────────── */

const MORE_WORDS = [...WORDS, "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/* Tahta küçük sayıları kelimeyle yazıyor ("Rate all twelve", "Five left").
   Yirmiden sonrası rakam — "thirty-eight" okunmaz, "38" okunur. */
export function numberWord(n, { capital = false } = {}) {
  const word = Number.isInteger(n) && n > 0 && n < MORE_WORDS.length ? MORE_WORDS[n] : String(n);
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

export function collectionPercent(item) {
  const total = Number(item?.total) || 0;
  if (!total) return null;
  return Math.round((Number(item.collected) || 0) / total * 100);
}

const DAY = 86400000;

/* 2m satırının son çizgisi: sıradaki maç, ya da açılış notu, ya da ödül.
   Üçü de uçtan geliyor; hiçbiri yoksa satır sessiz kalır. */
export function collectionExtra(item, nowMs = Date.now()) {
  if (!item) return null;
  if (item.status === "not_open") {
    return { kind: "note", text: item.opens_note || "Opens when the schedule is published. Nothing to collect yet." };
  }
  if (item.status === "complete") return { kind: "done", text: "Complete" };
  if (item.reward) return { kind: "reward", text: `FINISHING THIS UNLOCKS ${String(item.reward).toUpperCase()}` };
  const next = item.next;
  if (next?.home_name && next?.away_name) {
    return { kind: "next", text: `Next: ${next.home_short || next.home_name} vs ${next.away_short || next.away_name}${dayLabel(next.starts_at, nowMs) ? ` · ${dayLabel(next.starts_at, nowMs)}` : ""}` };
  }
  return null;
}

/* Bir haftanın içindeyse gün adı ("Saturday"), değilse tarih ("5 Oct"). */
export function dayLabel(startsAt, nowMs = Date.now()) {
  if (!startsAt) return "";
  const raw = String(startsAt).trim();
  const t = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  if (t - nowMs >= 0 && t - nowMs < 7 * DAY) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* 2n tepe cümlesi: "Rate all twelve this season. Five left, and one of them
   is Sunday." Yalnız uçtaki sayılardan; sıradaki maç bir haftadan uzaksa
   "one of them is ..." eklenmez (gün adı anlamını yitirir). */
export function collectionSentence(detail, nowMs = Date.now()) {
  const total = Number(detail?.total) || 0;
  const remaining = Number(detail?.remaining) || 0;
  if (!total) return detail?.opens_note || "Opens when the schedule is published. Nothing to collect yet.";
  if (!remaining) return `All ${numberWord(total)} rated. This one is complete.`;
  const lead = detail.kind === "classics_year"
    ? `Rate every Classic of ${detail.year}.`
    : `Rate all ${numberWord(total)}${detail.season ? " this season" : ""}.`;
  const next = detail.next;
  const t = next?.starts_at ? Date.parse(String(next.starts_at).replace(" ", "T") + (/Z|[+-]\d\d:?\d\d$/.test(String(next.starts_at)) ? "" : "Z")) : NaN;
  const soon = Number.isFinite(t) && t - nowMs >= 0 && t - nowMs < 7 * DAY;
  // Hic toplanmamissa "34 left" basliktaki "all 34"u tekrar eder; o durumda
  // soylenecek yeni bilgi toplanan sayi degil, henuz baslanmamis olmasi.
  const left = remaining === total ? "Nothing collected yet"
    : `${numberWord(remaining, { capital: true })} left`;
  return soon ? `${lead} ${left}, and one of them is ${dayLabel(next.starts_at, nowMs)}.` : `${lead} ${left}.`;
}

/* 2n dipnotu: planlanmamış fikstür sayısı — uydurulmaz, yalnız söylenir. */
export function unscheduledNote(n) {
  const count = Number(n) || 0;
  if (count <= 0) return null;
  return count === 1
    ? "One fixture is unscheduled. It appears here when the league confirms the date."
    : `${numberWord(count, { capital: true })} fixtures are unscheduled. They appear here when the league confirms dates.`;
}

/* "16:30" — kullanıcının saatinde. */
export function timeLabel(startsAt) {
  if (!startsAt) return "";
  const raw = String(startsAt).trim();
  const ms = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw);
  return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
}
