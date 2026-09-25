/* 12a — kulüp, Inspector'da (BUILD §23: "a club is a lookup, not a
 * destination"). Okurken bir kulübe bakılır; tam sayfa yapılan işi atardı.
 * Açık bir maç taslağı varsa küçülür ve köşede bekler; başlıktaki geri oku
 * ona döner.
 *
 *   kahraman   arma 56 · ad 21 · "Premier League" (stadyum verisi yok,
 *              `venue` null → satırda yok) · FOLLOWING · you've logged N
 *   kutu       AVG HEAT THIS SEASON (yalnız 20+ puanlı maçlar) · beş çubuk ·
 *              played / classics / Nth in table
 *   liste      HOTTEST {KULÜP} MATCHES — iki sütun kompakt kart (174)
 *   NEXT       sıradaki maç + avdaki koleksiyonu ("counts toward The 38")
 *   alt        Follow / Unfollow · All {kulüp} matches (11c)
 *
 * Veri `GET /teams/{id}` (`season`, `logged`, `hottest`, `next`, `venue`).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import SharedMatchCard, { Shield } from "../redesign/MatchCard";
import { RAMP, RAMP_OFF } from "../redesign/heat";
import { cardEyebrow, compactCardProps, nextLine, ordinal } from "./pagesView";

const abbr = (team) => (team?.short_name || team?.short || team?.name || "").slice(0, 3).toUpperCase();

export default function ClubInspector({ id, hideScores, onClose, onBackToMatch, onOpenMatch, onOpenEntity, onSeeAll }) {
  const { isLoggedIn } = useAuth();
  const [state, setState] = useState({ id: null, data: null, error: "" });
  const [following, setFollowing] = useState(null);
  const heading = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    let alive = true;
    rankitApi.team(id)
      .then((data) => alive && setState({ id, data, error: "" }))
      .catch((e) => alive && setState({ id, data: null, error: String(e.message || e) }));
    return () => { alive = false; };
  }, [id]);

  // Açılışta odak panele; kapanınca açan öğeye döner (maç Inspector'ı gibi).
  useEffect(() => {
    const opener = document.activeElement;
    heading.current?.focus({ preventScroll: true });
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (typing && !panel.current?.contains(target)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = state.id === id ? state.data : null;
  const team = data?.team;
  const season = data?.season;
  const isFollowing = following ?? !!data?.following;
  const short = team?.short_name || team?.name || "";
  const color = team?.color || "#3a3f47";
  const heat = season?.season_avg_heat;
  const steps = heat == null ? 0 : Math.max(0, Math.min(5, Math.round(heat)));
  const next = data?.next;

  const toggleFollow = async () => {
    const before = isFollowing;
    setFollowing(!before);
    try {
      const r = await rankitApi.follow({ target_type: "team", target_id: id, notify: false }, !before);
      setFollowing(!!r.following);
    } catch { setFollowing(before); }
  };

  return (
    <aside className="riw-insp riw-club" ref={panel} role="dialog" aria-modal="false" aria-labelledby="riw-club-title">
      <header className="riw-insp-head">
        <h2 id="riw-club-title" ref={heading} tabIndex={-1}>INSPECTOR · CLUB{team ? ` · ${team.name.toUpperCase()}` : ""}</h2>
        {onBackToMatch && <button type="button" onClick={onBackToMatch} aria-label="Back to the match"><ArrowLeft size={15} /></button>}
        <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </header>

      {!data && !state.error && <div className="riw-insp-loading" aria-busy="true"><div /><div /></div>}
      {state.error && state.id === id && <p className="riw-note riw-insp-error" role="alert">{state.error}</p>}

      {data && team && (
        <>
          <div className="riw-insp-scroll">
            <div className="riw-club-hero" style={{ "--club": color }}>
              <Shield side={56} color={color} ink="#fff" abbr={abbr(team)} crestUrl={team.crest_url} badgeScale={0.26} />
              <div>
                <p className="riw-club-name">{team.name}</p>
                <p className="riw-club-sub">{[season?.season_competition?.name || team.country, data.venue].filter(Boolean).join(" · ")}</p>
                {isLoggedIn && (isFollowing || data.logged > 0) && (
                  <p className="riw-club-status">
                    {isFollowing && <b>FOLLOWING</b>}
                    {data.logged > 0 && <small>{isFollowing ? "· " : ""}you've logged {data.logged}</small>}
                  </p>
                )}
              </div>
            </div>

            {season?.season_competition && (
              <section className="riw-club-box" aria-labelledby="riw-club-heat">
                <div className="riw-club-line">
                  <h3 id="riw-club-heat">AVG HEAT THIS SEASON</h3>
                  {heat == null ? <small>TOO FEW RATINGS</small> : <strong>{Number(heat).toFixed(1)}</strong>}
                </div>
                <div className="riw-club-bars" role="img"
                  aria-label={heat == null ? "Not enough rated matches for an average yet" : `Average heat ${Number(heat).toFixed(1)} across ${season.season_heat_matches} rated matches`}>
                  {RAMP.map((c, i) => <i key={c} style={{ background: i < steps ? c : RAMP_OFF }} />)}
                </div>
                <dl className="riw-club-stats">
                  <div><dd>{season.played ?? 0}</dd><dt>played</dt></div>
                  <div><dd className="is-gold">{season.classics ?? 0}</dd><dt>classics</dt></div>
                  <div><dd>{season.position ? ordinal(season.position) : "—"}</dd><dt>in table</dt></div>
                </dl>
              </section>
            )}

            <section className="riw-club-section" aria-labelledby="riw-club-hottest">
              <div className="riw-club-line">
                <h3 id="riw-club-hottest">HOTTEST {short.toUpperCase()} MATCHES</h3>
                <button type="button" className="riw-insp-all" onClick={() => onSeeAll(team.name)}>All matches ›</button>
              </div>
              {data.hottest?.length ? (
                <div className="riw-club-cards">
                  {data.hottest.map((m) => (
                    <div key={m.id} className="riw-card-slot riw-shelf-slot is-community" role="button" tabIndex={0}
                      aria-label={`${m.home?.name} versus ${m.away?.name}`}
                      onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(m.id); }}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(m.id); }
                      }}>
                      <SharedMatchCard {...compactCardProps(m, { hideScores, eyebrow: cardEyebrow(m) })} crestSize={34} artHeight={56} cut={14} />
                    </div>
                  ))}
                </div>
              ) : <p className="riw-insp-fine">No {short} match has 20 ratings yet — heat shows once the room has spoken.</p>}
            </section>

            {next && (
              <section className="riw-club-section" aria-labelledby="riw-club-next">
                <h3 id="riw-club-next">NEXT</h3>
                <button type="button" className="riw-club-next" onClick={() => onOpenMatch(next.id)}>
                  <span className="riw-club-pair" aria-hidden="true">
                    <Shield side={32} color={next.home?.color || "#3a3f47"} ink="#fff" abbr={abbr(next.home)} crestUrl={next.home?.crest_url} badgeScale={0.3} />
                    <Shield side={32} color={next.away?.color || "#3a3f47"} ink="#fff" abbr={abbr(next.away)} crestUrl={next.away?.crest_url} badgeScale={0.3} front />
                  </span>
                  <span>
                    <strong>{next.home?.name} vs {next.away?.name}</strong>
                    <small>{nextLine(next)}</small>
                  </span>
                </button>
              </section>
            )}

            {!!data.players?.length && (
              <section className="riw-club-section" aria-labelledby="riw-club-squad">
                <h3 id="riw-club-squad">SQUAD <span>{data.players.length}</span></h3>
                <div className="riw-club-squad">
                  {data.players.map((pl) => (
                    <button key={pl.id} type="button" onClick={() => onOpenEntity("player", pl.id)}>
                      {pl.shirt_no && <b>{pl.shirt_no}</b>}{pl.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <footer className="riw-club-foot">
            {isLoggedIn && (
              <button type="button" className="riw-club-follow" onClick={toggleFollow}>
                {isFollowing ? "Unfollow" : "Follow"}
              </button>
            )}
            <button type="button" className="riw-club-primary" onClick={() => onSeeAll(team.name)}>All {short} matches</button>
          </footer>
        </>
      )}
    </aside>
  );
}
