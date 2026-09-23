/* Kisisel formun kayit sozlesmesi: dizi sirasi duzenleme sayilmaz. */
export function entrySnapshot({ rating = 0, classic = false, tags = [], review = "", spoiler = false, visibility = "public", potmId = null, respect = [], rewatch = false }) {
  return JSON.stringify({ rating: Number(rating) || 0, classic: !!classic, tags: [...(tags || [])].sort(),
    review: review || "", spoiler: !!spoiler, visibility: visibility || "public", potmId: potmId || null, respect: [...(respect || [])].sort(), rewatch: !!rewatch });
}
export function snapshotFromMatch(match) {
  return entrySnapshot({ rating: match.my_rating, classic: match.my_classic, tags: match.my_tags,
    review: match.my_review, spoiler: match.my_spoiler, visibility: match.my_visibility,
    potmId: match.my_potm_id, respect: match.my_respect_ids });
}
