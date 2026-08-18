const BASE = "/api/rankit";

function headers() {
  const token = localStorage.getItem("nba_arch_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

const body = (method, value) => ({ method, body: JSON.stringify(value) });

export const rankitApi = {
  home: (sport = "All") => request(`/home?sport=${encodeURIComponent(sport)}`),
  catalog: ({ sport = "All", competition = "All", status = "All", limit = 60, offset = 0 } = {}) => request(`/catalog?sport=${encodeURIComponent(sport)}&competition=${encodeURIComponent(competition)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`),
  meta: () => request("/meta"),
  match: id => request(`/matches/${id}`),
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
