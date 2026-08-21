import { useState, useEffect } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import FootballCustomXI from "./FootballCustomXI";
import FootballRealXI from "./FootballRealXI";
import "../../game/game.css";
import { LEAGUE_LABEL } from "../../game/football/leagues";
import { Link } from "react-router-dom";

// ── Futbol XI uyumu ──────────────────────────────────────────────────────────
// Basketbol tarafındaki Lineups sayfasının futbol karşılığı. İki fark:
//   • Kaleci hesaba girmiyor — rolü diğer onla etkileşmiyor
//   • Şekil zorunlu: 10 oyuncu geçerli bir dizilişe bölünmek zorunda
// DURUM: altyapı. Ağırlıklar ground truth'a karşı kalibre edilmedi ve sayfa
// bunu kullanıcıya açıkça söylüyor — ölçülmüş bir şey gibi sunulmamalı.

const ACCENT = "#3FB08C";
const PHASE_COLOR = { def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };
const PHASE_LABEL = { def: "Defence", mid: "Midfield", fwd: "Attack" };
const SHAPES = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-2-1", "4-1-4-1", "5-3-2"];

// Basketbol tarafındaki pillar barlarıyla AYNI bileşen (g-bar-track/fill) —
// çizgili dolgu, yuvarlak uç, accent'ten renk. İki spor aynı barı kullanınca
// "aynı sistem" hissi buradan geliyor.
function Bar({ label, value, accent = "#3FB08C" }) {
  const v = Math.round((value ?? 0) * 100);
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11.5px] shrink-0 text-right" style={{ width: 108, color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="g-bar-track flex-1" style={{ height: 8 }}>
        <div className="g-bar-fill" style={{ width: `${v}%`, "--fill": accent, "--fill-a": accent + "66" }} />
      </div>
      <span className="font-logo text-[12.5px] font-bold w-7 text-right shrink-0 tabular-nums"
        style={{ color: accent }}>{v}</span>
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
    api.footballBestXI({ season, shape, quality_weight: qw,
                         ...(league ? { league } : {}) })
      .then(setXi)
      .catch(() => setXi({ error: "request failed" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (season) run(); },
    [season, shape, league, qw]);   // eslint-disable-line react-hooks/exhaustive-deps

  const fit = xi?.fit;
  const byPhase = ph => (xi?.players || []).filter(p => p.PHASE === ph);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <SEO title="Football — Squad Chemistry"
        description="Which ten outfield players fit together best, by archetype."
        path="/football/lineups" noindex />
      <div className="g-smoke" />

      <div className="relative max-w-5xl w-full mx-auto p-5 flex-1 flex flex-col min-h-0 gap-3">

        {/* ── HEADER DOCK — basketbol tarafındaki 3 bölgeli yapının aynısı:
            solda kimlik, ortada sezon/diziliş kontrolleri, sagda durum. ── */}
        <div className="g-dock shrink-0" style={{ "--accent": ACCENT, "--accent-line": ACCENT + "55" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />

          <div className="g-dock-left">
            <h1 className="g-dock-title">Squad Chemistry</h1>
            <p className="g-dock-sub">Ten outfield players · by role, not rating</p>
          </div>

          <div className="g-dock-center">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <div className="aura-select-wrap">
                <select value={season} onChange={e => setSeason(e.target.value)}
                  className="aura-select accent">
                  {(meta?.seasons || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="aura-select-wrap">
                <select value={shape} onChange={e => setShape(e.target.value)} className="aura-select">
                  {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="g-dock-right">
            <span className="g-status"
              style={{ "--accent": "#E8654C", "--accent-a": "#E8654C1f", "--accent-line": "#E8654C55" }}>
              Infrastructure
            </span>
          </div>
        </div>

        {/* Eski uyari ("henüz kalibre değil") artık YANLIŞ: kimya 28.388 gerçek
            ilk-11'e karşı ölçüldü. Neyin iddia EDİLMEDİĞİ About'ta. */}
        <div className="text-[11px] shrink-0 leading-snug" style={{ color: "var(--text-faint)" }}>
          The goalkeeper sits outside this — his archetype doesn't interact with the
          other ten. Scored against the spread of 28,388 starting elevens clubs actually
          fielded; what that does <i>not</i> claim is in{" "}
          <Link to="/football/about" style={{ color: "#3FB08C" }}>About</Link>.
        </div>

        {/* Lig filtresi + kimya/kalite dengesi. Sezon ve diziliş dock'a taşındı. */}
        <div className="g-panel p-3 shrink-0 flex flex-wrap gap-2 items-center"
          style={{ "--accent": ACCENT, "--accent-line": ACCENT + "3d" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: "8%", top: -40, width: 190, height: 100, opacity: 0.13 }} />
          <span className="g-label shrink-0">Leagues</span>
          {(meta?.leagues || []).map(l => (
            <button key={l} onClick={() => setLeague(league === l ? "" : l)}
              className={`aura-pill-btn${league === l ? " active" : ""}`}>
              {LEAGUE_LABEL[l] || l}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto text-[11px]"
            style={{ color: "var(--text-muted)" }}>
            <span>Chemistry</span>
            <input type="range" min="0" max="1" step="0.05" value={qw}
              onChange={e => setQw(parseFloat(e.target.value))}
              style={{ width: 120 }} />
            <span>Quality</span>
          </div>
        </div>

        {/* Sekmeler — oyun modundaki segmented switcher ile aynı bileşen */}
        <div className="g-seg shrink-0" style={{ "--accent": ACCENT, "--accent-a": ACCENT + "22", "--accent-line": ACCENT + "66" }}>
          {[["xi", "Best XI"], ["custom", "Custom XI"], ["real", "Real XIs"],
            ["pairs", "Pair Affinity"], ["slots", "Role Slots"]]
            .map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`g-seg-btn${tab === k ? " on" : ""}`}>{l}</button>
            ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {tab === "xi" && (
          loading ? (
            <div className="g-panel p-8 text-center text-sm"
              style={{ color: "var(--text-muted)" }}>Searching…</div>
          ) : xi?.error ? (
            <div className="g-panel p-8 text-center text-sm"
              style={{ color: "var(--text-muted)" }}>{xi.error}</div>
          ) : xi ? (
            <div className="flex flex-col gap-3 lg:grid lg:h-full lg:min-h-0
              lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="g-panel p-4 space-y-3 shrink-0 lg:min-h-0 lg:overflow-y-auto">
                  {["fwd", "mid", "def"].map(ph => {
                    const list = byPhase(ph);
                    if (!list.length) return null;
                    return (
                      <div key={ph}>
                        <div className="g-label mb-2"
                          style={{ "--accent": PHASE_COLOR[ph], color: PHASE_COLOR[ph] }}>
                          {PHASE_LABEL[ph]} · {list.length}
                        </div>
                        <div className="grid gap-1"
                          style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
                          {list.map(p => {
                            const q = Math.round(p.overall_score * 100);
                            return (
                              <div key={p.PLAYER_ID} className="g-rr"
                                style={{ "--accent": PHASE_COLOR[ph], "--accent-a": PHASE_COLOR[ph] + "1f",
                                         "--accent-line": PHASE_COLOR[ph] + "4d" }}>
                                <span className="g-rr-pos">{p.POSITION || PHASE_LABEL[ph].slice(0, 2).toUpperCase()}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="g-rr-name truncate">{p.PLAYER_NAME}</div>
                                  <div className="g-rr-meta">
                                    <span className="g-rr-arch" style={{ color: PHASE_COLOR[ph] }}>{p.primary_arch}</span>
                                    <span className="g-rr-chip"
                                      style={{ "--c": "#8b857e", "--c-a": "rgba(255,255,255,.04)", "--c-line": "rgba(255,255,255,.12)" }}>
                                      {p.TEAM}
                                    </span>
                                  </div>
                                </div>
                                <div className="g-bar-track shrink-0" style={{ height: 7, width: 42 }}>
                                  <div className="g-bar-fill" style={{ width: `${q}%`,
                                    "--fill": PHASE_COLOR[ph], "--fill-a": PHASE_COLOR[ph] + "66" }} />
                                </div>
                                <span className="g-rr-val" style={{ color: PHASE_COLOR[ph] }}>{q}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 shrink-0 lg:min-h-0 lg:overflow-y-auto">
                <div className="g-panel p-4 space-y-2.5 shrink-0"
                  style={{ "--accent": ACCENT, "--accent-line": ACCENT + "3d" }}>
                  <span className="aura-blob" style={{ "--slot-color": ACCENT, right: "12%", top: -42, width: 190, height: 105, opacity: 0.18 }} />
                  <div className="g-label">Chemistry</div>
                  <div className="font-logo font-black tabular-nums leading-none"
                    style={{ fontSize: 44, color: ACCENT, textShadow: `0 0 26px ${ACCENT}55` }}>
                    {Math.round((fit?.score ?? 0) * 100)}
                    <span style={{ fontSize: 15, color: "var(--text-faint)" }}> / 100</span>
                  </div>
                  <Bar label="Role slots" value={fit?.slots} />
                  <Bar label="Pair affinity" value={fit?.pairs} />
                  <Bar label="Shape" value={fit?.shape} />
                  <Bar label="Role diversity" value={fit?.diversity} />
                  <div className="text-[11px] pt-1" style={{ color: "var(--text-muted)" }}>
                    Strongest: <b style={{ color: "#3FB08C" }}>{fit?.strongest}</b><br />
                    Weakest: <b style={{ color: "#E8654C" }}>{fit?.weakest}</b>
                  </div>
                  <div className="text-[10.5px] pt-1" style={{ color: "var(--text-faint)" }}>
                    Searched {xi.pool_size?.toLocaleString()} players ·
                    pair values from {fit?.source === "empirical+prior"
                      ? "matches + prior" : "prior only"}
                  </div>
                </div>

              {fit?.slot_scores && (
                <div className="g-panel p-4 space-y-2 shrink-0"
                  style={{ "--accent": ACCENT, "--accent-line": ACCENT + "3d" }}>
                  <span className="aura-blob" style={{ "--slot-color": ACCENT, left: "20%", top: -40, width: 200, height: 100, opacity: 0.12 }} />
                  <div className="g-label">How well each job is covered</div>
                  {Object.entries(fit.slot_scores)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <Bar key={k} label={k} value={v}
                        accent={v >= 0.7 ? "#3FB08C" : v >= 0.5 ? "#F2C14E" : "#E8654C"} />
                    ))}
                </div>
              )}
                </div>
            </div>
          ) : null
        )}

        {tab === "custom" && <FootballCustomXI season={season} />}

        {tab === "real" && <FootballRealXI season={season} />}

        {tab === "pairs" && aff && (
          <div className="g-panel p-4">
            <div className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
              Positive means the two roles worked better together than the two
              squads' quality predicted. Measured pairs come from real matches;
              the rest fall back to a hand-written prior.
            </div>
            <div className="grid gap-1"
              style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
              {aff.pairs.slice(0, 40).map((p, i) => {
                const v = p.empirical ?? p.prior;
                return (
                  <div key={i} className="g-lb-row"
                    style={{ "--accent": v > 0 ? ACCENT : "#E8654C",
                             "--accent-a": (v > 0 ? ACCENT : "#E8654C") + "1f",
                             "--accent-line": (v > 0 ? ACCENT : "#E8654C") + "55" }}>
                    <span className="g-lb-pct" style={{ color: v > 0 ? ACCENT : "#E8654C", width: 44, textAlign: "right" }}>
                      {v > 0 ? "+" : ""}{v.toFixed(2)}
                    </span>
                    <span className="g-lb-name">{p.a} + {p.b}</span>
                    {/* Ölçülmüş mü yoksa öncül mü — basketbol affinity ağındaki
                        kesik-çizgi mantığıyla aynı dürüstlük: kaynak görünür. */}
                    <span className="g-rr-chip shrink-0"
                      style={p.source === "empirical"
                        ? { "--c": ACCENT, "--c-a": ACCENT + "14", "--c-line": ACCENT + "3d" }
                        : { "--c": "#8b857e", "--c-a": "rgba(255,255,255,.04)", "--c-line": "rgba(255,255,255,.14)" }}>
                      {p.source === "empirical" ? "MEASURED" : "PRIOR"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "slots" && aff?.role_slots && (
          <div className="g-panel p-4 space-y-3">
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Eight jobs a team needs done. Several archetypes can do the same
              job in different ways — the number is how well that role serves it.
            </div>
            {Object.entries(aff.role_slots).map(([slot, arch]) => (
              <div key={slot}>
                <div className="text-[11.5px] font-bold" style={{ color: "#3FB08C" }}>
                  {slot}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {Object.entries(arch).sort((a, b) => b[1] - a[1])
                    .map(([a, w]) => `${a} ${w.toFixed(2)}`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
