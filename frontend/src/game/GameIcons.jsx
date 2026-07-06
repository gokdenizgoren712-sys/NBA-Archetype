/* Custom SVG icons for the Lineup Builder game — replaces emoji.
   All inherit the surrounding text colour via currentColor, so wrapping
   them in a `text-yellow-400` span etc. tints them. */

const base = (size) => ({
  width: size, height: size, viewBox: "0 0 24 24",
  fill: "none", xmlns: "http://www.w3.org/2000/svg",
});
const S = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export function StarIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <polygon points="12,2.5 14.9,8.6 21.5,9.5 16.7,14.2 17.9,20.8 12,17.6 6.1,20.8 7.3,14.2 2.5,9.5 9.1,8.6"
        fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TrophyIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M7 4 h10 v5 a5 5 0 0 1 -10 0 z" {...S} />
      <path d="M7 5 H4 a2 2 0 0 0 0 4 h1.2" {...S} />
      <path d="M17 5 h3 a2 2 0 0 1 0 4 h-1.2" {...S} />
      <path d="M12 14 v3" {...S} />
      <path d="M8.5 20.5 h7 M9.5 17.5 h5 v3 h-5 z" {...S} />
    </svg>
  );
}

export function CrownIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M3 8 l3.5 8.5 h11 L21 8 l-5 4 -4 -7 -4 7 z" {...S} />
      <path d="M6 19.5 h12" {...S} />
    </svg>
  );
}

export function CoachIcon({ size = 16 }) {
  /* Coach's clipboard */
  return (
    <svg {...base(size)}>
      <rect x="5" y="4" width="14" height="17" rx="2" {...S} />
      <path d="M9 4 a3 2 0 0 1 6 0" {...S} />
      <path d="M8.5 11 h7 M8.5 15 h5" {...S} />
    </svg>
  );
}

export function CapIcon({ size = 16 }) {
  /* Salary cap: dollar in a ring */
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" {...S} />
      <path d="M14.5 9 a3 2.2 0 0 0 -5 0.8 c0 2.6 5 1.4 5 4 a3 2.2 0 0 1 -5 0.8" {...S} />
      <path d="M12 6.5 v11" {...S} />
    </svg>
  );
}

export function TargetIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <circle cx="12" cy="12" r="4.5" {...S} />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WheelIcon({ size = 16 }) {
  /* Spin wheel */
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" {...S} />
      <circle cx="12" cy="12" r="2" {...S} />
      <path d="M12 3 v3.5 M12 17.5 V21 M3 12 h3.5 M17.5 12 H21 M5.6 5.6 l2.5 2.5 M15.9 15.9 l2.5 2.5 M18.4 5.6 l-2.5 2.5 M8.1 15.9 l-2.5 2.5" {...S} />
    </svg>
  );
}

export function CardsIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="8" y="6" width="11" height="14" rx="2" {...S} />
      <path d="M5.5 8 l-1.2 0.4 a1.8 1.8 0 0 0 -1.1 2.2 l2.4 7.6" {...S} />
      <path d="M13.5 10.5 l1 1.8 -1 1.8 -1 -1.8 z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TagIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M3.5 12.5 l8 -8 h7 v7 l-8 8 z" {...S} />
      <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DnaIcon({ size = 16 }) {
  /* Archetype double-helix */
  return (
    <svg {...base(size)}>
      <path d="M7 3 c0 5 10 5 10 9 s-10 4 -10 9" {...S} />
      <path d="M17 3 c0 5 -10 5 -10 9 s10 4 10 9" {...S} />
      <path d="M8.5 6 h7 M8.5 18 h7 M10 9 h4 M10 15 h4" {...S} strokeWidth="1.4" />
    </svg>
  );
}

export function RefreshIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M20 11 a8 8 0 0 0 -14 -4 L3 10" {...S} />
      <path d="M4 13 a8 8 0 0 0 14 4 l3 -3" {...S} />
      <path d="M3 5 v5 h5 M21 19 v-5 h-5" {...S} />
    </svg>
  );
}

export function CalendarIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" {...S} />
      <path d="M3.5 9.5 h17 M8 3 v4 M16 3 v4" {...S} />
    </svg>
  );
}

export function BoltIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M13 2 L4 13.5 h6 L11 22 l9 -11.5 h-6 z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function UsersIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <circle cx="8.5" cy="8" r="3" {...S} />
      <path d="M3 20 a5.5 5.5 0 0 1 11 0" {...S} />
      <path d="M15.5 6 a3 3 0 0 1 0 6 M16.5 15.2 a5.5 5.5 0 0 1 4.5 4.8" {...S} />
    </svg>
  );
}

export function SearchIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <circle cx="10.5" cy="10.5" r="6.5" {...S} />
      <path d="M15.5 15.5 L21 21" {...S} />
    </svg>
  );
}

export function PlayIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M7 4.5 v15 l12 -7.5 z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function LoopIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M17 3 l3 3 -3 3" {...S} />
      <path d="M20 6 H8 a5 5 0 0 0 -5 5 v0" {...S} />
      <path d="M7 21 l-3 -3 3 -3" {...S} />
      <path d="M4 18 h12 a5 5 0 0 0 5 -5 v0" {...S} />
    </svg>
  );
}

export function GapIcon({ size = 16 }) {
  /* Era liability — a hole */
  return (
    <svg {...base(size)}>
      <ellipse cx="12" cy="16" rx="8" ry="4" {...S} />
      <path d="M4 16 c0 -6 4 -12 8 -12 s8 6 8 12" {...S} strokeDasharray="2 2.5" strokeWidth="1.4" />
    </svg>
  );
}

export function WarnIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 L22 20 H2 z" {...S} />
      <path d="M12 9 v5" {...S} />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EyeIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M2 12 s3.5 -6.5 10 -6.5 S22 12 22 12 s-3.5 6.5 -10 6.5 S2 12 2 12 z" {...S} />
      <circle cx="12" cy="12" r="2.5" {...S} />
    </svg>
  );
}

export function LinkIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M9 15 l6 -6" {...S} />
      <path d="M11 6 l1.5 -1.5 a4 4 0 0 1 5.7 5.7 L16.5 12" {...S} />
      <path d="M13 18 l-1.5 1.5 a4 4 0 0 1 -5.7 -5.7 L7.5 12" {...S} />
    </svg>
  );
}

export function BasketballIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9.2" {...S} strokeWidth="1.6" />
      <path d="M12 2.8 V21.2 M2.8 12 H21.2" {...S} strokeWidth="1.4" />
      <path d="M5.4 5.4 C9 9 9 15 5.4 18.6 M18.6 5.4 C15 9 15 15 18.6 18.6" {...S} strokeWidth="1.4" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M4 12.5 l5 5 L20 6" {...S} />
    </svg>
  );
}

export function DownloadIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 v11" {...S} />
      <path d="M7 10 l5 5 5 -5" {...S} />
      <path d="M4 20 h16" {...S} />
    </svg>
  );
}

export function XLogoIcon({ size = 16 }) {
  /* X (Twitter) wordmark */
  return (
    <svg {...base(size)}>
      <path d="M4 4 L20 20 M20 4 L4 20" {...S} strokeWidth="2.4" />
    </svg>
  );
}

export function DiceIcon({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="16" height="16" rx="3" {...S} />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
