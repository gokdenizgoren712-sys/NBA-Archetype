import { useState, useEffect } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import SplitPane from "../components/SplitPane";
import PlayerCard from "../components/PlayerCard";

function cellStyle(value) {
  if (value === "" || value === null || value === undefined)
    return { bg: "var(--bg-elevated)", label: "—" };
  const v = Number(value);
  if (isNaN(v)) return { bg: "var(--bg-elevated)", label: "—" };
  const bg =
    v >= 0.72 ? "rgba(124,58,237,0.55)"
  : v >= 0.65 ? "rgba(37,99,235,0.45)"
  : v >= 0.55 ? "rgba(5,150,105,0.35)"
  : v >= 0.45 ? "rgba(100,116,139,0.30)"
  :              "rgba(185,28,28,0.25)";
  return { bg, label: Math.round(v * 100) };
}

const ARCH_COLOR = {
  Engine:       "#fb923c",
  Ecosystem:    "#4ade80",
  Hub:          "#2dd4bf",
  Connector:    "#c084fc",
  Creator:      "#f87171",
  Anchor:       "#60a5fa",
  Spacer:       "#67e8f9",
  Finisher:     "#f9a8d4",
  Force:        "#ef4444",
  Initiator:    "#facc15",
  Stopper:      "#9ca3af",
  "Rim Runner": "#34d399",
};

function Dot({ arch, size = 8 }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      borderRadius: "50%", background: ARCH_COLOR[arch] || "var(--text-muted)", flexShrink: 0,
    }} />
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`aura-pill-btn${active ? " active" : ""}`}>
      {children}
    </button>
  );
}

/* ── Network graph: 12 arketip, dairesel düzen, kimya çizgileri ─────
   Uç değerler (güçlü sinerji / güçlü anti-sinerji) belirgin, nötr (~0.50)
   çiftler görünmez olacak kadar soluk — grafiği kalabalıklaştırmadan
   sadece "anlamlı" ilişkileri öne çıkarır. Renk artık arketip kimliği
   (her çizgi kendi iki ucunun renginde gradyan), güç sadece kalınlıkla. */
function edgeStyle(v) {
  if (v == null || isNaN(v)) return null;
  const dev = Math.abs(v - 0.5);
  if (dev < 0.045) return null;
  const strength = Math.min(1, dev / 0.24);
  return { width: 0.8 + strength * 5, opacity: 0.16 + strength * 0.74, strength };
}

function NetworkGraph({ archs, matrix, sampleCounts, hoveredArch, setHoveredArch, selectedNode, setSelectedNode, onEdgeClick, lang }) {
  const W = 620, H = 560, R = 210, CX = W / 2, CY = H / 2 - 6;
  const nodes = archs.map((a, i) => {
    const angle = (i / archs.length) * Math.PI * 2 - Math.PI / 2;
    return { arch: a, x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle), angle };
  });
  const nodeAt = a => nodes.find(n => n.arch === a);

  const edges = [];
  for (let i = 0; i < archs.length; i++)
    for (let j = i + 1; j < archs.length; j++) {
      const a = archs[i], b = archs[j];
      const raw = matrix[a]?.[b] ?? matrix[b]?.[a];
      const v = raw != null ? Number(raw) : null;
      const style = edgeStyle(v);
      if (!style) continue;
      const mins = sampleCounts[a]?.[b] ?? sampleCounts[b]?.[a];
      edges.push({ a, b, v, mins, ...style });
    }

  const activeArch = hoveredArch || selectedNode;
  const activeNode = activeArch ? nodeAt(activeArch) : null;
  const activeColor = activeNode ? (ARCH_COLOR[activeNode.arch] || "#9ca3af") : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ maxWidth: 620, display: "block", margin: "0 auto" }}>
      <defs>
        <filter id="node-glow-blur" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        {edges.map(({ a, b }, i) => (
          <linearGradient key={i} id={`edge-grad-${i}`} gradientUnits="userSpaceOnUse"
            x1={nodeAt(a).x} y1={nodeAt(a).y} x2={nodeAt(b).x} y2={nodeAt(b).y}>
            <stop offset="0%" stopColor={ARCH_COLOR[a] || "#9ca3af"} />
            <stop offset="100%" stopColor={ARCH_COLOR[b] || "#9ca3af"} />
          </linearGradient>
        ))}
      </defs>

      {/* Cursor'ın üzerinde durduğu arketipin rengi, o pozisyonda doğal bir glow — sabit üst glow yerine */}
      {activeNode && (
        <circle cx={activeNode.x} cy={activeNode.y} r={95} fill={activeColor} opacity={0.38}
          filter="url(#node-glow-blur)"
          style={{ transition: "cx 0.3s ease, cy 0.3s ease, opacity 0.3s ease", pointerEvents: "none" }} />
      )}

      {/* Uzak, statik zemin halkası */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={1} strokeDasharray="3 5" opacity={0.4} />

      {/* Kenarlar — kendi iki ucunun renginde gradyan, kalınlık = güç (yön fark etmeksizin) */}
      {edges.map(({ a, b, v, mins, width, opacity }, i) => {
        const na = nodeAt(a), nb = nodeAt(b);
        const touchesActive = activeArch && (a === activeArch || b === activeArch);
        const dim = activeArch && !touchesActive;
        const good = v >= 0.5;
        // Kenarın ne kadarı GÖZLEM, ne kadarı MODEL? Sunucu adaptif-alpha ile
        // harmanlıyor: alpha = min(0.6, dakika/2000). Dakika yoksa alpha 0,
        // yani çizgi tamamen elle-yazılmış öncül. Bunu gizlemek yerine
        // çizginin kendisine yazıyoruz: veri yok = kesik çizgi.
        const m = mins || 0;
        const alpha = Math.min(0.6, m / 2000);
        const dash = m === 0 ? "5 6" : m < 200 ? "11 5" : null;
        return (
          <line key={i}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={`url(#edge-grad-${i})`}
            strokeWidth={touchesActive ? width * 1.6 : width}
            strokeDasharray={dash || undefined}
            opacity={(dim ? opacity * 0.15 : touchesActive ? Math.min(1, opacity * 1.5) : opacity) * (m === 0 ? 0.6 : 1)}
            style={{ cursor: "pointer", transition: "opacity 0.25s ease, stroke-width 0.25s ease" }}
            onClick={() => onEdgeClick(a, b)}
          >
            <title>{a} + {b} · {Math.round(v * 100)}{good ? "" : " (anti-synergy)"}
              {m === 0
                ? " · no shared lineup this season — model prior only"
                : ` · ${Math.round(m)} lineup-min · ${Math.round(alpha * 100)}% observed`}</title>
          </line>
        );
      })}

      {/* Node'lar */}
      {nodes.map(n => {
        const col = ARCH_COLOR[n.arch] || "#9ca3af";
        const isActive = activeArch === n.arch;
        const dim = activeArch && !isActive;
        const labelX = CX + (R + 38) * Math.cos(n.angle);
        const labelY = CY + (R + 38) * Math.sin(n.angle);
        return (
          <g key={n.arch} style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredArch(n.arch)}
            onMouseLeave={() => setHoveredArch(null)}
            onClick={() => setSelectedNode(selectedNode === n.arch ? null : n.arch)}
          >
            {/* glow halosu */}
            <circle cx={n.x} cy={n.y} r={isActive ? 24 : 16} fill={col}
              opacity={isActive ? 0.28 : 0.14}
              style={{ transition: "r 0.25s ease, opacity 0.25s ease" }} />
            <circle cx={n.x} cy={n.y} r={isActive ? 10 : 7} fill={col}
              opacity={dim ? 0.35 : 1}
              stroke={selectedNode === n.arch ? "#fff" : "none"} strokeWidth={2}
              style={{ transition: "r 0.25s ease, opacity 0.25s ease" }} />
            <text x={labelX} y={labelY} fill={dim ? "var(--text-faint)" : col}
              fontSize={isActive ? 12.5 : 11} fontWeight={isActive ? 700 : 600}
              textAnchor="middle" dominantBaseline="middle"
              style={{ pointerEvents: "none", transition: "fill 0.25s ease" }}>
              {n.arch}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Detail panel: drill-down için seçili çift ────────────────────────────────
function DrillPanel({ cell, data, loading, onClose, lang }) {
  if (!cell) return null;
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 shrink-0 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Dot arch={cell.archA} size={10} />
            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{cell.archA}</span>
            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>+</span>
            <Dot arch={cell.archB} size={10} />
            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{cell.archB}</span>
          </div>
          {data && (
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xs" style={{ color: data.total === 0 ? "var(--yamabuki)" : "var(--text-faint)" }}>
                {data.total === 0
                  ? (lang === "tr" ? "gerçek lineup yok" : "no real lineup")
                  : `${data.total} ${lang === "tr" ? "lineup" : "lineups"}`}
              </span>
              {data.avg_net != null && (
                <span className="text-xs font-semibold"
                  style={{ color: data.avg_net >= 0 ? "#34d399" : "#f87171" }}>
                  {data.avg_net > 0 ? "+" : ""}{data.avg_net.toFixed(1)} NET
                </span>
              )}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-lg leading-none mt-0.5 transition-colors"
          style={{ color: "var(--text-muted)" }}>×</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && (
          <div className="text-center text-sm py-8" style={{ color: "var(--text-muted)" }}>Loading...</div>
        )}
        {!loading && data?.total === 0 && (
          <div className="rounded-xl p-3.5 space-y-2"
            style={{ border: "1px dashed rgba(255,255,255,.16)", background: "rgba(255,255,255,.02)" }}>
            <div className="font-logo text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--yamabuki)" }}>
              {lang === "tr" ? "Model öncülü" : "Model prior"}
            </div>
            <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {lang === "tr"
                ? "Bu iki arketip bu sezon hiçbir 5'li dizilimde birlikte sahaya çıkmadı. Ağdaki sayı gözlemden değil, elle yazılmış arketip-uyum öncülünden geliyor — o yüzden çizgisi kesik."
                : "These two archetypes never shared a 5-man lineup this season. The number on the network comes from the hand-written affinity prior, not from observation — which is why its edge is dashed."}
            </p>
          </div>
        )}
        {!loading && data?.lineups?.map((lu, i) => {
          const net = lu.NET_RATING;
          const netColor = net >= 10 ? "#34d399" : net >= 0 ? "#60a5fa" : "#f87171";
          const players = lu.Players?.length ? lu.Players : (lu.GROUP_NAME || "").split(" - ");
          const archetypes = lu.Archetypes || [];
          return (
            <div key={i} className="relative rounded-xl overflow-hidden p-3"
              style={{ background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)" }}>
              <div className="flex items-start gap-2 mb-2">
                <span className="text-[10px] w-4 shrink-0 mt-0.5" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
                <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                  {players.map((p, j) => {
                    const arch = archetypes[j];
                    const col = ARCH_COLOR[arch] || "var(--text-muted)";
                    return (
                      <span key={j} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ color: col, border: `1px solid ${col}40`, background: `${col}14` }}>
                        {arch && <Dot arch={arch} size={5} />}
                        {p}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between pl-6">
                <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                  {Math.round(lu.MIN || 0)} {lang === "tr" ? "dk birlikte" : "min together"}
                </span>
                <div className="flex gap-3 shrink-0">
                  {lu.fit_score != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                        {Math.round(lu.fit_score * 100)}
                      </div>
                      <div className="text-[8px]" style={{ color: "var(--text-faint)" }}>Fit</div>
                    </div>
                  )}
                  {net != null && (
                    <div className="text-center">
                      <div className="text-sm font-bold" style={{ color: netColor }}>
                        {net > 0 ? "+" : ""}{net.toFixed(1)}
                      </div>
                      <div className="text-[8px]" style={{ color: "var(--text-faint)" }}>NET</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AffinityContent() {
  const { lang } = useLang();
  const [matrix, setMatrix]             = useState({});
  const [archs, setArchs]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [tab, setTab]                   = useState("matrix");
  const [duos, setDuos]                 = useState([]);
  const [duoLoading, setDuoLoading]     = useState(false);
  const [duoA, setDuoA]                 = useState("");
  const [hoveredArch, setHoveredArch]   = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [sampleCounts, setSampleCounts] = useState({});
  const [drillCell, setDrillCell]       = useState(null); // {archA, archB}
  const [drillData, setDrillData]       = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.affinity()
      .then(d => {
        setMatrix(d.matrix || {});
        setArchs(d.archetypes || []);
        setSampleCounts(d.sample_counts || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const openDrill = async (archA, archB) => {
    if (archA === archB) return;
    setDrillCell({ archA, archB });
    setDrillData(null);
    setDrillLoading(true);
    try {
      const res = await api.affinityLineups(archA, archB, 10);
      setDrillData(res);
    } catch (e) { console.error(e); }
    setDrillLoading(false);
  };

  useEffect(() => {
    if (tab !== "duos") return;
    setDuoLoading(true);
    api.players({ limit: 80, sort_by: "overall_score" })
      .then(d => setDuos(d.players || []))
      .catch(console.error)
      .finally(() => setDuoLoading(false));
  }, [tab]);

  const bestPairs = [];
  if (archs.length && Object.keys(matrix).length) {
    for (let i = 0; i < archs.length; i++)
      for (let j = i + 1; j < archs.length; j++) {
        const a = archs[i], b = archs[j];
        const v = matrix[a]?.[b] ?? matrix[b]?.[a];
        if (v != null) bestPairs.push({ a, b, v: Number(v) });
      }
    bestPairs.sort((x, y) => y.v - x.v);
  }

  if (loading) return (
    <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
      Loading...
    </div>
  );
  if (!archs.length) return (
    <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
      {lang === "tr" ? "Affinity verisi bulunamadı." : "Affinity data not found."}
    </div>
  );

  // Sol panel içeriği
  const leftPanel = (
    <div className="h-full flex flex-col min-h-0">
      {/* Başlık + tab bar */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <h2 className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
          {lang === "tr" ? "Arketip Uyum Ağı" : "Archetype Affinity Network"}
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {lang === "tr"
            ? "Gerçek 5'li lineup verisinden ikili başarı skorları. Bir node'a veya bağlantıya tıkla → gerçek lineup'ları gör."
            : "Pairwise success scores from real 5-man lineups. Click a node or a connection to see real lineups."}
        </p>
        <div className="flex gap-1 flex-wrap">
          {[
            ["matrix",    lang === "tr" ? "Ağ"        : "Network"],
            ["bestpairs", lang === "tr" ? "En İyi"    : "Best Pairs"],
            ["duos",      lang === "tr" ? "Oyuncular" : "Players"],
          ].map(([k, l]) => (
            <TabBtn key={k} active={tab === k} onClick={() => setTab(k)}>{l}</TabBtn>
          ))}
        </div>
      </div>

      {/* Tab içeriği */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4">

        {tab === "matrix" && (
          <div className="flex flex-col items-center">
            <div className="relative w-full aura-glass rounded-2xl overflow-hidden" style={{ maxWidth: 620 }}>
              <NetworkGraph
                archs={archs} matrix={matrix} sampleCounts={sampleCounts}
                hoveredArch={hoveredArch} setHoveredArch={setHoveredArch}
                selectedNode={selectedNode} setSelectedNode={setSelectedNode}
                onEdgeClick={openDrill} lang={lang}
              />
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3 justify-center items-center" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              <div className="flex items-center gap-1.5">
                <svg width="26" height="10"><line x1="2" y1="5" x2="24" y2="5" stroke="#9ca3af" strokeWidth="4.5" /></svg>
                {lang === "tr" ? "Güçlü ilişki" : "Strong pairing"}
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="26" height="10"><line x1="2" y1="5" x2="24" y2="5" stroke="#9ca3af" strokeWidth="1" opacity="0.4" /></svg>
                {lang === "tr" ? "Zayıf/nötr" : "Weak / neutral"}
              </div>
              {/* Kesik çizgi = gözlem yok. Ağdaki her sayı PRIOR + gerçek lineup
                  verisinin harmanı; harman oranı çifte göre %0-60 arasında
                  değişiyor, bu yüzden "hangi çizgiye ne kadar güveneyim"
                  sorusunun cevabı çizginin kendisinde olmalı. */}
              <div className="flex items-center gap-1.5">
                <svg width="26" height="10"><line x1="2" y1="5" x2="24" y2="5" stroke="#9ca3af" strokeWidth="3" strokeDasharray="5 6" opacity="0.65" /></svg>
                {lang === "tr" ? "Gerçek dizilim yok — model öncülü" : "No shared lineup — model prior"}
              </div>
              <span style={{ color: "var(--text-faint)" }}>
                {lang === "tr"
                  ? "· Çizgi rengi = iki ucun arketip kimliği · kesik = gözlem yok · tıkla"
                  : "· Line color = each end's archetype · dashed = unobserved · click to drill"}
              </span>
            </div>

            {/* Seçili node'un sıralı partner listesi */}
            {selectedNode && (
              <div className="mt-4 w-full space-y-1.5" style={{ maxWidth: 480 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Dot arch={selectedNode} size={10} />
                  <span className="font-semibold text-sm" style={{ color: ARCH_COLOR[selectedNode] }}>{selectedNode}</span>
                  <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                    {lang === "tr" ? "en iyi eşleşmeler" : "best pairings"}
                  </span>
                </div>
                {archs.filter(a => a !== selectedNode)
                  .map(a => ({
                    a, v: Number(matrix[selectedNode]?.[a] ?? matrix[a]?.[selectedNode] ?? 0),
                    mins: sampleCounts[selectedNode]?.[a] ?? sampleCounts[a]?.[selectedNode],
                  }))
                  .sort((x, y) => y.v - x.v)
                  .map(({ a, v, mins }) => {
                    const { bg } = cellStyle(v);
                    return (
                      <button key={a} onClick={() => openDrill(selectedNode, a)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-left transition-colors"
                        style={{ background: "rgba(255,255,255,.03)" }}>
                        <Dot arch={a} />
                        <span className="flex-1 text-xs" style={{ color: "var(--text-primary)" }}>{a}</span>
                        {mins != null && (
                          <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>{Math.round(mins)} min</span>
                        )}
                        <div className="rounded px-2 py-0.5" style={{ background: bg }}>
                          <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11 }}>{Math.round(v * 100)}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {tab === "bestpairs" && (
          <div className="space-y-2">
            {bestPairs.slice(0, 20).map(({ a, b, v }, i) => {
              const { bg } = cellStyle(v);
              return (
                <button key={i} onClick={() => openDrill(a, b)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                  style={{
                    background: drillCell?.archA === a && drillCell?.archB === b
                      ? "var(--accent-dim)" : "rgba(255,255,255,.03)",
                  }}>
                  <span style={{ fontSize: 10, color: "var(--text-faint)", width: 18, flexShrink: 0 }}>
                    #{i + 1}
                  </span>
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Dot arch={a} />
                      <span style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 500 }}>{a}</span>
                    </div>
                    <span style={{ color: "var(--text-faint)", fontSize: 10 }}>+</span>
                    <div className="flex items-center gap-1">
                      <Dot arch={b} />
                      <span style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 500 }}>{b}</span>
                    </div>
                  </div>
                  <div className="rounded px-2.5 py-1 shrink-0" style={{ background: bg }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 14 }}>
                      {Math.round(v * 100)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {tab === "duos" && (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {lang === "tr" ? "Arketip:" : "Filter:"}
              </span>
              <div className="aura-select-wrap">
                <select value={duoA} onChange={e => setDuoA(e.target.value)} className="aura-select">
                  <option value="">{lang === "tr" ? "Tümü" : "All archetypes"}</option>
                  {archs.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            {duoLoading ? (
              <div className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>Loading...</div>
            ) : (
              <div className="flex flex-wrap gap-5 justify-center">
                {duos
                  .filter(p => !duoA || p.primary_arch === duoA)
                  .slice(0, 24)
                  .map((p, i) => {
                    const partnerArchs = archs
                      .filter(a => a !== p.primary_arch)
                      .map(a => ({ a, v: matrix[p.primary_arch]?.[a] ?? matrix[a]?.[p.primary_arch] ?? 0 }))
                      .sort((x, y) => y.v - x.v)
                      .slice(0, 3);
                    return (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <PlayerCard player={p} rank={i + 1} />
                        <div className="flex gap-1.5 flex-wrap justify-center" style={{ width: 280 }}>
                          {partnerArchs.map(({ a, v }) => {
                            const { bg } = cellStyle(v);
                            return (
                              <button key={a} onClick={() => openDrill(p.primary_arch, a)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-75"
                                style={{ background: bg, fontSize: 9 }}>
                                <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%", background: ARCH_COLOR[a] || "var(--text-muted)" }}/>
                                <span style={{ color: "var(--text-primary)" }}>{a} · {Math.round(v * 100)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const detail = drillCell
    ? <DrillPanel
        cell={drillCell} data={drillData} loading={drillLoading}
        onClose={() => { setDrillCell(null); setDrillData(null); }}
        lang={lang}
      />
    : null;

  return (
    <SplitPane detail={detail} onClose={() => { setDrillCell(null); setDrillData(null); }}>
      {leftPanel}
    </SplitPane>
  );
}
