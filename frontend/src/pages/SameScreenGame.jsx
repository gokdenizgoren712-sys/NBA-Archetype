import { useState, useEffect, useRef, useCallback } from "react";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB } from "../game/eras";
import { computeLineupFit } from "../game/lineupScore";
import { COACHES } from "../game/coaches";
import {
  POSITIONS, BENCH_SLOTS, ALL_SLOTS, getPrimaryPos, getEligiblePos, posPenaltyFor, POS_COLORS,
} from "../game/positions";
import SpinWheel from "../game/SpinWheel";
import LineupSlot from "../game/LineupSlot";
import PlayerRow, { posGroupOf } from "../game/PlayerRow";
import JokerBtn from "../game/JokerBtn";
import {
  StarIcon, CoachIcon, TrophyIcon, WheelIcon, CardsIcon, RefreshIcon,
  CalendarIcon, BoltIcon, UsersIcon, SearchIcon, WarnIcon, DiceIcon,
} from "../game/GameIcons";

const EMPTY_LINEUP = { PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null, B4: null };
const EMPTY_JOKERS = { reTeam: true, reYear: true, reBoth: true, double: true, discover: true, ban: true };
const other = (seat) => (seat === 1 ? 2 : 1);

export default function SameScreenGame() {
  const [seasons, setSeasons] = useState([]);
  const [simEra, setSimEra] = useState(null);
  // idle | era | spinning | drafting | placing | coach1 | coach2 | complete
  const [gamePhase, setGamePhase] = useState("idle");

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

  const [bannedName, setBannedName] = useState(null);
  const [banVoided, setBanVoided] = useState(false);
  const [banPicking, setBanPicking] = useState(false); // waiting seat is choosing a ban target

  const [lineups, setLineups] = useState({ 1: { ...EMPTY_LINEUP }, 2: { ...EMPTY_LINEUP } });
  const [jokers, setJokers] = useState({ 1: { ...EMPTY_JOKERS }, 2: { ...EMPTY_JOKERS } });
  const [coachOptions, setCoachOptions] = useState([]);
  const [coaches, setCoaches] = useState({ 1: null, 2: null });
  const [fitResults, setFitResults] = useState({ 1: null, 2: null });

  const timerRef = useRef(null);
  const lineupsRef = useRef(lineups);
  useEffect(() => { lineupsRef.current = lineups; }, [lineups]);

  useEffect(() => {
    fetch("/api/game/seasons").then(r => r.json()).then(d => setSeasons(d.seasons || ["2025-26"])).catch(() => setSeasons(["2025-26"]));
    return () => clearTimeout(timerRef.current);
  }, []);

  const openSlots = (seat) => ALL_SLOTS.filter(k => !lineupsRef.current[seat][k]);
  const isFull = (seat) => openSlots(seat).length === 0;

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

  const loadRoster = useCallback((season, team, roundNum, participants, first) => {
    setStatusMsg("Loading players...");
    fetch(`/api/game/players?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`)
      .then(r => r.json())
      .then(d => {
        const taken = new Set([
          ...Object.values(lineupsRef.current[1]).filter(Boolean).map(p => p.PLAYER_NAME),
          ...Object.values(lineupsRef.current[2]).filter(Boolean).map(p => p.PLAYER_NAME),
        ]);
        const list = (d.players || []).filter(p => !taken.has(p.PLAYER_NAME));
        if (list.length < 2) { beginRound(roundNum, participants, first); return; }
        setStatusMsg("");
        setPlayers(list);
        setGamePhase("drafting");
      })
      .catch(() => beginRound(roundNum, participants, first));
  }, [beginRound]);

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

  // ── BAN: bekleyen taraf aktif tarafın turu üzerinde kullanır ─────────────
  const activateBan = (seat) => {
    if (seat !== waitingSeat || !jokers[seat].ban || bannedName) return;
    setBanPicking(true);
  };
  const confirmBan = (player) => {
    setBannedName(player.PLAYER_NAME);
    setBanPicking(false);
    setJokers(j => ({ ...j, [waitingSeat]: { ...j[waitingSeat], ban: false } }));
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
    setPickedPlayer(player);
    setDiscoverActive(false);
    setGamePhase("placing");
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
      setGamePhase("drafting");
      return;
    }

    // Round bitti — kimler hâlâ eksik?
    const participants = [1, 2].filter(s => {
      const lu = s === activeSeat ? newLineup : lineupsRef.current[s];
      return ALL_SLOTS.some(k => !lu[k]);
    });
    if (participants.length === 0) {
      setCoachOptions([...COACHES].sort(() => Math.random() - 0.5).slice(0, 4));
      setGamePhase("coach1");
      return;
    }
    beginRound(round + 1, participants, other(turnQueue[0]));
  };

  const pickCoach = (seat, coach) => {
    setCoaches(prev => ({ ...prev, [seat]: coach }));
    if (seat === 1) {
      setCoachOptions([...COACHES].sort(() => Math.random() - 0.5).slice(0, 4));
      setGamePhase("coach2");
    } else {
      const fit1 = computeLineupFit(Object.values(lineupsRef.current[1]).filter(Boolean), simEra);
      const fit2 = computeLineupFit(Object.values(lineupsRef.current[2]).filter(Boolean), simEra);
      setFitResults({ 1: fit1, 2: fit2 });
      setGamePhase("complete");
    }
  };

  const resetGame = () => {
    clearTimeout(timerRef.current);
    setSimEra(null); setGamePhase("idle"); setRound(0);
    setTurnQueue([1, 2]); setTurnPos(0);
    setChosenSeason(""); setChosenTeam(""); setTeamPool([]);
    setSpinS(false); setSpinT(false); setStatusMsg("");
    setPlayers([]); setPickedPlayer(null); setDoubleActive(false); setDiscoverActive(false); setPosFilter("");
    setBannedName(null); setBanVoided(false); setBanPicking(false);
    setLineups({ 1: { ...EMPTY_LINEUP }, 2: { ...EMPTY_LINEUP } });
    setJokers({ 1: { ...EMPTY_JOKERS }, 2: { ...EMPTY_JOKERS } });
    setCoachOptions([]); setCoaches({ 1: null, 2: null }); setFitResults({ 1: null, 2: null });
  };

  const isSpinPhase = gamePhase === "spinning";

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="Same Screen — Lineup Builder" description="Two players draft head-to-head on one screen — same shared pool, snake order, BAN joker." path="/game/same-screen" />
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-6">
        <div>
          <h1 className="font-logo text-2xl font-bold text-white tracking-wide">Same Screen</h1>
          <p className="text-xs text-gray-500 mt-1">
            One shared spin each round, both players draft from the same roster. Snake order. Each player has their own 5 jokers plus one shared-round BAN.
          </p>
        </div>

        {gamePhase === "idle" && (
          <div className="max-w-md mx-auto text-center bg-surfaceBg border border-gray-800 rounded-2xl p-6 space-y-4">
            <p className="text-sm text-gray-400">Two players, one screen. Every round the wheel spins once — you both draft from the same team. Snake order keeps it fair. Watch out for BAN.</p>
            <button onClick={() => setGamePhase("era")}
              className="px-10 py-3 rounded-xl font-logo font-bold text-lg text-darkBg bg-yamabuki hover:bg-white transition-colors shadow-[0_0_20px_rgba(255,177,27,0.3)]">
              Start
            </button>
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
                    jokers={jokers[seat]}
                    chosenTeam={chosenTeam} chosenSeason={chosenSeason}
                    players={players}
                    posFilter={activeSeat === seat ? posFilter : ""}
                    setPosFilter={setPosFilter}
                    pickedPlayer={activeSeat === seat ? pickedPlayer : null}
                    gamePhase={gamePhase}
                    doubleActive={doubleActive}
                    discoverActive={discoverActive}
                    bannedName={bannedName}
                    banVoided={banVoided}
                    banPicking={waitingSeat === seat && banPicking}
                    onPickPlayer={pickPlayer}
                    onPlacePos={placePos}
                    onUseJoker={useJoker}
                    onActivateBan={() => activateBan(seat)}
                    onConfirmBan={confirmBan}
                  />
                ))}
              </div>
            )}
          </div>
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

        {gamePhase === "complete" && (
          <SameScreenResult lineups={lineups} coaches={coaches} fitResults={fitResults} onReset={resetGame} />
        )}
      </div>
    </div>
  );
}

// ── Tek oyuncunun paneli (mobil-tarzı, kortsuz) ──────────────────────────────
function PlayerSeatPanel({
  seat, isActive, isWaiting, lineup, jokers, chosenTeam, chosenSeason, players,
  posFilter, setPosFilter, pickedPlayer, gamePhase, doubleActive, discoverActive,
  bannedName, banVoided, banPicking, onPickPlayer, onPlacePos, onUseJoker, onActivateBan, onConfirmBan,
}) {
  const list = posFilter ? players.filter(p => posGroupOf(p) === posFilter) : players;
  const showBanEffective = bannedName && !banVoided;

  return (
    <div className={`rounded-2xl border p-3 space-y-2 ${isActive ? "border-yamabuki/50 bg-yamabuki/5" : "border-gray-800 bg-surfaceBg"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-sm font-bold text-white">Player {seat}</span>
        {isActive && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-yamabuki/20 border border-yamabuki/50 text-yamabuki font-bold uppercase tracking-wider">Your pick</span>}
        {isWaiting && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 uppercase tracking-wider">Waiting</span>}
      </div>

      <div className="flex gap-1">
        {POSITIONS.map(pos => <LineupSlot key={pos} pos={pos} player={lineup[pos]} />)}
      </div>
      <div className="flex gap-1 opacity-80">
        {BENCH_SLOTS.map(pos => <LineupSlot key={pos} pos={pos} player={lineup[pos]} bench />)}
      </div>

      {/* Joker çubuğu */}
      <div className="grid grid-cols-6 gap-1">
        <JokerBtn Icon={RefreshIcon} label="Team" available={isActive && jokers.reTeam && gamePhase === "drafting"} onClick={() => onUseJoker("reTeam")} />
        <JokerBtn Icon={CalendarIcon} label="Year" available={isActive && jokers.reYear && gamePhase === "drafting"} onClick={() => onUseJoker("reYear")} />
        <JokerBtn Icon={BoltIcon} label="Both" available={isActive && jokers.reBoth && gamePhase === "drafting"} onClick={() => onUseJoker("reBoth")} />
        <JokerBtn Icon={UsersIcon} label="Pick 2" available={isActive && jokers.double && !doubleActive && gamePhase === "drafting"} onClick={() => onUseJoker("double")} />
        <JokerBtn Icon={SearchIcon} label="Discover" available={isActive && jokers.discover && !discoverActive && gamePhase === "drafting"} onClick={() => onUseJoker("discover")} />
        <JokerBtn Icon={WarnIcon} label="BAN" available={isWaiting && jokers.ban && !bannedName && !banPicking} onClick={onActivateBan} />
      </div>
      {isActive && showBanEffective && (
        <div className="text-[10.5px] text-red-400 flex items-center gap-1"><WarnIcon size={11} /> {bannedName} is BANNED this pick — use any joker to counter it.</div>
      )}
      {isWaiting && banPicking && (
        <div className="text-[10.5px] text-yamabuki">Pick a player below to BAN from Player {seat === 1 ? 2 : 1}'s options.</div>
      )}

      {/* Aktif taraf için: pozisyon atama ekranı */}
      {isActive && gamePhase === "placing" && pickedPlayer && (
        <div className="rounded-xl border border-yamabuki/40 bg-yamabuki/5 p-2 space-y-2">
          <div className="text-white text-sm font-semibold">{pickedPlayer.PLAYER_NAME} <span className="text-[11px] text-blue-400 ml-1">{pickedPlayer.primary_arch || "—"}</span></div>
          <div className="flex gap-1.5 flex-wrap">
            {POSITIONS.filter(p => !lineup[p]).map(pos => {
              const eligible = getEligiblePos(pickedPlayer);
              const isElig = eligible.includes(pos);
              const isPrim = eligible[0] === pos;
              return (
                <button key={pos} onClick={() => onPlacePos(pos)}
                  className={`flex-1 min-w-[3rem] py-1.5 border rounded-lg font-bold text-xs transition-all
                    ${isPrim ? "bg-yamabuki/30 border-yamabuki/60 text-yamabuki" : isElig ? "bg-surfaceCard border-gray-600 text-white" : "bg-surfaceBg/50 border-gray-800 text-gray-500"}`}>
                  {pos}{isPrim && <StarIcon size={9} />}
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
          <div className="max-h-80 overflow-auto border border-gray-800 rounded-lg">
            {list.map((p, i) => {
              const banned = isActive && bannedName === p.PLAYER_NAME && !banVoided;
              return (
                <PlayerRow key={i} player={p} discover={isActive && discoverActive}
                  onClick={() => isWaiting && banPicking ? onConfirmBan(p) : onPickPlayer(p)}
                  unaffordable={banned}
                  highlightStat="PTS" />
              );
            })}
            {list.length === 0 && <div className="py-6 text-center text-xs text-gray-600">No players in this group.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Complete: iki oyuncuyu yan yana karşılaştır ─────────────────────────────
function SameScreenResult({ lineups, coaches, fitResults, onReset }) {
  const f1 = fitResults[1], f2 = fitResults[2];
  const s1 = f1 ? Math.round(f1.lineupScore * 100) : 0;
  const s2 = f2 ? Math.round(f2.lineupScore * 100) : 0;
  const winner = s1 === s2 ? 0 : (s1 > s2 ? 1 : 2);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-center">
        <TrophyIcon size={32} />
        <div className="font-logo text-2xl font-bold text-white mt-1">
          {winner === 0 ? "It's a tie!" : `Player ${winner} wins!`}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map(seat => {
          const fit = fitResults[seat];
          const score = fit ? Math.round(fit.lineupScore * 100) : 0;
          return (
            <div key={seat} className={`rounded-2xl border p-4 space-y-3 ${winner === seat ? "border-yamabuki bg-yamabuki/10" : "border-gray-800 bg-surfaceBg"}`}>
              <div className="flex items-center justify-between">
                <span className="font-logo text-base font-bold text-white">Player {seat}</span>
                <span className="text-3xl font-black tabular-nums" style={{ color: winner === seat ? "var(--accent)" : "#e5e7eb" }}>{score}</span>
              </div>
              {coaches[seat] && (
                <div className="text-[11px] text-gray-400 flex items-center gap-1"><CoachIcon size={12} /> {coaches[seat].name}</div>
              )}
              <div className="flex flex-wrap gap-1">
                {POSITIONS.concat(BENCH_SLOTS).map(pos => lineups[seat][pos] && (
                  <span key={pos} className={`text-[10px] px-1.5 py-0.5 rounded border ${POS_COLORS[pos] || "border-gray-700 text-gray-400"}`}>
                    {lineups[seat][pos].PLAYER_NAME?.split(" ").slice(-1)[0]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
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
