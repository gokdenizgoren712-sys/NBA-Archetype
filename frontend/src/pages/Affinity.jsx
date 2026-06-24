import { useState, useEffect } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import { X } from "lucide-react";

function cellStyle(value) {
  if (value === "" || value === null || value === undefined) return { bg: "bg-slate-900", text: "text-slate-700", label: "—" };
  const v = Number(value);
  if (isNaN(v)) return { bg: "bg-slate-900", text: "text-slate-700", label: "—" };
  const pct = Math.round(v * 100);
  const bg = v >= 0.72 ? "bg-violet-600/70"
           : v >= 0.65 ? "bg-blue-600/50"
           : v >= 0.55 ? "bg-emerald-700/40"
           : v >= 0.45 ? "bg-slate-700/50"
           :              "bg-red-900/30";
  const text = v >= 0.55 ? "text-white" : "text-slate-400";
  return { bg, text, label: pct };
}

const ARCH_DOT = {
  Engine:       "bg-orange-400",
  Ecosystem:    "bg-green-400",
  Hub:          "bg-teal-400",
  Connector:    "bg-purple-400",
  Creator:      "bg-rose-400",
  Anchor:       "bg-blue-400",
  Spacer:       "bg-cyan-400",
  Finisher:     "bg-lime-400",
  Force:        "bg-red-400",
  Initiator:    "bg-yellow-400",
  Stopper:      "bg-slate-400",
  "Rim Runner": "bg-emerald-400",
};

export default function Affinity() {
  const { lang } = useLang();
  const [matrix, setMatrix]     = useState({});
  const [archs, setArchs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("matrix");
  const [duos, setDuos]         = useState([]);
  const [duoLoading, setDuoLoading] = useState(false);
  const [duoA, setDuoA]         = useState("");
  const [hovered, setHovered]   = useState(null); // {row, col}
  const [sampleCounts, setSampleCounts] = useState({});
  const [drillCell, setDrillCell]   = useState(null); // {archA, archB}
  const [drillData, setDrillData]   = useState(null);
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

  // En güçlü arketip çiftlerini hesapla
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

  if (loading) return <div className="p-12 text-center text-slate-500">{lang === "tr" ? "Yükleniyor..." : "Loading..."}</div>;
  if (!archs.length) return <div className="p-12 text-center text-slate-500">{lang === "tr" ? "Affinity verisi bulunamadı." : "Affinity data not found."}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h2 className="text-white font-semibold text-lg">
          {lang === "tr" ? "Arketip Uyum Matrisi" : "Archetype Affinity Matrix"}
        </h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          {lang === "tr"
            ? "Gerçek 5'li lineup verilerinden hesaplanan ikili başarı skorları. Her hücre, o iki arketipin aynı lineup'ta yer aldığı maçlardaki ortalama başarıyı gösterir."
            : "Pairwise success scores computed from real 5-man lineup data. Each cell shows average win-weighted performance when those two archetypes share a lineup."}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {[["matrix", lang === "tr" ? "Matris" : "Matrix"],
          ["bestpairs", lang === "tr" ? "En İyi Çiftler" : "Best Pairs"],
          ["duos", lang === "tr" ? "Duo Arama" : "Duo Search"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === k ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}>{l}</button>
        ))}
      </div>

      {tab === "matrix" && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="border-collapse text-xs min-w-max">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="w-28 p-2 bg-slate-900/80"></th>
                  {archs.map(a => (
                    <th key={a} className="p-2 bg-slate-900/80 font-normal whitespace-nowrap text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${ARCH_DOT[a] || "bg-slate-500"}`}/>
                        <span className="text-slate-400 text-[11px]">{a}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {archs.map(row => (
                  <tr key={row} className="border-b border-slate-800/50">
                    <td className="p-2 bg-slate-900/60 font-medium whitespace-nowrap text-right pr-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${ARCH_DOT[row] || "bg-slate-500"}`}/>
                        <span className="text-slate-300 text-[11px]">{row}</span>
                      </div>
                    </td>
                    {archs.map(col => {
                      const raw = matrix[col]?.[row] ?? matrix[row]?.[col] ?? "";
                      const { bg, text, label } = cellStyle(raw);
                      const isDiag = row === col;
                      const isHov = hovered && (hovered.row === row || hovered.col === col || hovered.row === col || hovered.col === row);
                      const isSelected = drillCell && ((drillCell.archA === row && drillCell.archB === col) || (drillCell.archA === col && drillCell.archB === row));
                      const mins = sampleCounts[row]?.[col] ?? sampleCounts[col]?.[row];
                      return (
                        <td
                          key={col}
                          onMouseEnter={() => setHovered({ row, col })}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => !isDiag && openDrill(row, col)}
                          title={!isDiag && mins ? `${Math.round(mins)} lineup-dk` : undefined}
                          className={`p-1.5 text-center transition-all ${
                            isDiag ? "opacity-20 cursor-default" : "cursor-pointer hover:scale-110"
                          } ${isHov && !isDiag ? "ring-1 ring-white/20" : ""} ${isSelected ? "ring-2 ring-white/50" : ""}`}
                        >
                          <div className={`rounded px-2 py-1 ${bg} relative`}>
                            <span className={`${text} font-medium text-[11px]`}>{label}</span>
                            {mins != null && !isDiag && (
                              <span className="absolute -top-1 -right-1 text-[7px] bg-slate-700 text-slate-300 rounded px-0.5 leading-tight hidden group-hover:block">
                                {Math.round(mins / 60)}h
                              </span>
                            )}
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
          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-400">
            {[
              ["bg-violet-600/70", lang === "tr" ? "Çok güçlü (72+)" : "Very strong (72+)"],
              ["bg-blue-600/50",   lang === "tr" ? "Güçlü (65-72)" : "Strong (65-72)"],
              ["bg-emerald-700/40",lang === "tr" ? "Orta (55-65)" : "Average (55-65)"],
              ["bg-slate-700/50",  lang === "tr" ? "Zayıf (45-55)" : "Weak (45-55)"],
              ["bg-red-900/30",    lang === "tr" ? "Kötü (<45)" : "Poor (<45)"],
            ].map(([bg, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${bg}`}/>
                {label}
              </div>
            ))}
            <div className="text-slate-600 ml-2">
              {lang === "tr" ? "Hücreye tıkla → gerçek lineup'ları gör" : "Click a cell → see real lineups"}
            </div>
          </div>

          {/* Drill-down panel */}
          {drillCell && (
            <div className="mt-5 bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${ARCH_DOT[drillCell.archA] || "bg-slate-500"}`}/>
                  <span className="text-sm font-semibold text-white">{drillCell.archA}</span>
                  <span className="text-slate-600 text-xs">+</span>
                  <div className={`w-2.5 h-2.5 rounded-full ${ARCH_DOT[drillCell.archB] || "bg-slate-500"}`}/>
                  <span className="text-sm font-semibold text-white">{drillCell.archB}</span>
                  {drillData && (
                    <span className="text-[10px] text-slate-500 ml-2">
                      {lang === "tr" ? `${drillData.total} lineup` : `${drillData.total} lineups`}
                      {drillData.avg_net != null && (
                        <span className={`ml-1 font-semibold ${drillData.avg_net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {drillData.avg_net > 0 ? "+" : ""}{drillData.avg_net.toFixed(1)} NET
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <button onClick={() => { setDrillCell(null); setDrillData(null); }}
                  className="text-slate-500 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>

              {drillLoading && <div className="text-center text-slate-500 text-sm py-4">Loading...</div>}
              {!drillLoading && drillData?.total === 0 && (
                <div className="text-center text-slate-600 text-xs py-4">
                  {lang === "tr" ? "Bu çift için gerçek lineup verisi bulunamadı." : "No real lineup data found for this pair."}
                </div>
              )}
              {!drillLoading && drillData?.lineups?.length > 0 && (
                <div className="space-y-2">
                  {drillData.lineups.map((lu, i) => {
                    const net = lu.NET_RATING;
                    const netColor = net >= 10 ? "text-emerald-400" : net >= 0 ? "text-blue-300" : "text-red-400";
                    const players = (lu.GROUP_NAME || "").split(" - ");
                    return (
                      <div key={i} className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-slate-600 w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-x-1">
                            {players.map((p, j) => (
                              <span key={j} className="text-[11px] text-white">{p}{j < players.length - 1 ? " ·" : ""}</span>
                            ))}
                          </div>
                          <div className="text-[9px] text-slate-500 mt-0.5">{Math.round(lu.MIN || 0)} min</div>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          {lu.fit_score != null && (
                            <div className="text-center">
                              <div className="text-sm font-bold text-violet-400">{Math.round(lu.fit_score * 100)}</div>
                              <div className="text-[8px] text-slate-600">Fit</div>
                            </div>
                          )}
                          {net != null && (
                            <div className="text-center">
                              <div className={`text-sm font-bold ${netColor}`}>{net > 0 ? "+" : ""}{net.toFixed(1)}</div>
                              <div className="text-[8px] text-slate-600">NET</div>
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
            const { bg, text } = cellStyle(v);
            return (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                <span className="text-slate-600 text-xs w-5 shrink-0">#{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`flex items-center gap-1 text-sm font-medium`}>
                      <div className={`w-2 h-2 rounded-full ${ARCH_DOT[a] || "bg-slate-500"}`}/>
                      <span className="text-white">{a}</span>
                    </div>
                    <span className="text-slate-600 text-xs">+</span>
                    <div className={`flex items-center gap-1 text-sm font-medium`}>
                      <div className={`w-2 h-2 rounded-full ${ARCH_DOT[b] || "bg-slate-500"}`}/>
                      <span className="text-white">{b}</span>
                    </div>
                  </div>
                </div>
                <div className={`rounded-lg px-3 py-1 ${bg}`}>
                  <span className={`${text} font-bold text-base`}>{Math.round(v * 100)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "duos" && (
        <div>
          <div className="mb-4 flex gap-2 items-center">
            <div className="text-sm text-slate-400">
              {lang === "tr" ? "Arketip seç:" : "Filter by archetype:"}
            </div>
            <select value={duoA} onChange={e => setDuoA(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">{lang === "tr" ? "Tümü" : "All"}</option>
              {archs.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {duoLoading ? (
            <div className="text-slate-500 text-sm">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {duos
                .filter(p => !duoA || p.primary_arch === duoA)
                .slice(0, 20)
                .map((p, i) => {
                  const partnerArchs = archs.filter(a => a !== p.primary_arch)
                    .map(a => ({ a, v: matrix[p.primary_arch]?.[a] ?? matrix[a]?.[p.primary_arch] ?? 0 }))
                    .sort((x, y) => y.v - x.v)
                    .slice(0, 3);
                  return (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${ARCH_DOT[p.primary_arch] || "bg-slate-500"}`}/>
                        <span className="text-white text-sm font-medium">{p.PLAYER_NAME}</span>
                        <span className="text-slate-500 text-xs">{p.TEAM_ABBREVIATION}</span>
                        <span className="text-xs text-slate-600 ml-auto">{p.primary_arch}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mb-1">
                        {lang === "tr" ? "En iyi çiftler:" : "Best pair archetypes:"}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {partnerArchs.map(({ a, v }) => {
                          const { bg, text } = cellStyle(v);
                          return (
                            <div key={a} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${bg}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${ARCH_DOT[a] || "bg-slate-500"}`}/>
                              <span className={text}>{a} · {Math.round(v * 100)}</span>
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
  );
}
