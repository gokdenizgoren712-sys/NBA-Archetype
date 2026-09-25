/* 8b — profil: telefonun iki ekranı (profil + kişiler) masaüstünde tek
 * sayfa değil ama tek tık — "184 following · 96 followers" 10a'ya gider.
 *
 *   sol    340: avatar 60 · @kullanıcı · joined · N following · followers
 *          (sayısız, §13.2) ·
 *          kademe kartı (RANK 4 OF 7, sonraki kademeye çubuk) · watched /
 *          classics / streak · Lists · The Hunt · Your reviews
 *   sağ    Shelf (son beş kart, "Open the full wall ›" → 7f) · RECENT ENTRIES
 *   dişli  ayarlar sağ sütunda (Aşama 15'in Settings sekmesi, aynen)
 *
 * Görünüm adreste: `?view=reviews|settings`. Veri `/profile`, `/shelf`,
 * `/diary`; kademe ve av kabuktan (useShellData).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { hidesScore } from "../rankitPrefs";
import SharedMatchCard from "../redesign/MatchCard";
import { personalReviews, joinedLabel } from "../redesign/profileState";
import { initials } from "../redesign/feedItems";
import { Stars } from "./cards";
import SettingsPanel from "./SettingsPanel";
import { ShelfSkeleton } from "./Skeletons";
import { rankCard, shelfCardProps, shortDate } from "./pagesView";

function EntryRow({ entry, hideScores, onOpenMatch }) {
  const hidden = hidesScore(hideScores, { status: entry.status, my_rating: entry.rating });
  const score = entry.home_score != null && entry.away_score != null && !hidden ? ` ${entry.home_score}–${entry.away_score} ` : " vs ";
  return (
    <article className="riw-entry">
      <header>
        {Number(entry.rating) > 0 && <Stars value={entry.rating} compact />}
        {!!entry.classic && <i className="riw-review-classic" role="img" aria-label="Your Classic" />}
        <button type="button" onClick={() => onOpenMatch(entry.match_id)}>{entry.home_short || entry.home_name}{score}{entry.away_short || entry.away_name}</button>
        <time dateTime={entry.watched_date}>{shortDate(entry.watched_date)}</time>
      </header>
      {!!entry.review && (entry.spoiler && hidden
        ? <p className="riw-entry-hidden">Your review is behind the spoiler shield — reveal the match to read it.</p>
        : <p>{entry.review}</p>)}
    </article>
  );
}

export default function ProfilePage({ rank, hunt, view, onView, hideScores, onToggleScores, onOpenMatch }) {
  const { isLoggedIn, user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [shelf, setShelf] = useState(null);
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.profile().then((d) => alive && setProfile(d)).catch(() => alive && setProfile({}));
    rankitApi.shelf({ sort: "newest", limit: 5 }).then((d) => alive && setShelf(d)).catch(() => alive && setShelf({ cards: [] }));
    rankitApi.diary().then((d) => alive && setEntries(d.entries || [])).catch(() => alive && setEntries([]));
    return () => { alive = false; };
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="riw-page">
        <header className="riw-page-head"><div><p className="riw-page-eyebrow">PROFILE</p><h1>Not signed in</h1></div></header>
        <div className="riw-page-empty">
          <strong>RankIt uses your Primary Arch account</strong>
          <p>The same one that owns your squads and lineups. <Link to="/login?next=/rankit/profile">Sign in</Link> to keep a diary.</p>
        </div>
        <div className="riw-page-pad"><SettingsPanel hideScores={hideScores} onToggleScores={onToggleScores} /></div>
      </div>
    );
  }

  const stats = profile?.stats || {};
  const card = rankCard(rank);
  const reviews = personalReviews(entries || []);
  const active = hunt?.summary?.active ?? (hunt?.collections || []).filter((c) => c.status === "active").length;
  const username = profile?.user?.username || user?.username || "";
  const joined = joinedLabel(profile?.user?.created_at);
  const counts = shelf?.counts;

  return (
    <div className="riw-page riw-profile">
      <aside className="riw-profile-side" aria-label="You">
        <div className="riw-profile-id">
          <span className="riw-profile-avatar" aria-hidden="true">{initials(username)}</span>
          <div>
            <h1>@{username}</h1>
            {joined && <p>joined {joined}</p>}
            <p className="riw-profile-links">
              <Link to="/rankit/people?tab=following"><b>{(stats.following_people ?? 0).toLocaleString()}</b> following</Link>
              {/* §13.2 "No follower counts. Anywhere." — tahta "96 followers" çiziyor;
                  BUILD tahtanın üstünde: liste erişimi var, sayı yok. */}
              <Link to="/rankit/people?tab=followers">followers</Link>
            </p>
          </div>
          <button type="button" className="riw-profile-gear" aria-label="Settings" aria-pressed={view === "settings"}
            onClick={() => onView(view === "settings" ? null : "settings")}><Settings size={17} /></button>
        </div>

        {card ? (
          <section className="riw-profile-rank" aria-label={`${card.label}: ${card.name}`}>
            <div className="riw-profile-rank-top">
              <span className="riw-profile-emblem" aria-hidden="true"><b>{card.emblem}</b></span>
              <div><small>{card.label}</small><strong>{card.name}</strong></div>
            </div>
            <div className="riw-profile-rank-bar">
              <p><span>{card.points.toLocaleString()}</span><span>{card.next}</span></p>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.pct} aria-label="Progress to the next rank">
                <i style={{ width: `${card.pct}%` }} />
              </div>
            </div>
          </section>
        ) : <div className="riw-profile-rank is-skeleton" aria-hidden="true" />}

        <dl className="riw-profile-stats">
          <div><dd>{(stats.matches ?? 0).toLocaleString()}</dd><dt>watched</dt></div>
          <div><dd className="is-gold">{(stats.classics ?? 0).toLocaleString()}</dd><dt>classics</dt></div>
          <div><dd className="is-hot">{(rank?.streak?.current ?? 0).toLocaleString()}</dd><dt>streak</dt></div>
        </dl>

        <nav className="riw-profile-nav" aria-label="Your collections">
          <Link to="/rankit/lists"><span>Lists</span><small>{(stats.lists ?? 0).toLocaleString()}</small><ChevronRight size={13} aria-hidden="true" /></Link>
          <Link to="/rankit/hunt"><span>The Hunt</span><small>{active} active</small><ChevronRight size={13} aria-hidden="true" /></Link>
          <button type="button" aria-pressed={view === "reviews"} onClick={() => onView(view === "reviews" ? null : "reviews")}>
            <span>Your reviews</span><small>{(stats.reviews ?? reviews.length).toLocaleString()}</small><ChevronRight size={13} aria-hidden="true" />
          </button>
        </nav>
      </aside>

      <div className="riw-profile-main">
        {view === "settings" && (
          <section aria-labelledby="riw-profile-settings">
            <div className="riw-profile-head">
              <div><p className="riw-page-eyebrow">@{username.toUpperCase()}</p><h2 id="riw-profile-settings">Settings</h2></div>
              <button type="button" className="riw-profile-back" onClick={() => onView(null)}><ChevronLeft size={14} aria-hidden="true" />Profile</button>
            </div>
            <SettingsPanel hideScores={hideScores} onToggleScores={onToggleScores} />
          </section>
        )}

        {view === "reviews" && (
          <section aria-labelledby="riw-profile-reviews">
            <div className="riw-profile-head">
              <div><p className="riw-page-eyebrow">{reviews.length.toLocaleString()} {reviews.length === 1 ? "REVIEW" : "REVIEWS"}</p><h2 id="riw-profile-reviews">Your reviews</h2></div>
              <button type="button" className="riw-profile-back" onClick={() => onView(null)}><ChevronLeft size={14} aria-hidden="true" />Profile</button>
            </div>
            {entries === null ? <div className="riw-read-skeleton" aria-busy="true" /> : reviews.length ? (
              <div className="riw-entry-list">{reviews.map((e) => <EntryRow key={e.id} entry={e} hideScores={hideScores} onOpenMatch={onOpenMatch} />)}</div>
            ) : <div className="riw-page-empty riw-profile-empty"><strong>No reviews yet</strong><p>Write a few words when you rate a match — they collect here.</p></div>}
          </section>
        )}

        {!view && (
          <>
            <section aria-labelledby="riw-profile-shelf">
              <div className="riw-profile-head">
                <div>
                  <p className="riw-page-eyebrow">{counts ? `${counts.cards.toLocaleString()} ${counts.cards === 1 ? "CARD" : "CARDS"} · ${counts.classic_cards.toLocaleString()} ${counts.classic_cards === 1 ? "CLASSIC" : "CLASSICS"}` : "THE SHELF"}</p>
                  <h2 id="riw-profile-shelf">Shelf</h2>
                </div>
                <Link to="/rankit/shelf" className="riw-profile-more">Open the full wall ›</Link>
              </div>
              {shelf === null ? (
                <div className="riw-profile-shelf" aria-busy="true"><ShelfSkeleton count={5} /></div>
              ) : shelf.cards?.length ? (
                <div className="riw-profile-shelf">
                  {shelf.cards.map((c) => {
                    const { aria, ...props } = shelfCardProps(c, { own: true, hideScores });
                    return (
                      <div key={c.entry?.id || c.id} className="riw-card-slot riw-shelf-slot" role="button" tabIndex={0}
                        aria-label={[`${c.home?.name} versus ${c.away?.name}`, aria].filter(Boolean).join(", ")}
                        onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(c.id); }}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(c.id); }
                        }}>
                        <SharedMatchCard {...props} crestSize={34} artHeight={56} cut={14} />
                      </div>
                    );
                  })}
                </div>
              ) : <div className="riw-page-empty riw-profile-empty"><strong>Nothing on the shelf yet</strong><p>Rate a match — every entry becomes a card.</p></div>}
            </section>

            <section aria-labelledby="riw-profile-recent">
              <div className="riw-profile-head is-small">
                <h2 id="riw-profile-recent" className="riw-page-eyebrow">RECENT ENTRIES</h2>
                {reviews.length > 3 && <button type="button" className="riw-profile-more is-quiet" onClick={() => onView("reviews")}>All {reviews.length.toLocaleString()} ›</button>}
              </div>
              {entries === null ? <div className="riw-read-skeleton" aria-busy="true" /> : reviews.length ? (
                <div className="riw-entry-list">{reviews.slice(0, 3).map((e) => <EntryRow key={e.id} entry={e} hideScores={hideScores} onOpenMatch={onOpenMatch} />)}</div>
              ) : <p className="riw-page-fine riw-profile-fine">Reviews you write when you rate a match show up here.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
