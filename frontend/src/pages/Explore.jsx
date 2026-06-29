import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import ScoreBar from "../components/ScoreBar";
import SplitPane from "../components/SplitPane";

const ARCH_COLORS = {
  Engine:       "#fb923c",
  Ecosystem:    "#f59e0b",
  Hub:          "#34d399",
  Connector:    "#38bdf8",
  Creator:      "#a78bfa",
  Anchor:       "#60a5fa",
  Spacer:       "#6ee7b7",
  Finisher:     "#f472b6",
  Force:        "#ef4444",
  Initiator:    "#facc15",
  Stopper:      "#94a3b8",
  "Rim Runner": "#4ade80",
};

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer",
              "Finisher","Force","Initiator","Stopper","Rim Runner"];

const ARCH_ANCHORS = {
  Ecosystem:    { x: 0.75, y: 0.90 },
  Creator:      { x: 0.88, y: 0.80 },
  Engine:       { x: 0.82, y: 0.68 },
  Initiator:    { x: 0.68, y: 0.74 },
  Connector:    { x: 0.58, y: 0.60 },
  Hub:          { x: 0.62, y: 0.36 },
  Force:        { x: 0.45, y: 0.42 },
  Finisher:     { x: 0.30, y: 0.52 },
  Anchor:       { x: 0.22, y: 0.22 },
  "Rim Runner": { x: 0.12, y: 0.30 },
  Stopper:      { x: 0.28, y: 0.74 },
  Spacer:       { x: 0.10, y: 0.82 },
};

const INFO = {
  en: {
    xLeft: "Off-ball specialist", xRight: "Ball-dominant / Creator",
    yBottom: "Interior / Big",    yTop: "Perimeter / Wing",
    tip: "Each dot is a player positioned by their 12-dimensional archetype score vector. Nearby players share similar role profiles. Click a dot to inspect, scroll/pinch to zoom.",
  },
  tr: {
    xLeft: "Off-ball / Rol oyuncusu", xRight: "Topla dominant / Yaratıcı",
    yBottom: "İç saha / Büyük",       yTop: "Dış hat / Kanat",
    tip: "Her nokta bir oyuncu; 12 arketip skoru ağırlıklı ortalamayla konumlandırılır. Yakın oyuncular benzer rolleri paylaşır. Tıkla detayı gör, kaydır/sıkıştır zoom yap.",
  },
};

function playerPos(player) {
  const primary = player.primary_arch;
  const pAnchor = ARCH_ANCHORS[primary] || { x: 0.5, y: 0.5 };
  let wx = 0, wy = 0, wt = 0;
  for (const [arch, pos] of Object.entries(ARCH_ANCHORS)) {
    if (arch === primary) continue;
    const s = Math.max(0, parseFloat(player[`score_${arch}`] ?? 0));
    const w = s * s * s * s;
    if (w > 0) { wx += w * pos.x; wy += w * pos.y; wt += w; }
  }
  const secX = wt > 0 ? wx / wt : pAnchor.x;
  const secY = wt > 0 ? wy / wt : pAnchor.y;
  let x = 0.75 * pAnchor.x + 0.25 * secX;
  let y = 0.75 * pAnchor.y + 0.25 * secY;
  const hash = (player.PLAYER_NAME || "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0);
  x += ((hash & 0xff) / 255 - 0.5) * 0.025;
  y += ((hash >> 8) / 255 - 0.5) * 0.025;
  return { x: Math.max(0.02, Math.min(0.98, x)), y: Math.max(0.02, Math.min(0.98, y)) };
}

/* ── Player detail panel ─────────────────────────────────────────── */
function PlayerDetail({ player }) {
  if (!player) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-4xl mb-3 opacity-10">◎</div>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Click a dot on the map</div>
      </div>
    </div>
  );

  const archColor = ARCH_COLORS[player.primary_arch] || "var(--accent)";
  const overall = player.overall_score != null ? Math.round(player.overall_score * 100) : null;

  const scores = CORE.map(c => ({
    arch: c,
    val: parseFloat(player[`score_${c}`] || 0),
  })).sort((a, b) => b.val - a.val);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
          {player.PLAYER_NAME}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {player.TEAM_ABBREVIATION} · {player.POSITION}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-sm font-semibold px-2 py-0.5 rounded"
            style={{ color: archColor, border: `1px solid ${archColor}50`, background: `${archColor}15` }}>
            {player.primary_arch}
          </span>
          {overall != null && (
            <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{overall}</span>
          )}
        </div>
      </div>

      {/* Secondary archetypes */}
      <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        Archetype Scores
      </div>
      <div className="space-y-1">
        {scores.map(({ arch, val }) => (
          <ScoreBar key={arch} label={arch} value={val}
            highlight={arch === player.primary_arch} />
        ))}
      </div>

      {/* Modifier tags */}
      {(() => {
        const tags = CORE.filter(c => c !== player.primary_arch && parseFloat(player[`score_${c}`] || 0) >= 0.70);
        if (!tags.length) return null;
        return (
          <div className="mt-4">
            <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Secondary Strengths
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.sort((a, b) => parseFloat(player[`score_${b}`]) - parseFloat(player[`score_${a}`])).map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded font-medium"
                  style={{ color: ARCH_COLORS[c], border: `1px solid ${ARCH_COLORS[c]}40`, background: `${ARCH_COLORS[c]}15` }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function Explore() {
  const { lang } = useLang();
  const info = INFO[lang] || INFO.en;

  const [players, setPlayers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hover, setHover]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState("");
  const [searchQ, setSearchQ]   = useState("");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const touchRef        = useRef({});
  const resetView       = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const onWheel = useCallback(e => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  }, []);

  const onTouchStart = useCallback(e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = { startDist: Math.sqrt(dx*dx+dy*dy), startZoom: zoom };
    } else if (e.touches.length === 1) {
      touchRef.current = { startPan: { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y } };
    }
  }, [zoom, pan]);

  const onTouchMove = useCallback(e => {
    e.preventDefault();
    if (e.touches.length === 2 && touchRef.current.startDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setZoom(Math.max(0.5, Math.min(8, touchRef.current.startZoom * (Math.sqrt(dx*dx+dy*dy) / touchRef.current.startDist))));
    } else if (e.touches.length === 1 && touchRef.current.startPan) {
      setPan({ x: e.touches[0].clientX - touchRef.current.startPan.x, y: e.touches[0].clientY - touchRef.current.startPan.y });
    }
  }, []);

  const onTouchEnd = useCallback(() => { touchRef.current = {}; }, []);

  useEffect(() => {
    api.players({ limit: 500, sort_by: "overall_score" }).then(d => {
      setPlayers(d.players || []);
      setLoading(false);
    });
  }, []);

  const W = 720, H = 520, PAD = 56;
  const toSvgX = x => PAD + x * (W - PAD * 2);
  const toSvgY = y => H - PAD - y * (H - PAD * 2);

  const projected = useMemo(() => players.map(p => ({ ...p, ...playerPos(p) })), [players]);

  const filtered = useMemo(() =>
    projected.filter(p => {
      if (filter && p.primary_arch !== filter) return false;
      if (searchQ && !p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    })
  , [projected, filter, searchQ]);

  return (
    <SplitPane
      detail={<PlayerDetail player={selected} />}
      onClose={() => setSelected(null)}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 shrink-0 border-b"
          style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>

          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder={lang === "tr" ? "Oyuncu ara..." : "Search player..."}
            className="rounded px-3 py-1.5 text-sm focus:outline-none w-40"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />

          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="rounded px-3 py-1.5 text-sm focus:outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <option value="">{lang === "tr" ? "Tüm arketipler" : "All archetypes"}</option>
            {CORE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button onClick={resetView}
              className="px-2 py-1.5 rounded text-xs transition-colors"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              {lang === "tr" ? "Sıfırla" : "Reset view"}
            </button>
          )}

          <span className="ml-auto text-xs" style={{ color: "var(--text-faint)" }}>
            {filtered.length} players
          </span>
        </div>

        {/* Map */}
        <div className="flex-1 overflow-hidden relative">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
              Loading...
            </div>
          ) : (
            <div className="w-full h-full touch-none overflow-hidden"
              onWheel={onWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
                style={{
                  display: "block",
                  transform: `scale(${zoom}) translate(${pan.x/zoom}px,${pan.y/zoom}px)`,
                  transformOrigin: "center center",
                  transition: "transform 0.05s ease",
                }}>

                {/* Grid */}
                {[0.25, 0.5, 0.75].map(v => (
                  <g key={v}>
                    <line x1={toSvgX(v)} y1={PAD} x2={toSvgX(v)} y2={H-PAD}
                      stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4"/>
                    <line x1={PAD} y1={toSvgY(v)} x2={W-PAD} y2={toSvgY(v)}
                      stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4"/>
                  </g>
                ))}

                {/* Axes */}
                <line x1={PAD} y1={H/2} x2={W-PAD} y2={H/2} stroke="var(--bg-elevated)" strokeWidth={1}/>
                <line x1={W/2} y1={PAD} x2={W/2} y2={H-PAD} stroke="var(--bg-elevated)" strokeWidth={1}/>

                {/* Axis labels */}
                <text x={PAD+4} y={H/2-6} fill="var(--text-faint)" fontSize={9}>← {info.xLeft}</text>
                <text x={W-PAD-4} y={H/2-6} fill="var(--text-faint)" fontSize={9} textAnchor="end">{info.xRight} →</text>
                <text x={W/2+6} y={PAD+12} fill="var(--text-faint)" fontSize={9}>{info.yTop}</text>
                <text x={W/2+6} y={H-PAD-6} fill="var(--text-faint)" fontSize={9}>{info.yBottom}</text>

                {/* Archetype anchor labels */}
                {Object.entries(ARCH_ANCHORS)
                  .filter(([a]) => !filter || a === filter)
                  .map(([arch, pos]) => (
                    <text key={arch} x={toSvgX(pos.x)} y={toSvgY(pos.y) - 28}
                      fill={ARCH_COLORS[arch]} fontSize={10} fontWeight={600} textAnchor="middle"
                      style={{ pointerEvents: "none", letterSpacing: "0.02em" }}>
                      {arch}
                    </text>
                  ))}

                {/* Player dots */}
                {filtered.map((p, i) => {
                  const cx = toSvgX(p.x), cy = toSvgY(p.y);
                  const col = ARCH_COLORS[p.primary_arch] || "#94a3b8";
                  const isHover    = hover?.PLAYER_NAME === p.PLAYER_NAME;
                  const isSelected = selected?.PLAYER_NAME === p.PLAYER_NAME;
                  const isSearch   = searchQ && p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase());
                  const highlight  = isHover || isSelected || isSearch;
                  return (
                    <g key={i} style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHover(p)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setSelected(p === selected ? null : p)}
                    >
                      <circle cx={cx} cy={cy}
                        r={isSelected ? 7 : isHover ? 5.5 : 3.5}
                        fill={col}
                        fillOpacity={highlight ? 1 : 0.55}
                        stroke={isSelected ? "#fff" : isHover ? col : "none"}
                        strokeWidth={isSelected ? 2 : 1.5}
                        strokeOpacity={0.8}
                      />
                      {highlight && (
                        <text x={cx+9} y={cy+4} fill="var(--text-primary)" fontSize={10}
                          fontWeight={isSelected ? 700 : 400}
                          style={{ pointerEvents: "none" }}>
                          {p.PLAYER_NAME}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Hover tooltip (bottom-left of map) */}
              {hover && hover.PLAYER_NAME !== selected?.PLAYER_NAME && (
                <div className="absolute left-4 bottom-4 px-3 py-2 rounded text-xs pointer-events-none"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{hover.PLAYER_NAME}</div>
                  <div style={{ color: "var(--text-muted)" }}>{hover.TEAM_ABBREVIATION} · {hover.POSITION}</div>
                  <div className="font-medium mt-0.5" style={{ color: ARCH_COLORS[hover.primary_arch] || "var(--accent)" }}>
                    {hover.primary_arch}
                  </div>
                  {hover.overall_score != null && (
                    <div style={{ color: "var(--accent)" }}>Overall: {Math.round(hover.overall_score * 100)}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t shrink-0"
          style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
          {Object.entries(ARCH_COLORS).map(([arch, col]) => (
            <button key={arch} onClick={() => setFilter(filter === arch ? "" : arch)}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors"
              style={{
                background: filter === arch ? `${col}20` : "transparent",
                color: filter === arch ? col : "var(--text-muted)",
                border: `1px solid ${filter === arch ? `${col}60` : "transparent"}`,
              }}>
              <span style={{ background: col, width: 6, height: 6, borderRadius: "50%", display: "inline-block" }}/>
              {arch}
            </button>
          ))}
        </div>
      </div>
    </SplitPane>
  );
}
