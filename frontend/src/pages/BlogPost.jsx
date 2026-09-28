import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import DOMPurify from "dompurify";
import { SEO } from "../hooks/useSEO";
import { PageGlow, EmptyState } from "../components/states/States";
import { articleTheme, fmtDate } from "./Blog";
import "./blog.css";

// ── Blog yazısı (handoff 11e / mobil 21d) ───────────────────────────────────
// Ortalı 720px makale: kırıntı, 48px başlık, yazar satırı, görsel, 17px/1.75
// gövde. Yorumlar altta, aynı dilde (kutusuz satırlar).
export default function BlogPost() {
  const { slug } = useParams();
  const { token, user, isLoggedIn } = useAuth();
  const [article, setArticle] = useState(null);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError]   = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/articles/${slug}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`/api/articles/${slug}/comments`).then(r => r.json()),
    ]).then(([art, com]) => { setArticle(art); setComments(com.comments || []); })
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [slug]);

  // Sunucu da temizliyor (nh3); burada ikinci kat — HTML'e script/olay
  // özniteliği sızarsa okuyanın oturumu (localStorage token) çalınırdı.
  const html = useMemo(() => DOMPurify.sanitize(article?.content || "", { USE_PROFILES: { html: true } }), [article]);
  const minutes = useMemo(() => {
    const words = (html.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).length;
    return words ? Math.max(1, Math.round(words / 220)) : null;
  }, [html]);

  const submitComment = async () => {
    if (!comment.trim()) return;
    setPosting(true); setError("");
    try {
      const res = await fetch(`/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: comment }),
      });
      if (!res.ok) throw new Error("Your comment wasn't posted. Try again.");
      const data = await res.json();
      setComments(c => [...c, { id: data.id, content: comment, username: user.username, user_id: user.id, created_at: new Date().toISOString() }]);
      setComment("");
    } catch (e) { setError(e.message); }
    finally { setPosting(false); }
  };

  const deleteComment = async (id) => {
    const r = await fetch(`/api/comments/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setComments(c => c.filter(x => x.id !== id));
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: article?.title, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (loading) return <div className="bl-page"><div className="bp-article"><div className="pa-skel" style={{ height: 48, width: "80%" }} /><div className="pa-skel" style={{ height: 260, borderRadius: 20 }} /></div></div>;
  if (!article) return (
    <EmptyState title="That post isn't here" body="It may have been unpublished or the link is wrong."
      actions={[{ label: "Back to the blog", primary: true, onClick: () => { window.location.href = "/blog"; } }]} />
  );

  const th = articleTheme(article.title);

  return (
    <>
      <SEO title={article.title} description={article.title} path={`/blog/${slug}`} />
      <div className="bl-page" style={{ "--c": th.c }}>
        <PageGlow tint={th.c} />
        <article className="bp-article">
          <div className="bp-crumb">
            <span><Link to="/blog">Blog</Link>{th.tag && <> <i>/</i> <em>{th.tag}</em></>}</span>
            <button onClick={share}>{copied ? "Link copied" : "Share"}</button>
          </div>
          <h1>{article.title}</h1>
          <div className="bp-by">
            <span className="av">{(article.author || "?")[0].toUpperCase()}</span>
            <span>{[article.author, fmtDate(article.created_at), minutes ? `${minutes} min read` : null].filter(Boolean).join(" · ")}</span>
            {user?.role === "admin" && <Link to={`/admin/articles/${article.id}/edit`}>Edit</Link>}
          </div>
          {(article.cover_image_url || th.art) && (
            <div className="bp-hero">
              {article.cover_image_url ? <img className="cover" src={article.cover_image_url} alt="" /> : <img className="art" src={th.art} alt="" />}
            </div>
          )}
          <div className="prose-nba bp-prose" dangerouslySetInnerHTML={{ __html: html }} />

          <section className="bp-comments">
            <h2>Comments{comments.length > 0 && <em>{comments.length}</em>}</h2>
            {isLoggedIn ? (
              <div className="bp-write">
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="Add to the conversation" aria-label="Write a comment" />
                {error && <p className="bp-err">{error}</p>}
                <button onClick={submitComment} disabled={posting || !comment.trim()} className="pa-btn-primary">{posting ? "Posting…" : "Post comment"}</button>
              </div>
            ) : (
              <p className="bp-signin"><Link to={`/login?next=/blog/${slug}`}>Sign in</Link> to comment.</p>
            )}
            {comments.length === 0 ? <p className="bp-none">No comments yet — be the first.</p> : comments.map(c => (
              <div key={c.id} className="bp-c">
                <div className="h">
                  <b>{c.username}</b>
                  <span>{fmtDate(c.created_at)}</span>
                  {(user?.id === c.user_id || user?.role === "admin") && <button onClick={() => deleteComment(c.id)}>Delete</button>}
                </div>
                <p>{c.content}</p>
              </div>
            ))}
          </section>
        </article>
      </div>
    </>
  );
}
