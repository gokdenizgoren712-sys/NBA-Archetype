/**
 * Season Role Impact Chart
 * Her rolün bu sezondaki kazanma korelasyonu + lig kapsama oranı.
 */
import { useState, useEffect } from "react";
import { api } from "../api";

const ROLE_SHORT = {
  "Primary Creation":     "PRI",
  "Secondary Playmaking": "2ND",
  "Floor Spacing":        "SPC",
  "Interior Defense":     "INT",
  "Perimeter Defense":    "PER",
  "Physical Force":       "PHY",
  "Finishing":            "FIN",
  "Two-Way Defense":      "2WY",
  "Shot Creation":        "SCR",
  "Transition":           "TRN",
};

const corrColor = (v) => {
  if (v >= 0.60) return "bg-blue-500";
  if (v >= 0.40) return "bg-sky-500";
  if (v >= 0.25) return "bg-emerald-500";
  if (v >= 0.10) return "bg-gray-600";
  return "bg-surfaceCard";
};

const corrText = (v) => {
  if (v >= 0.60) return "text-blue-400";
  if (v >= 0.40) return "text-sky-400";
  if (v >= 0.25) return "text-emerald-400";
  return "text-gray-500";
};

export default function RoleImpactChart() {
  const [data, setData]     = useState(null);
  const [sort, setSort]     = useState("impact"); // "impact" | "coverage" | "avg"
  const [open, setOpen]     = useState(false);

  useEffect(() => {
    fetch("/api/role-stats")
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return null;

  const roles = [...data.roles].sort((a, b) => {
    if (sort === "impact")   return b.net_corr - a.net_corr;
    if (sort === "coverage") return b.coverage_rate - a.coverage_rate;
    return b.avg_score - a.avg_score;
  });

  const maxCorr = Math.max(...roles.map(r => r.net_corr));

  return (
    <div className="bg-surfaceBg border border-gray-800 rounded-2xl overflow-hidden mb-6">
      {/* Header — tıklanınca genişler */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 flex items-center justify-between hover:bg-surfaceCard/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Season Role Impact</span>
          <span className="text-xs text-gray-500">{data.season} · {data.n_qualified} players</span>
          {/* Mini preview — top 3 rolls */}
          {!open && (
            <div className="flex gap-1.5 ml-2">
              {data.by_impact.slice(0, 3).map((slot, i) => (
                <span key={slot} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  i === 0 ? "bg-blue-900/60 text-blue-300" :
                  i === 1 ? "bg-sky-900/60 text-sky-300" :
                           "bg-emerald-900/60 text-emerald-300"
                }`}>
                  {ROLE_SHORT[slot] || slot}
                </span>
              ))}
              <span className="text-gray-600 text-[10px] self-center">→ wins</span>
            </div>
          )}
        </div>
        <span className="text-gray-500 text-sm">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* Insight text */}
          <div className="text-xs text-gray-400 bg-surfaceCard/60 rounded-lg p-3 mb-4 leading-relaxed">
            <span className="text-blue-300 font-medium">This season's winning formula: </span>
            {data.by_impact[0]} (r={roles.find(r=>r.slot===data.by_impact[0])?.net_corr.toFixed(2)}) and{" "}
            {data.by_impact[1]} (r={roles.find(r=>r.slot===data.by_impact[1])?.net_corr.toFixed(2)})
            {" "}are the roles most strongly correlated with winning.{" "}
            <span className="text-gray-300">Floor Spacing</span>, meanwhile, is only present in{" "}
            <span className="text-yamabuki">
              {(data.roles.find(r=>r.slot==="Floor Spacing")?.coverage_rate * 100).toFixed(0)}%
            </span> of the league — which is why even the best theoretical lineups show a red spacing slot.
          </div>

          {/* Sort buttons */}
          <div className="flex gap-1 mb-3">
            {[["impact","Win Correlation"],["coverage","League Coverage"],["avg","Avg Score"]].map(([k,l])=>(
              <button key={k} onClick={() => setSort(k)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  sort === k ? "bg-blue-700 text-white" : "bg-surfaceCard text-gray-400 hover:text-white"
                }`}>{l}</button>
            ))}
          </div>

          {/* Chart */}
          <div className="space-y-2">
            {roles.map(r => {
              const barW = sort === "impact"
                ? (r.net_corr / maxCorr) * 100
                : sort === "coverage"
                ? r.coverage_rate * 100
                : r.avg_score * 100;

              const secondary = sort === "impact"
                ? `${(r.coverage_rate * 100).toFixed(0)}% cov · ${r.n_players} players`
                : sort === "coverage"
                ? `win corr ${r.net_corr > 0 ? "+" : ""}${r.net_corr.toFixed(2)}`
                : `win corr ${r.net_corr > 0 ? "+" : ""}${r.net_corr.toFixed(2)}`;

              return (
                <div key={r.slot} className="flex items-center gap-2">
                  <span className="w-6 text-[9px] text-gray-600 font-mono shrink-0">
                    {ROLE_SHORT[r.slot]}
                  </span>
                  <span className="w-32 text-[10px] text-gray-400 shrink-0 truncate">{r.slot}</span>
                  <div className="flex-1 h-3 bg-surfaceCard rounded-full overflow-hidden">
                    <div
                      className={`h-full ${corrColor(r.net_corr)} rounded-full transition-all`}
                      style={{ width: `${Math.max(barW, 2)}%` }}
                    />
                  </div>
                  <span className={`w-10 text-right text-[10px] font-mono shrink-0 ${corrText(r.net_corr)}`}>
                    {sort === "impact"
                      ? `+${r.net_corr.toFixed(2)}`
                      : sort === "coverage"
                      ? `${(r.coverage_rate*100).toFixed(0)}%`
                      : (r.avg_score*100).toFixed(0)}
                  </span>
                  <span className="w-28 text-[9px] text-gray-600 shrink-0">{secondary}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
