const BASE = "/api";

async function get(path, params = {}) {
  const q = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${q ? "?" + q : ""}`;
  // no-store: API yanıtları önbelleğe alınmamalı. Parquet'ler yeniden
  // üretildikçe veri değişiyor; ayrıca geliştirme sırasında henüz eklenmemiş
  // bir uç noktaya istek gidince Vite SPA kabuğunu 200+HTML olarak dönüyor ve
  // tarayıcı onu önbelleğe alıyor — uç nokta sonradan eklendiğinde bile eski
  // HTML servis edilmeye devam ediyordu.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}


// Oturum gerektiren istekler. Anahtar AuthContext'inkiyle AYNI olmalı —
// ayrı bir isim kullanmak sessizce yetkisiz istek göndermek demek.
const TOKEN_KEY = "nba_arch_token";

function authHeaders() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function authGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store", headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function authPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  // Oyuncular
  players:      (p) => get("/players", p),
  playerScores: (name) => get(`/players/${encodeURIComponent(name)}/scores`),

  // 2025-26 uyum
  lineupCompat: (p) => get("/lineup-compat", p),
  customLineup: (players) => post("/lineup-compat/custom", { players }),

  // Arketip matrisi
  playerNames:  () => get("/player-names"),
  affinity:     () => get("/affinity"),
  components:   () => get("/components"),

  // Tarihsel sezonlar
  seasons:         () => get("/seasons"),
  historical:      (season, p) => get(`/historical/${encodeURIComponent(season)}`, p),
  historicalLineup:(season, limit = 30) => get(`/historical/${encodeURIComponent(season)}/lineup-compat`, { limit }),
  historicalPlayer:(season, name)       => get(`/historical/${encodeURIComponent(season)}/player/${encodeURIComponent(name)}/scores`),
  historicalCustomLineup: (season, players) => post(`/historical/${encodeURIComponent(season)}/lineup-compat/custom`, { players }),

  // Benzer oyuncular + kariyer zaman çizelgesi
  similarPlayers: (name, n = 10) => get(`/players/${encodeURIComponent(name)}/similar`, { n }),
  playerCareer:   (name)         => get("/player/career", { name }),

  // Takımlar
  teams:       (season = "2025-26")       => get("/teams", { season }),
  teamPlayers: (team, season = "2025-26") => get(`/teams/${encodeURIComponent(team)}/players`, { season }),

  // Gerçek oynanmış lineup'lar
  realLineups:     (p) => get("/real-lineups", p),
  affinityLineups: (arch_a, arch_b, limit = 10) => get("/affinity/lineups", { arch_a, arch_b, limit }),

  // G-League
  gleaguePlayers:      (p) => get("/gleague/players", p),
  gleaguePlayerScores: (name, season = "2025-26") => get(`/gleague/players/${encodeURIComponent(name)}/scores`, { season }),
  gleagueSeasons:      () => get("/gleague/seasons"),

  // EuroLeague
  euroleaguePlayers:      (p) => get("/euroleague/players", p),
  euroleaguePlayerScores: (name, season = "2025-26") => get(`/euroleague/players/${encodeURIComponent(name)}/scores`, { season }),
  euroleagueSeasons:      () => get("/euroleague/seasons"),

  // NCAA D-I
  ncaaPlayers:      (p) => get("/ncaa/players", p),
  ncaaPlayerScores: (name, season = "2025-26") => get(`/ncaa/players/${encodeURIComponent(name)}/scores`, { season }),
  ncaaSeasons:      () => get("/ncaa/seasons"),

  // Comparables (bağımsız — herhangi bir ligden herhangi bir oyuncu)
  comparables: (name, league = "nba", p = {}) => get("/comparables", { name, league, ...p }),

  // Futbol — basketboldan tamamen ayrı hat (kendi parquet'i, kendi sözlüğü)
  footballMeta:    (season) => get("/football/meta", season ? { season } : {}),
  footballPlayers: (p) => get("/football/players", p),
  footballCareer:  (id) => get(`/football/players/${id}/career`),
  footballAffinity: (season) => get("/football/affinity", season ? { season } : {}),
  footballBestXI:   (p) => get("/football/best-xi", p),
  // entries: [{player_id, season}] — çark oyunu karışık sezonlu XI kuruyor,
  // her oyuncu KENDİ sezonunun tablosundan çekilmeli.
  footballLineupFit: (player_ids, season, entries) =>
    post("/football/lineup-fit", { player_ids, season, entries }),
  footballRealXI:      (p) => get("/football/real-xi", p),
  footballSearch:      (p) => get("/football/search", p),
  // Çark oyunu
  footballSimSetup:    (p) => get("/football/sim-setup", p),
  footballLeaderboard: (p) => get("/football/leaderboard", p),
  footballRealSeason:  (p) => get("/football/real-season", p),
  // Kafa kafaya odaları — sonuç SUNUCUDA çözülüyor, istemci yalnızca kadro
  // gönderiyor (bkz. api/main.py h2h bloğu).
  footballH2HCreate: (body) => authPost("/football/h2h/room", body),
  footballH2HJoin:   (code) => authPost(`/football/h2h/room/${code}/join`, {}),
  footballH2HSquad:  (code, body) => authPost(`/football/h2h/room/${code}/squad`, body),
  footballH2HRoom:   (code) => authGet(`/football/h2h/room/${code}`),
  footballGameTeams:   (p) => get("/football/game/teams", p),
  footballGamePlayers: (p) => get("/football/game/players", p),

  // Meta
  meta: () => get("/meta"),

  // PCA loadings
  pcaLoadings: () => get("/explore/pca"),
};
