/* 7h — iki sütunlu okuma, maç görünürde (BUILD §22.3).
 *
 *   sol     392: maç kartı, WHAT PEOPLE SAID MOST (ilk üç etiket, sayıyla),
 *           RATING SPREAD (beş çubuk; 20 puan altında yok, §5.5)
 *   sağ     column-count 2, break-inside avoid; 13px Outfit 1.65, uzun metin
 *           kesilmez — "The phone truncates; desktop doesn't have to."
 *   sıra    Most respected · Newest · Following (görünür); takip ettiklerin
 *           yabancıların üstünde (§11.3)
 *
 * §3.1: maçı puanlamadıysan dağılım ve incelemeler bir hüküm — kapı; açmak
 * senin kararın (REVEAL ANYWAY). Veri `GET /matches/{id}/reviews`.
 */
import { useEffect, useState } from "react";
import { rankitApi } from "../rankitApi";
import { hidesScore } from "../rankitPrefs";
import { fromApiMatch } from "../matchModel";
import SharedMatchCard from "../redesign/MatchCard";
import { toMatchCardProps } from "../redesign/toMatchCardProps";
import CommunityVerdictGate from "../redesign/CommunityVerdictGate";
import { communityVerdictCovered } from "../redesign/heat";
import ReviewArticle from "./ReviewArticle";
import { PageHead, SortBar } from "./PageParts";
import { spreadBars } from "./pagesView";

const tz = () => -new Date().getTimezoneOffset();

export default function ReviewsPage({ matchId, isLoggedIn, hideScores, onOpenMatch }) {
  const [match, setMatch] = useState(null);
  const [view, setView] = useState("respected");
  const [page, setPage] = useState({ key: null, data: null, rows: [], error: "" });
  const [revealed, setRevealed] = useState(false);
  const [more, setMore] = useState(false);
  const scope = view === "following" ? "following" : "all";
  const sort = view === "newest" ? "newest" : "respected";
  const key = `${matchId}:${view}`;

  useEffect(() => {
    let alive = true;
    rankitApi.match(matchId).then((m) => alive && setMatch(m)).catch(() => {});
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => {
    let alive = true;
    rankitApi.matchReviews(matchId, sort, tz(), 0, scope)
      .then((d) => alive && setPage({ key, data: d, rows: [...(d.followed || []), ...(d.everyone || [])], error: "" }))
      .catch((e) => alive && setPage({ key, data: null, rows: [], error: String(e.message || e) }));
    return () => { alive = false; };
  }, [key, matchId, sort, scope]);

  const loadMore = async () => {
    const next = page.data?.next_offset;
    if (more || next == null) return;
    setMore(true);
    try {
      const d = await rankitApi.matchReviews(matchId, sort, tz(), next, scope);
      setPage((p) => ({ ...p, data: { ...p.data, next_offset: d.next_offset }, rows: [...p.rows, ...(d.followed || []), ...(d.everyone || [])] }));
    } catch { /* düğme kalır */ }
    finally { setMore(false); }
  };

  const data = page.key === key ? page.data : null;
  const covered = !!match && communityVerdictCovered({ ...match, finished: match.status === "finished" }, { revealed });
  const scoreHidden = !!match && hidesScore(hideScores, match) && !revealed;
  const bars = spreadBars(data?.spread);
  const total = data?.total ?? match?.review_count ?? 0;

  return (
    <div className="riw-page riw-read">
      <aside className="riw-read-side" aria-label="The match">
        {match ? (
          <div className="riw-card-slot riw-read-card" role="button" tabIndex={0}
            aria-label={`Open ${match.home?.name} versus ${match.away?.name}`}
            onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(match.id); }}
            onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(match.id); } }}>
            <SharedMatchCard {...toMatchCardProps(fromApiMatch(match), { hideScores: hideScores && !revealed, scoreSize: 42, cardWidth: 348, crestSize: 52 })}
              crestSize={52} artHeight={120} cut={22} communityRevealed={revealed} onCommunityReveal={() => setRevealed(true)} />
          </div>
        ) : <div className="riw-read-card-skeleton" aria-hidden="true" />}

        {!covered && !scoreHidden && (
          <>
            <section className="riw-read-box">
              <h2>WHAT PEOPLE SAID MOST</h2>
              {data?.top_tags?.length
                ? <ul className="riw-read-tags">{data.top_tags.map((t) => <li key={t.tag}>{t.tag}<small>{t.count}</small></li>)}</ul>
                : <p className="riw-read-fine">No tags yet.</p>}
            </section>
            <section className="riw-read-box">
              <div className="riw-read-row">
                <h2>RATING SPREAD</h2>
                <strong>{data?.community_rating != null ? Number(data.community_rating).toFixed(1) : "—"}</strong>
              </div>
              {bars ? (
                <>
                  <div className="riw-read-bars" role="img"
                    aria-label={`Rating spread: ${bars.map((b) => `${b.star} star ${b.count}`).join(", ")}`}>
                    {bars.map((b) => <i key={b.star} style={{ height: `${b.pct}%`, background: b.color }} />)}
                  </div>
                  <div className="riw-read-axis" aria-hidden="true">{bars.map((b) => <span key={b.star}>{b.star}</span>)}</div>
                </>
              ) : <p className="riw-read-fine">TOO FEW RATINGS · {(data?.rating_count ?? 0).toLocaleString()} so far</p>}
            </section>
          </>
        )}
      </aside>

      <section className="riw-read-main" aria-labelledby="riw-read-title">
        <PageHead titleId="riw-read-title" eyebrow={`${total.toLocaleString()} ${total === 1 ? "REVIEW" : "REVIEWS"}`} title="What people wrote">
          <SortBar label="Sort reviews" value={view} onChange={setView} options={[
            { key: "respected", label: "Most respected" },
            { key: "newest", label: "Newest" },
            { key: "following", label: "Following", disabled: !isLoggedIn, title: isLoggedIn ? undefined : "Sign in to see people you follow" },
          ]} />
        </PageHead>

        {covered || scoreHidden ? (
          <div className="riw-read-gate">
            <CommunityVerdictGate spoiler={scoreHidden} onReveal={() => setRevealed(true)} />
          </div>
        ) : (
          <>
            {page.error && page.key === key && <p className="riw-note riw-page-pad" role="alert">{page.error}</p>}
            {!data && !page.error && <div className="riw-read-columns" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="riw-read-skeleton" />)}</div>}
            {data && (page.rows.length ? (
              <div className="riw-read-columns">
                {page.rows.map((row) => <ReviewArticle key={row.id} row={row} isLoggedIn={isLoggedIn} variant="long" />)}
              </div>
            ) : (
              <div className="riw-page-empty">
                <strong>{view === "following" ? "Nobody you follow reviewed this one" : "No reviews yet"}</strong>
                <p>{view === "following" ? "Their words show up here first when they do." : "Rate the match and write the first."}</p>
              </div>
            ))}
            {data?.next_offset != null && (
              <div className="riw-page-more"><button type="button" onClick={loadMore} disabled={more} aria-busy={more}>{more ? "Loading…" : "More reviews"}</button></div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
