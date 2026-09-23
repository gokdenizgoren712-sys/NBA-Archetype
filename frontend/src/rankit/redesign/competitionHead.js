/* Yarışma sayfasının başlığı — ekran 2i.
 *
 * Kaynak `RankIt Redesign.dc.html#2i`: "ENGLAND · 2026/27" / "Premier League"
 * / "Football · 20 clubs · Matchweek 4". Sayıların hepsi uçtan: kulüp sayısı
 * puan tablosunun satırları, hafta ise maç oynanmış SON hafta (`matchweeks`
 * içinde finished > 0). Bilinmeyen parça yazılmaz.
 */
export function competitionEyebrow(competition = {}) {
  return [competition.country, competition.season].filter(Boolean).join(" · ").toUpperCase();
}

export function currentStage(matchweeks = []) {
  const played = matchweeks.filter((w) => Number(w.finished) > 0);
  return played.length ? played[played.length - 1].stage : null;
}

export function competitionSub(detail = {}) {
  const c = detail.competition || {};
  const clubs = detail.standings?.length || 0;
  const unit = c.sport === "Basketball" ? "teams" : "clubs";
  return [c.sport, clubs ? `${clubs} ${unit}` : null, currentStage(detail.matchweeks)].filter(Boolean).join(" · ");
}
