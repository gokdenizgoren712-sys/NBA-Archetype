/**
 * Explore — PCA scatter plot: oyuncuları 12-boyutlu skor uzayında 2 bileşene indirgeyip gösterir.
 * PCA client-side yapılır (no extra deps), covariance → power iteration (2 pass).
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";

const ARCH_COLORS = {
  Engine:      "#818cf8",
  Ecosystem:   "#f59e0b",
  Hub:         "#34d399",
  Connector:   "#38bdf8",
  Creator:     "#a78bfa",
  Anchor:      "#fb923c",
  Spacer:      "#6ee7b7",
  Finisher:    "#f472b6",
  Force:       "#ef4444",
  Initiator:   "#facc15",
  Stopper:     "#94a3b8",
  "Rim Runner":"#4ade80",
};

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

// ── PCA helpers (vanilla JS) ──────────────────────────────────────────────────

function matMulVec(mat, vec) {
  return mat.map(row => row.reduce((s, v, i) => s + v * vec[i], 0));
}

function normalize(vec) {
  const n = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / n);
}

function powerIterate(cov, deflate = null, iters = 60) {
  let v = cov[0].map((_, i) => i === 0 ? 1 : 0);
  if (deflate) {
    v = v.map((x, i) => x - deflate.reduce((s, d, j) => s + d[i] * v[j], 0) * deflate[0][i]);
  }
  for (let i = 0; i < iters; i++) {
    v = normalize(matMulVec(cov, v));
    if (deflate) {
      const proj = deflate.reduce((s, ev) => {
        const dot = ev.reduce((a, x, j) => a + x * v[j], 0);
        return s.map((x, j) => x + dot * ev[j]);
      }, new Array(v.length).fill(0));
      v = normalize(v.map((x, j) => x - proj[j]));
    }
  }
  return v;
}

function pca2d(matrix) {
  const n = matrix.length;
  const d = matrix[0].length;
  // Center
  const mean = Array.from({ length: d }, (_, j) => matrix.reduce((s, r) => s + r[j], 0) / n);
  const centered = matrix.map(row => row.map((v, j) => v - mean[j]));
  // Covariance (d×d)
  const cov = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) =>
      centered.reduce((s, row) => s + row[i] * row[j], 0) / (n - 1)
    )
  );
  const pc1 = powerIterate(cov);
  const pc2 = powerIterate(cov, [pc1]);

  const proj1 = centered.map(row => row.reduce((s, v, i) => s + v * pc1[i], 0));
  const proj2 = centered.map(row => row.reduce((s, v, i) => s + v * pc2[i], 0));

  const var1 = proj1.reduce((s, v) => s + v * v, 0) / (n - 1);
  const var2 = proj2.reduce((s, v) => s + v * v, 0) / (n - 1);
  const totalVar = cov.reduce((s, row, i) => s + row[i], 0) || 1;

  return { proj1, proj2, pct1: var1 / totalVar, pct2: var2 / totalVar };
}

// ── Component ─────────────────────────────────────────────────────────────────

const INFO = {
  en: {
    title: "Archetype Map",
    subtitle: "How to read this chart",
    what: "Each dot is a player. Their position on the chart is determined by PCA (Principal Component Analysis) — a mathematical technique that compresses 12 archetype scores into 2 dimensions while preserving as much variance as possible.",
    pc1: "PC1 (horizontal axis): Captures the biggest source of variation across players — roughly the spectrum from perimeter-oriented to interior-dominant roles.",
    pc2: "PC2 (vertical axis): The second-largest axis of variation — roughly separating playmakers and high-creation players from pure role players.",
    cluster: "Players close together have similar archetype score profiles. Clusters naturally emerge by archetype: Engines cluster with other Engines, Spacers with Spacers, Ecosystems alone at the top.",
    pct: "The percentages shown (PC1 X% · PC2 Y%) are the share of total variance explained by each axis. A combined 40–60% is typical for 12-dimensional data.",
    tip: "Hover over a dot to see the player. Use the search box to highlight a specific player. Click an archetype in the legend to filter.",
  },
  tr: {
    title: "Arketip Haritası",
    subtitle: "Bu grafik nasıl okunur?",
    what: "Her nokta bir oyuncu. Grafikteki konumları PCA (Temel Bileşen Analizi) ile belirlenir — 12 arketip skorunu mümkün olduğunca az bilgi kaybıyla 2 boyuta indirgeyen matematiksel bir teknik.",
    pc1: "PC1 (yatay eksen): Oyuncular arasındaki en büyük farklılık kaynağını yakalıyor — kabaca dış hat odaklı oyunculardan iç saha odaklılara uzanan bir spektrum.",
    pc2: "PC2 (dikey eksen): İkinci büyük farklılık ekseni — genellikle organizatör/yaratıcı oyuncuları saf rol oyuncularından ayıran eksen.",
    cluster: "Birbirine yakın noktalar benzer arketip skor profiline sahip. Kümeler doğal olarak arketiplere göre oluşur: Engine'ler Engine'lerle, Spacer'lar Spacer'larla, Ecosystem'lar ise zirveye yakın yalnız durur.",
    pct: "Gösterilen yüzdeler (PC1 X% · PC2 Y%) her eksenin toplam varyansı ne kadar açıkladığını gösterir. 12 boyutlu veri için ikisinin toplamı %40–60 çıkması normaldir.",
    tip: "Noktanın üzerine gelince oyuncuyu görebilirsin. Arama kutusuyla belirli bir oyuncuyu öne çıkar. Alttaki arketip etiketlerine tıklayarak filtrele.",
  },
};

export default function Explore() {
  const { lang } = useLang();
  const info = INFO[lang] || INFO.en;

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover]     = useState(null);
  const [filter, setFilter]   = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [pcaLoadings, setPcaLoadings] = useState(null);
  const svgRef = useRef(null);

  // Pinch-to-zoom + pan state
  const [zoom, setZoom]         = useState(1);
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const touchRef                = useRef({});   // geçici dokunuş verisi

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Wheel zoom (masaüstü)
  const onWheel = useCallback(e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(z => Math.max(0.5, Math.min(8, z * factor)));
  }, []);

  // Touch handlers (mobil)
  const onTouchStart = useCallback(e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current.startDist = Math.sqrt(dx * dx + dy * dy);
      touchRef.current.startZoom = zoom;
    } else if (e.touches.length === 1) {
      touchRef.current.startPan = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
    }
  }, [zoom, pan]);

  const onTouchMove = useCallback(e => {
    e.preventDefault();
    if (e.touches.length === 2 && touchRef.current.startDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newZoom = Math.max(0.5, Math.min(8, touchRef.current.startZoom * (dist / touchRef.current.startDist)));
      setZoom(newZoom);
    } else if (e.touches.length === 1 && touchRef.current.startPan) {
      setPan({
        x: e.touches[0].clientX - touchRef.current.startPan.x,
        y: e.touches[0].clientY - touchRef.current.startPan.y,
      });
    }
  }, []);

  const onTouchEnd = useCallback(() => { touchRef.current = {}; }, []);

  useEffect(() => {
    api.players({ limit: 500, sort_by: "overall_score" }).then(d => {
      setPlayers(d.players || []);
      setLoading(false);
    });
    api.pcaLoadings().then(setPcaLoadings).catch(() => {});
  }, []);

  const projected = useMemo(() => {
    if (players.length < 10) return [];
    const rows = players.map(p =>
      CORE.map(c => parseFloat(p[`score_${c}`] || 0))
    );
    if (rows[0]?.length !== 12) return [];
    try {
      const { proj1, proj2, pct1, pct2 } = pca2d(rows);
      return players.map((p, i) => ({
        ...p,
        pc1: proj1[i],
        pc2: proj2[i],
        pct1, pct2,
      }));
    } catch { return []; }
  }, [players]);

  const filtered = useMemo(() => {
    return projected.filter(p => {
      if (filter && p.primary_arch !== filter) return false;
      if (searchQ && !p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [projected, filter, searchQ]);

  // SVG layout
  const W = 720, H = 520, PAD = 48;
  const xs = filtered.map(p => p.pc1);
  const ys = filtered.map(p => p.pc2);
  const minX = Math.min(...xs) - 0.01, maxX = Math.max(...xs) + 0.01;
  const minY = Math.min(...ys) - 0.01, maxY = Math.max(...ys) + 0.01;
  const scX = v => PAD + ((v - minX) / (maxX - minX)) * (W - PAD * 2);
  const scY = v => H - PAD - ((v - minY) / (maxY - minY)) * (H - PAD * 2);

  const pct1 = projected[0]?.pct1 ?? 0;
  const pct2 = projected[0]?.pct2 ?? 0;

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Başlık satırı */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-white font-bold text-lg">{info.title}</h2>
          <span className="text-xs text-slate-500">
            PC1 {(pct1 * 100).toFixed(1)}% · PC2 {(pct2 * 100).toFixed(1)}%
          </span>
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
            showInfo
              ? "border-violet-500 text-violet-300 bg-violet-900/20"
              : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
          }`}
        >
          <span className="text-base leading-none">ⓘ</span>
          {info.subtitle}
        </button>
      </div>

      {/* Açıklama paneli */}
      {showInfo && (
        <div className="bg-slate-900 border border-violet-700/30 rounded-xl p-5 space-y-3 max-w-2xl">
          <p className="text-slate-300 text-sm leading-relaxed">{info.what}</p>
          <div className="space-y-2">
            {[info.pc1, info.pc2, info.cluster, info.pct].map((line, i) => (
              <div key={i} className="flex gap-2 text-xs text-slate-400 leading-relaxed">
                <span className="text-violet-500 shrink-0 mt-0.5">•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
          {/* Gerçek PCA loadings — hangi bileşen hangi ekseni domine ediyor */}
          {pcaLoadings && (
            <div className="border-t border-slate-800 pt-3 space-y-2">
              {[["PC1", pcaLoadings.pc1], ["PC2", pcaLoadings.pc2]].map(([label, pc]) => {
                const top3 = Object.entries(pc.loadings)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 3);
                return (
                  <div key={label} className="text-xs text-slate-500">
                    <span className="text-slate-400 font-medium">{label}</span>
                    <span className="ml-1">({(pc.pct_variance * 100).toFixed(1)}%)</span>
                    <span className="ml-2">
                      {top3.map(([k, v]) => (
                        <span key={k} className="mr-2">
                          <span style={{ color: v > 0 ? "#a78bfa" : "#f87171" }}>{k}</span>
                          <span className="text-slate-600"> {v > 0 ? "+" : ""}{v.toFixed(2)}</span>
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-500 border-t border-slate-800 pt-3">{info.tip}</p>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-20">Loading player data...</div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-500 text-center py-20">No players match filter.</div>
      ) : (
        <div
          className="relative bg-slate-900 rounded-xl border border-slate-800 overflow-hidden touch-none"
          style={{ width: W, maxWidth: "100%" }}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Reset zoom button — sadece zoom yapıldığında görünür */}
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              onClick={resetView}
              className="absolute top-2 right-2 z-10 text-[10px] px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-400 hover:text-white"
            >
              {lang === "tr" ? "Sıfırla" : "Reset"}
            </button>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            style={{ display: "block", maxWidth: "100%", transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: "center center", transition: "transform 0.05s ease" }}
          >
            {/* Axis lines */}
            <line x1={PAD} y1={H/2} x2={W-PAD} y2={H/2} stroke="#334155" strokeWidth={1} />
            <line x1={W/2} y1={PAD} x2={W/2} y2={H-PAD} stroke="#334155" strokeWidth={1} />
            <text x={W - PAD + 4} y={H/2 + 4} fill="#475569" fontSize={10}>PC1</text>
            <text x={W/2 + 4} y={PAD - 6} fill="#475569" fontSize={10}>PC2</text>

            {/* Points */}
            {filtered.map((p, i) => {
              const cx = scX(p.pc1), cy = scY(p.pc2);
              const col = ARCH_COLORS[p.primary_arch] || "#94a3b8";
              const isHover = hover?.PLAYER_NAME === p.PLAYER_NAME;
              const isSearch = searchQ && p.PLAYER_NAME?.toLowerCase().includes(searchQ.toLowerCase());
              return (
                <g key={i}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}>
                  <circle cx={cx} cy={cy} r={isHover ? 7 : 5}
                    fill={col} fillOpacity={isHover || isSearch ? 1.0 : 0.65}
                    stroke={isHover ? "#fff" : isSearch ? "#fff" : "none"} strokeWidth={1.5}
                  />
                  {(isHover || isSearch) && (
                    <text x={cx + 8} y={cy + 4} fill="#e2e8f0" fontSize={10}
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
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-1 items-center">
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-600 text-slate-400 hover:text-white transition-colors"
          >
            {lang === "tr" ? "× Filtreyi kaldır" : "× Clear filter"}
          </button>
        )}
        {Object.entries(ARCH_COLORS).map(([arch, col]) => (
          <button key={arch}
            onClick={() => setFilter(filter === arch ? "" : arch)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
              filter === arch
                ? "border-white/30 bg-white/10 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}>
            <span style={{ background: col, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />
            {arch}
          </button>
        ))}
      </div>
    </div>
  );
}
