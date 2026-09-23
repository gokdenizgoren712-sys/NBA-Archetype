/* Gorsel kaynak: RankIt Redesign.dc.html #2p (3476+).
   Profil kokunun yerine gecmez: §4.9.2 uyarinca oradan acilan detaydir.
   Mock sayilar/renkli gece bloklari veri sayilmaz; eksik alanlar — kalir. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { rankitApi } from '../rankitApi';
import { ratingAccount } from '../rankitOutbox';
import { useResource } from './useResource';
import { useDialog } from './useDialog';
import { useBackClose } from './backStack';
import { ErrorState, Loading, SkeletonRows } from './States';

const COUNTS = [
  ['rate_same_day', 'Rated on the night'],
  ['respect', 'Rewarded respects'],
  ['companion', 'Matches in Companion'],
  ['season', 'Seasons end to end'],
];
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';

export function StandingEntry() {
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useResource(`rank:${ratingAccount()}`, () => rankitApi.rank());
  return <>
    {error && <ErrorState error={error} onRetry={reload} title="Could not refresh your standing"/>}
    {loading && !data && <Loading label="Loading your standing"><SkeletonRows count={1} height={64}/></Loading>}
    {data?.rank && <button type="button" className="ri-standing-entry" onClick={() => setOpen(true)} aria-label="Open Standing">
      <span><small>YOUR STANDING{data._cachedAt ? ' · LAST SYNC' : ''}</small><strong>{data.rank.name}</strong></span>
      <span>{number(data.rank.points)} pts</span><ChevronRight size={18}/>
    </button>}
    {open && <Standing onClose={() => setOpen(false)}/>}
  </>;
}

export default function Standing({ onClose }) {
  const { data, error, loading, reload } = useResource(`standing:${ratingAccount()}`, () => rankitApi.rank());
  const dialog = useDialog({ onClose, label: 'Standing' });
  useBackClose(onClose);
  const rank = data?.rank;
  const progress = typeof rank?.progress === 'number' && Number.isFinite(rank.progress)
    ? Math.max(0, Math.min(1, rank.progress)) : null;
  const screen = <section {...dialog} className="ri-standing-screen">
    <header className="ri-standing-head"><button type="button" onClick={onClose} aria-label="Back to Profile"><ChevronLeft size={20}/></button><h1>Standing</h1></header>
    <div className="ri-standing-body">
      {error && <ErrorState error={error} onRetry={reload}/>}
      {loading && !data && <Loading label="Loading your standing"><SkeletonRows count={3} height={120}/></Loading>}
      {data?._cachedAt && <p className="ri-standing-cache" role="status">Showing your last synced standing.</p>}
      {rank && <>
        <section className="ri-standing-card" aria-label="Your rank">
          <div className="ri-standing-identity">
            <div className="ri-standing-emblem" aria-hidden="true"><i><span>{String(rank.tier).padStart(2, '0')}</span></i></div>
            <div><small>RANK {rank.tier} OF 7</small><h2>{rank.name}</h2>
              <p>{data.username ? `@${data.username} · ` : ''}{number(data.matches)} matches logged</p></div>
          </div>
          <div className="ri-standing-progress-label"><span>{number(rank.points)} POINTS</span><span>{rank.next_name ? `${rank.next_name} AT ${number(rank.next_at)}` : 'HIGHEST RANK'}</span></div>
          {progress !== null && <div className="ri-standing-progress" role="progressbar" aria-label="Progress through your current rank" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={`${Math.round(progress * 100)}% through ${rank.name}`}><i style={{ width: `${progress * 100}%` }}/></div>}
        </section>
        <h2 className="ri-standing-eyebrow">WHAT COUNTS</h2>
        <div className="ri-standing-counts">{COUNTS.map(([kind, label]) => {
          const row = data.breakdown?.find(item => item.kind === kind);
          return <div key={kind}><strong>{number(row?.count)}</strong><p>{label}<small>{row ? `${number(row.points)} points earned` : 'Breakdown not available yet'}</small></p></div>;
        })}</div>
        <section className="ri-standing-streak" aria-label="Your streak">
          <div><h2>STREAK · {number(data.streak?.current)} NIGHTS</h2><span>Best {number(data.streak?.best)}</span></div>
          <p>One rating on the night keeps it alive. Rating late still counts as a log — just not to the streak.</p>
          {data.streak?.rest_nights_enforced === false && <p>Follow competitions to account for rest nights.</p>}
        </section>
      </>}
    </div>
  </section>;
  const host = document.querySelector('.rankit-app');
  return host ? createPortal(screen, host) : screen;
}
