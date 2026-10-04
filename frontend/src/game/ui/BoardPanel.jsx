// Tahta (mockup 3c): kort/saha çizgileri, slotlar, yedekler.
//   slots: [{ key, x, y, label, center, state, tap, cost, costTone }]  state: empty | filled | target
//   bench: [{ key, label, state, tap }]
export default function BoardPanel({ title, filled, total, lines, slots, bench, onSlot, movingKey, className = "" }) {
  return (
    <section className={`sb-panel sb-bpanel ${className}`.trim()}>
      <div className="sb-bhead">
        <span className="sb-card-title">{title}</span>
        <span className="filled">{filled}/{total} filled</span>
      </div>
      <div className="sb-bboard">
        <svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
          {lines.map((d) => <path key={d} d={d} />)}
        </svg>
        {slots.map((k) => (
          <div key={k.key} className={`sb-bslot pos ${k.state}${movingKey === k.key ? " moving" : ""}`}
            data-slot={k.key} data-pos={k.key} style={{ left: `${k.x}%`, top: `${k.y}%` }}>
            <button type="button" className="dot" disabled={!k.tap && k.state !== "target"}
              aria-label={`${k.key} slot${k.name ? `: ${k.name}` : ""}`} onClick={() => onSlot(k.key)}>{k.center}</button>
            <span className="lb">{k.label}</span>
            {k.cost && <span className={`cost ${k.costTone || ""}`}>{k.cost}</span>}
          </div>
        ))}
      </div>
      <div className="sb-bench-row">
        {bench.map((b) => (
          <button key={b.key} type="button" data-slot={b.key}
            className={`${b.state}${b.tap ? " tap" : ""}`} disabled={!b.tap && b.state !== "target"}
            onClick={() => onSlot(b.key)}>
            <span>{b.key}</span>
            {b.label && <small>{b.label}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}
