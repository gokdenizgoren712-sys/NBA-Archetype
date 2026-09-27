import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { sportOf, isPlayRoute } from "./nav";

// Kişiye özel küçük tercihler (kenar çubuğu açık/kapalı, son spor). Depolama
// erişimi özel pencerede/engelli sitede atabilir — hiçbir şey ona bağımlı değil.
function read(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key, val) {
  try { val == null ? window.localStorage.removeItem(key) : window.localStorage.setItem(key, val); } catch { /* yok say */ }
}

/** Spor-nötr sayfalarda hangi sporun menüsü gösterilsin: en son girilen. */
export function useNavSport() {
  const { pathname } = useLocation();
  const here = sportOf(pathname);
  const [last, setLast] = useState(() => read("pa.sport") || "basketball");
  useEffect(() => {
    if (here && here !== last) { setLast(here); write("pa.sport", here); }
  }, [here, last]);
  return here || last;
}

/** Kenar çubuğu durumu. Kullanıcı seçmediyse: oyun ekranlarında 1440 altında
    kapalı, başka her yerde açık. Kullanıcı seçtiyse o kalır. */
export function useSidebarCollapsed() {
  const { pathname } = useLocation();
  const [pref, setPref] = useState(() => read("pa.sidebar"));
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= 1440);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1440);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const auto = isPlayRoute(pathname) && !wide;
  const collapsed = pref ? pref === "closed" : auto;
  const toggle = () => {
    const next = collapsed ? "open" : "closed";
    setPref(next); write("pa.sidebar", next);
  };
  return [collapsed, toggle];
}
