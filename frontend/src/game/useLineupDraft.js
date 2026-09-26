// Lineup Builder motorunun React sarmalayıcısı — web sayfası (pages/LineupGame.jsx)
// ve RankIt uygulamasının mobil arayüzü (arcade/basketball) bunu kullanır.
// Kurallar game/lineupDraft.js'te; burası yalnız aboneliği ve ömrü yönetir.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createLineupDraft, deriveDraft } from "./lineupDraft";

export function useLineupDraft(deps) {
  // Motor bileşen başına bir kez kurulur (StrictMode'un çift render'ında
  // ikinci örnek atılır; ağ/zamanlayıcı yalnız effect'te başlar).
  const [engine] = useState(() => createLineupDraft(deps));
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  useEffect(() => {
    engine.actions.init();
    return () => engine.actions.dispose();
  }, [engine]);
  const derived = useMemo(() => deriveDraft(state), [state]);
  return { ...state, ...derived, ...engine.actions };
}
