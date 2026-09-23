// Geçmiş sayfaları başa eklerken soketten yeni gelen mesajları düşürme.
// Kimliği olan kayıtlar aynı anda hem HTTP hem WebSocket'ten gelebilir.
export function mergeThreadMessages(older, current) {
  const seen = new Set();
  return [...older, ...current].filter((message) => {
    if (message?.id == null) return true;
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

export function threadPageCursor(page) {
  return page?.has_more === true && Number.isSafeInteger(Number(page.next_before_id)) &&
    Number(page.next_before_id) > 0 ? Number(page.next_before_id) : null;
}
