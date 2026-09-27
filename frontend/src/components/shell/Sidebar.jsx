import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../BrandIcons";
import { RankItMark } from "../../rankit/redesign/BrandMark";
import { useAuth } from "../../contexts/AuthContext";
import PaIcon from "./PaIcon";
import { NAV, SPORT_ACCENT, isActive } from "./nav";
import { useNavSport, useSidebarCollapsed } from "./useShell";

// ── Masaüstü kenar çubuğu (handoff v2 PaSidebar) ──────────────────────────
// 220px etiketli / 72px ikon. Eski 64px rayın yerine: logo, spor anahtarı ve
// gruplu nav tek yerde. Aktif öğe spor aksanının hafif zemini + aksan ikonu;
// lig öğeleri kendi renginde küçük bir nokta taşır.

export function SportSwitch({ sport, compact = false }) {
  const navigate = useNavigate();
  const opts = [["basketball", "nba", "Basketball"], ["football", "football", "Football"]];
  return (
    <div className={`pa-sport${compact ? " compact" : ""}`} role="tablist" aria-label="Sport">
      {opts.map(([key, icon, label]) => {
        const on = sport === key;
        return (
          <button key={key} role="tab" aria-selected={on} title={label}
            className={`pa-sport-btn${on ? " on" : ""}`}
            onClick={() => !on && navigate(`/${key}/game`)}>
            <PaIcon name={icon} size={compact ? 18 : 15} color={on ? SPORT_ACCENT[key] : "#8b857e"} />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}

function refreshData() {
  fetch("/api/admin/clear-cache", { method: "POST" }).finally(() => window.location.reload());
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const sport = useNavSport();
  const [collapsed, toggle] = useSidebarCollapsed();
  const accent = SPORT_ACCENT[sport];
  const groups = NAV[sport];

  // Bileşen değil düz fonksiyon: her render'da yeni bir bileşen tipi yaratıp
  // NavLink'leri yeniden bağlamasın.
  const item = ({ to, icon, label, dot, also, custom, onClick }) => {
    const on = !onClick && isActive({ to, also }, pathname);
    const body = (
      <>
        <span className="pa-nav-ic">
          {custom || <PaIcon name={icon} size={collapsed ? 20 : 18} color={on ? accent : "#8b857e"} />}
        </span>
        {!collapsed && <span className="pa-nav-lbl">{label}</span>}
        {dot && <span className="pa-nav-dot" style={{ background: dot }} />}
      </>
    );
    return onClick
      ? <button key={label} type="button" onClick={onClick} className="pa-nav-item" title={collapsed ? label : undefined}>{body}</button>
      : <NavLink key={to} to={to} className={`pa-nav-item${on ? " on" : ""}`} title={collapsed ? label : undefined}
          aria-current={on ? "page" : undefined}>{body}</NavLink>;
  };

  return (
    <aside className={`pa-side${collapsed ? " collapsed" : ""}`} style={{ "--acc": accent }}>
      <button className="pa-side-logo" onClick={() => navigate("/")} aria-label="Primary Arch — home">
        <Logo size={collapsed ? 30 : 28} />
        {!collapsed && (
          <span className="pa-wordmark"><b className="w">PRIMARY</b> <b className="g">ARCH</b></span>
        )}
      </button>

      <SportSwitch sport={sport} compact={collapsed} />

      <nav className="pa-nav" aria-label="Main">
        {groups.map((g, gi) => (
          <div key={g.title} className="pa-nav-group">
            {collapsed
              ? gi > 0 && <span className="pa-nav-rule" />
              : <span className="pa-nav-title">{g.title}</span>}
            {g.items.map(it => item(it))}
          </div>
        ))}
      </nav>

      <div className="pa-side-foot">
        {item({ to: "/rankit", label: "RankIt", custom: <RankItMark size={collapsed ? 20 : 18} /> })}
        {isAdmin && item({ to: "/admin/articles", icon: "admin", label: "Admin",
                           also: pathname.startsWith("/admin") ? [pathname.replace(/\/+$/, "")] : [] })}
        {/* Handoff: veri yenileme kabuktan Admin › Data'ya taşınıyor. O sayfa
            gelene kadar yalnız yöneticilere, burada. */}
        {isAdmin && item({ icon: "refresh", label: "Refresh data", onClick: refreshData })}
        {item({ icon: collapsed ? "expand" : "collapse", label: collapsed ? "Expand" : "Collapse", onClick: toggle })}
      </div>
    </aside>
  );
}
