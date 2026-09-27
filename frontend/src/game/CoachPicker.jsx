import { useState } from "react";
import { TrophyIcon } from "./GameIcons";
import "./game.css";

// ── Koç seçimi (handoff 12a) ───────────────────────────────────────────────
// Tek oyunculu, Same Screen ve With a Friend paylaşıyor. İki adım: önce kart
// seçilir (mor halka + ışık), sonra CTA "SIMULATE 82 WITH <NAME>" onaylar —
// yanlış tıklama artık sezonu başlatmıyor.

// A+..F → 0-1. Renk buradan türüyor, elle hex yazılmıyor.
const GRADE_VAL = {
  "A+": 1.00, A: 0.92, "A-": 0.85, "B+": 0.78, B: 0.70, "B-": 0.63,
  "C+": 0.56, C: 0.48, "C-": 0.41, "D+": 0.34, D: 0.27, "D-": 0.20, F: 0.10,
};
const gv = (g) => GRADE_VAL[g] ?? 0.5;
const VAL_HEX = (v) => v >= 0.85 ? "#4ade80" : v >= 0.70 ? "#facc15" : v >= 0.50 ? "#fb923c" : "#f87171";
const initials = (n) => (n || "").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

function CoachCard({ coach, selected, onSelect }) {
  const oHex = VAL_HEX(gv(coach.off)), dHex = VAL_HEX(gv(coach.def));
  const rings = Math.min(coach.champs || 0, 6);
  return (
    <button type="button" onClick={() => onSelect(coach)} aria-pressed={selected}
      className={`g-coach-card${selected ? " on" : ""}`}>
      <span className="g-coach-glow" />
      <span className="g-coach-ini">{initials(coach.name)}</span>
      <span className="g-coach-name">{coach.name}</span>
      <span className="g-coach-era">{coach.years}{coach.tag ? ` · ${coach.tag.toLowerCase().replace(/^\w/, c => c.toUpperCase())}` : ""}</span>
      <span className="g-coach-grades">
        <span><b style={{ "--c": oHex }}>{coach.off}</b><i>Offense</i></span>
        <span><b style={{ "--c": dHex }}>{coach.def}</b><i>Defense</i></span>
      </span>
      <span className="g-coach-rings">
        {rings > 0
          ? <>{Array.from({ length: rings }, (_, i) => <TrophyIcon key={i} size={15} />)}
              <em>{coach.champs} ring{coach.champs === 1 ? "" : "s"}</em></>
          : <em className="none">No rings</em>}
      </span>
    </button>
  );
}

export default function CoachPicker({ title, subtitle, options, onPick, waitingFor = null,
                                      step = "Step 3 of 4", cta = (n) => `Simulate 82 with ${n}` }) {
  const [sel, setSel] = useState(null);
  const lastName = sel?.name?.split(" ").slice(-1)[0];
  return (
    <section className="g-coach">
      <header className="g-coach-hero">
        <span className="g-coach-step">{step}</span>
        <h2>{title || "Hire your coach"}</h2>
        <p>{subtitle || "Offense and defense grades shift your rating all season. Rings add a boost once the playoffs start."}</p>
      </header>

      {waitingFor ? (
        <p className="g-coach-wait">Waiting for {waitingFor} to hire a coach…</p>
      ) : (
        <>
          <div className="g-coach-grid">
            {options.map(c => (
              <CoachCard key={c.name} coach={c} selected={sel?.name === c.name} onSelect={setSel} />
            ))}
          </div>
          <div className="g-coach-actions">
            <button className={`aura-rating-btn g-coach-cta${sel ? "" : " idle"}`} disabled={!sel}
              onClick={() => sel && onPick(sel)}>
              {sel ? cta(lastName) : "Pick a coach"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
