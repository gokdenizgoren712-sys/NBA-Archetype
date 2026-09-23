/* 6b rafta mac, yorumlarda entry kimligi kullanir. Rewatch ayni karti cogaltmaz. */
export function profileShelf(entries = []) {
  const seen = new Set();
  return entries.filter(entry => {
    if (!entry.match_id || seen.has(String(entry.match_id))) return false;
    seen.add(String(entry.match_id));
    return true;
  }).slice(0, 3);
}

export function personalReviews(entries = []) {
  return entries.filter(entry => typeof entry.review === 'string' && entry.review.trim());
}

export function profileCrest(width) {
  return Math.min(30, Math.max(16, (width - 24) / 2.414));
}

export function joinedLabel(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(date);
}
