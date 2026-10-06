import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import FootballPlayerCard from "../../components/FootballPlayerCard";
import { EmptyState } from "../../components/states/States";
import { Button } from "../../components/ui";
import { PHASE_COLOR } from "../../game/football/theme";
import "../player-profile.css";

// /football/players/:id (v3 S5): kart | başlık + Rating/Top/Games üçlüsü, arketip uyum çubukları, sezon tablosu.
// Veri: /api/football/players/{id} (B8: satır, rank, role_profile, description), /career (per-90), /similar (B18).
const PHASE_LABEL = { gk: "Goalkeeper", def: "Defence", mid: "Midfield", fwd: "Attack" };
const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));

export default function FootballPlayerProfile() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
    const season = params.get("season") || undefined;
  const [row, setRow] = useState(null);
  const [career, setCareer] = useState(null);
  const [per90, setPer90] = useState([]);
  const [similar, setSimilar] = useState(null);
  const [state, setState] = useState("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setState("loading"); setRow(null); setCareer(null); setSimilar(null);
    const pid = Number(id);
    api.footballCareer(pid).then(d => { setCareer(d.seasons || []); setPer90(d.per_90 || []); }).catch(() => setCareer([]));
    api.footballPlayer(pid, season).then(d => { setRow(d); setState("ok");
      api.footballSimilar(pid, d.season, 3).then(l => setSimilar(Array.isArray(l) ? l : l.similar || [])).catch(() => setSimilar([]));
    }).catch(() => setState("missing"));
  }, [id, season]);

  const fits = useMemo(() => {
    if (!row) return [];
    return Object.keys(row).filter(k => k.startsWith("score_") && row[k] != null)
      .map(k => ({ a: k.slice(6), v: Math.round(row[k] * 100) })).sort((a, b) => b.v - a.v);
  }, [row]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: row?.PLAYER_NAME, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (state === "loading") return <div className="pp-page"><div className="pp-skel" aria-busy="true" aria-label="Loading" /></div>;
  if (state === "missing" || !row) return (
    <EmptyState title="Player not found" body="That player isn't in the data for this season."
      actions={[{ label: "Back to football players", primary: true, onClick: () => navigate("/football/players") }]} />
  );

  const phase = row.PHASE || "mid";
  const tint = PHASE_COLOR[phase] || "var(--accent)";
  const overall = row.overall_score != null ? Math.round(row.overall_score * 100) : null;
  const arch = row.primary_arch;

  return (
    <>
      <SEO title={row.PLAYER_NAME} description={`${row.PLAYER_NAME} (${arch || "unrated"}) — ${row.TEAM}. Archetype fit and season history.`} path={`/football/players/${id}`} />
      <div className="pp-page" style={{ "--tint": tint }}>
        <div className="pp-inner">
          <div className="pp-top">
            <div className="pp-card"><FootballPlayerCard player={row} season={season} /></div>
            <header className="pp-head">
              <span className="eyebrow">{["Football", row.LEAGUE, row.TEAM, row.POSITION].filter(Boolean).join(" · ")}</span>
              <h1>{row.PLAYER_NAME}</h1>
              <div className="pp-stats">
                <div className="hot"><span>Rating</span><b>{overall ?? "—"}</b></div>
                <div><span>{row.rank != null ? "Rank" : "Pos"}</span><b>{row.rank != null ? row.rank : row.POSITION || "—"}</b></div>
                <div><span>Apps</span><b>{row.APPS ?? "—"}</b></div>
              </div>
              <div className="pp-actions"><Button variant="outline" size={34} onClick={share}>{copied ? "Link copied" : "Share"}</Button></div>
            </header>
            <div className="pp-body">
              {arch && (
                <div className="pp-panel pp-about">
                  <span className="pp-chip" style={{ "--c": tint }}><i />{arch}</span>
                  {row.description ? (
                    <div className="pp-about-copy">
                      <h2 className="pp-desc-h">{row.description.headline}</h2>
                      <p>{row.description.summary}</p>
                      {row.description.evidence?.length > 0 && (
                        <div className="pp-evidence">
                          {row.description.evidence.map(e => <span key={e.label} className="pp-ev good"><i>{e.label}</i><b>{e.value}</b><em>{e.pct}th</em></span>)}
                        </div>
                      )}
                      <p className="pp-fine">{row.description.confidence_note}{row.description.updated_at ? ` Updated ${row.description.updated_at}.` : ""}</p>
                    </div>
                  ) : (
                    <p><b>{row.PLAYER_NAME}</b> reads as a{/^[AEIOU]/i.test(arch) ? "n" : ""} {arch} among {PHASE_LABEL[phase].toLowerCase()} players{overall != null && <>, with an overall rating of {overall}</>}.</p>
                  )}
                </div>
              )}
              {(row.role_profile?.length > 0 || fits.length > 0) && (
                <section className="pp-panel">
                  <div className="pp-h"><span>{row.role_profile?.length > 0 ? "Role profile" : "Archetype fit"}</span><em>{row.role_profile?.length > 0 ? row.peer_group : `Within ${PHASE_LABEL[phase].toLowerCase()}`}</em></div>
                  <div className="pp-bars">
                    {(row.role_profile?.length > 0 ? row.role_profile.map(m => ({ a: m.label, v: m.pct })) : fits).map(r => (
                      <div key={r.a} className={r.a === arch || row.role_profile?.length > 0 ? "on" : ""} style={{ "--c": tint }}>
                        <span>{r.a}</span><div className="track"><i style={{ width: `${r.v}%` }} /></div><b>{r.v}</b>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
          <section className="pp-panel pp-tablewrap">
            <div className="pp-h"><span>Seasons</span><em>Per 90 minutes</em></div>
            {career == null ? <div className="pp-skel sm" /> : career.length === 0 ? <p className="pp-muted">No earlier seasons on record.</p> : (
              <div className="pp-scroll">
                <table className="pp-table">
                  <thead><tr><th>Season</th><th>Team</th><th>Archetype</th><th>Rating</th><th>G/90</th><th>A/90</th><th>xG+xA</th><th>Drib</th><th>Cross</th><th>Min</th></tr></thead>
                  <tbody>
                    {career.map((s, i) => (
                      <tr key={`${s.SEASON}-${s.TEAM}-${i}`}>
                        <td>{s.SEASON}</td><td>{s.TEAM}</td><td>{s.primary_arch || "—"}</td>
                        <td>{s.overall_score != null ? Math.round(s.overall_score * 100) : "—"}</td>
                        <td>{fmt(s.goals_90)}</td><td>{fmt(s.assists_90)}</td><td>{fmt(s.xg_xa_90)}</td><td>{fmt(s.dribbles_90, 1)}</td><td>{fmt(s.crosses_90, 1)}</td><td>{s.MINUTES_TOTAL != null ? Math.round(s.MINUTES_TOTAL).toLocaleString("en-US") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {similar?.length > 0 && (
            <section className="pp-panel pp-similar">
              <div className="pp-h"><span>Plays like</span><em>Closest by role and production</em></div>
              <div className="pp-sim-row">
                {similar.map(p => (
                  <Link key={p.player_id} to={`/football/players/${p.player_id}`} className="pp-sim">
                    <b>{p.name}</b>
                    {p.primary_arch && <span className="pp-chip" style={{ "--c": tint }}><i />{p.primary_arch}</span>}
                    <strong>{p.match_pct}%<small>MATCH</small></strong>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <Link to="/football/players" className="pp-muted">← All football players</Link>
        </div>
      </div>
    </>
  );
}
