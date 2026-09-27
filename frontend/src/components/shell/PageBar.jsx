import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../BrandIcons";
import PaIcon from "./PaIcon";
import Avatar from "./Avatar";
import { crumbsFor, SPORT_ACCENT } from "./nav";
import { useNavSport } from "./useShell";

// ── Sayfa başlığı ──────────────────────────────────────────────────────────
// Eski 48px üst barın yerine. Masaüstünde breadcrumb + hesap (handoff 3a/3b:
// sayfanın ilk satırı), mobilde menü düğmesi + sayfa adı + hesap (19b).
// Kök spor seçiminde kenar çubuğu yok; orada logo + hesap (4a).
export default function PageBar({ onMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sport = useNavSport();
  const accent = SPORT_ACCENT[sport];
  const crumbs = crumbsFor(pathname);
  const title = crumbs.length ? crumbs[crumbs.length - 1].label : "Primary Arch";

  if (pathname === "/") {
    return (
      <header className="pa-bar home">
        <button className="pa-side-logo" onClick={() => navigate("/")} aria-label="Primary Arch — home">
          <Logo size={28} />
          <span className="pa-wordmark"><b className="w">PRIMARY</b> <b className="g">ARCH</b></span>
        </button>
        <Avatar accent={accent} />
      </header>
    );
  }

  return (
    <header className="pa-bar">
      <button className="pa-bar-menu" onClick={onMenu} aria-label="Open menu">
        <PaIcon name="menu" size={22} color="#b4afa8" />
      </button>
      <span className="pa-bar-title">{title}</span>

      <nav className="pa-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="pa-crumb">
            {i > 0 && <span className="sep">/</span>}
            {c.to && i < crumbs.length - 1
              ? <Link to={c.to}>{c.label}</Link>
              : <span className={i === crumbs.length - 1 ? "cur" : undefined}>{c.label}</span>}
          </span>
        ))}
      </nav>

      <Avatar accent={accent} />
    </header>
  );
}
