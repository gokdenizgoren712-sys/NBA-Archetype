/* Çevrimdışı puan kuyruğu — ekran 3l.
 *
 * Ekran bir SÖZ veriyor: "Your rating is saved on this phone. It uploads
 * when you're back." Bu dosya o sözün kendisi. Önceden çevrimdışı bir
 * kaydetme sadece başarısız oluyordu ve puan kayboluyordu.
 *
 * Üç kural:
 *   * Yalnızca AĞ hatası kuyruğa girer (rankitApi `error.offline`). Sunucunun
 *     REDDETTİĞİ bir puan (422, 409) kuyrukta bekletilmez — tekrar denemek
 *     aynı cevabı alır; kullanıcıya söylenir ve düşer.
 *   * Maç başına TEK kayıt: aynı maçı çevrimdışıyken iki kez kaydetmek son
 *     hâlini yükler, ikisini değil.
 *   * Puanın ANI telefonda damgalanır (rated_at). Sunucu bunu dar bir
 *     pencerede kabul ediyor (rankit_rank.accepted_rated_at): gece yapılıp
 *     ertesi gün yüklenen puan o gecenin serisini ve ödülünü korur.
 */
import { rankitApi } from "./rankitApi";

const EVENT = "rankit:outbox";

function key() {
  let userId = "guest";
  try { userId = JSON.parse(localStorage.getItem("nba_arch_user"))?.id || "guest"; } catch { /* misafir */ }
  return `rankit:outbox:${userId}`;
}

export function outbox() {
  try { return JSON.parse(localStorage.getItem(key())) || []; } catch { return []; }
}

function save(items) {
  try { localStorage.setItem(key(), JSON.stringify(items)); } catch { /* depolama dolu: bu oturumda bellekte kalmaz, soylenir */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: items.length }));
}

export function queueRating({ diary, matchId, potmId, respectIds }) {
  const items = outbox().filter((item) => item.matchId !== matchId);
  items.push({
    matchId, potmId: potmId || null, respectIds: respectIds || [],
    diary: { ...diary, rated_at: new Date().toISOString() },
    queuedAt: Date.now(),
  });
  save(items);
  return items.length;
}

let flushing = null;

/* Sırayla yükler. İlk AĞ hatasında durur (hâlâ çevrimdışıyız); reddedilen
   kaydı düşürür ve sayar. Aynı anda iki flush çalışmaz. */
export function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0, rejected = 0;
    for (const item of outbox()) {
      try {
        await rankitApi.log(item.diary);
        await Promise.all([
          item.potmId ? rankitApi.potm(item.matchId, item.potmId) : Promise.resolve(),
          rankitApi.respect(item.matchId, item.respectIds || []),
        ]);
        sent += 1;
      } catch (error) {
        if (error?.offline) break;
        rejected += 1;
      }
      save(outbox().filter((x) => x.matchId !== item.matchId));
    }
    return { sent, rejected, left: outbox().length };
  })().finally(() => { flushing = null; });
  return flushing;
}

export function onOutboxChange(listener) {
  const handler = (event) => listener(event.detail ?? outbox().length);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
