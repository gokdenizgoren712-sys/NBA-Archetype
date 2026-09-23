import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialog } from "./useDialog";

/* BUILD §10.2: bir kadro listesi, oyuncu başına iki ayrı karar.
   Maçta oynayanların filtrelenmesi çağıranın playedPlayers(lineups) sözleşmesidir. */
export default function PlayersPicker({ players, potmId, respectIds, onPotm, onRespect, onClose, matchLabel, variant = "mobile", busy = false }) {
  const dialog = useDialog({ onClose, label: `Players · ${matchLabel}` });
  const teams = [...new Set(players.map((p) => p.team))];
  const [team, setTeam] = useState(teams[0]);
  const selectedTeam = teams.includes(team) ? team : teams[0];
  const visible = players.filter((p) => p.team === selectedTeam);

  return createPortal(<div className={`ri-players-overlay ${variant === "web" ? "is-web" : "is-mobile"}`} onClick={(e) => { e.stopPropagation(); onClose(); }}>
    <section {...dialog} className="ri-players-picker" onClick={(e) => e.stopPropagation()}>
      {variant === "mobile" && <div className="ri-players-handle" aria-hidden="true" />}
      <header className="ri-players-head">
        <div><strong>PLAYERS</strong><span>{matchLabel}</span></div>
        <button type="button" onClick={onClose} aria-label="Close players"><X size={19} /></button>
      </header>
      <div className="ri-players-budget" aria-label={`POTM ${potmId ? 1 : 0} of 1, Respect ${respectIds.length} of 2`}>
        <span><i className="ri-players-budget-potm" />POTM {potmId ? 1 : 0} / 1</span>
        <span><i className="ri-players-budget-respect" />RESPECT {respectIds.length} / 2</span>
        {variant === "web" && <small>Both optional</small>}
      </div>
      <nav className="ri-players-teams" aria-label="Team">
        {teams.map((name) => <button type="button" key={name} aria-pressed={name === selectedTeam}
          className={name === selectedTeam ? "active" : ""} onClick={() => setTeam(name)}>{name}</button>)}
      </nav>
      <div className="ri-players-scroll">
        {["STARTED", "CAME ON"].map((role) => {
          const rows = visible.filter((p) => p.role === role);
          if (!rows.length) return null;
          return <section key={role}>
            <div className="ri-players-columns"><span>#</span><span>{role}</span><span>POTM</span><span>RESP</span></div>
            {rows.map((p) => <div className="ri-players-row" key={p.id}>
              <span className="ri-players-shirt">{p.shirt_no ?? ""}</span>
              <div className="ri-players-identity"><strong>{p.name}</strong><small>{role === "CAME ON" && p.sub_in != null ? `${p.sub_in}'${p.position ? ` · ${p.position}` : ""}` : p.position || ""}</small></div>
              <button type="button" className="ri-players-control" aria-label={`Player of the Match: ${p.name}`}
                aria-pressed={potmId === p.id} disabled={busy} onClick={() => onPotm(p.id)}>
                <span className={`ri-players-potm${potmId === p.id ? " selected" : ""}`}><i>POTM</i></span>
              </button>
              <button type="button" className="ri-players-control" aria-label={`Respect: ${p.name}`}
                aria-pressed={respectIds.includes(p.id)} disabled={busy || (potmId === p.id && !respectIds.includes(p.id))}
                onClick={() => onRespect(p.id)}>
                <svg className={`ri-players-respect${respectIds.includes(p.id) ? " selected" : ""}`} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5.4 7.5v9L12 21l6.6-4.5v-9z" /></svg>
              </button>
            </div>)}
          </section>;
        })}
      </div>
      <footer className="ri-players-foot"><span>Respect is for players the scoreline was unfair to.</span><button type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>, document.body);
}
