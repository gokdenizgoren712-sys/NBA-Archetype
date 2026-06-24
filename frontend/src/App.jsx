import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Players    from "./pages/Players";
import Lineups    from "./pages/Lineups";
import Historical from "./pages/Historical";
import Glossary   from "./pages/Glossary";
import About      from "./pages/About";
import Explore    from "./pages/Explore";
import Compare    from "./pages/Compare";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { LanguageProvider, useLang } from "./contexts/LanguageContext";
import { api } from "./api";

function Header() {
  const navigate   = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang, t } = useLang();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
  }, []);

  const NAV = [
    { to: "/players",    label: t("nav_players")    },
    { to: "/lineups",    label: t("nav_lineups")    },
    { to: "/historical", label: t("nav_historical") },
    { to: "/explore",    label: t("nav_explore") },
    { to: "/compare",    label: t("nav_compare")    },
    { to: "/glossary",   label: t("nav_glossary")   },
    { to: "/about",      label: t("nav_about")      },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950 px-6 py-3 flex items-center gap-6 shrink-0">
      <button
        onClick={() => navigate("/players")}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        title="Home"
      >
        <span className="text-xl">🏀</span>
        <span className="font-bold text-white text-sm tracking-wide">NBA Archetype</span>
      </button>

      <nav className="flex gap-1">
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-300"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-600">2025-26</span>
        {meta?.last_updated && (
          <span
            className="text-[10px] text-slate-600 hidden sm:block"
            title={lang === "tr" ? "Son güncelleme" : "Last updated"}
          >
            {meta.last_updated}
          </span>
        )}

        {/* Language toggle */}
        <button
          onClick={toggleLang}
          title={lang === "tr" ? "Switch to English" : "Türkçe'ye geç"}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors font-mono tracking-wide"
        >
          {lang === "tr" ? "TR" : "EN"}
          <span className="text-slate-600">|</span>
          {lang === "tr" ? "EN" : "TR"}
        </button>

        {/* Cache clear */}
        <button
          onClick={async () => {
            await fetch("/api/admin/clear-cache", { method: "POST" });
            window.location.reload();
          }}
          title="Veriyi yenile (cache temizle)"
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-500 hover:text-white hover:border-slate-500 transition-colors text-base"
        >
          ↺
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors text-base"
        >
          {theme === "dark" ? "☀" : "🌙"}
        </button>
      </div>
    </header>
  );
}

function AppInner() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen text-slate-100" style={{ background: "var(--bg-base)" }}>
        <Header />
        <main className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <Routes>
              <Route path="/"           element={<Navigate to="/players" replace />} />
              <Route path="/players"    element={<Players />} />
              <Route path="/lineups"    element={<Lineups />} />
              <Route path="/historical" element={<Historical />} />
              <Route path="/explore"    element={<Explore />} />
              <Route path="/compare"    element={<Compare />} />
              <Route path="/glossary"   element={<Glossary />} />
              <Route path="/about"      element={<About />} />
            </Routes>
          </div>
        </main>
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
