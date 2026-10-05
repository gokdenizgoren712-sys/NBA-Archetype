import { ERAS, ERA_PILLAR_WEIGHTS } from "../eras";

// Five Pillars (mockup 3e): era ağırlığına göre CORE / KEY / MINOR etiketli çubuklar,
// altında Weapon ve Gap satırları. fit = computeLineupFit çıktısı (creation, spacing, …).
const PILLARS = [
  ["creation", "Creation"], ["spacing", "Spacing"], ["rim_protection", "Rim Protection"],
  ["perimeter_d", "Perimeter D"], ["finishing", "Finishing"],
];
const pct = (v) => Math.round((v || 0) * 100);
const tone = (v) => (v >= 0.75 ? "var(--sb-good)" : v >= 0.55 ? "var(--sb-warn)" : v >= 0.4 ? "var(--sb-warn-2)" : "var(--sb-bad)");
const weightTag = (w) => (w >= 1.2 ? ["KEY", "var(--sb-accent)"] : w >= 0.95 ? ["CORE", "var(--sb-muted)"] : ["MINOR", "var(--sb-muted)"]);

export default function PillarBars({ fit, simEra }) {
  const era = simEra || ERAS[5];
  const W = ERA_PILLAR_WEIGHTS[era.id];
  const scored = PILLARS.map(([k, l]) => ({ k, l, val: fit[k], w: W[k] }));
  const weapon = [...scored].sort((x, y) => y.w * y.val - x.w * x.val)[0];
  const gap = [...scored].sort((x, y) => y.w * (1 - y.val) - x.w * (1 - x.val))[0];
  return (
    <section className="sb-panel sb-pillars">
      <h2 className="sb-card-title">Five pillars</h2>
      <div className="rows">
        {scored.map((p) => {
          const [tag, tagColor] = weightTag(p.w);
          return (
            <div key={p.k} className="row" title={`Weight in the ${era.label}: ×${p.w.toFixed(2)}`}>
              <span className="lb">{p.l} <em style={{ color: tagColor }}>{tag}</em></span>
              <span className="bar"><i style={{ width: `${pct(p.val)}%`, background: tone(p.val) }} /></span>
              <b style={{ color: tone(p.val) }}>{pct(p.val)}</b>
            </div>
          );
        })}
      </div>
      <p className="line good">Weapon: {weapon.l} ({pct(weapon.val)})</p>
      <p className="line bad">Gap: {gap.l} ({pct(gap.val)})</p>
    </section>
  );
}
