import { ArrowLeftRight, Circle, CircleDot, Square } from "lucide-react";
import { companionMinute } from "./companionView";

const KIND_ICONS = { goal: CircleDot, own_goal: CircleDot, card: Square, substitution: ArrowLeftRight };

export default function MatchEvents({ events, checked = false, sport = "Football", home, away }) {
  return <section className="ri-match-events" aria-label="Match events">
    <div className="ri-chip-title">MATCH EVENTS {events.length > 0 && <span>{events.length}</span>}</div>
    {events.length ? <div className="ri-match-event-list">
      <div className="ri-match-event-teams" aria-hidden="true"><span>{home?.short || "Home"}</span><span>{away?.short || "Away"}</span></div>
      {events.map((event, index) => {
        const Icon = KIND_ICONS[event.kind] || Circle;
        const detail = <><Icon size={14} aria-hidden="true"/><span>{event.label}</span></>;
        return <div className={`ri-match-event ${event.side || "unknown"}`} key={event.id ?? `${event.minute}-${event.kind}-${event.label}-${index}`}
          aria-label={`${companionMinute(event.minute, sport)} ${event.side === "home" ? home?.name || "Home" : event.side === "away" ? away?.name || "Away" : ""} ${event.label}`}>
          <span className="ri-match-event-detail">{event.side !== "away" && detail}</span>
          <b>{companionMinute(event.minute, sport)}</b>
          <span className="ri-match-event-detail">{event.side === "away" && detail}</span>
        </div>;
      })}
    </div> : <p className="ri-companion-note">{checked ? "No match events were recorded." : "Match events are not available for this fixture."}</p>}
  </section>;
}
