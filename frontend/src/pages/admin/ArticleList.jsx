import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AdminLayout, { authFetch, fmtDate } from "./AdminLayout";
import { EmptyState, SkeletonRows } from "../../components/states/States";

// ── Admin · Content (handoff 17e) ───────────────────────────────────────────
// Başlık + /blog/slug · durum noktası · güncellenme · aksiyonlar. Şemada spor
// ve görüntülenme alanı yok; tasarımdaki o iki kolon eklenmedi.
const ST = { published: ["Published", "#4ade80"], draft: ["Draft", "#b4afa8"] };

export default function ArticleList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    authFetch("/admin/articles", token)
      .then(r => r.json()).then(d => setArticles(d.articles || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  const deleteArticle = async (id) => {
    const r = await authFetch(`/admin/articles/${id}`, token, { method: "DELETE" });
    if (r.ok) setArticles(a => a.filter(x => x.id !== id));
    setConfirmId(null);
  };

  return (
    <AdminLayout title="Content" aside={<button className="ad-btn" onClick={() => navigate("/admin/articles/new")}>New article</button>}>
      {loading ? <SkeletonRows count={5} height={58} /> : articles.length === 0 ? (
        <EmptyState tint="#f2efea" title="No articles yet" body="Write the first one — it stays a draft until you publish it."
          actions={[{ label: "New article", primary: true, onClick: () => navigate("/admin/articles/new") }]} />
      ) : (
        <div className="ad-table scroll" style={{ "--cols": "minmax(0,1fr) 120px 130px 200px" }}>
          <div className="ad-th"><span>Title</span><span>Status</span><span>Updated</span><span /></div>
          {articles.map(a => {
            const [lbl, c] = ST[a.status] || [a.status, "#8b857e"];
            return (
              <div key={a.id} className="ad-tr">
                <div className="ad-cell-main">
                  <b>{a.status === "published" ? <Link to={`/blog/${a.slug}`}>{a.title}</Link> : a.title}</b>
                  <span>/blog/{a.slug}</span>
                </div>
                <span className="ad-status" style={{ "--c": c }}><i />{lbl}</span>
                <span>{fmtDate(a.updated_at || a.created_at)}</span>
                <div className="ad-actions">
                  {confirmId === a.id ? (
                    <>
                      <button className="ad-sm bad" onClick={() => deleteArticle(a.id)}>Delete for good</button>
                      <button className="ad-sm" onClick={() => setConfirmId(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      <Link to={`/admin/articles/${a.id}/edit`} className="ad-sm" style={{ display: "inline-flex", alignItems: "center" }}>Edit</Link>
                      <button className="ad-sm" onClick={() => setConfirmId(a.id)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
