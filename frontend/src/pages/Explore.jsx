/**
 * Explore — Semantic Archetype Map
 * Her arketip 2D uzayda anlamlı bir konuma sabitlenir.
 * Oyuncular kendi 12 arketip skorlarının ağırlıklı ortalamasıyla konumlanır.
 * X: Off-ball ← → Ball-dominant/Creator
 * Y: Interior/Big ↓ ↑ Perimeter/Wing
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";

const ARCH_COLORS = {
  Engine:       "#818cf8",
  Ecosystem:    "#f59e0b",
  Hub:          "#34d399",
  Connector:    "#38bdf8",
  Creator:      "#a78bfa",
  Anchor:       "#fb923c",
  Spacer:       "#6ee7b7",
  Finisher:     "#f472b6",
  Force:        "#ef4444",
  Initiator:    "#facc15",
  Stopper:      "#94a3b8",
  "Rim Runner": "#4ade80",
};

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer",
              "Finisher","Force","Initiator","Stopper","Rim Runner"];

/**
 * Arketiplerin sabit semantik konumları (0–1 arası normalize).
 * X: topu kullanma / yaratıcılık  (0=saf off-ball, 1=dominant ball-handler)
 * Y: lokasyon / fiziksel profil   (0=iç saha büyük, 1=dış hat kanat)
 */
const ARCH_ANCHORS = {
  Ecosystem:    { x: 0.75, y: 0.90 },  // Jokić/Magic: supreme creator+scorer, perimeter stretch
  Creator:      { x: 0.88, y: 0.80 },  // Nash/CP3: pure playmaker, perimeter
  Engine:       { x: 0.82, y: 0.68 },  // Jordan/Luka: primary scorer, ball dominant
  Initiator:    { x: 0.68, y: 0.74 },  // secondary handler/facilitator
  Connector:    { x: 0.58, y: 0.60 },  // Draymond/LeBron-facilitator: versatile glue
  Hub:          { x: 0.62, y: 0.36 },  // KAT/Jokić early: playmaking big
  Force:        { x: 0.45, y: 0.42 },  // Giannis/KG: physical wing-big scorer
  Finisher:     { x: 0.30, y: 0.52 },  // athletic finisher, off-ball
  Anchor:       { x: 0.22, y: 0.22 },  // Embiid/Wemby: rim protector, interior
  "Rim Runner": { x: 0.12, y: 0.30 },  // Gobert: lob catcher, pure interior
  Stopper:      { x: 0.28, y: 0.74 },  // Kawhi/Batum: perimeter defender
  Spacer:       { x: 0.10, y: 0.82 },  // sharpshooter: perimeter, off-ball
};

const INFO = {
  en: {
    title: "Archetype Map",
    subtitle: "How to read",
    xLeft: "Off-ball specialist",
    xRight: "Ball-dominant / Creator",
    yBottom: "Interior / Big",
    yTop: "Perimeter / Wing",
    tip: "Each dot is a player. Position is driven by their 12-dimensional archetype score vector, reduced to 2D — dots cluster naturally without manual placement. Nearby players share similar role profiles. Hover to inspect, click a legend label to filter by archetype.",
  },
  tr: {
    title: "Arketip Haritası",
    subtitle: "Nasıl okunur",
    xLeft: "Off-ball / Rol oyuncusu",
    xRight: "Topla dominant / Yaratıcı",
    yBottom: "İç saha / Büyük",
    yTop: "Dış hat / Kanat",
    tip: "Her nokta bir oyuncu; 12 arketip skoru ağırlıklı ortalamayla konumlandırılır. Bir arketip etiketine yakın oyuncular o profili paylaşır. Hover ile detay gör, legend'a tıklayarak filtrele.",
  },
};

// Oyuncunun primary_arch anchor'ına 75% yapış, secondary arklar ^4 güçle 25% kaydırır.
// Bu sayede Ecosystem oyuncular top-right'ta kalır ama Connector/Hub skoru onları biraz aşağı çeker.
function playerPos(player) {
  const primary = player.primary_arch;
  const pAnchor = ARCH_ANCHORS[primary] || { x: 0.5, y: 0.5 };

  // Secondary: primary dışındaki arklerin ^4 ağırlıklı merkezi
  let wx = 0, wy = 0, wt = 0;
  for (const [arch, pos] of Object.entries(ARCH_ANCHORS)) {
    if (arch === primary) continue;
    const s = Math.max(0, parseFloat(player[`score_${arch}`] ?? 0));
    const w = s * s * s * s;  // ^4: küçük farkları bastırır, büyük farkları vurgular
    if (w > 0) { wx += w * pos.x; wy += w * pos.y; wt += w; }
  }
  const secX = wt > 0 ? wx / wt : pAnchor.x;
  const secY = wt > 0 ? wy / wt : pAnchor.y;

  // 75% primary anchor, 25% secondary pull
  let x = 0.75 * pAnchor.x + 0.25 * secX;
  let y = 0.75 * pAnchor.y + 0.25 * secY;

  // Deterministik küçük jitter: üst üste binen oyuncular yayılsın
  const hash = (player.PLAYER_NAME || "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0);
  x += ((hash & 0xff) / 255 - 0.5) * 0.025;
  y += ((hash >> 8) / 255 - 0.5) * 0.025;

  return { x: Math.max(0.02, Math.min(0.98, x)), y: Math.max(0.02, Math.min(0.98, y)) };
}

export default function Explore() {
  const { lang } = useLang();
  const info = INFO[lang] || INFO.en;

  const [players, setPlayers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hover, setHover]       = useState(null);
  const [filter, setFilter]     = useState("");
  const [searchQ, setSearchQ]   = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const svgRef = useRef(null);

  // Zoom & pan
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
  const toSvgY = y => H - PAD - y * (H - PAD * 2);  // flip Y (0=bottom, 1=top)

  const projected = useMemo(() =>
    players.map(p => ({ ...p, ...playerPos(p) }))
  , [players]);

  const filtered = useMemo(() =>
    projected.filter(p => {
      if (filter && p.primary_arch !== filter) return false;
      if (searchQ && !p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    })
  , [projected, filter, searchQ]);

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-white font-bold text-lg">{info.title}</h2>
          <input
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder={lang === "tr" ? "Oyuncu ara..." : "Search player..."}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 w-44"
          />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">{lang === "tr" ? "Tüm arketipler" : "All archetypes"}</option>
            {CORE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={() => setShowInfo(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs transition-colors shrink-0 ${
            showInfo ? "border-violet-500 text-violet-300 bg-violet-900/20"
                     : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"}`}
        >
          <span className="text-base leading-none">ⓘ</span>
          {info.subtitle}
        </button>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="bg-slate-900 border border-violet-700/30 rounded-xl p-4 max-w-2xl space-y-2">
          <p className="text-slate-300 text-sm">{info.tip}</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 border-t border-slate-800 pt-2">
            <div><span className="text-violet-400">X sol</span> — {info.xLeft}</div>
            <div><span className="text-violet-400">X sağ</span> — {info.xRight}</div>
            <div><span className="text-violet-400">Y alt</span> — {info.yBottom}</div>
            <div><span className="text-violet-400">Y üst</span> — {info.yTop}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-20">Loading...</div>
      ) : (
        <div
          className="relative bg-slate-900 rounded-xl border border-slate-800 overflow-hidden touch-none"
          style={{ width: W, maxWidth: "100%" }}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button onClick={resetView}
              className="absolute top-2 right-2 z-10 text-[10px] px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-400 hover:text-white">
              {lang === "tr" ? "Sıfırla" : "Reset"}
            </button>
          )}

          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H}
            style={{ display: "block", maxWidth: "100%",
              transform: `scale(${zoom}) translate(${pan.x/zoom}px,${pan.y/zoom}px)`,
              transformOrigin: "center center", transition: "transform 0.05s ease" }}>

            {/* Grid lines (subtle) */}
            {[0.25, 0.5, 0.75].map(v => (
              <g key={v}>
                <line x1={toSvgX(v)} y1={PAD} x2={toSvgX(v)} y2={H-PAD} stroke="#1e293b" strokeWidth={1} strokeDasharray="4 4"/>
                <line x1={PAD} y1={toSvgY(v)} x2={W-PAD} y2={toSvgY(v)} stroke="#1e293b" strokeWidth={1} strokeDasharray="4 4"/>
              </g>
            ))}

            {/* Axis lines */}
            <line x1={PAD} y1={H/2} x2={W-PAD} y2={H/2} stroke="#334155" strokeWidth={1}/>
            <line x1={W/2} y1={PAD} x2={W/2} y2={H-PAD} stroke="#334155" strokeWidth={1}/>

            {/* Axis labels */}
            <text x={PAD+4} y={H/2-6} fill="#475569" fontSize={9} textAnchor="start">← {info.xLeft}</text>
            <text x={W-PAD-4} y={H/2-6} fill="#475569" fontSize={9} textAnchor="end">{info.xRight} →</text>
            <text x={W/2+6} y={PAD+12} fill="#475569" fontSize={9}>{info.yTop}</text>
            <text x={W/2+6} y={H-PAD-6} fill="#475569" fontSize={9}>{info.yBottom}</text>

            {/* Archetype anchor labels (background, fixed) */}
            {(!filter ? Object.entries(ARCH_ANCHORS) : Object.entries(ARCH_ANCHORS).filter(([a]) => a === filter)).map(([arch, pos]) => {
              const cx = toSvgX(pos.x), cy = toSvgY(pos.y);
              const col = ARCH_COLORS[arch] || "#94a3b8";
              return (
                <g key={arch}>
                  {/* Label */}
                  <text x={cx} y={cy - 32} fill={col} fontSize={10} fontWeight={600} textAnchor="middle"
                    style={{ pointerEvents: "none", letterSpacing: "0.02em" }}>
                    {arch}
                  </text>
                </g>
              );
            })}

            {/* Player dots */}
            {filtered.map((p, i) => {
              const cx = toSvgX(p.x), cy = toSvgY(p.y);
              const col = ARCH_COLORS[p.primary_arch] || "#94a3b8";
              const isHover  = hover?.PLAYER_NAME === p.PLAYER_NAME;
              const isSearch = searchQ && p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase());
              return (
                <g key={i} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}>
                  <circle cx={cx} cy={cy} r={isHover ? 6 : 4}
                    fill={col} fillOpacity={isHover || isSearch ? 1 : 0.70}
                    stroke={isHover ? "#fff" : isSearch ? "#fff" : col}
                    strokeWidth={isHover ? 1.5 : 0.5} strokeOpacity={0.5}
                  />
                  {(isHover || isSearch) && (
                    <text x={cx+8} y={cy+4} fill="#e2e8f0" fontSize={10}
                      style={{ pointerEvents: "none", fontWeight: isSearch ? 700 : 400 }}>
                      {p.PLAYER_NAME}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hover && (
            <div className="absolute left-4 bottom-4 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs pointer-events-none">
              <div className="text-white font-semibold">{hover.PLAYER_NAME}</div>
              <div className="text-slate-400">{hover.TEAM_ABBREVIATION} · {hover.POSITION}</div>
              <div style={{ color: ARCH_COLORS[hover.primary_arch] || "#94a3b8" }} className="font-medium mt-0.5">
                {hover.primary_arch}
              </div>
              {hover.overall_score != null && (
                <div className="text-slate-500 mt-0.5">Overall: {Math.round(hover.overall_score * 100)}</div>
              )}
              {/* Top-2 secondary scores */}
              <div className="mt-1 flex flex-wrap gap-1">
                {CORE.filter(c => c !== hover.primary_arch)
                  .map(c => ({ arch: c, s: parseFloat(hover[`score_${c}`] || 0) }))
                  .filter(({ s }) => s > 0.70)
                  .sort((a,b) => b.s - a.s)
                  .slice(0, 2)
                  .map(({ arch, s }) => (
                    <span key={arch} className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: (ARCH_COLORS[arch] || "#94a3b8") + "22", color: ARCH_COLORS[arch] || "#94a3b8" }}>
                      {arch} {Math.round(s * 100)}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-1 items-center">
        {filter && (
          <button onClick={() => setFilter("")}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-600 text-slate-400 hover:text-white transition-colors">
            {lang === "tr" ? "× Filtreyi kaldır" : "× Clear filter"}
          </button>
        )}
        {Object.entries(ARCH_COLORS).map(([arch, col]) => (
          <button key={arch} onClick={() => setFilter(filter === arch ? "" : arch)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
              filter === arch ? "border-white/30 bg-white/10 text-white"
                             : "border-transparent text-slate-400 hover:text-white"}`}>
            <span style={{ background: col, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }}/>
            {arch}
          </button>
        ))}
      </div>
    </div>
  );
}
