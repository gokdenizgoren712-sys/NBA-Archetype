// ── Sezon simülasyonu paneli (v3.5 Faz 1 → v3.6 Faz D+E) ─────────────────────
// Rotasyon/dakika editörü, maç maç akan sezon, playoff bracket'i,
// dynasty modu: şampiyonluğu savun → back-to-back → THREEPEAT.

import { useState, useRef, useEffect } from "react";
import { simulateSeason, computeLeagueAwards, BASE_MINUTES, MINUTE_FLEX, agePenaltyFor } from "./seasonSim";
import { buildLeague } from "./leagueSim";
import { buildConferenceStandings, initBracket, computeUserPlayoffStatLines, deriveRhResultKey } from "./playoffBracket";
import PlayoffBracket from "./PlayoffBracketView";
import { useAuth } from "../contexts/AuthContext";
import { CoachIcon, TrophyIcon, CrownIcon, PlayIcon, LoopIcon, DnaIcon, WheelIcon } from "./GameIcons";
import "./game.css";

const MONTHS = ["OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR"];

// "Üst seviye simülasyon" şablonu (2026-08) — Rewrite History modundayken
// panelin TAMAMI (idle→running→done) bu altın kimliğe bürünür, sadece
// pre-sim banner'da değil (bkz. plan: docs/plans/fancy-cooking-gizmo.md).
const RH_ACCENT_STYLE = { "--accent": "#FFB11B", "--accent-a": "rgba(255,177,27,.10)", "--accent-line": "rgba(255,177,27,.35)" };

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

export default function SeasonSimPanel({
  players, simEra, fit, affinity01, bench = [], coach = null, gameScoreId = null, enableRealHistory = false,
  // Board Challenge bonus koşusu (bkz. WithAFriendGame.jsx BonusHistoryPanel):
  // fixedSeason doluysa sezon adımı hiç gösterilmez, mod her zaman "history"
  // kilitlenir, excludeTeam takım listesinden çıkarılır (aynı sezonda iki
  // kadro aynı gerçek takımın yerine geçemez), noSave true'ysa hiçbir sonuç
  // leaderboard'a yazılmaz (bu koşu 7 maçlık seriden tamamen ayrı bir ekstra).
  fixedSeason = null, excludeTeam = null, noSave = false,
}) {
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

  // "Tam lig" (bkz. leagueSim.js buildLeague) — Rewrite History'de Simulate
  // Season'a basılınca ÖNCE diğer 29 gerçek takımın roster-bazlı reytingi/
  // sezonu kuruluyor, SONRA kullanıcının kendi sezonu o reytinglerle koşuyor.
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [league, setLeague] = useState(null);   // {teamRatings, teamSeasons, rosterByAbbr}
  // Ligin çoğu takımı fetch/rate-limit hatasıyla sessizce eksik kurulduysa
  // (bkz. leagueSim.js fetchJson notu) kullanıcıya bozuk bir "lig" göstermek
  // yerine bunu açıkça söyle.
  const [leagueWarning, setLeagueWarning] = useState(null);
  // Faz C: gerçek playoff bracket'i — "Simulate Playoffs" tıklanınca kurulur.
  const [bracket, setBracket] = useState(null);
  // Rewrite History'de dynasty/"Defend the Title" artık BU sezonun GERÇEK
  // bracket'inin sonucuna bağlı — eskiden simulateSeason'ın İÇİNDEKİ sentetik
  // playoff'un result.champion'ına bağlıydı, bu da (a) "Defend the Title"nın
  // kullanıcı gerçek bracket'i HENÜZ BİTİRMEDEN görünmesine (b) gerçekten
  // şampiyon olunan bir sezonda THREEPEAT'e izin vermemesine yol açıyordu
  // (iki ayrı kullanıcı raporu, 2026-08). run()/defend() başında false'a
  // döner (yeni sezon = henüz kazanılmamış), bracket.champion kullanıcının
  // takımıyla eşleşince true olur (aşağıdaki effect).
  const [rhTitleWon, setRhTitleWon] = useState(false);
  // Faz D: "Season Awards" tablosunda Regular Season/Playoffs toggle.
  const [statView, setStatView] = useState("regular");   // "regular" | "playoffs"

  // "Rewrite History" (bkz. plan: docs/plans/fancy-cooking-gizmo.md) — Single
  // Player'a özel, opt-in. simMode="quick" bugünkü davranış, "history" gerçek
  // sezon+takım seçimi açar.
  const [simMode, setSimMode]   = useState(fixedSeason ? "history" : "quick");   // "quick" | "history"
  const [rhStep, setRhStep]     = useState(fixedSeason ? "team" : "season");   // season | team | ready
  const [rhSeasons]             = useState(() => seasonsInEra(simEra));
  const [rhSeason, setRhSeason] = useState(fixedSeason || null);
  const [rhTeams, setRhTeams]   = useState([]);
  const [rhTeam, setRhTeam]     = useState(null);
  const [rhSchedule, setRhSchedule] = useState(null);
  const [rhLoading, setRhLoading]   = useState(false);
  const [rhError, setRhError]       = useState("");
  const visibleRhTeams = excludeTeam ? rhTeams.filter(t => t.abbr !== excludeTeam) : rhTeams;

  // fixedSeason'da sezon adımı hiç gösterilmiyor — takım listesini doğrudan
  // mount'ta çek (bkz. yukarıdaki pickRhSeason ile aynı istek, tek fark
  // burada kullanıcı tıklaması beklenmiyor).
  useEffect(() => {
    if (!fixedSeason) return;
    setRhLoading(true);
    fetch(`/api/historical/${fixedSeason}/teams`).then(r => r.json())
      .then(d => setRhTeams(d.teams || []))
      .catch(() => setRhError("Could not load teams for this season."))
      .finally(() => setRhLoading(false));
  }, [fixedSeason]);

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

  // Gerçek bracket'in kendi kendine "kim şampiyon" karar verdiği tek yer —
  // dynasty/Defend the Title BUNU izler (bkz. yukarıdaki rhTitleWon notu).
  useEffect(() => {
    if (bracket?.champion && rhSchedule && bracket.champion.abbr === rhSchedule.team) {
      setRhTitleWon(true);
    }
  }, [bracket?.champion, rhSchedule]);

  // 2026-08 denetimi: leaderboard'a yazılan season_result RH'de hâlâ
  // seasonSim.js'in İÇ sentetik playoff'undan geliyordu (bkz. run()'daki
  // postResult çağrısı notu) — gerçek bracket'in kaderi burada belli olunca
  // (deriveRhResultKey null DEĞİL döndüğünde) DOĞRU değeri postluyoruz.
  // Sadece 1. sezon (dynasty.year===1) — 2+ sezonlarda REPEAT/THREEPEAT
  // zaten kendi postResult'ını yapıyor (bkz. defend()), bir kayıp o satırı
  // ezmemeli (şampiyonluk geçmişi kaybolmasın).
  const postedRhResultRef = useRef(false);
  useEffect(() => {
    if (simMode !== "history" || !bracket || dynasty.year !== 1 || postedRhResultRef.current) return;
    const key = deriveRhResultKey(bracket, rhSchedule?.team);
    if (!key) return;
    postedRhResultRef.current = true;
    if (isLoggedIn && token && !noSave && result) postResult(result, key);
  }, [bracket, rhSchedule, simMode, dynasty.year, isLoggedIn, token, noSave, result]);

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
      body: JSON.stringify({
        wins: res.wins, season_result: resultKey, sim_era: simEra.id, game_id: gameScoreId,
        real_season: res.realSeason || null, real_team: res.realTeam || null,
      }),
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
  // ev-deplasman/maç-maç box score yoluna geçer (bkz. plan). "Tam lig" modu:
  // önce diğer 29 gerçek takımın roster-bazlı reytingi kuruluyor (buildLeague),
  // sonra o reytingler extras.teamRatings olarak kullanıcının kendi
  // simulateSeason çağrısına geçiyor — rakip gücü artık win_pct-proxy değil.
  const run = async () => {
    setBracket(null);
    setLeagueWarning(null);
    postedRhResultRef.current = false;   // yeni dynasty — gerçek sonuç henüz postlanmadı
    const extras = { bench, coach, minutes };
    if (simMode === "history" && rhSchedule) {
      extras.realSchedule = rhSchedule;
      setLeagueLoading(true);
      try {
        const built = await buildLeague(rhSchedule.season, rhSchedule.team, simEra);
        setLeague(built);
        extras.teamRatings = built.teamRatings;
        // Retry sonrası hâlâ takımların %70'inden azı kurulduysa (kalıcı ağ/
        // rate-limit sorunu), sessizce bozuk bir lig göstermek yerine söyle —
        // standings/League Awards/bracket hepsi bu veriye dayanıyor.
        if (built.teamsBuilt < built.teamsExpected * 0.7) {
          setLeagueWarning(`Only ${built.teamsBuilt} of ${built.teamsExpected} teams built successfully — the league, awards, and playoff bracket below may be incomplete. Try "Run It Back" to rebuild.`);
        }
      } catch {
        setLeagueWarning("Couldn't build the rest of the league (network error) — opponent strength fell back to the old win-rate estimate, and the league/playoff sections below won't appear. Try again.");
      } finally {
        setLeagueLoading(false);
      }
    }
    const res = simulateSeason(players, simEra, fit, affinity01, extras);
    const isFirst = runCount === 0;
    setRunCount(c => c + 1);
    setRhTitleWon(false);   // yeni sezon — gerçek bracket henüz kazanılmadı
    // RH'de "şampiyon musun" artık SADECE gerçek bracket'ten gelir (bkz.
    // yukarıdaki rhTitleWon notu) — regular season biter bitmez sentetik
    // result.champion'a bakıp 0/1 title vermek, kullanıcı gerçek bracket'i
    // oynamadan/kaybederken bile "şampiyon" sayabiliyordu. Quick Sim eski
    // davranışını (sentetik result.champion) korur.
    setDynasty({ year: 1, titles: simMode === "history" ? 0 : (res.champion ? 1 : 0) });
    animate(res);
    // RH'de res.resultKey (CHAMPION/FINALS/CF/SEMI/R1) İÇ sentetik Quick-Sim
    // playoff'undan geliyor — kullanıcı gerçek bracket'i hiç oynamadan/
    // kaybederken bile leaderboard'da sahte bir sonuç görünebiliyordu (2026-08
    // denetimi). Playoff'a kalmadıysa (madePlayoffs gerçek galibiyet sayısına
    // dayanıyor, sentetik değil) bu KESİN ve doğru — hemen postla. Kaldıysa
    // gerçek sonuç henüz bilinmiyor; yukarıdaki deriveRhResultKey efekti
    // gerçek bracket kararını verince postlar (backend'de "TBD" durumu yok,
    // o yüzden burada hiç göndermemek satırın mevcut durumunu korur).
    if (isFirst && isLoggedIn && token && !noSave) {
      if (simMode === "history") {
        if (!res.madePlayoffs) postResult(res, "MISSED");
      } else {
        postResult(res, res.resultKey);
      }
    }
  };

  // Faz E: şampiyonluğu savun — kadro her sezon yaşlanır (S6: hızlanan eğri, agePenaltyFor).
  // Rewrite History'de bu ARTIK bir sonraki GERÇEK sezona ilerliyor (aynı era
  // içinde) — kadron yaşlanırken lig de o yeni sezonun gerçek 30 takımıyla
  // yeniden kuruluyor (buildLeague tekrar çalışır). Era'da bir sonraki sezon
  // yoksa (veya o sezonun verisi yoksa/takım o sezon farklı bir kısaltmayla
  // oynuyorsa) sessizce eski senkron-dışı moda düşmek YERİNE aynı sezonu
  // (yaşlanmış kadronla) tekrar oynatır ve bunu açıkça söyler.
  const defend = async () => {
    setBracket(null);
    setLeagueWarning(null);
    const nextYear = dynasty.year + 1;
    const extras = { bench, coach, minutes, agePenalty: agePenaltyFor(nextYear) };
    if (simMode === "history" && rhSchedule) {
      const idx = rhSeasons.indexOf(rhSchedule.season);
      const nextSeason = idx >= 0 && idx < rhSeasons.length - 1 ? rhSeasons[idx + 1] : null;
      const targetSeason = nextSeason || rhSchedule.season;
      setLeagueLoading(true);
      try {
        const sched = await fetch(`/api/historical/${targetSeason}/team/${rhSchedule.team}/schedule`).then(r => r.json());
        if (!sched?.games?.length) throw new Error("no schedule for target season");
        const built = await buildLeague(targetSeason, rhSchedule.team, simEra);
        setLeague(built);
        setRhSchedule(sched);
        extras.realSchedule = sched;
        extras.teamRatings = built.teamRatings;
        if (built.teamsBuilt < built.teamsExpected * 0.7) {
          setLeagueWarning(`Only ${built.teamsBuilt} of ${built.teamsExpected} teams built successfully for ${targetSeason} — the league/bracket below may be incomplete.`);
        } else if (!nextSeason) {
          setLeagueWarning(`No more real ${simEra.label} seasons after this one — replaying ${targetSeason} with your aged roster.`);
        }
      } catch {
        setLeagueWarning(`Couldn't advance to a new real season — replayed ${rhSchedule.season} again instead.`);
        extras.realSchedule = rhSchedule;
        if (league?.teamRatings) extras.teamRatings = league.teamRatings;
      } finally {
        setLeagueLoading(false);
      }
    }
    const res = simulateSeason(players, simEra, fit, affinity01, extras);
    // defend() RH modda SADECE rhTitleWon===true iken tetiklenebiliyor
    // (bkz. buton gating aşağıda) — ama yine de burada AÇIKÇA hangi sinyali
    // kullandığımızı belirtelim (Quick Sim hâlâ sentetik result.champion'a
    // bakar, RH artık BU sezonun (defend'e girmeden ÖNCEki) gerçek
    // bracket sonucuna bakar).
    const wonThisSeason = simMode === "history" ? rhTitleWon : !!res.champion;
    const newTitles = wonThisSeason ? dynasty.titles + 1 : dynasty.titles;
    setRhTitleWon(false);   // yeni sezon başlıyor — bir sonraki gerçek bracket henüz kazanılmadı
    setDynasty({ year: nextYear, titles: newTitles, ended: !wonThisSeason });
    animate(res, () => {
      // İlk dynasty koşusunda repeat/threepeat leaderboard'a yükseltilir
      if (runCount === 1 && isLoggedIn && token && !noSave && wonThisSeason) {
        if (newTitles >= 3)      postResult(res, "THREEPEAT");
        else if (newTitles === 2) postResult(res, "REPEAT");
      }
    });
  };

  const shownLog   = result ? result.gameLog.slice(0, revealGames) : [];
  const shownWins  = shownLog.filter(Boolean).length;
  const shownLosses = shownLog.length - shownWins;
  const month = MONTHS[Math.min(6, Math.floor(revealGames / 12))];

  // Rewrite History kalıcı kimliği — simMode değişmeden run/defend arasında
  // sabit kalır (mid-run mode-switch UI yok), bu yüzden tüm aşamalarda
  // (idle/regular/playoffs/done) tek, tutarlı bir bayrak olarak kullanılabilir.
  const rhActive = simMode === "history";
  // Canlı reveal sırasında gerçek takımın O ANA KADAR ki galibiyet/mağlubiyeti —
  // yeni fetch yok, result.gameSchedule zaten her maçın gerçek skorunu taşıyor.
  const shownReal = result?.gameSchedule ? result.gameSchedule.slice(0, revealGames) : [];
  const shownRealWins = shownReal.filter(g => g.realTeamPts > g.realOppPts).length;
  const shownRealLosses = shownReal.length - shownRealWins;

  return (
    <div className="g-panel p-4 space-y-3" style={rhActive ? RH_ACCENT_STYLE : undefined}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-gray-400 uppercase tracking-widest flex items-center gap-1">
          {rhActive ? (
            <span className="inline-flex items-center gap-1.5" style={{color:"var(--yamabuki)"}}>
              <DnaIcon size={12} />
              <span className="font-bold">Rewrite History{rhSchedule ? `: ${rhSchedule.team} · ${rhSchedule.season}` : ""}</span>
            </span>
          ) : (
            <span>Season Simulation</span>
          )}
          {stage!=="idle"&&dynasty.year>1&&<span className="text-gray-500 normal-case">· Year {dynasty.year}</span>}
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
          {enableRealHistory && !fixedSeason && (
            <div className="flex gap-1.5 p-1 rounded-lg" style={{background:"var(--bg-surface)",border:"1px solid var(--border)"}}>
              <button onClick={()=>setSimMode("quick")} disabled={leagueLoading}
                className="flex-1 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                style={{background:simMode==="quick"?"var(--bg-elevated)":"transparent",color:simMode==="quick"?"var(--text-primary)":"var(--text-faint)"}}>
                <WheelIcon size={12} /> <span className="ml-1">Quick Sim</span>
              </button>
              <button onClick={()=>setSimMode("history")} disabled={leagueLoading}
                className="flex-1 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide transition-colors disabled:opacity-40"
                style={{background:simMode==="history"?"rgba(255,177,27,.16)":"transparent",color:simMode==="history"?"var(--yamabuki)":"var(--text-faint)"}}>
                <DnaIcon size={12} /> <span className="ml-1">Rewrite History</span>
              </button>
            </div>
          )}

          {simMode === "history" && rhStep !== "ready" ? (
            <div className="space-y-2.5">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {fixedSeason
                  ? <>Pick the {fixedSeason} team your draft replaces{excludeTeam ? <> (any team but the <span className="text-yamabuki font-medium">{excludeTeam}</span> you're facing)</> : null} —
                      you'll play their exact schedule, real opponents and all.</>
                  : <>Step into a real {simEra.label} season. Pick the year, then the team your draft replaces —
                      you'll play their exact 82-game schedule, real opponents and all.</>}
              </p>
              {rhError && <p className="text-[11px] text-red-400">{rhError}</p>}

              {rhStep === "season" && (
                <div className="grid grid-cols-3 gap-1.5">
                  {rhSeasons.map(s => (
                    <button key={s} onClick={()=>pickRhSeason(s)} disabled={rhLoading || leagueLoading}
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
                  {!fixedSeason && (
                    <button onClick={()=>{setRhStep("season"); setRhTeam(null);}} disabled={leagueLoading}
                      className="text-[10.5px] disabled:opacity-40" style={{color:"var(--text-muted)"}}>← Back to seasons</button>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {visibleRhTeams.map(t => (
                      <button key={t.abbr} onClick={()=>pickRhTeam(t.abbr)} disabled={rhLoading || leagueLoading}
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
              <button onClick={()=>{setRhStep("team");}} disabled={leagueLoading}
                className="text-[10.5px] disabled:opacity-40" style={{color:"var(--text-muted)"}}>Change</button>
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
            disabled={(simMode==="history" && !rhSchedule) || leagueLoading}
            className={`w-full py-3 text-white rounded-xl font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-40 ${
              simMode==="history" ? "" : "bg-emerald-700 hover:bg-emerald-600"}`}
            style={simMode==="history" ? {background:"linear-gradient(90deg,#FFD470,#FFB11B)",color:"#000"} : undefined}>
            {leagueLoading ? (
              <><span className="inline-block animate-spin"><WheelIcon size={16} /></span> Building the league…</>
            ) : simMode==="history" ? (
              <><DnaIcon size={16} /> {rhSchedule ? `Simulate the ${rhSchedule.team}'s Season` : "Simulate Season"}</>
            ) : (
              <><PlayIcon size={16} /> Simulate Season</>
            )}
          </button>
          {leagueLoading && (
            <p className="text-[10.5px] text-center" style={{color:"var(--text-muted)"}}>
              Scoring the other 29 rosters through the same engine — this is what makes it real.
            </p>
          )}
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
        // RH'de result.seed her zaman seasonSim.js'in İÇ senkron (82-maçlık
        // eşik tablosuna göre) tahmini — gerçek bracket'in konferans
        // sıralamasından türeyen seed'le ÇAKIŞMAYABİLİR (bkz. 2026-08 denetimi:
        // testte "#2 seed" başlığı, gerçek Western Conference tablosunda "#3"
        // çıkmıştı). RH'de lig kurulduysa gerçek standings'ten türeyen seed'i
        // göster; kurulmadıysa hiç seed gösterme (yanlış bir sayı vermektense).
        const displaySeed = rhActive
          ? (league && league.teamsBuilt >= 20 && rhSchedule
              ? (() => {
                  const st = buildConferenceStandings(league.teamSeasons, rhSchedule.team, result.wins, result.losses);
                  return [...st.East, ...st.West].find(e => e.isUser)?.seed ?? null;
                })()
              : null)
          : result.seed;
        return (
        <div className="space-y-3">
          {/* Running record */}
          <div className="text-center">
            <div className="text-[10.5px] text-gray-400 uppercase tracking-widest mb-1">
              {revealGames < nGames ? `Regular Season · ${month}` : `Final Record${displaySeed ? ` · #${displaySeed} seed` : ""}`}
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
            {result.gameSchedule?.length > 0 && revealGames > 0 && revealGames < nGames && (
              <div className="text-[10.5px] mt-1" style={{color:"var(--text-muted)"}}>
                Real {result.realTeam} at this point: <span className="text-gray-300 font-semibold tabular-nums">{shownRealWins}–{shownRealLosses}</span>
                {" · "}You: <span className="font-semibold tabular-nums" style={{color:"var(--yamabuki)"}}>{shownWins}–{shownLosses}</span>
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

          {/* Playoff bracket — tur tur. Bu SENTETİK ladder (result.playoffRounds,
              "vs 73-rated" gibi kimliksiz rakipler) — Rewrite History'de HİÇ
              gösterilmesin (ne reveal sırasında ne "done"da): playofflar
              artık SADECE "Simulate Playoffs" tıklanınca, GERÇEK bracket
              üzerinden oynanıyor. animate()'in playoffs-reveal zamanlayıcısı
              hâlâ arka planda çalışır (stage sonunda "done"a döner), sadece
              bu blok görünmez olur. Quick Sim'de hiç değişmedi — o modun TEK
              playoff gösterimi hâlâ bu. */}
          {!rhActive && result.madePlayoffs && (stage === "playoffs" || stage === "done") && (
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

          {/* Final banner — dynasty farkındalıklı (Faz E). Rewrite History'de
              result.champion/resultLabel SENTETİK playoff'tan geliyor — o
              artık HİÇ oynanmıyor/gösterilmiyor (bkz. yukarıdaki not), o
              yüzden "NBA CHAMPIONS"/"Lost in the X Round" gibi SOMUT bir
              tur iddiası göstermek gerçek bracket'le (aşağıda, Simulate
              Playoffs) çelişebiliyordu — RH'de nötr bir "Regular Season
              Complete" başlığına düşer, gerçek playoff sonucu SADECE
              aşağıdaki gerçek bracket'ten gelir. Dynasty/puan/THREEPEAT
              mekaniği (leaderboard skorlaması) altyapıda AYNEN çalışmaya
              devam ediyor — sadece YANILTICI görünür metin kaldırıldı. */}
          {stage === "done" && (
            <div className={`text-center py-3 rounded-xl border ${
              !rhActive && dynasty.titles >= 3
                ? "border-yamabuki bg-gradient-to-b from-yamabuki/60 to-yamabuki/40 shadow-[0_0_24px_rgba(250,204,21,.25)]"
                : !rhActive && result.champion
                ? "border-yamabuki/60 bg-gradient-to-b from-yamabuki/40 to-yamabuki/30"
                : "border-white/10 bg-white/[.03]"}`}>
              <div className={`font-black inline-flex items-center gap-1.5 ${!rhActive && dynasty.titles>=3?"text-2xl text-yamabuki":!rhActive && result.champion?"text-lg text-yamabuki":"text-lg text-gray-300"}`}>
                {rhActive ? "REGULAR SEASON COMPLETE"
                  : dynasty.titles >= 3 ? <><CrownIcon size={24} /> THREEPEAT — DYNASTY COMPLETE</>
                  : result.champion && dynasty.titles === 2 ? <><TrophyIcon size={18} /><TrophyIcon size={18} /> BACK-TO-BACK CHAMPIONS</>
                  : result.champion ? <><TrophyIcon size={18} /> NBA CHAMPIONS</>
                  : result.resultLabel}
              </div>
              {!rhActive && dynasty.ended && dynasty.titles > 0 && !result.champion && (
                <div className="text-[11px] text-yamabuki/90 mt-1">
                  Dynasty over — {dynasty.titles} straight title{dynasty.titles>1?"s":""}. The league caught up.
                </div>
              )}
              <div className="text-[10.5px] text-gray-500 mt-1">
                {rhActive ? (
                  <>{result.wins}–{result.losses} · the real bracket below decides the playoffs</>
                ) : (
                  <>Season {dynasty.year} · Score: <span className="text-white font-bold">{result.seasonScore}</span>
                    <span className="text-gray-600"> — {result.wins} wins{result.playoffGameWins > 0 ? ` + ${result.playoffGameWins} playoff wins` : ""}{result.champion ? " + championship bonus" : ""}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Lig kurulumu eksik/başarısız kaldıysa (bkz. leagueSim.js fetchJson notu) —
              stage her zaman görünür, league null bile olsa (o zaman League bloğu hiç
              render olmaz, uyarı TEK görsel ipucu olur). */}
          {stage === "done" && leagueWarning && (
            <div className="rounded-xl p-3 text-[11px] leading-relaxed" style={{background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.3)",color:"#fca5a5"}}>
              {leagueWarning}
            </div>
          )}

          {/* Verdict — nihai rekor, gerçek takımın gerçek sezonuyla karşılaştırılır
              (2026-08 "üst seviye simülasyon" şablonu). Yeni fetch yok:
              result.gameSchedule'daki gerçek skorlardan türetilir. */}
          {stage === "done" && result.gameSchedule?.length > 0 && (() => {
            const realWins = result.gameSchedule.filter(g => g.realTeamPts > g.realOppPts).length;
            const realLosses = result.gameSchedule.length - realWins;
            const delta = result.wins - realWins;
            const verdictColor = delta > 0 ? "#34d399" : delta < 0 ? "#f87171" : "var(--yamabuki)";
            const verdictWord = delta > 0 ? "You improved history" : delta < 0 ? "History took a hit" : "Exactly as it happened";
            return (
              <div className="rounded-xl p-3.5" style={{background:"rgba(255,177,27,.06)", border:"1px solid rgba(255,177,27,.28)"}}>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{color:"var(--yamabuki)"}}>Verdict</div>
                <div className="text-[13px] text-gray-200 leading-relaxed">
                  <span className="font-black" style={{color: verdictColor}}>{verdictWord}</span> — you finished{" "}
                  <span className="font-bold text-white tabular-nums">{result.wins}–{result.losses}</span>, the real {result.realTeam} went{" "}
                  <span className="font-bold text-white tabular-nums">{realWins}–{realLosses}</span>
                  {delta !== 0 && <> (<span style={{color: verdictColor}} className="font-semibold">{delta > 0 ? "+" : ""}{delta} game{Math.abs(delta) === 1 ? "" : "s"}</span>)</>}.
                </div>
                {rhSchedule?.league_rank && (
                  <div className="text-[10.5px] text-gray-500 mt-1">
                    Real record: #{rhSchedule.league_rank} of {rhSchedule.league_size} in the league that season.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Game Log — Rewrite History'ye özel: gerçek takvimin 82 (ya da
              kısaltılmış sezonda daha az) maçının rakip/skor/sonucu. Verdict'in
              hemen altına taşındı (2026-08) — Quick Sim'de olmayan tek içerik,
              en görünür yerde olmalı (önceden ödül/istatistik bloklarından
              sonra, en altta gömülüydü). */}
          {stage === "done" && result.gameSchedule?.length > 0 && (
            <div className="space-y-1.5">
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

          {/* Faz B: East/West sıralaması + organik lig ödülleri — "tam lig"
              (bkz. leagueSim.js) kurulduysa görünür. 29 gerçek takımın KENDİ
              roster-bazlı simüle sezonu + kullanıcının kendi sonucu birlikte
              gerçek bir alternatif-tarih ligi oluşturuyor. */}
          {stage === "done" && league && rhSchedule && league.teamsBuilt >= 20 && (() => {
            const standings = buildConferenceStandings(league.teamSeasons, rhSchedule.team, result.wins, result.losses);
            const allTeams = [
              { abbr: rhSchedule.team, players, bench, statLines: result.statLines, wins: result.wins },
              ...Object.entries(league.teamSeasons).map(([abbr, season]) => ({
                abbr, players: league.rosterByAbbr[abbr]?.starters, bench: league.rosterByAbbr[abbr]?.bench,
                statLines: season.statLines, wins: season.wins,
              })),
            ];
            const leagueAwards = computeLeagueAwards(allTeams);
            const ConfTable = ({ label, teams }) => (
              <div className="flex-1 min-w-0">
                <div className="text-[9.5px] uppercase tracking-widest mb-1" style={{color:"var(--text-muted)"}}>{label}</div>
                <div className="space-y-0.5">
                  {teams.map(t => (
                    <div key={t.abbr} className={`flex items-center gap-2 px-1.5 py-0.5 rounded text-[10.5px] ${t.isUser ? "font-bold" : ""}`}
                      style={t.isUser ? {background:"rgba(255,177,27,.14)", color:"var(--yamabuki)"} : {color:"var(--text-secondary,#d1d5db)"}}>
                      <span className="w-4 text-right tabular-nums shrink-0" style={{color:"var(--text-faint)"}}>{t.seed}</span>
                      <span className="flex-1 truncate">{t.abbr}</span>
                      <span className="tabular-nums shrink-0">{t.wins}-{t.losses}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
            return (
              <div className="space-y-3 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <div className="text-xs text-gray-300 uppercase tracking-widest font-semibold">
                  The League — {rhSchedule.season}
                </div>
                <p className="text-[10.5px] leading-relaxed" style={{color:"var(--text-muted)"}}>
                  All 30 teams, simulated the same way your roster was — every real player scored through the same engine.
                </p>
                <div className="flex gap-4">
                  <ConfTable label="Eastern Conference" teams={standings.East} />
                  <ConfTable label="Western Conference" teams={standings.West} />
                </div>
                <div className="space-y-1">
                  <div className="text-[9.5px] uppercase tracking-widest" style={{color:"var(--text-muted)"}}>League Awards</div>
                  {leagueAwards.map((a, i) => (
                    <div key={i} className="text-[11px] text-gray-200">
                      {a.icon} {a.label} — {a.name} <span style={{color:"var(--text-faint)"}}>({a.team})</span>
                    </div>
                  ))}
                </div>

                {/* Faz C: gerçek playoff bracket'i — sadece playoff'a kalan
                    takımlar için (kullanıcının kendi playoff kalifikasyonuna
                    bakılmaksızın ligin geneli oynanabilir). */}
                {!bracket ? (
                  <button
                    disabled={leagueLoading}
                    title={leagueLoading ? "Advancing to the next season — wait for it to finish first" : undefined}
                    onClick={() => {
                      // Faz D: playoff box-score + organik MVP için roster/profile bilgisi
                      // (bkz. playoffBracket.js rosterOf/accumulateBoxScores).
                      const rosterInfo = {};
                      for (const [abbr, r] of Object.entries(league.rosterByAbbr)) {
                        rosterInfo[abbr] = { players: r.starters, bench: r.bench,
                          profiles: league.teamSeasons[abbr]?.profiles, benchProfiles: league.teamSeasons[abbr]?.benchProfiles };
                      }
                      const userRoster = { players, bench, profiles: result.profiles, benchProfiles: result.benchProfiles };
                      // initBracket bir konferansta çok az takım kurulduysa
                      // artık sessizce çökmek yerine açık bir Error fırlatıyor
                      // (bkz. playoffBracket.js notu) — burada yakalayıp aynı
                      // leagueWarning banner'ında göster.
                      try {
                        setBracket(initBracket(rhSchedule.season, league.teamSeasons, league.teamRatings, rhSchedule.team,
                          result.rating, result.wins, result.losses, Math.random, rosterInfo, userRoster,
                          agePenaltyFor(dynasty.year)));
                      } catch (err) {
                        setLeagueWarning(err.message);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wide inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
                    style={{background:"linear-gradient(90deg,#FFD470,#FFB11B)",color:"#000"}}>
                    <TrophyIcon size={14} /> Simulate Playoffs
                  </button>
                ) : (
                  <PlayoffBracket bracket={bracket} onUpdate={setBracket} />
                )}
              </div>
            );
          })()}

          {/* Faz E: şampiyonluğu savun — RH'de SADECE gerçek bracket'i
              kazandıysan (rhTitleWon) görünür, Quick Sim eskisi gibi
              result.champion'a bakar (bkz. yukarıdaki rhTitleWon notu). */}
          {stage === "done" && (rhActive ? rhTitleWon : result.champion) && dynasty.titles < 3 && (
            <button onClick={defend} disabled={leagueLoading}
              className="w-full py-3 rounded-xl font-bold transition-colors text-gray-900 disabled:opacity-60"
              style={{background:"linear-gradient(90deg,#FFD470,#FFB11B)"}}>
              {leagueLoading ? (
                <span className="inline-flex items-center justify-center gap-1.5"><span className="inline-block animate-spin"><WheelIcon size={16} /></span> Advancing the league…</span>
              ) : (
                <>
                  <span className="inline-flex items-center justify-center gap-1.5"><CrownIcon size={16} /> Defend the Title — Season {dynasty.year + 1}</span>
                  <span className="block text-[10px] font-medium mt-0.5 opacity-80">
                    {dynasty.titles === 2 ? "One more for the THREEPEAT" : "The roster ages: −1.2 rating per extra season"}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Sezon ödülleri + istatistikler — Faz D: bracket'te kullanıcının
              oynadığı en az bir seri varsa Regular Season/Playoffs toggle'ı
              çıkar, playoff görünümünde PTS'in yanında regular season'a göre
              delta (▲/▼) gösterilir ("kim playoffda iyileşmiş/kötüleşmiş").
              result.awards (tek-takımlık, "Season Awards") artık SADECE
              League Awards'ın kapsamadığı yerde (Quick Sim, ya da RH'de lig
              henüz kurulmamışsa) gösteriliyor — ikisi aynı bilgiyi (kendi
              oyuncuların MVP/All-NBA vs.) iki kez göstermesin diye. */}
          {stage === "done" && (() => {
            const leagueAwardsCover = rhActive && league && league.teamsBuilt >= 20;
            const playoffStatLines = bracket ? computeUserPlayoffStatLines(bracket) : [];
            const hasPlayoffStats = playoffStatLines.length > 0;
            const showingPlayoffs = statView === "playoffs" && hasPlayoffStats;
            const activeLines = showingPlayoffs ? playoffStatLines : result.statLines;
            const regByName = Object.fromEntries((result.statLines || []).map(l => [l.name, l]));
            return (
              <div className="space-y-2 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <div className="flex items-center justify-between">
                  <div className="text-[10.5px] text-gray-400 uppercase tracking-widest">{leagueAwardsCover ? "Roster Stats" : "Season Awards"}</div>
                  {hasPlayoffStats && (
                    <div className="flex gap-1 p-0.5 rounded-md" style={{background:"var(--bg-surface)",border:"1px solid var(--border)"}}>
                      <button onClick={()=>setStatView("regular")}
                        className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">
                        <span style={{color:statView==="regular"?"var(--text-primary)":"var(--text-faint)"}}>Regular Season</span>
                      </button>
                      <button onClick={()=>setStatView("playoffs")}
                        className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                        style={{background:statView==="playoffs"?"rgba(255,177,27,.16)":"transparent"}}>
                        <span style={{color:statView==="playoffs"?"var(--yamabuki)":"var(--text-faint)"}}>Playoffs</span>
                      </button>
                    </div>
                  )}
                </div>
                {!leagueAwardsCover && (result.awards?.length > 0 ? (
                  <div className="space-y-1">
                    {result.awards.map((a, i) => (
                      <div key={i} className="text-[11px] text-gray-200">{a}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10.5px] text-gray-600 italic">No individual hardware this season.</div>
                ))}
                {activeLines?.length > 0 && (() => {
                  const COLS = "grid-cols-[1fr_2.2rem_2.2rem_2.2rem_2.2rem_2.2rem_2.4rem]";
                  const tot = k => +activeLines.reduce((a, l) => a + (l[k] || 0), 0).toFixed(1);
                  const fg3s = activeLines.filter(l => l.fg3 != null);
                  const fg3avg = fg3s.length ? Math.round(fg3s.reduce((a, l) => a + l.fg3, 0) / fg3s.length) : null;
                  return (
                    <div className="mt-1.5">
                      <div className={`grid ${COLS} gap-x-1 text-[8.5px] text-gray-500 uppercase tracking-wider pb-1`}>
                        <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">STL</span><span className="text-right">BLK</span><span className="text-right">{showingPlayoffs ? "GP" : "3P%"}</span>
                      </div>
                      {activeLines.map((l, i) => {
                        const reg = showingPlayoffs ? regByName[l.name] : null;
                        const delta = reg != null ? +(l.pts - reg.pts).toFixed(1) : null;
                        return (
                          <div key={i} className={`grid ${COLS} gap-x-1 text-[10px] leading-relaxed ${l.bench ? "text-gray-500" : "text-gray-300"}`}>
                            <span className="truncate">{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
                            <span className="text-right tabular-nums">
                              {l.pts}
                              {delta != null && Math.abs(delta) >= 0.5 && (
                                <span className={delta > 0 ? "text-emerald-400" : "text-red-400"} style={{fontSize:8,marginLeft:2}}>
                                  {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
                                </span>
                              )}
                            </span>
                            <span className="text-right tabular-nums">{l.reb}</span>
                            <span className="text-right tabular-nums">{l.ast}</span>
                            <span className="text-right tabular-nums">{l.stl ?? "—"}</span>
                            <span className="text-right tabular-nums">{l.blk ?? "—"}</span>
                            <span className="text-right tabular-nums">{showingPlayoffs ? l.games : (l.fg3 != null ? `${l.fg3}%` : "—")}</span>
                          </div>
                        );
                      })}
                      {/* Takım toplamları */}
                      <div className={`grid ${COLS} gap-x-1 text-[10px] font-bold text-white mt-1 pt-1 border-t border-white/10`}>
                        <span>TEAM</span>
                        <span className="text-right tabular-nums">{tot("pts")}</span>
                        <span className="text-right tabular-nums">{tot("reb")}</span>
                        <span className="text-right tabular-nums">{tot("ast")}</span>
                        <span className="text-right tabular-nums">{tot("stl")}</span>
                        <span className="text-right tabular-nums">{tot("blk")}</span>
                        <span className="text-right tabular-nums">{showingPlayoffs ? "" : (fg3avg != null ? `${fg3avg}%` : "—")}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Aktif tag etkileri */}
          {stage === "done" && result.tagNotes?.length > 0 && (
            <div className="space-y-1 pt-2.5" style={{borderTop:"1px solid rgba(255,255,255,.07)"}}>
              <div className="text-[10.5px] text-gray-400 uppercase tracking-widest">Active Tag Effects</div>
              {result.tagNotes.map((n, i) => (
                <div key={i} className="text-[10.5px] text-gray-400">• {n}</div>
              ))}
            </div>
          )}

          {/* Run it back — leagueLoading ile kilitli: "Defend the Title"
              (defend()) hâlâ kendi lig kurulumunu beklerken stage "done"da
              kalıyor, bu buton o pencerede de tıklanabilir kalırsa run()
              ile defend() AYNI state'i (league/bracket/dynasty/rhTitleWon)
              eşzamanlı yazar — hangisi geç biterse o kazanır, tutarsız bir
              karışım kalır (2026-08 denetimi). Diğer iki aksiyon butonu
              zaten aynı kilidi kullanıyor, bu üçüncüsü unutulmuştu. */}
          {stage === "done" && (
            <button onClick={run} disabled={leagueLoading}
              className="aura-pill-btn w-full justify-center disabled:opacity-40" style={{padding:"9px"}}>
              <span className="inline-flex items-center gap-1.5"><LoopIcon size={14} /> Run It Back</span>
              <span className="text-[9.5px] text-gray-600 ml-1.5">
                {noSave ? "(fresh dynasty — just for fun, nothing is saved)" : "(fresh dynasty — only your first counts for the board)"}
              </span>
            </button>
          )}
        </div>
        );
      })()}
    </div>
  );
}
