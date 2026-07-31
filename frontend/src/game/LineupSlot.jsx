import { StarIcon, EyeIcon } from "./GameIcons";
import { getPrimaryPos, POS_COLORS } from "./positions";

// ── Lineup slot ───────────────────────────────────────────────────────────────
export default function LineupSlot({ pos, player, bench = false, selected = false, canTap = false, onTap, onInfo }) {
  const isPrimary = !bench && player && getPrimaryPos(player) === pos;
  const pen = !bench && player ? (player._posPenalty ?? 1) : 1;
  const penLabel = pen >= 1 ? null : pen >= 0.90 ? "−10%" : "−25%";
  const posLabel = bench ? "BENCH" : pos;
  return (
    <div onClick={() => canTap && onTap && onTap(pos)}
      className={`relative flex-1 rounded-lg p-1.5 border text-center min-w-0 transition-all
      ${selected ? "border-yamabuki shadow-[0_0_8px_rgba(255,177,27,.35)]" : player ? (bench ? "border-gray-600/50 bg-surfaceCard/30" : "border-yamabuki/40 bg-yamabuki/10") : "border-gray-800 bg-surfaceBg/60"}
      ${canTap ? "cursor-pointer" : ""}`}>
      {player && onInfo && (
        <button onClick={e => { e.stopPropagation(); onInfo(player); }}
          className="absolute top-0.5 right-0.5 text-gray-600 hover:text-yamabuki transition-colors p-0.5"
          title="Player details">
          <EyeIcon size={9} />
        </button>
      )}
      <div className={`text-[8.5px] uppercase tracking-wider mb-0.5 ${bench ? "text-gray-600" : POS_COLORS[pos]?.split(" ")[1] || "text-gray-600"}`}>{posLabel}</div>
      {player ? (
        <>
          <div className="text-[10.5px] text-white font-semibold truncate leading-tight">
            {player.PLAYER_NAME?.split(" ").slice(-1)[0]}
          </div>
          <div className="text-[8.5px] text-gray-500">{(player._season || "").slice(0, 4)}</div>
          {isPrimary && <div className="text-yamabuki flex justify-center mt-0.5"><StarIcon size={9} /></div>}
          {penLabel && <div className="text-[8px] font-medium text-red-400/90 leading-tight">{penLabel}</div>}
        </>
      ) : (
        <div className="text-gray-700 text-sm">—</div>
      )}
    </div>
  );
}
