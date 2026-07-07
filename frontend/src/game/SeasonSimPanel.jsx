// ── Sezon simülasyonu paneli (v3.5 Faz 1 → v3.6 Faz D+E) ─────────────────────
// Rotasyon/dakika editörü, maç maç akan sezon, playoff bracket'i,
// dynasty modu: şampiyonluğu savun → back-to-back → THREEPEAT.

import { useState, useRef, useEffect } from "react";
import { simulateSeason, BASE_MINUTES, MINUTE_FLEX, agePenaltyFor } from "./seasonSim";
import { useAuth } from "../contexts/AuthContext";
import { CoachIcon, TrophyIcon, CrownIcon, PlayIcon, LoopIcon } from "./GameIcons";

const MONTHS = ["OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR"];

export default function SeasonSimPanel({ players, simEra, fit, affinity01, bench = [], coach = null }) {
  const { isLoggedIn, token } = useAuth();
  const [result, setResult]           = useState(null);
  const [revealGames, setRevealGames] = useState(0);
  const [revealRounds, setRevealRounds] = useState(0);
  const [stage, setStage]             = useState("idle"); // idle | regular | playoffs | done
  const [runCount, setRunCount]       = useState(0);
  // Faz D: rotasyon dakikaları (5 starter + N bench)
  const nRoster = players.length + bench.length;
  const [minutes, setMinutes] = useState(() => BASE_MINUTES.slice(0, nRoster));
  // Faz E: dynasty durumu — {year, titles} (titles = art arda şampiyonluk)
  const [dynasty, setDynasty] = useState({ year: 1, titles: 0 });
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const minuteBank = 240 - minutes.reduce((a, b) => a + b, 0);
  const bumpMinute = (i, d) => {
    setMinutes(ms => {
      const base = BASE_MINUTES[i] ?? 13;
      const next = ms[i] + d;
      if (next < Math.max(6, base - MINUTE_FLEX) || next > base + MINUTE_FLEX) return ms;
      if (d > 0 && minuteBank <= 0) return ms;
      const copy = [...ms];
      copy[i] = next;
      return copy;
    });
  };

  const postResult = (res, resultKey) => {
    fetch("/api/game/season-result", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wins: res.wins, season_result: resultKey, sim_era: simEra.id }),
    }).catch(() => {});
  };

  // Ortak animasyon: sezonu akıt, playoff'u aç
  const animate = (res, after) => {
    clearInterval(timerRef.current);
    setResult(res);
    setRevealGames(0);
    setRevealRounds(0);
    setStage("regular");
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
              setTimeout(() => { setStage("done"); after && after(); }, 600);
            }
          }, 950);
        } else {
          setStage("done");
          after && after();
        }
      }
    }, 60);
  };

  // Yeni dynasty (sezon 1). Yalnızca İLK koşu leaderboard'a işlenir.
  const run = () => {
    const res = simulateSeason(players, simEra, fit, affinity01, { bench, coach, minutes });
    const isFirst = runCount === 0;
    setRunCount(c => c + 1);
    setDynasty({ year: 1, titles: res.champion ? 1 : 0 });
    animate(res);
    if (isFirst && isLoggedIn && token) postResult(res, res.resultKey);
  };

  // Faz E: şampiyonluğu savun — kadro her sezon yaşlanır (S6: hızlanan eğri, agePenaltyFor)
  const defend = () => {
    const nextYear = dynasty.year + 1;
    const res = simulateSeason(players, simEra, fit, affinity01,
      { bench, coach, minutes, agePenalty: agePenaltyFor(nextYear) });
    const newTitles = res.champion ? dynasty.titles + 1 : dynasty.titles;
    setDynasty({ year: nextYear, titles: newTitles, ended: !res.champion });
    animate(res, () => {
      // İlk dynasty koşusunda repeat/threepeat leaderboard'a yükseltilir
      if (runCount === 1 && isLoggedIn && token && res.champion) {
        if (newTitles >= 3)      postResult(res, "THREEPEAT");
        else if (newTitles === 2) postResult(res, "REPEAT");
      }
    });
  };

  const shownLog   = result ? result.gameLog.slice(0, revealGames) : [];
  const shownWins  = shownLog.filter(Boolean).length;
  const shownLosses = shownLog.length - shownWins;
  const month = MONTHS[Math.min(6, Math.floor(revealGames / 12))];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-400 uppercase tracking-widest flex items-center gap-1">
          <span>Season Simulation{stage!=="idle"&&dynasty.year>1?` · Year ${dynasty.year}`:""}</span>
          {stage!=="idle"&&dynasty.titles>0&&(
            <span className="text-yellow-400 flex items-center gap-0.5">
              {Array.from({length:Math.min(dynasty.titles,3)}).map((_,i)=><TrophyIcon key={i} size={12}/>)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {coach && (
            <span className="text-[9.5px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 inline-flex items-center gap-1"
              title={`O:${coach.off} D:${coach.def}${coach.champs ? ` · ${coach.champs}× champ` : ""}`}>
              <CoachIcon size={11} /> {coach.name.split(" ").slice(-1)[0]}
            </span>
          )}
          <span className={`text-[9.5px] px-1.5 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>{simEra.label}</span>
        </div>
      </div>

      {/* === IDLE: rotasyon + başlat === */}
      {stage === "idle" && (
        <div className="space-y-3">
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            An 82-game season in the <span className={simEra.color}>{simEra.label}</span>. Win 50%+ for the playoffs,
            survive four rounds — then <span className="text-yellow-300 font-medium">defend the title</span>. Three straight rings = <span className="text-yellow-300 font-semibold">THREEPEAT</span>, the ultimate goal.
            Set your rotation below: minutes drive production, 37+ brings fatigue, resting starters banks playoff freshness.
          </p>

          {/* Rotasyon / dakika editörü (Faz D) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] text-slate-400 uppercase tracking-widest">Rotation</span>
              <span className={`text-[10.5px] font-semibold ${minuteBank>0?"text-emerald-400":"text-slate-500"}`}>
                {minuteBank>0?`${minuteBank} min in the bank`:"240 / 240 min"}
              </span>
            </div>
            <div className="space-y-1">
              {[...players, ...bench].map((p, i) => {
                const m = minutes[i] ?? 0;
                const base = BASE_MINUTES[i] ?? 13;
                const fat = m >= 39 ? "high" : m >= 37 ? "mild" : null;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[8.5px] w-7 shrink-0 font-bold ${i<5?"text-blue-400":"text-slate-500"}`}>{i<5?"ST":i===5?"6TH":`B${i-4}`}</span>
                    <span className="text-[11px] text-white flex-1 truncate">{p.PLAYER_NAME?.split(" ").slice(-1)[0]}</span>
                    {fat&&<span className={`text-[8.5px] shrink-0 ${fat==="high"?"text-red-400":"text-amber-400"}`}>{fat==="high"?"fatigue −%":"tiring"}</span>}
                    {i<5&&m<=31&&<span className="text-[8.5px] text-emerald-400 shrink-0">fresh +PO</span>}
                    <button onClick={()=>bumpMinute(i,-1)} disabled={m<=Math.max(6,base-MINUTE_FLEX)}
                      className="w-5 h-5 rounded border border-slate-700 text-slate-400 text-xs leading-none disabled:opacity-25 hover:border-slate-500">−</button>
                    <span className="text-[11px] font-bold tabular-nums w-6 text-center text-slate-200">{m}</span>
                    <button onClick={()=>bumpMinute(i,1)} disabled={m>=base+MINUTE_FLEX||minuteBank<=0}
                      className="w-5 h-5 rounded border border-slate-700 text-slate-400 text-xs leading-none disabled:opacity-25 hover:border-slate-500">+</button>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={run}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors inline-flex items-center justify-center gap-2">
            <PlayIcon size={16} /> Simulate Season
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
            <div className="text-[10.5px] text-slate-400 uppercase tracking-widest mb-1">
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
              <div className="text-[10.5px] text-slate-400 uppercase tracking-widest">Playoffs</div>
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

          {/* Final banner — dynasty farkındalıklı (Faz E) */}
          {stage === "done" && (
            <div className={`text-center py-3 rounded-xl border ${
              dynasty.titles >= 3
                ? "border-yellow-400 bg-gradient-to-b from-yellow-800/60 to-amber-950/40 shadow-[0_0_24px_rgba(250,204,21,.25)]"
                : result.champion
                ? "border-yellow-600/60 bg-gradient-to-b from-yellow-900/40 to-amber-950/30"
                : "border-slate-700 bg-slate-800/40"}`}>
              <div className={`font-black inline-flex items-center gap-1.5 ${dynasty.titles>=3?"text-2xl text-yellow-200":result.champion?"text-lg text-yellow-300":"text-lg text-slate-300"}`}>
                {dynasty.titles >= 3 ? <><CrownIcon size={24} /> THREEPEAT — DYNASTY COMPLETE</>
                  : result.champion && dynasty.titles === 2 ? <><TrophyIcon size={18} /><TrophyIcon size={18} /> BACK-TO-BACK CHAMPIONS</>
                  : result.champion ? <><TrophyIcon size={18} /> NBA CHAMPIONS</>
                  : result.resultLabel}
              </div>
              {dynasty.ended && dynasty.titles > 0 && !result.champion && (
                <div className="text-[11px] text-amber-400/90 mt-1">
                  Dynasty over — {dynasty.titles} straight title{dynasty.titles>1?"s":""}. The league caught up.
                </div>
              )}
              <div className="text-[10.5px] text-slate-500 mt-1">
                Season {dynasty.year} · Score: <span className="text-white font-bold">{result.seasonScore}</span>
                <span className="text-slate-600"> — {result.wins} wins{result.playoffGameWins > 0 ? ` + ${result.playoffGameWins} playoff wins` : ""}{result.champion ? " + championship bonus" : ""}</span>
              </div>
            </div>
          )}

          {/* Faz E: şampiyonluğu savun */}
          {stage === "done" && result.champion && dynasty.titles < 3 && (
            <button onClick={defend}
              className="w-full py-3 rounded-xl font-bold transition-colors text-slate-900"
              style={{background:"linear-gradient(90deg,#facc15,#f59e0b)"}}>
              <span className="inline-flex items-center justify-center gap-1.5"><CrownIcon size={16} /> Defend the Title — Season {dynasty.year + 1}</span>
              <span className="block text-[10px] font-medium mt-0.5 opacity-80">
                {dynasty.titles === 2 ? "One more for the THREEPEAT" : "The roster ages: −1.2 rating per extra season"}
              </span>
            </button>
          )}

          {/* Oyuncu era performansı */}
          {stage === "done" && (
            <div className="space-y-1.5 border-t border-slate-800 pt-2.5">
              <div className="text-xs text-slate-300 uppercase tracking-widest font-semibold">Era Performance</div>
              {[...result.profiles, ...(result.benchProfiles || [])].map((pr, i) => {
                const qPct = Math.round(pr.simQuality * 100);
                return (
                  <div key={i} className={`flex items-center gap-2 ${pr.bench ? "opacity-70" : ""}`}>
                    {pr.bench && <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-500 shrink-0">B</span>}
                    <span className="text-[13px] text-white flex-1 truncate">{pr.name?.split(" ").slice(-1)[0]}</span>
                    <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">{pr.minutes}m</span>
                    {pr.fatigue > 0 && <span className="text-[10px] text-red-400 shrink-0">−{Math.round(pr.fatigue*100)}% tired</span>}
                    <span className="text-[11px] text-slate-500 shrink-0">{pr.arch}</span>
                    {pr.timeless && <span className="text-[10px] font-bold text-purple-400 shrink-0" title="Timeless — era distance fully ignored">TL</span>}
                    {!pr.timeless && pr.fitShift < 0 && <span className="text-[10px] text-emerald-400 shrink-0" title="Archetype fits this era — travels one era closer">fits era</span>}
                    {pr.dist > 0 && !pr.timeless && <span className="text-[10px] text-amber-500 shrink-0">−{pr.dist} era</span>}
                    {pr.posP != null && pr.posP < 1 && <span className="text-[10px] text-red-400 shrink-0">{pr.posP <= 0.75 ? "−25% pos" : "−10% pos"}</span>}
                    <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${qPct}%`, background: qPct >= 70 ? "#059669" : qPct >= 50 ? "#2a3d6b" : "#7f1d1d" }} />
                    </div>
                    <span className="text-[13px] font-semibold w-6 text-right text-slate-300 shrink-0">{qPct}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sezon ödülleri + istatistikler */}
          {stage === "done" && (
            <div className="space-y-2 border-t border-slate-800 pt-2.5">
              <div className="text-[10.5px] text-slate-400 uppercase tracking-widest">Season Awards</div>
              {result.awards?.length > 0 ? (
                <div className="space-y-1">
                  {result.awards.map((a, i) => (
                    <div key={i} className="text-[11px] text-slate-200">{a}</div>
                  ))}
                </div>
              ) : (
                <div className="text-[10.5px] text-slate-600 italic">No individual hardware this season.</div>
              )}
              {result.statLines?.length > 0 && (() => {
                const COLS = "grid-cols-[1fr_2.2rem_2.2rem_2.2rem_2.2rem_2.2rem_2.4rem]";
                const tot = k => +result.statLines.reduce((a, l) => a + (l[k] || 0), 0).toFixed(1);
                const fg3s = result.statLines.filter(l => l.fg3 != null);
                const fg3avg = fg3s.length ? Math.round(fg3s.reduce((a, l) => a + l.fg3, 0) / fg3s.length) : null;
                return (
                  <div className="mt-1.5">
                    <div className={`grid ${COLS} gap-x-1 text-[8.5px] text-slate-500 uppercase tracking-wider pb-1`}>
                      <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">STL</span><span className="text-right">BLK</span><span className="text-right">3P%</span>
                    </div>
                    {result.statLines.map((l, i) => (
                      <div key={i} className={`grid ${COLS} gap-x-1 text-[10px] leading-relaxed ${l.bench ? "text-slate-500" : "text-slate-300"}`}>
                        <span className="truncate">{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
                        <span className="text-right tabular-nums">{l.pts}</span>
                        <span className="text-right tabular-nums">{l.reb}</span>
                        <span className="text-right tabular-nums">{l.ast}</span>
                        <span className="text-right tabular-nums">{l.stl ?? "—"}</span>
                        <span className="text-right tabular-nums">{l.blk ?? "—"}</span>
                        <span className="text-right tabular-nums">{l.fg3 != null ? `${l.fg3}%` : "—"}</span>
                      </div>
                    ))}
                    {/* Takım toplamları */}
                    <div className={`grid ${COLS} gap-x-1 text-[10px] font-bold text-white border-t border-slate-800 mt-1 pt-1`}>
                      <span>TEAM</span>
                      <span className="text-right tabular-nums">{tot("pts")}</span>
                      <span className="text-right tabular-nums">{tot("reb")}</span>
                      <span className="text-right tabular-nums">{tot("ast")}</span>
                      <span className="text-right tabular-nums">{tot("stl")}</span>
                      <span className="text-right tabular-nums">{tot("blk")}</span>
                      <span className="text-right tabular-nums">{fg3avg != null ? `${fg3avg}%` : "—"}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Aktif tag etkileri */}
          {stage === "done" && result.tagNotes?.length > 0 && (
            <div className="space-y-1 border-t border-slate-800 pt-2.5">
              <div className="text-[10.5px] text-slate-400 uppercase tracking-widest">Active Tag Effects</div>
              {result.tagNotes.map((n, i) => (
                <div key={i} className="text-[10.5px] text-slate-400">• {n}</div>
              ))}
            </div>
          )}

          {/* Run it back */}
          {stage === "done" && (
            <button onClick={run}
              className="w-full py-2 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:border-emerald-600 hover:text-emerald-300 transition-colors">
              <span className="inline-flex items-center gap-1.5"><LoopIcon size={14} /> Run It Back</span>
              <span className="text-[9.5px] text-slate-600 ml-1.5">(fresh dynasty — only your first counts for the board)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
