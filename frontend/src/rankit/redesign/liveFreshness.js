/* API'nin events_polled_at damgası SQLite UTC metni de olabilir.
   45 saniyelik canlı yoklamanın dördü kaçırılınca (3 dk) gecikmeyi söyle. */
export function liveFreshness(match, nowMs = Date.now()) {
  if (match?.status !== "live") return "not-live";
  const raw = match?.live_updated_at;
  if (typeof raw !== "string" || !raw.trim()) return "unknown";
  const stamp = raw.trim();
  const utc = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp)
    ? `${stamp.replace(" ", "T")}Z` : stamp;
  const updated = Date.parse(utc);
  if (!Number.isFinite(updated)) return "unknown";
  return nowMs - updated > 3 * 60 * 1000 ? "stale" : "fresh";
}
