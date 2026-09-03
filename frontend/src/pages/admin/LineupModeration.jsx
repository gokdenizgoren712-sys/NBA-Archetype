import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";

function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

const MODE_LABEL = { classic: "Classic", salarycap: "Salary Cap" };

export default function LineupModeration() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modeFilter, setModeFilter] = useState("all"); // all | classic | salarycap

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    authFetch("/admin/lineup-games", token)
      .then(r => r.json())
      .then(d => setEntries(d.entries || []))
      .finally(() => setLoading(false));
  }, []);

  const deleteOne = async (id) => {
    if (!confirm("Delete this lineup?")) return;
    await authFetch(`/admin/lineup-games/${id}`, token, { method: "DELETE" });
    setEntries(prev => prev.filter(x => x.id !== id));
  };

  const reset = async (scope, label) => {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    const r = await authFetch("/admin/lineup-games/reset", token, {
      method: "DELETE",
      body: JSON.stringify({ scope }),
    });
    const d = await r.json();
    setEntries(prev => scope === "both" ? [] : prev.filter(x => x.mode !== scope));
    alert(`Deleted ${d.deleted} lineup(s).`);
  };

  const shown = modeFilter === "all" ? entries : entries.filter(e => e.mode === modeFilter);

  return (
    <>
    <SEO title="Admin — Leaderboards" noindex path="/admin/lineups" />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Leaderboards <span className="text-sm font-normal ml-1" style={{ color: "var(--text-muted)" }}>({entries.length})</span>
          </h1>
          <div className="flex gap-2">
            <Link to="/admin/articles"
              className="px-3 py-1.5 rounded-[8px] text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Articles
            </Link>
            <Link to="/admin/users"
              className="px-3 py-1.5 rounded-[8px] text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Users
            </Link>
            <Link to="/admin/corrections"
              className="px-3 py-1.5 rounded-[8px] text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Corrections
            </Link>
          </div>
        </div>

        {/* Mode filter */}
        <div className="flex gap-2 mb-4">
          {[["all", "All"], ["classic", "Classic"], ["salarycap", "Salary Cap"]].map(([key, label]) => (
            <button key={key} onClick={() => setModeFilter(key)}
              className="px-3 py-1.5 rounded-[8px] text-xs font-medium"
              style={{
                background: modeFilter === key ? "var(--accent)" : "var(--bg-elevated)",
                color: modeFilter === key ? "#000" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : shown.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No lineups yet.</p>
        ) : (
          <div className="rounded-[8px] overflow-hidden border mb-6" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-elevated)" }}>
                <tr>
                  {["ID", "User", "Mode", "Score", "Result", "Roster Data", "Created", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-2 font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={e.id}
                    style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-elevated)", borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>{e.id}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{e.username || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-[8px] text-xs font-medium"
                        style={{
                          background: e.mode === "salarycap" ? "rgba(255,177,27,.15)" : "rgba(156,163,175,.15)",
                          color: e.mode === "salarycap" ? "var(--accent)" : "var(--text-muted)",
                        }}>
                        {MODE_LABEL[e.mode] || e.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "var(--text-primary)" }}>{e.pct} · {e.grade}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {e.wins != null ? `${e.wins}W${e.season_result ? ` · ${e.season_result}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-[8px] text-xs font-medium"
                        style={{
                          background: e.has_roster ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)",
                          color: e.has_roster ? "#4ade80" : "var(--danger)",
                        }}>
                        {e.has_roster ? "Board-eligible" : "Missing"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(e.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => deleteOne(e.id)}
                        className="px-2 py-1 rounded-[8px] text-xs"
                        style={{ color: "var(--danger)", border: "1px solid rgba(248,113,113,.3)" }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Danger zone */}
        <div className="rounded-[8px] p-4" style={{ border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.04)" }}>
          <h2 className="text-sm font-bold mb-1" style={{ color: "var(--danger)" }}>Danger Zone</h2>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Bulk-delete lineups. This removes them from every leaderboard (Classic list, Salary Cap list, and Board Challenge) — cannot be undone.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => reset("classic", "all Classic lineups")}
              className="px-3 py-1.5 rounded-[8px] text-sm font-medium"
              style={{ color: "var(--danger)", border: "1px solid rgba(248,113,113,.3)" }}>
              Reset Classic
            </button>
            <button onClick={() => reset("salarycap", "all Salary Cap lineups")}
              className="px-3 py-1.5 rounded-[8px] text-sm font-medium"
              style={{ color: "var(--danger)", border: "1px solid rgba(248,113,113,.3)" }}>
              Reset Salary Cap
            </button>
            <button onClick={() => reset("both", "EVERYTHING — both leaderboards")}
              className="px-3 py-1.5 rounded-[8px] text-sm font-bold"
              style={{ color: "#fff", background: "#dc2626" }}>
              Reset Both
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
