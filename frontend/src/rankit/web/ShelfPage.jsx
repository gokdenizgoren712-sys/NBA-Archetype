/* 7f — raf, gerçek bir duvar olarak (BUILD §22.1).
 *
 * "Seven across at 1440, --crest: 34, compact, 174px tall. A hundred cards at
 * once. On a phone the shelf is a promise; here it is the artifact." Ray yok
 * (tahtada yok) — yedi sütun ancak böyle sığar. Sıralar görünür, açılır
 * liste değil. Veri `GET /shelf`: her kayıt bir kart (yeniden izleme ayrı
 * kart), 100'erlik sayfa, `counts` üst satırı besler.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rankitApi } from "../rankitApi";
import SharedMatchCard from "../redesign/MatchCard";
import { PageHead, SortBar } from "./PageParts";
import { ShelfSkeleton } from "./Skeletons";
import { shelfCardProps, shelfGroups } from "./pagesView";

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "rating", label: "Highest rated" },
  { key: "classics", label: "Classics only" },
  { key: "competition", label: "By competition", divider: true },
];
const PAGE = 100;

export default function ShelfPage({ memberId = null, user, isLoggedIn, hideScores, onOpenMatch }) {
  const own = memberId == null || Number(memberId) === Number(user?.id);
  const [sort, setSort] = useState("newest");
  const [state, setState] = useState({ key: null, cards: [], next: null, counts: null, error: "" });
  const [owner, setOwner] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${memberId || "me"}:${sort}`;

  useEffect(() => {
    if (own && !isLoggedIn) return undefined;
    let alive = true;
    rankitApi.shelf({ memberId: own ? null : memberId, sort, limit: PAGE })
      .then((d) => alive && setState({ key, cards: d.cards || [], next: d.next_offset, counts: d.counts, error: "" }))
      .catch((e) => alive && setState({ key, cards: [], next: null, counts: null, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [key, own, isLoggedIn, memberId, sort]);

  useEffect(() => {
    if (own) return undefined;
    let alive = true;
    rankitApi.member(memberId).then((m) => alive && setOwner(m?.member || m?.user || m)).catch(() => {});
    return () => { alive = false; };
  }, [own, memberId]);

  const loadMore = async () => {
    if (loadingMore || state.next == null) return;
    setLoadingMore(true);
    try {
      const d = await rankitApi.shelf({ memberId: own ? null : memberId, sort, limit: PAGE, offset: state.next });
      setState((s) => ({ ...s, cards: [...s.cards, ...(d.cards || [])], next: d.next_offset }));
    } catch { /* düğme kalır, tekrar denenebilir */ }
    finally { setLoadingMore(false); }
  };

  const username = own ? user?.username : owner?.username;
  const loading = state.key !== key && !(own && !isLoggedIn);
  const counts = state.key === key ? state.counts : null;
  const eyebrow = [username ? `@${String(username).toUpperCase()}` : null,
    counts ? `${counts.cards.toLocaleString()} ${counts.cards === 1 ? "CARD" : "CARDS"}` : null,
    counts ? `${counts.classic_cards.toLocaleString()} ${counts.classic_cards === 1 ? "CLASSIC" : "CLASSICS"}` : null]
    .filter(Boolean).join(" · ");

  if (own && !isLoggedIn) {
    return (
      <div className="riw-page">
        <PageHead eyebrow="THE SHELF" title="Your shelf" />
        <div className="riw-page-empty">
          <strong>Your shelf follows your account</strong>
          <p>Every match you log becomes a card here. <Link to="/login?next=/rankit/shelf">Sign in</Link> to see yours.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="riw-page riw-shelf">
      <PageHead eyebrow={eyebrow || "THE SHELF"} title={own ? "Your shelf" : username ? `@${username}'s shelf` : "Shelf"}>
        <SortBar label="Sort the shelf" value={sort} options={SORTS} onChange={setSort} />
      </PageHead>
      {/* §3.1 başkasının rafında: boş alt satırın nedeni söylenir. */}
      {!own && <p className="riw-page-fine">Their ratings and Classics stay covered on matches you haven't rated.</p>}

      {state.error && state.key === key && <p className="riw-note riw-page-pad" role="alert">{state.error}</p>}

      {loading ? (
        <div className="riw-shelf-grid" aria-busy="true" aria-label="Loading the shelf">
          <ShelfSkeleton count={14} />
        </div>
      ) : state.cards.length ? (
        <>
          {shelfGroups(state.cards, sort).map((group) => (
            <section key={group.title || "all"} className="riw-shelf-group" aria-label={group.title || "Cards"}>
              {group.title && <h2 className="riw-shelf-title">{group.title}<small>{group.cards.length}</small></h2>}
              <div className="riw-shelf-grid">
                {group.cards.map((card) => {
                  const { aria, ...props } = shelfCardProps(card, { own, hideScores });
                  return (
                    <div key={card.entry?.id || card.id} className="riw-card-slot riw-shelf-slot" role="button" tabIndex={0}
                      aria-label={[`${card.home?.name} versus ${card.away?.name}`, aria].filter(Boolean).join(", ")}
                      onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(card.id); }}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(card.id); }
                      }}>
                      <SharedMatchCard {...props} crestSize={34} artHeight={56} cut={14} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {state.next != null && (
            <div className="riw-page-more">
              <button type="button" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? "Loading…" : "Show the next hundred"}
              </button>
            </div>
          )}
        </>
      ) : !state.error && (
        <div className="riw-page-empty">
          <strong>{sort === "classics" ? "No Classics on this shelf yet" : "Nothing on this shelf yet"}</strong>
          <p>{own ? "Rate a match — every entry becomes a card here." : "Cards appear here as they log matches you can see."}</p>
        </div>
      )}
    </div>
  );
}
