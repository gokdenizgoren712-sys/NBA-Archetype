import { Link } from "react-router-dom";

// 2026-08 (roadmap Faz 2.1): siteye ilk kez eklenen footer — önceden hiç
// yoktu. App.jsx'in sabit-yükseklik (h-screen) kabuğuna, ana içerik satırının
// ALTINA ince bir şerit olarak eklendi; sayfa içeriği kendi içinde kaydırılmaya
// devam ediyor, footer her zaman görünür kalıyor (dashboard-tarzı kabuklarda
// yaygın desen — sayfa altına gömülü bir footer, bu layout'ta hiç görünmezdi).
export default function Footer() {
  return (
    <footer className="shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] aura-glass"
      style={{ color: "var(--text-faint)" }}>
      <span>© {new Date().getFullYear()} Primary Arch</span>
      <Link to="/privacy-policy" className="hover:underline" style={{ color: "var(--text-faint)" }}>Privacy</Link>
      <Link to="/terms-of-service" className="hover:underline" style={{ color: "var(--text-faint)" }}>Terms</Link>
      <Link to="/contact" className="hover:underline" style={{ color: "var(--text-faint)" }}>Contact</Link>
      <Link to="/affiliate-disclosure" className="hover:underline" style={{ color: "var(--text-faint)" }}>Affiliate Disclosure</Link>
    </footer>
  );
}
