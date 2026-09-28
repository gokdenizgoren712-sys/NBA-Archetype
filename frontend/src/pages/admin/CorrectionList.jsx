import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AdminLayout, { authFetch, fmtDate } from "./AdminLayout";
import { EmptyState, SkeletonRows } from "../../components/states/States";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";

// ── Admin · Corrections (handoff 17g) ───────────────────────────────────────
// Oyuncu · mevcut → önerilen (not) · kim/ne zaman · aksiyonlar. Sekme:
// bekleyen / onaylı / reddedilen. "Apply approved" onaylıları skorlara
// uygular. Buradaki veri-yenileme paneli Admin › Data'ya taşındı.
const STATES = [["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]];

export default function CorrectionList() {
  const { token } = useAuth();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback((status) => {
    setLoading(true);
    authFetch(`/admin/corrections?status=${status}`, token).then(r => r.json())
      .then(d => setRows(d.corrections || [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(tab); }, [tab, load]);

  const patch = async (id, status) => {
    const r = await authFetch(`/admin/corrections/${id}`, token, { method: "PATCH", body: JSON.stringify({ status }) });
    if (r.ok) setRows(prev => prev.filter(x => x.id !== id));
  };
  const applyApproved = async () => {
    setApplying(true); setMsg("");
    try {
      const d = await authFetch("/admin/apply-corrections", token, { method: "POST" }).then(r => r.json());
      setMsg(d.ok ? `Applied ${d.applied} correction${d.applied === 1 ? "" : "s"}. Scores are rebuilding in the background.` : "Nothing was applied.");
    } catch { setMsg("That didn't run — check the server logs."); }
    setApplying(false);
  };

  return (
    <AdminLayout title="Corrections" aside={
      tab === "approved"
        ? <button className="ad-btn" onClick={applyApproved} disabled={applying || !rows.length}>{applying ? "Applying…" : "Apply approved"}</button>
        : tab === "pending" && !loading ? <span className="ad-note" style={{ color: rows.length ? "#FFB11B" : undefined }}>{rows.length} waiting</span> : null
    }>
      <nav className="ad-subtabs" role="tablist">
        {STATES.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {msg && <p className="ad-note" role="status" style={{ marginBottom: 12 }}>{msg}</p>}

      {loading ? <SkeletonRows count={5} height={70} /> : rows.length === 0 ? (
        <EmptyState tint="#f2efea" title={tab === "pending" ? "Nothing waiting" : `No ${tab} corrections`}
          body={tab === "pending" ? "Suggestions from player profiles land here." : null} />
      ) : (
        <div className="ad-table scroll" style={{ "--cols": "minmax(0,1fr) minmax(0,1.2fr) 150px 190px" }}>
          <div className="ad-th"><span>Player · season</span><span>Current → suggested</span><span>From</span><span /></div>
          {rows.map(r => (
            <div key={r.id} className="ad-tr" style={{ minHeight: 70 }}>
              <div className="ad-cell-main">
                <b><Link to={`/basketball/players/${encodeURIComponent(r.player_name)}`}>{r.player_name}</Link></b>
                <span>{r.season} · primary archetype</span>
              </div>
              <div className="ad-cell-main">
                <b style={{ fontWeight: 500 }}>
                  <s style={{ color: "var(--text-muted)" }}>{r.current_arch}</s>
                  <span style={{ color: "var(--ink-divider)", margin: "0 6px" }}>→</span>
                  <span style={{ color: ARCHETYPE_COLOR[r.suggested_arch] || "var(--text-primary)" }}>{r.suggested_arch}</span>
                </b>
                {r.note && <span title={r.note}>“{r.note}”</span>}
              </div>
              <span>{r.username || "unknown"} · {fmtDate(r.created_at)}</span>
              <div className="ad-actions">
                {tab === "pending" && <><button className="ad-sm" onClick={() => patch(r.id, "rejected")}>Reject</button><button className="ad-sm good" onClick={() => patch(r.id, "approved")}>Approve</button></>}
                {tab === "approved" && <button className="ad-sm" onClick={() => patch(r.id, "rejected")}>Revoke</button>}
                {tab === "rejected" && <button className="ad-sm" onClick={() => patch(r.id, "pending")}>Re-open</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
