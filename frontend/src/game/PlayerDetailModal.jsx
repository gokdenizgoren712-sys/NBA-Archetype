import { getPlayerTags } from "./awards";
import { StarIcon } from "./GameIcons";
import "./game.css";

// Arketip → renk (site paleti) — modalın accent'i oyuncunun kendi kimliği olur.
const ARCH_HEX = {
  Engine: "#fb923c", Ecosystem: "#4ade80", Hub: "#2dd4bf", Connector: "#c084fc",
  Creator: "#fb7185", Anchor: "#60a5fa", Spacer: "#22d3ee", Finisher: "#a3e635",
  Force: "#f87171", Initiator: "#FFB11B", Stopper: "#d1d5db", "Rim Runner": "#34d399",
};
const POS_HEX = { PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171" };

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

  const accent = ARCH_HEX[player.primary_arch] || "#FFB11B";
  const posHex = POS_HEX[pos] || "#9ca3af";

  return (
    <div className="g-modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={e => e.stopPropagation()}
        style={{ "--accent": accent, "--accent-a": accent + "26", "--accent-line": accent + "55" }}>
        <span className="aura-blob" style={{ "--slot-color": accent, left: "10%", top: -54, width: 240, height: 140, opacity: 0.26 }} />

        <div className="flex items-start justify-between gap-2 mb-3.5">
          <div className="min-w-0">
            <div className="font-logo text-lg font-bold truncate flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
              {player.PLAYER_NAME}
              {player._isPrimary && <span className="shrink-0" style={{ color: accent }}><StarIcon size={12} /></span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {pos && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: posHex, background: posHex + "1a", border: `1px solid ${posHex}55` }}>
                  {pos}
                </span>
              )}
              <span className="text-[11px] font-semibold" style={{ color: accent }}>{player.primary_arch || "—"}</span>
              {(player._team || player._season) && (
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{[player._team, player._season].filter(Boolean).join(" · ")}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-xl leading-none shrink-0 transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}>×</button>
        </div>

        <div className="grid grid-cols-6 gap-1" style={{ background: "rgba(255,255,255,.07)", borderRadius: 12, overflow: "hidden", padding: 1 }}>
          {STAT_KEYS.map(([k, label]) => (
            <div key={k} className="py-2 text-center" style={{ background: "#100e13" }}>
              <div className="font-logo text-[13px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{statVal(player, k)}</div>
              <div className="text-[7.5px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-faint)" }}>{label}</div>
            </div>
          ))}
        </div>

        {overall != null && (
          <div className="flex items-center justify-between text-[11px] mt-3.5 px-0.5" style={{ color: "var(--text-muted)" }}>
            <span>Overall</span>
            <span className="font-logo text-base font-bold" style={{ color: accent }}>{overall}</span>
          </div>
        )}

        <div className="mt-3.5">
          <div className="g-label mb-2">Tags</div>
          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <span key={t.key} title={t.detail}
                  className="text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{ color: t.color, background: t.color + "1a", border: `1px solid ${t.color}55` }}>
                  {t.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>No tags</div>
          )}
        </div>
      </div>
    </div>
  );
}
