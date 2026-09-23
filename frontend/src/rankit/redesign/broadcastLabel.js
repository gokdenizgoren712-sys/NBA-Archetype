/* BUILD 2h / §7: eski serbest metin broadcaster doğrulanmış yayın değildir.
   Yalnız ülke eşleşmesinden dönen adları, kesin/alışılmış ayrımıyla göster. */
export function broadcastLabel(match) {
  const info = match?.broadcast;
  const names = Array.isArray(info?.channels) ? info.channels
    .map(channel => String(channel?.name || "").trim()).filter(Boolean) : [];
  if (!names.length) return "Broadcast details pending";
  if (info.confidence === "confirmed") return `Watch on ${names.join(" · ")}`;
  if (info.confidence === "typical") return `Typical coverage: ${names.join(" · ")}`;
  return "Broadcast details pending";
}
