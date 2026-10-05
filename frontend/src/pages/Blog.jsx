import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { EmptyState, ErrorState, SkeletonGrid } from "../components/states/States";
import { ARCHETYPE_COLOR, archetypeArt } from "../constants/archetypeColors";
import "./blog.css";

// ── Blog dizini (handoff 10b / mobil 21c) ───────────────────────────────────
// İlk yazı büyük öne çıkan kart, kalanlar 3'lü ızgara (mobilde liste).
// Şemada etiket yok: başlıkta bir arketip adı geçiyorsa yazı o arketipin
// rengini ve görselini alıyor, yoksa altın. Özet ve okuma süresi API'den
// (içerikten türetiliyor).

const CORE = Object.keys(ARCHETYPE_COLOR);
export function articleTheme(title = "") {
  const arch = CORE.find(a => new RegExp(`\\b${a}\\b`, "i").test(title));
  return arch ? { tag: arch, c: ARCHETYPE_COLOR[arch], art: archetypeArt(arch) } : { tag: null, c: "#FFB11B", art: null };
}
export const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const meta = (a) => [fmtDate(a.created_at), a.read_minutes ? `${a.read_minutes} min read` : null].filter(Boolean).join(" · ");

function Visual({ a, th, big }) {
  if (a.cover_image_url) return <img className="bl-cover" src={a.cover_image_url} alt="" loading={big ? "eager" : "lazy"} />;
  if (th.art) return <img className="bl-art" src={th.art} alt="" loading={big ? "eager" : "lazy"} />;
  return null;
}

export default function Blog() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    fetch("/api/articles")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setArticles(d.articles || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const [first, ...rest] = articles;
  const fth = first ? articleTheme(first.title) : null;

  return (
    <>
      <SEO title="Blog — NBA Analysis & Articles" description="Articles on NBA archetypes, player analysis, and basketball tactics." path="/blog" />
      <div className="bl-page">
        <div className="bl-inner">
          <h1 className="bl-h1">Blog</h1>
          {error ? <ErrorState onRetry={load} /> : loading ? <SkeletonGrid count={3} height={180} /> : !first ? (
            <EmptyState title="No articles yet" body="Posts on archetypes, eras and the game land here. Check back soon." />
          ) : (
            <>
              <Link to={`/blog/${first.slug}`} className="bl-feat" style={{ "--c": fth.c }}>
                <i className="glow" />
                <div className="txt">
                  <span className="k">Featured{fth.tag ? ` · ${fth.tag}` : ""}</span>
                  <h2>{first.title}</h2>
                  {first.excerpt && <p>{first.excerpt}</p>}
                  <span className="m">{meta(first)}</span>
                </div>
                <div className="vis"><Visual a={first} th={fth} big /></div>
              </Link>

              {rest.length > 0 && (
                <div className="bl-grid">
                  {rest.map(a => {
                    const th = articleTheme(a.title);
                    return (
                      <Link key={a.id} to={`/blog/${a.slug}`} className="bl-card" style={{ "--c": th.c }}>
                        <div className="vis"><i className="glow" /><Visual a={a} th={th} /></div>
                        {th.tag && <span className="k">{th.tag}</span>}
                        <h3>{a.title}</h3>
                        <span className="m">{meta(a)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
