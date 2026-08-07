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

// 429 (rate limit) sessizce "veri yok" sayılıp atlanamaz — bu, 29 takımlık
// paralel fetch fırtınasında (özellikle iki oyuncunun aynı anda Board
// Challenge bonus koşusu tetiklediği ya da arkada başka bir istemcinin backend'i
// yorduğu senaryoda) TÜM ligi sessizce boşaltıp buildLeague'i "başarılı ama
// boş" döndürüyordu — hiçbir hata görünmüyordu. 429'da backoff'la yeniden
// dene; başka bir non-ok (gerçekten eksik veri, örn. o sezon o takım için
// roster kaydı yok) hâlâ null döner, o durumlar normal/beklenen.
async function fetchJson(url, attempt = 0) {
  const r = await fetch(url);
  if (r.status === 429 && attempt < 4) {
    const retryAfter = parseInt(r.headers.get("retry-after") || "5", 10);
    await new Promise(res => setTimeout(res, (retryAfter + 1) * 1000));
    return fetchJson(url, attempt + 1);
  }
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

// Tüm 29 takımı TEK Promise.all ile aynı anda ateşlemek (58 eşzamanlı istek)
// backend'de gereksiz bir yük tepesi yaratıyordu (bkz. api/main.py
// /api/game/players notu — orada asıl kaynak zaten düzeltildi, ama küçük
// gruplar hâlde ateşlemek ekstra bir güvenlik payı: hem backend tarafında
// hem Railway'in 512MB limitinde tepe yükü daha da düzleşir).
async function mapBatched(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    out.push(...await Promise.all(batch.map(fn)));
  }
  return out;
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

  const teamsData = await mapBatched(otherAbbrs, 6, a => fetchTeam(season, a));

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

  // teamsExpected/teamsBuilt: çağıran taraf (SeasonSimPanel) ligin gerçekten
  // tam kurulduğunu doğrulayabilsin diye — retry sonrası hâlâ eksikse (örn.
  // kalıcı bir ağ sorunu) kullanıcıya sessizce bozuk bir lig göstermek yerine
  // uyarı verilebilsin.
  return { teamRatings, teamSeasons, rosterByAbbr, teamsExpected: otherAbbrs.length, teamsBuilt: Object.keys(teamSeasons).length };
}
