// Ağ yanıtı kaybolsa bile aynı yanıtı tekrar denemek ikinci satır açmamalı.
export function createReplyAttempts(makeId = () => globalThis.crypto.randomUUID().replaceAll("-", "")) {
  const pending = new Map();
  const key = (entryId, text, target) => JSON.stringify([entryId, text.trim(), target ?? null]);
  return {
    forSend(entryId, text, target = null) {
      const attempt = key(entryId, text, target);
      if (!pending.has(attempt)) pending.set(attempt, makeId());
      return pending.get(attempt);
    },
    confirmed(entryId, text, target = null) {
      pending.delete(key(entryId, text, target));
    },
  };
}
