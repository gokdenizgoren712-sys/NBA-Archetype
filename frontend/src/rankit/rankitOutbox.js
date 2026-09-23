/* Çevrimdışı puan kuyruğu — ekran 3l.
 *
 * Ekran bir SÖZ veriyor: "Your rating is saved on this phone. It uploads
 * when you're back." Bu dosya o sözün kendisi. Önceden çevrimdışı bir
 * kaydetme sadece başarısız oluyordu ve puan kayboluyordu.
 *
 * Kurallar:
 *   * Her kayıt ağ isteğinden ÖNCE hesap bazında kalıcılaştırılır. HTTP
 *     reddi de saklanır; otomatik tekrar döngüsüne girmez ve başarı sayılmaz.
 *   * Maç başına son revizyon tutulur; eski isteğin cevabı yeni taslağı silemez.
 *   * Diary / POTM / respect ayrı onaylanır. Kısmi kayıtta biten adım tekrarlanmaz.
 *     Sonucu belirsiz rewatch körlemesine yeniden gönderilmez.
 *   * Puanın ANI telefonda damgalanır (rated_at). Sunucu bunu dar bir
 *     pencerede kabul ediyor (rankit_rank.accepted_rated_at): gece yapılıp
 *     ertesi gün yüklenen puan o gecenin serisini ve ödülünü korur.
 */
import { rankitApi } from "./rankitApi";
import { createRatingQueue } from "./ratingQueue";

const EVENT = "rankit:outbox";

export function ratingAccount() {
  let userId = "guest";
  try { userId = JSON.parse(localStorage.getItem("nba_arch_user"))?.id || "guest"; } catch { /* misafir */ }
  return userId;
}

const queue = createRatingQueue({
  storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  account: ratingAccount, api: rankitApi,
  changed: () => window.dispatchEvent(new CustomEvent(EVENT)),
});
export function outbox() {
  try { return queue.read(); } catch { return []; }
}

export const queueRating = payload => queue.enqueue(payload);
export const flushOutbox = options => queue.flush(options);

export async function saveRating(payload) {
  // Once kalici kayit; diary/POTM/respect adimlari ayri izlenir.
  const user = ratingAccount();
  const item = queue.enqueue(payload);
  const uploaded = await queue.flush({ retryFailed: true });
  if (ratingAccount() !== user) throw new Error("The account changed. Your changes remain with the original account.");
  const remaining = queue.read().find(x => x.revision === item.revision);
  if (remaining && remaining.state !== "pending") {
    throw new Error(remaining.state === "auth-required" ? "Sign in again to upload your saved rating."
      : remaining.state === "uncertain" ? "Check your diary before retrying this rewatch. Your draft is safe."
      : "Your changes are on this phone, but could not be fully uploaded. Retry when ready.");
  }
  return { queued: !!remaining, receipt: uploaded.receipts?.find(x => x.revision === item.revision)?.receipt || null };
}

export function onOutboxChange(listener) {
  const handler = () => listener(outbox().length);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
