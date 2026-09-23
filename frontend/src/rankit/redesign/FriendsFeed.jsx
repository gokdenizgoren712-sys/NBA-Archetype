/* Ekran 2q — Activity › Friends: "the feed as a shelf".
 *
 * Görsel kaynak `RankIt Redesign.dc.html#2q`:
 *   kart        18px yarıçap, #151618, hairline; aralarında 13px
 *   baş satır   31px avatar · @kullanıcı Rajdhani 700 12px · alt satır
 *               Outfit 12px #7f868b · sağda 11px yıldızlar
 *   kart        kompakt MatchCard, 174px, kesik 12, crest 32, skor 24
 *   yorum       Outfit 12px/1.5 #c9cccd
 *   eylemler    respect + yanıt sayısı, 44px
 *   koleksiyon  40px ısı halkası + "Finished X — 6 of 6 rated this season."
 *
 * Eskiden bu sekme Home'un "herkesin son incelemeleri" akışını düz satırlar
 * olarak gösteriyordu; 2q TAKİP ETTİKLERİNİN akışı (`GET /activity`).
 */
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { ratingAccount } from "../rankitOutbox";
import { useResource } from "./useResource";
import { EmptyState, EndOfList, ErrorState, Loading, SkeletonRows } from "./States";
import MatchCard from "./MatchCard";
import CommunityVerdictGate from "./CommunityVerdictGate";
import { DiaryStars } from "./Diary";
import { RAMP } from "./heat";
import { toMatchCardProps } from "./toMatchCardProps";
import {
  collectionLine, collectionPercent, feedCardMatch, feedSub, initials, verdictCovered,
} from "./feedItems";

/* Respect RankIt elmasıyla sayılır, kalple değil (§6.1). */
function RespectMark() {
  return <span aria-hidden="true" className="ri-fcard-respect" />;
}

function Head({ item, children }) {
  return <div className="ri-fcard-head">
    <span className="ri-fcard-avatar" aria-hidden="true">{initials(item.user?.username)}</span>
    <span className="ri-fcard-who"><strong>@{item.user?.username}</strong><small>{feedSub(item)}</small></span>
    {children}
  </div>;
}

function EntryCard({ item, hideScores, onOpen }) {
  const [revealed, setRevealed] = useState(false);
  const match = feedCardMatch(item);
  const covered = verdictCovered(item, revealed);
  const props = toMatchCardProps(match, {
    hideScores, compact: true, scoreSize: match.sport === "Basketball" ? 21 : 24, cardWidth: 315, crestSize: 32,
  });
  // Tek kapi kartin ALTINDA; kartin kendi kapisi kapali (hasVerdict:false),
  // yoksa "Reveal anyway"den sonra kart ikinci bir kapi cizerdi. Kapaliyken
  // kart da hukum tasimaz: topluluk isisi ve ONUN damgasi gizli. Aciksa kart
  // onun karti -- kendi skin'iyle.
  const card = covered
    ? { ...props, hasVerdict: false, heat: 0, heatOn: false, classic: false, ratings: "" }
    : { ...props, hasVerdict: false, classic: item.classic, ratings: "", skin: item.skin };
  const open = () => onOpen({ id: match.id });
  return <article className="ri-fcard" role="button" tabIndex={0}
    aria-label={`@${item.user?.username} on ${match.home.short} vs ${match.away.short}`}
    onClick={event => { if (!event.target.closest("button")) open(); }}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); } }}>
    <Head item={item}>{!covered && item.rating != null && <DiaryStars value={item.rating} />}</Head>
    <div className="ri-fcard-card"><MatchCard {...card} crestSize={32} cut={12} /></div>
    {item.review_withheld
      ? <div className="ri-fcard-gate"><CommunityVerdictGate spoiler actionLabel="OPEN MATCH"
          message="Contains spoilers — open the match to read this review."
          onReveal={event => { event.stopPropagation(); open(); }} /></div>
      : covered
        ? <div className="ri-fcard-gate"><CommunityVerdictGate onReveal={event => { event.stopPropagation(); setRevealed(true); }} /></div>
        : item.review && <p className="ri-fcard-review">{item.review}</p>}
    {!covered && <div className="ri-fcard-actions">
      <span aria-label={`${item.respect || 0} respect`}><RespectMark />{item.respect || 0}</span>
      <span aria-label={`${item.replies || 0} replies`}><MessageCircle size={16} aria-hidden="true" />{item.replies || 0}</span>
    </div>}
  </article>;
}

function CollectionCard({ item }) {
  const c = item.collection || {};
  const pct = collectionPercent(c);
  const { title, tail } = collectionLine(c);
  const p = (pct ?? 0) / 100;
  const ring = p > 0 ? `conic-gradient(from -90deg,${RAMP[3]} 0turn,${RAMP[4]} ${p}turn,rgba(255,255,255,.08) ${p}turn)` : "rgba(255,255,255,.08)";
  return <article className="ri-fcard is-collection">
    <Head item={item} />
    <div className="ri-fcard-closed">
      <span className="ri-fcard-ring" aria-hidden="true"><i style={{ background: ring }} /><i /><b>{pct ?? "—"}</b></span>
      <p>Finished <strong>{title}</strong> {tail}</p>
    </div>
  </article>;
}

export default function FriendsFeed({ hideScores, onOpen, onFind }) {
  const key = `activity:${ratingAccount()}`;
  const { data, error, loading, reload } = useResource(key, () => rankitApi.activity());
  const [more, setMore] = useState({ key: null, items: [], hasMore: null, busy: false, failed: false });
  const extra = more.key === key ? more : { items: [], hasMore: null, busy: false, failed: false };
  const items = [...(data?.items || []), ...extra.items];
  const hasMore = extra.hasMore ?? !!data?.has_more;
  const loadMore = async () => {
    setMore(v => ({ ...(v.key === key ? v : { items: [], hasMore: null }), key, busy: true, failed: false }));
    try {
      const page = await rankitApi.activity({ offset: items.length });
      setMore(v => ({ key, items: [...(v.key === key ? v.items : []), ...(page.items || [])], hasMore: !!page.has_more, busy: false, failed: false }));
    } catch {
      setMore(v => ({ ...v, key, busy: false, failed: true }));
    }
  };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Loading label="Loading your friends' activity"><SkeletonRows count={2} height={300} gap={13} radius={18} /></Loading>;
  if (!items.length) return <EmptyState title="No activity yet"
    body="Ratings and reviews from people you follow land here. RankIt won't suggest anyone — search for someone you know."
    action="Find people" onAction={onFind} />;
  return <div className="ri-ffeed">
    {items.map(item => item.kind === "collection"
      ? <CollectionCard key={item.id} item={item} />
      : <EntryCard key={item.id} item={item} hideScores={hideScores} onOpen={onOpen} />)}
    {hasMore
      ? <button type="button" className="ri-load-more" disabled={extra.busy} aria-busy={extra.busy} onClick={loadMore}>
          {extra.busy ? "Loading…" : extra.failed ? "Could not load more. Try again" : "Load more"}</button>
      : <EndOfList count={items.length} />}
  </div>;
}
