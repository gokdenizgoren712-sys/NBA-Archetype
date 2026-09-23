/* HTML #9a. Iliski listesi; #9b Find People bu ekrandan ayri bir yuzey olarak acilir. */
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Search, UserRoundPlus } from 'lucide-react';
import { rankitApi } from '../rankitApi';
import { ratingAccount } from '../rankitOutbox';
import MemberProfile from './MemberProfile';
import FindPeople from './FindPeople';
import RelationshipButton from './RelationshipButton';
import { overlapPercent } from './relationshipState';
import { useRelationshipRevision } from './useRelationshipRevision';
import { useResource } from './useResource';
import { useBackClose } from './backStack';
import { usePushedScreen } from './usePushedScreen';
import { EmptyState, ErrorState, Loading, SkeletonRows, EndOfList } from './States';
import { RAMP } from './heat';

function PeopleResults({ kind, query, onMeta, onOpen }) {
  const [page, setPage] = useState({ offset: 0, previous: [] });
  const result = useResource(`people:${kind}:${query}:${page.offset}`, async () => {
    const next = await rankitApi.people({ kind, q: query, offset: page.offset });
    return { ...next, people: [...page.previous, ...next.people].filter((row, i, all) => all.findIndex(other => other.id === row.id) === i) };
  });
  useEffect(() => { if (result.data) onMeta(result.data); }, [result.data, onMeta]);
  const rows = result.data?.people || page.previous;
  return <>
    <h2 className="ri-people-eyebrow">Closest taste</h2>
    {result.error && <ErrorState error={result.error} onRetry={result.reload}
      body={result.error.offline && !rows.length ? 'Reconnect to load this list. People data is not saved for offline viewing.' : undefined}/>}
    {/* 9a tahtasindaki baslik. YALNIZ takip listesinde: §13.1 "the list you
        follow is ordered by how often you and they land on the same verdict"
        diyor; takipci listesinin sirasi icin boyle bir kural yok, o yuzden
        oraya "en yakin tat" demek yanlis olur. */}
    {kind === 'following' && !!rows.length && !result.error &&
      <div className="ri-chip-title">CLOSEST TASTE</div>}
    <div className="ri-people-rows">{rows.map(person => {
      const pct = overlapPercent(person.overlap);
      return <article className="ri-people-row" key={person.id}>
        <button type="button" className="ri-people-person" onClick={() => onOpen(person.id)} aria-label={`Open @${person.username}`}>
          <span className="ri-people-avatar" aria-hidden="true">{person.username.slice(0, 2).toUpperCase()}</span>
          <span className="ri-people-copy"><span className="ri-people-name"><strong>{person.username}</strong>
            {pct != null && <b aria-label={`${pct}% taste overlap`} style={{ color: RAMP[Math.max(0, Math.floor(pct / 20) - 1)] }}>{pct}%</b>}</span>
            <small>{person.matches.toLocaleString()} logged · {pct == null ? 'too few to compare' : `${person.classics.toLocaleString()} classics`}</small>
          </span>
        </button>
        <RelationshipButton memberId={person.id} username={person.username} following={person.following} followsYou={person.follows_you}/>
      </article>;
    })}</div>
    {result.loading && <Loading label="Loading people"><SkeletonRows count={3} height={66}/></Loading>}
    {result.data && !rows.length && <EmptyState title={query ? 'No matching people' : kind === 'following' ? 'Not following anyone yet' : 'No followers yet'}
      body={query ? 'Try another username in this list.' : 'Your connections will appear here.'}/>}
    {result.data?.next_offset != null && <button type="button" className="ri-people-more" disabled={result.loading}
      onClick={() => setPage({ offset: result.data.next_offset, previous: rows })}>Load more people</button>}
    {!!rows.length && result.data?.next_offset === null && <EndOfList count={rows.length}/>}
    <p className="ri-people-note">Sorted by how much you agree, not alphabetically. Below ten shared matches there is no percentage.</p>
  </>;
}

export default function PeopleList({ initialKind = 'following', owner, counts, onClose, onOpenMatch }) {
  const [kind, setKind] = useState(initialKind);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [meta, setMeta] = useState({ owner, counts });
  const [memberId, setMemberId] = useState(null);
  const [finding, setFinding] = useState(false);
  const revision = useRelationshipRevision();
  const account = ratingAccount();
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 220);
    return () => clearTimeout(timer);
  }, [input]);
  const screenRef = usePushedScreen();
  useBackClose(onClose);
  const select = value => { setKind(value); setInput(''); setQuery(''); };
  const screen = <section ref={screenRef} className="ri-people" aria-label="Following and followers">
    <header className="ri-people-head">
      <button type="button" data-autofocus aria-label="Back to Profile" onClick={onClose}><ChevronLeft size={16}/></button>
      <h1>@{meta.owner?.username || owner?.username || 'you'}</h1>
      <button type="button" aria-label="Find people" onClick={() => setFinding(true)}><UserRoundPlus size={18}/></button>
    </header>
    <div className="ri-people-tabs" role="tablist" aria-label="Relationships">
      {['following', 'followers'].map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-panel`}
        aria-selected={kind === value} tabIndex={kind === value ? 0 : -1} onClick={() => select(value)}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const next = event.key === 'Home' ? 'following' : event.key === 'End' ? 'followers' : kind === 'following' ? 'followers' : 'following';
          select(next); document.getElementById(`${id}-${next}`)?.focus();
        } }}>{value === 'following'
          ? `Following ${meta.counts?.following?.toLocaleString() ?? '—'}`
          /* §13.2: takipci sayisi hicbir yerde gosterilmez. */
          : 'Followers'}</button>)}
    </div>
    <div className="ri-people-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${kind}`}>
      <label className="ri-people-search"><Search size={15} aria-hidden="true"/>
        <input type="search" aria-label={kind === 'following' ? 'Search the people you follow' : 'Search your followers'}
          placeholder={kind === 'following' ? 'Search the people you follow' : 'Search your followers'} maxLength={100}
          value={input} onChange={event => setInput(event.target.value)}/></label>
      <PeopleResults key={`${account}:${kind}:${query}:${revision}`} kind={kind} query={query} onMeta={setMeta} onOpen={setMemberId}/>
    </div>
    {memberId != null && <MemberProfile key={memberId} embedded memberId={memberId} onClose={() => setMemberId(null)} onOpenMatch={onOpenMatch}/>}
    {finding && <FindPeople onClose={() => setFinding(false)} onOpenMatch={onOpenMatch}/>} 
  </section>;
  const host = document.querySelector('.rankit-app');
  return host ? createPortal(screen, host) : screen;
}
