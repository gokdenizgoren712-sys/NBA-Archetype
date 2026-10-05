import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import FootballPlayerCard from "../../components/FootballPlayerCard";
import PaIcon from "../../components/shell/PaIcon";
import ExploreHeader from "../../components/explore/ExploreHeader";
import { MAP_ANCHORS, placeOnMap } from "../../game/football/mapAnchors";
import { LEAGUE_LABEL } from "../../game/football/leagues";

// ── Futbol arketip haritası (handoff 16a / mobil 21f) — FAZ BAŞINA ──────────
// Basketbolun haritası tek düzlem (herkes aynı 12 boyutla ölçülüyor); futbolda
// kaleciyle santraforun ortak ekseni yok — kullanıcı kararı: dört ayrı harita.
// Arketip çapaları (halka + isim) haritada YOK (kullanıcı kararı, kalabalık);
// bir arketip seçilince yalnızca onun çapası referans olarak beliriyor.
// Görsel dil basketbol haritasıyla aynı (explore.css).

const PHASES = [
  { key: "gk",  label: "Goalkeepers", color: "#F2C14E" },
  { key: "def", label: "Defenders",   color: "#4C9BE8" },
  { key: "mid", label: "Midfielders", color: "#3FB08C" },
  { key: "fwd", label: "Attackers",   color: "#E8654C" },
];
export const FOOTBALL_EXPLORE_TABS = [
  { key: "map",     path: "/football/map",     label: "Map" },
  { key: "compare", path: "/football/compare", label: "Compare" },
];

const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export default function FootballMap() {
  const [meta, setMeta]     = useState(null);
  const [season, setSeason] = useState("");
  const [phase, setPhase]   = useState("mid");
  const [league, setLeague] = useState("");
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover]   = useState(null);
  const [sel, setSel]       = useState(null);
  const [q, setQ]           = useState("");
  const [arch, setArch]     = useState("");

  useEffect(() => {
    api.footballMeta().then(m => {
      setMeta(m);
      if (m?.seasons?.length) setSeason(m.seasons[0]);
    }).catch(() => setMeta({ available: false }));
  }, []);

  // Harita tüm fazı bir arada gösteriyor (sayfalı liste değil) — tek istek, faz başına
  useEffect(() => {
    if (!season) return;
    setLoading(true); setSel(null);
    api.footballPlayers({ season, phase, limit: 800, ...(league ? { league } : {}) })
      .then(r => setRows(r.players || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [season, phase, league]);

  useEffect(() => { setArch(""); }, [phase]);

  const cfg = MAP_ANCHORS[phase];
  const archOptions = Object.keys(cfg?.points || {});
  const archPoint = arch ? cfg?.points?.[arch] : null;
  const accent = PHASES.find(p => p.key === phase)?.color || "#3FB08C";

  const dots = useMemo(() => rows.map(p => {
    const pt = placeOnMap(p, phase);
    return pt ? { ...p, ...pt } : null;
  }).filter(Boolean), [rows, phase]);

  const qq = q.trim().toLowerCase();
  useEffect(() => {
    if (!qq) return;
    const hits = dots.filter(p => p.PLAYER_NAME.toLowerCase().includes(qq));
    if (hits.length === 1) setSel(hits[0]);
  }, [qq, dots]);

  // En yakınlar: bu fazın arketip skorlarında merkezlenmiş kosinüs
  const nearest = useMemo(() => {
    if (!sel || !archOptions.length) return [];
    const vec = (p) => {
      const v = archOptions.map(a => Number(p[`score_${a}`] ?? 0));
      const m = v.reduce((x, y) => x + y, 0) / v.length;
      return v.map(x => x - m);
    };
    const sv = vec(sel);
    return dots.filter(p => p.PLAYER_ID !== sel.PLAYER_ID)
      .map(p => ({ p, s: cosine(sv, vec(p)) }))
      .sort((a, b) => b.s - a.s).slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dots, phase]);

  // Kutu ölçüsü layout-effect ile (ResizeObserver ilk boyamada geç kalabiliyor)
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 760, h: 560 });
  useLayoutEffect(() => {
    const measure = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w > 40 && h > 40) setBox(b => (b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [meta, loading, phase, arch, league]);

  const W = box.w, H = box.h;
  const PAD = Math.max(28, Math.min(48, Math.round(H * 0.08)));
  const sx = v => PAD + v * (W - PAD * 2);
  const sy = v => PAD + v * (H - PAD * 2);
  const count = arch ? dots.filter(d => d.primary_arch === arch).length : dots.length;

  return (
    <div className="ex-page fill">
      <SEO title="Football — Archetype Map"
        description="Every player placed by role. Nearby players play the same way."
        path="/football/map" noindex />
      <div className="ex-inner">
        <ExploreHeader active="map" tabs={FOOTBALL_EXPLORE_TABS} aside={
          <>
            <label className="ex-search" style={{ "--tint": accent }}>
              <PaIcon name="search" size={16} color="var(--text-muted)" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search player" aria-label="Search player" />
            </label>
            <span className="ex-count">
              {loading ? "Loading…" : `${count.toLocaleString("en-US")} ${arch || "players"} · ${season}`}
            </span>
          </>
        } />

        {/* Faz lejantı: hangi haritanın açık olduğunu seçer (renk = faz) */}
        <div className="ex-legend fb-map-phases" role="radiogroup" aria-label="Phase">
          {PHASES.map(p => (
            <button key={p.key} role="radio" aria-checked={phase === p.key}
              className={`ex-chip${phase === p.key ? " on" : ""}`} style={{ "--c": p.color }}
              onClick={() => setPhase(p.key)}>
              <i />{p.label}
            </button>
          ))}
          <span className="fb-map-sep" />
          {(meta?.leagues || []).map(l => (
            <button key={l} className={`ex-chip plain${league === l ? " on" : ""}`} style={{ "--c": "#f2efea" }}
              onClick={() => setLeague(league === l ? "" : l)}>{LEAGUE_LABEL[l] || l}</button>
          ))}
        </div>
        {/* Bu fazın arketipleri: seçilince yalnız o roldekiler renkli kalır */}
        <div className="ex-legend fb-map-archs" role="radiogroup" aria-label="Archetype">
          {archOptions.map(a => (
            <button key={a} role="radio" aria-checked={arch === a}
              className={`ex-chip small${arch === a ? " on" : ""}`} style={{ "--c": accent }}
              onClick={() => setArch(x => (x === a ? "" : a))}>{a}</button>
          ))}
        </div>

        <div className="ex-map-grid">
          <div ref={wrapRef} className="ex-map">
            <span className="ex-axis top">↑ {cfg?.axes.y[0]}</span>
            <span className="ex-axis bottom">↓ {cfg?.axes.y[1]}</span>
            <span className="ex-axis left">← {cfg?.axes.x[0]}</span>
            <span className="ex-axis right">{cfg?.axes.x[1]} →</span>
            {!loading && (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                <line x1={W / 2} y1={PAD / 2} x2={W / 2} y2={H - PAD / 2} stroke="rgba(255,255,255,.07)" />
                <line x1={PAD / 2} y1={H / 2} x2={W - PAD / 2} y2={H / 2} stroke="rgba(255,255,255,.07)" />
                {archPoint && (
                  <g>
                    <circle cx={sx(archPoint.x)} cy={sy(archPoint.y)} r="9" fill="none" stroke={accent}
                      strokeWidth="1.4" opacity="0.8" strokeDasharray="3 3" />
                    <text x={sx(archPoint.x)} y={sy(archPoint.y) - 15} fontSize="12" textAnchor="middle"
                      fill={accent} style={{ fontWeight: 700, paintOrder: "stroke", stroke: "#0b0b0b", strokeWidth: 3 }}>{arch}</text>
                  </g>
                )}
                {dots.map(p => {
                  const match = !qq || p.PLAYER_NAME.toLowerCase().includes(qq);
                  const inArch = !arch || p.primary_arch === arch;
                  const isSel = sel?.PLAYER_ID === p.PLAYER_ID;
                  const isHover = hover?.PLAYER_ID === p.PLAYER_ID;
                  const dimmed = (qq && !match) || !inArch;
                  const lit = isSel || isHover || (qq && match) || (arch && inArch);
                  return (
                    <g key={`${p.PLAYER_ID}-${p.PHASE}-${p.LEAGUE}`} opacity={dimmed ? 0.08 : 1}
                      style={{ cursor: dimmed ? "default" : "pointer", transition: "opacity .3s" }}
                      onMouseEnter={() => !dimmed && setHover(p)} onMouseLeave={() => setHover(null)}
                      onClick={() => !dimmed && setSel(isSel ? null : p)}>
                      {isSel && <circle cx={sx(p.x)} cy={sy(p.y)} r="11" fill="none" stroke="#f2efea" strokeWidth="2"
                        style={{ filter: `drop-shadow(0 0 8px ${accent})` }} />}
                      <circle cx={sx(p.x)} cy={sy(p.y)} r={isSel ? 5 : lit ? 4.6 : 3.6}
                        fill={accent} fillOpacity={lit ? 1 : 0.7} style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }} />
                      {(isSel || isHover || (qq && match)) && (
                        <text x={sx(p.x) + 14} y={sy(p.y) + 4} fontSize="12" fontWeight="600" fill="#f2efea"
                          style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "#0b0b0b", strokeWidth: 3 }}>{p.PLAYER_NAME}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
            {hover && hover.PLAYER_ID !== sel?.PLAYER_ID && (
              <div className="ex-tip">
                <b>{hover.PLAYER_NAME}</b>
                <span><span style={{ color: accent }}>{hover.primary_arch}</span> · {hover.TEAM} · {hover.POSITION}
                  {` · Overall ${Math.round((hover.overall_score || 0) * 100)}`}</span>
              </div>
            )}
          </div>

          <aside className="ex-side">
            {sel ? (
              <>
                <span className="lbl">Selected</span>
                <FootballPlayerCard player={sel} season={season} />
                {nearest.length > 0 && (
                  <p className="ex-muted fb-near">
                    Nearest: {nearest.map(({ p }, i) => (
                      <span key={p.PLAYER_ID}>{i > 0 && ", "}<button onClick={() => setSel(p)}>{p.PLAYER_NAME}</button></span>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <div className="ex-empty-side">
                <b>Pick a player</b>
                <p className="ex-muted">Click any dot, or search a name. Each phase has its own map: a player sits at the weighted average of the roles he matches.</p>
              </div>
            )}
          </aside>
        </div>
        <p className="ex-muted fb-map-note">
          Keepers and strikers share no axis, so every phase gets its own map. Role anchors are laid out by hand for readability, not a measured embedding.
        </p>
      </div>

      {sel && (
        <div className="ex-msel" style={{ "--c": accent }}>
          <span className="av">{initials(sel.PLAYER_NAME)}</span>
          <span className="tx">
            <b>{sel.PLAYER_NAME}</b>
            <span><em>{sel.primary_arch}</em> · {sel.TEAM}</span>
          </span>
          <span className="ov">{Math.round((sel.overall_score || 0) * 100)}</span>
        </div>
      )}
    </div>
  );
}
