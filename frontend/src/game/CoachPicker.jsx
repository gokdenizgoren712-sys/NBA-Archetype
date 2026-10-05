import { useState } from "react";
import { gameClass } from "./ui/sportTheme";
import { TrophyIcon } from "./GameIcons";
import "./ui/sport-theme.css";
import "./ui/setup.css";
import "./ui/result.css";

// ── Koç / menajer seçimi (mockup 3d / 4d, mobil 12f / 13e) ──────────────────
// Tek oyunculu, Same Screen ve With a Friend paylaşıyor. İki adım: önce kart seçilir,
// sonra CTA ("HIRE STEVE KERR") onaylar — yanlış tıklama sezonu başlatmıyor.
// sport="football" → menajer: ATTACK/DEFENCE notları, tercih edilen diziliş, eşleşme göstergesi.

const gradeColor = (g) => (g?.[0] === "A" ? "var(--sb-good)" : g?.[0] === "B" ? "var(--sb-warn)" : g?.[0] === "C" ? "var(--sb-warn-2)" : "var(--sb-bad)");
const initials = (n) => (n || "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const titleCase = (s) => (s || "").toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());

function normalize(o, sport, shape) {
  if (sport === "football") {
    const match = shape && o.shape === shape;
    return {
      name: o.name, sub: `${titleCase(o.tag || "Balanced")} · ${o.shape}`,
      grades: [["Attack", o.att], ["Defence", o.def]],
      foot: <em className={match ? "match" : "none"}>{match ? `Prefers ${o.shape} ✓` : `Prefers ${o.shape}`}</em>,
    };
  }
  const rings = Math.min(o.champs || 0, 6);
  return {
    name: o.name, sub: `${o.years}${o.tag ? ` · ${titleCase(o.tag)}` : ""}`,
    grades: [["Offense", o.off], ["Defense", o.def]],
    foot: rings > 0
      ? <>{Array.from({ length: rings }, (_, i) => <TrophyIcon key={i} size={15} />)}<em>{o.champs} ring{o.champs === 1 ? "" : "s"}</em></>
      : <em className="none">No rings</em>,
  };
}

export default function CoachPicker({
  sport = "basketball", shape, title, subtitle, options, onPick, waitingFor = null,
  step = "Step 3 of 4", cta = (last, full) => `Hire ${full}`,
}) {
  const [sel, setSel] = useState(null);
  const football = sport === "football";
  const role = football ? "manager" : "coach";
  const last = sel?.name?.split(" ").slice(-1)[0];
  return (
    <section className={gameClass(sport, "sb-coach")}>
      <header className="sb-coach-head">
        <span className="sb-mono step">{step}</span>
        <h2>{title || `Hire your ${role}`}</h2>
        <p>{subtitle || (football
          ? "Each manager has a preferred shape. A match with yours gives a bigger bonus; their attack and defence grades shift your rating."
          : "Offense and defense grades shift your rating all season. Rings add a boost once the playoffs start.")}</p>
      </header>

      {waitingFor ? (
        <p className="sb-coach-wait">Waiting for {waitingFor} to hire a {role}…</p>
      ) : (
        <>
          <div className="sb-coach-grid">
            {options.map((o) => {
              const v = normalize(o, sport, shape);
              const on = sel?.name === o.name;
              return (
                <article key={o.name} className={`sb-ccard${on ? " on" : ""}`}>
                  <span className="ini">{initials(o.name)}</span>
                  <h3>{o.name}</h3>
                  <span className="sub">{v.sub}</span>
                  <span className="grades">
                    {v.grades.map(([label, g]) => (
                      <span key={label}><b style={{ color: gradeColor(g) }}>{g}</b><i>{label}</i></span>
                    ))}
                  </span>
                  <span className="foot">{v.foot}</span>
                  <button type="button" className={`sb-btn${on ? " solid" : ""}`} aria-pressed={on} onClick={() => setSel(o)}>
                    {on ? "Selected" : "Choose"}
                  </button>
                </article>
              );
            })}
          </div>
          <div className="sb-coach-actions">
            <button type="button" className="sb-btn solid cta md" disabled={!sel} onClick={() => sel && onPick(sel)}>
              {sel ? cta(last, sel.name) : `Pick a ${role}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
