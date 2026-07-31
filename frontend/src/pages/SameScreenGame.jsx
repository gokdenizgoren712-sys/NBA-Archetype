import { useState, useEffect, useRef, useCallback } from "react";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB } from "../game/eras";
import { COACHES } from "../game/coaches";
import { getPlayerTags } from "../game/awards";
import {
  POSITIONS, BENCH_SLOTS, ALL_SLOTS, getPrimaryPos, getEligiblePos, posPenaltyFor, isFlex, POS_COLORS,
} from "../game/positions";
import { START_BUDGET, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "../game/salary";
import { computeLineupFit } from "../game/lineupScore";
import { buildMatchup, simulateOneGame } from "../game/headToHead";
import SpinWheel from "../game/SpinWheel";
import LineupSlot from "../game/LineupSlot";
import PlayerRow, { posGroupOf } from "../game/PlayerRow";
import JokerBtn from "../game/JokerBtn";
import HowItWorksPanel from "../game/HowItWorksPanel";
import MechanicsPanel from "../game/MechanicsPanel";
import WheelModePicker from "../game/WheelModePicker";
import GameBox from "../game/GameBox";
import CounterJokerPrompt from "../game/CounterJokerPrompt";
import HowToPlayModal from "../game/HowToPlayModal";
import BenchCoverage from "../game/BenchCoverage";
import PlayerDetailModal from "../game/PlayerDetailModal";
import {
  StarIcon, CoachIcon, TrophyIcon, WheelIcon, CapIcon, RefreshIcon,
  CalendarIcon, BoltIcon, UsersIcon, SearchIcon, WarnIcon, DiceIcon, PlayIcon,
  TargetIcon, EyeIcon,
} from "../game/GameIcons";

const EMPTY_LINEUP = { PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null, B4: null };
const EMPTY_JOKERS = {
  reTeam: true, reYear: true, reBoth: true, double: true, discover: true,
  ban: true, forceTeam: true, forceYear: true,
};
const other = (seat) => (seat === 1 ? 2 : 1);

const SORT_KEYS = [
  ["TAGGED", "TAGGED"], ["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"],
  ["FG3_PCT", "3P%"], ["STL", "STL"], ["BLK", "BLK"],
];

// Same Screen HER ZAMAN Salary Cap kuralıyla oynanır (Classic yok).
function capFor(lineup) {
  const filled = Object.values(lineup).filter(Boolean);
  const budgetLeft = START_BUDGET - totalSpent(filled);
  const slotsLeft = ALL_SLOTS.length - filled.length;
  return { budgetLeft, cap: maxSpendNow(budgetLeft, slotsLeft) };
}

export default function SameScreenGame() {
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [simEra, setSimEra] = useState(null);
  // idle | era | spinning | drafting | placing | review | coach1 | coach2 | series | complete
  const [gamePhase, setGamePhase] = useState("idle");

  const [wheelMode, setWheelMode] = useState("round"); // "round" | "pick"
  const [round, setRound] = useState(0);
  const [turnQueue, setTurnQueue] = useState([1, 2]);
  const [turnPos, setTurnPos] = useState(0);
  const activeSeat = turnQueue[turnPos] ?? 1;
  const waitingSeat = turnQueue.length > 1 ? turnQueue.find((s) => s !== activeSeat) : null;

  const [chosenSeason, setChosenSeason] = useState("");
  const [chosenTeam, setChosenTeam] = useState("");
  const [teamPool, setTeamPool] = useState([]);
  const [spinS, setSpinS] = useState(false);
  const [spinT, setSpinT] = useState(false);
  const [targetSIdx, setTargetSIdx] = useState(0);
  const [targetTIdx, setTargetTIdx] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");

  const [players, setPlayers] = useState([]);
  const [pickedPlayer, setPickedPlayer] = useState(null);
  const [doubleActive, setDoubleActive] = useState(false);
  const [discoverActive, setDiscoverActive] = useState(false);
  const [posFilter, setPosFilter] = useState("");
  const [sortKey, setSortKey] = useState("PTS");

  const [bannedName, setBannedName] = useState(null);
  const [banVoided, setBanVoided] = useState(false);
  const [banPicking, setBanPicking] = useState(false); // waiting seat is choosing a ban target
  const [counterDismissed, setCounterDismissed] = useState(false); // counter-joker pop-up handled for this pick

  const [lineups, setLineups] = useState({ 1: { ...EMPTY_LINEUP }, 2: { ...EMPTY_LINEUP } });
  const [moveSrc, setMoveSrc] = useState({ 1: null, 2: null });
  const [jokers, setJokers] = useState({ 1: { ...EMPTY_JOKERS }, 2: { ...EMPTY_JOKERS } });
  const [coachOptions, setCoachOptions] = useState([]);
  const [coaches, setCoaches] = useState({ 1: null, 2: null });

  const [matchup, setMatchup] = useState(null);
  const [seriesGames, setSeriesGames] = useState([]);
  const [seriesW, setSeriesW] = useState({ 1: 0, 2: 0 });

  const timerRef = useRef(null);
  const lineupsRef = useRef(lineups);
  useEffect(() => { lineupsRef.current = lineups; }, [lineups]);

  useEffect(() => {
    fetch("/api/game/seasons").then(r => r.json()).then(d => setSeasons(d.seasons || ["2025-26"])).catch(() => setSeasons(["2025-26"]));
    return () => clearTimeout(timerRef.current);
  }, []);

  const canRearrange = !["idle", "era", "series", "complete"].includes(gamePhase);

  // ── Round başlat: sezon+takım otomatik spin, sonra roster çek ─────────────
  const beginRound = useCallback((roundNum, participants, first) => {
    clearTimeout(timerRef.current);
    const queue = [first, other(first)].filter(s => participants.includes(s));
    setRound(roundNum);
    setTurnQueue(queue);
    setTurnPos(0);
    setPickedPlayer(null);
    setDoubleActive(false);
    setDiscoverActive(false);
    setBannedName(null);
    setBanVoided(false);
    setBanPicking(false);
    setCounterDismissed(false);
    setPosFilter("");
    setPlayers([]);
    setGamePhase("spinning");

    const sIdx = Math.floor(Math.random() * seasons.length);
    setTargetSIdx(sIdx);
    setSpinS(true);
    setSpinT(false);

    timerRef.current = setTimeout(() => {
      const season = seasons[sIdx];
      setSpinS(false);
      setChosenSeason(season);
      fetch(`/api/game/teams?season=${encodeURIComponent(season)}`)
        .then(r => r.json())
        .then(d => {
          const teams = d.teams || [];
          if (teams.length === 0) { beginRound(roundNum, participants, first); return; }
          setTeamPool(teams);
          const tIdx = Math.floor(Math.random() * teams.length);
          setTargetTIdx(tIdx);
          setSpinT(true);
          timerRef.current = setTimeout(() => {
            const team = teams[tIdx];
            setSpinT(false);
            setChosenTeam(team);
            loadRoster(season, team, roundNum, participants, first);
          }, 1600);
        })
        .catch(() => beginRound(roundNum, participants, first));
    }, 1600);
  }, [seasons]);

  // retryFn verilmezse round'un tamamını (beginRound) yeniden başlatır — normal
  // akış. Mod B'nin tek-pick spinForPick'i kendi retry'ını geçer, round/turn
  // state'ine dokunmadan sadece spin'i tekrarlar.
  const loadRoster = useCallback((season, team, roundNum, participants, first, retryFn) => {
    const retry = retryFn || (() => beginRound(roundNum, participants, first));
    setStatusMsg("Loading players...");
    fetch(`/api/game/players?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`)
      .then(r => r.json())
      .then(d => {
        const taken = new Set([
          ...Object.values(lineupsRef.current[1]).filter(Boolean).map(p => p.PLAYER_NAME),
          ...Object.values(lineupsRef.current[2]).filter(Boolean).map(p => p.PLAYER_NAME),
        ]);
        let list = (d.players || []).filter(p => !taken.has(p.PLAYER_NAME));
        if (list.length < 2) { retry(); return; }
        // Same Screen her zaman Salary Cap: takım-içi yıldız fiyatlaması uygula
        list = applyTeamPricing(list);
        setStatusMsg("");
        setPlayers(list);
        setGamePhase("drafting");
      })
      .catch(() => retry());
  }, [beginRound]);

  // ── Mod B (Pick-Based Wheel): round/turn state'i korunur, sadece SIRADAKİ
  // tek pick için bağımsız yeni bir season+team spin'i yapılır ────────────────
  const spinForPick = useCallback(() => {
    clearTimeout(timerRef.current);
    setPickedPlayer(null);
    setDoubleActive(false);
    setDiscoverActive(false);
    setPosFilter("");
    setPlayers([]);
    setGamePhase("spinning");

    const sIdx = Math.floor(Math.random() * seasons.length);
    setTargetSIdx(sIdx);
    setSpinS(true);
    setSpinT(false);

    timerRef.current = setTimeout(() => {
      const season = seasons[sIdx];
      setSpinS(false);
      setChosenSeason(season);
      fetch(`/api/game/teams?season=${encodeURIComponent(season)}`)
        .then(r => r.json())
        .then(d => {
          const teams = d.teams || [];
          if (teams.length === 0) { spinForPick(); return; }
          setTeamPool(teams);
          const tIdx = Math.floor(Math.random() * teams.length);
          setTargetTIdx(tIdx);
          setSpinT(true);
          timerRef.current = setTimeout(() => {
            const team = teams[tIdx];
            setSpinT(false);
            setChosenTeam(team);
            loadRoster(season, team, round, turnQueue, turnQueue[0], spinForPick);
          }, 1600);
        })
        .catch(() => spinForPick());
    }, 1600);
  }, [seasons, round, turnQueue, loadRoster]);

  // Aktif oyuncunun turu içinde havuzu yeniden çeker (reTeam/reYear/reBoth jokerleri)
  const respinWithin = useCallback((keepSeason, keepTeam) => {
    clearTimeout(timerRef.current);
    setPlayers([]);
    setGamePhase("spinning");
    const doSeason = () => new Promise((resolve) => {
      if (keepSeason) { resolve(chosenSeason); return; }
      const sIdx = Math.floor(Math.random() * seasons.length);
      setTargetSIdx(sIdx); setSpinS(true);
      timerRef.current = setTimeout(() => { setSpinS(false); const s = seasons[sIdx]; setChosenSeason(s); resolve(s); }, 1600);
    });
    doSeason().then((season) => {
      fetch(`/api/game/teams?season=${encodeURIComponent(season)}`).then(r => r.json()).then(d => {
        const teams = d.teams || [];
        setTeamPool(teams);
        let tIdx;
        if (keepTeam && teams.includes(chosenTeam)) tIdx = teams.indexOf(chosenTeam);
        else tIdx = Math.floor(Math.random() * teams.length);
        setTargetTIdx(tIdx); setSpinT(true);
        timerRef.current = setTimeout(() => {
          setSpinT(false);
          const team = teams[tIdx];
          setChosenTeam(team);
          loadRoster(season, team, round, turnQueue, turnQueue[0]);
        }, 1600);
      });
    });
  }, [chosenSeason, chosenTeam, seasons, round, turnQueue, loadRoster]);

  // ── Era seç → round 1 başlat ────────────────────────────────────────────
  const pickEra = (era) => { setSimEra(era); beginRound(1, [1, 2], 1); };

  // ── Karşı-joker pop-up'ı: bekleyen taraf aktif tarafın turu üzerinde
  // BAN / Force Team / Force Year'dan birini kullanır (turda tek seçim,
  // seçim/red sonrası pop-up o pick için kapanır — bkz. counterDismissed) ──
  const useCounterJoker = (type) => {
    if (!jokers[waitingSeat][type] || counterDismissed) return;
    setJokers(j => ({ ...j, [waitingSeat]: { ...j[waitingSeat], [type]: false } }));
    setCounterDismissed(true);
    if (type === "ban") { setBanPicking(true); return; }
    // forceTeam/forceYear: anlık havuz değişimi — eski ban hedefi (varsa)
    // yeni havuzda anlamsız kalır, temizlenir.
    setBannedName(null);
    setBanVoided(false);
    if (type === "forceTeam") respinWithin(true, false);
    else if (type === "forceYear") respinWithin(false, true);
  };
  const confirmBan = (player) => {
    setBannedName(player.PLAYER_NAME);
    setBanPicking(false);
  };

  // ── Aktif tarafın joker kullanımı ────────────────────────────────────────
  const useJoker = (type) => {
    if (bannedName && !banVoided) setBanVoided(true);
    setJokers(j => ({ ...j, [activeSeat]: { ...j[activeSeat], [type]: false } }));
    if (type === "reTeam") respinWithin(true, false);
    else if (type === "reYear") respinWithin(false, true);
    else if (type === "reBoth") respinWithin(false, false);
    else if (type === "double") setDoubleActive(true);
    else if (type === "discover") setDiscoverActive(true);
  };

  const pickPlayer = (player) => {
    if (bannedName === player.PLAYER_NAME && !banVoided) return; // banlı — seçilemez
    const cost = priceOf(player);
    const { cap } = capFor(lineupsRef.current[activeSeat]);
    if (cost > cap) return; // kart zaten disabled — guard
    setPickedPlayer({ ...player, _cost: cost });
    setDiscoverActive(false);
    setGamePhase("placing");
  };

  const cancelPick = () => {
    setPickedPlayer(null);
    setGamePhase("drafting");
  };

  const placePos = (pos) => {
    const isStarter = POSITIONS.includes(pos);
    const isPrimary = isStarter && getPrimaryPos(pickedPlayer) === pos;
    const enriched = {
      ...pickedPlayer, _season: chosenSeason, _team: chosenTeam, _isPrimary: isPrimary,
      _assignedPos: pos, _isBench: !isStarter, _posPenalty: posPenaltyFor(pickedPlayer, pos),
    };
    const newLineup = { ...lineupsRef.current[activeSeat], [pos]: enriched };
    setLineups(prev => ({ ...prev, [activeSeat]: newLineup }));
    lineupsRef.current = { ...lineupsRef.current, [activeSeat]: newLineup };
    setPickedPlayer(null);
    // Alınan oyuncu havuzdan HER zaman çıkar — diğer taraf aynı round'da onu
    // tekrar seçemesin (double-pick'te de, normal pick'te de).
    setPlayers(prev => prev.filter(p => p.PLAYER_NAME !== pickedPlayer.PLAYER_NAME));

    const stillOpen = ALL_SLOTS.some(k => !newLineup[k]);
    if (doubleActive && stillOpen) {
      setDoubleActive(false);
      setGamePhase("drafting");
      return;
    }
    setDoubleActive(false);

    // Sıradaki: aynı round'da bekleyen taraf var mı?
    const nextPos = turnPos + 1;
    if (nextPos < turnQueue.length) {
      setTurnPos(nextPos);
      setBannedName(null);
      setBanVoided(false);
      setCounterDismissed(false);
      if (wheelMode === "pick") {
        spinForPick(); // Mod B: her pick kendi spin'ini alır
      } else {
        setGamePhase("drafting"); // Mod A: round'un paylaşılan havuzu geçerli kalır
      }
      return;
    }

    // Round bitti — kimler hâlâ eksik?
    const participants = [1, 2].filter(s => {
      const lu = s === activeSeat ? newLineup : lineupsRef.current[s];
      return ALL_SLOTS.some(k => !lu[k]);
    });
    if (participants.length === 0) {
      setGamePhase("review"); // her iki takım da tamam — koça geçmeden önce roster preview
      return;
    }
    beginRound(round + 1, participants, other(turnQueue[0]));
  };

  // ── Draft bitti, roster preview görüldü — koç seçimine geç ──────────────────
  const continueToCoaches = () => {
    setCoachOptions([...COACHES].sort(() => Math.random() - 0.5).slice(0, 4));
    setGamePhase("coach1");
  };

  // ── Saha üzerinde taşı / takas et (seat bazlı, LineupGame.jsx ile aynı mantık) ──
  const handleSlotTap = (seat, slot) => {
    const cur = lineupsRef.current[seat];
    const src = moveSrc[seat];
    if (src == null) {
      if (cur[slot]) setMoveSrc(m => ({ ...m, [seat]: slot }));
      return;
    }
    if (src === slot) { setMoveSrc(m => ({ ...m, [seat]: null })); return; }
    const place = (pl, s) => pl ? {
      ...pl, _assignedPos: s, _isBench: !POSITIONS.includes(s),
      _posPenalty: posPenaltyFor(pl, s),
      _isPrimary: POSITIONS.includes(s) && getPrimaryPos(pl) === s,
    } : null;
    const nl = { ...cur, [slot]: place(cur[src], slot), [src]: place(cur[slot], src) };
    setLineups(prev => ({ ...prev, [seat]: nl }));
    lineupsRef.current = { ...lineupsRef.current, [seat]: nl };
    setMoveSrc(m => ({ ...m, [seat]: null }));
  };

  const pickCoach = (seat, coach) => {
    if (seat === 1) {
      setCoaches(prev => ({ ...prev, 1: coach }));
      setCoachOptions([...COACHES].sort(() => Math.random() - 0.5).slice(0, 4));
      setGamePhase("coach2");
    } else {
      const finalCoaches = { ...coaches, 2: coach };
      setCoaches(finalCoaches);
      const mu = buildMatchup(lineupsRef.current, finalCoaches, simEra);
      setMatchup(mu);
      setSeriesGames([]);
      setSeriesW({ 1: 0, 2: 0 });
      setGamePhase("series");
    }
  };

  const playNextGame = () => {
    if (!matchup) return;
    const gameIndex = seriesGames.length;
    const result = simulateOneGame(matchup, gameIndex);
    setSeriesGames(prev => [result, ...prev]);
    setSeriesW(prev => ({ ...prev, [result.winner]: prev[result.winner] + 1 }));
  };

  const resetGame = () => {
    clearTimeout(timerRef.current);
    setSimEra(null); setGamePhase("idle"); setRound(0);
    setTurnQueue([1, 2]); setTurnPos(0);
    setChosenSeason(""); setChosenTeam(""); setTeamPool([]);
    setSpinS(false); setSpinT(false); setStatusMsg("");
    setPlayers([]); setPickedPlayer(null); setDoubleActive(false); setDiscoverActive(false); setPosFilter(""); setSortKey("PTS");
    setBannedName(null); setBanVoided(false); setBanPicking(false); setCounterDismissed(false);
    setLineups({ 1: { ...EMPTY_LINEUP }, 2: { ...EMPTY_LINEUP } });
    setMoveSrc({ 1: null, 2: null });
    setJokers({ 1: { ...EMPTY_JOKERS }, 2: { ...EMPTY_JOKERS } });
    setCoachOptions([]); setCoaches({ 1: null, 2: null });
    setMatchup(null); setSeriesGames([]); setSeriesW({ 1: 0, 2: 0 });
  };

  const isSpinPhase = gamePhase === "spinning";
  const seriesOver = seriesW[1] >= 4 || seriesW[2] >= 4;

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="Same Screen — Lineup Builder" description="Two players draft head-to-head on one screen — same shared pool, snake order, BAN joker, best-of-7 series." path="/game/same-screen" />
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-6">
        <div>
          <h1 className="font-logo text-2xl font-bold text-white tracking-wide">Same Screen</h1>
          <p className="text-xs text-gray-500 mt-1">
            One shared spin each round, both players draft under a Salary Cap budget. Snake order. Each player has their own 5 jokers plus one shared-round BAN. Winner is decided in a best-of-7 series.
          </p>
        </div>

        {gamePhase === "idle" && (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_640px_340px] gap-4 justify-center max-w-[1400px] mx-auto">

            <div className="order-2 lg:order-1 space-y-3 min-w-0">
              <HowItWorksPanel
                steps={[
                  ["1", TargetIcon, "text-asagi", "Pick your era", "distance + style fit"],
                  ["2", WheelIcon, "text-yamabuki", "Choose the wheel", "round- or pick-based"],
                  ["3", UsersIcon, "text-brandBlue", "Snake draft 9v9", "shared pool · salary cap"],
                  ["4", TrophyIcon, "text-yamabuki", "Best-of-7 series", "simulate to a champion"],
                ]}
                note={<>Every roster is built under a shared-rules <span className="text-emerald-300 font-semibold">Salary Cap</span> — 100% budget each, star players cost more. Snake order keeps the draft fair for both players.</>}
              />
            </div>

            {/* ── ORTA: vs paneli + çark alt-modu + başlat ── */}
            <div className="order-1 lg:order-2 space-y-3">
              <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 flex items-center justify-center gap-5">
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border-2 border-brandBlue/60 bg-brandBlue/10 flex items-center justify-center text-brandBlue"><UsersIcon size={24} /></div>
                  <div className="font-logo text-sm font-bold text-white mt-2">Player 1</div>
                </div>
                <div className="font-logo text-2xl font-black text-gray-600">VS</div>
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border-2 border-brandRed/60 bg-brandRed/10 flex items-center justify-center text-brandRed"><UsersIcon size={24} /></div>
                  <div className="font-logo text-sm font-bold text-white mt-2">Player 2</div>
                </div>
              </div>

              <WheelModePicker value={wheelMode} onChange={setWheelMode} />

              <div className="text-center space-y-2">
                <button onClick={() => setGamePhase("era")}
                  className="px-16 py-3 rounded-xl font-logo font-bold text-xl inline-flex items-center justify-center gap-2 transition-colors duration-200 text-darkBg bg-yamabuki hover:bg-white shadow-[0_0_20px_rgba(255,177,27,0.3)]">
                  <WheelIcon size={17} /> Start
                </button>
                <div>
                  <button onClick={() => setHowToPlayOpen(true)}
                    className="text-xs text-gray-500 hover:text-yamabuki underline underline-offset-2 transition-colors">
                    How to Play
                  </button>
                </div>
              </div>
            </div>

            <div className="order-3 space-y-3 min-w-0">
              <MechanicsPanel />
            </div>

          </div>
        )}

        {gamePhase === "era" && (
          <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 space-y-3">
            <div className="text-[11px] text-gray-400 uppercase tracking-widest mb-1">Pick Your Simulation Era</div>
            <div className="grid grid-cols-2 gap-2">
              {ERAS.map(era => (
                <button key={era.id} onClick={() => pickEra(era)}
                  className={`text-left rounded-xl border p-3 transition-all hover:scale-[1.02] ${era.bg}`}>
                  <div className={`text-sm font-bold ${era.color}`}>{era.label}</div>
                  <div className="text-[9.5px] text-gray-500 mt-0.5">{era.years[0]}–{Math.min(era.years[1], 2026)}</div>
                  <div className="text-[10px] text-gray-400 mt-1.5 leading-snug">{ERA_META_BLURB[era.id]}</div>
                </button>
              ))}
            </div>
            <button onClick={() => pickEra(ERAS[Math.floor(Math.random() * ERAS.length)])}
              className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-300 transition-colors inline-flex items-center justify-center gap-2">
              <DiceIcon size={15} /> Random Era
            </button>
          </div>
        )}

        {(gamePhase === "spinning" || gamePhase === "drafting" || gamePhase === "placing") && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3">
              <span className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 font-logo uppercase tracking-widest">Round {round}</span>
              {simEra && <span className={`text-[9px] px-1.5 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>SIM: {simEra.short}</span>}
              {waitingSeat && gamePhase !== "spinning" && (
                <span className="text-[11px] text-yamabuki font-logo font-bold uppercase tracking-widest">Player {activeSeat}'s pick — Player {waitingSeat} waiting</span>
              )}
            </div>

            {isSpinPhase && (
              <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5">
                <div className="flex justify-center gap-8 mb-4">
                  <SpinWheel items={seasons} spinning={spinS} targetIdx={targetSIdx} label="Season" />
                  <SpinWheel items={teamPool.length > 0 ? teamPool : ["..."]} spinning={spinT} targetIdx={targetTIdx} label="Team" />
                </div>
                <p className="text-center text-xs text-gray-500 animate-pulse">{statusMsg || "Spinning..."}</p>
              </div>
            )}

            {gamePhase !== "spinning" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2].map(seat => (
                  <PlayerSeatPanel key={seat}
                    seat={seat}
                    isActive={activeSeat === seat}
                    isWaiting={waitingSeat === seat}
                    lineup={lineups[seat]}
                    moveSrc={moveSrc[seat]}
                    canRearrange={canRearrange}
                    onSlotTap={(pos) => handleSlotTap(seat, pos)}
                    jokers={jokers[seat]}
                    chosenTeam={chosenTeam} chosenSeason={chosenSeason}
                    players={players}
                    posFilter={activeSeat === seat ? posFilter : ""}
                    setPosFilter={setPosFilter}
                    sortKey={sortKey} setSortKey={setSortKey}
                    pickedPlayer={activeSeat === seat ? pickedPlayer : null}
                    gamePhase={gamePhase}
                    doubleActive={doubleActive}
                    discoverActive={discoverActive}
                    bannedName={bannedName}
                    banVoided={banVoided}
                    banPicking={waitingSeat === seat && banPicking}
                    onPickPlayer={pickPlayer}
                    onPlacePos={placePos}
                    onCancelPick={cancelPick}
                    onUseJoker={useJoker}
                    onUseCounterJoker={useCounterJoker}
                    onDismissCounter={() => setCounterDismissed(true)}
                    onConfirmBan={confirmBan}
                    counterDismissed={counterDismissed}
                    onPlayerInfo={setDetailPlayer}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {gamePhase === "review" && (
          <RosterReview lineups={lineups} simEra={simEra} moveSrc={moveSrc}
            canRearrange={canRearrange} onSlotTap={handleSlotTap}
            onContinue={continueToCoaches} onPlayerInfo={setDetailPlayer} />
        )}

        {(gamePhase === "coach1" || gamePhase === "coach2") && (() => {
          const seat = gamePhase === "coach1" ? 1 : 2;
          return (
            <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 space-y-3 max-w-2xl mx-auto">
              <div className="text-[11px] text-gray-400 uppercase tracking-widest">Player {seat} — Hire a Coach</div>
              <div className="grid grid-cols-2 gap-2">
                {coachOptions.map(c => (
                  <button key={c.name} onClick={() => pickCoach(seat, c)}
                    className="text-left rounded-xl border border-gray-800 bg-surfaceCard p-3 hover:border-yamabuki/60 transition-all">
                    <div className="font-logo text-sm font-bold text-white flex items-center gap-1.5"><CoachIcon size={14} /> {c.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{c.years} · {c.champs} rings</div>
                    <div className="text-[10px] text-gray-400 mt-1">OFF {c.off} · DEF {c.def} {c.tag && <span className="text-violet-300 ml-1">{c.tag}</span>}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {gamePhase === "series" && matchup && (
          <SeriesPanel matchup={matchup} games={seriesGames} seriesW={seriesW} seriesOver={seriesOver}
            onNextGame={playNextGame} onSeeResult={() => setGamePhase("complete")} />
        )}

        {gamePhase === "complete" && (
          <SameScreenResult lineups={lineups} coaches={coaches} seriesW={seriesW} seriesGames={seriesGames} onReset={resetGame} />
        )}

        <HowToPlayModal open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
        <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
      </div>
    </div>
  );
}

// ── Tek oyuncunun paneli (mobil-tarzı, kortsuz) ──────────────────────────────
function PlayerSeatPanel({
  seat, isActive, isWaiting, lineup, moveSrc, canRearrange, onSlotTap, jokers, chosenTeam, chosenSeason, players,
  posFilter, setPosFilter, sortKey, setSortKey, pickedPlayer, gamePhase, doubleActive, discoverActive,
  bannedName, banVoided, banPicking, onPickPlayer, onPlacePos, onCancelPick, onUseJoker,
  onUseCounterJoker, onDismissCounter, counterDismissed, onConfirmBan, onPlayerInfo,
}) {
  const filtered = posFilter ? players.filter(p => posGroupOf(p) === posFilter) : players;
  const list = [...filtered].sort((a, b) => {
    if (sortKey === "TAGGED") {
      const ta = getPlayerTags(a).length, tb = getPlayerTags(b).length;
      if (tb !== ta) return tb - ta;
      return (parseFloat(b.PTS || 0) || 0) - (parseFloat(a.PTS || 0) || 0);
    }
    return (parseFloat(b[sortKey] || 0) || 0) - (parseFloat(a[sortKey] || 0) || 0);
  });
  const showBanEffective = bannedName && !banVoided;
  const { budgetLeft, cap } = capFor(lineup);
  const eligible = pickedPlayer ? getEligiblePos(pickedPlayer) : [];

  return (
    <div className={`rounded-2xl border p-3 space-y-2 ${isActive ? "border-yamabuki/50 bg-yamabuki/5" : "border-gray-800 bg-surfaceBg"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-sm font-bold text-white">Player {seat}</span>
        {isActive && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-yamabuki/20 border border-yamabuki/50 text-yamabuki font-bold uppercase tracking-wider">Your pick</span>}
        {isWaiting && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 uppercase tracking-wider">Waiting</span>}
      </div>

      {/* Salary Cap bütçe barı */}
      <div className="rounded-lg border border-gray-800 bg-surfaceBg/60 px-2 py-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500 uppercase tracking-wider flex items-center gap-1"><CapIcon size={11} /> Cap</span>
          <span className={`font-black tabular-nums ${budgetLeft <= 15 ? "text-red-400" : budgetLeft <= 35 ? "text-yamabuki" : "text-emerald-300"}`}>{budgetLeft}%</span>
        </div>
        <div className="h-1.5 bg-surfaceCard rounded-full overflow-hidden mt-1">
          <div className="h-full rounded-full" style={{ width: `${budgetLeft}%`, background: budgetLeft <= 15 ? "#7f1d1d" : budgetLeft <= 35 ? "#b45309" : "#047857" }} />
        </div>
      </div>

      {canRearrange && moveSrc && (
        <p className="text-[9.5px] text-yamabuki/90">Moving {lineup[moveSrc]?.PLAYER_NAME?.split(" ").slice(-1)[0]} — tap a destination slot</p>
      )}
      <div className="flex gap-1">
        {POSITIONS.map(pos => <LineupSlot key={pos} pos={pos} player={lineup[pos]}
          selected={moveSrc === pos} canTap={canRearrange} onTap={onSlotTap} onInfo={onPlayerInfo} />)}
      </div>
      <div className="flex gap-1 opacity-80">
        {BENCH_SLOTS.map(pos => <LineupSlot key={pos} pos={pos} player={lineup[pos]} bench
          selected={moveSrc === pos} canTap={canRearrange} onTap={onSlotTap} onInfo={onPlayerInfo} />)}
      </div>
      <BenchCoverage bench={BENCH_SLOTS.map(pos => lineup[pos])} />

      {/* Joker çubuğu — self-joker'lar (aktif taraf) */}
      <div className="grid grid-cols-5 gap-1">
        <JokerBtn Icon={RefreshIcon} label="Team" available={isActive && jokers.reTeam && gamePhase === "drafting"} onClick={() => onUseJoker("reTeam")} />
        <JokerBtn Icon={CalendarIcon} label="Year" available={isActive && jokers.reYear && gamePhase === "drafting"} onClick={() => onUseJoker("reYear")} />
        <JokerBtn Icon={BoltIcon} label="Both" available={isActive && jokers.reBoth && gamePhase === "drafting"} onClick={() => onUseJoker("reBoth")} />
        <JokerBtn Icon={UsersIcon} label="Pick 2" available={isActive && jokers.double && !doubleActive && gamePhase === "drafting"} onClick={() => onUseJoker("double")} />
        <JokerBtn Icon={SearchIcon} label="Discover" available={isActive && jokers.discover && !discoverActive && gamePhase === "drafting"} onClick={() => onUseJoker("discover")} />
      </div>
      {isActive && showBanEffective && (
        <div className="text-[10.5px] text-red-400 flex items-center gap-1"><WarnIcon size={11} /> {bannedName} is BANNED this pick — use any joker to counter it.</div>
      )}

      {/* Karşı-joker pop-up'ı — bekleyen tarafın kendi paneli, aktif tarafın
          turu başlarken otomatik belirir (bkz. counterDismissed) */}
      {isWaiting && gamePhase === "drafting" && !counterDismissed && !banPicking && (
        <CounterJokerPrompt jokers={jokers} activeSeat={other(seat)}
          onUse={onUseCounterJoker} onDismiss={onDismissCounter} />
      )}
      {isWaiting && banPicking && (
        <div className="text-[10.5px] text-yamabuki">Pick a player below to BAN from Player {seat === 1 ? 2 : 1}'s options.</div>
      )}

      {/* Aktif taraf için: pozisyon atama ekranı */}
      {isActive && gamePhase === "placing" && pickedPlayer && (
        <div className="rounded-xl border border-yamabuki/40 bg-yamabuki/5 p-2 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="text-white text-sm font-semibold">{pickedPlayer.PLAYER_NAME} <span className="text-[11px] text-blue-400 ml-1">{pickedPlayer.primary_arch || "—"}</span></div>
            <button onClick={onCancelPick} className="text-gray-500 hover:text-gray-300 text-[11px] shrink-0">← Back</button>
          </div>
          <div className="flex gap-1 flex-wrap items-center">
            {eligible.map(p => (
              <span key={p} className={`text-[9.5px] px-1.5 py-0.5 rounded border font-bold inline-flex items-center gap-0.5 ${POS_COLORS[p] || ""}`}>
                {p}{p === eligible[0] && <StarIcon size={9} />}
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {POSITIONS.filter(p => !lineup[p]).map(pos => {
              const isElig = eligible.includes(pos);
              const isPrim = eligible[0] === pos;
              const pen = posPenaltyFor(pickedPlayer, pos);
              const penLabel = pen >= 1 ? null : pen >= 0.90 ? "−10%" : "−25%";
              return (
                <button key={pos} onClick={() => onPlacePos(pos)}
                  className={`flex-1 min-w-[3rem] py-1.5 border rounded-lg font-bold text-xs transition-all
                    ${isPrim ? "bg-yamabuki/30 border-yamabuki/60 text-yamabuki" : isElig ? "bg-surfaceCard border-gray-600 text-white" : "bg-surfaceBg/50 border-gray-800 text-gray-500"}`}>
                  <div className="inline-flex items-center gap-0.5 justify-center">{pos}{isPrim && <StarIcon size={9} />}</div>
                  {penLabel && <div className="text-[8px] font-medium text-red-400/90 leading-tight">{penLabel}</div>}
                  {!penLabel && !isPrim && isFlex(pickedPlayer) && <div className="text-[8px] font-medium text-violet-400 leading-tight">vers.</div>}
                </button>
              );
            })}
          </div>
          {BENCH_SLOTS.some(b => !lineup[b]) && (
            <div className="flex gap-1.5">
              {BENCH_SLOTS.filter(b => !lineup[b]).map(b => (
                <button key={b} onClick={() => onPlacePos(b)}
                  className="flex-1 py-1.5 border border-gray-700 rounded-lg text-xs text-gray-300 hover:border-yamabuki/50">{b}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roster listesi: aktif tarafın seçmesi için, ya da bekleyen tarafın BAN seçmesi için */}
      {gamePhase === "drafting" && (isActive || (isWaiting && banPicking)) && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">{chosenTeam} · {chosenSeason}</span>
            <span className="ml-auto flex items-center border rounded overflow-hidden" style={{ borderColor: "#262626" }}>
              {["G", "F", "C"].map(g => (
                <button key={g} onClick={() => setPosFilter(f => f === g ? "" : g)}
                  className={`px-2 py-0.5 font-logo text-[10px] font-bold border-r last:border-r-0 ${posFilter === g ? "bg-yamabuki text-darkBg" : "text-gray-400"}`}
                  style={{ borderColor: "#262626" }}>{g}</button>
              ))}
            </span>
          </div>
          {isActive && (
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              <span className="font-logo text-[9px] tracking-widest text-gray-500 uppercase mr-1">Sort</span>
              {SORT_KEYS.map(([field, label]) => (
                <button key={field} onClick={() => setSortKey(field)}
                  className={`px-1.5 py-0.5 rounded font-logo text-[9px] font-semibold tracking-wider transition-colors
                    ${sortKey === field ? "bg-yamabuki text-darkBg" : "text-gray-500 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-80 overflow-auto border border-gray-800 rounded-lg">
            {list.map((p, i) => {
              const banned = isActive && bannedName === p.PLAYER_NAME && !banVoided;
              const cost = priceOf(p);
              const overCap = isActive && cost > cap;
              return (
                <PlayerRow key={i} player={p} discover={isActive && discoverActive}
                  onClick={() => isWaiting && banPicking ? onConfirmBan(p) : onPickPlayer(p)}
                  cost={cost}
                  unaffordable={banned || overCap}
                  highlightStat={sortKey === "TAGGED" ? "PTS" : sortKey} />
              );
            })}
            {list.length === 0 && <div className="py-6 text-center text-xs text-gray-600">No players in this group.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Draft tamamlandı: koça geçmeden önce iki takımın roster preview'ı
// (single-player'daki "Roster Breakdown" tablosunun iki-sütunlu hâli) ───────
function RosterReview({ lineups, simEra, moveSrc, canRearrange, onSlotTap, onContinue, onPlayerInfo }) {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="text-center">
        <div className="font-logo text-lg font-bold text-white">Rosters Complete</div>
        <p className="text-xs text-gray-500 mt-0.5">Review both teams before hiring your coaches. Tap a slot to rearrange one last time.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map(seat => (
          <TeamPreviewCard key={seat} seat={seat} lineup={lineups[seat]} simEra={simEra}
            moveSrc={moveSrc[seat]} canRearrange={canRearrange} onSlotTap={(pos) => onSlotTap(seat, pos)}
            onPlayerInfo={onPlayerInfo} />
        ))}
      </div>
      <div className="text-center">
        <button onClick={onContinue}
          className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white transition-colors inline-flex items-center gap-2">
          <CoachIcon size={15} /> Continue to Coaches
        </button>
      </div>
    </div>
  );
}

function TeamPreviewCard({ seat, lineup, simEra, moveSrc, canRearrange, onSlotTap, onPlayerInfo }) {
  const starters = POSITIONS.map(p => lineup[p]).filter(Boolean);
  const fit = computeLineupFit(starters, simEra);
  const pct = fit ? Math.round(fit.lineupScore * 100) : 0;
  const perPlayerMap = {};
  POSITIONS.forEach((pos, i) => { if (lineup[pos] && fit?.perPlayer?.[i]) perPlayerMap[pos] = fit.perPlayer[i]; });

  const Row = ({ pos, bench }) => {
    const p = lineup[pos]; if (!p) return null;
    const pp = perPlayerMap[pos];
    const base = Math.round((parseFloat(p.overall_score) || 0) * 100);
    const qPct = pp ? Math.round(pp.quality * 100) : base;
    const isPrimary = !bench && getPrimaryPos(p) === pos;
    return (
      <button onClick={() => onSlotTap(pos)} disabled={!canRearrange}
        className={`relative w-full flex items-center gap-2 py-1.5 border-b last:border-b-0 text-left transition-colors
          ${bench ? "opacity-70" : ""} ${moveSrc === pos ? "bg-yamabuki/10" : "hover:bg-white/[0.02]"}`}
        style={{ borderColor: "rgba(30,41,59,.5)" }}>
        <span className={`text-[9.5px] font-bold px-1.5 py-1 rounded border shrink-0 w-8 text-center ${bench ? "border-gray-700 text-gray-500" : POS_COLORS[pos] || ""}`}>
          {bench ? "BN" : pos}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-white font-semibold truncate">{p.PLAYER_NAME}</span>
            {isPrimary && <span className="text-yamabuki shrink-0"><StarIcon size={9} /></span>}
          </div>
          <span className="text-[10px] text-blue-400">{p.primary_arch || "—"}</span>
        </div>
        <span className="text-[9.5px] text-gray-500 tabular-nums shrink-0 w-9 text-right">ovr {base}</span>
        <div className="w-12 h-1.5 bg-surfaceCard rounded-full overflow-hidden shrink-0">
          <div className="h-full rounded-full" style={{ width: `${qPct}%`, background: qPct >= 75 ? "#1D428A" : qPct >= 55 ? "#2a3d6b" : "#7f1d1d" }} />
        </div>
        <span className={`text-[11px] font-bold w-6 text-right shrink-0 ${qPct >= 75 ? "text-blue-300" : qPct >= 55 ? "text-gray-200" : "text-red-400"}`}>{qPct}</span>
        {onPlayerInfo && (
          <span onClick={e => { e.stopPropagation(); onPlayerInfo(p); }}
            className="text-gray-600 hover:text-yamabuki transition-colors shrink-0" title="Player details">
            <EyeIcon size={12} />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-surfaceBg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-logo text-sm font-bold text-white">Player {seat}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9.5px] text-gray-500 uppercase tracking-widest">Team Score</span>
          <span className={`font-logo text-xl font-black tabular-nums ${pct >= 78 ? "text-blue-300" : pct >= 62 ? "text-sky-300" : "text-gray-300"}`}>{pct}</span>
        </div>
      </div>
      {canRearrange && moveSrc && (
        <p className="text-[9.5px] text-yamabuki/90">Moving {lineup[moveSrc]?.PLAYER_NAME?.split(" ").slice(-1)[0]} — tap a destination slot</p>
      )}
      <div>
        {POSITIONS.map(pos => <Row key={pos} pos={pos} />)}
        {BENCH_SLOTS.map(pos => <Row key={pos} pos={pos} bench />)}
      </div>
      <BenchCoverage bench={BENCH_SLOTS.map(pos => lineup[pos])} />
    </div>
  );
}

// ── Seri: best-of-7, maç maç, her maçtan sonra box score ────────────────────
function SeriesPanel({ matchup, games, seriesW, seriesOver, onNextGame, onSeeResult }) {
  const leaderSeat = seriesW[1] === seriesW[2] ? 0 : (seriesW[1] > seriesW[2] ? 1 : 2);
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-center">
        <div className="font-logo text-[11px] uppercase tracking-widest text-gray-500 mb-1">Best-of-7 Series</div>
        <div className="font-logo text-4xl font-black text-white tabular-nums">
          {seriesW[1]}<span className="text-gray-600 mx-2">–</span>{seriesW[2]}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {seriesOver
            ? `Player ${leaderSeat} wins the series ${Math.max(seriesW[1], seriesW[2])}-${Math.min(seriesW[1], seriesW[2])}`
            : leaderSeat === 0 ? "Series tied" : `Player ${leaderSeat} leads`}
        </div>
      </div>

      {!seriesOver && (
        <div className="text-center">
          <button onClick={onNextGame}
            className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white transition-colors inline-flex items-center gap-2">
            <PlayIcon size={15} /> {games.length === 0 ? "Simulate Game 1" : `Simulate Game ${games.length + 1}`}
          </button>
        </div>
      )}
      {seriesOver && (
        <div className="text-center">
          <button onClick={onSeeResult}
            className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white transition-colors inline-flex items-center gap-2">
            <TrophyIcon size={15} /> See Result
          </button>
        </div>
      )}

      <div className="space-y-3">
        {games.map((g) => <GameBox key={g.gameIndex} game={g} />)}
      </div>
    </div>
  );
}

// ── Complete: seri sonucu + rosterlar ────────────────────────────────────────
function SameScreenResult({ lineups, coaches, seriesW, seriesGames, onReset }) {
  const winner = seriesW[1] === seriesW[2] ? 0 : (seriesW[1] > seriesW[2] ? 1 : 2);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-center">
        <TrophyIcon size={32} />
        <div className="font-logo text-2xl font-bold text-white mt-1">
          {winner === 0 ? "It's a tie!" : `Player ${winner} wins the series!`}
        </div>
        <div className="font-logo text-3xl font-black text-white mt-1 tabular-nums">
          {seriesW[1]}<span className="text-gray-600 mx-2">–</span>{seriesW[2]}
        </div>
        <div className="text-[11px] text-gray-500 mt-1">{seriesGames.length} game{seriesGames.length !== 1 ? "s" : ""} played</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map(seat => (
          <div key={seat} className={`rounded-2xl border p-4 space-y-3 ${winner === seat ? "border-yamabuki bg-yamabuki/10" : "border-gray-800 bg-surfaceBg"}`}>
            <div className="flex items-center justify-between">
              <span className="font-logo text-base font-bold text-white">Player {seat}</span>
              <span className="text-3xl font-black tabular-nums" style={{ color: winner === seat ? "var(--accent)" : "#e5e7eb" }}>{seriesW[seat]}</span>
            </div>
            {coaches[seat] && (
              <div className="text-[11px] text-gray-400 flex items-center gap-1"><CoachIcon size={12} /> {coaches[seat].name}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {POSITIONS.concat(BENCH_SLOTS).map(pos => lineups[seat][pos] && (
                <span key={pos} className={`text-[10px] px-1.5 py-0.5 rounded border ${POS_COLORS[pos] || "border-gray-700 text-gray-400"}`}
                  title={`${lineups[seat][pos]._cost ?? priceOf(lineups[seat][pos])}% cap`}>
                  {lineups[seat][pos].PLAYER_NAME?.split(" ").slice(-1)[0]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center">
        <button onClick={onReset}
          className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white transition-colors inline-flex items-center gap-2">
          <WheelIcon size={15} /> Play Again
        </button>
      </div>
    </div>
  );
}
