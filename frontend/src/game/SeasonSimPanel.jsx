// ── Sezon simülasyonu paneli (v3.5 Faz 1 → v3.6 Faz D+E) ─────────────────────
// Rotasyon/dakika editörü, maç maç akan sezon, playoff bracket'i,
// dynasty modu: şampiyonluğu savun → back-to-back → THREEPEAT.

import { useState, useRef, useEffect } from "react";
import { simulateSeason, BASE_MINUTES, MINUTE_FLEX, agePenaltyFor } from "./seasonSim";
import { useAuth } from "../contexts/AuthContext";
import { CoachIcon, TrophyIcon, CrownIcon, PlayIcon, LoopIcon, DnaIcon, WheelIcon } from "./GameIcons";
import "./game.css";

const MONTHS = ["OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR"];

// "Rewrite History" — era.years [start, endExclusive) aralığındaki gerçek
// sezon string'lerini üretir (bkz. game/eras.js ERAS).
function seasonsInEra(era) {
  if (!era?.years) return [];
  const [start, endExcl] = era.years;
  const end = Math.min(endExcl, new Date().getFullYear());  // içinde bulunduğumuz/açık sezonu hariç tut
  const out = [];
  for (let y = start; y < end; y++) out.push(`${y}-${String(y + 1).slice(-2)}`);
  return out;
}

export default function SeasonSimPanel({ players, simEra, fit, affinity01, bench = [], coach = null, gameScoreId = null, enableRealHistory = false }) {
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

  // "Rewrite History" (bkz. plan: docs/plans/fancy-cooking-gizmo.md) — Single
  // Player'a özel, opt-in. simMode="quick" bugünkü davranış, "history" gerçek
  // sezon+takım seçimi açar.
  const [simMode, setSimMode]   = useState("quick");   // "quick" | "history"
  const [rhStep, setRhStep]     = useState("season");   // season | team | ready
  const [rhSeasons]             = useState(() => seasonsInEra(simEra));
  const [rhSeason, setRhSeason] = useState(null);
  const [rhTeams, setRhTeams]   = useState([]);
  const [rhTeam, setRhTeam]     = useState(null);
  const [rhSchedule, setRhSchedule] = useState(null);
  const [rhLoading, setRhLoading]   = useState(false);
  const [rhError, setRhError]       = useState("");

  const pickRhSeason = (s) => {
    setRhSeason(s); setRhTeam(null); setRhSchedule(null); setRhError("");
    setRhLoading(true);
    fetch(`/api/historical/${s}/teams`).then(r => r.json())
      .then(d => { setRhTeams(d.teams || []); setRhStep("team"); })
      .catch(() => setRhError("Could not load teams for this season."))
      .finally(() => setRhLoading(false));
  };
  const pickRhTeam = (abbr) => {
    setRhTeam(abbr); setRhError("");
    setRhLoading(true);
    fetch(`/api/historical/${rhSeason}/team/${abbr}/schedule`).then(r => r.json())
      .then(d => { setRhSchedule(d); setRhStep("ready"); })
      .catch(() => setRhError("Could not load that team's schedule."))
      .finally(() => setRhLoading(false));
  };

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
    // gameScoreId varsa TAM O satır güncellenir (bkz. api/main.py save_season_result) —
    // "kullanıcının son satırı" tahminine düşmek StrictMode'un dev'de mount
    // effect'i çift tetiklemesiyle yanlış satırı güncelleyebiliyordu.
    fetch("/api/game/season-result", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wins: res.wins, season_result: resultKey, sim_era: simEra.id, game_id: gameScoreId }),
    }).catch(() => {});
  };

  // Ortak animasyon: sezonu akıt, playoff'u aç. nGames sabit 82 DEĞİL — Rewrite
  // History'de kısaltılmış gerçek sezonlar olabilir (1998-99 lockout 50 maç vb,
  // bkz. seasonSim.js madePlayoffs notu).
  const animate = (res, after) => {
    clearInterval(timerRef.current);
    const nGames = res.gameLog.length;
    setResult(res);
    setRevealGames(0);
    setRevealRounds(0);
    setStage("regular");
    let g = 0;
    timerRef.current = setInterval(() => {
      g = Math.min(nGames, g + 2);
      setRevealGames(g);
      if (g >= nGames) {
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
  // Rewrite History'de extras.realSchedule dolu — seasonSim.js gerçek rakip/
  // ev-deplasman/maç-maç box score yoluna geçer (bkz. plan).
  const run = () => {
    const extras = { bench, coach, minutes };
    if (simMode === "history" && rhSchedule) extras.realSchedule = rhSchedule;
    const res = simulateSeason(players, simEra, fit, affinity01, extras);
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
    <div className="g-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-gray-400 uppercase tracking-widest flex items-center gap-1">
          <span>Season Simulation{stage!=="idle"&&dynasty.year>1?` · Year ${dynasty.year}`:""}</span>
          {stage!=="idle"&&dynasty.titles>0&&(
            <span className="text-yamabuki flex items-center gap-0.5">
              {Array.from({length:Math.min(dynasty.titles,3)}).map((_,i)=><TrophyIcon key={i} size={12}/>)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {coach && (
            <span className="text-[9.5px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{color:"var(--text-muted)",border:"1px solid rgba(255,255,255,.12)"}}
              title={`O:${coach.off} D:${coach.def}${coach.champs ? ` · ${coach.champs}× champ` : ""}`}>
              <CoachIcon size={11} /> {coach.name.split(" ").slice(-1)[0]}
            </span>
          )}
          <span className={`text-[9.5px] px-1.5 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>{simEra.label}</span>
        </div>
      </div>

      {/* === IDLE: mod seçimi (Rewrite History) + rotasyon + başlat === */}
      {stage === "idle" && (
        <div className="space-y-3">
          {enableRealHistory && (
            <div className="flex gap-1.5 p-1 rounded-lg" style={{background:"var(--bg-surface)",border:"1px solid var(--border)"}}>
              <button onClick={()=>setSimMode("quick")}
                className="flex-1 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide transition-colors"
                style={{background:simMode==="quick"?"var(--bg-elevated)":"transparent",color:simMode==="quick"?"var(--text-primary)":"var(--text-faint)"}}>
                <WheelIcon size={12} /> <span className="ml-1">Quick Sim</span>
              </button>
              <button onClick={()=>setSimMode("history")}
                className="flex-1 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide transition-colors"
                style={{background:simMode==="history"?"rgba(255,177,27,.16)":"transparent",color:simMode==="history"?"var(--yamabuki)":"var(--text-faint)"}}>
                <DnaIcon size={12} /> <span className="ml-1">Rewrite History</span>
              </button>
            </div>
          )}

          {simMode === "history" && rhStep !== "ready" ? (
            <div className="space-y-2.5">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Step into a real {simEra.label} season. Pick the year, then the team your draft replaces —
                you'll play their exact 82-game schedule, real opponents and all.
              </p>
              {rhError && <p className="text-[11px] text-red-400">{rhError}</p>}

              {rhStep === "season" && (
                <div className="grid grid-cols-3 gap-1.5">
                  {rhSeasons.map(s => (
                    <button key={s} onClick={()=>pickRhSeason(s)} disabled={rhLoading}
                      className="g-tile" style={{padding:"10px 6px","--accent":"#FFB11B","--accent-a":"rgba(255,177,27,.10)","--accent-line":"rgba(255,177,27,.35)"}}>
                      <div className="g-tile-title" style={{fontSize:12,color:"var(--yamabuki)"}}>{s}</div>
                    </button>
                  ))}
                  {rhSeasons.length === 0 && (
                    <p className="col-span-3 text-[10.5px] text-gray-600 italic">No completed real seasons in this era yet.</p>
                  )}
                </div>
              )}

              {rhStep === "team" && (
                <div className="space-y-2">
                  <button onClick={()=>{setRhStep("season"); setRhTeam(null);}}
                    className="text-[10.5px]" style={{color:"var(--text-muted)"}}>← Back to seasons</button>
                  <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {rhTeams.map(t => (
                      <button key={t.abbr} onClick={()=>pickRhTeam(t.abbr)} disabled={rhLoading}
                        className="g-tile" style={{padding:"9px 8px","--accent":"#FFB11B","--accent-a":"rgba(255,177,27,.10)","--accent-line":"rgba(255,177,27,.35)"}}>
                        <div className="flex items-center justify-between">
                          <span className="g-tile-title" style={{fontSize:12}}>{t.abbr}</span>
                          <span className="text-[10px] tabular-nums" style={{color:"var(--text-muted)"}}>{t.wins}-{t.losses}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rhLoading && <p className="text-[10.5px] text-gray-500 text-center py-2">Loading…</p>}
            </div>
          ) : (
          <>
          {simMode === "history" && rhStep === "ready" && rhSchedule && (
            <div className="rounded-xl p-3 flex items-center justify-between" style={{background:"rgba(255,177,27,.08)",border:"1px solid rgba(255,177,27,.3)"}}>
              <div>
                <div className="text-[10px] uppercase tracking-widest" style={{color:"var(--text-muted)"}}>Standing in for</div>
                <div className="font-logo font-bold text-sm" style={{color:"var(--yamabuki)"}}>
                  {rhSchedule.season} {rhSchedule.team} <span className="font-normal text-gray-500">({rhSchedule.wins}-{rhSchedule.losses})</span>
                </div>
              </div>
              <button onClick={()=>{setRhStep("team");}} className="text-[10.5px]" style={{color:"var(--text-muted)"}}>Change</button>
            </div>
          )}
          <p className="text-[11.5px] text-gray-400 leading-relaxed">
            {simMode==="history"
              ? <>Their exact {rhSchedule?.games?.length ?? 82}-game schedule, real opponents and all. Win 50%+ for the playoffs, survive four rounds — then <span className="text-yamabuki font-medium">defend the title</span>.</>
              : <>An 82-game season in the <span className={simEra.color}>{simEra.label}</span>. Win 50%+ for the playoffs, survive four rounds — then <span className="text-yamabuki font-medium">defend the title</span>. Three straight rings = <span className="text-yamabuki font-semibold">THREEPEAT</span>, the ultimate goal.</>}
            {" "}Set your rotation below: minutes drive production, 37+ brings fatigue, resting starters banks playoff freshness.
          </p>

          {/* Rotasyon / dakika editörü (Faz D) */}
          <div className="g-panel subtle p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] text-gray-400 uppercase tracking-widest">Rotation</span>
              <span className={`text-[10.5px] font-semibold ${minuteBank>0?"text-emerald-400":"text-gray-500"}`}>
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
                    <span className={`text-[8.5px] w-7 shrink-0 font-bold ${i<5?"text-blue-400":"text-gray-500"}`}>{i<5?"ST":i===5?"6TH":`B${i-4}`}</span>
                    <span className="text-[11px] text-white flex-1 truncate">{p.PLAYER_NAME?.split(" ").slice(-1)[0]}</span>
                    {fat&&<span className={`text-[8.5px] shrink-0 ${fat==="high"?"text-red-400":"text-yamabuki"}`}>{fat==="high"?"fatigue −%":"tiring"}</span>}
                    {i<5&&m<=31&&<span className="text-[8.5px] text-emerald-400 shrink-0">fresh +PO</span>}
                    <button onClick={()=>bumpMinute(i,-1)} disabled={m<=Math.max(6,base-MINUTE_FLEX)}
                      className="w-5 h-5 rounded-md text-xs leading-none disabled:opacity-25" style={{color:"var(--text-muted)",border:"1px solid rgba(255,255,255,.14)"}}>−</button>
                    <span className="text-[11px] font-bold tabular-nums w-6 text-center text-gray-200">{m}</span>
                    <button onClick={()=>bumpMinute(i,1)} disabled={m>=base+MINUTE_FLEX||minuteBank<=0}
                      className="w-5 h-5 rounded-md text-xs leading-none disabled:opacity-25" style={{color:"var(--text-muted)",border:"1px solid rgba(255,255,255,.14)"}}>+</button>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={run}
            disabled={simMode==="history" && !rhSchedule}
            className={`w-full py-3 text-white rounded-xl font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-40 ${
              simMode==="history" ? "" : "bg-emerald-700 hover:bg-emerald-600"}`}
            style={simMode==="history" ? {background:"linear-gradient(90deg,#FFD470,#FFB11B)",color:"#000"} : undefined}>
            {simMode==="history" ? <DnaIcon size={16} /> : <PlayIcon size={16} />}
            {simMode==="history" && rhSchedule ? `Simulate the ${rhSchedule.team}'s Season` : "Simulate Season"}
          </button>
          {!isLoggedIn && (
            <p className="text-[10.5px] text-gray-600 text-center">Log in to record season results on the leaderboard.</p>
          )}
          </>
          )}
        </div>
      )}

      {/* === SEZON AKIŞI === */}
      {stage !== "idle" && result && (() => {
        const nGames = result.gameLog.length;   // 82 sabit değil — bkz. animate() notu
        const halfway = Math.ceil(nGames / 2);
        return (
        <div className="space-y-3">
          {/* Running record */}
          <div className="text-center">
            <div className="text-[10.5px] text-gray-400 uppercase tracking-widest mb-1">
              {revealGames < nGames ? `Regular Season · ${month}` : `Final Record${result.seed ? ` · #${result.seed} seed` : ""}`}
            </div>
            <div className="text-4xl font-black text-white tabular-nums">
              {shownWins}<span className="text-gray-600 mx-1">–</span>{shownLosses}
            </div>
            {revealGames >= nGames && (
              <div className="text-[10.5px] text-gray-500 mt-1">
                Best streak: <span className="text-emerald-400">W{result.bestStreak}</span>
                {" · "}Worst skid: <span className="text-red-400">L{result.worstSkid}</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="g-bar-track" style={{height:7}}>
            <div className="h-full bg-emerald-600 rounded-full transition-all duration-100"
                 style={{ width: `${(revealGames / nGames) * 100}%` }} />
          </div>

          {/* Playoff kalifikasyonu */}
          {revealGames >= nGames && !result.madePlayoffs && (
            <div className="text-center py-2 rounded-xl border border-red-900/50 bg-red-950/30">
              <span className="text-sm text-red-400 font-semibold">Missed the Playoffs</span>
              <p className="text-[10.5px] text-gray-500 mt-0.5">Needed {halfway} wins — finished with {result.wins}.</p>
            </div>
          )}

          {/* Playoff bracket — tur tur */}
          {result.madePlayoffs && (stage === "playoffs" || stage === "done") && (
            <div className="space-y-1.5">
              <div className="text-[10.5px] text-gray-400 uppercase tracking-widest">Playoffs</div>
              {result.playoffRounds.slice(0, revealRounds).map((rd, i) => (
                <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border
                  ${rd.won ? "border-emerald-800/50 bg-emerald-950/20" : "border-red-900/50 bg-red-950/20"}`}>
                  <span className="text-[10.5px] text-gray-400 flex-1">{rd.label}</span>
                  <span className="text-[9.5px] text-gray-600">vs {Math.round(rd.opp * 100)}-rated</span>
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
                ? "border-yamabuki bg-gradient-to-b from-yamabuki/60 to-yamabuki/40 shadow-[0_0_24px_rgba(250,204,21,.25)]"
                : result.champion
                ? "border-yamabuki/60 bg-gradient-to-b from-yamabuki/40 to-yamabuki/30"
                : "border-white/10 bg-white/[.03]"}`}>
              <div className={`font-black inline-flex items-center gap-1.5 ${dynasty.titles>=3?"text-2xl text-yamabuki":result.champion?"text-lg text-yamabuki":"text-lg text-gray-300"}`}>
                {dynasty.titles >= 3 ? <><CrownIcon size={24} /> THREEPEAT — DYNASTY COMPLETE</>
                  : result.champion && dynasty.titles === 2 ? <><TrophyIcon size={18} /><TrophyIcon size={18} /> BACK-TO-BACK CHAMPIONS</>
                  : result.champion ? <><TrophyIcon size={18} /> NBA CHAMPIONS</>
                  : result.resultLabel}
              </div>
              {dynasty.ended && dynasty.titles > 0 && !result.champion && (
                <div className="text-[11px] text-yamabuki/90 mt-1">
                  Dynasty over — {dynasty.titles} straight title{dynasty.titles>1?"s":""}. The league caught up.
                </div>
              )}
              <div className="text-[10.5px] text-gray-500 mt-1">
                Season {dynasty.year} · Score: <span className="text-white font-bold">{result.seasonScore}</span>
                <span className="text-gray-600"> — {result.wins} wins{result.playoffGameWins > 0 ? ` + ${result.playoffGameWins} playoff wins` : ""}{result.champion ? " + championship bonus" : ""}</span>
              </div>
            </div>
          )}

          {/* Faz E: şampiyonluğu savun */}
          {stage === "done" && result.champion && dynasty.titles < 3 && (
            <button onClick={defend}
              className="w-full py-3 rounded-xl font-bold transition-colors text-gray-900"
              style={{background:"linear-gradient(90deg,#FFD470,#FFB11B)"}}>
              <span className="inline-flex items-center justify-center gap-1.5"><CrownIcon size={16} /> Defend the Title — Season {dynasty.year + 1}</span>
              <span className="block text-[10px] font-medium mt-0.5 opacity-80">
                {dynasty.titles === 2 ? "One more for the THREEPEAT" : "The roster ages: −1.2 rating per extra season"}
              </span>
            </button>
          )}

          {/* Oyuncu era performansı */}
          {stage === "done" && (
            <div className="space-y-1.5 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
              <div className="text-xs text-gray-300 uppercase tracking-widest font-semibold">Era Performance</div>
              {[...result.profiles, ...(result.benchProfiles || [])].map((pr, i) => {
                const qPct = Math.round(pr.simQuality * 100);
                return (
                  <div key={i} className={`flex items-center gap-2 ${pr.bench ? "opacity-70" : ""}`}>
                    {pr.bench && <span className="text-[9px] px-1.5 rounded-md shrink-0" style={{color:"var(--text-faint)",background:"rgba(255,255,255,.05)"}}>B</span>}
                    <span className="text-[13px] text-white flex-1 truncate">{pr.name?.split(" ").slice(-1)[0]}</span>
                    <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">{pr.minutes}m</span>
                    {pr.fatigue > 0 && <span className="text-[10px] text-red-400 shrink-0">−{Math.round(pr.fatigue*100)}% tired</span>}
                    <span className="text-[11px] text-gray-500 shrink-0">{pr.arch}</span>
                    {pr.timeless && <span className="text-[10px] font-bold text-purple-400 shrink-0" title="Timeless — era distance fully ignored">TL</span>}
                    {!pr.timeless && pr.fitShift < 0 && <span className="text-[10px] text-emerald-400 shrink-0" title="Archetype fits this era — travels one era closer">fits era</span>}
                    {pr.dist > 0 && !pr.timeless && <span className="text-[10px] text-yamabuki shrink-0">−{pr.dist} era</span>}
                    {pr.posP != null && pr.posP < 1 && <span className="text-[10px] text-red-400 shrink-0">{pr.posP <= 0.75 ? "−25% pos" : "−10% pos"}</span>}
                    <div className="g-bar-track w-20 shrink-0" style={{height:8}}>
                      <div className="h-full rounded-full" style={{ width: `${qPct}%`, background: qPct >= 70 ? "#059669" : qPct >= 50 ? "#2a3d6b" : "#7f1d1d" }} />
                    </div>
                    <span className="text-[13px] font-semibold w-6 text-right text-gray-300 shrink-0">{qPct}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sezon ödülleri + istatistikler */}
          {stage === "done" && (
            <div className="space-y-2 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
              <div className="text-[10.5px] text-gray-400 uppercase tracking-widest">Season Awards</div>
              {result.awards?.length > 0 ? (
                <div className="space-y-1">
                  {result.awards.map((a, i) => (
                    <div key={i} className="text-[11px] text-gray-200">{a}</div>
                  ))}
                </div>
              ) : (
                <div className="text-[10.5px] text-gray-600 italic">No individual hardware this season.</div>
              )}
              {result.statLines?.length > 0 && (() => {
                const COLS = "grid-cols-[1fr_2.2rem_2.2rem_2.2rem_2.2rem_2.2rem_2.4rem]";
                const tot = k => +result.statLines.reduce((a, l) => a + (l[k] || 0), 0).toFixed(1);
                const fg3s = result.statLines.filter(l => l.fg3 != null);
                const fg3avg = fg3s.length ? Math.round(fg3s.reduce((a, l) => a + l.fg3, 0) / fg3s.length) : null;
                return (
                  <div className="mt-1.5">
                    <div className={`grid ${COLS} gap-x-1 text-[8.5px] text-gray-500 uppercase tracking-wider pb-1`}>
                      <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">STL</span><span className="text-right">BLK</span><span className="text-right">3P%</span>
                    </div>
                    {result.statLines.map((l, i) => (
                      <div key={i} className={`grid ${COLS} gap-x-1 text-[10px] leading-relaxed ${l.bench ? "text-gray-500" : "text-gray-300"}`}>
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
                    <div className={`grid ${COLS} gap-x-1 text-[10px] font-bold text-white mt-1 pt-1 border-t border-white/10`}>
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

          {/* Game Log — Rewrite History'ye özel: gerçek takvimin 82 (ya da
              kısaltılmış sezonda daha az) maçının rakip/skor/sonucu (bkz. plan). */}
          {stage === "done" && result.gameSchedule?.length > 0 && (
            <div className="space-y-1.5 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
              <div className="text-[10.5px] text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <DnaIcon size={11} /> Game Log — {result.realTeam} · {result.realSeason}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
                {result.gameSchedule.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md text-[10.5px]"
                    style={{background: i % 2 === 0 ? "rgba(255,255,255,.02)" : "transparent"}}>
                    <span className="w-5 text-gray-600 tabular-nums shrink-0">{g.gameNum}</span>
                    <span className="w-8 text-gray-500 shrink-0">{g.isHome ? "vs" : "@"}</span>
                    <span className="flex-1 text-gray-300 truncate">{g.opponent}</span>
                    <span className="text-gray-600 tabular-nums shrink-0">{g.realTeamPts}-{g.realOppPts}</span>
                    <span className={`w-4 text-right font-bold shrink-0 ${g.won ? "text-emerald-400" : "text-red-400"}`}>
                      {g.won ? "W" : "L"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aktif tag etkileri */}
          {stage === "done" && result.tagNotes?.length > 0 && (
            <div className="space-y-1 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
              <div className="text-[10.5px] text-gray-400 uppercase tracking-widest">Active Tag Effects</div>
              {result.tagNotes.map((n, i) => (
                <div key={i} className="text-[10.5px] text-gray-400">• {n}</div>
              ))}
            </div>
          )}

          {/* Run it back */}
          {stage === "done" && (
            <button onClick={run}
              className="aura-pill-btn w-full justify-center" style={{padding:"9px"}}>
              <span className="inline-flex items-center gap-1.5"><LoopIcon size={14} /> Run It Back</span>
              <span className="text-[9.5px] text-gray-600 ml-1.5">(fresh dynasty — only your first counts for the board)</span>
            </button>
          )}
        </div>
        );
      })()}
    </div>
  );
}
