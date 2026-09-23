import { useEffect, useState } from 'react';
import { ratingAccount } from '../rankitOutbox';

export function useRelationshipRevision() {
  const account = ratingAccount();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = event => {
      if (String(event.detail.account) === String(account)) setRevision(value => value + 1);
    };
    window.addEventListener('rankit:relationships', changed);
    return () => window.removeEventListener('rankit:relationships', changed);
  }, [account]);
  return revision;
}
