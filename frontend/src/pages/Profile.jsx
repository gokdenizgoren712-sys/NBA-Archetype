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
  const { token, user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData]   = useState(null);
  const [tab, setTab]     = useState("players");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) { navigate("/login"); return; }
    authFetch("/profile", token).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [isLoggedIn]);

  const removePlayer = async (id) => {
    await authFetch(`/profile/saved-players/${id}`, token, { method: "DELETE" });
    setData(d => ({ ...d, saved_players: d.saved_players.filter(p => p.id !== id) }));
  };

  const removeLineup = async (id) => {
    await authFetch(`/profile/saved-lineups/${id}`, token, { method: "DELETE" });
    setData(d => ({ ...d, saved_lineups: d.saved_lineups.filter(l => l.id !== id) }));
  };

  const TABS = [
    { key: "players", label: "Oyuncular" },
    { key: "lineups", label: "Lineup'lar" },
    { key: "comments", label: "Yorumlar" },
  ];

  if (loading) return <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>Yükleniyor…</div>;
  if (!data) return null;

  return (
    <>
    <SEO title="Profilim" path="/profile" noindex />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {data.user?.username}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              {data.user?.email} · {data.user?.role === "admin" ? "Admin" : "Üye"} ·
              Katılım {new Date(data.user?.created_at).toLocaleDateString("tr-TR")}
            </p>
          </div>
          <div className="flex gap-2">
            {data.user?.role === "admin" && (
              <Link to="/admin/articles"
                className="px-3 py-1.5 rounded text-sm font-medium"
                style={{ background: "var(--accent)", color: "#000" }}>
                Admin Panel
              </Link>
            )}
            <button onClick={logout}
              className="px-3 py-1.5 rounded text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Çıkış
            </button>
          </div>
        </div>

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
                Henüz kayıtlı oyuncu yok. Players sayfasından oyuncu kaydet.
              </p>
            ) : data.saved_players.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div>
                  <Link to={`/players?q=${encodeURIComponent(p.player_name)}`}
                    className="font-medium text-sm hover:underline"
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
                Henüz kayıtlı lineup yok. Lineup Game'den kaydedebilirsin.
              </p>
            ) : data.saved_lineups.map(l => (
              <div key={l.id} className="p-3 rounded"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-lg" style={{ color: "var(--accent)" }}>{l.grade}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(l.created_at).toLocaleDateString("tr-TR")}
                    </span>
                    <button onClick={() => removeLineup(l.id)} className="text-xs text-red-400">✕</button>
                  </div>
                </div>
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  Skor: {l.pct ? Math.round(l.pct) : "—"}% · {l.label || ""}
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
                Henüz yorum yapılmadı.
              </p>
            ) : data.comments.map(c => (
              <div key={c.id} className="p-3 rounded"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <Link to={`/blog/${c.article_slug}`}
                  className="text-xs font-medium hover:underline"
                  style={{ color: "var(--accent)" }}>
                  {c.article_title}
                </Link>
                <p className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>{c.content}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {new Date(c.created_at).toLocaleDateString("tr-TR")}
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
