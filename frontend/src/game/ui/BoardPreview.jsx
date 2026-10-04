import { COURT_LINES, COURT_SLOTS, COURT_BENCH } from "./boardGeometry";

// Basketbol kadro önizlemesi (hub 3a): boş kort, kesikli slotlar, yedek şeridi.
export default function BoardPreview({ total = 9 }) {
  return (
    <section className="sb-panel sb-roster">
      <div className="sb-roster-head">
        <span className="sb-card-title">Your roster</span>
        <span className="count">0 OF {total} DRAFTED</span>
      </div>
      <div className="sb-board">
        <svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
          {COURT_LINES.map((d) => <path key={d} d={d} />)}
        </svg>
        {COURT_SLOTS.map((s) => (
          <div key={s.pos} className="sb-slot" data-pos={s.pos} style={{ left: `${s.x}%`, top: `${s.y}%` }}>{s.pos}</div>
        ))}
      </div>
      <div className="sb-bench">{COURT_BENCH.map((b) => <div key={b}>{b} · open</div>)}</div>
    </section>
  );
}
