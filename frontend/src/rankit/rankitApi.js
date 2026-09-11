export const API_ROOT = (import.meta.env.VITE_RANKIT_API_URL || "").replace(/\/$/, "");
const BASE = `${API_ROOT}/api/rankit`;

function headers() {
  const token = localStorage.getItem("nba_arch_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export const LAST_SYNC_KEY = "rankit:lastSync";

/* AG hatasi ile SUNUCU hatasi ayri seyler (ekran 3l). Eskiden ikisi ayni
   catch'e dusuyordu: bir GET 404 ya da 500 dondugunde onbellekteki eski veri
   sessizce donuyor ve uygulama "offline" diyordu -- sunucuya ulasilmisken.
   Artik yalnizca fetch'in KENDISI reddedince cevrimdisiyiz; HTTP hatasi
   `status` tasir, cevrimdisi hata `offline` tasir. Kuyruk (rankitOutbox.js)
   bu ayrima dayaniyor: cevrimdisi puan bekletilir, reddedilen puan degil. */
async function request(path, options = {}) {
  const method = options.method || "GET";
  let userId = "guest";
  try { userId = JSON.parse(localStorage.getItem("nba_arch_user"))?.id || "guest"; } catch { /* bozuk kullanıcı cache'i izolasyonu bozmaz */ }
  const cacheKey = `rankit:cache:${userId}:${path}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store", ...options, headers: { ...headers(), ...(options.headers || {}) } });
    // 502/503/504: ag gecidi var ama uygulama YOK (dagitim aninda Railway
    // boyle doner). Kullanici icin RankIt'e ulasilamiyor -- cevrimdisiyla
    // ayni yol: onbellek gosterilir, puan kuyruga girer.
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new Error("unreachable");
  } catch {
    window.dispatchEvent(new CustomEvent("rankit:network", { detail: "offline" }));
    if (method === "GET") {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        // Onbellekten donen yanit ISARETLI: ekran 62% sonuk gostermek ve
        // "Cached 3h ago" yazmak icin bunu bilmeli.
        if (cached?.data && typeof cached.data === "object") return { ...cached.data, _cachedAt: cached.savedAt };
      } catch { /* geçersiz cache normal hata yoluna düşer */ }
    }
    const offline = new Error("You're offline");
    offline.offline = true;
    throw offline;
  }
  // Sunucuya ULASILDI: hata olsa bile cevrimici.
  window.dispatchEvent(new CustomEvent("rankit:network", { detail: "online" }));
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const failed = new Error(errorBody.detail || `${res.status} ${res.statusText}`);
    failed.status = res.status;
    throw failed;
  }
  const data = await res.json();
  if (method === "GET") {
    try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* depolama doluysa canlı veri yine kullanılır */ }
  }
  try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch { /* sadece bilgi */ }
  return data;
}

const body = (method, value) => ({ method, body: JSON.stringify(value) });

export const rankitApi = {
  home: (sport = "All", windowStart = "", windowEnd = "") => request(`/home?sport=${encodeURIComponent(sport)}${windowStart ? `&window_start=${encodeURIComponent(windowStart)}` : ""}${windowEnd ? `&window_end=${encodeURIComponent(windowEnd)}` : ""}`),
  catalog: ({ sport = "All", competition = "All", season = "All", status = "All", limit = 60, offset = 0 } = {}) => request(`/catalog?sport=${encodeURIComponent(sport)}&competition=${encodeURIComponent(competition)}&season=${encodeURIComponent(season)}&status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`),
  meta: () => request("/meta"),
  competition: id => request(`/competitions/${id}`),
  // Bir turnuvanin TEK haftasi: sezon 380 mac olabiliyor, hepsi
  // turnuva detayina sigmaz. Detay yalnizca hafta ozetini tasir.
  competitionMatches: (id, stage) => request(`/competitions/${id}/matches?stage=${encodeURIComponent(stage || "")}`),
  // Ekran 3d — sezon cetveli (goals | assists | minutes). Topluluk oylari
  // DEGIL, saglayicinin siralamasi.
  competitionPlayers: (id, stat) => request(`/competitions/${id}/players?stat=${encodeURIComponent(stat || "goals")}`),
  // Ekran 3f. Durumlar (bu gecenin sicak maci, kapanmaya bir mac kalan
  // koleksiyon) sunucuda TURETILIYOR, saklanmiyor.
  notifications: (tz = 0) => request(`/notifications?tz=${tz}`),
  markNotificationsRead: () => request("/notifications/read", { method: "POST" }),
  // Ekran 3g. YALNIZCA sunucunun davrandigi ayarlar; cihaza bagli olanlar
  // rankitPrefs.js'te (localStorage) kaliyor.
  settings: () => request("/settings"),
  // Ekranlar 4g/4h. competitions: secilen turnuva kimlikleri (virgul) --
  // kulup listesi onlara gore daraliyor.
  onboarding: (competitions = "") => request(`/onboarding?competitions=${encodeURIComponent(competitions)}`),
  saveOnboarding: value => request("/onboarding", body("POST", value)),
  // Settings > Competitions & clubs: TAM kume, secimi kaldirilan birakilir.
  setSources: value => request("/follows/sources", body("PUT", value)),
  saveSettings: (patch) => request("/settings", { method: "PUT", body: JSON.stringify(patch) }),
  match: id => request(`/matches/${id}`),
  broadcasts: (id, country = "TR") => request(`/matches/${id}/broadcasts?country=${encodeURIComponent(country)}`),
  player: id => request(`/players/${id}`),
  team: id => request(`/teams/${id}`),
  member: id => request(`/members/${id}`),
  search: (q, kind = "All", status = "All") => request(`/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}&status=${encodeURIComponent(status)}`),
  diary: () => request("/diary"),
  log: value => request("/diary", body("POST", value)),
  profile: () => request("/profile"),
  lists: () => request("/lists"),
  createList: value => request("/lists", body("POST", value)),
  list: id => request(`/lists/${id}`),
  addListItem: (id, value) => request(`/lists/${id}/items`, body("POST", value)),
  // Ekran 3h. Kalp DEGIL respect (§6.1); kaydetmek ayri tabloda.
  respectList: id => request(`/lists/${id}/respect`, { method: "POST" }),
  saveList: id => request(`/lists/${id}/save`, { method: "POST" }),
  potm: (matchId, playerId) => request(`/matches/${matchId}/potm`, body("POST", { player_id: playerId })),
  respect: (matchId, playerIds) => request(`/matches/${matchId}/respect`, body("PUT", { player_ids: playerIds })),
  follow: value => request("/follow", body("POST", value)),
  favorite: value => request("/favorite", body("POST", value)),
  toggleWatchlist: matchId => request(`/matches/${matchId}/watchlist`, body("POST", {})),
  watchlist: () => request("/watchlist"),
  likeReview: entryId => request(`/reviews/${entryId}/like`, body("POST", {})),
  comments: entryId => request(`/reviews/${entryId}/comments`),
  // §6.1: adres yanit EYLEMIYLE gecer, kullanicinin yazdigi metinle degil.
  addComment: (entryId, content, replyTo = null) =>
    request(`/reviews/${entryId}/comments`, body("POST", { content, reply_to: replyTo })),
  reviewThread: (entryId, tzOffset = 0) =>
    request(`/reviews/${entryId}/thread?tz_offset=${tzOffset}`),
  respectComment: commentId => request(`/comments/${commentId}/respect`, body("POST", {})),
  // Companion (ekran 5a/5b) — Watchalong sekmesinin yerini aldi.
  // Ekran 3j — altin elmasin actigi sey. Genel arama degil: bu gecenin
  // puanlanmamislari + son yedi gunun yakalanmamislari.
  // Ekran 5c — tum incelemeler. sort: respected | newest | lowest
  matchReviews: (matchId, sort = "respected", tzOffset = 0) =>
    request(`/matches/${matchId}/reviews?sort=${encodeURIComponent(sort)}&tz_offset=${tzOffset}`),
  rank: () => request("/rank"),
  quickRate: (tzOffset = 0) => request(`/quick-rate?tz_offset=${tzOffset}`),
  companion: matchId => request(`/matches/${matchId}/companion`),
  pulse: (matchId, value, minute) => request(`/matches/${matchId}/pulse`, body("POST", { value, minute })),
  markMoment: momentId => request(`/moments/${momentId}/mark`, body("POST", {})),
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
