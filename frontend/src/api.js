const BASE = "/api";

async function get(path, params = {}) {
  const q = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${q ? "?" + q : ""}`;
  const res = await fetch(url);
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

  // Meta
  meta: () => get("/meta"),

  // PCA loadings
  pcaLoadings: () => get("/explore/pca"),
};
