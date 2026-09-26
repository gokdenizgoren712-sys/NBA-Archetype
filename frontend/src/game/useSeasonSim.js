// Sezon motorunun React sarmalayıcısı — web paneli (game/SeasonSimPanel.jsx) ve
// RankIt uygulamasının mobil sezon ekranları (arcade/basketball) bunu kullanır.
// Kurallar game/seasonRun.js'te.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createSeasonRun, deriveSeason } from "./seasonRun";

/** inputs: bkz. createSeasonRun. gameScoreId gibi sonradan gelen değerler her
 *  render'da motora iletilir; motor onları eylem anında okur. */
export function useSeasonSim(inputs, deps) {
  const [engine] = useState(() => createSeasonRun(deps, inputs));
  useEffect(() => { engine.setInputs(inputs); });
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  useEffect(() => {
    engine.actions.init();
    return () => engine.actions.dispose();
  }, [engine]);
  const excludeTeam = inputs.excludeTeam;
  const derived = useMemo(() => deriveSeason(state, { excludeTeam }), [state, excludeTeam]);
  return { ...state, ...derived, ...engine.actions };
}
