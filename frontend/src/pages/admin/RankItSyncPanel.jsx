import { useCallback, useEffect, useState } from "react";

// Katalog senkronu: sağlayıcı başına son tur ve "şimdi tara" düğmesi.
// Yeni bir yarışma eklendiğinde 6 saatlik turu beklememek için; sonuç ve
// atlanan yarışmalar (kimlik çözülemedi, ad uyuşmadı) burada görünür.
const LABEL = { nba: "NBA", euroleague: "EuroLeague", eurocup: "EuroCup", football: "Football (FotMob)",
  sofascore: "Volleyball + BSL (SofaScore)" };

export default function RankItSyncPanel({ token }) {
  const [health, setHealth] = useState(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetch("/api/rankit/sync-health").then((r) => r.json()).then(setHealth).catch(() => setNote("Could not load sync health."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setNote("");
    const r = await fetch("/api/rankit/admin/sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => ({}));
    setNote(r.ok ? (d.started ? "Sync started. It can take a few minutes; refresh to see results." : d.reason) : (d.detail || "Could not start the sync."));
  };

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>Catalog sync</strong>
        <button type="button" onClick={start} className="px-3 py-1.5 rounded-[8px] text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#000" }}>Sync catalog now</button>
        <button type="button" onClick={load} className="px-3 py-1.5 rounded-[8px] text-sm"
          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Refresh</button>
        {note && <span role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{note}</span>}
      </div>
      {health && (
        <table style={{ width: "100%", fontSize: 12, color: "var(--text-muted)", borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Source</th><th>Last run</th><th>Matches</th><th>Notes</th></tr></thead>
          <tbody>
            {Object.entries(health.providers || {}).map(([name, p]) => (
              <tr key={name} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 6px 6px 0", color: "var(--text-primary)" }}>{LABEL[name] || name}</td>
                <td>{p.never_run ? "never" : `${p.last_run.ok ? "ok" : "failed"} · ${Number(p.last_run.age_hours).toFixed(1)}h ago`}</td>
                <td>{p.last_run?.matches ?? "—"}</td>
                <td style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{p.last_run?.error || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
