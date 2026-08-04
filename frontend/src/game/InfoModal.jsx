import "./game.css";

// ── Info Modal ────────────────────────────────────────────────────────────────
// Kart kabuğunun modal hâli: accent kenar + arkada organik blob, düz
// gri-çerçeveli kutu yerine.
export default function InfoModal({ open, onClose, title, children, accent = "#FFB11B" }) {
  if (!open) return null;
  return (
    <div className="g-modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={e => e.stopPropagation()}
        style={{ "--accent": accent, "--accent-a": accent + "26", "--accent-line": accent + "55" }}>
        <span className="aura-blob" style={{ "--slot-color": accent, left: "12%", top: -50, width: 220, height: 130, opacity: 0.2 }} />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-logo font-bold text-base" style={{ color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose}
            className="text-xl leading-none transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
