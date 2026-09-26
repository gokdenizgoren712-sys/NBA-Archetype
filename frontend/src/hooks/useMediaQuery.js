import { useEffect, useState } from "react";

// ── Medya sorgusu kancası ────────────────────────────────────────────────────
// Çoğu duyarlılık CSS'te çözülüyor ve orada kalmalı. Bu kanca yalnızca kararın
// bir PROP olduğu yerler için: örneğin futbol oyununda saha, geniş ekranda
// kalan yüksekliğe göre (fill), telefonda genişliğe göre ölçekleniyor — ikisi
// farklı CSS değil, bileşene giden farklı bir girdi.
//
// SSR/ilk render güvenli: matchMedia yoksa false döner.
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = (e) => setMatches(e.matches);
    setMatches(mq.matches);          // sorgu değiştiyse hemen hizala
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);

  return matches;
}
