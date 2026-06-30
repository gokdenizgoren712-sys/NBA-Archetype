import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../hooks/useSEO";

export default function Blog() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/articles")
      .then(r => r.json())
      .then(d => setArticles(d.articles || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
    <SEO
      title="Blog — NBA Analiz & Yazılar"
      description="NBA arketipleri, oyuncu analizleri ve basketbol taktikleri üzerine yazılar."
      path="/blog"
    />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Blog</h1>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Yükleniyor…</p>
        ) : articles.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Henüz makale yok.</p>
        ) : (
          <div className="space-y-4">
            {articles.map(a => (
              <Link key={a.id} to={`/blog/${a.slug}`}
                className="block rounded overflow-hidden transition-opacity hover:opacity-80"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                {a.cover_image_url && (
                  <img src={a.cover_image_url} alt={a.title}
                    className="w-full h-48 object-cover" />
                )}
                <div className="p-4">
                  <h2 className="font-semibold text-base mb-1" style={{ color: "var(--text-primary)" }}>
                    {a.title}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {a.author} · {new Date(a.created_at).toLocaleDateString("tr-TR")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
