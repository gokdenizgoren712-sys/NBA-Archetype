/**
 * Primary Arch — marka ikonografisi.
 * SVG'ler tasarım-sistemi referans dosyalarından BİREBİR alınmıştır
 * (12-gen logo + 24x24 sadeleştirilmiş nav ikonları, stroke-width 1.5).
 * Uydurma ikon YOK — tek kaynak referans HTML'leri.
 */

/* ── Ana Logo: 12-gen (Dodecagon) — 12 arketip ────────────────────── */
export function Logo({ size = 32, dashed = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7"
        stroke="#FFB11B" strokeWidth="4" strokeLinejoin="round" />
      <path d="M 14 6.7 C 22 18 22 30 14 41.3" stroke="#1d428a" strokeWidth="4" strokeLinecap="round" />
      <path d="M 34 6.7 C 26 18 26 30 34 41.3" stroke="#c8102e" strokeWidth="4" strokeLinecap="round" />
      <path d="M 4 24 H 44" stroke="#00A3AF" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={dashed ? "4 4" : undefined} />
    </svg>
  );
}

/* ── Nav ikon sarmalayıcı: 24x24, stroke 1.5, round ───────────────── */
function Svg({ size = 24, className = "", children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {children}
    </svg>
  );
}

/* 1. Game — 12-gen dış hat (yamabuki) */
export const GameIcon = (p) => (
  <Svg {...p} className={`stroke-yamabuki ${p.className || ""}`}>
    <polygon points="12,2 17,3.35 20.65,7 22,12 20.65,17 17,20.65 12,22 7,20.65 3.35,17 2,12 3.35,7 7,3.35" />
  </Svg>
);

/* 2. NBA — çift-renkli top */
export const NBAIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="9" className="stroke-brandBlue" />
    <path d="M12 3v18" className="stroke-brandRed" />
    <path d="M5.5 7.5c2-1 4 2 6.5 2s4.5-3 6.5-2" className="stroke-brandBlue" />
    <path d="M5.5 16.5c2 1 4-2 6.5-2s4.5 3 6.5 2" className="stroke-brandRed" />
  </svg>
);

/* 3. G-Lg (brandRed) */
export const GLeagueIcon = (p) => (
  <Svg {...p} className={`stroke-brandRed ${p.className || ""}`}>
    <path d="M15 9h-3a4 4 0 00-4 4v0a4 4 0 004 4h4v-4h-2" />
    <path d="M7 20h10" />
  </Svg>
);

/* 4. NCAA (brandBlue) */
export const NCAAIcon = (p) => (
  <Svg {...p} className={`stroke-brandBlue ${p.className || ""}`}>
    <path d="M7 18V6l10 12V6" />
    <path d="M5 6h14" />
  </Svg>
);

/* 5. EUR — 5-köşe yıldız (yamabuki) */
export const EuroLeagueIcon = (p) => (
  <Svg {...p} className={`stroke-yamabuki ${p.className || ""}`}>
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
  </Svg>
);

/* 6. Lineups — 3 yatay çizgi (gray → hover white) */
export const LineupsIcon = (p) => (
  <Svg {...p} className={`stroke-gray-400 group-hover:stroke-white transition ${p.className || ""}`}>
    <path d="M4 7h16M7 12h13M10 17h10" />
  </Svg>
);

/* 7. Explore — iç içe halka (asagi) */
export const ExploreIcon = (p) => (
  <Svg {...p} className={`stroke-asagi ${p.className || ""}`}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
  </Svg>
);

/* 8. Compare — karşılıklı oklar (asagi) */
export const CompareIcon = (p) => (
  <Svg {...p} className={`stroke-asagi ${p.className || ""}`}>
    <path d="M4 9h14l-4-4M20 15H6l4 4" />
  </Svg>
);

/* 9. Affinity — hexagon (brandBlue) */
export const AffinityIcon = (p) => (
  <Svg {...p} className={`stroke-brandBlue ${p.className || ""}`}>
    <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" />
  </Svg>
);

/* 10. Blog — çizgisel kalem (brandRed) */
export const BlogIcon = (p) => (
  <Svg {...p} className={`stroke-brandRed ${p.className || ""}`}>
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </Svg>
);

/* 11. Glossary — sözlük satırları (gray) */
export const GlossaryIcon = (p) => (
  <Svg {...p} className={`stroke-gray-400 group-hover:stroke-white transition ${p.className || ""}`}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
);

/* 12. About — bilgi (brandBlue) */
export const AboutIcon = (p) => (
  <Svg {...p} className={`stroke-brandBlue ${p.className || ""}`}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);

/* Admin — ayar (gray) */
export const AdminIcon = (p) => (
  <Svg {...p} className={`stroke-gray-400 group-hover:stroke-white transition ${p.className || ""}`}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Svg>
);

/* ── Fonksiyonel ikonlar (nav dışı, aynı 24x24/1.5 stroke sistemi) ── */

/* Refresh — döngü oku */
export const RefreshIcon = (p) => (
  <Svg {...p} className={`stroke-current ${p.className || ""}`}>
    <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" />
    <path d="M18 4v4h-4M6 20v-4h4" />
  </Svg>
);

/* Mail — zarf */
export const MailIcon = (p) => (
  <Svg {...p} className={`stroke-current ${p.className || ""}`}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Svg>
);

/* Flag — bayrak */
export const FlagIcon = (p) => (
  <Svg {...p} className={`stroke-current ${p.className || ""}`}>
    <path d="M5 3v18" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </Svg>
);

/* Lightbulb — ipucu/fikir */
export const LightbulbIcon = (p) => (
  <Svg {...p} className={`stroke-current ${p.className || ""}`}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" />
  </Svg>
);
