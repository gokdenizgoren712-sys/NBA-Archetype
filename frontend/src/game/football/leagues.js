// Lig kimlikleri — TEK KAYNAK.
//
// Beş ayrı dosyada beş kopya vardı ve Bundesliga + Ligue 1 eklenince
// SeasonPanel'deki kopya güncellenmeyi unuttu: simülasyon paneli yeni iki
// ligi ham slug olarak ("ligue-1") gösteriyordu. Yeni bir lig eklemek tek
// dosyayı değiştirmek olmalı.

export const LEAGUE_LABEL = {
  "premier-league": "Premier League",
  "la-liga": "La Liga",
  "serie-a": "Serie A",
  "bundesliga": "Bundesliga",
  "ligue-1": "Ligue 1",
};

// Bilinmeyen slug gelirse ham hâlini göster — sessizce boş bırakma.
export const leagueLabel = (slug) => LEAGUE_LABEL[slug] || slug || "";

// Sayfalarda tutarlı sıra: tanıdıktan az tanıdığa değil, hep aynı sırayla.
export const LEAGUE_ORDER = Object.keys(LEAGUE_LABEL);
export const sortLeagues = (arr = []) =>
  [...arr].sort((a, b) => {
    const i = LEAGUE_ORDER.indexOf(a), j = LEAGUE_ORDER.indexOf(b);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });
