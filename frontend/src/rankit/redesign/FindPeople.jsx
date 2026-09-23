/* HTML #9b — people discovery. "From Primary Arch" ancak gercek bir
   tanisiklik kaynagi gelirse cizilir; ortak login tablosu o kaynak degildir. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Search } from 'lucide-react';
import { rankitApi } from '../rankitApi';
import { ratingAccount } from '../rankitOutbox';
import MemberProfile from './MemberProfile';
import RelationshipButton from './RelationshipButton';
import { overlapPercent } from './relationshipState';
import { useRelationshipRevision } from './useRelationshipRevision';
import { usePushedScreen } from './usePushedScreen';
import { useResource } from './useResource';
import { useBackClose } from './backStack';
import { EmptyState, EndOfList, ErrorState, Loading, SkeletonRows } from './States';
import { RAMP, heatSteps } from './heat';

function SuggestionCard({ person, onOpen }) {
  const pct = overlapPercent(person.overlap);
  const step = pct == null ? 0 : Math.max(1, Math.min(5, Math.floor(pct / 20)));
  return <article className="ri-find-person-card">
    <div className="ri-find-person-top">
      <button type="button" className="ri-find-person-open" aria-label={`Open @${person.username}`} onClick={() => onOpen(person.id)}>
        <span className="ri-people-avatar" aria-hidden="true">{person.username.slice(0, 2).toUpperCase()}</span>
        <span><strong>{person.username}</strong>
          {person.follows_you && !person.following && <em>Follows you</em>}
          <small>{person.matches.toLocaleString()} logged · {person.classics.toLocaleString()} classics</small>
        </span>
      </button>
      <RelationshipButton memberId={person.id} username={person.username} following={person.following} followsYou={person.follows_you}/>
    </div>
    {pct != null ? <>
      <div className="ri-find-person-overlap">
        <b style={{ color: RAMP[step - 1] }}>{pct}%</b>
        <span aria-hidden="true">{heatSteps(step).map((color, index) => <i key={index} style={{ background: color }}/>)}</span>
      </div>
      <p>Agrees on {person.overlap.agree} of {person.overlap.shared} shared matches.</p>
    </> : <p>Only {person.overlap.shared} shared match{person.overlap.shared === 1 ? '' : 'es'} — too few to compare taste.</p>}
  </article>;
}

function FindResults({ query, onOpen }) {
  const revision = useRelationshipRevision();
  const [page, setPage] = useState({ offset: 0, previous: [] });
  const result = useResource(`find-people:${ratingAccount()}:${query}:${page.offset}:${revision}`, async () => {
    const next = await rankitApi.discoverPeople({ q: query, offset: page.offset });
    return { ...next, people: [...page.previous, ...next.people].filter((row, index, all) => all.findIndex(other => other.id === row.id) === index) };
  });
  const rows = result.data?.people || page.previous;
  return <>
    <h2 className="ri-find-people-eyebrow">{query ? 'People matching your search' : 'You agree with these people'}</h2>
    {result.error && <ErrorState error={result.error} onRetry={result.reload}
      body={result.error.offline && !rows.length ? 'Reconnect to find people. Suggestions are calculated from current visible activity.' : undefined}/>}
    <div className="ri-find-person-list">{rows.map(person => <SuggestionCard key={person.id} person={person} onOpen={onOpen}/>)}</div>
    {result.loading && <Loading label={query ? 'Searching people' : 'Finding people with similar taste'}><SkeletonRows count={3} height={132}/></Loading>}
    {result.data && !rows.length && <EmptyState
      title={query ? `No people match “${query}”` : 'No taste matches yet'}
      body={query ? 'Try another name or @handle.' : 'Suggestions appear after you and another member rate at least one of the same matches.'}/>}
    {result.data?.next_offset != null && <button type="button" className="ri-people-more" disabled={result.loading}
      onClick={() => setPage({ offset: result.data.next_offset, previous: rows })}>Load more people</button>}
    {!!rows.length && result.data?.next_offset === null && <EndOfList count={rows.length}/>} 
  </>;
}

export default function FindPeople({ onClose, onOpenMatch }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState(null);
  const screenRef = usePushedScreen();
  useBackClose(onClose);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim().replace(/^@/, '')), 220);
    return () => clearTimeout(timer);
  }, [input]);
  const screen = <section ref={screenRef} className="ri-find-people" aria-label="Find people">
    <header className="ri-find-people-head">
      <button type="button" data-autofocus aria-label="Back" onClick={onClose}><ChevronLeft size={16}/></button>
      <h1>Find people</h1>
    </header>
    <div className="ri-find-people-body">
      <label className="ri-people-search"><Search size={15} aria-hidden="true"/>
        <input type="search" aria-label="Search by name or handle" placeholder="Search by name or @handle"
          maxLength={100} value={input} onChange={event => setInput(event.target.value)}/>
      </label>
      <FindResults key={`${query}`} query={query} onOpen={setMemberId}/>
    </div>
    {memberId != null && <MemberProfile key={memberId} embedded memberId={memberId} onClose={() => setMemberId(null)} onOpenMatch={onOpenMatch}/>} 
  </section>;
  const host = document.querySelector('.rankit-app');
  return host ? createPortal(screen, host) : screen;
}
