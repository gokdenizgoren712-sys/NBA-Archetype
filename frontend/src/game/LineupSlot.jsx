import { StarIcon, EyeIcon } from "./GameIcons";
import { getPrimaryPos, POS_COLORS } from "./positions";
import "./game.css";

// Pozisyon → gerçek hex (POS_COLORS Tailwind sınıfı, glow için hex lazım).
const POS_HEX = { PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171" };

// ── Lineup slot ───────────────────────────────────────────────────────────────
// Boş slot: kesikli hayalet çerçeve. Dolu slot: oyuncunun pozisyon renginde
// organik blob glow (tint'li kutu yerine) + ince accent kenar.
export default function LineupSlot({ pos, player, bench = false, selected = false, canTap = false, onTap, onInfo }) {
  const isPrimary = !bench && player && getPrimaryPos(player) === pos;
  const pen = !bench && player ? (player._posPenalty ?? 1) : 1;
  const penLabel = pen >= 1 ? null : pen >= 0.90 ? "−10%" : "−25%";
  const posLabel = bench ? "BENCH" : pos;
  const accent = bench ? "#9ca3af" : (POS_HEX[pos] || "#9ca3af");

  const cls = [
    "g-slot",
    player ? "filled" : "empty",
    canTap ? "tappable" : "",
    selected ? "selected" : "",
  ].filter(Boolean).join(" ");

  return (
    <div onClick={() => canTap && onTap && onTap(pos)} className={cls}
      style={{ "--accent": accent, "--accent-a": accent + "22", "--accent-line": accent + "55" }}>
      {player && (
        <span className="aura-blob" style={{
          "--slot-color": accent, left: "50%", top: -14,
          width: 88, height: 62, transform: "translateX(-50%)", opacity: bench ? 0.16 : 0.32,
        }} />
      )}

      {player && onInfo && (
        <button onClick={e => { e.stopPropagation(); onInfo(player); }}
          className="absolute top-1 right-1 transition-colors"
          style={{ color: "var(--text-faint)", zIndex: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = accent}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
          title="Player details">
          <EyeIcon size={9} />
        </button>
      )}

      <div className="g-slot-pos">{posLabel}</div>
      {player ? (
        <>
          <div className="g-slot-name">{player.PLAYER_NAME?.split(" ").slice(-1)[0]}</div>
          <div className="g-slot-meta">
            {(player._season || "").slice(0, 4)}
            {isPrimary && <span style={{ color: accent, marginLeft: 4, display: "inline-flex", verticalAlign: "-1px" }}><StarIcon size={8} /></span>}
          </div>
          {penLabel && <div className="g-slot-meta" style={{ color: "#f87171", fontWeight: 600 }}>{penLabel}</div>}
        </>
      ) : (
        <div className="g-slot-empty-mark">+</div>
      )}
    </div>
  );
}
