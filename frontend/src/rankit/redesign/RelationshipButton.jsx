import { useRef, useState } from 'react';
import { rankitApi } from '../rankitApi';
import { relationshipState } from './relationshipState';

export default function RelationshipButton({ memberId, username, following, followsYou, disabled = false }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = relationshipState(following, followsYou);
  const save = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await rankitApi.setUserFollow(memberId, !following); }
    catch (failure) { setError(failure.status === 401 ? 'Sign in to follow people.' : 'Could not confirm. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="ri-relationship-control">
    <button type="button" className={`ri-relationship ${state.key}`} aria-pressed={!!following}
      aria-label={`${following ? 'Unfollow' : state.label} @${username}`} aria-busy={busy}
      disabled={disabled || busy} onClick={save}>{busy ? 'Saving…' : state.label}</button>
    {error && <small role="alert">{error}</small>}
  </div>;
}
