export default function ScoreBar({ label, value, highlight = false }) {
  const pct = Math.round((value || 0) * 100);

  // flat amber gradient: düşük=dim, yüksek=accent
  const barColor = value >= 0.85 ? "var(--accent)"
                 : value >= 0.70 ? "#d97706"
                 : value >= 0.50 ? "#78350f"
                 : "var(--border)";

  return (
    <div className="flex items-center gap-2 py-0.5"
      style={highlight ? { borderLeft: "2px solid var(--accent-border)", paddingLeft: 4 } : { paddingLeft: 6 }}>
      <span className="w-28 text-xs shrink-0 text-right" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="w-7 text-xs text-right font-mono" style={{ color: pct >= 70 ? "var(--accent)" : "var(--text-muted)" }}>{pct}</span>
    </div>
  );
}
