import { useEffect } from "react";
import GameStage from "./GameStage";
import { sportTheme } from "./sportTheme";
import "./draft.css";

// Draft ekranı iskeleti (mockup 3c / 11b, mobil 12c / 13b): başlık, çekiliş şeridi, jokerler,
// havuz + tahta ve çark örtüsü. Veri ve davranış sayfadan gelir; hareket flow'dan.
const ICONS = { team: "↻", year: "↻", both: "⟳", pick2: "×2", discover: "◎" };

export function ReelOverlay({ flow, entity }) {
  const { overlayOn, locked, go, stripA, stripB, docked } = flow;
  return (
    <div className={`sb-overlay${overlayOn ? " on" : ""}${docked ? " dock" : ""}`} aria-hidden={!overlayOn}>
      <div className="sb-reels">
        <div><div className="lbl">SEASON</div>
          <div className={`sb-reel a${locked ? " lock" : ""}`}>
            <div className={`strip a${go ? " go" : ""}`}>{stripA.map((t, i) => <div className="it" key={i}>{t}</div>)}</div>
          </div></div>
        <div><div className="lbl">{entity}</div>
          <div className={`sb-reel b${locked ? " lock" : ""}`}>
            <div className={`strip b${go ? " go" : ""}`}>{stripB.map((t, i) => <div className="it" key={i}>{t}</div>)}</div>
          </div></div>
      </div>
      <div className={`sb-stamp${locked ? " on" : ""}`}>LOCKED</div>
    </div>
  );
}

export default function DraftScreen({ sport, chip, progress, onInfo, draw, flow, spin, jokers, pool, board, className = "" }) {
  const t = sportTheme(sport);
  // Space = Spin (düğmede ipucu olarak yazıyor); metin alanı/düğme odaktayken çalışmaz.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" || spin.disabled) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select", "button"].includes(tag)) return;
      e.preventDefault(); spin.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spin.disabled, spin.onClick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameStage sport={sport} className={`sb-draft ${className}`.trim()}>
      <header className="sb-dhead">
        <h1>Spin &amp; Build <span className="sb-accent">/ {t.name}</span></h1>
        {onInfo && <button type="button" className="sb-info-btn" onClick={onInfo} aria-label="Rules">i</button>}
        {chip && <span className="sb-tagchip">{chip}</span>}
        <div className="sb-progress" aria-label={`${progress.filled} of ${progress.total} drafted`}>
          <div className="row"><span>PROGRESS</span><b>{progress.filled}/{progress.total}</b></div>
          <div className="bar"><i style={{ width: `${(progress.filled / progress.total) * 100}%` }} /></div>
        </div>
      </header>

      <div className="sb-draw">
        <div className={`sb-draw-strip${flow.docked ? " docked" : ""}`}>
          <div className="sb-draw-col sb-draw-season"><div className="lbl">SEASON</div><div className="val">{draw.season}</div></div>
          <div className="sb-draw-div" />
          <div className="sb-draw-col sb-draw-team"><div className="lbl">{t.teamWord.toUpperCase()}{draw.sub ? ` · ${draw.sub}` : ""}</div><div className="val">{draw.team}</div></div>
        </div>
        <button type="button" className={`sb-spin${spin.idle ? " idle" : ""}`} disabled={spin.disabled} onClick={spin.onClick}>
          <span>{spin.label}</span>{!spin.disabled && <small>Space</small>}
        </button>
      </div>

      <div className="sb-jokers" role="group" aria-label="Jokers">
        {jokers.map((j) => (
          <button key={j.key} type="button" className="sb-joker" data-state={j.state}
            disabled={j.state === "used" || j.state === "pressed" || !j.enabled} onClick={j.onClick}>
            <span className="ic" aria-hidden="true">{ICONS[j.icon]}</span>
            <span className="lb">{j.label}</span>
            <span className="st">{j.state === "pressed" ? "PLAYED" : j.state === "used" ? "USED" : "READY"}</span>
          </button>
        ))}
      </div>

      <div className="sb-dbody">
        {pool}
        {board}
        <ReelOverlay flow={flow} entity={t.teamWord.toUpperCase()} />
      </div>
    </GameStage>
  );
}
