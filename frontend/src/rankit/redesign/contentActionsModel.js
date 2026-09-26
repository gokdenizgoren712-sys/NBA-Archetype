/* Report / Block menusunun verisi (ContentActions.jsx). Ayri dosya: bilesen
   dosyasi yalniz bilesen disari verir (fast refresh), testler de buradan okur.
   Sebepler api/rankit.py REPORT_REASONS ile ayni sirada ve anahtarlarla. */
export const REPORT_REASONS = [
  ["spam", "Spam or scam"],
  ["harassment", "Harassment or bullying"],
  ["hate", "Hate speech"],
  ["sexual", "Sexual content"],
  ["spoiler", "Unmarked spoilers"],
  ["other", "Something else"],
];

export const NOUNS = { review: "review", comment: "reply", list: "list", message: "message", user: "account" };

/* Menu yalniz oturum acikken ve baskasinin iceriginde. */
export function canActOn(author, viewer) {
  if (!author || author.id == null || !viewer || viewer.id == null) return false;
  return String(author.id) !== String(viewer.id);
}
