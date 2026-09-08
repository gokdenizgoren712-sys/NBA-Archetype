/* Seri hesabı — HANDOFF §7.2.
 *
 * GEÇİCİ: bu istemci tarafı hesap, arka uçta streak olmadığı için var.
 * Gerçek mekanik sunucuda yaşamalı — "dinlenme gecesi" kuralı kullanıcının
 * neyi takip ettiğini bilmeyi gerektiriyor ve o veri istemcide yok, yani
 * buradaki sayı milli aralarda §7.2'nin yasakladığı şekilde kırılır.
 */

/* Aynı geceye düşen birden fazla puanlama TEK gece sayılır (§7.2). */
export function computeStreak(diaryEntries = []) {
  const nights = new Set();
  for (const e of diaryEntries) {
    if (!e?.watched_date || !e?.starts_at) continue;
    // Oynandığı gün mü puanlanmış? Yerel tarih karşılaştırması.
    const played = new Date(e.starts_at);
    if (Number.isNaN(played.getTime())) continue;
    const playedDay = new Date(played.getTime() - played.getTimezoneOffset() * 6e4)
      .toISOString().slice(0, 10);
    if (playedDay === e.watched_date) nights.add(playedDay);
  }
  if (!nights.size) return 0;

  const sorted = [...nights].sort().reverse();
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 6e4)
    .toISOString().slice(0, 10);
  const dayBefore = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  // Seri bugünden ya da dünden başlamalı; daha eskiyse zaten kırılmış.
  let cursor = sorted[0];
  if (cursor !== localToday && cursor !== dayBefore(localToday)) return 0;
  let count = 0;
  for (const night of sorted) {
    if (night !== cursor) break;
    count += 1;
    cursor = dayBefore(cursor);
  }
  return count;
}
