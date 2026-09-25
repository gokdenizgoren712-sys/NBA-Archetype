/* Web kabuğunun verisi (7a başlık serisi + ray): /rank, /collections,
   /onboarding.followed_clubs. Bileşen dosyasından ayrı — fast refresh
   yalnız bileşen dışa açan dosyalarda çalışıyor. */
import { useEffect, useState } from "react";
import { rankitApi } from "../rankitApi";

export function useShellData(accountId, refreshToken) {
  const [rank, setRank] = useState({ key: null, data: null });
  const [hunt, setHunt] = useState({ key: null, data: null });
  const [clubs, setClubs] = useState({ key: null, data: null });
  useEffect(() => {
    if (accountId == null) return undefined;
    let alive = true;
    const keep = set => data => alive && set({ key: accountId, data });
    rankitApi.rank().then(keep(setRank)).catch(() => keep(setRank)(null));
    rankitApi.collections().then(keep(setHunt)).catch(() => keep(setHunt)(null));
    return () => { alive = false; };
  }, [accountId, refreshToken]);
  useEffect(() => {
    if (accountId == null) return undefined;
    let alive = true;
    rankitApi.onboarding().then(d => alive && setClubs({ key: accountId, data: d.followed_clubs || [] }))
      .catch(() => alive && setClubs({ key: accountId, data: null }));
    return () => { alive = false; };
  }, [accountId]);
  const mine = state => (accountId != null && state.key === accountId ? state.data : null);
  return { rank: mine(rank), hunt: mine(hunt), clubs: mine(clubs) };
}
