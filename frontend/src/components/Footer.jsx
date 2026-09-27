import { Link } from "react-router-dom";

// 2026-08 (roadmap Faz 2.1): siteye ilk kez eklenen footer — önceden hiç
// yoktu. App.jsx'in sabit-yükseklik (h-screen) kabuğuna, ana içerik satırının
// ALTINA ince bir şerit olarak eklendi; sayfa içeriği kendi içinde kaydırılmaya
// devam ediyor, footer her zaman görünür kalıyor (dashboard-tarzı kabuklarda
// yaygın desen — sayfa altına gömülü bir footer, bu layout'ta hiç görünmezdi).
export default function Footer() {
  // Handoff v2: 12px, üstte tek iç çizgi, kutu yok. Kabukta içerik kolonunun
  // altında (kenar çubuğunun yanında), yasal bağlantılar her sayfada erişilir.
  return (
    <footer className="pa-footer">
      <span>© {new Date().getFullYear()} Primary Arch</span>
      <Link to="/privacy-policy">Privacy</Link>
      <Link to="/terms-of-service">Terms</Link>
      <Link to="/community-guidelines">Community Guidelines</Link>
      <Link to="/contact">Contact</Link>
      <Link to="/affiliate-disclosure">Affiliate Disclosure</Link>
    </footer>
  );
}
