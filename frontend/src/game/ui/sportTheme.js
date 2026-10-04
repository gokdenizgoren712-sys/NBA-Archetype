// Spin & Build — spor teması: aynı bileşenler iki sporu bu nesneyle çizer.
// Renkler CSS'te (sport-theme.css); burada yalnız etiket farkları ve sınıf.
export const SPORT_THEMES = {
  basketball: {
    key: "basketball",
    className: "sport-basketball",
    accent: "#FFB11B",
    teamWord: "Team",          // futbolda "Club"
    yearWord: "Year",          // futbolda "Season"
    unit: "player",
    draftSize: 9,              // 5 ilk beş + 4 yedek
    starters: 5,
    bench: 4,
    simGames: 82,
    lineupWord: "Lineup",
    coachWord: "Coach",
    rooms: { seriesWord: "Series", legWord: "Game" },
  },
  football: {
    key: "football",
    className: "sport-football",
    accent: "#3FB08C",
    teamWord: "Club",
    yearWord: "Season",
    unit: "player",
    draftSize: 18,             // 11 saha + 7 yedek
    starters: 11,
    bench: 7,
    simGames: 40,
    lineupWord: "XI",
    coachWord: "Manager",
    rooms: { seriesWord: "Tie", legWord: "Leg" },
  },
};

export function sportTheme(sport) {
  return SPORT_THEMES[sport] || SPORT_THEMES.basketball;
}

// Sarmalayıcı sınıfı: <div className={gameClass("football")}>…</div>
export function gameClass(sport, extra = "") {
  return `sb-game ${sportTheme(sport).className}${extra ? " " + extra : ""}`;
}
