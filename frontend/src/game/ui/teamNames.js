// NBA takım kısaltması → tam ad (mockup 3c "NEW YORK KNICKS"). API kısaltma döndürür;
// tarihsel kısaltmalar (SEA, NJN, VAN…) dahil. Bilinmeyen kısaltma olduğu gibi kalır.
const NAMES = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets", NJN: "New Jersey Nets",
  CHA: "Charlotte Hornets", CHH: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons", GSW: "Golden State Warriors",
  HOU: "Houston Rockets", IND: "Indiana Pacers", LAC: "LA Clippers", SDC: "San Diego Clippers",
  LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies", VAN: "Vancouver Grizzlies", MIA: "Miami Heat",
  MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", NOP: "New Orleans Pelicans", NOH: "New Orleans Hornets",
  NOK: "New Orleans/Oklahoma City Hornets", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  SEA: "Seattle SuperSonics", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", KCK: "Kansas City Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", UTH: "Utah Jazz", WAS: "Washington Wizards", WSB: "Washington Bullets",
};
export const teamName = (abbr) => NAMES[abbr] || abbr;
