/* Günlük parçaları — ekranlar 2d (timeline, ısı şeridi) ve 2e (raf).
 *
 * Görsel kaynak `RankIt Redesign.dc.html#2d` / `#2e`. Hesap `diaryView.js`'te;
 * bu dosya yalnız çiziyor.
 *   ısı şeridi   #121315 kart, 18px yarıçap; LAST 28 NIGHTS + "N logged";
 *                28 çubuk, 36px, 2px aralık; boş gece %22 .07
 *   satır        72px; gün 21px + hafta günü 9px; elmas çifti 52px;
 *                başlık Rajdhani 700 13px; 11px yıldızlar + Classic elması;
 *                sağda 4×36 topluluk ısısı
 *   ay satırı    Rajdhani 700 13px .1em büyük harf #c9cccd + hairline
 */
import { Star } from "lucide-react";
import { CrestPair } from "./MatchCard";
import { dayParts, heatStrip, monthLabel, rowHeat, rowTitle, SHOW, sortsFor } from "./diaryView";

/* 2d yıldızları: mürekkep, altın değil (altın bu bölgede Classic elmasının). */
export function DiaryStars({ value = 0 }) {
  const v = Number(value) || 0;
  return <span className="ri-dstars" role="img" aria-label={v ? `Your rating ${v} out of 5` : "Not rated"}>
    {[1, 2, 3, 4, 5].map((n) => {
      const fill = v >= n ? 100 : v >= n - 0.5 ? 50 : 0;
      return <span key={n} className="ri-dstar" style={{ "--fill": `${fill}%` }} aria-hidden="true">
        <Star size={11} strokeWidth={0} fill="currentColor" />
        <span><Star size={11} strokeWidth={0} fill="currentColor" /></span>
      </span>;
    })}
  </span>;
}

export function DiaryHeatStrip({ entries, today }) {
  const { nights, logged } = heatStrip(entries, today);
  return <section className="ri-dstrip" aria-label={`Last 28 nights, ${logged} logged`}>
    <header><span>LAST 28 NIGHTS</span><strong>{logged} logged</strong></header>
    <div aria-hidden="true">{nights.map((n) => <i key={n.date} data-logged={n.logged ? "" : undefined}
      style={{ height: `${n.height}%`, ...(n.color ? { background: n.color } : null) }} />)}</div>
    <p>Height is your stars, colour is community heat.</p>
  </section>;
}

function TimelineRow({ e, hidden, onOpen }) {
  const { day, weekday } = dayParts(e.watched_date);
  const heat = rowHeat(e);
  const title = rowTitle(e, hidden);
  return <div className="ri-drow" role="button" tabIndex={0} aria-label={`Open ${title}`}
    onClick={() => onOpen({ id: e.match_id })}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen({ id: e.match_id }); } }}>
    <span className="ri-drow-date"><b>{day}</b><small>{weekday}</small></span>
    <CrestPair home={{ short: e.home_short, color: e.home_color, crest_url: e.home_crest }}
      away={{ short: e.away_short, color: e.away_color, crest_url: e.away_crest }} />
    <span className="ri-drow-text">
      <strong>{title}</strong>
      <span><DiaryStars value={e.rating} />{!!e.classic && !hidden && <i className="ri-drow-classic" aria-label="Your Classic" role="img" />}</span>
    </span>
    <i className="ri-drow-heat" aria-hidden="true" style={heat ? { background: heat } : null} />
  </div>;
}

/* Timeline: tarih sırasında ay başlıkları, puan sırasında düz liste. */
export function DiaryTimeline({ entries, grouped, isHidden, onOpen }) {
  const months = entries.map((e) => (grouped ? monthLabel(e.watched_date) : null));
  return <div className="ri-dtimeline">{entries.map((e, i) => {
    const head = grouped && months[i] !== months[i - 1];
    return <div key={e.id}>
      {head && <div className="ri-dmonth"><span>{months[i]}</span><i /></div>}
      <TimelineRow e={e} hidden={isHidden(e)} onOpen={onOpen} />
    </div>;
  })}</div>;
}

/* "Newest" ile açılan bar. Seçim anında uygulanır; bar tetikleyiciyle kapanır.
   Pill değil sessiz bir segment — ama §6 gereği her seçenek 48px. */
export function DiaryFilterBar({ id, show, sort, onShow, onSort }) {
  const sorts = sortsFor(show);
  return <div id={id} className="ri-dbar" role="group" aria-label="Diary filters">
    <p>SHOW</p>
    <div className="ri-diary-filters">{SHOW.map((x) => <button type="button" key={x} aria-pressed={show === x}
      className={show === x ? "active" : ""} onClick={() => onShow(x)}>{x}</button>)}</div>
    {!!sorts.length && <>
      <p>SORT</p>
      <div className="ri-diary-filters">{sorts.map((x) => <button type="button" key={x} aria-pressed={sort === x}
        className={sort === x ? "active" : ""} onClick={() => onSort(x)}>{x}</button>)}</div>
    </>}
  </div>;
}
