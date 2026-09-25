/* Home — ekran 2a'nın hero altındaki "TONIGHT · 4 MATCHES" listesi.
 *
 * Kaynak `RankIt Redesign.dc.html#2a`: 64px satır, `#151618`, canlı maçta
 * solda 3px ısı-5 çizgisi, tek elmas, "Chelsea vs Sporting CP", altında
 * "LIVE · 73'", sağda "Join". Saf mantık; çizim RankItPrototype'ta.
 */
import { companionMinute } from "./companionView.js";
import { hasOwnRating } from "./heat.js";
import { liveFreshness } from "./liveFreshness.js";

const ORDER = { live: 0, upcoming: 1, finished: 2 };

/* RankIt günü 11:00'den 11:00'e (yerel saat). Telefon ve web ana sayfası
   AYNI pencereyi soruyor; gündüz etiketi "TODAY", gece "TONIGHT". */
export function rankitDayContext(now = new Date()) {
  const start = new Date(now);
  start.setHours(11, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const hour = now.getHours();
  const daytime = hour >= 5 && hour < 17;
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    daytime,
    eyebrow: daytime ? "YOUR DAY" : "YOUR NIGHT",
    title: daytime ? "Today on RankIt" : "Tonight on RankIt",
  };
}

/* Canlı önce (şu an olan), sonra başlama saati, en sonda bitenler. */
export function tonightRows(matches = []) {
  return [...matches].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3)
    || new Date(a.starts_at) - new Date(b.starts_at));
}

/* "TONIGHT · 4 MATCHES" — gündüz "TODAY". */
export function tonightLabel(count, daytime = false) {
  return `${daytime ? "TODAY" : "TONIGHT"} · ${count} ${count === 1 ? "MATCH" : "MATCHES"}`;
}

/* Satırın durum satırı ve sağdaki eylem. Canlı kaynak bayatsa "LIVE"
   denmez (B7) — maç kartıyla aynı kural. */
export function tonightStatus(m, nowMs = Date.now()) {
  if (m.status === "live") {
    if (liveFreshness(m, nowMs) === "stale") return { kind: "delayed", text: "DELAYED", action: "Join" };
    const minute = companionMinute(m.live_minute, m.sport);
    return { kind: "live", text: minute ? `LIVE · ${minute}` : "LIVE", action: "Join" };
  }
  if (m.status === "upcoming") return { kind: "upcoming", text: m.time ? `KICK-OFF ${m.time}` : "UPCOMING", action: null };
  if (m.status === "finished") return { kind: "finished", text: "FULL TIME", action: hasOwnRating(m) ? null : "Rate" };
  return { kind: "other", text: String(m.status || "").toUpperCase(), action: null };
}
