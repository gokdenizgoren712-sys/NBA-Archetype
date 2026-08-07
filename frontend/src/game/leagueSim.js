// ── Rewrite History: "tam lig" motoru ────────────────────────────────────────
// Yeni bir simülasyon motoru DEĞİL — seasonSim.js'in ZATEN herhangi bir
// roster için çalışan simulateSeason()'ını, kullanıcının kadrosuna ek olarak
// diğer 29 gerçek takımın GERÇEK roster'larıyla da çalıştırır (bkz. plan:
// docs/plans altında değil, C:\Users\ggore\.claude\plans\fancy-cooking-gizmo.md).
// Böylece rakip gücü artık gerçek win_pct'inden değil, o takımın kendi
// arketip-skorlarından türer — "Rewrite History" adını hak eden kısım bu.
import { computeLineupFit } from "./lineupScore";
import { computeTeamRating, simulateSeason } from "./seasonSim";

// Gerçek "kim başladı" verisi yok — dakikaya (MIN) göre top-5 starter,
// sonraki 4 bench. Kullanıcının kendi 9-kişilik rotasyon şekliyle tutarlı,
// bilinen bir yaklaşıklık (bkz. plan "Kapsam/bilinç sınırları").
function pickRotation(roster) {
  const sorted = [...roster].sort((a, b) => (parseFloat(b.MIN) || 0) - (parseFloat(a.MIN) || 0));
  return { starters: sorted.slice(0, 5), bench: sorted.slice(5, 9) };
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function fetchTeam(season, abbr) {
  const [playersRes, scheduleRes] = await Promise.all([
    fetchJson(`/api/game/players?season=${season}&team=${abbr}`),
    fetchJson(`/api/historical/${season}/team/${abbr}/schedule`),
  ]);
  return { abbr, players: playersRes?.players || [], schedule: scheduleRes };
}

// buildLeague: sezon + kullanıcının yerine geçtiği takım + kullanıcının
// seçtiği era. Dönüş: { teamRatings: {ABBR: rating}, teamSeasons:
// {ABBR: simulateSeason sonucu} } — kullanıcının KENDİ takımı bu objelerde
// YOK (o ayrıca, kendi draftıyla simüle ediliyor, bkz. SeasonSimPanel.jsx).
export async function buildLeague(season, excludeTeam, simEra) {
  const teamsRes = await fetchJson(`/api/historical/${season}/teams`);
  const otherAbbrs = (teamsRes?.teams || [])
    .map(t => t.abbr)
    .filter(a => a !== excludeTeam);

  const teamsData = await Promise.all(otherAbbrs.map(a => fetchTeam(season, a)));

  const teamRatings = {};
  const rosterByAbbr = {};
  for (const t of teamsData) {
    if (t.players.length < 9) continue;   // eksik/bozuk roster — sessizce atla
    const { starters, bench } = pickRotation(t.players);
    const fit = computeLineupFit([...starters, ...bench], simEra);
    const { rating } = computeTeamRating(starters, simEra, fit, null, { bench, coach: null });
    teamRatings[t.abbr] = rating;
    rosterByAbbr[t.abbr] = { starters, bench, fit };
  }

  const teamSeasons = {};
  for (const t of teamsData) {
    const r = rosterByAbbr[t.abbr];
    if (!r || !t.schedule?.games?.length) continue;
    teamSeasons[t.abbr] = simulateSeason(r.starters, simEra, r.fit, null, {
      bench: r.bench, coach: null, realSchedule: t.schedule, teamRatings,
    });
  }

  return { teamRatings, teamSeasons, rosterByAbbr };
}
