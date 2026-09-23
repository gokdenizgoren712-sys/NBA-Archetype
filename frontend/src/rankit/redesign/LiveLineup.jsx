import { useState } from "react";
import { positionAbbr } from "./positionAbbr";

/* BUILD §9.2 / 15d: Match sekmesi sahayı anlatır, anları ve nabzı değil. */
export default function LiveLineup({ lineups, inRoom, onCompanion }) {
  const [teamId, setTeamId] = useState(lineups[0]?.team_id);
  const selected = lineups.find((side) => side.team_id === teamId) || lineups[0];
  if (!selected) return null;
  const onPitch = (selected.starters || []).filter((p) => p.sub_out == null);
  const cameOn = (selected.bench || []).filter((p) => p.played === true && p.sub_in != null);

  return <section className="ri-live-lineup">
    <div className="ri-live-lineup-tabs" role="tablist" aria-label="Lineup team">
      {lineups.map((side) => <button type="button" role="tab" aria-selected={side.team_id === selected.team_id}
        key={side.team_id} onClick={() => setTeamId(side.team_id)}>{side.team}</button>)}
    </div>
    <div className="ri-live-lineup-label"><strong>ON THE PITCH</strong><span>{selected.team}{selected.formation ? ` · ${selected.formation}` : ""}</span></div>
    <div className="ri-live-lineup-card">
      {onPitch.map((p, i) => <div className="ri-live-lineup-row" key={p.player_id || `${p.name}-${i}`}>
        <b>{p.shirt_no ?? ""}</b><strong>{p.name}</strong><small>{positionAbbr(p.position)}</small>
      </div>)}
    </div>
    {cameOn.length > 0 && <>
      <div className="ri-live-lineup-label"><strong>CAME ON</strong></div>
      <div className="ri-live-lineup-card">
        {cameOn.map((p, i) => <div className="ri-live-lineup-row came-on" key={p.player_id || `${p.name}-${i}`}>
          <b>{p.sub_in}'</b><strong>{p.name}</strong><small>{p.replaced ? `for ${p.replaced}` : positionAbbr(p.position)}</small>
        </div>)}
      </div>
    </>}
    <p className="ri-live-lineup-note">Stars and players open at full time. Moments and the crowd pulse live in the Companion.</p>
    <button type="button" className="ri-live-lineup-cta" onClick={onCompanion}>Watch with your Companion{Number.isFinite(inRoom) && inRoom > 0 ? ` · ${inRoom} in the room` : ""}</button>
  </section>;
}
