import { Helmet } from "react-helmet-async";

const BASE = "https://nba-archetype.onrender.com";
const OG_IMAGE = `${BASE}/og-image.png`;

export function SEO({ title, description, path = "", noindex = false }) {
  const fullTitle = title ? `${title} | NBA Archetype` : "NBA Archetype — Identify Every Player's True Role";
  const url = `${BASE}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {noindex && <meta name="robots" content="noindex" />}
      <link rel="canonical" href={url} />
      <meta property="og:title"       content={fullTitle} />
      <meta property="og:url"         content={url} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image"       content={OG_IMAGE} />
      <meta name="twitter:title"      content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image"      content={OG_IMAGE} />
    </Helmet>
  );
}
