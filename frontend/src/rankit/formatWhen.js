/* Maç saatinin mobil ve web için tek yerel gösterimi. */
const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function formatWhen(startsAt) {
  const when = new Date(startsAt);
  if (!startsAt || Number.isNaN(when.getTime())) {
    const fallback = startsAt || "";
    return { date: fallback, time: "", full: fallback };
  }
  const date = DATE.format(when);
  const time = TIME.format(when);
  return { date, time, full: `${date} · ${time}` };
}

/* Kartta saatin üstündeki gün (sahibin 2026-09-26 isteği: yalnız saat
   yazınca her maç "bugün" gibi okunuyordu). YEREL takvim günü — Discover'ın
   tarih süzgeci de aynı günü sayıyor (api `_when_window`):
     bugün "TODAY" · yarın "TOMORROW" · sonrası "SUN 28 SEP" · başka yıl "SUN 3 JAN 2027" */
const DAY_PARTS = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const DAY_MS = 86400000;
const calendarDay = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

export function kickoffDay(startsAt, nowMs = Date.now()) {
  const when = new Date(startsAt);
  if (!startsAt || Number.isNaN(when.getTime())) return "";
  const now = new Date(nowMs);
  const diff = calendarDay(when) - calendarDay(now);
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  const part = Object.fromEntries(DAY_PARTS.formatToParts(when).map((p) => [p.type, p.value]));
  // "Sept" (yeni ICU) ile "Sep" aynı ay: üç harfe sabitlenir.
  const label = [part.weekday, part.day, String(part.month || "").slice(0, 3)];
  if (when.getFullYear() !== now.getFullYear()) label.push(part.year);
  return label.join(" ").toUpperCase();
}

/* Maç sayfasının geri sayımı: dakika hassasiyeti, yukarı yuvarlanır (30 sn
   kala "1 MIN"). Bir günden fazlaysa gün + saat, bir saatten fazlaysa saat +
   dakika, değilse dakika. Başlama saati geçtiyse `due`. */
export function countdown(startsAt, nowMs = Date.now()) {
  const at = new Date(startsAt).getTime();
  if (!startsAt || Number.isNaN(at)) return null;
  if (at <= nowMs) return { due: true, segments: [] };
  const total = Math.ceil((at - nowMs) / 60000);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const seg = (value, one, many) => ({ value, unit: value === 1 ? one : many });
  const segments = days > 0 ? [seg(days, "DAY", "DAYS"), seg(hours, "HR", "HRS")]
    : hours > 0 ? [seg(hours, "HR", "HRS"), seg(minutes, "MIN", "MIN")]
    : [seg(minutes, "MIN", "MIN")];
  return { due: false, segments };
}
