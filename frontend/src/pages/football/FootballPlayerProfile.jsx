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
// Tek-oyuncu uç noktası yok: satır, ?name= ile arama yapılıp PLAYER_ID eşleştirilerek bulunur; sezonlar /career'dan.
// Oyuncu açıklama metni (S5 mockup'ı) için backend girdisi yok (ticket B7/B8): burada yalnızca eldeki veriden tek cümle üretilir.
const PHASE_LABEL = { gk: "Goalkeeper", def: "Defence", mid: "Midfield", fwd: "Attack" };
const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));

export default function FootballPlayerProfile() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const name = params.get("name") || "";
  const season = params.get("season") || undefined;
  const [row, setRow] = useState(null);
  const [career, setCareer] = useState(null);
  const [state, setState] = useState("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setState("loading"); setRow(null); setCareer(null);
    const pid = Number(id);
    api.footballCareer(pid).then(d => setCareer(d.seasons || [])).catch(() => setCareer([]));
    if (!name) { setState("missing"); return; }
    api.footballPlayers({ search: name, season, limit: 40 })
      .then(d => {
        const hit = (d.players || []).filter(p => Number(p.PLAYER_ID) === pid);
        if (!hit.length) { setState("missing"); return; }
        setRow(hit.sort((a, b) => (b.MINUTES_TOTAL || 0) - (a.MINUTES_TOTAL || 0))[0]); setState("ok");
      })
      .catch(() => setState("missing"));
  }, [id, name, season]);

  const fits = useMemo(() => {
    if (!row) return [];
    return Object.keys(row).filter(k => k.startsWith("score_") && row[k] != null)
      .map(k => ({ a: k.slice(6), v: Math.round(row[k] * 100) })).sort((a, b) => b.v - a.v);
  }, [row]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (state === "loading") return <div className="pp-page"><div className="pp-skel" aria-busy="true" aria-label="Loading" /></div>;
  if (state === "missing" || !row) return (
    <EmptyState title="Player not found" body="That player isn't in the data for this season, or the link is missing the name."
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
                <div><span>Pos</span><b>{row.POSITION || "—"}</b></div>
                <div><span>Apps</span><b>{row.APPS ?? "—"}</b></div>
              </div>
              <div className="pp-actions"><Button variant="outline" size={34} onClick={share}>{copied ? "Link copied" : "Share"}</Button></div>
            </header>
            <div className="pp-body">
              {arch && (
                <div className="pp-panel pp-about">
                  <span className="pp-chip" style={{ "--c": tint }}><i />{arch}</span>
                  <p><b>{row.PLAYER_NAME}</b> reads as a{/^[AEIOU]/i.test(arch) ? "n" : ""} {arch} among {PHASE_LABEL[phase].toLowerCase()} players{overall != null && <>, with an overall rating of {overall}</>}.</p>
                </div>
              )}
              {fits.length > 0 && (
                <section className="pp-panel">
                  <div className="pp-h"><span>Archetype fit</span><em>Within {PHASE_LABEL[phase].toLowerCase()}</em></div>
                  <div className="pp-bars">
                    {fits.map(r => (
                      <div key={r.a} className={r.a === arch ? "on" : ""} style={{ "--c": tint }}>
                        <span>{r.a}</span><div className="track"><i style={{ width: `${r.v}%` }} /></div><b>{r.v}</b>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
          <section className="pp-panel pp-tablewrap">
            <div className="pp-h"><span>Seasons</span><em>Every scored season on record</em></div>
            {career == null ? <div className="pp-skel sm" /> : career.length === 0 ? <p className="pp-muted">No earlier seasons on record.</p> : (
              <div className="pp-scroll">
                <table className="pp-table">
                  <thead><tr><th>Season</th><th>Team</th><th>Archetype</th><th>Rating</th><th>G/90</th><th>A/90</th></tr></thead>
                  <tbody>
                    {career.map((s, i) => (
                      <tr key={`${s.SEASON}-${s.TEAM}-${i}`}>
                        <td>{s.SEASON}</td><td>{s.TEAM}</td><td>{s.primary_arch || "—"}</td>
                        <td>{s.overall_score != null ? Math.round(s.overall_score * 100) : "—"}</td>
                        <td>{fmt(s.goals_90)}</td><td>{fmt(s.assists_90)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <Link to="/football/players" className="pp-muted">← All football players</Link>
        </div>
      </div>
    </>
  );
}
