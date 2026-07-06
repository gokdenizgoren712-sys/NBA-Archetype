import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Players       from "./pages/Players";
import Lineups       from "./pages/Lineups";
import Glossary      from "./pages/Glossary";
import About         from "./pages/About";
import Explore       from "./pages/Explore";
import Compare       from "./pages/Compare";
import Affinity      from "./pages/Affinity";
import LineupGame    from "./pages/LineupGame";
import Blog          from "./pages/Blog";
import BlogPost      from "./pages/BlogPost";
import Login         from "./pages/Login";
import Register      from "./pages/Register";
import Profile       from "./pages/Profile";
import ArticleList    from "./pages/admin/ArticleList";
import ArticleEditor  from "./pages/admin/ArticleEditor";
import UserList       from "./pages/admin/UserList";
import CorrectionList from "./pages/admin/CorrectionList";
import GLeague        from "./pages/GLeague";
import NCAAPage       from "./pages/NCAAPage";
import EuroLeaguePage from "./pages/EuroLeaguePage";
import { NBAIcon, GLeagueIcon, NCAAIcon, EuroLeagueIcon } from "./components/LeagueIcons";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword  from "./pages/ResetPassword";
import PlayerProfile  from "./pages/PlayerProfile";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { api } from "./api";

/* ── Nav config ──────────────────────────────────────────────────── */
const NAV = [
  { to: "/game",       icon: "⬡",                label: "Game"    },
  { to: "/players",    icon: <NBAIcon />,         label: "NBA"     },
  { to: "/gleague",    icon: <GLeagueIcon />,     label: "G-Lg"   },
  { to: "/ncaa",       icon: <NCAAIcon />,        label: "NCAA"    },
  { to: "/euroleague", icon: <EuroLeagueIcon />,  label: "EUR"     },
  { to: "/lineups",    icon: "☰",                label: "Lineups" },
  { to: "/explore",    icon: "◎",                label: "Explore" },
  { to: "/compare",    icon: "⇌",                label: "Compare" },
  { to: "/affinity",   icon: "⬡",                label: "Affinity"},
  { to: "/blog",       icon: "✍",                label: "Blog"    },
  { to: "/glossary",   icon: "≡",                label: "Glossary"},
  { to: "/about",      icon: "ℹ",                label: "About"   },
];

/* ── User button (top-right) ─────────────────────────────────────── */
function UserButton() {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  if (!isLoggedIn) return (
    <button onClick={() => navigate("/login")}
      className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
      style={{ background: "var(--accent)", color: "#000" }}>
      Log In
    </button>
  );
  return (
    <button onClick={() => navigate("/profile")}
      className="w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold"
      title={user.username}
      style={{ background: "var(--accent)", color: "#000" }}>
      {user.username?.[0]?.toUpperCase()}
    </button>
  );
}

/* ── Top bar ─────────────────────────────────────────────────────── */
function TopBar() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [meta, setMeta] = useState(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  return (
    <header className="h-11 shrink-0 flex items-center px-4 gap-3 border-b"
      style={{ background: "var(--bg-surface)", borderColor: "rgba(200,16,46,0.22)" }}>

      {/* Logo */}
      <button onClick={() => navigate("/game")}
        className="flex items-center gap-2 hover:opacity-75 transition-opacity">
        <NBAIcon size={18} />
        <span className="font-bold text-sm tracking-wide hidden sm:block" style={{ color: "var(--accent)" }}>
          NBA Archetype
        </span>
        <span className="font-bold text-sm tracking-wide sm:hidden" style={{ color: "var(--accent)" }}>
          NBA
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

        <button
          onClick={toggle}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          className="w-7 h-7 flex items-center justify-center rounded text-sm transition-colors"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
        >{theme === "dark" ? "☀" : "🌙"}</button>

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
    ...(isAdmin ? [{ to: "/admin/articles", icon: "⚙", label: "Admin" }] : []),
  ];

  return (
    <aside className="hidden md:flex flex-col w-14 shrink-0 border-r pt-2 pb-4"
      style={{ background: "var(--bg-surface)", borderColor: "rgba(200,16,46,0.38)" }}>
      {items.map(n => {
        const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/");
        return (
          <NavLink key={n.to} to={n.to} title={n.label}
            className="relative flex flex-col items-center justify-center h-12 text-lg transition-colors group"
            style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
          >
            {/* active indicator */}
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                style={{ background: "var(--accent)" }} />
            )}
            <span className="leading-none">{n.icon}</span>
            <span className="text-[8px] mt-0.5 font-medium tracking-wide opacity-70">{n.label}</span>
          </NavLink>
        );
      })}
    </aside>
  );
}

/* ── Alt nav (mobile) — 2 satır ─────────────────────────────────── */
// NCAA hâlâ Coming Soon → mobilde gösterme, sidebar'da erişilebilir
const BOTTOM_NAV = NAV.filter(n => n.to !== "/ncaa");

function BottomNav() {
  const location = useLocation();

  const Row = ({ items }) => (
    <div className="flex">
      {items.map(n => {
        const active = location.pathname === n.to;
        return (
          <NavLink key={n.to} to={n.to}
            className="flex-1 flex flex-col items-center justify-center py-1.5 text-base transition-colors"
            style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
          >
            <span className="leading-none text-sm">{n.icon}</span>
            <span className="text-[8px] mt-0.5 font-medium">{n.label}</span>
          </NavLink>
        );
      })}
    </div>
  );

  const mid = Math.ceil(BOTTOM_NAV.length / 2);
  return (
    <nav className="md:hidden shrink-0 border-t"
      style={{ background: "var(--bg-surface)", borderColor: "rgba(200,16,46,0.30)" }}>
      <Row items={BOTTOM_NAV.slice(0, mid)} />
      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <Row items={BOTTOM_NAV.slice(mid)} />
      </div>
    </nav>
  );
}

/* ── Inner app ───────────────────────────────────────────────────── */
function AppInner() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <TopBar />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SideNav />

          <main className="flex-1 min-h-0 overflow-hidden">
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
