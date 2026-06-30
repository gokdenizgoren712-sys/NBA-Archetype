import { useState, useEffect } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import SplitPane from "../components/SplitPane";
import { SEO } from "../hooks/useSEO";

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
  Stopper:      "#94a3b8",
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
    <button onClick={onClick}
      className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent)" : "var(--bg-elevated)",
        color:      active ? "var(--bg-base)" : "var(--text-muted)",
        border:     "1px solid " + (active ? "var(--accent)" : "var(--border)"),
      }}>
      {children}
    </button>
  );
}

// ── Detail panel: drill-down için seçili çift ────────────────────────────────
function DrillPanel({ cell, data, loading, onClose, lang }) {
  if (!cell) return null;
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b shrink-0 flex items-start justify-between"
        style={{ borderColor: "var(--border)" }}>
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
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                {data.total} {lang === "tr" ? "lineup" : "lineups"}
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
          <div className="text-center text-xs py-8" style={{ color: "var(--text-faint)" }}>
            {lang === "tr"
              ? "Bu çift için gerçek lineup verisi bulunamadı."
              : "No real lineup data found for this pair."}
          </div>
        )}
        {!loading && data?.lineups?.map((lu, i) => {
          const net = lu.NET_RATING;
          const netColor = net >= 10 ? "#34d399" : net >= 0 ? "#60a5fa" : "#f87171";
          const players = (lu.GROUP_NAME || "").split(" - ");
          return (
            <div key={i} className="rounded-lg px-3 py-2.5"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-2">
                <span className="text-[10px] w-4 shrink-0 mt-0.5" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-x-1 mb-0.5">
                    {players.map((p, j) => (
                      <span key={j} className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {p}{j < players.length - 1 ? " ·" : ""}
                      </span>
                    ))}
                  </div>
                  <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                    {Math.round(lu.MIN || 0)} min
                  </span>
                </div>
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

export default function Affinity() {
  const { lang } = useLang();
  const [matrix, setMatrix]             = useState({});
  const [archs, setArchs]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [tab, setTab]                   = useState("matrix");
  const [duos, setDuos]                 = useState([]);
  const [duoLoading, setDuoLoading]     = useState(false);
  const [duoA, setDuoA]                 = useState("");
  const [hovered, setHovered]           = useState(null);
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
      <div className="px-4 pt-4 pb-3 shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
          {lang === "tr" ? "Arketip Uyum Matrisi" : "Archetype Affinity Matrix"}
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {lang === "tr"
            ? "Gerçek 5'li lineup verisinden ikili başarı skorları. Hücreye tıkla → gerçek lineup'ları gör."
            : "Pairwise success scores from real 5-man lineups. Click a cell to see real lineups."}
        </p>
        <div className="flex gap-1 flex-wrap">
          {[
            ["matrix",    lang === "tr" ? "Matris"    : "Matrix"],
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
          <>
            <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
              <table className="border-collapse text-xs min-w-max">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="w-24 p-2" style={{ background: "var(--bg-surface)" }} />
                    {archs.map(a => (
                      <th key={a} className="p-2 font-normal whitespace-nowrap text-center"
                        style={{ background: "var(--bg-surface)" }}>
                        <div className="flex flex-col items-center gap-1">
                          <Dot arch={a} />
                          <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{a}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {archs.map(row => (
                    <tr key={row} className="border-b" style={{ borderColor: "var(--border)" + "40" }}>
                      <td className="p-2 font-medium whitespace-nowrap text-right pr-3"
                        style={{ background: "var(--bg-surface)" }}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Dot arch={row} />
                          <span style={{ color: "var(--text-primary)", fontSize: 10 }}>{row}</span>
                        </div>
                      </td>
                      {archs.map(col => {
                        const raw = matrix[col]?.[row] ?? matrix[row]?.[col] ?? "";
                        const { bg, label } = cellStyle(raw);
                        const isDiag = row === col;
                        const isHov = hovered && (
                          hovered.row === row || hovered.col === col ||
                          hovered.row === col || hovered.col === row
                        );
                        const isSelected = drillCell && (
                          (drillCell.archA === row && drillCell.archB === col) ||
                          (drillCell.archA === col && drillCell.archB === row)
                        );
                        const mins = sampleCounts[row]?.[col] ?? sampleCounts[col]?.[row];
                        return (
                          <td key={col}
                            onMouseEnter={() => setHovered({ row, col })}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => !isDiag && openDrill(row, col)}
                            title={!isDiag && mins ? `${Math.round(mins)} lineup-min` : undefined}
                            className="p-1 text-center transition-all"
                            style={{ cursor: isDiag ? "default" : "pointer" }}>
                            <div className="rounded px-1.5 py-1"
                              style={{
                                background: isDiag ? "var(--bg-elevated)" : bg,
                                opacity: isDiag ? 0.25 : 1,
                                outline: isSelected
                                  ? "2px solid var(--accent)"
                                  : isHov && !isDiag ? "1px solid var(--border)" : "none",
                                outlineOffset: 1,
                              }}>
                              <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 10 }}>
                                {label}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-2" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {[
                ["rgba(124,58,237,0.55)", "72+"],
                ["rgba(37,99,235,0.45)",  "65–72"],
                ["rgba(5,150,105,0.35)",  "55–65"],
                ["rgba(100,116,139,0.30)","45–55"],
                ["rgba(185,28,28,0.25)",  "<45"],
              ].map(([bg, label]) => (
                <div key={label} className="flex items-center gap-1">
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "bestpairs" && (
          <div className="space-y-2">
            {bestPairs.slice(0, 20).map(({ a, b, v }, i) => {
              const { bg } = cellStyle(v);
              return (
                <button key={i} onClick={() => openDrill(a, b)}
                  className="w-full flex items-center gap-3 p-3 rounded text-left transition-colors"
                  style={{
                    background: drillCell?.archA === a && drillCell?.archB === b
                      ? "var(--accent-dim)" : "var(--bg-elevated)",
                    border: "1px solid " + (drillCell?.archA === a && drillCell?.archB === b
                      ? "var(--accent-border)" : "var(--border)"),
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
              <select value={duoA} onChange={e => setDuoA(e.target.value)}
                className="rounded px-2 py-1 text-xs focus:outline-none flex-1"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                <option value="">{lang === "tr" ? "Tümü" : "All archetypes"}</option>
                {archs.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {duoLoading ? (
              <div className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>Loading...</div>
            ) : (
              <div className="space-y-2">
                {duos
                  .filter(p => !duoA || p.primary_arch === duoA)
                  .slice(0, 24)
                  .map((p, i) => {
                    const partnerArchs = archs
                      .filter(a => a !== p.primary_arch)
                      .map(a => ({ a, v: matrix[p.primary_arch]?.[a] ?? matrix[a]?.[p.primary_arch] ?? 0 }))
                      .sort((x, y) => y.v - x.v)
                      .slice(0, 3);
                    const archColor = ARCH_COLOR[p.primary_arch] || "var(--accent)";
                    return (
                      <div key={i} className="p-3 rounded"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Dot arch={p.primary_arch} />
                          <span className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                            {p.PLAYER_NAME}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                            {p.TEAM_ABBREVIATION}
                          </span>
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                            style={{ color: archColor, border: `1px solid ${archColor}40`, background: `${archColor}15` }}>
                            {p.primary_arch}
                          </span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {partnerArchs.map(({ a, v }) => {
                            const { bg } = cellStyle(v);
                            return (
                              <button key={a} onClick={() => openDrill(p.primary_arch, a)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-opacity hover:opacity-75"
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
    <>
    <SEO
      title="Archetype Affinity Matrix"
      description="Discover which NBA archetypes work best together. Explore affinity scores between all 12 player roles, with real lineup drill-downs showing net rating data."
      path="/affinity"
    />
    <SplitPane detail={detail} onClose={() => { setDrillCell(null); setDrillData(null); }}>
      {leftPanel}
    </SplitPane>
    </>
  );
}
