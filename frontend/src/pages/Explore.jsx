import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import PlayerCard from "../components/PlayerCard";
import PaIcon from "../components/shell/PaIcon";
import { PageGlow } from "../components/states/States";
import ExploreHeader from "../components/explore/ExploreHeader";
import { ARCHETYPE_COLOR as ARCH_COLORS } from "../constants/archetypeColors";

// ── Explore · Map (handoff 8a / mobil 19d) ──────────────────────────────────
// Lejant çipleri artık haritayı filtreliyor (önceden yalnızca açıklamaydı,
// filtre ayrı bir açılır kutudaydı); seçili olmayanlar söner, sayfa ışığı
// o arketipin rengine geçer. Sağda seçili oyuncunun kartı + en yakın profiller;
// mobilde alttan seçili oyuncu şeridi.

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
  en: { xLeft: "Off-ball specialist", xRight: "Ball-dominant / Creator", yBottom: "Interior / Big", yTop: "Perimeter / Wing" },
  tr: { xLeft: "Off-ball / Rol oyuncusu", xRight: "Topla dominant / Yaratıcı", yBottom: "İç saha / Büyük", yTop: "Dış hat / Kanat" },
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

// 12 arketip skorunun ortalamadan arındırılmış kosinüs benzerliği — ham
// persantil vektörlerinde herkes ~0.9 çıkıyor, merkezleyince ayrışıyor
// (comparables.py'deki desenle aynı).
function centered(p) {
  const v = CORE.map(c => parseFloat(p[`score_${c}`] ?? 0) || 0);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.map(x => x - m);
}
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

export default function ExploreContent() {
  const { lang } = useLang();
  const info = INFO[lang] || INFO.en;
  const navigate = useNavigate();

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
  // focusMode: yalnızca filtrelenen arketipin oyuncuları, kendi min-max
  // aralığına yeniden ölçeklenmiş düzende (aynı eksen anlamı, dolu alan).
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

  // wheel React'te pasif — preventDefault için yerel dinleyici
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => Math.max(0.5, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading]);

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
    api.players({ limit: 500, sort_by: "overall_score" })
      .then(d => setPlayers(d.players || []))
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, []);

  // viewBox yüksekliği kutunun oranını izler — sabit 720×520 dar/uzun mobil
  // kutuda haritayı ince bir şeride sıkıştırıyordu (ResizeObserver panelde
  // güvenilmez, pencere resize'ı yeterli).
  const [H, setH] = useState(520);
  useLayoutEffect(() => {
    const fit = () => {
      const r = mapWrapRef.current?.getBoundingClientRect();
      if (r?.width && r?.height) setH(Math.round(Math.max(360, Math.min(1100, 720 * (r.height / r.width)))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [loading]);
  const W = 720, PAD = 40;
  const toSvgX = x => PAD + x * (W - PAD * 2);
  const toSvgY = y => H - PAD - y * (H - PAD * 2);

  const projected = useMemo(() => players.map(p => ({ ...p, ...playerPos(p), _v: centered(p) })), [players]);

  const q = searchQ.trim().toLowerCase();
  const matchCount = useMemo(() => projected.filter(p =>
    (!filter || p.primary_arch === filter) && (!q || p.PLAYER_NAME?.toLowerCase().includes(q))).length,
  [projected, filter, q]);

  // Arama tek oyuncuya inince onu seç (8a'da arama kutusu seçili oyuncuyu gösteriyor)
  useEffect(() => {
    if (!q) return;
    const hits = projected.filter(p => p.PLAYER_NAME?.toLowerCase().includes(q));
    if (hits.length === 1) setSelected(hits[0]);
  }, [q, projected]);

  const nearest = useMemo(() => {
    if (!selected) return [];
    return projected
      .filter(p => p.PLAYER_NAME !== selected.PLAYER_NAME)
      .map(p => ({ p, s: cosine(selected._v || centered(selected), p._v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
  }, [selected, projected]);

  // Filtre değişince: kamerayı kümeye uçur, varınca bağımsız düzene geç.
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
    const spanPxX = Math.max(maxX - minX, 70) * pxPerUnit, spanPxY = Math.max(maxY - minY, 70) * pxPerUnit;
    const fitZoom = Math.max(1.4, Math.min(6, Math.min((rect.width * 0.55) / spanPxX, (rect.height * 0.55) / spanPxY)));
    flyTo(fitZoom, { x: -(cx - W / 2) * pxPerUnit, y: -(cy - H / 2) * pxPerUnit });
    focusTimerRef.current = setTimeout(() => { setFocusMode(true); flyTo(1, { x: 0, y: 0 }); }, 680);
    return () => clearTimeout(focusTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, projected.length]);

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

  const tint = filter ? ARCH_COLORS[filter] : selected ? ARCH_COLORS[selected.primary_arch] : "#FFB11B";
  const selColor = selected ? ARCH_COLORS[selected.primary_arch] || "#FFB11B" : null;
  const moved = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <div className="ex-page fill">
      <PageGlow tint={tint} />
      <div className="ex-inner">
        <ExploreHeader active="map" aside={
          <>
            <label className="ex-search" style={{ "--tint": tint }}>
              <PaIcon name="search" size={16} color="var(--text-muted)" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder={lang === "tr" ? "Oyuncu ara" : "Search player"} aria-label="Search player" />
            </label>
            <span className="ex-count">{loading ? "Loading…" : `${matchCount} players · 2025-26`}</span>
          </>
        } />

        <div className={`ex-legend${filter ? " filtered" : ""}`} role="radiogroup" aria-label="Filter by archetype">
          {CORE.map(arch => (
            <button key={arch} role="radio" aria-checked={filter === arch}
              className={`ex-chip${filter === arch ? " on" : ""}`} style={{ "--c": ARCH_COLORS[arch] }}
              onClick={() => setFilter(f => (f === arch ? "" : arch))}>
              <i />{arch}
            </button>
          ))}
        </div>

        <div className="ex-map-grid">
          <div ref={mapWrapRef} className="ex-map"
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <span className="ex-axis top">{info.yTop}</span>
            <span className="ex-axis bottom">{info.yBottom}</span>
            <span className="ex-axis left">← {info.xLeft}</span>
            <span className="ex-axis right">{info.xRight} →</span>

            {!loading && (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x/zoom}px,${pan.y/zoom}px)`,
                  transformOrigin: "center center",
                  transition: camAnimating ? "transform 0.7s cubic-bezier(0.2,0.7,0.3,1)" : "transform 0.05s ease",
                }}>
                <line x1={PAD / 2} y1={H/2} x2={W - PAD / 2} y2={H/2} stroke="rgba(255,255,255,.07)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <line x1={W/2} y1={PAD / 2} x2={W/2} y2={H - PAD / 2} stroke="rgba(255,255,255,.07)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

                {projected.map((p) => {
                  const local = focusMode ? focusPositions?.get(p.PLAYER_NAME) : null;
                  const cx = toSvgX(local ? local.x : p.x), cy = toSvgY(local ? local.y : p.y);
                  const col = ARCH_COLORS[p.primary_arch] || "#9ca3af";
                  const isHover    = hover?.PLAYER_NAME === p.PLAYER_NAME;
                  const isSelected = selected?.PLAYER_NAME === p.PLAYER_NAME;
                  const isSearch   = q && p.PLAYER_NAME?.toLowerCase().includes(q);
                  const matchesArch = !filter || p.primary_arch === filter;
                  const dimmed = !matchesArch || (q && !isSearch);
                  const hiddenInFocus = focusMode && !matchesArch;
                  const highlight  = isHover || isSelected || isSearch;
                  return (
                    <g key={p.PLAYER_NAME}
                      style={{ cursor: dimmed ? "default" : "pointer", transition: "opacity 0.3s ease" }}
                      opacity={hiddenInFocus ? 0 : dimmed ? 0.08 : 1}
                      onMouseEnter={() => !dimmed && setHover(p)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => !dimmed && setSelected(isSelected ? null : p)}>
                      {isSelected && <circle cx={cx} cy={cy} r={11} fill="none" stroke="#f2efea" strokeWidth={2}
                        style={{ filter: `drop-shadow(0 0 8px ${col})` }} />}
                      <circle cx={cx} cy={cy}
                        r={isSelected ? 5 : isHover ? 5.5 : 4}
                        fill={col} fillOpacity={highlight || !filter ? 0.9 : 0.75}
                        style={{ filter: `drop-shadow(0 0 4px ${col}88)`,
                          transition: "cx 0.6s cubic-bezier(0.2,0.8,0.3,1), cy 0.6s cubic-bezier(0.2,0.8,0.3,1)" }} />
                      {highlight && (
                        <text x={cx + 16} y={cy + 4} fill="#f2efea" fontSize={12} fontWeight={600}
                          style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "#0b0b0b", strokeWidth: 3 }}>
                          {p.PLAYER_NAME}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            {hover && hover.PLAYER_NAME !== selected?.PLAYER_NAME && (
              <div className="ex-tip">
                <b>{hover.PLAYER_NAME}</b>
                <span>
                  <span style={{ color: ARCH_COLORS[hover.primary_arch] }}>{hover.primary_arch}</span>
                  {" · "}{hover.TEAM_ABBREVIATION}
                  {hover.overall_score != null && ` · Overall ${Math.round(hover.overall_score * 100)}`}
                </span>
              </div>
            )}
            {moved && <button className="pa-btn-secondary ex-reset" onClick={resetView}>Reset view</button>}
          </div>

          <aside className="ex-side">
            {selected ? (
              <>
                <span className="lbl">Selected</span>
                <PlayerCard player={{ ...selected, overall_tier: selected.overall_tier || "" }} expandable />
                {nearest.length > 0 && (
                  <div className="ex-panel ex-near" style={{ "--pc": selColor }}>
                    <span className="ex-muted" style={{ fontSize: 12, marginBottom: 4 }}>Closest profiles</span>
                    {nearest.map(({ p, s }) => (
                      <button key={p.PLAYER_NAME} className="ex-near-row" style={{ "--c": ARCH_COLORS[p.primary_arch] }}
                        onClick={() => setSelected(p)}>
                        <i /><span>{p.PLAYER_NAME}</span><b>{Math.round(((s + 1) / 2) * 100)}%</b>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ex-empty-side">
                <b>Pick a player</b>
                <p className="ex-muted">Click any dot, or search a name. Nearby dots share a role profile across all 12 archetype scores.</p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {selected && (
        <button className="ex-msel" style={{ "--c": selColor }}
          onClick={() => navigate(`/basketball/players/${encodeURIComponent(selected.PLAYER_NAME)}`)}>
          <span className="av">{initials(selected.PLAYER_NAME)}</span>
          <span className="tx">
            <b>{selected.PLAYER_NAME}</b>
            <span><em>{selected.primary_arch}</em>{nearest[0] ? ` · nearest ${nearest[0].p.PLAYER_NAME.split(" ").slice(-1)[0]}` : ""}</span>
          </span>
          {selected.overall_score != null && <span className="ov">{Math.round(selected.overall_score * 100)}</span>}
        </button>
      )}
    </div>
  );
}
