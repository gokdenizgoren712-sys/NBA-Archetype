// ── Sezon simülasyonu paneli (v3.5 Faz 1) ────────────────────────────────────
// ScoreReveal içinde render edilir. Maç maç akan regular season,
// tur tur açılan playoff bracket'i, şampiyonluk bannerı.

import { useState, useRef, useEffect } from "react";
import { simulateSeason } from "./seasonSim";
import { useAuth } from "../contexts/AuthContext";

const MONTHS = ["OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR"];

export default function SeasonSimPanel({ players, simEra, fit, affinity01, bench = [], coach = null }) {
  const { isLoggedIn, token } = useAuth();
  const [result, setResult]           = useState(null);
  const [revealGames, setRevealGames] = useState(0);
  const [revealRounds, setRevealRounds] = useState(0);
  const [stage, setStage]             = useState("idle"); // idle | regular | playoffs | done
  const [runCount, setRunCount]       = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const run = () => {
    clearInterval(timerRef.current);
    const res = simulateSeason(players, simEra, fit, affinity01, { bench, coach });
    setResult(res);
    setRevealGames(0);
    setRevealRounds(0);
    setStage("regular");
    const isFirst = runCount === 0;
    setRunCount(c => c + 1);

    // 82 maçı ~2.5 saniyede akıt, sonra playoff turlarını tek tek aç
    let g = 0;
    timerRef.current = setInterval(() => {
      g = Math.min(82, g + 2);
      setRevealGames(g);
      if (g >= 82) {
        clearInterval(timerRef.current);
        if (res.madePlayoffs) {
          setStage("playoffs");
          let r = 0;
          timerRef.current = setInterval(() => {
            r++;
            setRevealRounds(r);
            if (r >= res.playoffRounds.length) {
              clearInterval(timerRef.current);
              setTimeout(() => setStage("done"), 600);
            }
          }, 950);
        } else {
          setStage("done");
        }
      }
    }, 60);

    // Yalnızca ilk koşu leaderboard'a işlenir (re-run farming önlemi)
    if (isFirst && isLoggedIn && token) {
      fetch("/api/game/season-result", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wins: res.wins, season_result: res.resultKey, sim_era: simEra.id }),
      }).catch(() => {});
    }
  };

  const shownLog   = result ? result.gameLog.slice(0, revealGames) : [];
  const shownWins  = shownLog.filter(Boolean).length;
  const shownLosses = shownLog.length - shownWins;
  const month = MONTHS[Math.min(6, Math.floor(revealGames / 12))];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] text-slate-600 uppercase tracking-widest">Season Simulation</div>
        <div className="flex items-center gap-1.5">
          {coach && (
            <span className="text-[9.5px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-300"
              title={`O:${coach.off} D:${coach.def}${coach.champs ? ` · ${coach.champs}× champ` : ""}`}>
              🧠 {coach.name.split(" ").slice(-1)[0]}
            </span>
          )}
          <span className={`text-[9.5px] px-1.5 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>{simEra.label}</span>
        </div>
      </div>

      {/* === IDLE === */}
      {stage === "idle" && (
        <div className="space-y-3">
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            Take this roster through an 82-game season in the <span className={simEra.color}>{simEra.label}</span>.
            Each player's archetype is re-weighted for the era's meta, plus penalties for era distance and
            off-position minutes. Starters carry ~78% of the load — your bench covers the rest
            {coach ? <> — and <span className="text-slate-300">{coach.name}</span> {coach.champs > 0 ? `brings ${coach.champs} ring${coach.champs > 1 ? "s" : ""} of playoff DNA` : "runs the sideline"}</> : ""}.
            Win 50%+ to make the playoffs, then survive four best-of-7 rounds.
          </p>
          <button onClick={run}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors">
            ▶ Simulate Season
          </button>
          {!isLoggedIn && (
            <p className="text-[10.5px] text-slate-600 text-center">Log in to record season results on the leaderboard.</p>
          )}
        </div>
      )}

      {/* === SEZON AKIŞI === */}
      {stage !== "idle" && result && (
        <div className="space-y-3">
          {/* Running record */}
          <div className="text-center">
            <div className="text-[9.5px] text-slate-600 uppercase tracking-widest mb-1">
              {revealGames < 82 ? `Regular Season · ${month}` : `Final Record${result.seed ? ` · #${result.seed} seed` : ""}`}
            </div>
            <div className="text-4xl font-black text-white tabular-nums">
              {shownWins}<span className="text-slate-600 mx-1">–</span>{shownLosses}
            </div>
            {revealGames >= 82 && (
              <div className="text-[10.5px] text-slate-500 mt-1">
                Best streak: <span className="text-emerald-400">W{result.bestStreak}</span>
                {" · "}Worst skid: <span className="text-red-400">L{result.worstSkid}</span>
              </div>
            )}
          </div>

          {/* Progress bar — 82 maç */}
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full transition-all duration-100"
                 style={{ width: `${(revealGames / 82) * 100}%` }} />
          </div>

          {/* Playoff kalifikasyonu */}
          {revealGames >= 82 && !result.madePlayoffs && (
            <div className="text-center py-2 rounded-xl border border-red-900/50 bg-red-950/30">
              <span className="text-sm text-red-400 font-semibold">Missed the Playoffs</span>
              <p className="text-[10.5px] text-slate-500 mt-0.5">Needed 41 wins — finished with {result.wins}.</p>
            </div>
          )}

          {/* Playoff bracket — tur tur */}
          {result.madePlayoffs && (stage === "playoffs" || stage === "done") && (
            <div className="space-y-1.5">
              <div className="text-[9.5px] text-slate-600 uppercase tracking-widest">Playoffs</div>
              {result.playoffRounds.slice(0, revealRounds).map((rd, i) => (
                <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border
                  ${rd.won ? "border-emerald-800/50 bg-emerald-950/20" : "border-red-900/50 bg-red-950/20"}`}>
                  <span className="text-[10.5px] text-slate-400 flex-1">{rd.label}</span>
                  <span className="text-[9.5px] text-slate-600">vs {Math.round(rd.opp * 100)}-rated</span>
                  <span className={`text-xs font-bold ${rd.won ? "text-emerald-400" : "text-red-400"}`}>
                    {rd.won ? "W" : "L"} {rd.w}–{rd.l}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Final banner */}
          {stage === "done" && (
            <div className={`text-center py-3 rounded-xl border ${
              result.champion
                ? "border-yellow-600/60 bg-gradient-to-b from-yellow-900/40 to-amber-950/30"
                : "border-slate-700 bg-slate-800/40"}`}>
              <div className={`text-lg font-black ${result.champion ? "text-yellow-300" : "text-slate-300"}`}>
                {result.champion ? "🏆 NBA CHAMPIONS" : result.resultLabel}
              </div>
              <div className="text-[10.5px] text-slate-500 mt-1">
                Season Score: <span className="text-white font-bold">{result.seasonScore}</span>
                <span className="text-slate-600"> — {result.wins} wins{result.playoffGameWins > 0 ? ` + ${result.playoffGameWins} playoff wins` : ""}{result.champion ? " + championship bonus" : ""}</span>
              </div>
            </div>
          )}

          {/* Oyuncu era performansı */}
          {stage === "done" && (
            <div className="space-y-1.5 border-t border-slate-800 pt-2.5">
              <div className="text-[9.5px] text-slate-600 uppercase tracking-widest">Era Performance</div>
              {[...result.profiles, ...(result.benchProfiles || [])].map((pr, i) => {
                const qPct = Math.round(pr.simQuality * 100);
                const metaUp   = pr.archW > 1.02;
                const metaDown = pr.archW < 0.92;
                return (
                  <div key={i} className={`flex items-center gap-2 ${pr.bench ? "opacity-70" : ""}`}>
                    {pr.bench && <span className="text-[8px] px-1 rounded bg-slate-800 text-slate-500 shrink-0">B</span>}
                    <span className="text-[10.5px] text-white flex-1 truncate">{pr.name?.split(" ").slice(-1)[0]}</span>
                    <span className="text-[9px] text-slate-600 shrink-0">{pr.arch}</span>
                    {metaUp   && <span className="text-[8.5px] text-emerald-500 shrink-0">↑meta</span>}
                    {metaDown && <span className="text-[8.5px] text-red-500 shrink-0">↓meta</span>}
                    {pr.dist > 0 && <span className="text-[8.5px] text-amber-600 shrink-0">−{pr.dist} era</span>}
                    {pr.posP != null && pr.posP < 1 && <span className="text-[8.5px] text-red-400 shrink-0">{pr.posP <= 0.75 ? "−25% pos" : "−10% pos"}</span>}
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${qPct}%`, background: qPct >= 70 ? "#059669" : qPct >= 50 ? "#2a3d6b" : "#7f1d1d" }} />
                    </div>
                    <span className="text-[10.5px] w-5 text-right text-slate-400 shrink-0">{qPct}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sezon ödülleri + istatistikler */}
          {stage === "done" && (
            <div className="space-y-2 border-t border-slate-800 pt-2.5">
              <div className="text-[9.5px] text-slate-600 uppercase tracking-widest">Season Awards</div>
              {result.awards?.length > 0 ? (
                <div className="space-y-1">
                  {result.awards.map((a, i) => (
                    <div key={i} className="text-[11px] text-slate-200">{a}</div>
                  ))}
                </div>
              ) : (
                <div className="text-[10.5px] text-slate-600 italic">No individual hardware this season.</div>
              )}
              {result.statLines?.length > 0 && (
                <div className="mt-1.5">
                  <div className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem] gap-x-1 text-[8.5px] text-slate-600 uppercase tracking-wider pb-1">
                    <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span>
                  </div>
                  {result.statLines.map((l, i) => (
                    <div key={i} className={`grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem] gap-x-1 text-[10px] leading-relaxed ${l.bench ? "text-slate-500" : "text-slate-300"}`}>
                      <span className="truncate">{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
                      <span className="text-right tabular-nums">{l.pts}</span>
                      <span className="text-right tabular-nums">{l.reb}</span>
                      <span className="text-right tabular-nums">{l.ast}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aktif tag etkileri */}
          {stage === "done" && result.tagNotes?.length > 0 && (
            <div className="space-y-1 border-t border-slate-800 pt-2.5">
              <div className="text-[9.5px] text-slate-600 uppercase tracking-widest">Active Tag Effects</div>
              {result.tagNotes.map((n, i) => (
                <div key={i} className="text-[10.5px] text-slate-400">• {n}</div>
              ))}
            </div>
          )}

          {/* Run it back */}
          {stage === "done" && (
            <button onClick={run}
              className="w-full py-2 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:border-emerald-600 hover:text-emerald-300 transition-colors">
              🔁 Run It Back
              <span className="text-[9.5px] text-slate-600 ml-1.5">(only your first run counts)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
