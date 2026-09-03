import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import ScoreBar from "../components/ScoreBar";
import SplitPane from "../components/SplitPane";
import { Logo } from "../components/BrandIcons";
import { ARCHETYPE_COLOR as ARCH_COLORS } from "../constants/archetypeColors";

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
        <div className="flex justify-center mb-3 opacity-10"><Logo size={44} /></div>
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
      <div className="mb-4 pb-4">
        <div className="font-logo font-bold text-base" style={{ color: "var(--text-primary)" }}>
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
            <span className="font-logo text-2xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>{overall}</span>
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
export default function ExploreContent() {
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
  const mapWrapRef      = useRef(null);
  const [camAnimating, setCamAnimating] = useState(false);
  const camTimerRef     = useRef(null);
  // focusMode: sadece filtrelenen arketipin oyuncuları, kendi bağımsız
  // (yeniden ölçeklenmiş) düzeninde gösteriliyor — aralarındaki gerçek
  // boşluğu görmek için tüm alanı kullanır. Aynı x/y ekseni ANLAMI korunur,
  // sadece o alt-kümenin min-max aralığına yeniden ölçeklenir.
  const [focusMode, setFocusMode] = useState(false);
  const focusTimerRef = useRef(null);
  const flyTo = useCallback((nextZoom, nextPan) => {
    clearTimeout(camTimerRef.current);
    setCamAnimating(true);
    setZoom(nextZoom);
    setPan(nextPan);
    camTimerRef.current = setTimeout(() => setCamAnimating(false), 700);
  }, []);
  const resetView = useCallback(() => flyTo(1, { x: 0, y: 0 }), [flyTo]);

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

  // Filtre değişince: (1) kamerayı hedef kümenin üstüne uçur (eski global
  // koordinatlarla — "o kümeye doğru" swoop hissi), (2) varış anında bağımsız
  // yeniden-ölçeklenmiş düzene geç ve kamerayı 1x'e sıfırla (artık zaten
  // tüm alanı dolduruyor) — iki aşamalı "yakınlaş, sonra genişle" hareketi.
  useEffect(() => {
    const wrap = mapWrapRef.current;
    clearTimeout(focusTimerRef.current);
    if (!wrap || !projected.length) return;

    if (!filter) {
      setFocusMode(false);
      if (zoom !== 1 || pan.x !== 0 || pan.y !== 0) flyTo(1, { x: 0, y: 0 });
      return;
    }

    setFocusMode(false);
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pxPerUnit = Math.min(rect.width / W, rect.height / H);

    const matches = projected.filter(p => p.primary_arch === filter);
    const anchor = ARCH_ANCHORS[filter];
    const pts = matches.length ? matches.map(p => ({ x: toSvgX(p.x), y: toSvgY(p.y) }))
      : anchor ? [{ x: toSvgX(anchor.x), y: toSvgY(anchor.y) }] : [];
    if (!pts.length) return;

    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 70);
    const spanY = Math.max(maxY - minY, 70);
    const spanPxX = spanX * pxPerUnit, spanPxY = spanY * pxPerUnit;

    const fitZoom = Math.max(1.4, Math.min(6, Math.min((rect.width * 0.55) / spanPxX, (rect.height * 0.55) / spanPxY)));
    flyTo(fitZoom, { x: -(cx - W / 2) * pxPerUnit, y: -(cy - H / 2) * pxPerUnit });

    focusTimerRef.current = setTimeout(() => {
      setFocusMode(true);
      flyTo(1, { x: 0, y: 0 });
    }, 680);

    return () => clearTimeout(focusTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, projected.length]);

  // Focus modundaki bağımsız grafik: sadece filtrelenen arketipin oyuncuları,
  // kendi min-max aralığına yeniden ölçeklenmiş (aynı eksen anlamı, dolu alan).
  const focusPositions = useMemo(() => {
    if (!filter) return null;
    const matches = projected.filter(p => p.primary_arch === filter);
    if (matches.length < 2) return null;
    const xs = matches.map(p => p.x), ys = matches.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 0.02), spanY = Math.max(maxY - minY, 0.02);
    const pad = 0.12;
    const map = new Map();
    for (const p of matches) {
      map.set(p.PLAYER_NAME, {
        x: pad + (1 - 2 * pad) * (p.x - minX) / spanX,
        y: pad + (1 - 2 * pad) * (p.y - minY) / spanY,
      });
    }
    return map;
  }, [filter, projected]);

  return (
    <SplitPane
      detail={selected ? <PlayerDetail player={selected} /> : null}
      onClose={() => setSelected(null)}
    >
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-1 px-4 py-2.5 shrink-0">

          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder={lang === "tr" ? "Oyuncu ara..." : "Search player..."}
            className="aura-ghost-input w-36"
          />

          <div className="aura-select-wrap">
            <select value={filter} onChange={e => setFilter(e.target.value)} className="aura-select">
              <option value="">{lang === "tr" ? "Tüm arketipler" : "All archetypes"}</option>
              {CORE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button onClick={resetView} className="aura-pill-btn">
              {lang === "tr" ? "Sıfırla" : "Reset view"}
            </button>
          )}

          <span className="ml-auto text-xs" style={{ color: "var(--text-faint)" }}>
            {filtered.length} players
          </span>
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0 overflow-hidden relative" style={{ minHeight: 220 }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
              Loading...
            </div>
          ) : (
            <div ref={mapWrapRef} className="w-full h-full touch-none overflow-hidden relative"
              onWheel={onWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Spotlight vignette — dims the periphery while the camera is focused on a cluster */}
              <div className="absolute inset-0 pointer-events-none z-10" style={{
                background: "radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,.55) 100%)",
                opacity: filter ? 1 : 0,
                transition: "opacity 0.7s cubic-bezier(0.2,0.7,0.3,1)",
              }} />

              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
                style={{
                  display: "block",
                  transform: `scale(${zoom}) translate(${pan.x/zoom}px,${pan.y/zoom}px)`,
                  transformOrigin: "center center",
                  transition: camAnimating ? "transform 0.7s cubic-bezier(0.2,0.7,0.3,1)" : "transform 0.05s ease",
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

                {/* Player dots — non-matching players fade rather than vanish during the
                    swoop, then fully hide once focusMode lands on the independent graph.
                    Matching players glide (CSS cx/cy transition) to their rescaled spot. */}
                {projected.map((p, i) => {
                  const local = focusMode ? focusPositions?.get(p.PLAYER_NAME) : null;
                  const cx = toSvgX(local ? local.x : p.x), cy = toSvgY(local ? local.y : p.y);
                  const col = ARCH_COLORS[p.primary_arch] || "#9ca3af";
                  const isHover    = hover?.PLAYER_NAME === p.PLAYER_NAME;
                  const isSelected = selected?.PLAYER_NAME === p.PLAYER_NAME;
                  const isSearch   = searchQ && p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase());
                  const matchesArch = !filter || p.primary_arch === filter;
                  const matchesSearch = !searchQ || isSearch;
                  const dimmed = !matchesArch || !matchesSearch;
                  const hiddenInFocus = focusMode && !matchesArch;
                  const highlight  = isHover || isSelected || (searchQ && isSearch);
                  return (
                    <g key={i}
                      style={{ cursor: dimmed ? "default" : "pointer", transition: "opacity 0.5s ease" }}
                      opacity={hiddenInFocus ? 0 : dimmed ? 0.07 : 1}
                      onMouseEnter={() => !dimmed && setHover(p)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => !dimmed && setSelected(p === selected ? null : p)}
                    >
                      <circle cx={cx} cy={cy}
                        r={isSelected ? 7 : isHover ? 5.5 : 3.5}
                        fill={col}
                        fillOpacity={highlight ? 1 : 0.55}
                        stroke={isSelected ? "#fff" : isHover ? col : "none"}
                        strokeWidth={isSelected ? 2 : 1.5}
                        strokeOpacity={0.8}
                        style={{ transition: "cx 0.6s cubic-bezier(0.2,0.8,0.3,1), cy 0.6s cubic-bezier(0.2,0.8,0.3,1)" }}
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
                <div className="aura-glass absolute left-4 bottom-4 px-3 py-2 rounded-xl text-xs pointer-events-none">
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

        {/* Legend — glossary only, doesn't drive the graph (use the dropdown above for that) */}
        <div className="flex flex-wrap justify-center gap-1 px-4 py-2 shrink-0">
          {Object.entries(ARCH_COLORS).map(([arch, col]) => (
            <span key={arch} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
              style={{
                background: filter === arch ? `${col}20` : "transparent",
                color: filter === arch ? col : "var(--text-muted)",
              }}>
              <span style={{ background: col, width: 6, height: 6, borderRadius: "50%", display: "inline-block" }}/>
              {arch}
            </span>
          ))}
        </div>
      </div>
    </SplitPane>
  );
}
