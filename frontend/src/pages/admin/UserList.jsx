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

export default function UserList() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    authFetch("/admin/users", token)
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .finally(() => setLoading(false));
  }, []);

  const toggleBan = async (u) => {
    await authFetch(`/admin/users/${u.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ is_banned: u.is_banned ? 0 : 1 }),
    });
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_banned: u.is_banned ? 0 : 1 } : x));
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user and all their data?")) return;
    await authFetch(`/admin/users/${id}`, token, { method: "DELETE" });
    setUsers(prev => prev.filter(x => x.id !== id));
  };

  const deleteAll = async () => {
    if (!confirm("Delete ALL users? This cannot be undone.")) return;
    const r = await authFetch("/admin/users/all", token, { method: "DELETE" });
    const d = await r.json();
    setUsers([]);
    alert(`Deleted ${d.deleted} users.`);
  };

  return (
    <>
    <SEO title="Admin — Users" noindex path="/admin/users" />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Users <span className="text-sm font-normal ml-1" style={{ color: "var(--text-muted)" }}>({users.length})</span>
          </h1>
          <div className="flex gap-2">
            <Link to="/admin/articles"
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Articles
            </Link>
            <Link to="/admin/corrections"
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Corrections
            </Link>
            <button onClick={deleteAll}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ color: "#f87171", border: "1px solid rgba(248,113,113,.3)" }}>
              Delete All
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No users yet.</p>
        ) : (
          <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-elevated)" }}>
                <tr>
                  {["ID", "Username", "Email", "Role", "Status", "Joined", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-2 font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id}
                    style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-elevated)", borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>{u.id}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{u.username}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-lg text-xs font-medium"
                        style={{
                          background: u.role === "admin" ? "rgba(255,177,27,.15)" : "rgba(156,163,175,.15)",
                          color: u.role === "admin" ? "var(--accent)" : "var(--text-muted)",
                        }}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-lg text-xs font-medium"
                        style={{
                          background: u.is_banned ? "rgba(239,68,68,.15)" : "rgba(34,197,94,.15)",
                          color: u.is_banned ? "#f87171" : "#4ade80",
                        }}>
                        {u.is_banned ? "Banned" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(u.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => toggleBan(u)}
                          className="px-2 py-1 rounded-lg text-xs transition-colors"
                          style={{
                            background: "var(--bg-elevated)",
                            color: u.is_banned ? "#4ade80" : "#f97316",
                            border: "1px solid var(--border)",
                          }}>
                          {u.is_banned ? "Unban" : "Ban"}
                        </button>
                        <button onClick={() => deleteUser(u.id)}
                          className="px-2 py-1 rounded-lg text-xs text-red-400 hover:text-red-300"
                          style={{ border: "1px solid rgba(248,113,113,.3)" }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
