import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";

// 2026-08 (roadmap Faz 2.1): siteye ilk kez eklenen yasal sayfaların ortak
// kabuğu. Metinler TASLAK — hukuki inceleme yapılmadan yayına alınmamalı,
// bu yüzden hem SEO noindex hem de görünür bir uyarı bandı taşıyor. Gerçek
// metin onaylanınca: bu banner + `noindex` kaldırılır, sitemap.xml'e
// (api/main.py STATIC_ROUTES) eklenir.
export default function LegalPageLayout({ title, description, path, children }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <SEO title={title} description={description} path={path} noindex />
      <div className="max-w-2xl mx-auto px-6 py-10 sm:py-12">
        <div className="mb-6 rounded-xl px-4 py-3 text-[12.5px] leading-relaxed"
          style={{ background: "rgba(255,177,27,.08)", border: "1px solid rgba(255,177,27,.35)", color: "var(--yamabuki)" }}>
          <strong>Draft — not yet legally reviewed.</strong> This page is a placeholder prepared
          for review. Do not treat it as final or binding until a qualified reviewer has
          approved the text and it has been published for real.
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        <p className="text-[12px] mb-8" style={{ color: "var(--text-faint)" }}>
          Draft prepared 2026-08-09
        </p>

        <div className="space-y-6 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary,#d1d5db)" }}>
          {children}
        </div>

        <div className="mt-12 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
          <Link to="/game" className="text-[12.5px] hover:underline" style={{ color: "var(--yamabuki)" }}>
            ← Back to Primary Arch
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Section({ heading, children }) {
  return (
    <section>
      {heading && (
        <h2 className="text-[15px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          {heading}
        </h2>
      )}
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
