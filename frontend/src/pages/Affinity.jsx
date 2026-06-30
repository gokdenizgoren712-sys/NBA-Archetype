import { useState, useEffect } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";

function cellStyle(value) {
  if (value === "" || value === null || value === undefined) return { bg: "var(--bg-elevated)", text: "var(--text-faint)", label: "—" };
  const v = Number(value);
  if (isNaN(v)) return { bg: "var(--bg-elevated)", text: "var(--text-faint)", label: "—" };
  const pct = Math.round(v * 100);
  // Renk skalası — CSS rgba ile her temaya uyar
  const bg = v >= 0.72 ? "rgba(124,58,237,0.55)"
           : v >= 0.65 ? "rgba(37,99,235,0.45)"
           : v >= 0.55 ? "rgba(5,150,105,0.35)"
           : v >= 0.45 ? "rgba(100,116,139,0.30)"
           :              "rgba(185,28,28,0.25)";
  return { bg, label: pct };
}

const ARCH_DOT = {
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

function Dot({ arch }) {
  const color = ARCH_DOT[arch] || "var(--text-muted)";
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />;
}

export default function Affinity() {
  const { lang } = useLang();
  const [matrix, setMatrix]           = useState({});
  const [archs, setArchs]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [tab, setTab]                 = useState("matrix");
  const [duos, setDuos]               = useState([]);
  const [duoLoading, setDuoLoading]   = useState(false);
  const [duoA, setDuoA]               = useState("");
  const [hovered, setHovered]         = useState(null);
  const [sampleCounts, setSampleCounts] = useState({});
  const [drillCell, setDrillCell]     = useState(null);
  const [drillData, setDrillData]     = useState(null);
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
    for (let i = 0; i < archs.length; i++) {
      for (let j = i + 1; j < archs.length; j++) {
        const a = archs[i], b = archs[j];
        const v = matrix[a]?.[b] ?? matrix[b]?.[a];
        if (v != null) bestPairs.push({ a, b, v: Number(v) });
      }
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-6xl mx-auto pb-10">
        <div className="mb-5">
          <h2 className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
            {lang === "tr" ? "Arketip Uyum Matrisi" : "Archetype Affinity Matrix"}
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)", maxWidth: "42rem" }}>
            {lang === "tr"
              ? "Gerçek 5'li lineup verilerinden hesaplanan ikili başarı skorları. Bir hücreye tıkla → o iki arketipin birlikte oynadığı gerçek lineup'ları gör."
              : "Pairwise success scores from real 5-man lineup data. Click a cell to see actual lineups that featured both archetypes together."}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5">
          {[
            ["matrix",    lang === "tr" ? "Matris"        : "Matrix"],
            ["bestpairs", lang === "tr" ? "En İyi Çiftler": "Best Pairs"],
            ["duos",      lang === "tr" ? "Oyuncu Duoları": "Player Duos"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
              style={{
                background: tab === k ? "var(--accent)" : "var(--bg-elevated)",
                color:      tab === k ? "var(--bg-base)" : "var(--text-muted)",
                border:     "1px solid " + (tab === k ? "var(--accent)" : "var(--border)"),
              }}>
              {l}
            </button>
          ))}
        </div>

        {tab === "matrix" && (
          <>
            <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
              <table className="border-collapse text-xs min-w-max">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="w-28 p-2" style={{ background: "var(--bg-surface)" }} />
                    {archs.map(a => (
                      <th key={a} className="p-2 font-normal whitespace-nowrap text-center"
                        style={{ background: "var(--bg-surface)" }}>
                        <div className="flex flex-col items-center gap-1">
                          <Dot arch={a} />
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{a}</span>
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
                          <span style={{ color: "var(--text-primary)", fontSize: 11 }}>{row}</span>
                        </div>
                      </td>
                      {archs.map(col => {
                        const raw = matrix[col]?.[row] ?? matrix[row]?.[col] ?? "";
                        const { bg, label } = cellStyle(raw);
                        const isDiag = row === col;
                        const isHov = hovered && (hovered.row === row || hovered.col === col || hovered.row === col || hovered.col === row);
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
                            className="p-1.5 text-center transition-all"
                            style={{ cursor: isDiag ? "default" : "pointer" }}>
                            <div className="rounded px-2 py-1 transition-all"
                              style={{
                                background: isDiag ? "var(--bg-elevated)" : bg,
                                opacity: isDiag ? 0.3 : 1,
                                outline: isSelected ? "2px solid var(--accent)" : isHov && !isDiag ? "1px solid var(--border)" : "none",
                                outlineOffset: 1,
                              }}>
                              <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 11 }}>{label}</span>
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
            <div className="mt-4 flex flex-wrap gap-3" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {[
                ["rgba(124,58,237,0.55)", lang === "tr" ? "Çok güçlü (72+)"  : "Very strong (72+)"],
                ["rgba(37,99,235,0.45)",  lang === "tr" ? "Güçlü (65–72)"    : "Strong (65–72)"],
                ["rgba(5,150,105,0.35)",  lang === "tr" ? "Orta (55–65)"     : "Average (55–65)"],
                ["rgba(100,116,139,0.30)",lang === "tr" ? "Zayıf (45–55)"    : "Weak (45–55)"],
                ["rgba(185,28,28,0.25)",  lang === "tr" ? "Kötü (<45)"       : "Poor (<45)"],
              ].map(([bg, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
              <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>
                {lang === "tr" ? "Hücreye tıkla → gerçek lineup'ları gör" : "Click a cell → see real lineups"}
              </span>
            </div>

            {/* Drill-down panel */}
            {drillCell && (
              <div className="mt-5 rounded p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Dot arch={drillCell.archA} />
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{drillCell.archA}</span>
                    <span style={{ color: "var(--text-faint)", fontSize: 11 }}>+</span>
                    <Dot arch={drillCell.archB} />
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{drillCell.archB}</span>
                    {drillData && (
                      <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 4 }}>
                        {drillData.total} {lang === "tr" ? "lineup" : "lineups"}
                        {drillData.avg_net != null && (
                          <span style={{ marginLeft: 4, fontWeight: 600, color: drillData.avg_net >= 0 ? "#34d399" : "#f87171" }}>
                            {drillData.avg_net > 0 ? "+" : ""}{drillData.avg_net.toFixed(1)} NET
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setDrillCell(null); setDrillData(null); }}
                    className="text-lg leading-none transition-colors"
                    style={{ color: "var(--text-muted)" }}>×</button>
                </div>

                {drillLoading && (
                  <div className="text-center text-sm py-4" style={{ color: "var(--text-muted)" }}>Loading...</div>
                )}
                {!drillLoading && drillData?.total === 0 && (
                  <div className="text-center text-xs py-4" style={{ color: "var(--text-faint)" }}>
                    {lang === "tr" ? "Bu çift için gerçek lineup verisi bulunamadı." : "No real lineup data found for this pair."}
                  </div>
                )}
                {!drillLoading && drillData?.lineups?.length > 0 && (
                  <div className="space-y-2">
                    {drillData.lineups.map((lu, i) => {
                      const net = lu.NET_RATING;
                      const netColor = net >= 10 ? "#34d399" : net >= 0 ? "#60a5fa" : "#f87171";
                      const players = (lu.GROUP_NAME || "").split(" - ");
                      return (
                        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2"
                          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", width: 16, flexShrink: 0 }}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap gap-x-1">
                              {players.map((p, j) => (
                                <span key={j} style={{ fontSize: 11, color: "var(--text-primary)" }}>
                                  {p}{j < players.length - 1 ? " ·" : ""}
                                </span>
                              ))}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--text-faint)", marginTop: 2 }}>
                              {Math.round(lu.MIN || 0)} min
                            </div>
                          </div>
                          <div className="flex gap-3 shrink-0">
                            {lu.fit_score != null && (
                              <div className="text-center">
                                <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                                  {Math.round(lu.fit_score * 100)}
                                </div>
                                <div style={{ fontSize: 8, color: "var(--text-faint)" }}>Fit</div>
                              </div>
                            )}
                            {net != null && (
                              <div className="text-center">
                                <div className="text-sm font-bold" style={{ color: netColor }}>
                                  {net > 0 ? "+" : ""}{net.toFixed(1)}
                                </div>
                                <div style={{ fontSize: 8, color: "var(--text-faint)" }}>NET</div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === "bestpairs" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bestPairs.slice(0, 18).map(({ a, b, v }, i) => {
              const { bg } = cellStyle(v);
              return (
                <div key={i} className="rounded p-4 flex items-center gap-4"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 10, color: "var(--text-faint)", width: 20, flexShrink: 0 }}>#{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Dot arch={a} />
                        <span style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 13 }}>{a}</span>
                      </div>
                      <span style={{ color: "var(--text-faint)", fontSize: 11 }}>+</span>
                      <div className="flex items-center gap-1">
                        <Dot arch={b} />
                        <span style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: 13 }}>{b}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-1" style={{ background: bg }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 16 }}>{Math.round(v * 100)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "duos" && (
          <div>
            <div className="mb-4 flex gap-2 items-center">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {lang === "tr" ? "Arketip:" : "Filter:"}
              </span>
              <select value={duoA} onChange={e => setDuoA(e.target.value)}
                className="rounded px-3 py-1.5 text-sm focus:outline-none"
                style={{
                  background: "var(--bg-elevated)", color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}>
                <option value="">{lang === "tr" ? "Tümü" : "All archetypes"}</option>
                {archs.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {duoLoading ? (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {duos
                  .filter(p => !duoA || p.primary_arch === duoA)
                  .slice(0, 20)
                  .map((p, i) => {
                    const partnerArchs = archs
                      .filter(a => a !== p.primary_arch)
                      .map(a => ({ a, v: matrix[p.primary_arch]?.[a] ?? matrix[a]?.[p.primary_arch] ?? 0 }))
                      .sort((x, y) => y.v - x.v)
                      .slice(0, 3);
                    const archColor = ARCH_DOT[p.primary_arch] || "var(--accent)";
                    return (
                      <div key={i} className="rounded p-3"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <Dot arch={p.primary_arch} />
                          <span className="font-medium" style={{ color: "var(--text-primary)", fontSize: 13 }}>
                            {p.PLAYER_NAME}
                          </span>
                          <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{p.TEAM_ABBREVIATION}</span>
                          <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{
                            color: archColor, border: `1px solid ${archColor}50`, background: `${archColor}15`,
                          }}>{p.primary_arch}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4 }}>
                          {lang === "tr" ? "En iyi çift arketipler:" : "Best pair archetypes:"}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {partnerArchs.map(({ a, v }) => {
                            const { bg } = cellStyle(v);
                            const dot = ARCH_DOT[a] || "var(--text-muted)";
                            return (
                              <div key={a} className="flex items-center gap-1 px-2 py-0.5 rounded"
                                style={{ background: bg, fontSize: 10 }}>
                                <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:dot, flexShrink:0 }}/>
                                <span style={{ color: "var(--text-primary)" }}>{a} · {Math.round(v * 100)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
