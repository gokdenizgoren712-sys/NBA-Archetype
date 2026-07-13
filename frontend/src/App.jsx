import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { Logo, GameIcon, NBAIcon, GLeagueIcon, NCAAIcon, EuroLeagueIcon,
         LineupsIcon, ExploreIcon, CompareIcon, AffinityIcon, BlogIcon,
         GlossaryIcon, AboutIcon, AdminIcon } from "./components/BrandIcons";

// Route sayfaları LAZY — her biri kendi chunk'ına bölünür. Ağır lib'ler böylece
// initial bundle'dan çıkar: tiptap→ArticleEditor chunk'ı, recharts→paylaşılan radar
// chunk'ı, oyun sim→LineupGame chunk'ı. İlk yükte sadece kabuk + router iner.
const Players        = lazy(() => import("./pages/Players"));
const Lineups        = lazy(() => import("./pages/Lineups"));
const Glossary       = lazy(() => import("./pages/Glossary"));
const About          = lazy(() => import("./pages/About"));
const Explore        = lazy(() => import("./pages/Explore"));
const Compare        = lazy(() => import("./pages/Compare"));
const Affinity       = lazy(() => import("./pages/Affinity"));
const LineupGame     = lazy(() => import("./pages/LineupGame"));
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
  { to: "/gleague",    Icon: GLeagueIcon,    label: "G-Lg"    },
  { to: "/ncaa",       Icon: NCAAIcon,       label: "NCAA"    },
  { to: "/euroleague", Icon: EuroLeagueIcon, label: "EUR"     },
  { to: "/lineups",    Icon: LineupsIcon,    label: "Lineups" },
  { to: "/explore",    Icon: ExploreIcon,    label: "Explore" },
  { to: "/compare",    Icon: CompareIcon,    label: "Compare" },
  { to: "/affinity",   Icon: AffinityIcon,   label: "Affinity"},
  { to: "/blog",       Icon: BlogIcon,       label: "Blog"    },
  { to: "/glossary",   Icon: GlossaryIcon,   label: "Glossary"},
  { to: "/about",      Icon: AboutIcon,      label: "About"   },
];

/* ── User button (top-right) ─────────────────────────────────────── */
function UserButton() {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  if (!isLoggedIn) return (
    <button onClick={() => navigate("/login")}
      className="px-3 py-1 rounded-lg text-xs font-medium bg-yamabuki text-darkBg hover:bg-white transition-colors">
      Log In
    </button>
  );
  return (
    <button onClick={() => navigate("/profile")}
      className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold font-logo bg-yamabuki text-darkBg"
      title={user.username}>
      {user.username?.[0]?.toUpperCase()}
    </button>
  );
}

/* ── Top bar ─────────────────────────────────────────────────────── */
function TopBar() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  return (
    <header className="h-12 shrink-0 flex items-center px-4 gap-3 border-b border-gray-800 bg-darkBg">

      {/* Logo — 12-gen Dodecagon + PRIMARY ARCH */}
      <button onClick={() => navigate("/game")}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <Logo size={30} />
        <span className="font-logo text-lg tracking-widest hidden sm:flex leading-none pt-0.5">
          <span className="font-semibold text-white">PRIMARY</span>
          <span className="font-bold text-yamabuki ml-1">ARCH</span>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {meta?.last_updated && (
          <span className="text-[10px] hidden md:block" style={{ color: "var(--text-muted)" }}>
            {meta.last_updated}
          </span>
        )}

        <button
          onClick={async () => { await fetch("/api/admin/clear-cache", { method: "POST" }); window.location.reload(); }}
          title="Refresh data"
          className="w-7 h-7 flex items-center justify-center rounded text-sm transition-colors"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
        >↺</button>

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
    <aside className="hidden md:flex flex-col w-16 shrink-0 border-r border-gray-800 bg-darkBg pt-2 pb-4">
      {items.map(n => {
        const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/");
        return (
          <NavLink key={n.to} to={n.to} title={n.label}
            className={`group relative flex flex-col items-center justify-center h-14 gap-1 transition-colors
              ${active ? "text-white" : "text-gray-400 hover:text-white"}`}
          >
            {/* active indicator */}
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r bg-yamabuki" />
            )}
            <n.Icon size={22} />
            <span className="font-logo text-[9px] font-semibold tracking-wider uppercase">{n.label}</span>
          </NavLink>
        );
      })}
    </aside>
  );
}

/* ── Alt nav (mobile) — 2 satır ─────────────────────────────────── */
// NCAA artık canlı → mobil alt nav'da da göster
const BOTTOM_NAV = NAV;

function BottomNav() {
  const location = useLocation();

  const Row = ({ items }) => (
    <div className="flex">
      {items.map(n => {
        const active = location.pathname === n.to;
        return (
          <NavLink key={n.to} to={n.to}
            className={`group flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors
              ${active ? "text-white" : "text-gray-400"}`}
          >
            <n.Icon size={18} />
            <span className="font-logo text-[8px] font-semibold tracking-wide uppercase">{n.label}</span>
          </NavLink>
        );
      })}
    </div>
  );

  const mid = Math.ceil(BOTTOM_NAV.length / 2);
  return (
    <nav className="md:hidden shrink-0 border-t border-gray-800 bg-darkBg">
      <Row items={BOTTOM_NAV.slice(0, mid)} />
      <div className="border-t border-gray-800">
        <Row items={BOTTOM_NAV.slice(mid)} />
      </div>
    </nav>
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
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <TopBar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SideNav />

          <main className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/"                         element={<Navigate to="/game" replace />} />
              <Route path="/game"                     element={<LineupGame />} />
              <Route path="/players"                  element={<Players />} />
              <Route path="/players/:name"           element={<PlayerProfile />} />
              <Route path="/lineups"                  element={<Lineups />} />
              <Route path="/explore"                  element={<Explore />} />
              <Route path="/compare"                  element={<Compare />} />
              <Route path="/affinity"                 element={<Affinity />} />
              <Route path="/glossary"                 element={<Glossary />} />
              <Route path="/about"                    element={<About />} />
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

        <BottomNav />
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
