/* Ekran 3f — "Notifications: grouped, heat-coded".
 *
 * Eskisi bildirim DEĞİLDİ: arkadaş akışı ile izleme listesi istemcide
 * birleştirilip bildirim gibi gösteriliyordu. Kimse kimseye bir şey
 * bildirmiyordu, okundu diye bir şey yoktu, ve "yeni" olan hiçbir şey yoktu.
 *
 * Sunucu tarafındaki ayrım burada da görünüyor (bkz. api/rankit_notify.py):
 * OLAYLAR yazılır ve okundu işaretlenir; DURUMLAR türetilir ve koşul geçince
 * kendiliğinden kaybolur. O yüzden "Mark read" yalnızca olayları kapatıyor —
 * bir durumu "okudum" demek onu doğru olmaktan çıkarmaz.
 *
 * Cümleler BURADA kuruluyor, veritabanında değil. Kayıtlı bir cümle kulüp adı
 * ya da puan değişince sessizce eskir; satır yalnızca referans taşıyor.
 *
 * Tasarımın metninden üç sapma, üçü de doğruyu söyleyebilmek için:
 *   * "of the week so far" -> "tonight" — sorgu bu RankIt gününe bakıyor.
 *   * "You watched it" -> bilemeyiz. Gerçek sebep yazılıyor (izleme listesi
 *     ya da takip edilen turnuva).
 *   * "before midnight" -> "before 11:00". RankIt günü gece yarısında değil,
 *     11:00'de kapanıyor (§7.2); "midnight" demek seriyi yanlış saatte
 *     bitecekmiş gibi göstermek olurdu.
 */
import { useState } from "react";
import { Tv } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, EmptyState, ErrorState } from "./States";
import { useResource } from "./useResource";
import { RAMP, RAMP_OFF } from "./heat";
import { useDialog } from "./useDialog";


function ago(iso) {
  if (!iso) return "";
  const then = new Date(String(iso).replace(" ", "T") + (String(iso).endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function bucketOf(iso) {
  const then = new Date(String(iso).replace(" ", "T") + (String(iso).endsWith("Z") ? "" : "Z"));
  const days = (Date.now() - then.getTime()) / 86400000;
  if (!(days >= 0)) return "TONIGHT";
  return days < 1 ? "TONIGHT" : days < 7 ? "THIS WEEK" : "EARLIER";
}

/* Bir kişinin işareti: nötr disk + baş harfler.
 *
 * Tasarım burada renkli diskler çiziyor ve ilk yazdığım hâli rengi ısı
 * rampasından alıyordu. Bu §1'i çiğniyor: **ısı yalnızca veri
 * görselleştirmesidir** — bir handle'ı ısı rengiyle boyamak "@mara sıcak"
 * demek olur. Kimlik için ısı dışı bir palet de yok ve §1 yeni renk açmayı
 * yasaklıyor. Baş harfler zaten renkten daha çok şey söylüyor. */
function Avatar({ name }) {
  const initials = String(name || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
  return <span className="ri-alert-face">{initials}</span>;
}

/* Koleksiyon halkası. 3e'dekiyle aynı geometri; burada sayı yok çünkü
   satırın kendi cümlesi "11 of 12" diyor. */
function Ring({ done, total, size = 34 }) {
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <span className="ri-alert-ring" aria-hidden="true" style={{ width: size, height: size }}>
      <i style={{ background: `conic-gradient(from -90deg,${RAMP[3]} 0turn,${RAMP[4]} ${share}turn,${RAMP_OFF} ${share}turn)` }} />
    </span>
  );
}

/* Web 14b bildirim menüsü de aynı cümleleri kurar (Aşama 17) — tek kaynak. */
export function AlertSentence({ item, rated }) {
  const who = <strong>@{item.actor}</strong>;
  switch (item.kind) {
    case "respect":
      return <>{who} respected your review{item.match ? ` of ${item.match}` : ""}.</>;
    case "reply":
      return <>{who} replied to you{item.match ? ` on ${item.match}` : ""}.</>;
    case "classic":
      return rated ? <>{who} stamped an Instant Classic on a match in your diary.</>
        : <>There is new activity on a match in your diary.</>;
    case "follow":
      return <>{who} started following you.</>;
    case "broadcast": {
      const [country, name] = String(item.detail || "").split(" · ");
      return <><strong>{item.match}</strong> now has a {country} broadcaster listed{name ? ` — ${name}` : ""}.</>;
    }
    case "collection":
      return <><strong>{item.collection_title || item.list_title || "A collection"}</strong> is one match from closing. {item.match}.</>;
    default:
      return <>{item.match || "Something happened."}</>;
  }
}

function Alert({ item, ratedMatchIds, onOpenMatch, onOpenList, onOpenCollection }) {
  const open = () => {
    // collection_id bir kullanici listesi kimligi degil: kapanmaya bir mac
    // kalan koleksiyon 2n'yi acar (§24 lists vs collections, B1). Eski istemci
    // prop'u vermiyorsa kalan maca duser.
    if (item.kind === "collection" && item.collection_id && onOpenCollection) return onOpenCollection(item.collection_id);
    if (item.kind === "collection" && item.collection_id && item.match_id) return onOpenMatch?.(item.match_id);
    if (item.kind === "collection" && item.list_id) return onOpenList?.(item.list_id);
    if (item.match_id) return onOpenMatch?.(item.match_id);
    return undefined;
  };

  // Sunucu bu durumu özellikle PUANLANMAMIŞ maç için üretir. Bildirimde
  // "RUNNING HOT"/4.6 yazmak §15'i ihlal eder; yalnızca bitiş bilgisini ver.
  if (item.kind === "hot_match") {
    return (
      <article className="ri-alert ri-alert-hot">
        <div className="ri-alert-head">
          <span>READY TO RATE</span>
        </div>
        <p>
          <strong>{item.match}</strong> has finished.{" "}
          {item.reason === "watchlist" ? "It is in your watchlist" : "It is in a competition you follow"}.
          {" "}Rate it before 11:00 to keep the streak.
        </p>
        <button type="button" className="ri-alert-cta" onClick={open}>Rate it now</button>
      </article>
    );
  }

  return (
    <article className={`ri-alert${item.unread ? " unread" : ""}`}>
      <button type="button" className="ri-alert-body" onClick={open} disabled={!item.match_id && !item.list_id && !(item.collection_id && onOpenCollection)}>
        {item.kind === "collection" ? <Ring done={item.collected ?? item.rated} total={item.total} />
          : item.kind === "broadcast" ? <span className="ri-alert-face" aria-hidden="true"><Tv size={16} /></span>
          : <Avatar name={item.actor} />}
        <span>
          <p><AlertSentence item={item} rated={ratedMatchIds?.has(Number(item.match_id))} /></p>
          {item.created_at && <small>{ago(item.created_at)}</small>}
        </span>
      </button>
    </article>
  );
}

export default function Alerts({ onClose, onOpenMatch, onOpenList, onOpenCollection, ratedMatchIds }) {
  const {data:loaded,error,loading,reload:load} = useResource("alerts", () => rankitApi.notifications(-new Date().getTimezoneOffset()));
  const [busy, setBusy] = useState(false);


  const dialog = useDialog({ onClose, label: "Alerts" });

  const markRead = async () => {
    if (busy) return;
    setBusy(true);
    try { await rankitApi.markNotificationsRead(); load(); } catch { /* yok say */ }
    finally { setBusy(false); }
  };

  const items = loaded?.items || [];
  // Durumlar her zaman TONIGHT; olaylar kendi yaşlarına göre.
  const groups = [];
  for (const item of items) {
    const key = item.state ? "TONIGHT" : bucketOf(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }

  return (
    <div {...dialog} className="ri-alerts">
      <div className="ri-alerts-head">
        <h2>Alerts</h2>
        {/* Yalnızca kapatılacak bir şey varken. Hiçbir şeyi kapatmayan bir
            düğme sunmak kullanıcıya yalan söyler. */}
        {!!loaded?.unread && (
          <button type="button" onClick={markRead} disabled={busy}>Mark read</button>
        )}
      </div>

      <div className="ri-alerts-body">
        {error && <ErrorState error={error} onRetry={load}/>}
        {loading && !loaded && <Loading label="Loading alerts"><SkeletonRows count={3} height={76}/></Loading>}

        {groups.map((group, index) => (
          <section key={`${group.key}-${index}`}>
            <div className="ri-chip-title">{group.key}</div>
            <div className="ri-alert-stack">
              {group.items.map((item) => (
                <Alert key={item.id} item={item} ratedMatchIds={ratedMatchIds} onOpenMatch={onOpenMatch} onOpenList={onOpenList} onOpenCollection={onOpenCollection} />
              ))}
            </div>
          </section>
        ))}

        {/* Akis 40 olayda kesiliyor (rankit_notify.FEED_LIMIT) ve ucun
            sayfalama parametresi yok. Sessizce bitirmek "hepsi bu" demek
            olurdu; "Load more" ise tutulamayacak bir soz. Dogru olan, neyi
            gosterdigimizi soylemek. */}
        {loaded?.has_more && !error && (
          <p className="ri-alerts-truncated">Showing your {items.length} most recent alerts.</p>
        )}

        {loaded && !error && !items.length && (
          <EmptyState title="Nothing new" body="Respect, replies and the night’s hottest match land here." />
        )}
      </div>
    </div>
  );
}
