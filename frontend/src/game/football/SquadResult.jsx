import { ACCENT as ACC, PHASE_COLOR } from "./theme";
import { PageGlow } from "../../components/states/States";
import "../game.css";

// ── Kadro sonucu (handoff 16d) ─────────────────────────────────────────────
// Tek büyük an: gerçek ilk-11'lere karşı PERSANTİL (96px). Mock bir harf notu
// gösteriyordu; futbolda not kavramı yok (skor grade: null ile kaydediliyor),
// uydurmak yerine ölçülen sayı büyük gösteriliyor ve referansı yanında.
// Altında dört gerçek bileşen, sonra kadro raporu | XI (yerinde / rahat / dışında).

const WARN = "#E8654C";
const MID = "#F2C14E";
const tone = (v) => (v >= 72 ? ACC : v >= 52 ? MID : WARN);
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

export default function SquadResult({ fit, shape, starters, slotOf, slotPosOf = () => null, manager, onSave, saveUI, onPlaySeason, onReset }) {
  if (!fit || fit.error) return null;
  const ref = fit.reference;
  const pctile = ref?.score;
  const hero = pctile != null ? tone(pctile) : ACC;

  const slots = Object.entries(fit.slot_scores || {}).sort((a, b) => b[1] - a[1]);
  const gaps = slots.filter(([, v]) => v < 0.52).map(([k]) => k.toLowerCase());
  const dupes = Object.entries(fit.archetype_counts || {}).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const phases = starters.reduce((a, p) => { a[p.PHASE] = (a[p.PHASE] || 0) + 1; return a; }, {});

  const parts = [
    ref?.slots != null && { v: `${ref.slots}${ordinal(ref.slots)}`, l: "Role coverage", c: tone(ref.slots) },
    { v: `${fit.natural_slots}/11`, l: "Natural slots", c: fit.natural_slots >= 9 ? ACC : fit.natural_slots >= 7 ? MID : WARN },
    { v: `−${Math.round((fit.position_penalty || 0) * 100)}`, l: "Out-of-position cost", c: fit.position_penalty > 0.05 ? WARN : ACC },
    { v: `+${Math.round((fit.manager_bonus || 0) * 100)}`, l: manager ? `${manager.name.split(" ").slice(-1)[0]}${fit.manager_matched ? " · shape match" : ""}` : "Manager", c: fit.manager_matched ? ACC : "#8b857e" },
  ].filter(Boolean);

  const report = [
    { c: ACC, h: `Strongest: ${fit.strongest}`, p: "The job this XI covers best." },
    { c: WARN, h: `Weakest: ${fit.weakest}`, p: gaps.length ? `Nobody really covers ${gaps.join(", ")}. In a tight game that is where it shows.` : "Covered, but thinner than the rest." },
    { c: "#4C9BE8", h: `Shape: ${fit.formation || "not a standard shape"}`, p: ["def", "mid", "fwd"].map(ph => `${phases[ph] || 0} ${ph}`).join(" · ") },
    { c: dupes.length ? MID : ACC, h: dupes.length ? `Role overlap: ${dupes.map(([a, n]) => `${n}× ${a}`).join(" · ")}` : "No role overlap", p: dupes.length ? "The same job done twice is a job not done elsewhere." : "Every starter brings a different role." },
  ];

  return (
    <div className="g-result g-sq" style={{ "--g": hero }}>
      <PageGlow tint={hero} />
      <div className="g-sq-top">
        <span className="g-wordmark">Spin &amp; Build</span>
        <span className="meta">{shape} · {starters.length}/11 on the pitch</span>
      </div>

      <section className="g-result-hero">
        <span className="g-result-eyebrow">Squad fit</span>
        {pctile != null ? (
          <>
            <span className="g-result-grade">{pctile}<small>{ordinal(pctile)}</small></span>
            <span className="g-result-ref">
              Percentile — built better than <b>{pctile}%</b> of the {ref.n.toLocaleString("en-US")} real
              starting elevens fielded across {ref.seasons} seasons
            </span>
          </>
        ) : (
          <div className="g-result-score"><b>{Math.round((fit.final || 0) * 100)}</b><i>/ 100</i></div>
        )}
        <div className="g-result-parts">
          {parts.map(p => (
            <div key={p.l}><b style={{ "--c": p.c }}>{p.v}</b><span>{p.l}</span></div>
          ))}
        </div>
      </section>

      <div className="g-divider" />

      <div className="g-sq-cols">
        <section>
          <div className="g-sq-h">Squad report</div>
          {report.map(r => (
            <div key={r.h} className="g-sq-rep" style={{ "--c": r.c }}>
              <i />
              <div><b>{r.h}</b><span>{r.p}</span></div>
            </div>
          ))}
        </section>
        <section>
          <div className="g-sq-h">Your XI</div>
          {starters.map(p => {
            const pen = slotOf(p);
            const [txt, c] = pen <= 0.001 ? ["Natural", ACC] : pen <= 0.06 ? ["Comfortable", MID] : [`Out of position −${Math.round(pen * 100)}`, WARN];
            return (
              <div key={p.PLAYER_ID} className="g-sq-xi">
                {/* Oynatıldığı yuva — ceza buna göre; oyuncunun kendi mevkisi isimden sonra */}
                <span className="pos" style={{ color: PHASE_COLOR[p.PHASE] }}>{slotPosOf(p) || p.POSITION}</span>
                <span className="nm">{p.PLAYER_NAME}<em>{p.POSITION}</em></span>
                <span className="fit" style={{ color: c }}>{txt}</span>
              </div>
            );
          })}
        </section>
      </div>

      <div className="g-result-actions">
        {saveUI}
        <span className="flex-1" />
        <button className="pa-btn-secondary" onClick={onReset}>Play again</button>
        <button className="aura-rating-btn g-result-again" onClick={onPlaySeason}>Play the season</button>
      </div>
    </div>
  );
}
