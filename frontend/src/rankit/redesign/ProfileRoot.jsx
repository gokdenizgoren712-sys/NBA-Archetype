/* Gorsel ana kaynak: RankIt Redesign.dc.html #6b (14 Eylul surumu).
   9a/9b ve Hunt ayri kabul adimlari; olmayan hedefleri taklit etmiyoruz. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Settings2, UserRoundPlus } from 'lucide-react';
import { rankitApi } from '../rankitApi';
import { ratingAccount } from '../rankitOutbox';
import { readPrefs, writePrefs } from '../rankitPrefs';
import MatchCard from './MatchCard';
import Standing from './Standing';
import Settings from './Settings';
import PeopleList from './PeopleList';
import FindPeople from './FindPeople';
import { useRelationshipRevision } from './useRelationshipRevision';
import ReviewThread from './ReviewThread';
import { diaryToMatchCardProps } from './toMatchCardProps';
import { useResource } from './useResource';
import { useDialog } from './useDialog';
import { useBackClose } from './backStack';
import { EmptyState, EndOfList, ErrorState, Loading, SkeletonCard, SkeletonRows } from './States';
import { joinedLabel, personalReviews, profileCrest, profileShelf } from './profileState';

const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';

function ShelfCard({ entry, onOpen, hideScores }) {
  const ref = useRef(null);
  const [crest, setCrest] = useState(30);
  useEffect(() => {
    const observer = new ResizeObserver(([item]) => setCrest(profileCrest(item.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="ri-profile6-card" role="button" tabIndex={0}
    aria-label={`Open ${entry.home_short} vs ${entry.away_short}, your rating ${entry.rating ?? 'not set'}`}
    onClick={() => onOpen({ id: entry.match_id })}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen({ id: entry.match_id }); } }}>
    <MatchCard {...diaryToMatchCardProps(entry, { compact: true, hideScores })} profileShelf crestSize={crest}
      artHeight={42} scoreSize={entry.sport === 'Basketball' ? 15 : 19} ratings="" cut={14}/>
  </div>;
}

function ProfileCollection({ kind, lists, entries, onClose, onOpenList, onRank, onCreateList }) {
  const [thread, setThread] = useState(null);
  const title = kind === 'lists' ? 'Your lists' : 'Your reviews';
  const dialog = useDialog({ onClose, label: title });
  useBackClose(onClose);
  const rows = kind === 'lists' ? lists : personalReviews(entries);
  const screen = <section {...dialog} className="ri-standing-screen ri-profile6-collection">
    <header className="ri-standing-head"><button type="button" aria-label="Back to Profile" onClick={onClose}><ChevronLeft size={20}/></button><h1>{title}</h1></header>
    <div className="ri-standing-body">
      {kind === 'lists' && rows.map(list => <button type="button" className="ri-profile6-row" key={list.id} onClick={() => onOpenList(list.id)}>
        <span><strong>{list.title}</strong><small>{list.match_count} matches · {list.visibility}</small></span><ChevronRight size={16}/>
      </button>)}
      {kind === 'reviews' && rows.map(entry => <article className="ri-review-row" key={entry.id}>
        <h2>{entry.home_short} vs {entry.away_short}</h2>
        <small>{entry.watched_date} · {entry.visibility}{entry.rating != null ? ` · Your ${entry.rating} / 5` : ''}</small>
        <OwnReview entry={entry}/>
        <button type="button" className="ri-profile6-read" onClick={() => setThread(entry.id)}>Read thread <ChevronRight size={14}/></button>
      </article>)}
      {!rows.length && <EmptyState title={kind === 'lists' ? 'No lists yet' : 'No reviews yet'}
        body={kind === 'lists' ? 'A list is a shelf you curate.' : 'Write about a match you watched.'}
        action={kind === 'lists' ? 'Create a list' : 'Rate a match'} onAction={kind === 'lists' ? onCreateList : onRank}/>}
      {!!rows.length && <EndOfList count={rows.length}/>}
    </div>
    {thread && <ReviewThread entryId={thread} onClose={() => setThread(null)}/>}
  </section>;
  const host = document.querySelector('.rankit-app');
  return host ? createPortal(screen, host) : screen;
}

function OwnReview({ entry }) {
  const [revealed, setRevealed] = useState(false);
  return entry.spoiler && !revealed
    ? <button type="button" className="ri-spoiler-gate" onClick={() => setRevealed(true)}>Contains spoilers — tap to read</button>
    : <p>{entry.review}</p>;
}

export default function ProfileRoot({ revision = 0, accountAction, accountActionLabel, onAccountDeleted, onOpen, onShelf, onRank, onOpenList, onCreateList, onOpenHunt, hideScores, onHideScoresChange }) {
  const account = ratingAccount();
  const relationshipRevision = useRelationshipRevision();
  const profile = useResource(`profile6:${account}:${revision}:${relationshipRevision}`, () => rankitApi.profile());
  const diary = useResource(`profile6-diary:${account}:${revision}`, () => rankitApi.diary());
  const standing = useResource(`profile6-rank:${account}:${revision}`, () => rankitApi.rank());
  // 6b satiri "The Hunt · 4 active" (tahta). Sayi uctan; gelmezse satir yine
  // acilir, yalniz sag yazi bos kalir — sayi uydurulmaz.
  const hunt = useResource(`profile6-hunt:${account}:${revision}`, () => rankitApi.collections());
  const huntActive = hunt.data?.summary?.active;
  const huntRow = Number.isFinite(huntActive) ? `${huntActive} active` : '';
  const [surface, setSurface] = useState(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const stats = profile.data?.stats;
  const user = profile.data?.user;
  const rank = standing.data?.rank;
  const entries = diary.data?.entries || [];
  const shelf = profileShelf(entries);
  const joined = joinedLabel(user?.created_at);
  const reload = () => { profile.reload(); diary.reload(); standing.reload(); };
  const error = profile.error || diary.error || standing.error;
  const pending = !profile.data && profile.loading;
  return <section className="ri-profile6" aria-label="Your profile">
    <header className="ri-profile6-head"><h1>You</h1><div>
      <button type="button" onClick={() => setSurface('find')} aria-label="Find people"><UserRoundPlus size={19}/></button>
      <button type="button" onClick={() => setSurface('settings')} aria-label="Settings"><Settings2 size={19}/></button>
    </div></header>
    <div className="ri-profile6-body">
      {error && <ErrorState title="Could not refresh your profile" error={error} onRetry={reload}/>}
      {[profile, diary, standing].some(resource => resource.data?._cachedAt) && <p className="ri-profile6-note" role="status">Showing your last synced profile data.</p>}
      {pending && <Loading label="Loading your profile"><SkeletonRows count={2} height={82}/></Loading>}
      {user && <div className="ri-profile6-identity">
        <div className="ri-profile6-avatar" aria-hidden="true">{user.username?.slice(0, 2).toUpperCase()}</div>
        <div className="ri-profile6-name"><h2>{user.display_name || user.username}</h2><p>@{user.username}{joined && ` · joined ${joined}`}</p>
          <div className="ri-profile6-relations" aria-label="People you follow and your followers">
            {/* §13.2 "No follower counts. Anywhere." — takipci SAYISI yok;
                liste hala aciliyor. Takip ETTIGIN sayi populerlik degil,
                kendi listenin boyu, o yuzden duruyor. (6b/9a tahtalari
                "96 followers" ciziyor; CODE.md §2 uyarinca BUILD ustun ve
                ONARIM Asama 11'in maddesi de "follower sayilarini kaldir".) */}
            <button type="button" aria-label="Open Following" onClick={() => setSurface('following')}>{number(stats?.following_people)} <small>following</small></button>
            <button type="button" aria-label="Open Followers" onClick={() => setSurface('followers')}><small>followers</small></button>
          </div>
        </div>
      </div>}
      {standing.loading && !rank && <Loading label="Loading your standing"><SkeletonRows count={1} height={82}/></Loading>}
      {rank && <button type="button" className="ri-profile6-rank" aria-label="Open Standing" onClick={() => setSurface('standing')}>
        <span className="ri-profile6-emblem" aria-hidden="true"><i><b>{String(rank.tier).padStart(2, '0')}</b></i></span>
        <span className="ri-profile6-rank-copy"><strong>{rank.name}</strong><small>{number(rank.points)} pts{rank.next_name && Number.isFinite(rank.next_at) ? ` · ${number(Math.max(0, rank.next_at - rank.points))} to ${rank.next_name}` : ''}</small></span>
        <ChevronRight size={15}/>
      </button>}
      <dl className="ri-profile6-stats">{[['watched', stats?.matches], ['classics', stats?.classics], ['streak', standing.data?.streak?.current]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl>
      <section aria-label="Your shelf">
        <div className="ri-profile6-shelf-head"><h2>YOUR SHELF</h2><button type="button" onClick={onShelf}>All {number(stats?.matches)} <ChevronRight size={14}/></button></div>
        {diary.loading && !diary.data ? <Loading label="Loading your shelf"><div className="ri-profile6-shelf">{[0,1,2].map(i => <div className="ri-profile6-card" key={i}><SkeletonCard compact crestSize={24} scoreSize={19}/></div>)}</div></Loading>
          : shelf.length ? <div className="ri-profile6-shelf">{shelf.map(entry => <ShelfCard key={entry.id} entry={entry} onOpen={onOpen} hideScores={hideScores}/>)}</div>
          : diary.data && <EmptyState title="Nothing on your shelf yet" body="Rate a match to keep it here." action="Rate a match" onAction={onRank}/>}
      </section>
      <div className="ri-profile6-links">
        <button type="button" className="ri-profile6-row" disabled={!Array.isArray(profile.data?.owned_lists)} onClick={() => setSurface('lists')}><strong>Lists</strong><span>{number(stats?.lists)}</span><ChevronRight size={14}/></button>
        <button type="button" className="ri-profile6-row" onClick={onOpenHunt}><strong>The Hunt</strong><span>{huntRow}</span><ChevronRight size={14}/></button>
        <button type="button" className="ri-profile6-row" disabled={!diary.data} onClick={() => setSurface('reviews')}><strong>Your reviews</strong><span>{number(stats?.reviews)}</span><ChevronRight size={14}/></button>
      </div>

    </div>
    {surface === 'standing' && <Standing onClose={() => setSurface(null)}/>}
    {(surface === 'following' || surface === 'followers') && <PeopleList initialKind={surface} owner={user}
      /* followers sayisi bilerek GECIRILMIYOR (§13.2). */
      counts={{ following: stats?.following_people }} onClose={() => setSurface(null)}
      onOpenMatch={match => { setSurface(null); onOpen({ id: match.id }); }}/>} 
    {surface === 'find' && <FindPeople onClose={() => setSurface(null)}
      onOpenMatch={match => { setSurface(null); onOpen({ id: match.id }); }}/>} 
    {surface === 'settings' && <Settings prefs={{ ...prefs, hideScores }} setPref={patch => {
      setPrefs(writePrefs(patch));
      if (Object.hasOwn(patch, 'hideScores')) onHideScoresChange?.(patch.hideScores);
    }} followCount={stats?.following_sources ?? 0}
      accountAction={accountAction} accountActionLabel={accountActionLabel} onAccountDeleted={onAccountDeleted} onClose={() => setSurface(null)}/>}
    {(surface === 'lists' || surface === 'reviews') && <ProfileCollection kind={surface} lists={profile.data?.owned_lists || []} entries={entries}
      onClose={() => setSurface(null)} onOpenList={id => { setSurface(null); onOpenList(id); }} onRank={() => { setSurface(null); onRank(); }} onCreateList={() => { setSurface(null); onCreateList(); }}/>} 
  </section>;
}
