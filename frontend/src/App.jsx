import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Players    from "./pages/Players";
import Lineups    from "./pages/Lineups";
import Glossary   from "./pages/Glossary";
import About      from "./pages/About";
import Explore    from "./pages/Explore";
import Compare    from "./pages/Compare";
import LineupGame from "./pages/LineupGame";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { api } from "./api";

/* ── Nav config ──────────────────────────────────────────────────── */
const NAV = [
  { to: "/game",     icon: "⬡",  label: "Game"     },
  { to: "/players",  icon: "👤", label: "Players"  },
  { to: "/lineups",  icon: "☰",  label: "Lineups"  },
  { to: "/explore",  icon: "◎",  label: "Explore"  },
  { to: "/compare",  icon: "⇌",  label: "Compare"  },
  { to: "/glossary", icon: "≡",  label: "Glossary" },
  { to: "/about",    icon: "ℹ",  label: "About"    },
];

/* ── Top bar ─────────────────────────────────────────────────────── */
function TopBar() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [meta, setMeta] = useState(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  return (
    <header className="h-11 shrink-0 flex items-center px-4 gap-3 border-b"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

      {/* Logo */}
      <button onClick={() => navigate("/game")}
        className="flex items-center gap-2 hover:opacity-75 transition-opacity">
        <span className="text-base">🏀</span>
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
      </div>
    </header>
  );
}

/* ── Sol icon bar (desktop) ──────────────────────────────────────── */
function SideNav() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-14 shrink-0 border-r pt-2 pb-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {NAV.map(n => {
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

  return (
    <nav className="md:hidden shrink-0 border-t"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <Row items={NAV.slice(0, 4)} />
      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <Row items={NAV.slice(4)} />
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
              <Route path="/"           element={<Navigate to="/game" replace />} />
              <Route path="/game"       element={<LineupGame />} />
              <Route path="/players"    element={<Players />} />
              <Route path="/lineups"    element={<Lineups />} />
              <Route path="/explore"    element={<Explore />} />
              <Route path="/compare"    element={<Compare />} />
              <Route path="/glossary"   element={<Glossary />} />
              <Route path="/about"      element={<About />} />
              <Route path="/historical" element={<Navigate to="/players" replace />} />
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
        <AppInner />
      </LanguageProvider>
    </ThemeProvider>
  );
}
