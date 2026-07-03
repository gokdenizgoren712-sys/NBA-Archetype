/* Custom SVG league icons for the left navbar */

export function NBAIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="8.5" stroke="#C8102E" strokeWidth="1.5" />
      {/* vertical centre seam */}
      <path d="M10 1.5 C10 1.5 10 18.5 10 18.5" stroke="#1D428A" strokeWidth="1.2" />
      {/* left arc */}
      <path d="M10 1.5 C5 4 2 7 1.8 10 C2 13 5 16 10 18.5" stroke="#1D428A" strokeWidth="1.2" fill="none" />
      {/* right arc */}
      <path d="M10 1.5 C15 4 18 7 18.2 10 C18 13 15 16 10 18.5" stroke="#1D428A" strokeWidth="1.2" fill="none" />
      {/* horizontal seam */}
      <path d="M1.5 10 L18.5 10" stroke="#C8102E" strokeWidth="1" />
    </svg>
  );
}

export function GLeagueIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Bold "G" */}
      <path
        d="M15.5 7.5 C14 4.5 11.5 3 9 3 C5.7 3 3 5.7 3 9 C3 12.3 5.7 15 9 15 C11.5 15 13.5 13.5 14.5 11.5 L14.5 9 L9.5 9"
        stroke="#A8263F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* accent underline */}
      <line x1="3" y1="17.5" x2="17" y2="17.5" stroke="#A8263F" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function NCAAIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Angular "N" */}
      <path
        d="M4 16 L4 4 L16 16 L16 4"
        stroke="#002868" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* mortarboard cap line */}
      <line x1="3" y1="2.5" x2="17" y2="2.5" stroke="#002868" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="10" y1="2.5" x2="10" y2="0.5" stroke="#002868" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function EuroLeagueIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 5-point star */}
      <polygon
        points="10,2 12.4,7.5 18.5,7.8 14,11.8 15.6,18 10,14.5 4.4,18 6,11.8 1.5,7.8 7.6,7.5"
        stroke="#FF6900" strokeWidth="1.5" strokeLinejoin="round"
      />
    </svg>
  );
}
