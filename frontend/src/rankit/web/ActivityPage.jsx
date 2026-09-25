/* 11d — etkinlik: takip ettiklerinin akışı solda, kendi kaydın sağda
 * ("Desktop shows both, so your own record sits beside everyone else's").
 *
 *   sol    Activity · Everyone you follow / Mutuals only (görünür sıra) ·
 *          girdi: 186'lık kompakt kart + @kişi, yıldız, zaman, yorum, respect
 *          / yanıtlar (ReviewArticle, aynı iplik); koleksiyon kapatma: halka
 *          + "Finished X — 6 of 6 rated this season."
 *   sağ    340: YOUR DIARY · LAST 28 NIGHTS (boy = senin yıldızın, renk =
 *          topluluk ısısı) · TONIGHT (canlı maçlar, Join) · WATCHLIST
 *          (Aşama 15'in Watchlist sekmesi buraya taşındı — kaybolmasın)
 *
 * §3.1: maçı puanlamadıysan arkadaşın yıldızı ve yorumu kapalı; spoiler
 * işaretli yorum maçı açmadan okunmaz. Veri `/activity`, `/diary`,
 * `/catalog?status=live`, `/watchlist`.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import SharedMatchCard, { Shield } from "../redesign/MatchCard";
import { toMatchCardProps } from "../redesign/toMatchCardProps";
import CommunityVerdictGate from "../redesign/CommunityVerdictGate";
import { collectionLine, collectionPercent, feedAgo, feedCardMatch, verdictCovered } from "../redesign/feedItems";
import { ringFill } from "../redesign/huntSummary";
import ReviewArticle from "./ReviewArticle";
import { PageHead, SortBar } from "./PageParts";
import { diaryNights, feedReviewRow, shortDate } from "./pagesView";

function EntryItem({ item, isLoggedIn, hideScores, onOpenMatch, onOpenMember }) {
  const [revealed, setRevealed] = useState(false);
  const match = feedCardMatch(item);
  const covered = verdictCovered(item, revealed);
  const card = toMatchCardProps(match, { hideScores, compact: true, scoreSize: match.sport === "Basketball" ? 15 : 19, cardWidth: 186, crestSize: 30 });
  return (
    <article className="riw-activity-item">
      <div className="riw-card-slot riw-shelf-slot riw-activity-card is-community" role="button" tabIndex={0}
        aria-label={`${match.home.name} versus ${match.away.name}`}
        onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(match.id); }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(match.id); }
        }}>
        <SharedMatchCard {...card} profileShelf ratings="" crestSize={30} artHeight={42} cut={14} />
      </div>
      {item.review_withheld || covered ? (
        <div className="riw-activity-gate">
          <p className="riw-review-who">
            <button type="button" className="riw-activity-who" onClick={() => onOpenMember(item.user?.id)}>@{item.user?.username}</button>
            <small>{feedAgo(item.at)}</small>
          </p>
          {item.review_withheld
            ? <CommunityVerdictGate spoiler actionLabel="OPEN MATCH" message="Contains spoilers — open the match to read this review."
                onReveal={() => onOpenMatch(match.id)} />
            : <CommunityVerdictGate onReveal={() => setRevealed(true)} />}
        </div>
      ) : (
        <ReviewArticle row={feedReviewRow(item)} isLoggedIn={isLoggedIn} variant="long" />
      )}
    </article>
  );
}

function CollectionItem({ item, onOpenMember }) {
  const { title, tail } = collectionLine(item.collection);
  const pct = collectionPercent(item.collection) ?? 100;
  return (
    <article className="riw-activity-item is-collection">
      <span className="riw-hunt-ringbox is-medium" role="img" aria-label={`${pct}% collected`} style={{ "--fill": ringFill(pct) }}>
        <span aria-hidden="true"><b>{pct}</b></span>
      </span>
      <div>
        <p className="riw-review-who">
          <button type="button" className="riw-activity-who" onClick={() => onOpenMember(item.user?.id)}>@{item.user?.username}</button>
          <span>closed a collection</span>
          <small>{feedAgo(item.at)}</small>
        </p>
        <p className="riw-activity-text">Finished <strong>{title}</strong> {tail}</p>
      </div>
    </article>
  );
}

function DiaryStrip({ entries, streak }) {
  const { nights, logged } = diaryNights(entries || []);
  return (
    <section className="riw-activity-box" aria-labelledby="riw-activity-diary">
      <h2 id="riw-activity-diary" className="riw-page-eyebrow">YOUR DIARY · LAST 28 NIGHTS</h2>
      <div className="riw-diary-card">
        <p className="riw-diary-top">
          <b>{logged.toLocaleString()} <small>logged</small></b>
          <span>{streak.toLocaleString()} {streak === 1 ? "night" : "nights"}</span>
        </p>
        <div className="riw-diary-bars" role="img" aria-label={`${logged} logged in the last 28 nights, ${streak}-night streak`}>
          {nights.map((n) => <i key={n.night} title={n.label} className={n.empty ? "is-empty" : undefined}
            style={{ height: `${n.height}%`, background: n.color || undefined }} />)}
        </div>
        <p className="riw-diary-note">Height is your stars, colour is community heat.</p>
        <Link to="/rankit/shelf" className="riw-profile-more">Every card on your shelf ›</Link>
      </div>
    </section>
  );
}

function MatchRow({ match, live, onOpen }) {
  return (
    <button type="button" className={`riw-activity-row${live ? " is-live" : ""}`} onClick={() => onOpen(match.id)}>
      <Shield side={27} color={match.home?.color || "#3a3f47"} ink="#fff" abbr={(match.home?.short || "").slice(0, 3).toUpperCase()} crestUrl={match.home?.crest_url} badgeScale={0.3} />
      <span>
        <strong>{match.home?.short || match.home?.name} vs {match.away?.short || match.away?.name}</strong>
        {live ? <small className="is-live"><i aria-hidden="true" />LIVE{match.live_minute ? ` · ${match.live_minute}` : ""}</small>
          : <small>{shortDate(match.starts_at)}</small>}
      </span>
      <em>{live ? "Join" : "Open"}</em>
    </button>
  );
}

export default function ActivityPage({ scope, onScope, streak = 0, refreshToken, hideScores, onOpenMatch, onOpenEntity }) {
  const { isLoggedIn } = useAuth();
  const [feed, setFeed] = useState({ key: null, items: [], more: false, error: "" });
  const [entries, setEntries] = useState(null);
  const [live, setLive] = useState(null);
  const [watch, setWatch] = useState(null);
  const key = `${scope}:${refreshToken}`;

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.activity({ scope, limit: 30 })
      .then((d) => alive && setFeed({ key, items: d.items || [], more: !!d.has_more, error: "" }))
      .catch((e) => alive && setFeed({ key, items: [], more: false, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [isLoggedIn, scope, key]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.diary().then((d) => alive && setEntries(d.entries || [])).catch(() => alive && setEntries([]));
    rankitApi.watchlist().then((d) => alive && setWatch(d.matches || [])).catch(() => alive && setWatch([]));
    return () => { alive = false; };
  }, [isLoggedIn, refreshToken]);

  useEffect(() => {
    let alive = true;
    rankitApi.catalog({ status: "live", limit: 3 }).then((d) => alive && setLive(d.matches || [])).catch(() => alive && setLive([]));
    return () => { alive = false; };
  }, []);

  const loadMore = async () => {
    try {
      const d = await rankitApi.activity({ scope, offset: feed.items.length, limit: 30 });
      setFeed((f) => ({ ...f, items: [...f.items, ...(d.items || [])], more: !!d.has_more }));
    } catch { /* düğme kalır */ }
  };

  if (!isLoggedIn) {
    return (
      <div className="riw-page">
        <PageHead title="Activity" />
        <div className="riw-page-empty">
          <strong>Sign in to follow people's nights</strong>
          <p>Activity is what the people you follow logged and wrote. <Link to="/login?next=/rankit/activity">Sign in</Link></p>
        </div>
      </div>
    );
  }

  const ready = feed.key === key;
  const openMember = (id) => onOpenEntity("member", id);

  return (
    <div className="riw-page riw-activity">
      <section className="riw-activity-main" aria-labelledby="riw-activity-title">
        <PageHead title="Activity" titleId="riw-activity-title">
          <SortBar label="Whose activity" value={scope} onChange={onScope} options={[
            { key: "following", label: "Everyone you follow" },
            { key: "mutuals", label: "Mutuals only" },
          ]} />
        </PageHead>
        <div className="riw-activity-feed">
          {feed.error && ready && <p className="riw-note" role="alert">{feed.error}</p>}
          {!ready && [0, 1, 2].map((i) => <div key={i} className="riw-read-skeleton" aria-busy="true" />)}
          {ready && !feed.error && !feed.items.length && (
            <div className="riw-page-empty riw-profile-empty">
              <strong>{scope === "mutuals" ? "No mutuals have logged anything yet" : "Nothing from the people you follow yet"}</strong>
              <p>Follow people whose taste you trust — <Link to="/rankit/people">find them by agreement</Link>.</p>
            </div>
          )}
          {ready && feed.items.map((item) => item.kind === "collection"
            ? <CollectionItem key={item.id} item={item} onOpenMember={openMember} />
            : <EntryItem key={item.id} item={item} isLoggedIn={isLoggedIn} hideScores={hideScores} onOpenMatch={onOpenMatch} onOpenMember={openMember} />)}
          {ready && feed.more && <div className="riw-page-more"><button type="button" onClick={loadMore}>More activity</button></div>}
        </div>
      </section>

      <aside className="riw-activity-side" aria-label="Your record">
        {entries === null ? <div className="riw-read-skeleton" aria-busy="true" /> : <DiaryStrip entries={entries} streak={streak} />}

        <section className="riw-activity-box" aria-labelledby="riw-activity-tonight">
          <h2 id="riw-activity-tonight" className="riw-page-eyebrow">TONIGHT</h2>
          {live === null && <div className="riw-rail-skeleton" aria-hidden="true" />}
          {live?.length ? live.map((m) => <MatchRow key={m.id} match={m} live onOpen={onOpenMatch} />)
            : live && <p className="riw-page-fine riw-profile-fine">Nothing live right now.</p>}
        </section>

        <section className="riw-activity-box" aria-labelledby="riw-activity-watch">
          <h2 id="riw-activity-watch" className="riw-page-eyebrow">WATCHLIST</h2>
          {watch === null && <div className="riw-rail-skeleton" aria-hidden="true" />}
          {watch?.length ? watch.slice(0, 5).map((m) => <MatchRow key={m.id} match={m} onOpen={onOpenMatch} />)
            : watch && <p className="riw-page-fine riw-profile-fine">Open any upcoming match and add it — it waits here until kick-off.</p>}
        </section>
      </aside>
    </div>
  );
}
