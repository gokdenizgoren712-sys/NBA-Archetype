// ── Koç draft'ı (v3.5 Faz 2) ─────────────────────────────────────────────────
// Küratörlü koç havuzu: Offense/Defense notu (A+..F), şampiyonluk sayısı,
// guru etiketi. Notlar sübjektif ama dönem itibarına dayalı.

export const COACHES = [
  { name: "Phil Jackson",       years: "1989–2011", off: "A",  def: "A",  champs: 11, tag: null },
  { name: "Gregg Popovich",     years: "1996–2024", off: "A",  def: "A",  champs: 5,  tag: null },
  { name: "Pat Riley",          years: "1981–2008", off: "A",  def: "A-", champs: 5,  tag: null },
  { name: "Steve Kerr",         years: "2014–",     off: "A+", def: "B+", champs: 4,  tag: "OFF GURU" },
  { name: "Erik Spoelstra",     years: "2008–",     off: "B+", def: "A",  champs: 2,  tag: null },
  { name: "Chuck Daly",         years: "1981–1999", off: "B",  def: "A",  champs: 2,  tag: "DEF GURU" },
  { name: "Rudy Tomjanovich",   years: "1992–2005", off: "A-", def: "B",  champs: 2,  tag: null },
  { name: "K.C. Jones",         years: "1983–1997", off: "B",  def: "A-", champs: 2,  tag: null },
  { name: "Rick Carlisle",      years: "2001–",     off: "A-", def: "B+", champs: 1,  tag: null },
  { name: "Doc Rivers",         years: "1999–",     off: "B",  def: "B+", champs: 1,  tag: null },
  { name: "Nick Nurse",         years: "2018–",     off: "B+", def: "A-", champs: 1,  tag: "DEF GURU" },
  { name: "Mike Budenholzer",   years: "2013–",     off: "A-", def: "A-", champs: 1,  tag: null },
  { name: "Tyronn Lue",         years: "2015–",     off: "A-", def: "B",  champs: 1,  tag: null },
  { name: "Frank Vogel",        years: "2011–2024", off: "C+", def: "A",  champs: 1,  tag: "DEF GURU" },
  { name: "Michael Malone",     years: "2013–2025", off: "B+", def: "B+", champs: 1,  tag: null },
  { name: "Joe Mazzulla",       years: "2022–",     off: "A",  def: "B+", champs: 1,  tag: null },
  { name: "Mark Daigneault",    years: "2020–",     off: "A-", def: "A-", champs: 1,  tag: null },
  { name: "Larry Brown",        years: "1976–2010", off: "B",  def: "A",  champs: 1,  tag: "DEF GURU" },
  { name: "Lenny Wilkens",      years: "1969–2005", off: "B+", def: "B",  champs: 1,  tag: null },
  { name: "Billy Cunningham",   years: "1977–1985", off: "B+", def: "A-", champs: 1,  tag: null },
  { name: "Paul Westhead",      years: "1979–2006", off: "A",  def: "F",  champs: 1,  tag: "OFF GURU" },
  { name: "Bill Fitch",         years: "1970–1998", off: "B",  def: "B+", champs: 1,  tag: null },
  { name: "Mike D'Antoni",      years: "2003–2020", off: "A+", def: "D",  champs: 0,  tag: "OFF GURU" },
  { name: "Tom Thibodeau",      years: "2010–2025", off: "C",  def: "A+", champs: 0,  tag: "DEF GURU" },
  { name: "Don Nelson",         years: "1976–2010", off: "A",  def: "C-", champs: 0,  tag: "OFF GURU" },
  { name: "Jerry Sloan",        years: "1979–2011", off: "B+", def: "A-", champs: 0,  tag: null },
  { name: "George Karl",        years: "1984–2016", off: "A-", def: "B-", champs: 0,  tag: null },
  { name: "Jeff Van Gundy",     years: "1996–2007", off: "C",  def: "A",  champs: 0,  tag: "DEF GURU" },
  { name: "Stan Van Gundy",     years: "2003–2021", off: "B+", def: "A-", champs: 0,  tag: null },
  { name: "Rick Adelman",       years: "1989–2014", off: "A-", def: "B-", champs: 0,  tag: "OFF GURU" },
  { name: "Brad Stevens",       years: "2013–2021", off: "B+", def: "B+", champs: 0,  tag: null },
  { name: "Quin Snyder",        years: "2014–",     off: "B+", def: "B",  champs: 0,  tag: null },
  { name: "Kenny Atkinson",     years: "2016–",     off: "A-", def: "B+", champs: 0,  tag: null },
  { name: "Ime Udoka",          years: "2021–",     off: "B",  def: "A-", champs: 0,  tag: null },
  { name: "Mike Fratello",      years: "1981–2007", off: "C+", def: "A-", champs: 0,  tag: "DEF GURU" },
  { name: "Flip Saunders",      years: "1995–2015", off: "B+", def: "C+", champs: 0,  tag: null },
  { name: "Jason Kidd",         years: "2013–",     off: "B",  def: "B+", champs: 0,  tag: null },
  { name: "Billy Donovan",      years: "2015–",     off: "B",  def: "B+", champs: 0,  tag: null },
  { name: "Mike Brown",         years: "2005–2024", off: "C+", def: "A-", champs: 0,  tag: null },
  { name: "Terry Stotts",       years: "2002–2021", off: "B+", def: "C+", champs: 0,  tag: null },
];

export const GRADE_VAL = {
  "A+": 1.00, "A": 0.95, "A-": 0.90,
  "B+": 0.82, "B": 0.75, "B-": 0.68,
  "C+": 0.60, "C": 0.52, "D": 0.40, "F": 0.28,
};

// Regular season reyting katkısı: A/A ≈ +0.032, C/C ≈ −0.009, F/F ≈ −0.04
export function coachRatingBonus(coach) {
  if (!coach) return 0;
  const o = GRADE_VAL[coach.off] ?? 0.6;
  const d = GRADE_VAL[coach.def] ?? 0.6;
  const guru = coach.tag ? 0.01 : 0;
  return ((o + d) / 2 - 0.64) * 0.11 + guru;
}

// Şampiyonluk DNA'sı: playoff reytingine ek (Phil Jackson 11 → cap +0.03)
export function coachPlayoffBonus(coach) {
  if (!coach) return 0;
  return Math.min(0.030, (coach.champs || 0) * 0.005);
}
