import { useState } from "react";
import { getPlayerTags } from "./awards";
import { costColor } from "./salary";

export { posGroupOf } from "./positions";

function headshotUrl(p) {
  return p.PLAYER_ID ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.PLAYER_ID}.png` : null;
}

// Kompakt tag rozeti — baş harf + renk (uzun label yerine)
function TagBadge({ t }) {
  return (
    <span title={t.detail}
      className="inline-flex items-center justify-center text-[8.5px] font-bold rounded leading-none shrink-0 px-1 h-[15px] min-w-[15px]"
      style={{ color: t.color, background: t.color + "22", border: `1px solid ${t.color}66` }}>
      {t.abbr}
    </span>
  );
}

// ── Oyuncu satırı (eraball tarzı liste) ──────────────────────────────────────
export default function PlayerRow({ player, discover, onClick, cost, unaffordable, highlightStat }) {
  const [imgOk, setImgOk] = useState(true);
  const stat = (k) => {
    const v = player[k];
    if (v == null || isNaN(+v)) return "—";
    if (k === "FG3_PCT") return `${Math.round(+v * 100)}%`;
    return (+v).toFixed(1);
  };
  const overall = player.overall_score != null ? Math.round(player.overall_score * 100) : null;
  const tags = getPlayerTags(player);
  const url = headshotUrl(player);
  const cell = (k) => (
    <span className={`w-9 text-right tabular-nums shrink-0 text-xs
      ${highlightStat === k ? "font-bold" : "text-gray-500"}`}
      style={highlightStat === k ? { color: "#e2b34c" } : {}}>
      {stat(k)}
    </span>
  );
  return (
    <button onClick={onClick} disabled={unaffordable}
      className={`w-full min-w-[560px] flex items-center gap-2 pr-3 py-2.5 border-b text-left transition-colors
        ${unaffordable ? "opacity-30 cursor-not-allowed" : "hover:bg-surfaceCard/70 cursor-pointer group"}`}
      style={{ borderColor: "rgba(30,41,59,.6)" }}>
      {/* Sabit sol blok (yatay kaydırmada pinli): avatar + isim + arketip + rozetler */}
      <div className="sticky left-0 z-10 flex items-center gap-2 pl-3 pr-2 py-0.5 shrink-0 w-[240px]"
        style={{ background: "var(--bg-surface, #131313)" }}>
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-gray-700 bg-surfaceCard flex items-center justify-center">
          {url && imgOk ? (
            <img src={url} alt="" loading="lazy" onError={() => setImgOk(false)}
              className="w-full h-full object-cover object-top" />
          ) : (
            <span className="text-[11px] font-bold text-gray-500">
              {player.PLAYER_NAME?.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-logo text-[13px] font-semibold text-white truncate leading-tight">{player.PLAYER_NAME}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-gray-500 shrink-0">{player.POSITION || player.POS5 || ""}</span>
            <span className="text-[10px] text-blue-400 font-medium truncate">{player.primary_arch || "—"}</span>
            {tags.slice(0, 3).map(t => <TagBadge key={t.key} t={t} />)}
          </div>
        </div>
      </div>
      {/* TAG sayısı sütunu */}
      <span className="w-8 text-center shrink-0 text-xs tabular-nums"
        title={tags.length ? tags.map(t => t.label).join(" · ") : "No tags"}>
        {tags.length ? <span className="text-gray-300 font-bold">{tags.length}</span> : <span className="text-gray-700">–</span>}
      </span>
      {/* Sözleşme maliyeti (Salary Cap) */}
      {cost != null && (
        <span className="text-xs font-black shrink-0 tabular-nums px-1 py-0.5 rounded"
          style={{ color: costColor(cost), background: costColor(cost) + "14", border: `1px solid ${costColor(cost)}44` }}
          title={unaffordable ? `Costs ${cost}% — over your spendable cap` : `Contract: ${cost}% of the cap`}>
          {cost}%
        </span>
      )}
      {/* Discover: yalnızca overall'ı ifşa eder */}
      {discover && overall != null && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-700/50 bg-violet-900/30 text-violet-300 font-bold shrink-0">{overall}</span>
      )}
      {/* İstatistikler */}
      {cell("PTS")}{cell("REB")}{cell("AST")}{cell("FG3_PCT")}{cell("STL")}{cell("BLK")}
    </button>
  );
}
