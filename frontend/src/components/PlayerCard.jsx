import ScoreBar from "./ScoreBar";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

const ARCH_COLOR = {
  Engine:       "text-orange-400  border-orange-500/40",
  Ecosystem:    "text-green-400   border-green-500/40",
  Hub:          "text-teal-400    border-teal-500/40",
  Connector:    "text-purple-400  border-purple-500/40",
  Creator:      "text-rose-400    border-rose-500/40",
  Anchor:       "text-blue-400    border-blue-500/40",
  Spacer:       "text-cyan-400    border-cyan-500/40",
  Finisher:     "text-lime-400    border-lime-500/40",
  Force:        "text-red-400     border-red-500/40",
  Initiator:    "text-yellow-400  border-yellow-500/40",
  Stopper:      "text-slate-300   border-slate-500/40",
  "Rim Runner": "text-emerald-400 border-emerald-500/40",
};

const TIER_COLOR = {
  Elite:        "text-yellow-400",
  Star:         "text-amber-400",
  Starter:      "text-sky-400",
  "Role Player":"text-slate-500",
};

const TAG_LABEL = {
  "Point-": "Pt.Fwd", "3-and-D": "3&D",
  "Pick-and-Roll": "P&R", "Point-of-Attack": "PoA",
};
const tl = n => TAG_LABEL[n] || n;

export default function PlayerCard({ player, rank, onClick, discover, season }) {
  const arch  = player.primary_arch || "";
  const color = ARCH_COLOR[arch] || "text-slate-400 border-slate-600/40";
  const hasOverall = player.overall_score != null;
  const overall = hasOverall ? Math.round(player.overall_score * 100) : null;
  const tier  = player.overall_tier || "";
  const pct   = player.overall_pct != null ? Math.round(player.overall_pct * 100) : null;
  const topPctLabel = pct == null ? null : pct >= 99 ? "<1%" : `${100 - pct}%`;

  const scoreEntries = Object.entries(player)
    .filter(([k]) => k.startsWith("score_"))
    .map(([k, v]) => [k.replace("score_", ""), Number(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const rankColor = rank === 1 ? "text-yellow-400" : rank <= 3 ? "text-amber-400" : rank <= 10 ? "text-orange-400" : "text-slate-600";

  const pts = player.PTS != null ? Number(player.PTS).toFixed(1) : null;
  const reb = player.REB != null ? Number(player.REB).toFixed(1) : null;
  const ast = player.AST != null ? Number(player.AST).toFixed(1) : null;

  return (
    <div
      onClick={() => onClick && onClick(player)}
      className="cursor-pointer transition-colors"
      style={{
        background: "var(--bg-elevated)",
        border: discover
          ? "1px solid rgba(245,158,11,0.5)"
          : "1px solid var(--border)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = discover ? "rgba(245,158,11,0.8)" : "var(--accent-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = discover ? "rgba(245,158,11,0.5)" : "var(--border)"}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-start gap-2 min-w-0">
          {rank != null && (
            <span className={`text-xs font-bold shrink-0 mt-0.5 ${rankColor}`}>#{rank}</span>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>
              {player.PLAYER_NAME}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {player.TEAM_ABBREVIATION}{player.POSITION ? ` · ${player.POSITION}` : ""}
              {season && season !== "2025-26" ? ` · ${season}` : ""}
            </div>
          </div>
        </div>

        {/* Overall score */}
        <div className="text-right shrink-0 ml-2">
          {hasOverall ? (
            <>
              <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>{overall}</div>
              {topPctLabel && (
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>top {topPctLabel}</div>
              )}
            </>
          ) : (
            <div className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
              {player.GP || 0} gp
            </div>
          )}
        </div>
      </div>

      {/* Archetype + Tier */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${color}`}
          style={{ background: "transparent" }}>
          {arch || "—"}
        </span>
        {tier && (
          <span className={`text-[10px] font-medium ${TIER_COLOR[tier] || "text-slate-500"}`}>
            {tier}
          </span>
        )}
      </div>

      {/* Stats row */}
      {(pts || reb || ast) && (
        <div className="flex gap-4 mb-2.5">
          {[["PTS", pts], ["REB", reb], ["AST", ast]].map(([label, val]) =>
            val ? (
              <div key={label}>
                <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{val}</div>
                <div className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Top 3 score bars */}
      <div className="space-y-1">
        {scoreEntries.map(([comp, val]) => (
          <ScoreBar key={comp} label={tl(comp)} value={val} highlight={CORE.includes(comp)} />
        ))}
      </div>
    </div>
  );
}
