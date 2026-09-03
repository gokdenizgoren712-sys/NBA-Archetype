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

// Kazanma-korelasyonu şiddeti için dar, tematik bir sekans skalası — site
// genelindeki nötr/faint gri hiyerarşisiyle örtüşmüyor, GRADE_HEX/VAL_HEX gibi
// bu bileşene özgü küçük bir palet (bkz. DESIGN.md "one-off scale" prensibi).
const corrHex = (v) => {
  if (v >= 0.60) return "#3b82f6";
  if (v >= 0.40) return "#0ea5e9";
  if (v >= 0.25) return "#10b981";
  if (v >= 0.10) return "#4b5563";
  return "var(--text-faint)";
};

export default function RoleImpactChart() {
  const [data, setData]     = useState(null);
  const [sort, setSort]     = useState("impact"); // "impact" | "coverage" | "avg"
  const [open, setOpen]     = useState(false);

  useEffect(() => {
    fetch("/api/role-stats")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data?.roles) return null;

  const roles = [...data.roles].sort((a, b) => {
    if (sort === "impact")   return b.net_corr - a.net_corr;
    if (sort === "coverage") return b.coverage_rate - a.coverage_rate;
    return b.avg_score - a.avg_score;
  });

  const maxCorr = Math.max(...roles.map(r => r.net_corr));

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header — tıklanınca genişler */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full p-4 flex items-center justify-between transition-colors"
        style={{ "--hover-bg": "var(--bg-elevated)" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Season Role Impact</span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{data.season} · {data.n_qualified} players</span>
          {/* Mini preview — top 3 rolls */}
          {!open && (
            <div className="flex gap-1.5 ml-2">
              {data.by_impact.slice(0, 3).map((slot, i) => {
                const hex = i === 0 ? "#3b82f6" : i === 1 ? "#0ea5e9" : "#10b981";
                return (
                  <span key={slot} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                    style={{ background: hex + "26", color: hex }}>
                    {ROLE_SHORT[slot] || slot}
                  </span>
                );
              })}
              <span className="text-[10px] self-center" style={{ color: "var(--text-faint)" }}>→ wins</span>
            </div>
          )}
        </div>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* Insight text */}
          <div className="text-xs rounded-[8px] p-3 mb-4 leading-relaxed" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}>
            <span className="font-medium" style={{ color: "#60a5fa" }}>This season's winning formula: </span>
            {data.by_impact[0]} (r={roles.find(r=>r.slot===data.by_impact[0])?.net_corr.toFixed(2)}) and{" "}
            {data.by_impact[1]} (r={roles.find(r=>r.slot===data.by_impact[1])?.net_corr.toFixed(2)})
            {" "}are the roles most strongly correlated with winning.{" "}
            <span style={{ color: "var(--text-primary)" }}>Floor Spacing</span>, meanwhile, is only present in{" "}
            <span className="text-yamabuki">
              {(data.roles.find(r=>r.slot==="Floor Spacing")?.coverage_rate * 100).toFixed(0)}%
            </span> of the league — which is why even the best theoretical lineups show a red spacing slot.
          </div>

          {/* Sort buttons */}
          <div className="flex gap-1 mb-3">
            {[["impact","Win Correlation"],["coverage","League Coverage"],["avg","Avg Score"]].map(([k,l])=>(
              <button key={k} onClick={() => setSort(k)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  sort === k
                    ? "bg-[var(--accent)] text-[var(--bg-base)]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
                  <span className="w-6 text-[9px] font-mono shrink-0" style={{ color: "var(--text-faint)" }}>
                    {ROLE_SHORT[r.slot]}
                  </span>
                  <span className="w-32 text-[10px] shrink-0 truncate" style={{ color: "var(--text-muted)" }}>{r.slot}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(barW, 2)}%`, background: corrHex(r.net_corr) }}
                    />
                  </div>
                  <span className="w-10 text-right text-[10px] font-mono shrink-0" style={{ color: corrHex(r.net_corr) }}>
                    {sort === "impact"
                      ? `+${r.net_corr.toFixed(2)}`
                      : sort === "coverage"
                      ? `${(r.coverage_rate*100).toFixed(0)}%`
                      : (r.avg_score*100).toFixed(0)}
                  </span>
                  <span className="w-28 text-[9px] shrink-0" style={{ color: "var(--text-faint)" }}>{secondary}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
