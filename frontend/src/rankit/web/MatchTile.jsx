/* 12b · 12c'nin kart OLMAYAN karoları — oynanmamış ya da henüz
 * puanlanmamış maç. Kart gibi yer kaplar (aynı ızgara hücresi), ama ısısı,
 * skoru, damgası yoktur; yalan bir boş kart çizmez.
 *
 *   next     kırmızı çerçeve, göz etiketi "SUNDAY 16:30", "Next in line"
 *   missing  kesikli, takımlar + tarih ("still missing")
 *   open     kesikli, oynandı ama puanlamadın — "Played 31 Aug · rate it"
 *
 * Hepsi düğme: maç Inspector'da açılır.
 */
import { dayLabel, timeLabel } from "../redesign/huntSummary";
import { shortDate } from "./pagesView";

export default function MatchTile({ kind, match, nextLabel = "Next in line", onOpen }) {
  const home = match?.home?.name || match?.home_name || "";
  const away = match?.away?.name || match?.away_name || "";
  // Bir hafta içindeyse gün adı ("SUNDAY 16:30", tahta), değilse "11 OCT 16:30".
  const soon = /day$/i.test(dayLabel(match?.starts_at));
  const when = kind === "next"
    ? [soon ? dayLabel(match?.starts_at) : shortDate(match?.starts_at), timeLabel(match?.starts_at)].filter(Boolean).join(" ").toUpperCase()
    : "";
  const foot = kind === "next" ? nextLabel
    : kind === "open" ? `Played ${shortDate(match?.starts_at)} · rate it`
    : shortDate(match?.starts_at);
  return (
    <button type="button" className={`riw-tile is-${kind}`} onClick={() => onOpen(match.id)}
      aria-label={`${home} versus ${away} — ${kind === "next" ? `next, ${when.toLowerCase()}` : kind === "open" ? "played, not rated yet" : `not played yet, ${foot}`}`}>
      {kind === "next" && <small className="riw-tile-when">{when}</small>}
      <span className="riw-tile-body">
        <strong>{home}<br />{away}</strong>
        <small>{foot}</small>
      </span>
    </button>
  );
}
