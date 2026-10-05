import { PHASE_COLOR } from "./theme";

// ── Kadro sonucu (mockup 11c) ──────────────────────────────────────────────
// Tek büyük an: gerçek ilk-11'lere karşı PERSANTİL. Mock bir harf notu göstermiyor; futbolda
// not kavramı yok (skor grade: null ile kaydediliyor), ölçülen sayı büyük gösteriliyor ve
// referansı yanında. Altında dört gerçek bileşen, sonra kadro raporu | XI.
// Kapsayıcıyı sayfa kuruyor (sb-game sport-football); burası yalnız içerik.

const GOOD = "var(--sb-good)", MID = "var(--sb-warn)", WARN = "var(--sb-bad-2)";
const tone = (v) => (v >= 72 ? GOOD : v >= 52 ? MID : WARN);
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export default function SquadResult({ fit, shape, starters, slotOf, slotPosOf = () => null, manager, saveUI, onPlaySeason, onReset }) {
  if (!fit || fit.error) return null;
  const ref = fit.reference;
  const pctile = ref?.score;
  const hero = pctile != null ? tone(pctile) : GOOD;

  const slots = Object.entries(fit.slot_scores || {}).sort((a, b) => b[1] - a[1]);
  const gaps = slots.filter(([, v]) => v < 0.52).map(([k]) => k.toLowerCase());
  const dupes = Object.entries(fit.archetype_counts || {}).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const phases = starters.reduce((a, p) => { a[p.PHASE] = (a[p.PHASE] || 0) + 1; return a; }, {});

  const parts = [
    ref?.slots != null && { v: `${ref.slots}${ordinal(ref.slots)}`, l: "Role coverage", c: tone(ref.slots) },
    { v: `${fit.natural_slots}/11`, l: "Natural slots", c: fit.natural_slots >= 9 ? GOOD : fit.natural_slots >= 7 ? MID : WARN },
    { v: `−${Math.round((fit.position_penalty || 0) * 100)}`, l: "Out-of-position cost", c: fit.position_penalty > 0.05 ? WARN : GOOD },
    { v: `+${Math.round((fit.manager_bonus || 0) * 100)}`, l: manager ? `${manager.name.split(" ").slice(-1)[0]}${fit.manager_matched ? " · shape match" : ""}` : "Manager", c: fit.manager_matched ? GOOD : "var(--sb-muted)" },
  ].filter(Boolean);

  const report = [
    { c: GOOD, h: `Strongest: ${fit.strongest}`, p: "The job this XI covers best." },
    { c: WARN, h: `Weakest: ${fit.weakest}`, p: gaps.length ? `Nobody really covers ${gaps.join(", ")}. In a tight game that is where it shows.` : "Covered, but thinner than the rest." },
    { c: "var(--sb-pos-pg)", h: `Shape: ${fit.formation || "not a standard shape"}`, p: ["def", "mid", "fwd"].map((ph) => `${phases[ph] || 0} ${ph}`).join(" · ") },
    { c: dupes.length ? MID : GOOD, h: dupes.length ? `Role overlap: ${dupes.map(([a, n]) => `${n}× ${a}`).join(" · ")}` : "No role overlap", p: dupes.length ? "The same job done twice is a job not done elsewhere." : "Every starter brings a different role." },
  ];

  return (
    <div className="sb-fres">
      <section className="sb-fres-hero">
        <div className="sb-fres-main">
          <div>
            <span className="lbl" style={{ color: hero }}>Squad fit</span>
            {pctile != null ? (
              <span className="sb-fres-big" style={{ color: hero }}>{pctile}<small>{ordinal(pctile)}</small></span>
            ) : (
              <span className="sb-fres-big" style={{ color: hero }}>{Math.round((fit.final || 0) * 100)}<small>/100</small></span>
            )}
          </div>
          {pctile != null && (
            <p className="sb-fres-ref">
              Percentile — built better than <b>{pctile}%</b> of the {ref.n.toLocaleString("en-US")} real
              starting elevens fielded across {ref.seasons} seasons.
            </p>
          )}
        </div>
        <div className="sb-fres-parts">
          {parts.map((p) => <div key={p.l}><b style={{ color: p.c }}>{p.v}</b><span>{p.l}</span></div>)}
        </div>
      </section>

      <div className="sb-fres-cols">
        <section>
          <h2 className="sb-fres-h">Squad report</h2>
          {report.map((r) => (
            <div key={r.h} className="sb-fres-rep" style={{ "--c": r.c }}>
              <i /><div><b>{r.h}</b><span>{r.p}</span></div>
            </div>
          ))}
        </section>
        <section>
          <h2 className="sb-fres-h">Your XI</h2>
          {starters.map((p) => {
            const pen = slotOf(p);
            const [txt, c] = pen <= 0.001 ? ["Natural", GOOD] : pen <= 0.06 ? ["Comfortable", MID] : [`Out of position −${Math.round(pen * 100)}`, WARN];
            return (
              <div key={p.PLAYER_ID} className="sb-fres-xi">
                <span className="pos" style={{ color: PHASE_COLOR[p.PHASE] }}>{slotPosOf(p) || p.POSITION}</span>
                <span className="nm">{p.PLAYER_NAME}<em>{p.POSITION}</em></span>
                <span className="fit" style={{ color: c }}>{txt}</span>
              </div>
            );
          })}
        </section>
      </div>

      <div className="sb-fres-actions">
        {saveUI}
        <span className="grow" />
        <button type="button" className="sb-btn" onClick={onReset}>Play again</button>
        <button type="button" className="sb-btn solid" onClick={onPlaySeason}>Play the season</button>
      </div>
    </div>
  );
}
