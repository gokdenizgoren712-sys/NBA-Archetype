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

export default function ArticleList() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    authFetch("/admin/articles", token)
      .then(r => r.json())
      .then(d => setArticles(d.articles || []))
      .finally(() => setLoading(false));
  }, []);

  const deleteArticle = async (id) => {
    if (!confirm("Delete this article?")) return;
    await authFetch(`/admin/articles/${id}`, token, { method: "DELETE" });
    setArticles(a => a.filter(x => x.id !== id));
  };

  return (
    <>
    <SEO title="Admin — Articles" noindex path="/admin/articles" />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Articles</h1>
          <div className="flex gap-2">
            <Link to="/profile"
              className="px-3 py-1.5 rounded text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              Profile
            </Link>
            <Link to="/admin/articles/new"
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#000" }}>
              + New Article
            </Link>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : articles.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No articles yet. Create your first one!</p>
        ) : (
          <div className="rounded overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-elevated)" }}>
                <tr>
                  {["Title", "Slug", "Status", "Date", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-2 font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articles.map((a, i) => (
                  <tr key={a.id}
                    style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-elevated)", borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                      {a.status === "published"
                        ? <Link to={`/blog/${a.slug}`} className="hover:underline">{a.title}</Link>
                        : a.title
                      }
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>{a.slug}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          background: a.status === "published" ? "rgba(34,197,94,.15)" : "rgba(148,163,184,.15)",
                          color: a.status === "published" ? "#4ade80" : "var(--text-muted)",
                        }}>
                        {a.status === "published" ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(a.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link to={`/admin/articles/${a.id}/edit`}
                          className="px-2 py-1 rounded text-xs"
                          style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                          Edit
                        </Link>
                        <button onClick={() => deleteArticle(a.id)}
                          className="px-2 py-1 rounded text-xs text-red-400 hover:text-red-300"
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
