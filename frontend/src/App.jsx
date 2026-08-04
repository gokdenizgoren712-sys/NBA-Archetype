import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { Logo, GameIcon, NBAIcon, GLeagueIcon, NCAAIcon, EuroLeagueIcon,
         LineupsIcon, ExploreIcon, BlogIcon,
         GlossaryIcon, AdminIcon, RefreshIcon } from "./components/BrandIcons";

// Route sayfaları LAZY — her biri kendi chunk'ına bölünür. Ağır lib'ler böylece
// initial bundle'dan çıkar: tiptap→ArticleEditor chunk'ı, recharts→paylaşılan radar
// chunk'ı, oyun sim→LineupGame chunk'ı. İlk yükte sadece kabuk + router iner.
const Players        = lazy(() => import("./pages/Players"));
const Lineups        = lazy(() => import("./pages/Lineups"));
const ExploreHub      = lazy(() => import("./pages/ExploreHub"));
const FundamentalsHub = lazy(() => import("./pages/FundamentalsHub"));
const LineupGame     = lazy(() => import("./pages/LineupGame"));
const GameModeSelect = lazy(() => import("./pages/GameModeSelect"));
const SameScreenGame = lazy(() => import("./pages/SameScreenGame"));
const WithAFriendGame = lazy(() => import("./pages/WithAFriendGame"));
const OnlineGame     = lazy(() => import("./pages/OnlineGame"));
const Blog           = lazy(() => import("./pages/Blog"));
const BlogPost       = lazy(() => import("./pages/BlogPost"));
const Login          = lazy(() => import("./pages/Login"));
const Register       = lazy(() => import("./pages/Register"));
const Profile        = lazy(() => import("./pages/Profile"));
const ArticleList    = lazy(() => import("./pages/admin/ArticleList"));
const ArticleEditor  = lazy(() => import("./pages/admin/ArticleEditor"));
const UserList       = lazy(() => import("./pages/admin/UserList"));
const CorrectionList = lazy(() => import("./pages/admin/CorrectionList"));
const GLeague        = lazy(() => import("./pages/GLeague"));
const NCAAPage       = lazy(() => import("./pages/NCAAPage"));
const EuroLeaguePage = lazy(() => import("./pages/EuroLeaguePage"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword  = lazy(() => import("./pages/ResetPassword"));
const PlayerProfile  = lazy(() => import("./pages/PlayerProfile"));
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { api } from "./api";

/* ── Nav config ──────────────────────────────────────────────────── */
const NAV = [
  { to: "/game",       Icon: GameIcon,       label: "Game"    },
  { to: "/players",    Icon: NBAIcon,        label: "NBA"     },
  { to: "/gleague",    Icon: GLeagueIcon,    label: "G-Lg",    color: "#A8263F" },
  { to: "/ncaa",       Icon: NCAAIcon,       label: "NCAA",    color: "#3D7EC9" },
  { to: "/euroleague", Icon: EuroLeagueIcon, label: "EUR",     color: "#FF6900" },
  { to: "/lineups",    Icon: LineupsIcon,    label: "Lineups" },
  { to: "/explore",    Icon: ExploreIcon,    label: "Explore", extraActive: ["/compare", "/affinity"] },
  { to: "/blog",       Icon: BlogIcon,       label: "Blog"    },
  { to: "/glossary",   Icon: GlossaryIcon,   label: "About", extraActive: ["/about"] },
];

/* ── User button (top-right) ─────────────────────────────────────── */
function UserButton() {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  if (!isLoggedIn) return (
    <button onClick={() => navigate("/login")}
      className="aura-shine-hover px-3 py-1 rounded-lg text-xs font-medium bg-yamabuki text-darkBg hover:bg-white transition-colors">
      Log In
    </button>
  );
  return (
    <button onClick={() => navigate("/profile")}
      className="aura-shine-hover w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold font-logo bg-yamabuki text-darkBg"
      title={user.username}>
      {user.username?.[0]?.toUpperCase()}
    </button>
  );
}

/* ── Top bar ─────────────────────────────────────────────────────── */
function TopBar({ onMenu }) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  return (
    <header className="relative h-12 shrink-0 flex items-center px-4 gap-3 aura-glass overflow-hidden">
      <div className="aura-glow" style={{ "--aura-color": "#FFB11B", width: 180, height: 180, left: -40, top: -70 }} />

      {/* Logo — mobilde menüyü açar (alt nav'ın yerini aldı), desktop'ta
          sol icon bar zaten hep açık olduğu için doğrudan /game'e gider. */}
      {/* Mobil: menüyü açar. Desktop: sol icon bar zaten hep açık, doğrudan
          /game'e gider. Viewport'u JS ile ölçmek yerine iki ayrı düğme —
          hangisinin görüneceğine CSS karar veriyor. */}
      <button onClick={onMenu} aria-label="Open menu"
        className="md:hidden relative flex items-center gap-2 -ml-1 pl-1 pr-2 py-2">
        <Logo size={30} />
        <span className="font-logo text-lg tracking-widest hidden sm:flex leading-none pt-0.5">
          <span className="font-semibold text-white">PRIMARY</span>
          <span className="font-bold text-yamabuki ml-1">ARCH</span>
        </span>
        <span style={{ color: "var(--text-faint)", fontSize: 9, marginLeft: -2 }}>▾</span>
      </button>
      <button onClick={() => navigate("/game")}
        className="hidden md:flex relative items-center gap-2 hover:opacity-80 transition-opacity">
        <Logo size={30} />
        <span className="font-logo text-lg tracking-widest flex leading-none pt-0.5">
          <span className="font-semibold text-white">PRIMARY</span>
          <span className="font-bold text-yamabuki ml-1">ARCH</span>
        </span>
      </button>

      <div className="relative ml-auto flex items-center gap-1.5">
        {meta?.last_updated && (
          <span className="text-[10px] hidden md:block" style={{ color: "var(--text-muted)" }}>
            {meta.last_updated}
          </span>
        )}

        <button
          onClick={async () => { await fetch("/api/admin/clear-cache", { method: "POST" }); window.location.reload(); }}
          title="Refresh data"
          className="w-7 h-7 flex items-center justify-center text-sm transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--yamabuki)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
        ><RefreshIcon size={15} /></button>

        <UserButton />
      </div>
    </header>
  );
}

/* ── Sol icon bar (desktop) ──────────────────────────────────────── */
function SideNav() {
  const location = useLocation();
  const { isAdmin } = useAuth();

  const items = [
    ...NAV,
    ...(isAdmin ? [{ to: "/admin/articles", Icon: AdminIcon, label: "Admin" }] : []),
  ];

  return (
    <aside className="hidden md:flex flex-col w-16 shrink-0 aura-glass border-t-0 border-b-0 border-l-0 pt-2 pb-4">
      {items.map(n => {
        const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/")
          || (n.extraActive || []).includes(location.pathname);
        const color = n.color || "#FFB11B";
        return (
          <NavLink key={n.to} to={n.to} title={n.label}
            className={`group relative flex flex-col items-center justify-center h-14 gap-1 transition-colors
              ${active ? "text-white" : "text-gray-400 hover:text-white"}`}
          >
            {active && (
              <>
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r" style={{ background: color }} />
                <span className="aura-glow" style={{ "--aura-color": color, width: 46, height: 46, left: "calc(50% - 23px)", top: "calc(50% - 23px)" }} />
              </>
            )}
            <n.Icon size={22} className="relative transition-transform group-hover:scale-110" />
            <span className="relative font-logo text-[9px] font-semibold tracking-wider uppercase">{n.label}</span>
          </NavLink>
        );
      })}
    </aside>
  );
}

/* ── Mobil menü (drawer) ─────────────────────────────────────────
   Eski 2 satırlık alt nav kaldırıldı: ekranın altından ~64px yiyordu ve
   mobilde en değerli şey dikey alan. Artık sol üstteki logoya dokununca
   soldan açılan bir panel. Satırlar 52px — parmak hedefi olarak yeterli
   (alt nav'daki 18px ikonlar değildi). */
function MobileDrawer({ open, onClose }) {
  const location = useLocation();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Drawer açıkken arka plan kaymasın — mobilde panelin altındaki sayfanın
    // kaymaya devam etmesi ("scroll chaining") en can sıkıcı detaylardan biri.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Rota değişince kendiliğinden kapansın
  useEffect(() => { onClose(); }, [location.pathname]);   // eslint-disable-line react-hooks/exhaustive-deps

  const items = [
    ...NAV,
    ...(isAdmin ? [{ to: "/admin/articles", Icon: AdminIcon, label: "Admin" }] : []),
  ];

  return (
    <div className={`md:hidden nav-drawer-root${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="nav-drawer-backdrop" onClick={onClose} />
      <nav className="nav-drawer" role="navigation">
        <div className="nav-drawer-head">
          <Logo size={26} />
          <span className="font-logo text-base tracking-widest leading-none pt-0.5">
            <span className="font-semibold text-white">PRIMARY</span>
            <span className="font-bold text-yamabuki ml-1">ARCH</span>
          </span>
          <button onClick={onClose} aria-label="Close menu" className="nav-drawer-close">×</button>
        </div>

        <div className="nav-drawer-items">
          {items.map(n => {
            const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/")
              || (n.extraActive || []).includes(location.pathname);
            const color = n.color || "#FFB11B";
            return (
              <NavLink key={n.to} to={n.to} onClick={onClose}
                className={`nav-drawer-item${active ? " active" : ""}`}
                style={{ "--accent": color }}>
                <n.Icon size={20} />
                <span className="lbl">{n.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ── Inner app ───────────────────────────────────────────────────── */
// Lazy sayfa chunk'ı inerken gösterilen hafif fallback (Suspense).
function PageLoading() {
  return (
    <div className="h-full w-full flex items-center justify-center"
         style={{ color: "var(--text-muted)" }}>
      <div className="animate-pulse font-logo text-sm tracking-widest uppercase">Loading…</div>
    </div>
  );
}

function AppInner() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <TopBar onMenu={() => setMenuOpen(true)} />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SideNav />

          <main className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/"                         element={<Navigate to="/game" replace />} />
              <Route path="/game"                     element={<GameModeSelect />} />
              <Route path="/game/single"              element={<LineupGame />} />
              <Route path="/game/same-screen"          element={<SameScreenGame />} />
              <Route path="/game/friend"               element={<WithAFriendGame />} />
              <Route path="/game/online"               element={<OnlineGame />} />
              <Route path="/players"                  element={<Players />} />
              <Route path="/players/:name"           element={<PlayerProfile />} />
              <Route path="/lineups"                  element={<Lineups />} />
              <Route path="/explore"                  element={<ExploreHub />} />
              <Route path="/compare"                  element={<ExploreHub />} />
              <Route path="/affinity"                 element={<ExploreHub />} />
              <Route path="/glossary"                 element={<FundamentalsHub />} />
              <Route path="/about"                    element={<FundamentalsHub />} />
              <Route path="/historical"               element={<Navigate to="/players" replace />} />
              {/* Auth */}
              <Route path="/login"                    element={<Login />} />
              <Route path="/register"                 element={<Register />} />
              <Route path="/profile"                  element={<Profile />} />
              {/* Blog */}
              <Route path="/blog"                     element={<Blog />} />
              <Route path="/blog/:slug"               element={<BlogPost />} />
              {/* Auth extras */}
              <Route path="/forgot-password"          element={<ForgotPassword />} />
              <Route path="/reset-password"           element={<ResetPassword />} />
              {/* Admin */}
              <Route path="/admin"                    element={<Navigate to="/admin/articles" replace />} />
              <Route path="/admin/articles"           element={<ArticleList />} />
              <Route path="/admin/articles/new"       element={<ArticleEditor />} />
              <Route path="/admin/articles/:id/edit"  element={<ArticleEditor />} />
              <Route path="/admin/users"              element={<UserList />} />
              <Route path="/admin/corrections"        element={<CorrectionList />} />
              {/* League pages */}
              <Route path="/gleague"                  element={<GLeague />} />
              <Route path="/ncaa"                     element={<NCAAPage />} />
              <Route path="/euroleague"               element={<EuroLeaguePage />} />
            </Routes>
            </Suspense>
          </main>
        </div>

        <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
