import ScoreBar from "./ScoreBar";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

// Tüm 12 core arketip için renkler
const ARCH_COLOR = {
  Engine:       "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Ecosystem:    "bg-green-500/20 text-green-300 border-green-500/30",
  Hub:          "bg-teal-500/20 text-teal-300 border-teal-500/30",
  Connector:    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Creator:      "bg-rose-500/20 text-rose-300 border-rose-500/30",
  Anchor:       "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Spacer:       "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Finisher:     "bg-lime-500/20 text-lime-300 border-lime-500/30",
  Force:        "bg-red-500/20 text-red-300 border-red-500/30",
  Initiator:    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Stopper:      "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "Rim Runner": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const TIER_STYLE = {
  Elite:        "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  Star:         "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Starter:      "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Role Player":"bg-slate-700/40 text-slate-400 border-slate-600/30",
};

// Görüntü ismi haritası — kesik veya teknik etiketler için
const TAG_LABEL = {
  "Point-":       "Pt.Fwd",
  "3-and-D":      "3&D",
  "Pick-and-Roll":"P&R",
  "Half-Court":   "Half-Court",
  "Point-of-Attack": "PoA",
};

function tagLabel(name) {
  return TAG_LABEL[name] || name;
}

export default function PlayerCard({ player, rank, onClick }) {
  const arch  = player.primary_arch || "";
  const color = ARCH_COLOR[arch] || "bg-slate-700/30 text-slate-300 border-slate-600/30";
  const hasOverall = player.overall_score != null;
  const overall = hasOverall ? Math.round(player.overall_score * 100) : null;
  const tier  = player.overall_tier || "";
  const pct   = player.overall_pct != null ? Math.round(player.overall_pct * 100) : null;

  // "top 0%" → "top <1%"
  const topPctLabel = pct == null ? null : pct >= 99 ? "<1%" : `${100 - pct}%`;

  // Top 3 highest score components
  const scoreEntries = Object.entries(player)
    .filter(([k]) => k.startsWith("score_"))
    .map(([k, v]) => [k.replace("score_", ""), Number(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const rankColor = rank === 1 ? "text-yellow-400" : rank <= 3 ? "text-amber-300" : rank <= 10 ? "text-violet-400" : "text-slate-500";

  const pts = player.PTS != null ? Number(player.PTS).toFixed(1) : null;
  const reb = player.REB != null ? Number(player.REB).toFixed(1) : null;
  const ast = player.AST != null ? Number(player.AST).toFixed(1) : null;

  return (
    <div
      onClick={() => onClick && onClick(player)}
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 cursor-pointer hover:border-violet-500/50 hover:bg-slate-800/60 transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 min-w-0">
          {rank != null && (
            <span className={`text-xs font-bold shrink-0 mt-0.5 ${rankColor}`}>#{rank}</span>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm leading-tight truncate">{player.PLAYER_NAME}</div>
            <div className="text-xs text-slate-500 mt-0.5">{player.TEAM_ABBREVIATION} · {player.POSITION || "—"}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          {hasOverall ? (
            <>
              <div className="text-lg font-bold text-violet-400">{overall}</div>
              {topPctLabel && (
                <div className="text-[10px] text-slate-500">top {topPctLabel}</div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-slate-600">{player.GP || 0} gp</div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wide">no rank</div>
            </>
          )}
        </div>
      </div>

      {/* Archetype + Tier badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className={`inline-block text-xs px-2 py-0.5 rounded border ${color}`}>
          {arch || "—"}
        </span>
        {tier && (
          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${TIER_STYLE[tier] || ""}`}>
            {tier}
          </span>
        )}
      </div>

      {/* PTS / REB / AST satırı */}
      {(pts || reb || ast) && (
        <div className="flex gap-3 mb-2.5">
          {[["PTS", pts], ["REB", reb], ["AST", ast]].map(([label, val]) =>
            val ? (
              <div key={label} className="text-center">
                <div className="text-xs font-semibold text-white">{val}</div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Top 3 score bars */}
      <div className="space-y-1">
        {scoreEntries.map(([comp, val]) => (
          <ScoreBar key={comp} label={tagLabel(comp)} value={val} highlight={CORE.includes(comp)} />
        ))}
      </div>
    </div>
  );
}
