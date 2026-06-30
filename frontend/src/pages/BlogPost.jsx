import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

export default function BlogPost() {
  const { slug }          = useParams();
  const { token, user, isLoggedIn } = useAuth();
  const [article, setArticle] = useState(null);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/articles/${slug}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`/api/articles/${slug}/comments`).then(r => r.json()),
    ]).then(([art, com]) => {
      setArticle(art);
      setComments(com.comments || []);
    }).catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const submitComment = async () => {
    if (!comment.trim()) return;
    setPosting(true); setError("");
    try {
      const res = await fetch(`/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: comment }),
      });
      if (!res.ok) throw new Error("Yorum gönderilemedi");
      const data = await res.json();
      setComments(c => [...c, {
        id: data.id, content: comment,
        username: user.username,
        created_at: new Date().toISOString(),
      }]);
      setComment("");
    } catch (e) { setError(e.message); }
    finally { setPosting(false); }
  };

  const deleteComment = async (id) => {
    await fetch(`/api/comments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setComments(c => c.filter(x => x.id !== id));
  };

  if (loading) return <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>Yükleniyor…</div>;
  if (!article) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <p style={{ color: "var(--text-muted)" }}>Makale bulunamadı.</p>
      <Link to="/blog" style={{ color: "var(--accent)" }}>← Blog'a dön</Link>
    </div>
  );

  return (
    <>
    <SEO title={article.title} description={article.title} path={`/blog/${slug}`} />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-3xl mx-auto pb-16">

        {article.cover_image_url && (
          <img src={article.cover_image_url} alt={article.title}
            className="w-full h-64 object-cover rounded mb-6" />
        )}

        <Link to="/blog" className="text-sm hover:underline mb-4 block" style={{ color: "var(--accent)" }}>
          ← Blog
        </Link>

        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {article.title}
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          {article.author} · {new Date(article.created_at).toLocaleDateString("tr-TR")}
          {user?.role === "admin" && (
            <Link to={`/admin/articles/${article.id}/edit`}
              className="ml-3 underline" style={{ color: "var(--accent)" }}>
              Düzenle
            </Link>
          )}
        </p>

        {/* Article body — TipTap HTML output */}
        <div
          className="prose-nba"
          dangerouslySetInnerHTML={{ __html: article.content }}
          style={{ color: "var(--text-primary)" }}
        />

        {/* Comments */}
        <div className="mt-12 border-t pt-8" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold mb-4 text-base" style={{ color: "var(--text-primary)" }}>
            Yorumlar ({comments.length})
          </h2>

          {isLoggedIn ? (
            <div className="mb-6">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                placeholder="Yorumunu yaz…"
                className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              />
              {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
              <button onClick={submitComment} disabled={posting || !comment.trim()}
                className="mt-2 px-4 py-1.5 rounded text-sm font-medium transition-opacity"
                style={{ background: "var(--accent)", color: "#000", opacity: (posting || !comment.trim()) ? 0.5 : 1 }}>
                {posting ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          ) : (
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              Yorum yapmak için <Link to="/login" style={{ color: "var(--accent)" }}>giriş yap</Link>.
            </p>
          )}

          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="p-3 rounded"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{c.username}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(c.created_at).toLocaleDateString("tr-TR")}
                    </span>
                    {(user?.id === c.user_id || user?.role === "admin") && (
                      <button onClick={() => deleteComment(c.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                    )}
                  </div>
                </div>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>{c.content}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
    </>
  );
}
