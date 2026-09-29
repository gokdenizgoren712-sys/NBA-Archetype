// Kabuk navigasyonu — handoff v2 PaSidebar: Play / Scout / Learn grupları.
// Spor-nötr sayfalarda (blog, profil, admin, yasal) son girilen sporun menüsü
// gösterilir; spor anahtarı her zaman ikisine de kapı açar.

export const SPORT_ACCENT = { basketball: "#FFB11B", football: "#3FB08C" };

export const NAV = {
  basketball: [
    { title: "Play", items: [
      { to: "/basketball/game",    icon: "game",    label: "Game" },
      { to: "/basketball/lineups", icon: "lineups", label: "Lineups" },
      // Fantezi: etkinken alt sayfaları açılır (tasarım L1-1). Sezon içi
      // sayfalar (This week, Trade) açılış gecesinden sonra eklenecek.
      { to: "/basketball/fantasy", icon: "fantasy", label: "Fantasy", kids: [
        { to: "/basketball/fantasy",             label: "Home", exact: true },
        { to: "/basketball/fantasy/rankings",    label: "Rankings", also: ["/basketball/fantasy/player"] },
        { to: "/basketball/fantasy/draft-plan",  label: "Draft plan" },
        { to: "/basketball/fantasy/mock",        label: "Mock draft" },
        { to: "/basketball/fantasy/assistant",   label: "Assistant" },
        { to: "/basketball/fantasy/simulator",   label: "Simulator" },
        { to: "/basketball/fantasy/trade",       label: "Trade" },
        { to: "/basketball/fantasy/schedule",    label: "Schedule" },
        { to: "/basketball/fantasy/methodology", label: "Methodology" },
      ] },
    ] },
    { title: "Scout", items: [
      { to: "/basketball/players",    icon: "nba",        label: "NBA" },
      { to: "/basketball/gleague",    icon: "gleague",    label: "G League",   dot: "#A8263F" },
      { to: "/basketball/ncaa",       icon: "ncaa",       label: "NCAA",       dot: "#3D7EC9" },
      { to: "/basketball/euroleague", icon: "euroleague", label: "EuroLeague", dot: "#FF6900" },
    ] },
    { title: "Learn", items: [
      { to: "/basketball/explore",  icon: "explore", label: "Explore",
        also: ["/basketball/compare", "/basketball/affinity"] },
      { to: "/blog",                icon: "blog",    label: "Blog" },
      { to: "/basketball/glossary", icon: "about",   label: "About", also: ["/basketball/about"] },
    ] },
  ],
  football: [
    { title: "Play", items: [
      { to: "/football/game",    icon: "game",    label: "Game" },
      { to: "/football/lineups", icon: "lineups", label: "Chemistry" },
    ] },
    { title: "Scout", items: [
      { to: "/football/players", icon: "football", label: "Players" },
    ] },
    { title: "Learn", items: [
      { to: "/football/map",      icon: "explore", label: "Explore", also: ["/football/compare"] },
      { to: "/blog",              icon: "blog",    label: "Blog" },
      { to: "/football/glossary", icon: "about",   label: "About", also: ["/football/about"] },
    ] },
  ],
};

export function cleanPath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function sportOf(pathname) {
  if (pathname === "/basketball" || pathname.startsWith("/basketball/")) return "basketball";
  if (pathname === "/football"   || pathname.startsWith("/football/"))   return "football";
  return null;
}

/* RankIt kendi rayını ve başlığını taşıyor; içindeyken site kabuğu çekilir.
   /rankit/download ve /rankit/mobile-auth sıradan sayfalar, /rankit/app
   telefon prototipi — onlar kapsam dışı. */
const RANKIT_PLAIN_PAGES = ["/rankit/app", "/rankit/download", "/rankit/mobile-auth", "/rankit/_preview"];

export function isRankItWeb(pathname) {
  const path = cleanPath(pathname);
  if (path !== "/rankit" && !path.startsWith("/rankit/")) return false;
  return !RANKIT_PLAIN_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
}

export function isRankItApp(pathname) {
  return isRankItWeb(pathname) || cleanPath(pathname) === "/rankit/app";
}

/** Kabuğun hiç görünmediği rotalar: RankIt'in kendi uygulaması. */
/** Giriş/kayıt/şifre ekranları — ortalı form, kenar çubuğu ve üst bar yok (10c/17d). */
export function isAuthRoute(pathname) {
  return /^\/(login|register|forgot-password|reset-password)$/.test(cleanPath(pathname));
}

export function shellHidden(pathname) {
  return isRankItApp(pathname);
}

/** Oyun ekranı mı (mod seçimi değil, oynanan ekran) — dar ekranda kenar
    çubuğu bunlarda kapalı başlar: mock'lar 1440 genişlikte ve açık çubuk
    1280'de draft kortunu 568px'ten 408px'e indiriyor. */
export function isPlayRoute(pathname) {
  return /^\/(basketball|football)\/game\/.+/.test(cleanPath(pathname));
}

export function isActive(item, pathname) {
  const p = cleanPath(pathname);
  if (item.exact) return p === item.to;
  return p === item.to || p.startsWith(item.to + "/")
    || (item.also || []).some((a) => p === a || p.startsWith(a + "/"));
}

/* ── Breadcrumb ─────────────────────────────────────────────────────
   Masaüstünde sayfanın ilk satırı, mobilde üst barın başlığı (son parça). */
const CRUMBS = [
  [/^\/basketball\/game$/,            ["Game"]],
  [/^\/basketball\/game\/single$/,    ["Game", "Lineup Builder"]],
  [/^\/basketball\/game\/same-screen$/, ["Game", "Same Screen"]],
  [/^\/basketball\/game\/friend$/,    ["Game", "With a Friend"]],
  [/^\/basketball\/game\/online$/,    ["Game", "Online"]],
  [/^\/basketball\/players$/,         ["NBA players"]],
  [/^\/basketball\/players\/(.+)$/,   (m) => ["NBA players", decodeURIComponent(m[1])]],
  [/^\/basketball\/lineups$/,         ["Lineups"]],
  [/^\/basketball\/explore$/,         ["Explore", "Map"]],
  [/^\/basketball\/compare$/,         ["Explore", "Compare"]],
  [/^\/basketball\/affinity$/,        ["Explore", "Affinity"]],
  [/^\/basketball\/glossary$/,        ["About", "Glossary"]],
  [/^\/basketball\/about$/,           ["About", "Methodology"]],
  [/^\/basketball\/fantasy$/,             ["Fantasy"]],
  [/^\/basketball\/fantasy\/rankings$/,    ["Fantasy", "Rankings"]],
  [/^\/basketball\/fantasy\/player\/.+$/,  ["Fantasy", "Rankings", "Player"]],
  [/^\/basketball\/fantasy\/draft-plan$/,  ["Fantasy", "Draft plan"]],
  [/^\/basketball\/fantasy\/mock$/,        ["Fantasy", "Mock draft"]],
  [/^\/basketball\/fantasy\/assistant$/,   ["Fantasy", "Draft assistant"]],
  [/^\/basketball\/fantasy\/schedule$/,    ["Fantasy", "Schedule"]],
  [/^\/basketball\/fantasy\/simulator$/,   ["Fantasy", "Season simulator"]],
  [/^\/basketball\/fantasy\/trade$/,       ["Fantasy", "Trade analyzer"]],
  [/^\/basketball\/fantasy\/saved$/,       ["Fantasy", "My leagues and drafts"]],
  [/^\/basketball\/fantasy\/methodology$/, ["Fantasy", "Methodology"]],
  [/^\/basketball\/gleague$/,         ["G League"]],
  [/^\/basketball\/ncaa$/,            ["NCAA"]],
  [/^\/basketball\/euroleague$/,      ["EuroLeague"]],
  [/^\/football\/game$/,              ["Game"]],
  [/^\/football\/game\/single$/,      ["Game", "Spin & Build"]],
  [/^\/football\/game\/same-screen$/, ["Game", "Same Screen"]],
  [/^\/football\/game\/friend$/,      ["Game", "With a Friend"]],
  [/^\/football\/game\/online$/,      ["Game", "Online"]],
  [/^\/football\/players$/,           ["Players"]],
  [/^\/football\/lineups$/,           ["Chemistry"]],
  [/^\/football\/map$/,               ["Explore", "Map"]],
  [/^\/football\/compare$/,           ["Explore", "Compare"]],
  [/^\/football\/glossary$/,          ["About", "Glossary"]],
  [/^\/football\/about$/,             ["About", "Methodology"]],
  [/^\/blog$/,                        ["Blog"]],
  [/^\/blog\/.+$/,                    ["Blog", "Article"]],
  [/^\/profile$/,                     ["Profile"]],
  [/^\/login$/,                       ["Sign in"]],
  [/^\/register$/,                    ["Create account"]],
  [/^\/forgot-password$/,             ["Reset password"]],
  [/^\/reset-password$/,              ["Reset password"]],
  [/^\/admin\/?(.*)$/,                (m) => ["Admin", ...(m[1] ? [m[1].split("/")[0].replace(/-/g, " ").replace(/^\w/, c => c.toUpperCase())] : [])]],
  [/^\/privacy-policy$/,              ["Privacy"]],
  [/^\/terms-of-service$/,            ["Terms"]],
  [/^\/community-guidelines$/,        ["Community guidelines"]],
  [/^\/contact$/,                     ["Contact"]],
  [/^\/affiliate-disclosure$/,        ["Affiliate disclosure"]],
  [/^\/rankit\/download$/,            ["RankIt", "Download"]],
];

export function crumbsFor(pathname) {
  const p = cleanPath(pathname);
  const sport = sportOf(p);
  const head = sport ? [{ label: sport === "football" ? "Football" : "Basketball", to: `/${sport}` }] : [];
  for (const [re, val] of CRUMBS) {
    const m = p.match(re);
    if (m) {
      const parts = typeof val === "function" ? val(m) : val;
      return [...head, ...parts.map(label => ({ label }))];
    }
  }
  return head;
}
