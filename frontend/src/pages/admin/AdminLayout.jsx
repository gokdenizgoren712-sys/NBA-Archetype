import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import "./admin.css";

// ── Admin kabuğu (handoff 15a/15b/17e/17g) ──────────────────────────────────
// 40px "Admin" + alt çizgili sekmeler, sağda sayfanın ana aksiyonu. Nötr:
// glow yok, renk yalnız durumu anlatırken. Her sayfa önceden kendi düğme
// sırasıyla diğerlerine bağlanıyordu (her birinde farklı alt küme) — tek
// sekme listesi artık burada. Admin kontrolü de burada: rol yoksa girişe.

export const ADMIN_TABS = [
  { to: "/admin/data", label: "Data" },
  { to: "/admin/articles", label: "Content", also: /^\/admin\/articles/ },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/corrections", label: "Corrections" },
  { to: "/admin/lineups", label: "Leaderboards" },
  { to: "/admin/photo-layout", label: "Photos" },
  { to: "/admin/rankit-broadcasts", label: "Broadcasters" },
  { to: "/admin/rankit-builds", label: "Builds" },
];

export default function AdminLayout({ title, aside, children, wide = false }) {
  const { isAdmin, isLoggedIn } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoggedIn || !isAdmin) navigate(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoggedIn, isAdmin, navigate, pathname]);
  if (!isLoggedIn || !isAdmin) return null;

  const path = pathname.replace(/\/+$/, "");
  return (
    <div className="ad-page">
      <SEO title={`Admin — ${title}`} noindex path={path} />
      <div className={`ad-inner${wide ? " wide" : ""}`}>
        <header className="ad-head">
          <div className="l">
            <h1>Admin</h1>
            <nav className="ad-tabs" aria-label="Admin sections">
              {ADMIN_TABS.map(t => {
                const on = t.also ? t.also.test(path) : path === t.to;
                return <Link key={t.to} to={t.to} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>{t.label}</Link>;
              })}
            </nav>
          </div>
          {aside && <div className="r">{aside}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—");
export function ago(iso) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : d < 60 ? `${d} days ago` : fmtDate(iso);
}
