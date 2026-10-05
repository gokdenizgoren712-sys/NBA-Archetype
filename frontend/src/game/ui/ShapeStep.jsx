import GameStage from "./GameStage";
import { FORMATIONS, SHAPE_KEYS } from "../football/formations";
import { PITCH_LINES, footballSlotPos, slotLabel } from "./boardGeometry";

// Futbol girişi: diziliş + lig + liderlik tek ekranda (mockup 11a / mobil 13a).
// Slotlar formations.js'ten; yatay saha (kendi kalen solda).
export default function ShapeStep({
  shape, onShape, leagues, league, onLeague, poolCount, onStart, startDisabled, spinning, leaderboard,
}) {
  const f = FORMATIONS[shape];
  return (
    <GameStage sport="football">
      <div style={{ flex: "none" }}>
        <p className="sb-mono sb-eyebrow">SPIN &amp; BUILD · STEP 1</p>
        <h1 className="sb-h1">Choose your <span className="sb-accent">shape</span></h1>
        <p className="sb-lede">Spin the wheels for a club and a season, pick one player, repeat until all eighteen are in.</p>
      </div>

      <div className="sb-shape-body">
        <div className="sb-shape-main">
          <div className="sb-shapes" role="radiogroup" aria-label="Formation">
            {SHAPE_KEYS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={shape === k}
                className="sb-shape" onClick={() => onShape(k)}>{k}</button>
            ))}
          </div>
          <div className="sb-pitch-wrap">
            <div className="sb-pitch">
              <svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
                {PITCH_LINES.map((d) => <path key={d} d={d} />)}
              </svg>
              {f?.slots.map((s) => {
                const p = footballSlotPos(s);
                return (
                  <div key={s.id} className="sb-pslot" style={{ left: `${p.left}%`, top: `${p.top}%` }}>
                    <div className="dot">{slotLabel(s)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {leaderboard}
      </div>

      <div className="sb-shape-foot">
        <span className="lbl">Wheel pool · {poolCount} club-seasons</span>
        {leagues.map((l) => (
          <button key={l.key} type="button" className="sb-pill" aria-pressed={league === l.key}
            onClick={() => onLeague(l.key)}>{l.label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="sb-btn solid cta md" onClick={onStart} disabled={startDisabled}>
          {spinning ? "Spinning…" : `Start draft · ${shape}`}
        </button>
      </div>
    </GameStage>
  );
}
