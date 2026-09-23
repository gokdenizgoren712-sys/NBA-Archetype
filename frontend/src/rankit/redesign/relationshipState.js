/* HTML t9: satir ve profil ayni dort durumu kullanir. */
export function relationshipState(following, followsYou) {
  if (following) return followsYou ? { key: 'mutual', label: 'Mutual' } : { key: 'following', label: 'Following' };
  return followsYou ? { key: 'follow-back', label: 'Follow back' } : { key: 'follow', label: 'Follow' };
}

export function overlapPercent(overlap) {
  if (!overlap || overlap.shared < Math.max(10, overlap.min_shared || 10) || !Number.isFinite(overlap.pct)) return null;
  return Math.round(Math.max(0, Math.min(1, overlap.pct)) * 100);
}
