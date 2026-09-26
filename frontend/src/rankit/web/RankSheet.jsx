/* Rank (ortadaki elmas) — telefonun 3j'si, web'de (§25: 820 ve altında web
 * davranışta uygulamadan ayırt edilemez). Eskiden web yalnız "bitmiş maç ara"
 * listesi açıyordu; 3j ise önce BU GECE henüz kaydetmediğin maçları, sonra
 * "Last 7 days · N unrated" yakalamayı gösterir — seri notuyla (`nightStatus`,
 * telefonla ortak). Arama her zaman üstte. Veri `GET /quick-rate` + `/search`.
 */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Search } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { hidesScore } from "../rankitPrefs";
import { fromApiMatch } from "../matchModel";
import { Shield } from "../redesign/MatchCard";
import { nightStatus } from "../redesign/streakNight";
import Sheet from "./Sheet";

function Row({ match, note, streak = false, onPick }) {
  return (
    <button type="button" className={`riw-quick-row${streak ? " is-streak" : ""}`} onClick={() => onPick(match.id)}>
      <span className="riw-quick-pair" aria-hidden="true">
        <Shield side={26} color={match.home.color || "#3a3f47"} ink="#fff" abbr={(match.home.short || "").slice(0, 3).toUpperCase()} crestUrl={match.home.crest_url} badgeScale={0.3} />
        <Shield side={26} color={match.away.color || "#3a3f47"} ink="#fff" abbr={(match.away.short || "").slice(0, 3).toUpperCase()} crestUrl={match.away.crest_url} badgeScale={0.3} front />
      </span>
      <span>
        <strong>{match.home.short || match.home.name} vs {match.away.short || match.away.name}</strong>
        <small>{note}</small>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

export default function RankSheet({ onClose, onPick, hideScores }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState({ q: "", rows: null });
  const [data, setData] = useState(undefined);
  const [catchupOpen, setCatchupOpen] = useState(false);
  const term = query.trim();

  useEffect(() => {
    let alive = true;
    rankitApi.quickRate(-new Date().getTimezoneOffset()).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (term.length < 2) return undefined;
    const timer = setTimeout(() => {
      rankitApi.search(term, "Matches").then((r) => setFound({ q: term, rows: (r.matches || []).map(fromApiMatch) }))
        .catch(() => setFound({ q: term, rows: [] }));
    }, 180);
    return () => clearTimeout(timer);
  }, [term]);

  const pick = (id) => { onClose(); onPick(id); };
  const night = nightStatus(data);
  const searching = term.length >= 2;
  const rows = searching && found.q === term ? found.rows : null;

  return (
    <Sheet label="Rate a match" title="What did you watch?" onClose={onClose} className="riw-rank">
      <p className="riw-page-eyebrow riw-rank-eyebrow">RATE A MATCH</p>
      <label className="riw-people-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any match" aria-label="Search any match" data-autofocus />
      </label>

      {searching ? (
        <div className="riw-quick-group">
          <h3 className="riw-page-eyebrow">{rows ? `${rows.length} FOUND` : "SEARCHING…"}</h3>
          {rows?.map((m) => <Row key={m.id} match={m} note={`${m.competition} · ${m.dateOnly || m.date}`} onPick={pick} />)}
        </div>
      ) : data === undefined ? (
        <div className="riw-read-skeleton" aria-busy="true" />
      ) : !data ? (
        <p className="riw-note" role="alert">Couldn't load tonight's matches. Search still works.</p>
      ) : (
        <>
          {!!data.tonight?.length && (
            <div className="riw-quick-group">
              <h3 className="riw-page-eyebrow">FROM TONIGHT · NOT YET LOGGED</h3>
              {night.note && <p className={`riw-quick-note${night.tone === "at-risk" ? " is-risk" : ""}`} role="status">{night.note}</p>}
              {data.tonight.map((m) => {
                const card = fromApiMatch(m);
                return <Row key={card.id} match={card} streak={night.keepsStreak} onPick={pick}
                  note={night.keepsStreak ? "Keeps your streak alive" : `${hidesScore(hideScores, card) ? "Played" : "Full time"} · ${card.time}`} />;
              })}
            </div>
          )}
          {!!data.catchup_total && (
            <div className="riw-quick-group">
              <h3 className="riw-page-eyebrow">OR CATCH UP</h3>
              <button type="button" className="riw-quick-row is-catchup" aria-expanded={catchupOpen} onClick={() => setCatchupOpen((v) => !v)}>
                <CalendarDays size={16} aria-hidden="true" />
                <span><strong>Last 7 days</strong></span>
                <b>{data.catchup_total} unrated</b>
              </button>
              {catchupOpen && data.catchup.slice(0, 8).map((m) => {
                const card = fromApiMatch(m);
                return <Row key={card.id} match={card} note={`${card.competition} · ${card.dateOnly || card.date}`} onPick={pick} />;
              })}
            </div>
          )}
          {!data.tonight?.length && !data.catchup_total && (
            <div className="riw-page-empty riw-profile-empty">
              <strong>Everything is logged</strong>
              <p>Nothing from the last seven days is waiting for a rating.</p>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
