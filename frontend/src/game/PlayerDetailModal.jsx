import { getPlayerTags } from "./awards";
import { POS_COLORS } from "./positions";
import { StarIcon } from "./GameIcons";

// ── Oyuncu hızlı-bakış modalı — oyun modlarında (Same Screen, With a Friend,
// Single Player) draft edilmiş/kadroda olan bir oyuncuya tıklandığında tag,
// o sezonun istatistikleri ve pozisyonunu tek bakışta gösterir. Ekstra API
// çağrısı YOK — oyuncu objesi zaten pool/lineup verisiyle birlikte geliyor.
const STAT_KEYS = [
  ["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"],
  ["STL", "STL"], ["BLK", "BLK"], ["FG3_PCT", "3P%"],
];

function statVal(player, k) {
  const v = player?.[k];
  if (v == null || isNaN(+v)) return "—";
  if (k === "FG3_PCT") return `${Math.round(+v * 100)}%`;
  return (+v).toFixed(1);
}

export default function PlayerDetailModal({ player, onClose }) {
  if (!player) return null;
  const tags = getPlayerTags(player);
  const pos = player.POSITION || player.POS5 || player._assignedPos || "";
  const overall = player.overall_score != null ? Math.round(player.overall_score * 100) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surfaceBg border border-gray-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl
                      animate-[fadeScaleIn_0.18s_ease-out]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="font-logo text-base font-bold text-white truncate flex items-center gap-1.5">
              {player.PLAYER_NAME}
              {player._isPrimary && <span className="text-yamabuki shrink-0"><StarIcon size={12} /></span>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {pos && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[pos] || "border-gray-700 text-gray-400"}`}>
                  {pos}
                </span>
              )}
              <span className="text-[11px] text-blue-400 font-medium">{player.primary_arch || "—"}</span>
              {(player._team || player._season) && (
                <span className="text-[10px] text-gray-500">{[player._team, player._season].filter(Boolean).join(" · ")}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none shrink-0">×</button>
        </div>

        <div className="grid grid-cols-6 gap-1.5 mb-3">
          {STAT_KEYS.map(([k, label]) => (
            <div key={k} className="rounded-lg bg-surfaceCard/60 border border-gray-800 py-1.5 text-center">
              <div className="text-[12px] font-black text-white tabular-nums">{statVal(player, k)}</div>
              <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {overall != null && (
          <div className="flex items-center justify-between text-[11px] text-gray-400 mb-3 px-0.5">
            <span>Overall</span>
            <span className="font-logo font-bold text-white">{overall}</span>
          </div>
        )}

        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Tags</div>
          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <span key={t.key} title={t.detail}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                  style={{ color: t.color, background: t.color + "1a", border: `1px solid ${t.color}55` }}>
                  {t.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-gray-600">No tags</div>
          )}
        </div>
      </div>
    </div>
  );
}
