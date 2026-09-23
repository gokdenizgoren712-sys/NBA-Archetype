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
