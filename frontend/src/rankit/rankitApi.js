export const API_ROOT = (import.meta.env.VITE_RANKIT_API_URL || "").replace(/\/$/, "");
const BASE = `${API_ROOT}/api/rankit`;

function headers() {
  const token = localStorage.getItem("nba_arch_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  let userId = "guest";
  try { userId = JSON.parse(localStorage.getItem("nba_arch_user"))?.id || "guest"; } catch { /* bozuk kullanıcı cache'i izolasyonu bozmaz */ }
  const cacheKey = `rankit:cache:${userId}:${path}`;
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...options, headers: { ...headers(), ...(options.headers || {}) } });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.detail || `${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (method === "GET") {
      try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* depolama doluysa canlı veri yine kullanılır */ }
    }
    window.dispatchEvent(new CustomEvent("rankit:network", { detail: "online" }));
    return data;
  } catch (error) {
    if (method === "GET") {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached?.data) {
          window.dispatchEvent(new CustomEvent("rankit:network", { detail: "offline" }));
          return cached.data;
        }
      } catch { /* geçersiz cache normal hata yoluna düşer */ }
    }
    window.dispatchEvent(new CustomEvent("rankit:network", { detail: "offline" }));
    throw error;
  }
}

const body = (method, value) => ({ method, body: JSON.stringify(value) });

export const rankitApi = {
  home: (sport = "All", windowStart = "", windowEnd = "") => request(`/home?sport=${encodeURIComponent(sport)}${windowStart ? `&window_start=${encodeURIComponent(windowStart)}` : ""}${windowEnd ? `&window_end=${encodeURIComponent(windowEnd)}` : ""}`),
  catalog: ({ sport = "All", competition = "All", season = "All", status = "All", limit = 60, offset = 0 } = {}) => request(`/catalog?sport=${encodeURIComponent(sport)}&competition=${encodeURIComponent(competition)}&season=${encodeURIComponent(season)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`),
  meta: () => request("/meta"),
  match: id => request(`/matches/${id}`),
  broadcasts: (id, country = "TR") => request(`/matches/${id}/broadcasts?country=${encodeURIComponent(country)}`),
  player: id => request(`/players/${id}`),
  team: id => request(`/teams/${id}`),
  member: id => request(`/members/${id}`),
  search: (q, kind = "All") => request(`/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`),
  diary: () => request("/diary"),
  log: value => request("/diary", body("POST", value)),
  profile: () => request("/profile"),
  lists: () => request("/lists"),
  createList: value => request("/lists", body("POST", value)),
  list: id => request(`/lists/${id}`),
  addListItem: (id, value) => request(`/lists/${id}/items`, body("POST", value)),
  potm: (matchId, playerId) => request(`/matches/${matchId}/potm`, body("POST", { player_id: playerId })),
  respect: (matchId, playerIds) => request(`/matches/${matchId}/respect`, body("PUT", { player_ids: playerIds })),
  follow: value => request("/follow", body("POST", value)),
  favorite: value => request("/favorite", body("POST", value)),
  toggleWatchlist: matchId => request(`/matches/${matchId}/watchlist`, body("POST", {})),
  watchlist: () => request("/watchlist"),
  likeReview: entryId => request(`/reviews/${entryId}/like`, body("POST", {})),
  comments: entryId => request(`/reviews/${entryId}/comments`),
  addComment: (entryId, content) => request(`/reviews/${entryId}/comments`, body("POST", { content })),
  watchalong: (matchId, room = "community") => request(`/matches/${matchId}/watchalong?room=${encodeURIComponent(room)}`),
};

export async function rankitAuth(path, value) {
  const res = await fetch(`${API_ROOT}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `${res.status} ${res.statusText}`);
  return data;
}

export async function rankitMe() {
  const res = await fetch(`${API_ROOT}/api/auth/me`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error("Session expired");
  return res.json();
}

export async function rankitForgotPassword(email) {
  const res = await fetch(`${API_ROOT}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Could not send reset email");
  return data;
}

export async function rankitMobileExchange(code) {
  return rankitAuth("mobile-exchange", { code });
}

export function rankitSocketUrl(path) {
  if (API_ROOT) return `${API_ROOT.replace(/^http/, "ws")}${path}`;
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}${path}`;
}
