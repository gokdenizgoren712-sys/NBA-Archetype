import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import FootballCustomXI from "./FootballCustomXI";
import FootballRealXI from "./FootballRealXI";
import { ErrorState } from "../../components/states/States";
import PaIcon from "../../components/shell/PaIcon";
import { FORMATIONS } from "../../game/football/formations";
import { LEAGUE_LABEL } from "../../game/football/leagues";
import { ACCENT, PHASE_COLOR } from "../../game/football/theme";
import "../../game/game.css";
import "./chemistry.css";

// ── Futbol · Squad chemistry (handoff 11b) ──────────────────────────────────
// Basketbol Lineups'ın futbol karşılığı. Kaleci hesaba girmiyor (rolü diğer
// onla etkileşmiyor); şekil zorunlu. Best XI sekmesi 11b düzeninde: solda saha
// (en iyi on, dizilişin slotlarına pozisyona göre yerleşmiş), sağda skor —
// referans varsa 28k gerçek ilk-11'e karşı PERSANTİL, yoksa 100 üzerinden kimya.
// Diğer sekmeler (Custom XI, Real XIs, Pair affinity, Role slots) korunuyor.

const SHAPES = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-2-1", "4-1-4-1", "5-3-2"];
const TABS = [["xi", "Best XI"], ["custom", "Custom XI"], ["real", "Real XIs"], ["pairs", "Pair affinity"], ["slots", "Role slots"]];
const WARN = "#E8654C", MID = "#F2C14E";
const tone = (v) => (v >= 0.7 ? ACCENT : v >= 0.5 ? MID : WARN);
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; };

// Kalecisiz on oyuncuyu dizilişin slotlarına yerleştir: önce aynı pozisyon,
// sonra aynı faz, en son kalan herhangi biri.
function placeXI(shape, players) {
  const f = FORMATIONS[shape];
  if (!f) return {};
  const left = [...players];
  const out = {};
  const take = (pred) => { const i = left.findIndex(pred); return i >= 0 ? left.splice(i, 1)[0] : null; };
  const slots = f.slots.filter(s => s.phase !== "gk");
  for (const s of slots) { const p = take(p => p.POSITION === s.pos); if (p) out[s.id] = p; }
  for (const s of slots) if (!out[s.id]) { const p = take(p => p.PHASE === s.phase); if (p) out[s.id] = p; }
  for (const s of slots) if (!out[s.id]) { const p = take(() => true); if (p) out[s.id] = p; }
  return out;
}

function ChemPitch({ shape, squad }) {
  const f = FORMATIONS[shape];
  if (!f) return null;
  return (
    <div className="ch-pitch">
      <div className="ch-lines" />
      <div className="ch-half" />
      <div className="ch-circle" />
      {f.slots.map(slot => {
        const p = squad[slot.id];
        const c = PHASE_COLOR[slot.phase];
        const gk = slot.phase === "gk";
        return (
          <div key={slot.id} className={`ch-slot${gk ? " gk" : ""}`}
            style={{ left: `${100 - slot.y}%`, top: `${slot.x}%`, "--c": c }}
            title={gk ? "The goalkeeper isn't part of the chemistry score" : p ? `${p.PLAYER_NAME} · ${p.primary_arch}` : slot.id}>
            <span className="b">{slot.pos}</span>
            {p && <span className="n">{p.PLAYER_NAME.split(" ").slice(-1)[0]}</span>}
            {p && <span className="a">{p.primary_arch}</span>}
            {gk && <span className="a muted">Not scored</span>}
          </div>
        );
      })}
    </div>
  );
}

function Bar({ label, value, c }) {
  const v = Math.round((value ?? 0) * 100);
  return (
    <div className="ch-bar" style={{ "--c": c || tone(value ?? 0) }}>
      <span>{label}</span>
      <div className="tr"><i style={{ width: `${v}%` }} /></div>
      <b>{v}</b>
    </div>
  );
}

export default function FootballLineups() {
  const [meta, setMeta]     = useState(null);
  const [season, setSeason] = useState("");
  const [shape, setShape]   = useState("4-3-3");
  const [league, setLeague] = useState("");
  const [qw, setQw]         = useState(0.35);
  const [xi, setXi]         = useState(null);
  const [aff, setAff]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]       = useState("xi");

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  useEffect(() => {
    if (!season) return;
    api.footballAffinity(season).then(setAff).catch(() => setAff(null));
  }, [season]);

  const run = () => {
    if (!season) return;
    setLoading(true);
    api.footballBestXI({ season, shape, quality_weight: qw, ...(league ? { league } : {}) })
      .then(setXi)
      .catch(() => setXi({ error: "The search didn't finish. Try again or pick another shape." }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (season) run(); }, [season, shape, league, qw]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = xi?.fit;
  const ref = fit?.reference;
  const squad = useMemo(() => placeXI(shape, xi?.players || []), [shape, xi]);
  const hero = ref?.score != null ? tone(ref.score / 100) : ACCENT;

  return (
    <div className="ch-page">
      <SEO title="Football — Squad Chemistry"
        description="Which ten outfield players fit together best, by archetype."
        path="/football/lineups" noindex />
      <div className="ch-inner">
        <header className="ch-head">
          <div>
            <p className="pa-eyebrow">{`Football · Squad chemistry${season ? ` · ${season}` : ""}`}</p>
            <h1>Squad chemistry</h1>
          </div>
          {tab === "xi" && (
            <div className="ch-shapes" role="radiogroup" aria-label="Shape">
              {SHAPES.map(s => (
                <button key={s} role="radio" aria-checked={shape === s} className={shape === s ? "on" : ""} onClick={() => setShape(s)}>{s}</button>
              ))}
            </div>
          )}
        </header>

        <div className="ch-bar-row">
          <nav className="ch-tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>
          <label className="ch-season">
            <select value={season} onChange={e => setSeason(e.target.value)} aria-label="Season">
              {(meta?.seasons || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <PaIcon name="chevron" size={16} color="var(--text-muted)" />
          </label>
        </div>

        {tab === "xi" && (
          <>
            <div className="ch-controls">
              <div className="ch-leagues">
                <button className={!league ? "on" : ""} onClick={() => setLeague("")}>All leagues</button>
                {(meta?.leagues || []).map(l => (
                  <button key={l} className={league === l ? "on" : ""} onClick={() => setLeague(league === l ? "" : l)}>{LEAGUE_LABEL[l] || l}</button>
                ))}
              </div>
              <label className="ch-slider">
                <span>Chemistry</span>
                <input type="range" min="0" max="1" step="0.05" value={qw} onChange={e => setQw(parseFloat(e.target.value))}
                  aria-label="Balance between chemistry and quality" style={{ "--p": `${qw * 100}%` }} />
                <span>Quality</span>
              </label>
            </div>

            {xi?.error ? <ErrorState body={xi.error} onRetry={run} /> : (
              <div className="ch-grid">
                <div className={`ch-pitch-wrap ch-panel${loading ? " loading" : ""}`}>
                  <ChemPitch shape={shape} squad={squad} />
                  {loading && <span className="ch-searching">Searching {xi?.pool_size ? xi.pool_size.toLocaleString("en-US") : ""} players…</span>}
                </div>

                <aside className="ch-side ch-panel">
                  <span className="lbl">Squad fit</span>
                  {ref?.score != null ? (
                    <>
                      <div className="ch-big">
                        {/* Arama en iyi XI'yi bulduğu için referansın tepesini aşabiliyor;
                            "100th percentile" yerine 99+ ve bunu açıkça söyleyen satır */}
                        <b style={{ color: hero, }}>{ref.score >= 100 ? "99+" : ref.score}</b>
                        <span>{ref.score >= 100 ? "percentile" : `${ordinal(ref.score)} percentile`}</span>
                      </div>
                      <p className="ch-ref">
                        {ref.score >= 100 ? <>Higher than every one of the <b>{ref.n.toLocaleString("en-US")} real elevens</b></> : <>Ranked against <b>{ref.n.toLocaleString("en-US")} real elevens</b></>}
                        {" "}fielded across {ref.seasons} seasons. Chemistry {Math.round((fit?.score ?? 0) * 100)} / 100.
                      </p>
                    </>
                  ) : (
                    <div className="ch-big">
                      <b style={{ color: ACCENT }}>{Math.round((fit?.score ?? 0) * 100)}</b>
                      <span>/ 100 chemistry</span>
                    </div>
                  )}
                  <div className="ch-bars">
                    <Bar label="Role slots" value={fit?.slots} />
                    {/* API pairs_in_score=false: gösteriliyor ama skora girmiyor (bkz. About) */}
                    <Bar label={fit?.pairs_in_score === false ? "Pairs · not scored" : "Pair affinity"} value={fit?.pairs}
                      c={fit?.pairs_in_score === false ? "#8b857e" : undefined} />
                    <Bar label="Shape" value={fit?.shape} />
                    <Bar label="Role diversity" value={fit?.diversity} />
                  </div>
                  <div className="ch-div" />
                  {fit?.strongest && (
                    <p className="ch-sw">
                      <span><i style={{ background: ACCENT }} />Strongest: <b>{fit.strongest}</b></span>
                      <span><i style={{ background: WARN }} />Weakest: <b>{fit.weakest}</b></span>
                    </p>
                  )}
                  {fit?.slot_scores && (
                    <details className="ch-jobs">
                      <summary>How well each job is covered</summary>
                      <div className="ch-bars">
                        {Object.entries(fit.slot_scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Bar key={k} label={k} value={v} />)}
                      </div>
                    </details>
                  )}
                  <p className="ch-foot">
                    Searched {xi?.pool_size?.toLocaleString("en-US") || "…"} players · pair values from {fit?.source === "empirical+prior" ? "matches + prior" : "prior only"}.
                    The goalkeeper sits outside the score. What this does <i>not</i> claim is in <Link to="/football/about">About</Link>.
                  </p>
                </aside>
              </div>
            )}
          </>
        )}

        {tab === "custom" && <FootballCustomXI season={season} />}
        {tab === "real" && <FootballRealXI season={season} />}

        {tab === "pairs" && aff && (
          <section className="ch-list">
            <p className="ch-note">Positive means the two roles worked better together than the two squads' quality predicted. Measured pairs come from real matches; the rest fall back to a hand-written prior.</p>
            <div className="ch-pairs">
              {aff.pairs.slice(0, 40).map((p, i) => {
                const v = p.empirical ?? p.prior;
                const c = v > 0 ? ACCENT : WARN;
                return (
                  <div key={i} className="ch-pair">
                    <b style={{ color: c }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</b>
                    <span>{p.a} <em>+</em> {p.b}</span>
                    <i className={p.source === "empirical" ? "m" : ""}>{p.source === "empirical" ? "Measured" : "Prior"}</i>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "slots" && aff?.role_slots && (
          <section className="ch-list">
            <p className="ch-note">Eight jobs a team needs done. Several archetypes can do the same job in different ways — the number is how well that role serves it.</p>
            <div className="ch-roles">
              {Object.entries(aff.role_slots).map(([slot, arch]) => (
                <div key={slot} className="ch-role">
                  <b>{slot}</b>
                  <div>
                    {Object.entries(arch).sort((a, b) => b[1] - a[1]).map(([a, w]) => (
                      <span key={a}>{a}<em>{w.toFixed(2)}</em></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
