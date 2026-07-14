import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";

function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

function RefreshPanel({ token }) {
  const [status, setStatus] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = () =>
    authFetch("/admin/refresh-status", token)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    fetchStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (status?.running) {
      pollRef.current = setInterval(fetchStatus, 5000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [status?.running]);

  const trigger = async () => {
    setTriggering(true);
    try {
      await authFetch("/admin/trigger-refresh", token, { method: "POST" });
      await fetchStatus();
    } finally {
      setTriggering(false);
    }
  };

  const running = status?.running || triggering;

  return (
    <div className="p-4 rounded-lg space-y-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Data Pipeline</div>

      <div className="flex items-center gap-3">
        <button onClick={trigger} disabled={running}
          className="text-xs px-4 py-1.5 rounded-lg font-medium"
          style={{ background: running ? "var(--border)" : "var(--accent)", color: running ? "var(--text-faint)" : "#000" }}>
          {running ? "Running…" : "Refresh Now"}
        </button>
        {running && (
          <span className="text-xs animate-pulse" style={{ color: "var(--accent)" }}>
            Fetching data + rebuilding scores…
          </span>
        )}
      </div>

      {status && (
        <div className="text-[11px] space-y-0.5" style={{ color: "var(--text-muted)" }}>
          {status.last_run && (
            <div>Last run: <span style={{ color: "var(--text-primary)" }}>{status.last_run.slice(0, 19).replace("T", " ")} UTC</span></div>
          )}
          {status.duration_s && (
            <div>Duration: {status.duration_s}s</div>
          )}
          <div>Status: <span style={{ color: status.status === "ok" ? "#4ade80" : status.status === "error" ? "#f87171" : "var(--accent)" }}>
            {status.status === "running" || running ? "running" : status.status}
          </span></div>
          {status.errors?.length > 0 && (
            <div className="text-[10px] mt-1 p-2 rounded-lg" style={{ background: "rgba(239,68,68,.08)", color: "#f87171" }}>
              {status.errors[0]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["pending", "approved", "rejected"];

export default function CorrectionList() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState(null);

  const load = (status) => {
    setLoading(true);
    authFetch(`/admin/corrections?status=${status}`, token)
      .then(r => r.json())
      .then(d => setRows(d.corrections || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    load(tab);
  }, [tab]);

  const patch = async (id, status) => {
    await authFetch(`/admin/corrections/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const applyApproved = async () => {
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await authFetch("/admin/apply-corrections", token, { method: "POST" });
      const d = await res.json();
      setApplyMsg(d.ok ? `Applied ${d.applied} correction(s). Scores rebuilding in background.` : "Failed.");
    } catch {
      setApplyMsg("Error — check server logs.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
    <SEO title="Admin — Corrections" noindex path="/admin/corrections" />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Tag Corrections
          </h1>
          <div className="flex gap-2">
            <Link to="/admin/articles"
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Articles
            </Link>
            <Link to="/admin/users"
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Users
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="text-xs px-4 py-1.5 rounded-lg capitalize"
              style={{
                background: tab === t ? "var(--accent-dim)" : "transparent",
                color: tab === t ? "var(--accent)" : "var(--text-muted)",
                border: `1px solid ${tab === t ? "var(--accent-border)" : "var(--border)"}`,
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Apply button (only on approved tab) */}
        {tab === "approved" && (
          <div className="flex items-center gap-3 mb-4">
            <button onClick={applyApproved} disabled={applying}
              className="text-xs px-4 py-1.5 rounded-lg font-medium"
              style={{ background: "var(--accent)", color: "#000" }}>
              {applying ? "Applying…" : "Apply Approved →"}
            </button>
            {applyMsg && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{applyMsg}</span>
            )}
          </div>
        )}

        {/* Data refresh panel */}
        <div className="mb-6">
          <RefreshPanel token={token} />
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No {tab} corrections.</div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="p-4 rounded-lg flex items-start justify-between gap-4"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.player_name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-faint)" }}>{r.season}</span>
                    <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: "rgba(239,68,68,.15)", color: "#f87171" }}>
                      {r.current_arch}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>→</span>
                    <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: "rgba(74,222,128,.12)", color: "#4ade80" }}>
                      {r.suggested_arch}
                    </span>
                  </div>
                  {r.note && (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>"{r.note}"</div>
                  )}
                  <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    by {r.username || "unknown"} · {r.created_at?.slice(0, 10)}
                  </div>
                </div>

                {tab === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => patch(r.id, "approved")}
                      className="text-xs px-3 py-1 rounded-lg"
                      style={{ background: "rgba(74,222,128,.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,.3)" }}>
                      Approve
                    </button>
                    <button onClick={() => patch(r.id, "rejected")}
                      className="text-xs px-3 py-1 rounded-lg"
                      style={{ background: "rgba(239,68,68,.12)", color: "#f87171", border: "1px solid rgba(239,68,68,.25)" }}>
                      Reject
                    </button>
                  </div>
                )}
                {tab === "approved" && (
                  <button onClick={() => patch(r.id, "rejected")}
                    className="text-xs px-3 py-1 rounded-lg"
                    style={{ color: "var(--text-faint)", border: "1px solid var(--border)" }}>
                    Revoke
                  </button>
                )}
                {tab === "rejected" && (
                  <button onClick={() => patch(r.id, "pending")}
                    className="text-xs px-3 py-1 rounded-lg"
                    style={{ color: "var(--text-faint)", border: "1px solid var(--border)" }}>
                    Re-open
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
