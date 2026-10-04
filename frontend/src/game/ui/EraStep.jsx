import GameStage from "./GameStage";
import { ERA_UI } from "./eraUi";

// Adım 1: dönem seç (mockup 3b / mobil 12b). Kart tıklanınca dönem seçilir ve draft başlar.
export default function EraStep({ eras, blurbs, onChoose, onRandom, selectedId }) {
  return (
    <GameStage sport="basketball">
      <header className="sb-era-head">
        <div>
          <p className="sb-mono sb-eyebrow">STEP 1 OF 4</p>
          <h1 className="sb-h1">Pick your simulation era</h1>
          <p className="sb-lede">Your whole run lives in this era. Player power scales with distance from their home decade. One era off is about −3%, five eras about −22%. Timeless greats ignore distance.</p>
        </div>
        <button type="button" className="sb-btn" onClick={onRandom}>⚄ Random era</button>
      </header>
      <div className="sb-eras">
        {eras.map((e, i) => {
          const ui = ERA_UI[e.id] || ERA_UI.dead_ball;
          return (
            <button key={e.id} type="button" className="sb-era sb-panel" style={{ "--era": ui.color }}
              aria-pressed={selectedId === e.id} onClick={() => onChoose(e)}>
              <span className="top"><span>ERA {i + 1}</span>{selectedId === e.id && <span className="sel">● SELECTED</span>}</span>
              <span className="name">{e.label}</span>
              <span className="years">{e.years[0]}–{Math.min(e.years[1], 2026)}</span>
              <span className="desc">{blurbs[e.id]}</span>
              <span className="fx"><span className="up">▲ {ui.up}</span><span className="dn">▼ {ui.dn}</span></span>
            </button>
          );
        })}
      </div>
    </GameStage>
  );
}
