// "Roster: Latest mock · Assistant · Saved draft" seçici — useRosterSource ile birlikte (simülatör, takas, bu hafta).
// Sezon içindeyken "Rest of season | Full season" seçimi ve isteğe bağlı mevcut H2H galibiyetleri de burada.
import { useState } from "react";

function Records({ rs }) {
  const { records, setRecords, teams, slot } = rs;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const filled = Object.values(records).some((v) => v !== "" && v != null);
  const toggle = () => { if (!open) setDraft(records); setOpen((o) => !o); };
  const n = Array.from({ length: teams }, (_, i) => draft[i + 1]).filter((v) => v !== "" && v != null).length;
  const partial = n > 0 && n < teams;
  const apply = () => { setRecords(n ? draft : {}); setOpen(false); };
  const clear = () => { setRecords({}); setDraft({}); setOpen(false); };
  return (
    <div style={{ position: "relative" }}>
      <button className="fz-btn sm" onClick={toggle} aria-expanded={open}>{filled ? "Records added" : "Add records"}</button>
      {open && (
        <div className="fz-card" style={{ position: "absolute", zIndex: 20, top: "calc(100% + 6px)", left: 0, width: 300, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Head-to-head wins each team has banked so far. Standings, playoff odds and title odds count them. Fill in every team, or leave all blank if you do not know.
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {Array.from({ length: teams }, (_, i) => i + 1).map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span className={t === slot ? "" : "fz-muted"} style={t === slot ? { fontWeight: 600 } : undefined}>{t === slot ? "You" : `Team ${t}`}</span>
                <input type="number" inputMode="decimal" min="0" max="60" step="0.5" value={draft[t] ?? ""} aria-label={`Wins for team ${t}`}
                  onChange={(e) => setDraft((d) => ({ ...d, [t]: e.target.value }))}
                  style={{ width: 56, background: "#111", color: "inherit", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 8px", textAlign: "right" }} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {partial && <span className="fz-meta" style={{ marginRight: "auto" }}>{teams - n} teams still blank</span>}
            <button className="fz-btn sm" onClick={clear}>Clear</button>
            <button className="fz-btn sm light" onClick={apply} disabled={partial}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RosterSourceBar({ rs, scope = true, records = true }) {
  const { sources, src, setSrc, saved, savedId, loadSaved, isLoggedIn } = rs;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="fz-meta">Roster</span>
        <div className="fz-seg dark scroll">
          {sources.map((s) => (
            <button key={s.k} className={src === s.k ? "on" : ""} disabled={!s.ok} onClick={() => setSrc(s.k)}
              title={s.ok ? undefined : s.hint}>{s.l}</button>
          ))}
        </div>
        {src === "saved" && (
          isLoggedIn ? (
            <select className="fz-btn sm" value={savedId || ""} onChange={(e) => loadSaved(Number(e.target.value))} aria-label="Saved draft">
              <option value="" disabled>{saved?.length ? "Pick a saved draft" : "No saved drafts yet"}</option>
              {(saved || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : <span className="fz-meta">Sign in to use a saved draft.</span>
        )}
      </div>
      {scope && rs.inSeason && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="fz-meta">Scope</span>
          <div className="fz-seg dark">
            <button className={rs.scope === "rest" ? "on" : ""} onClick={() => rs.setScope("rest")} title={`Only the weeks still to play, from week ${rs.restFrom}`}>Rest of season</button>
            <button className={rs.scope === "full" ? "on" : ""} onClick={() => rs.setScope("full")} title="The whole 2026-27 season, as if nothing had been played">Full season</button>
          </div>
          {records && rs.scope === "rest" && <Records rs={rs} />}
        </div>
      )}
    </div>
  );
}
