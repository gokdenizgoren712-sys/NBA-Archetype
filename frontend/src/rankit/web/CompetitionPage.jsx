/* 8c — turnuva: tablo ve maç haftası YAN YANA, sekmelerin arkasında değil
 * (BUILD §23.2 — web'in telefondan ayrıldığı yer).
 *
 *   sol    596: TABLE — # · arma · CLUB · P · GD · PTS · AVG HEAT; satır 46.
 *          AVG HEAT "the reason a league table belongs in this product at
 *          all": yalnız 20+ puanlı maçlar, yoksa TOO FEW (§5.5).
 *   sağ    MATCHWEEK şeridi + iki sütun kompakt kart (174); haftası olmayan
 *          turnuvada fikstür. "Players" başlıktaki düğme — aynı sütunda 3d.
 *   başlık "Season heat map" (7g) · Players. Takip düğmesi yok: uç turnuva
 *          için `following` döndürmüyor ve çekmecedeki eski düğme hep
 *          "Follow" yazıyordu — yalan bir durum yerine tahtadaki ikili.
 *
 * Kulüp adı bir bakış (12a): Inspector'da açılır, sayfa değişmez.
 * Veri `GET /competitions/{id}` (+ `/competitions/{id}/matches?stage=`).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { rankitApi } from "../rankitApi";
import SharedMatchCard, { Shield } from "../redesign/MatchCard";
import CompetitionPlayers from "../redesign/CompetitionPlayers";
import { RAMP, RAMP_OFF } from "../redesign/heat";
import { PageHead } from "./PageParts";
import { ShelfSkeleton } from "./Skeletons";
import { avgHeatCell, compactCardProps, currentWeek, kickoffEyebrow, standingColumns, weekNumber, weekWindow } from "./pagesView";

function HeatBars({ steps }) {
  return (
    <span className="riw-comp-bars" aria-hidden="true">
      {RAMP.map((color, i) => <i key={color} style={{ background: i < steps ? color : RAMP_OFF }} />)}
    </span>
  );
}

function CardSlot({ match, hideScores, onOpenMatch, eyebrow }) {
  return (
    <div className="riw-card-slot riw-shelf-slot is-community" role="button" tabIndex={0}
      aria-label={`${match.home?.name} versus ${match.away?.name}`}
      onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(match.id); }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(match.id); }
      }}>
      <SharedMatchCard {...compactCardProps(match, { hideScores, eyebrow })} crestSize={34} artHeight={56} cut={14} />
    </div>
  );
}

function Table({ competition, standings, onOpenClub }) {
  const columns = standingColumns(competition?.sport);
  if (!standings.length) {
    return (
      <div className="riw-page-empty riw-comp-empty">
        <strong>No table yet</strong>
        <p>Standings appear once results are in for this season.</p>
      </div>
    );
  }
  return (
    <div className="riw-comp-table">
      <table>
        <caption className="sr-only">{competition?.name} table with average heat</caption>
        <thead>
          <tr>
            <th scope="col" className="is-rank">#</th>
            <th scope="col" className="is-club">CLUB</th>
            {columns.map((c) => <th key={c.key} scope="col" title={c.title} className={c.wide ? "is-wide" : undefined}>{c.label}</th>)}
            <th scope="col" className="is-heat">AVG HEAT</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const heat = avgHeatCell(row);
            return (
              <tr key={row.team_id}>
                <td className="is-rank">{i + 1}</td>
                <td className="is-club">
                  <button type="button" onClick={() => onOpenClub(row.team_id)} aria-label={`${row.name} — open the club`}>
                    <Shield side={28} color={row.color || "#3a3f47"} ink="#fff" abbr={(row.short_name || row.name || "").slice(0, 3).toUpperCase()}
                      crestUrl={row.crest_url} badgeScale={0.3} />
                    <span>{row.name}</span>
                  </button>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.strong ? "is-strong" : ""}${c.wide ? " is-wide" : ""}`.trim() || undefined}>
                    {c.format ? c.format(row[c.key]) : row[c.key] ?? 0}
                  </td>
                ))}
                <td className="is-heat" title={heat.label}>
                  <span className="sr-only">{heat.label}</span>
                  {heat.value == null
                    ? <small aria-hidden="true">TOO FEW</small>
                    : <span aria-hidden="true"><HeatBars steps={heat.steps} /><b>{heat.value.toFixed(1)}</b></span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Matchweek({ competitionId, matchweeks, fixtures, hideScores, onOpenMatch }) {
  const current = useMemo(() => currentWeek(matchweeks), [matchweeks]);
  const [week, setWeek] = useState(null);
  const active = week || current;
  const [loaded, setLoaded] = useState({ stage: null, matches: [], error: "" });

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    rankitApi.competitionMatches(competitionId, active)
      .then((d) => alive && setLoaded({ stage: active, matches: d.matches || [], error: "" }))
      .catch((e) => alive && setLoaded({ stage: active, matches: [], error: String(e.message || e) }));
    return () => { alive = false; };
  }, [competitionId, active]);

  if (!matchweeks.length) {
    return (
      <section className="riw-comp-week" aria-labelledby="riw-comp-week-title">
        <h2 id="riw-comp-week-title" className="riw-comp-label">FIXTURES</h2>
        {fixtures.length ? (
          <div className="riw-comp-cards">
            {fixtures.map((m) => <CardSlot key={m.id} match={m} hideScores={hideScores} onOpenMatch={onOpenMatch} eyebrow={kickoffEyebrow(m.starts_at, { upcoming: m.status === "upcoming" })} />)}
          </div>
        ) : (
          <div className="riw-page-empty riw-comp-empty"><strong>No fixtures</strong><p>The next scheduled matches will appear here.</p></div>
        )}
      </section>
    );
  }

  const index = matchweeks.findIndex((w) => w.stage === active);
  const step = (delta) => { const next = matchweeks[index + delta]; if (next) setWeek(next.stage); };
  const rows = loaded.stage === active ? loaded.matches : null;
  const shown = weekWindow(matchweeks, active, 5);

  return (
    <section className="riw-comp-week" aria-labelledby="riw-comp-week-title">
      <div className="riw-comp-weekbar">
        <h2 id="riw-comp-week-title" className="riw-comp-label">MATCHWEEK</h2>
        <div className="riw-comp-strip" role="group" aria-label="Choose a matchweek">
          <button type="button" className="riw-comp-step" onClick={() => step(-1)} disabled={index <= 0} aria-label="Previous matchweek"><ChevronLeft size={15} /></button>
          {shown.map((w) => {
            const done = w.finished >= w.matches;
            const on = w.stage === active;
            return (
              <button key={w.stage} type="button" aria-pressed={on} onClick={() => setWeek(w.stage)}
                className={`riw-comp-pill${on ? " is-on" : done ? " is-done" : ""}`}
                aria-label={`${w.stage} — ${w.finished} of ${w.matches} played`}>
                {weekNumber(w.stage)}
              </button>
            );
          })}
          <button type="button" className="riw-comp-step" onClick={() => step(1)} disabled={index >= matchweeks.length - 1} aria-label="Next matchweek"><ChevronRight size={15} /></button>
        </div>
      </div>
      {loaded.error && loaded.stage === active && <p className="riw-note" role="alert">{loaded.error}</p>}
      {rows === null && <div className="riw-comp-cards" aria-busy="true"><ShelfSkeleton count={4} /></div>}
      {rows?.length > 0 && (
        <div className="riw-comp-cards">
          {rows.map((m) => <CardSlot key={m.id} match={m} hideScores={hideScores} onOpenMatch={onOpenMatch} eyebrow={kickoffEyebrow(m.starts_at, { upcoming: m.status === "upcoming" })} />)}
        </div>
      )}
      {rows?.length === 0 && !loaded.error && (
        <div className="riw-page-empty riw-comp-empty"><strong>No matches in this round</strong><p>Pick another matchweek.</p></div>
      )}
    </section>
  );
}

export default function CompetitionPage({ competitionId, hideScores, onOpenMatch, onOpenEntity }) {
  const [state, setState] = useState({ id: null, data: null, error: "" });
  const [view, setView] = useState("week");

  useEffect(() => {
    let alive = true;
    rankitApi.competition(competitionId)
      .then((data) => alive && setState({ id: competitionId, data, error: "" }))
      .catch((e) => alive && setState({ id: competitionId, data: null, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [competitionId]);

  const data = state.id === competitionId ? state.data : null;
  const comp = data?.competition;
  const matchweeks = data?.matchweeks || [];
  const current = currentWeek(matchweeks);
  const eyebrow = [comp?.country, comp?.season, current ? `MATCHWEEK ${weekNumber(current)}` : null].filter(Boolean).join(" · ").toUpperCase();

  return (
    <div className="riw-page riw-comp">
      <PageHead eyebrow={eyebrow || "COMPETITION"} title={comp?.name || "Competition"}>
        <div className="riw-sortbar" role="group" aria-label="Competition">
          {matchweeks.length > 0 && (
            <Link to={`/rankit/competition/${competitionId}/heat`} className="riw-comp-heatlink">
              <span aria-hidden="true">{RAMP.slice(1).map((c) => <i key={c} style={{ background: c }} />)}</span>
              Season heat map
            </Link>
          )}
          <button type="button" aria-pressed={view === "players"} onClick={() => setView((v) => (v === "players" ? "week" : "players"))}>Players</button>
        </div>
      </PageHead>

      {state.error && state.id === competitionId && <p className="riw-note riw-page-pad" role="alert">{state.error}</p>}
      {!data && !state.error && <div className="riw-comp-body" aria-busy="true"><div className="riw-comp-skeleton" /><div className="riw-comp-skeleton" /></div>}

      {data && (
        <div className="riw-comp-body">
          <section className="riw-comp-left" aria-labelledby="riw-comp-table-title">
            <h2 id="riw-comp-table-title" className="riw-comp-label">TABLE</h2>
            <Table competition={comp} standings={data.standings || []} onOpenClub={(id) => onOpenEntity("team", id)} />
            {!!data.standings?.length && (
              <p className="riw-comp-note"><strong>Avg heat</strong> is the community's average across that club's matches — only matches with at least 20 ratings count.</p>
            )}
          </section>
          <div className="riw-comp-right">
            {view === "players" ? (
              <section aria-label="Players" className="riw-comp-players">
                <CompetitionPlayers competitionId={competitionId} onOpenPlayer={(pid) => onOpenEntity("player", pid)} />
              </section>
            ) : (
              <Matchweek competitionId={competitionId} matchweeks={matchweeks} fixtures={data.fixtures || []}
                hideScores={hideScores} onOpenMatch={onOpenMatch} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
