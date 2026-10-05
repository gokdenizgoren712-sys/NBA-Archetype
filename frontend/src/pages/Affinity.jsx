import { useState, useEffect, useMemo } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import ExploreHeader from "../components/explore/ExploreHeader";
import { ErrorState } from "../components/states/States";
import { ARCHETYPE_COLOR as ARCH_COLOR } from "../constants/archetypeColors";

// ── Explore · Affinity (handoff 11a) ────────────────────────────────────────
// Sol: 12×12 çift uyumu ısı haritası (kırmızı = birlikte kötü, yeşil = birlikte
// iyi, 50 nötr) — ya da aynı veri ağ grafiği olarak. Sağ: en iyi çiftler;
// bir hücreye/çifte tıklayınca sağ sütun o çiftin gerçek lineup'larına döner.
// Değer net rating DEĞİL: elle yazılmış öncül + gerçek lineup verisinin
// dakikaya göre harmanı (api _blended_affinity_matrix). Hiç ortak lineup'ı
// olmayan çiftler yalnızca öncül — hücrede kesik çerçeve, ağda kesik çizgi.

const GOOD = "#4ade80", BAD = "#f87171";

// 0..1 skor → ısı rengi (0.5 nötr, ±0.25'te tam doygun)
function heat(v) {
  if (v == null || isNaN(v)) return "rgba(255,255,255,.03)";
  const d = Math.max(-1, Math.min(1, (v - 0.5) / 0.25));
  const c = d >= 0 ? "74,222,128" : "248,113,113";
  return `rgba(${c},${(0.06 + Math.abs(d) * 0.62).toFixed(2)})`;
}

/* ── Ağ grafiği: 12 arketip, dairesel düzen ────────────────────────────
   Uç değerler belirgin, nötr (~0.50) çiftler görünmez olacak kadar soluk.
   Renk arketip kimliği (her çizgi iki ucunun renginde gradyan), güç kalınlıkla. */
function edgeStyle(v) {
  if (v == null || isNaN(v)) return null;
  const dev = Math.abs(v - 0.5);
  if (dev < 0.045) return null;
  const strength = Math.min(1, dev / 0.24);
  return { width: 0.8 + strength * 5, opacity: 0.16 + strength * 0.74, strength };
}

function NetworkGraph({ archs, matrix, sampleCounts, hoveredArch, setHoveredArch, selectedNode, setSelectedNode, onEdgeClick }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 620, display: "block", margin: "0 auto" }}>
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

      {activeNode && (
        <circle cx={activeNode.x} cy={activeNode.y} r={95} fill={activeColor} opacity={0.38}
          filter="url(#node-glow-blur)"
          style={{ transition: "cx 0.3s ease, cy 0.3s ease, opacity 0.3s ease", pointerEvents: "none" }} />
      )}

      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={1} />

      {edges.map(({ a, b, v, mins, width, opacity }, i) => {
        const na = nodeAt(a), nb = nodeAt(b);
        const touchesActive = activeArch && (a === activeArch || b === activeArch);
        const dim = activeArch && !touchesActive;
        // Veri yok = kesik çizgi (sayı yalnızca öncül)
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
            onClick={() => onEdgeClick(a, b)}>
            <title>{a} + {b} · {Math.round(v * 100)}
              {m === 0
                ? " · no shared lineup this season — model prior only"
                : ` · ${Math.round(m)} lineup-min · ${Math.round(alpha * 100)}% observed`}</title>
          </line>
        );
      })}

      {nodes.map(n => {
        const col = ARCH_COLOR[n.arch] || "#9ca3af";
        const isActive = activeArch === n.arch;
        const dim = activeArch && !isActive;
        const labelX = CX + (R + 40) * Math.cos(n.angle);
        const labelY = CY + (R + 40) * Math.sin(n.angle);
        return (
          <g key={n.arch} style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredArch(n.arch)}
            onMouseLeave={() => setHoveredArch(null)}
            onClick={() => setSelectedNode(selectedNode === n.arch ? null : n.arch)}>
            <circle cx={n.x} cy={n.y} r={isActive ? 24 : 16} fill={col} opacity={isActive ? 0.28 : 0.14}
              style={{ transition: "r 0.25s ease, opacity 0.25s ease" }} />
            <circle cx={n.x} cy={n.y} r={isActive ? 10 : 7} fill={col} opacity={dim ? 0.35 : 1}
              stroke={selectedNode === n.arch ? "#fff" : "none"} strokeWidth={2}
              style={{ transition: "r 0.25s ease, opacity 0.25s ease" }} />
            <text x={labelX} y={labelY} fill={dim ? "#5a5650" : col}
              fontSize={isActive ? 15 : 14} fontWeight={isActive ? 700 : 600}
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

/* Seçili çiftin gerçek lineup'ları */
function Drill({ cell, data, loading, onBack, lang }) {
  return (
    <div className="af-drill">
      <button className="af-back" onClick={onBack}>← Best pairs</button>
      <div className="af-drill-head">
        <span className="af-pill" style={{ "--c": ARCH_COLOR[cell.archA] }}>{cell.archA}</span>
        <span className="plus">+</span>
        <span className="af-pill" style={{ "--c": ARCH_COLOR[cell.archB] }}>{cell.archB}</span>
      </div>
      {data && (
        <p className="ex-muted">
          {data.total === 0
            ? (lang === "tr" ? "Bu sezon ortak lineup yok." : "No shared lineup this season.")
            : `${data.total} ${lang === "tr" ? "lineup" : data.total === 1 ? "lineup" : "lineups"}`}
          {data.avg_net != null && (
            <> · average net rating <b style={{ color: data.avg_net >= 0 ? GOOD : BAD }}>{data.avg_net > 0 ? "+" : ""}{data.avg_net.toFixed(1)}</b></>
          )}
        </p>
      )}
      {loading && <p className="ex-muted">Loading lineups…</p>}
      {!loading && data?.total === 0 && (
        <p className="ex-muted af-prior">
          {lang === "tr"
            ? "Bu iki arketip bu sezon hiçbir 5'li dizilimde birlikte sahaya çıkmadı. Buradaki sayı gözlemden değil, elle yazılmış arketip-uyum öncülünden geliyor."
            : "These two archetypes never shared a 5-man lineup this season. The number comes from the hand-written affinity prior, not from observation."}
        </p>
      )}
      {!loading && data?.lineups?.map((lu, i) => {
        const net = lu.NET_RATING;
        const players = lu.Players?.length ? lu.Players : (lu.GROUP_NAME || "").split(" - ");
        const archetypes = lu.Archetypes || [];
        return (
          <div key={i} className="af-lu">
            <div className="names">
              {players.map((p, j) => (
                <span key={j} style={{ "--c": ARCH_COLOR[archetypes[j]] || "#8b857e" }}><i />{p}</span>
              ))}
            </div>
            <div className="meta">
              <span>{Math.round(lu.MIN || 0)} min together</span>
              {lu.fit_score != null && <span>Fit <b>{Math.round(lu.fit_score * 100)}</b></span>}
              {net != null && <span>Net <b style={{ color: net >= 0 ? GOOD : BAD }}>{net > 0 ? "+" : ""}{net.toFixed(1)}</b></span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AffinityContent() {
  const { lang } = useLang();
  const [matrix, setMatrix]             = useState({});
  const [archs, setArchs]               = useState([]);
  const [sampleCounts, setSampleCounts] = useState({});
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(false);
  const [view, setView]                 = useState("grid");
  const [hoveredArch, setHoveredArch]   = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoverCell, setHoverCell]       = useState(null);
  const [drillCell, setDrillCell]       = useState(null); // {archA, archB}
  const [drillData, setDrillData]       = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    api.affinity()
      .then(d => { setMatrix(d.matrix || {}); setArchs(d.archetypes || []); setSampleCounts(d.sample_counts || {}); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openDrill = async (archA, archB) => {
    if (archA === archB) return;
    setDrillCell({ archA, archB });
    setDrillData(null);
    setDrillLoading(true);
    try { setDrillData(await api.affinityLineups(archA, archB, 10)); } catch { /* boş kalır */ }
    setDrillLoading(false);
  };

  const val = (a, b) => { const v = matrix[a]?.[b] ?? matrix[b]?.[a]; return v != null ? Number(v) : null; };
  const mins = (a, b) => sampleCounts[a]?.[b] ?? sampleCounts[b]?.[a] ?? 0;

  const bestPairs = useMemo(() => {
    const out = [];
    for (let i = 0; i < archs.length; i++)
      for (let j = i + 1; j < archs.length; j++) {
        const v = val(archs[i], archs[j]);
        if (v != null) out.push({ a: archs[i], b: archs[j], v, m: mins(archs[i], archs[j]) });
      }
    return out.sort((x, y) => y.v - x.v).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archs, matrix, sampleCounts]);

  const tint = drillCell ? ARCH_COLOR[drillCell.archA] : selectedNode ? ARCH_COLOR[selectedNode] : GOOD;
  const hv = hoverCell ? val(hoverCell.a, hoverCell.b) : null;

  return (
    <div className="ex-page">
      <div className="ex-inner">
        <ExploreHeader active="affinity" aside={
          <div className="ex-seg" role="tablist">
            {[["grid", "Grid"], ["network", "Network"]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""}
                onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
        } />

        {error ? <ErrorState onRetry={load} /> : loading ? (
          <div className="pa-skel" style={{ height: 480, borderRadius: 20 }} aria-busy="true" />
        ) : (
          <div className="af-grid">
            <section className="af-left">
              <div className="ex-h">
                <span>Pair affinity</span>
                <em>{hoverCell
                  ? `${hoverCell.a} + ${hoverCell.b} · ${hv != null ? Math.round(hv * 100) : "—"}${mins(hoverCell.a, hoverCell.b) ? ` · ${Math.round(mins(hoverCell.a, hoverCell.b))} lineup-min` : " · model prior only"}`
                  : "Real lineups blended with the model prior · 50 is neutral"}</em>
              </div>

              {view === "grid" ? (
                <div className="af-heat-wrap">
                  <div className="af-heat" style={{ gridTemplateColumns: `112px repeat(${archs.length}, var(--cell))` }}>
                    <span />
                    {archs.map(a => (
                      <span key={a} className={`hd${hoverCell?.b === a ? " on" : ""}`} title={a}>
                        <i style={{ background: ARCH_COLOR[a], boxShadow: `0 0 8px ${ARCH_COLOR[a]}` }} />
                      </span>
                    ))}
                    {archs.map(a => (
                      <div key={a} className="af-heat-row" style={{ display: "contents" }}>
                        <span className={`rl${hoverCell?.a === a ? " on" : ""}`}><i style={{ background: ARCH_COLOR[a] }} />{a}</span>
                        {archs.map(b => {
                          const v = val(a, b);
                          const self = a === b;
                          const prior = !self && mins(a, b) === 0;
                          const sel = drillCell && ((drillCell.archA === a && drillCell.archB === b) || (drillCell.archA === b && drillCell.archB === a));
                          return (
                            <button key={b} className={`cell${self ? " self" : ""}${prior ? " prior" : ""}${sel ? " sel" : ""}`}
                              style={{ background: heat(v), boxShadow: v != null && Math.abs(v - 0.5) > 0.2 ? `0 0 12px -4px ${v > 0.5 ? GOOD : BAD}` : undefined }}
                              title={`${a} + ${b} · ${v != null ? Math.round(v * 100) : "—"}${prior ? " · model prior only" : ""}`}
                              aria-label={`${a} with ${b}: ${v != null ? Math.round(v * 100) : "no value"}`}
                              disabled={self}
                              onMouseEnter={() => setHoverCell({ a, b })} onMouseLeave={() => setHoverCell(null)}
                              onFocus={() => setHoverCell({ a, b })} onBlur={() => setHoverCell(null)}
                              onClick={() => openDrill(a, b)} />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="af-scale">
                    <span>Clashes</span><i /><span>Wins together</span>
                    <span className="prior-key"><b />No shared lineup — model prior</span>
                  </div>
                </div>
              ) : (
                <div className="af-net">
                  <NetworkGraph archs={archs} matrix={matrix} sampleCounts={sampleCounts}
                    hoveredArch={hoveredArch} setHoveredArch={setHoveredArch}
                    selectedNode={selectedNode} setSelectedNode={setSelectedNode}
                    onEdgeClick={openDrill} />
                  <p className="ex-muted af-net-note">
                    Line colour is each end's archetype, thickness is strength. Dashed lines have no shared lineup this season. Click a line for its lineups.
                  </p>
                </div>
              )}
            </section>

            <aside className="af-right">
              {drillCell ? (
                <Drill cell={drillCell} data={drillData} loading={drillLoading} lang={lang}
                  onBack={() => { setDrillCell(null); setDrillData(null); }} />
              ) : (
                <>
                  <div className="ex-h"><span>Best pairs</span></div>
                  {bestPairs.map((p, i) => (
                    <button key={`${p.a}-${p.b}`} className="af-pair" onClick={() => openDrill(p.a, p.b)}>
                      <span className="rk">{i + 1}</span>
                      <span className="af-pill" style={{ "--c": ARCH_COLOR[p.a] }}>{p.a}</span>
                      <span className="plus">+</span>
                      <span className="af-pill" style={{ "--c": ARCH_COLOR[p.b] }}>{p.b}</span>
                      <span className="n">{p.m ? `${Math.round(p.m).toLocaleString("en-US")} min` : "prior only"}</span>
                      <b>{Math.round(p.v * 100)}</b>
                    </button>
                  ))}
                </>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
