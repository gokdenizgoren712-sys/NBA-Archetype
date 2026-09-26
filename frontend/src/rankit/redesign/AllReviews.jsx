/* Ekran 5c — tüm incelemeler. Community sekmesindeki "N reviews ›" buraya.
 *
 * Maç sayfasındaki özetten iki farkı var ve ikisi de kasıtlı:
 *   1. TAKİP ETTİKLERİN ayrı bir bölümde, herkesin üstünde. Bir incelemeyi
 *      kimin yazdığı, kaç respect aldığından önce gelir.
 *   2. Varsayılan sıra EN ÇOK RESPECT — en yeni değil. §6.1 bunu yanıtlar
 *      için söylüyor ("Replies sort by most respected, not newest"); aynı
 *      ilke incelemenin kendisinde de geçerli.
 */
import { useEffect, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, EmptyState, EndOfList, ErrorState } from "./States";
import { useDialog } from "./useDialog";
import { reviewerFromStorage, isOwnContent } from "./reviewIdentity";
import ContentActions from "./ContentActions";
import { useBlockedAuthors } from "./blockedAuthors";

const SORTS = [
  ["respected", "Most respected"],
  ["newest", "Newest"],
  ["lowest", "Lowest"],
];

const INK_3 = "#9aa0a6";

/* "2h" — 5c zamanı böyle yazıyor, tam tarih değil. Bir inceleme akışında
   önemli olan ne kadar taze olduğu. */
function ago(iso) {
  if (!iso) return "";
  const then = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/* Respect kontrolü RankIt elması: harcanmamışken ana hat, verilince dolu.
   §6.1 — asla altın (bir akış çok respect taşır, tek Classic taşır) ve
   asla animasyonlu. */
function RespectMark({ on, size = 11 }) {
  // Yaricap SABIT DEGIL, §2.3'un formulunden turetiliyor (crest*.29 / .34).
  // Dokuman bunu acikca sart kosuyor: sabit yazilan bir yaricap kucuk
  // boyutlarda sekli daireye cevirir.
  const r = `${(size * 0.29).toFixed(1)}px ${(size * 0.29).toFixed(1)}px ${(size * 0.34).toFixed(1)}px ${(size * 0.34).toFixed(1)}px`;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, display: "inline-block",
      transform: "rotate(45deg)", borderRadius: r,
      border: `1.5px solid ${on ? "#eceded" : INK_3}`,
      background: on ? "#eceded" : "transparent",
    }} />
  );
}

function Row({ row, onOpenThread, reviewer }) {
  const [respect, setRespect] = useState(row.respect || 0);
  const [given, setGiven] = useState(!!row.respected);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  const give = async () => {
    if (busy || isOwnContent(row, reviewer)) return;
    setBusy(true);
    const before = { respect, given };
    setGiven(!given); setRespect(respect + (given ? -1 : 1));
    try {
      const r = await rankitApi.likeReview(row.id, !given);
      setGiven(r.liked); setRespect(r.likes);
    } catch { setGiven(before.given); setRespect(before.respect); }
    finally { setBusy(false); }
  };

  return (
    <article className="ri-review-row">
      <div className="ri-review-who">
        <strong>@{row.username}</strong>
        {/* §7.1'in "gecesinde puanladi" isareti — 5c'de handle'in yaninda. */}
        {row.on_the_night && <em>on the night</em>}
        <small>{ago(row.created_at)}</small>
        <ContentActions type="review" id={row.id} author={{ id: row.user_id, username: row.username }} />
      </div>
      {row.rating != null && <div className="ri-review-rating" aria-label={`${row.rating} out of 5 stars`}>★ {row.rating} / 5</div>}
      {row.review && (
        row.spoiler && !shown
          ? <button type="button" className="ri-spoiler-gate" onClick={() => setShown(true)}>
              Contains spoilers — tap to read
            </button>
          : <p>{row.review}</p>
      )}
      <div className="ri-review-acts">
        <button type="button" onClick={give} aria-pressed={given} disabled={busy || isOwnContent(row, reviewer)}
          aria-label={isOwnContent(row, reviewer) ? "Your review · respect count" : given ? "Take back your respect" : "Respect this review"}>
          <RespectMark on={given} /> {respect || ""}
        </button>
        <button type="button" onClick={() => onOpenThread?.(row.id)}>
          <MessageCircle size={13} /> {row.replies || ""}
        </button>
        <button type="button" className="ri-review-read" onClick={() => onOpenThread?.(row.id)}>Read</button>
      </div>
    </article>
  );
}

export default function AllReviews({ matchId, title, onClose, onOpenThread }) {
  const reviewer = reviewerFromStorage(localStorage);
  const isBlocked = useBlockedAuthors();
  const [sort, setSort] = useState("respected");
  // Yuklenen sirayi VERIYLE BIRLIKTE tutuyoruz: "hangi sira yukleniyor"
  // boyle turetiliyor ve efektin basinda state sifirlamak gerekmiyor
  // (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState({ sort: null, data: null });
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const tz = -new Date().getTimezoneOffset();
    rankitApi.matchReviews(matchId, sort, tz, offset)
      .then(d => {
        if (!alive) return;
        setLoaded(previous => {
          const merge = kind => [...new Map([...(offset && previous.sort === sort && previous.id === matchId ? previous.data?.[kind] || [] : []), ...(d[kind] || [])].map(row => [row.id, row])).values()];
          return { sort, id: matchId, offset, retry, data: {...d, followed:merge("followed"), everyone:merge("everyone")}, error:null };
        });
      })
      .catch(error => alive && setLoaded(previous => ({...previous, sort, id:matchId, offset, retry,
        data: previous.sort === sort && previous.id === matchId ? previous.data : null, error})));
    return () => { alive = false; };
  }, [matchId, sort, offset, retry]);

  // null => hala yukleniyor (ya da baska bir siranin sonucu duruyor)
  const shown = loaded.sort === sort && loaded.id === matchId ? loaded.data : null;
  // Bu oturumda engellenenlerin satirlari yeniden yukleme beklemeden kalkar.
  const data = shown && {
    ...shown,
    followed: shown.followed?.filter((row) => !isBlocked(row.user_id)),
    everyone: shown.everyone?.filter((row) => !isBlocked(row.user_id)),
  };
  const pending = loaded.sort !== sort || loaded.id !== matchId || loaded.offset !== offset || loaded.retry !== retry;
  const error = !pending ? loaded.error : null;

  const dialog = useDialog({ onClose, label: "All reviews" });

  return (
    <div className="ri-sheet-wrap" onClick={onClose}>
      <section {...dialog} className="ri-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ri-sheet-grab" aria-hidden="true" />
        <button className="ri-sheet-close" onClick={onClose} aria-label="Close"><X size={19} /></button>

        <div className="ri-rank-head">
          <div>
            <small>{data ? `${data.total} ${data.total === 1 ? "REVIEW" : "REVIEWS"}` : "REVIEWS"}</small>
            <h2>{title}</h2>
          </div>
        </div>

        <div className="ri-detail-tabs" role="tablist" aria-label="Sort">
          {SORTS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={sort === key}
              className={sort === key ? "active" : undefined}
              onClick={() => {setSort(key);setOffset(0);}}>{label}</button>
          ))}
        </div>

        {error && <ErrorState error={error} onRetry={()=>setRetry(value=>value+1)}/>}
        {pending && !data && <Loading label="Loading reviews"><SkeletonRows count={3} height={92}/></Loading>}

        {!!data?.followed?.length && (
          <div className="ri-quick-group">
            <small>PEOPLE YOU FOLLOW · {data.followed.length}</small>
            {data.followed.map((r) => <Row key={r.id} row={r} reviewer={reviewer} onOpenThread={onOpenThread} />)}
          </div>
        )}

        {!!data?.everyone?.length && (
          <div className="ri-quick-group">
            <small>{data.followed?.length ? "EVERYONE ELSE" : "ALL REVIEWS"}</small>
            {data.everyone.map((r) => <Row key={r.id} row={r} reviewer={reviewer} onOpenThread={onOpenThread} />)}
          </div>
        )}
        {/* Listenin sonu yalnizca HEPSI geldiyse: uc bir ust sinirla kesiyor
            ve "total" ayri donuyor. Kesilmis listede "that's all" yalan olur. */}
        {data?.next_offset != null && <button className="ri-load-more" disabled={pending} onClick={()=>setOffset(data.next_offset)}>{pending ? "Loading…" : "Load more reviews"}</button>}
        {!pending && !error && data?.next_offset === null && !!data?.total && (data.followed?.length || 0) + (data.everyone?.length || 0) >= data.total && (
          <EndOfList count={data.total} />
        )}

        {!pending && !error && data && !data.total && (
          <EmptyState title="No reviews yet" body="Write the first one and it shows up here for everyone."
            action="Write the first one" onAction={onClose} />
        )}
      </section>
    </div>
  );
}
