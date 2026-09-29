// "Roster: Latest mock · Assistant · Saved draft" seçici — useRosterSource ile birlikte (simülatör, takas).
export default function RosterSourceBar({ rs }) {
  const { sources, src, setSrc, saved, savedId, loadSaved, isLoggedIn } = rs;
  return (
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
  );
}
