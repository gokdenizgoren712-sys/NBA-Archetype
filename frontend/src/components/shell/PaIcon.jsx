// Handoff v2 ikon seti (docs/design/handoff-v2/PaIcon.dc.html) — kabuk ve
// ortak kontroller için. Varsayılan tek renk (currentColor); `brand` açılınca
// ikon kendi marka renklerini taşır (lig ikonları, NBA topu vb.).
const BRAND = {
  gold: "#FFB11B", blue: "#1d428a", red: "#c8102e", teal: "#3FB08C", asagi: "#00A3AF",
  gray: "#9ca3af", l1: "#e8654c", l2: "#A8263F", l3: "#3D7EC9", l4: "#FF6900",
};

const PATHS = {
  game: (c) => <polygon stroke={c.gold} points="12,2 17,3.35 20.65,7 22,12 20.65,17 17,20.65 12,22 7,20.65 3.35,17 2,12 3.35,7 7,3.35" />,
  football: (c) => (
    <g stroke={c.teal}>
      <circle cx="12" cy="12" r="9" /><polygon points="12,7.6 15.7,10.3 14.3,14.6 9.7,14.6 8.3,10.3" />
      <path d="M12 3v4.6" /><path d="M20.6 9.6l-4.9.7" /><path d="M17.2 19.4l-2.9-4.8" />
      <path d="M6.8 19.4l2.9-4.8" /><path d="M3.4 9.6l4.9.7" />
    </g>
  ),
  nba: (c) => (
    <g stroke={c.l1}>
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18" />
      <path d="M5.8 5.8c2.9 3.1 2.9 9.3 0 12.4M18.2 5.8c-2.9 3.1-2.9 9.3 0 12.4" />
    </g>
  ),
  gleague: (c) => <g stroke={c.l2}><path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21" /><path d="M17.5 3.5H21V7" /></g>,
  ncaa: (c) => (
    <g stroke={c.l3}>
      <path d="M2 9.5L12 5l10 4.5L12 14z" /><path d="M6 11.3V16c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.7" /><path d="M22 9.5v5" />
    </g>
  ),
  euroleague: (c) => (
    <g stroke={c.l4}>
      <circle cx="12" cy="12" r="3.2" />
      {[[20,12],[17.66,17.66],[12,20],[6.34,17.66],[4,12],[6.34,6.34],[12,4],[17.66,6.34]].map(([x,y]) =>
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />)}
    </g>
  ),
  lineups:  (c) => <path stroke={c.gray} d="M4 7h16M7 12h13M10 17h10" />,
  explore:  (c) => <g stroke={c.asagi}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></g>,
  blog:     (c) => <path stroke={c.red} d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />,
  about:    (c) => <path stroke={c.gray} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  admin:    (c) => <g stroke={c.gray}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></g>,
  refresh:  (c) => <g stroke={c.gray}><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" /><path d="M18 4v4h-4M6 20v-4h4" /></g>,
  search:   (c) => <g stroke={c.gray}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.8-3.8" /></g>,
  sliders:  (c) => <path stroke={c.gray} d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
  chevron:  (c) => <path stroke={c.gray} d="M6 9l6 6 6-6" />,
  collapse: (c) => <g stroke={c.gray}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16M15 10l-2 2 2 2" /></g>,
  expand:   (c) => <g stroke={c.gray}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16M13 10l2 2-2 2" /></g>,
  menu:     (c) => <path stroke={c.gray} d="M4 7h16M4 12h16M4 17h16" />,
  close:    (c) => <path stroke={c.gray} d="M6 6l12 12M18 6L6 18" />,
  check:    (c) => <path stroke={c.gray} d="M5 12l5 5 9-10" />,
  info:     (c) => <g stroke={c.gray}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></g>,
  play:     (c) => <path d="M7 4.5 v15 l12 -7.5 z" fill={c.gray} stroke={c.gray} />,
  users:    (c) => <g stroke={c.gray} strokeWidth="2"><circle cx="8.5" cy="8" r="3" /><path d="M3 20 a5.5 5.5 0 0 1 11 0" /><path d="M15.5 6 a3 3 0 0 1 0 6 M16.5 15.2 a5.5 5.5 0 0 1 4.5 4.8" /></g>,
  monitor:  (c) => <g stroke={c.gray} strokeWidth="2"><rect x="3" y="4.5" width="18" height="12" rx="1.5" /><path d="M9 20 h6 M12 16.5 v3.5" /></g>,
  globe:    (c) => <g stroke={c.gray} strokeWidth="2"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12 h17 M12 3.5 a13 13 0 0 1 0 17 a13 13 0 0 1 0 -17" /></g>,
  trophy:   (c) => <g stroke={c.gray} strokeWidth="2"><path d="M7 4 h10 v5 a5 5 0 0 1 -10 0 z" /><path d="M7 5 H4 a2 2 0 0 0 0 4 h1.2" /><path d="M17 5 h3 a2 2 0 0 1 0 4 h-1.2" /><path d="M12 14 v3" /><path d="M8.5 20.5 h7 M9.5 17.5 h5 v3 h-5 z" /></g>,
  star:     (c) => <polygon stroke={c.gray} points="12,3 14.7,8.6 20.8,9.3 16.3,13.5 17.5,19.6 12,16.6 6.5,19.6 7.7,13.5 3.2,9.3 9.3,8.6" />,
  wheel:    (c) => <g stroke={c.gray} strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 3 v3.5 M12 17.5 V21 M3 12 h3.5 M17.5 12 H21 M5.6 5.6 l2.5 2.5 M15.9 15.9 l2.5 2.5 M18.4 5.6 l-2.5 2.5 M8.1 15.9 l-2.5 2.5" /></g>,
  cap:      (c) => <g stroke={c.gray} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M14.5 9 a3 2.2 0 0 0 -5 0.8 c0 2.6 5 1.4 5 4 a3 2.2 0 0 1 -5 0.8" /><path d="M12 6.5 v11" /></g>,
  bolt:     (c) => <path d="M13 2 L4 13.5 h6 L11 22 l9 -11.5 h-6 z" fill={c.gray} stroke={c.gray} strokeWidth="1.2" />,
  calendar: (c) => <g stroke={c.gray} strokeWidth="2"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 9.5 h17 M8 3 v4 M16 3 v4" /></g>,
};

export default function PaIcon({ name, size = 20, color = "currentColor", brand = false, style }) {
  const draw = PATHS[name];
  if (!draw) return null;
  const c = brand ? BRAND : Object.fromEntries(Object.keys(BRAND).map(k => [k, color]));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block", flexShrink: 0, ...style }}>
      {draw(c)}
    </svg>
  );
}
