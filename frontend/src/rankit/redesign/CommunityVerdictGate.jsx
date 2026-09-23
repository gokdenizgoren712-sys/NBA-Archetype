/* BUILD §3 / §3.1 — ortak detay kapısı; ısı renkleri karar açıklanmadan görünmez. */
export default function CommunityVerdictGate({ spoiler = false, onReveal, actionLabel = "REVEAL ANYWAY", message }) {
  return (
    <div data-community-gate="" style={{ margin: "12px 0", padding: "14px 16px", border: "1px dashed rgba(255,255,255,.22)", borderRadius: 10, background: "rgba(9,10,11,.5)", display: "grid", gap: 10 }}>
      <div aria-hidden="true" style={{ height: 5, display: "flex", gap: 4, filter: "blur(3px)", opacity: .55 }}>
        {[0, 1, 2, 3, 4].map(step => <span key={step} style={{ flex: 1, borderRadius: 4, background: "rgba(255,255,255,.12)" }} />)}
      </div>
      <span style={{ color: "#c9cccd", font: "400 12px/1.45 Outfit,system-ui,sans-serif" }}>
        {message || (spoiler ? "CONTAINS SPOILERS · TAP TO SHOW" : "Rate it first — then see whether the room agreed with you.")}
      </span>
      <button type="button" onClick={onReveal} style={{ justifySelf: "start", border: 0, background: "none", color: "#ffb11b", padding: 0, font: "700 11px Rajdhani,system-ui,sans-serif", letterSpacing: ".12em", cursor: "pointer" }}>
        {actionLabel}
      </button>
    </div>
  );
}
