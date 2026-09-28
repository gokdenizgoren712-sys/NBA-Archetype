import { Link, useLocation } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import "./legal.css";

// Yasal sayfaların ortak kabuğu (handoff 11f): solda 220px "Legal" menüsü,
// ortada 680px okuma sütunu (44px başlık, 22px bölüm başlıkları, 16px/1.75).
// 2026-08 (roadmap Faz 2.1): metinler TASLAK — hukuki inceleme yapılmadan
// yayına alınmamalı; SEO noindex + görünür uyarı bu yüzden duruyor. Gerçek
// metin onaylanınca: uyarı + `noindex` kaldırılır, sitemap.xml'e (api/main.py
// STATIC_ROUTES) eklenir.

export const LEGAL_NAV = [
  { to: "/privacy-policy", label: "Privacy policy" },
  { to: "/terms-of-service", label: "Terms of service" },
  { to: "/community-guidelines", label: "Community guidelines" },
  { to: "/contact", label: "Contact" },
  { to: "/affiliate-disclosure", label: "Affiliate disclosure" },
];

export default function LegalPageLayout({ title, description, path, children }) {
  const { pathname } = useLocation();
  return (
    <div className="lg-page">
      <SEO title={title} description={description} path={path} noindex />
      <div className="lg-grid">
        <nav className="lg-nav" aria-label="Legal">
          <span>Legal</span>
          {LEGAL_NAV.map(n => (
            <Link key={n.to} to={n.to} className={pathname === n.to ? "on" : ""} aria-current={pathname === n.to ? "page" : undefined}>{n.label}</Link>
          ))}
        </nav>
        <article className="lg-article">
          <h1>{title}</h1>
          <span className="lg-date">Draft prepared August 9, 2026</span>
          <p className="lg-draft">
            <b>Draft — not yet legally reviewed.</b> This page is a placeholder prepared for review.
            Don't treat it as final or binding until a qualified reviewer has approved the text and it has been published for real.
          </p>
          {children}
        </article>
      </div>
    </div>
  );
}

export function Section({ heading, children }) {
  return (
    <section className="lg-sec">
      {heading && <h2>{heading}</h2>}
      {children}
    </section>
  );
}
