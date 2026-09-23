// 2f: yalnız maç bitince doğrulanmış sağlayıcı anları Match sekmesine taşınır.
// Canlıda aynı olaylar yalnız Companion'a aittir (BUILD §9.2).
export function finishedMatchEvents(matchStatus, companionStatus, moments) {
  if (matchStatus !== "finished" || companionStatus !== "finished" || !Array.isArray(moments)) return [];
  return moments
    .filter((moment) => moment && moment.minute != null && String(moment.minute).trim() &&
      Number.isFinite(Number(moment.minute)) && String(moment.label || "").trim())
    .map((moment) => ({ id: moment.id, minute: Number(moment.minute), label: String(moment.label).trim() }))
    .sort((a, b) => a.minute - b.minute || String(a.id ?? "").localeCompare(String(b.id ?? "")));
}

// Yeni maç ucu olayları taraf ve türüyle verir; Companion yalnız eski API
// yanıtlarında geriye dönük yedektir. Boş ama kontrol edilmiş liste, veri
// hiç sorgulanmamış boş listeden farklı bir durumu temsil eder.
export function finishedMatchEventState(match, companion) {
  if (match?.status !== "finished") return { events: [], checked: false };
  if (Array.isArray(match.events)) {
    const events = match.events
      .filter((event) => event && event.minute != null && String(event.minute).trim() &&
        Number.isFinite(Number(event.minute)) && String(event.label || "").trim())
      .map((event) => ({
        id: event.id,
        minute: Number(event.minute),
        label: String(event.label).trim(),
        kind: event.kind,
        side: event.side === "home" || event.side === "away" ? event.side : null,
      }))
      .sort((a, b) => a.minute - b.minute);
    return { events, checked: match.events_checked === true };
  }
  const events = finishedMatchEvents(match.status, companion?.status, companion?.moments);
  return { events, checked: events.length > 0 };
}
