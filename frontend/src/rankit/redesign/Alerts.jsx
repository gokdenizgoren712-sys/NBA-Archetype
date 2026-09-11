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
import { useEffect, useState } from "react";
import { Tv } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, EmptyState } from "./States";
import { inkFor, RAMP, RAMP_OFF } from "./heat";


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

function Sentence({ item }) {
  const who = <strong>@{item.actor}</strong>;
  switch (item.kind) {
    case "respect":
      return <>{who} respected your review{item.match ? ` of ${item.match}` : ""}.</>;
    case "reply":
      return <>{who} replied to you{item.match ? ` on ${item.match}` : ""}.</>;
    case "classic":
      return <>{who} stamped an Instant Classic on a match in your diary.</>;
    case "follow":
      return <>{who} started following you.</>;
    case "broadcast": {
      const [country, name] = String(item.detail || "").split(" · ");
      return <><strong>{item.match}</strong> now has a {country} broadcaster listed{name ? ` — ${name}` : ""}.</>;
    }
    case "collection":
      return <><strong>{item.list_title}</strong> is one match from closing. {item.match}.</>;
    default:
      return <>{item.match || "Something happened."}</>;
  }
}

function Alert({ item, onOpenMatch, onOpenList }) {
  const open = () => {
    if (item.kind === "collection" && item.list_id) return onOpenList?.(item.list_id);
    if (item.match_id) return onOpenMatch?.(item.match_id);
    return undefined;
  };

  // Sıcak maç uyarısı tek başına bir tip: şerit, ısı etiketi ve TEK eylem.
  if (item.kind === "hot_match") {
    const heat = inkFor(item.rating);
    return (
      <article className="ri-alert ri-alert-hot">
        <i aria-hidden="true" style={{ background: heat }} />
        <div className="ri-alert-head">
          <span className="ri-alert-dot" aria-hidden="true" style={{ background: heat }} />
          {/* §1 — sayı her zaman rengin yanında. */}
          <span style={{ color: heat }}>RUNNING HOT · {item.rating.toFixed(1)}</span>
        </div>
        <p>
          <strong>{item.match}</strong> is the highest-rated match of tonight.{" "}
          {item.reason === "watchlist" ? "It is in your watchlist" : "It is in a competition you follow"}
          {" "}— rate it before 11:00 to keep the streak.
        </p>
        <button type="button" className="ri-alert-cta" onClick={open}>Rate it now</button>
      </article>
    );
  }

  return (
    <article className={`ri-alert${item.unread ? " unread" : ""}`}>
      <button type="button" className="ri-alert-body" onClick={open} disabled={!item.match_id && !item.list_id}>
        {item.kind === "collection" ? <Ring done={item.rated} total={item.total} />
          : item.kind === "broadcast" ? <span className="ri-alert-face" aria-hidden="true"><Tv size={16} /></span>
          : <Avatar name={item.actor} />}
        <span>
          <p><Sentence item={item} /></p>
          {item.created_at && <small>{ago(item.created_at)}</small>}
        </span>
      </button>
    </article>
  );
}

export default function Alerts({ onClose, onOpenMatch, onOpenList }) {
  const [loaded, setLoaded] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    const tz = -new Date().getTimezoneOffset();
    rankitApi.notifications(tz).then(setLoaded).catch(() => setLoaded({ items: [], unread: 0 }));
  };
  useEffect(load, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="ri-alerts">
      <div className="ri-alerts-head">
        <h2>Alerts</h2>
        {/* Yalnızca kapatılacak bir şey varken. Hiçbir şeyi kapatmayan bir
            düğme sunmak kullanıcıya yalan söyler. */}
        {!!loaded?.unread && (
          <button type="button" onClick={markRead} disabled={busy}>Mark read</button>
        )}
      </div>

      <div className="ri-alerts-body">
        {!loaded && <Loading label="Loading alerts"><SkeletonRows count={3} height={76}/></Loading>}

        {groups.map((group, index) => (
          <section key={`${group.key}-${index}`}>
            <div className="ri-chip-title">{group.key}</div>
            <div className="ri-alert-stack">
              {group.items.map((item) => (
                <Alert key={item.id} item={item} onOpenMatch={onOpenMatch} onOpenList={onOpenList} />
              ))}
            </div>
          </section>
        ))}

        {loaded && !items.length && (
          <EmptyState title="Nothing new" body="Respect, replies and the night’s hottest match land here." />
        )}
      </div>
    </div>
  );
}
