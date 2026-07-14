import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

const BASE = "/api";

function authFetch(path, token, opts = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

export default function Profile() {
  const { token, user, isLoggedIn, logout, login } = useAuth();
  const navigate = useNavigate();
  const [data, setData]   = useState(null);
  const [tab, setTab]     = useState("players");
  const [loading, setLoading] = useState(true);
  const [promoteCode, setPromoteCode] = useState("");
  const [promoteErr, setPromoteErr]   = useState("");

  useEffect(() => {
    if (!isLoggedIn) { navigate("/login"); return; }
    authFetch("/profile", token).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [isLoggedIn]);

  const removePlayer = async (id) => {
    await authFetch(`/profile/saved-players/${id}`, token, { method: "DELETE" });
    setData(d => ({ ...d, saved_players: d.saved_players.filter(p => p.id !== id) }));
  };

  const promoteToAdmin = async () => {
    setPromoteErr("");
    try {
      const res = await authFetch("/auth/promote", token, {
        method: "POST",
        body: JSON.stringify({ email: "", password: promoteCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Failed");
      login(d.token, d.user);
      window.location.href = "/admin/articles";
    } catch (e) { setPromoteErr(e.message); }
  };

  const removeLineup = async (id) => {
    await authFetch(`/profile/saved-lineups/${id}`, token, { method: "DELETE" });
    setData(d => ({ ...d, saved_lineups: d.saved_lineups.filter(l => l.id !== id) }));
  };

  const TABS = [
    { key: "players",  label: "Players"  },
    { key: "lineups",  label: "Lineups"  },
    { key: "comments", label: "Comments" },
  ];

  if (loading) return <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>Loading…</div>;
  if (!data) return null;

  return (
    <>
    <SEO title="Profile" path="/profile" noindex />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {data.user?.username}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              {data.user?.email} · {data.user?.role === "admin" ? "Admin" : "Member"} ·
              Joined {new Date(data.user?.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
            </p>
          </div>
          <div className="flex gap-2">
            {data.user?.role === "admin" && (
              <Link to="/admin/articles"
                className="px-3 py-1.5 rounded-lg font-logo text-sm font-bold uppercase tracking-wide bg-yamabuki text-darkBg hover:bg-white transition-colors">
                Admin Panel
              </Link>
            )}
            <button onClick={logout}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Admin promotion — only for non-admin users */}
        {data.user?.role !== "admin" && (
          <div className="mb-6 p-4 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-2 font-medium" style={{ color: "var(--text-muted)" }}>Have an admin invite code?</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={promoteCode}
                onChange={e => setPromoteCode(e.target.value)}
                placeholder="Admin invite code"
                className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
              <button
                onClick={promoteToAdmin}
                disabled={!promoteCode}
                className="px-3 py-1.5 rounded-lg font-logo text-sm font-bold uppercase tracking-wide bg-yamabuki text-darkBg hover:bg-white transition-colors disabled:opacity-50">
                Upgrade
              </button>
            </div>
            {promoteErr && <p className="text-xs text-red-400 mt-1">{promoteErr}</p>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
                borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-1px",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Saved Players */}
        {tab === "players" && (
          <div className="space-y-2">
            {data.saved_players.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
                No saved players yet. Open a player card and click the bookmark icon to save.
              </p>
            ) : data.saved_players.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div>
                  <Link to={`/players?q=${encodeURIComponent(p.player_name)}`}
                    className="font-logo font-medium text-sm hover:underline"
                    style={{ color: "var(--text-primary)" }}>
                    {p.player_name}
                  </Link>
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>{p.season}</span>
                </div>
                <button onClick={() => removePlayer(p.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Saved Lineups */}
        {tab === "lineups" && (
          <div className="space-y-3">
            {data.saved_lineups.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
                No saved lineups yet. Build a custom lineup on the Lineups page and save it.
              </p>
            ) : data.saved_lineups.map(l => (
              <div key={l.id} className="p-3 rounded-lg"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-logo font-bold text-lg" style={{ color: "var(--accent)" }}>{l.grade}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(l.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    <button onClick={() => removeLineup(l.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                  </div>
                </div>
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  Score: {l.pct ? Math.round(l.pct) : "—"}%{l.label ? ` · ${l.label}` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {l.players.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-xs"
                      style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comments */}
        {tab === "comments" && (
          <div className="space-y-2">
            {data.comments.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
                No comments yet.
              </p>
            ) : data.comments.map(c => (
              <div key={c.id} className="p-3 rounded-lg"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <Link to={`/blog/${c.article_slug}`}
                  className="text-xs font-medium hover:underline"
                  style={{ color: "var(--accent)" }}>
                  {c.article_title}
                </Link>
                <p className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>{c.content}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {new Date(c.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
    </>
  );
}
