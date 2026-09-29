import { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../BrandIcons";
import { RankItMark } from "../../rankit/redesign/BrandMark";
import { useAuth } from "../../contexts/AuthContext";
import PaIcon from "./PaIcon";
import { SportSwitch } from "./Sidebar";
import { NAV, SPORT_ACCENT, isActive } from "./nav";
import { useNavSport } from "./useShell";

// ── Mobil menü (handoff 19a) ──────────────────────────────────────────────
// 320px panel: logo + kapat, spor anahtarı, masaüstüyle aynı gruplu nav
// (46px satırlar), altta hesap kartı.
export default function MobileDrawer({ open, onClose }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, isAdmin } = useAuth();
  const sport = useNavSport();
  const accent = SPORT_ACCENT[sport];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Panel açıkken arka plan kaymasın (scroll chaining)
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Rota değişince kendiliğinden kapansın
  useEffect(() => { onClose(); }, [pathname]);   // eslint-disable-line react-hooks/exhaustive-deps

  const row = ({ to, icon, label, dot, also, custom, kids }) => {
    const on = isActive({ to, also }, pathname);
    const link = (
      <NavLink key={to} to={to} onClick={onClose} className={`pa-drawer-item${on ? " on" : ""}`}
        aria-current={on && !kids ? "page" : undefined}>
        {custom || <PaIcon name={icon} size={20} color={on ? accent : "#8b857e"} />}
        <span className="lbl">{label}</span>
        {dot && <span className="pa-nav-dot" style={{ background: dot }} />}
      </NavLink>
    );
    // Tasarım L1-4: telefonda fantezi alt sayfaları çekmecede yaşar.
    if (!kids || !on) return link;
    return (
      <div key={to} className="pa-nav-kids-wrap">
        {link}
        <div className="pa-nav-kids">
          {kids.map((k) => {
            const kOn = isActive(k, pathname);
            return (
              <NavLink key={k.to} to={k.to} end={!!k.exact} onClick={onClose} className={`pa-nav-kid${kOn ? " on" : ""}`}
                aria-current={kOn ? "page" : undefined}>
                <span>{k.label}</span>{kOn && <i />}
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`md:hidden pa-drawer-root${open ? " open" : ""}`} aria-hidden={!open}
      style={{ "--acc": accent }}>
      <div className="pa-drawer-backdrop" onClick={onClose} />
      <nav className="pa-drawer" aria-label="Main">
        <span className="pa-drawer-glow" />
        <div className="pa-drawer-head">
          <span className="pa-side-logo">
            <Logo size={26} />
            <span className="pa-wordmark"><b className="w">PRIMARY</b> <b className="g">ARCH</b></span>
          </span>
          <button onClick={onClose} aria-label="Close menu" className="pa-drawer-close">
            <PaIcon name="close" size={22} color="#b4afa8" />
          </button>
        </div>

        <SportSwitch sport={sport} />

        <div className="pa-drawer-groups">
          {NAV[sport].map(g => (
            <div key={g.title} className="pa-nav-group">
              <span className="pa-nav-title">{g.title}</span>
              {g.items.map(row)}
            </div>
          ))}
          <div className="pa-nav-group">
            <span className="pa-nav-title">More</span>
            {row({ to: "/rankit", label: "RankIt", custom: <RankItMark size={20} /> })}
            {isAdmin && row({ to: "/admin/articles", icon: "admin", label: "Admin" })}
          </div>
        </div>

        {isLoggedIn ? (
          <button className="pa-drawer-user" onClick={() => navigate("/profile")}>
            <span className="pa-avatar" style={{ "--acc": accent }}>{user.username?.[0]?.toUpperCase()}</span>
            <span className="who">{user.username}</span>
            <span className="go">Profile</span>
          </button>
        ) : (
          <button className="pa-drawer-user" onClick={() => navigate("/login")}>
            <span className="who">Sign in to save rosters</span>
            <span className="go">Sign in</span>
          </button>
        )}
      </nav>
    </div>
  );
}
