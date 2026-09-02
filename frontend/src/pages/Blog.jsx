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
      title="Blog — NBA Analysis & Articles"
      description="Articles on NBA archetypes, player analysis, and basketball tactics."
      path="/blog"
    />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="font-logo text-3xl font-bold mb-6 tracking-wide" style={{ color: "var(--text-primary)" }}>Blog</h1>

        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : articles.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No articles yet.</p>
        ) : (
          <div className="space-y-4">
            {articles.map(a => (
              <Link key={a.id} to={`/blog/${a.slug}`}
                className="aura-glass block rounded-xl overflow-hidden transition-opacity hover:opacity-80">
                {a.cover_image_url && (
                  <img src={a.cover_image_url} alt={a.title}
                    className="w-full h-48 object-cover" />
                )}
                <div className="p-4">
                  <h2 className="font-logo font-semibold text-base mb-1 tracking-wide" style={{ color: "var(--text-primary)" }}>
                    {a.title}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {a.author} · {new Date(a.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
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
