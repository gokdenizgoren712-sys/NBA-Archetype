/* 7a "FROM PEOPLE YOU FOLLOW" — telefonun 2q akışının masaüstü satırı.
 *
 * Görsel kaynak `RankIt Web.dc.html#7a`:
 *   satır      #121315, 14px yarıçap, hairline, 14/16 dolgu, 11px aralık
 *   baş        34px avatar · @kullanıcı Rajdhani 700 12px · 10px yıldızlar ·
 *              "Arsenal 3–1 Tottenham · 2h" Outfit 11.5px #7f868b
 *   yorum      Outfit 12px/1.5 #c9cccd
 *   sağ        respect elması + sayı
 *   koleksiyon "Finished Madrid Derbies — 6 of 6 rated this season."
 *
 * Kurallar telefonla AYNI modülden (`redesign/feedItems.js`): §3.1 maçı
 * puanlamadıysan arkadaşın yıldızı ve yorumu bir hüküm, kapalı; kalkan
 * açıksa skor satırdan da düşer. Veri `GET /activity`.
 */
import { useState } from "react";
import { rankitApi } from "../rankitApi";
import { hidesScore } from "../rankitPrefs";
import { useResource } from "../redesign/useResource";
import CommunityVerdictGate from "../redesign/CommunityVerdictGate";
import { collectionLine, feedAgo, feedCardMatch, initials, verdictCovered } from "../redesign/feedItems";
import { Stars } from "./cards";

function teams(match) {
  return [match.home?.short || match.home?.name, match.away?.short || match.away?.name];
}

function EntryRow({ item, hideScores, onOpenMatch, onOpenMember }) {
  const [revealed, setRevealed] = useState(false);
  const match = feedCardMatch(item);
  const covered = verdictCovered(item, revealed);
  const [home, away] = teams(match);
  const scoreShown = match.status === "finished" && match.score && !hidesScore(hideScores, match);
  const title = scoreShown ? `${home} ${match.score.replace(/\s/g, "")} ${away}` : `${home} v ${away}`;
  const open = () => onOpenMatch(match.id);
  return (
    <article className="riw-follow-row" role="button" tabIndex={0}
      aria-label={`@${item.user?.username} on ${home} versus ${away}`}
      onClick={(event) => { if (!event.target.closest("button")) open(); }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); }
      }}>
      <span className="riw-follow-avatar" aria-hidden="true">{initials(item.user?.username)}</span>
      <div className="riw-follow-body">
        <div className="riw-follow-head">
          <button type="button" className="riw-follow-who" onClick={() => onOpenMember(item.user?.id)}>@{item.user?.username}</button>
          {!covered && item.rating != null && <Stars value={item.rating} compact />}
          <span>{title} · {feedAgo(item.at)}</span>
        </div>
        {item.review_withheld
          ? <CommunityVerdictGate spoiler actionLabel="OPEN MATCH"
              message="Contains spoilers — open the match to read this review."
              onReveal={(event) => { event.stopPropagation(); open(); }} />
          : covered
            ? <CommunityVerdictGate onReveal={(event) => { event.stopPropagation(); setRevealed(true); }} />
            : item.review && <p className="riw-follow-review">{item.review}</p>}
      </div>
      {!covered && (
        <span className="riw-follow-respect" aria-label={`${item.respect || 0} respect`}>
          <i aria-hidden="true" />{item.respect || 0}
        </span>
      )}
    </article>
  );
}

function CollectionRow({ item, onOpenMember }) {
  const { title, tail } = collectionLine(item.collection);
  return (
    <article className="riw-follow-row is-static">
      <span className="riw-follow-avatar" aria-hidden="true">{initials(item.user?.username)}</span>
      <div className="riw-follow-body">
        <div className="riw-follow-head">
          <button type="button" className="riw-follow-who" onClick={() => onOpenMember(item.user?.id)}>@{item.user?.username}</button>
          <span>closed a collection · {feedAgo(item.at)}</span>
        </div>
        <p className="riw-follow-review">Finished <strong>{title}</strong> {tail}</p>
      </div>
    </article>
  );
}

export default function FollowFeed({ accountId, refreshToken, hideScores, onOpenMatch, onOpenEntity, limit = 6 }) {
  const { data, error, loading, reload } = useResource(`web-follow:${accountId}:${refreshToken}`,
    () => rankitApi.activity({ limit }));
  const items = data?.items || [];
  const openMember = (id) => { if (id != null) onOpenEntity("member", id); };

  if (error) {
    return <div className="riw-note">Couldn't load your feed. <button type="button" className="riw-linkish" onClick={reload}>Try again</button></div>;
  }
  if (loading && !data) {
    return <div className="riw-follow-list" aria-busy="true">{[0, 1].map((i) => <div key={i} className="riw-follow-skeleton" />)}</div>;
  }
  if (!items.length) {
    return <p className="riw-rail-note riw-follow-empty">Follow people from their profiles — what they log shows up here.</p>;
  }
  return (
    <div className="riw-follow-list">
      {items.map((item) => item.kind === "collection"
        ? <CollectionRow key={`c-${item.id}`} item={item} onOpenMember={openMember} />
        : <EntryRow key={`e-${item.id}`} item={item} hideScores={hideScores} onOpenMatch={onOpenMatch} onOpenMember={openMember} />)}
    </div>
  );
}
