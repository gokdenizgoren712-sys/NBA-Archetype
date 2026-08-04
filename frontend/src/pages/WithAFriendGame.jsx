import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import { ERAS, ERA_META_BLURB } from "../game/eras";
import { COACHES, pickCoachOptions } from "../game/coaches";
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
import CounterJokerPrompt from "../game/CounterJokerPrompt";
import BenchCoverage from "../game/BenchCoverage";
import HowItWorksPanel from "../game/HowItWorksPanel";
import MechanicsPanel from "../game/MechanicsPanel";
import WheelModePicker from "../game/WheelModePicker";
import GameBox from "../game/GameBox";
import HowToPlayModal from "../game/HowToPlayModal";
import PlayerDetailModal from "../game/PlayerDetailModal";
import {
  TargetIcon, WheelIcon, UsersIcon, TrophyIcon, CheckIcon, LinkIcon,
  StarIcon, CoachIcon, CapIcon, RefreshIcon, CalendarIcon, BoltIcon,
  SearchIcon, WarnIcon, DiceIcon, PlayIcon, EyeIcon,
} from "../game/GameIcons";

const EMPTY_LINEUP = { PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null, B4: null };
const SORT_KEYS = [
  ["TAGGED", "TAGGED"], ["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"],
  ["FG3_PCT", "3P%"], ["STL", "STL"], ["BLK", "BLK"],
];

function capFor(lineup) {
  const filled = Object.values(lineup || EMPTY_LINEUP).filter(Boolean);
  const budgetLeft = START_BUDGET - totalSpent(filled);
  const slotsLeft = ALL_SLOTS.length - filled.length;
  return { budgetLeft, cap: maxSpendNow(budgetLeft, slotsLeft) };
}

export default function WithAFriendGame() {
  const { token, user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [wheelModeChoice, setWheelModeChoice] = useState("round");
  const [roomCode, setRoomCode] = useState(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState(null);

  const [serverState, setServerState] = useState(null);
  const [actionError, setActionError] = useState("");
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  // ── Yerel-only UI state (Same Screen'deki gibi, ama tek taraflı — sadece
  // KENDİ panelim için) ────────────────────────────────────────────────────
  const [posFilter, setPosFilter] = useState("");
  const [sortKey, setSortKey] = useState("PTS");
  const [moveSrc, setMoveSrc] = useState(null);

  // ── Kozmetik spin animasyonu: sunucu sonucu ANINDA biliyor, biz sadece
  // Same Screen'deki gibi görsel gecikmeyi (1.6+1.6sn) yerel oynatıyoruz ──
  const [seasons, setSeasons] = useState([]);
  const [teamPool, setTeamPool] = useState([]);
  const [spinS, setSpinS] = useState(false);
  const [spinT, setSpinT] = useState(false);
  const [targetSIdx, setTargetSIdx] = useState(0);
  const [targetTIdx, setTargetTIdx] = useState(0);
  const [spinAnimating, setSpinAnimating] = useState(false);
  const lastSpinSeqRef = useRef(null);
  const spinTimerRef = useRef(null);

  useEffect(() => {
    fetch("/api/game/seasons").then(r => r.json()).then(d => setSeasons(d.seasons || ["2025-26"])).catch(() => {});
    return () => clearTimeout(spinTimerRef.current);
  }, []);

  const refreshRoom = useCallback((code) => {
    fetch(`/api/game/room/${code}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setServerState(prev => ({ ...prev, room: d, usernames: d.usernames })))
      .catch(() => {});
  }, [token]);

  const onSocketMessage = useCallback((data) => {
    if (data.type === "state") {
      setServerState(data);
      setOpponentDisconnected(false);   // reconnect olduysa (tam state geldi) banner'ı kaldır
    } else if (data.type === "opponent_joined") {
      if (roomCode) refreshRoom(roomCode);
    } else if (data.type === "opponent_left") {
      setOpponentDisconnected(true);
      if (roomCode) refreshRoom(roomCode);
    } else if (data.type === "error") {
      setActionError(data.message || "Something went wrong");
      setTimeout(() => setActionError(""), 3000);
    }
  }, [roomCode, refreshRoom]);

  const { connected, send } = useGameSocket(
    roomCode ? `/ws/game/room/${roomCode}` : null,
    token,
    { onMessage: onSocketMessage },
  );

  const createRoom = () => {
    setErrorMsg(""); setCreating(true);
    fetch("/api/game/room", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "friend", wheel_mode: wheelModeChoice }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || "Could not create room");
        setRoomCode(d.room_code);
      })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setCreating(false));
  };

  // entry_id -> ayrık fonksiyon: hem manuel giriş (joinRoom, input state'inden)
  // hem de Online Opponent'ten gelen ?room= otomatik girişi (aşağıdaki effect)
  // aynı yolu kullansın diye — state timing sorununa düşmeden doğrudan code
  // parametresi alır.
  const joinRoomByCode = useCallback((rawCode) => {
    const code = rawCode.trim().toUpperCase();
    if (code.length < 4) { setErrorMsg("Enter a valid room code"); return; }
    setErrorMsg(""); setJoining(true);
    fetch(`/api/game/room/${code}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || "Could not join room");
        setServerState(prev => ({ ...prev, room: d, usernames: d.usernames }));
        setRoomCode(code);
      })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setJoining(false));
  }, [token]);

  const joinRoom = () => joinRoomByCode(joinCodeInput);

  // INTEGRATION: matchmaking-accept — Online Opponent eşleşme/challenge
  // sonrası navigate(`/game/friend?room=${code}`) yapıyor, burada otomatik
  // katılıyoruz (elle kod girmeye gerek yok).
  useEffect(() => {
    const r = searchParams.get("room");
    if (r && !roomCode && isLoggedIn) joinRoomByCode(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const copyCode = () => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const room = serverState?.room;
  const usernames = serverState?.usernames || {};
  const game = serverState?.game;
  const myUserId = user?.id;
  const opponentUserId = room ? (room.player1_user_id === myUserId ? room.player2_user_id : room.player1_user_id) : null;
  const opponentUsername = opponentUserId ? usernames[opponentUserId] : null;
  const opponentConnected = !!opponentUserId;
  const seatUid = { 1: myUserId, 2: opponentUserId };
  const seatName = { 1: user?.username || "You", 2: opponentUsername || "…" };

  // ── Spin animasyon tetikleyicisi ────────────────────────────────────────
  useEffect(() => {
    if (!game) return;
    if (lastSpinSeqRef.current === null) { lastSpinSeqRef.current = game.spin_seq; return; }
    if (game.spin_seq === lastSpinSeqRef.current) return;
    lastSpinSeqRef.current = game.spin_seq;

    clearTimeout(spinTimerRef.current);
    setSpinAnimating(true);
    const sIdx = Math.max(0, seasons.indexOf(game.chosen_season));
    setTargetSIdx(sIdx);
    setSpinS(true); setSpinT(false);
    spinTimerRef.current = setTimeout(() => {
      setSpinS(false);
      fetch(`/api/game/teams?season=${encodeURIComponent(game.chosen_season)}`)
        .then(r => r.json())
        .then(d => {
          const teams = d.teams || [];
          setTeamPool(teams);
          const tIdx = Math.max(0, teams.indexOf(game.chosen_team));
          setTargetTIdx(tIdx);
          setSpinT(true);
          spinTimerRef.current = setTimeout(() => { setSpinT(false); setSpinAnimating(false); }, 1600);
        })
        .catch(() => setSpinAnimating(false));
    }, 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.spin_seq]);

  const simEra = game ? ERAS.find(e => e.id === game.sim_era_id) : null;
  const activeUid = game ? game.turn_queue[game.turn_pos] : null;
  const waitingUid = game ? (activeUid === game.player1_user_id ? game.player2_user_id : game.player1_user_id) : null;
  const isMyTurn = activeUid === myUserId;
  const canRearrange = game && !["era", "series", "complete"].includes(game.phase);

  // ── Aksiyon gönderenler ─────────────────────────────────────────────────
  const pickEraAction = (era) => { if (myUserId === room.player1_user_id) send({ type: "pick_era", era_id: era.id }); };
  const pickPlayerAction = (player) => {
    const cost = priceOf(player);
    const { cap } = capFor(game.lineups[myUserId]);
    if (cost > cap) return;
    send({ type: "pick_player", player: { ...player, _cost: cost } });
  };
  const cancelPickAction = () => send({ type: "cancel_pick" });
  const placePosAction = (pos) => {
    const picked = game.picked_player;
    if (!picked) return;
    const isStarter = POSITIONS.includes(pos);
    const isPrimary = isStarter && getPrimaryPos(picked) === pos;
    const enriched = {
      ...picked, _season: game.chosen_season, _team: game.chosen_team, _isPrimary: isPrimary,
      _assignedPos: pos, _isBench: !isStarter, _posPenalty: posPenaltyFor(picked, pos),
    };
    send({ type: "place_pos", pos, player: enriched });
  };
  const useJokerAction = (type) => send({ type: "use_joker", joker: type });
  const useCounterJokerAction = (type) => send({ type: "use_counter_joker", joker: type });
  const confirmBanAction = (player) => send({ type: "confirm_ban", player_name: player.PLAYER_NAME });
  const dismissCounterAction = () => send({ type: "dismiss_counter" });
  const handleSlotTap = (slot) => {
    if (!canRearrange) return;
    const myLineup = game.lineups[myUserId];
    if (moveSrc == null) {
      if (myLineup[slot]) setMoveSrc(slot);
      return;
    }
    if (moveSrc === slot) { setMoveSrc(null); return; }
    send({ type: "rearrange_slot", slot_a: moveSrc, slot_b: slot });
    setMoveSrc(null);
  };
  const readyForCoachesAction = () => send({ type: "ready_for_coaches" });
  const pickCoachAction = (coach) => send({ type: "pick_coach", coach_name: coach.name });

  let matchup = null;
  if (game && (game.phase === "series" || game.phase === "complete")) {
    const seatLineups = { 1: game.lineups[myUserId], 2: game.lineups[opponentUserId] };
    const seatCoaches = {
      1: COACHES.find(c => c.name === game.coaches[myUserId]) || null,
      2: COACHES.find(c => c.name === game.coaches[opponentUserId]) || null,
    };
    matchup = buildMatchup(seatLineups, seatCoaches, simEra);
  }
  const playNextGameAction = () => {
    if (!matchup) return;
    const gameIndex = game.series_games.length;
    const result = simulateOneGame(matchup, gameIndex);
    send({
      type: "advance_series",
      game: {
        gameIndex,
        home_user_id: seatUid[result.home],
        winner_user_id: seatUid[result.winner],
        box: { [myUserId]: result.box[1], [opponentUserId]: result.box[2] },
        teamPts: { [myUserId]: result.teamPts[1], [opponentUserId]: result.teamPts[2] },
      },
    });
  };
  const toSeatGame = (g) => ({
    gameIndex: g.gameIndex,
    home: g.home_user_id === myUserId ? 1 : 2,
    winner: g.winner_user_id === myUserId ? 1 : 2,
    box: { 1: g.box[myUserId], 2: g.box[opponentUserId] },
    teamPts: { 1: g.teamPts[myUserId], 2: g.teamPts[opponentUserId] },
  });

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="With a Friend — Lineup Builder" description="Challenge a friend to a head-to-head draft, from two different devices — same rules as Same Screen, synced live over the network." path="/game/friend" />
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-6">
        <div>
          <h1 className="font-logo text-2xl font-bold text-white tracking-wide">With a Friend</h1>
          <p className="text-xs text-gray-500 mt-1">
            Same rules as Same Screen — Salary Cap, jokers, BAN, best-of-7 series — but you and your friend each play from your own device. Create a room and share the code, or join one.
          </p>
        </div>

        {!roomCode && (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_640px_340px] gap-4 justify-center max-w-[1400px] mx-auto">
            <div className="order-2 lg:order-1 space-y-3 min-w-0">
              <HowItWorksPanel
                steps={[
                  ["1", WheelIcon, "text-yamabuki", "Pick your wheel", "round- or pick-based"],
                  ["2", LinkIcon, "text-asagi", "Create or join", "share a room code"],
                  ["3", UsersIcon, "text-brandBlue", "Snake draft 9v9", "shared pool · salary cap"],
                  ["4", TrophyIcon, "text-yamabuki", "Best-of-7 series", "simulate to a champion"],
                ]}
                note={<>Each side plays from their own device — your pick shows up on your friend's screen the moment you make it. Same <span className="text-emerald-300 font-semibold">Salary Cap</span> rules as Same Screen.</>}
              />
            </div>

            <div className="order-1 lg:order-2 space-y-3">
              <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 flex items-center justify-center gap-5">
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border-2 border-brandBlue/60 bg-brandBlue/10 flex items-center justify-center text-brandBlue"><UsersIcon size={24} /></div>
                  <div className="font-logo text-sm font-bold text-white mt-2">{user?.username || "You"}</div>
                </div>
                <div className="font-logo text-2xl font-black text-gray-600">VS</div>
                <div className="flex-1 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full border-2 border-brandRed/60 bg-brandRed/10 flex items-center justify-center text-brandRed"><UsersIcon size={24} /></div>
                  <div className="font-logo text-sm font-bold text-gray-500 mt-2">A friend</div>
                </div>
              </div>

              {!isLoggedIn ? (
                <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 text-center space-y-3">
                  <p className="text-sm text-gray-400">You need to be logged in to create or join a room.</p>
                  <button onClick={() => navigate("/login")}
                    className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white transition-colors">
                    Log In
                  </button>
                </div>
              ) : (
                <>
                  <WheelModePicker value={wheelModeChoice} onChange={setWheelModeChoice} />
                  <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-4 space-y-3">
                    <button onClick={createRoom} disabled={creating}
                      className="w-full px-6 py-3 rounded-xl font-logo font-bold text-lg inline-flex items-center justify-center gap-2 transition-colors duration-200 text-darkBg bg-yamabuki hover:bg-white disabled:opacity-60 shadow-[0_0_20px_rgba(255,177,27,0.3)]">
                      <WheelIcon size={17} /> {creating ? "Creating…" : "Create Room"}
                    </button>
                    <div className="flex items-center gap-2 text-[10px] text-gray-600 uppercase tracking-widest">
                      <div className="flex-1 h-px bg-gray-800" /> or join <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <div className="flex gap-2">
                      <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="ROOM CODE" maxLength={8}
                        className="flex-1 min-w-0 bg-surfaceCard border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-white placeholder:text-gray-600 focus:outline-none focus:border-yamabuki/60" />
                      <button onClick={joinRoom} disabled={joining}
                        className="px-5 py-2.5 rounded-lg font-logo font-bold text-sm border border-gray-700 text-white hover:border-yamabuki/60 disabled:opacity-60 transition-colors">
                        {joining ? "Joining…" : "Join"}
                      </button>
                    </div>
                    {errorMsg && <p className="text-[11px] text-red-400">{errorMsg}</p>}
                  </div>
                  <div className="text-center">
                    <button onClick={() => setHowToPlayOpen(true)}
                      className="text-xs text-gray-500 hover:text-yamabuki underline underline-offset-2 transition-colors">
                      How to Play
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="order-3 space-y-3 min-w-0">
              <MechanicsPanel />
            </div>
          </div>
        )}

        {roomCode && !game && (
          <div className="max-w-md mx-auto text-center bg-surfaceBg border border-gray-800 rounded-2xl p-6 space-y-4">
            {!connected && <p className="text-sm text-gray-500 animate-pulse">Connecting…</p>}
            {connected && !opponentConnected && (
              <>
                <div className="text-[11px] text-gray-500 uppercase tracking-widest">Room Code — share this with your friend</div>
                <div className="flex items-center justify-center gap-2">
                  <div className="font-logo text-4xl font-black text-yamabuki tracking-[0.2em]">{roomCode}</div>
                  <button onClick={copyCode} title="Copy code"
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-yamabuki/60 transition-colors">
                    {copied ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 animate-pulse">Waiting for your friend to join…</p>
              </>
            )}
            {connected && opponentConnected && (
              <p className="text-sm text-gray-500 animate-pulse">Setting up the game…</p>
            )}
          </div>
        )}

        {game && (
          <div className="space-y-3">
            {actionError && (
              <div className="max-w-md mx-auto text-center text-[11px] text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg py-1.5 px-3">{actionError}</div>
            )}
            {opponentDisconnected && (
              <div className="max-w-md mx-auto text-center text-[11px] text-yellow-400 bg-yellow-950/30 border border-yellow-800/40 rounded-lg py-1.5 px-3 animate-pulse">
                Opponent's connection dropped — waiting for them to reconnect. The game will resume automatically.
              </div>
            )}

            {game.phase === "era" && (
              <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 space-y-3 max-w-3xl mx-auto">
                {myUserId === room.player1_user_id ? (
                  <>
                    <div className="text-[11px] text-gray-400 uppercase tracking-widest mb-1">Pick Your Simulation Era</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ERAS.map(era => (
                        <button key={era.id} onClick={() => pickEraAction(era)}
                          className={`text-left rounded-xl border p-3 transition-all hover:scale-[1.02] ${era.bg}`}>
                          <div className={`text-sm font-bold ${era.color}`}>{era.label}</div>
                          <div className="text-[9.5px] text-gray-500 mt-0.5">{era.years[0]}–{Math.min(era.years[1], 2026)}</div>
                          <div className="text-[10px] text-gray-400 mt-1.5 leading-snug">{ERA_META_BLURB[era.id]}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => pickEraAction(ERAS[Math.floor(Math.random() * ERAS.length)])}
                      className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-300 transition-colors inline-flex items-center justify-center gap-2">
                      <DiceIcon size={15} /> Random Era
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center animate-pulse py-6">Waiting for {opponentUsername} to pick the simulation era…</p>
                )}
              </div>
            )}

            {(game.phase === "drafting" || game.phase === "placing") && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-[11px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 font-logo uppercase tracking-widest">Round {game.round}</span>
                  {simEra && <span className={`text-[9px] px-1.5 py-0.5 rounded border ${simEra.bg} ${simEra.color}`}>SIM: {simEra.short}</span>}
                  {!spinAnimating && (
                    <span className="text-[11px] text-yamabuki font-logo font-bold uppercase tracking-widest">
                      {isMyTurn ? "Your pick" : `${seatName[2]}'s pick`} — {isMyTurn ? seatName[2] : "you"} waiting
                    </span>
                  )}
                </div>

                {spinAnimating && (
                  <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5">
                    <div className="flex justify-center gap-8 mb-4">
                      <SpinWheel items={seasons} spinning={spinS} targetIdx={targetSIdx} label="Season" />
                      <SpinWheel items={teamPool.length > 0 ? teamPool : ["..."]} spinning={spinT} targetIdx={targetTIdx} label="Team" />
                    </div>
                    <p className="text-center text-xs text-gray-500 animate-pulse">Spinning...</p>
                  </div>
                )}

                {!spinAnimating && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SeatPanel seat={1} uid={myUserId} username={seatName[1]} opponentName={opponentUsername}
                      isActive={isMyTurn} isWaiting={!isMyTurn}
                      lineup={game.lineups[myUserId]} moveSrc={moveSrc} canRearrange={canRearrange}
                      onSlotTap={handleSlotTap}
                      jokers={game.jokers[myUserId]}
                      chosenTeam={game.chosen_team} chosenSeason={game.chosen_season}
                      players={applyTeamPricing(game.pool)}
                      posFilter={posFilter} setPosFilter={setPosFilter}
                      sortKey={sortKey} setSortKey={setSortKey}
                      pickedPlayer={isMyTurn ? game.picked_player : null}
                      gamePhase={game.phase}
                      doubleActive={game.double_active} discoverActive={game.discover_active}
                      bannedName={game.banned_player_id} banVoided={game.ban_voided}
                      banPicking={!isMyTurn && game.ban_picking}
                      counterDismissed={game.counter_dismissed}
                      onPickPlayer={pickPlayerAction} onPlacePos={placePosAction} onCancelPick={cancelPickAction}
                      onUseJoker={useJokerAction} onUseCounterJoker={useCounterJokerAction}
                      onDismissCounter={dismissCounterAction} onConfirmBan={confirmBanAction}
                      onPlayerInfo={setDetailPlayer}
                      interactive
                    />
                    <SeatPanel seat={2} uid={opponentUserId} username={seatName[2]}
                      isActive={!isMyTurn} isWaiting={isMyTurn}
                      lineup={game.lineups[opponentUserId]} moveSrc={null} canRearrange={false}
                      onSlotTap={() => {}}
                      jokers={game.jokers[opponentUserId]}
                      chosenTeam={game.chosen_team} chosenSeason={game.chosen_season}
                      players={[]}
                      posFilter="" setPosFilter={() => {}}
                      sortKey={sortKey} setSortKey={() => {}}
                      pickedPlayer={null}
                      gamePhase={game.phase}
                      doubleActive={game.double_active} discoverActive={game.discover_active}
                      bannedName={game.banned_player_id} banVoided={game.ban_voided}
                      banPicking={false}
                      counterDismissed={game.counter_dismissed}
                      onPlayerInfo={setDetailPlayer}
                      interactive={false}
                    />
                  </div>
                )}
              </div>
            )}

            {game.phase === "review" && (
              <ReviewPanel game={game} myUserId={myUserId} opponentUserId={opponentUserId}
                seatName={seatName} simEra={simEra} moveSrc={moveSrc} canRearrange={canRearrange}
                onSlotTap={handleSlotTap} onReady={readyForCoachesAction} onPlayerInfo={setDetailPlayer} />
            )}

            {(game.phase === "coach1" || game.phase === "coach2") && (() => {
              const pickerUid = game.phase === "coach1" ? game.player1_user_id : game.player2_user_id;
              const pickerName = pickerUid === myUserId ? "You" : opponentUsername;
              const coachOptions = game.coach_seed != null ? pickCoachOptions(game.coach_seed) : [];
              return (
                <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-5 space-y-3 max-w-2xl mx-auto">
                  <div className="text-[11px] text-gray-400 uppercase tracking-widest">{pickerName} — Hire a Coach</div>
                  {pickerUid === myUserId ? (
                    <div className="grid grid-cols-2 gap-2">
                      {coachOptions.map(c => (
                        <button key={c.name} onClick={() => pickCoachAction(c)}
                          className="text-left rounded-xl border border-gray-800 bg-surfaceCard p-3 hover:border-yamabuki/60 transition-all">
                          <div className="font-logo text-sm font-bold text-white flex items-center gap-1.5"><CoachIcon size={14} /> {c.name}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{c.years} · {c.champs} rings</div>
                          <div className="text-[10px] text-gray-400 mt-1">OFF {c.off} · DEF {c.def} {c.tag && <span className="text-violet-300 ml-1">{c.tag}</span>}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center animate-pulse py-6">Waiting for {opponentUsername} to hire a coach…</p>
                  )}
                </div>
              );
            })()}

            {game.phase === "series" && matchup && (
              <SeriesPanel game={game} matchup={matchup} seatName={seatName}
                myUserId={myUserId} opponentUserId={opponentUserId}
                toSeatGame={toSeatGame} onNextGame={playNextGameAction} />
            )}

            {game.phase === "complete" && (
              <ResultPanel game={game} seatName={seatName} myUserId={myUserId} opponentUserId={opponentUserId}
                simEra={simEra} token={token} onPlayerInfo={setDetailPlayer} />
            )}
          </div>
        )}

        <HowToPlayModal open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
        <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
      </div>
    </div>
  );
}

// ── Bir tarafın paneli — Same Screen'in PlayerSeatPanel'iyle aynı görsel
// düzen, ama seat 2 (rakip) HER ZAMAN salt-okunur (interactive=false) ───────
function SeatPanel({
  seat, uid, username, opponentName, isActive, isWaiting, lineup, moveSrc, canRearrange, onSlotTap, jokers,
  chosenTeam, chosenSeason, players, posFilter, setPosFilter, sortKey, setSortKey, pickedPlayer,
  gamePhase, doubleActive, discoverActive, bannedName, banVoided, banPicking, counterDismissed,
  onPickPlayer, onPlacePos, onCancelPick, onUseJoker, onUseCounterJoker, onDismissCounter, onConfirmBan,
  onPlayerInfo, interactive,
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
  const { budgetLeft, cap } = capFor(lineup || EMPTY_LINEUP);
  const eligible = pickedPlayer ? getEligiblePos(pickedPlayer) : [];
  const lu = lineup || EMPTY_LINEUP;

  return (
    <div className={`rounded-2xl border p-3 space-y-2 ${isActive ? "border-yamabuki/50 bg-yamabuki/5" : "border-gray-800 bg-surfaceBg"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-sm font-bold text-white truncate">{username}</span>
        {isActive && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-yamabuki/20 border border-yamabuki/50 text-yamabuki font-bold uppercase tracking-wider shrink-0">{interactive ? "Your pick" : "Picking"}</span>}
        {isWaiting && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 uppercase tracking-wider shrink-0">Waiting</span>}
      </div>

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
        <p className="text-[9.5px] text-yamabuki/90">Moving {lu[moveSrc]?.PLAYER_NAME?.split(" ").slice(-1)[0]} — tap a destination slot</p>
      )}
      <div className="flex gap-1">
        {POSITIONS.map(pos => <LineupSlot key={pos} pos={pos} player={lu[pos]}
          selected={moveSrc === pos} canTap={canRearrange} onTap={onSlotTap} onInfo={onPlayerInfo} />)}
      </div>
      <div className="flex gap-1 opacity-80">
        {BENCH_SLOTS.map(pos => <LineupSlot key={pos} pos={pos} player={lu[pos]} bench
          selected={moveSrc === pos} canTap={canRearrange} onTap={onSlotTap} onInfo={onPlayerInfo} />)}
      </div>
      <BenchCoverage bench={BENCH_SLOTS.map(pos => lu[pos])} />

      {interactive && (
        <>
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

          {isWaiting && gamePhase === "drafting" && !counterDismissed && !banPicking && (
            <CounterJokerPrompt jokers={jokers} activeSeat={seat === 1 ? 2 : 1} activeName={opponentName} onUse={onUseCounterJoker} onDismiss={onDismissCounter} />
          )}
          {isWaiting && banPicking && (
            <div className="text-[10.5px] text-yamabuki">Pick a player below to BAN from their options.</div>
          )}

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
                {POSITIONS.filter(p => !lu[p]).map(pos => {
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
              {BENCH_SLOTS.some(b => !lu[b]) && (
                <div className="flex gap-1.5">
                  {BENCH_SLOTS.filter(b => !lu[b]).map(b => (
                    <button key={b} onClick={() => onPlacePos(b)}
                      className="flex-1 py-1.5 border border-gray-700 rounded-lg text-xs text-gray-300 hover:border-yamabuki/50">{b}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {gamePhase === "drafting" && (isActive || isWaiting) && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                {isWaiting && !banPicking && (
                  <span className="text-[9px] text-gray-600 uppercase tracking-wider">watching —</span>
                )}
                <span className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">{chosenTeam} · {chosenSeason}</span>
                <span className="ml-auto flex items-center border rounded overflow-hidden" style={{ borderColor: "#262626" }}>
                  {["G", "F", "C"].map(g => (
                    <button key={g} onClick={() => setPosFilter(f => f === g ? "" : g)}
                      className={`px-2 py-0.5 font-logo text-[10px] font-bold border-r last:border-r-0 ${posFilter === g ? "bg-yamabuki text-darkBg" : "text-gray-400"}`}
                      style={{ borderColor: "#262626" }}>{g}</button>
                  ))}
                </span>
              </div>
              {(isActive || isWaiting) && (
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
                  const readOnly = isWaiting && !banPicking;
                  return (
                    <PlayerRow key={i} player={p} discover={isActive && discoverActive}
                      onClick={() => {
                        if (isWaiting && banPicking) return onConfirmBan(p);
                        if (isActive) onPickPlayer(p);
                      }}
                      cost={cost}
                      unaffordable={banned || overCap}
                      dimmed={readOnly}
                      highlightStat={sortKey === "TAGGED" ? "PTS" : sortKey} />
                  );
                })}
                {list.length === 0 && <div className="py-6 text-center text-xs text-gray-600">No players in this group.</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Draft tamamlandı: roster preview, iki taraf da onaylamalı ───────────────
function ReviewPanel({ game, myUserId, opponentUserId, seatName, simEra, moveSrc, canRearrange, onSlotTap, onReady, onPlayerInfo }) {
  const myReady = game.ready_for_coaches[myUserId];
  const oppReady = game.ready_for_coaches[opponentUserId];
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="text-center">
        <div className="font-logo text-lg font-bold text-white">Rosters Complete</div>
        <p className="text-xs text-gray-500 mt-0.5">Review both teams. Tap a slot to rearrange your own lineup one last time.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TeamPreviewCard username={seatName[1]} lineup={game.lineups[myUserId]} simEra={simEra}
          moveSrc={moveSrc} canRearrange={canRearrange} onSlotTap={onSlotTap} ready={myReady} onPlayerInfo={onPlayerInfo} />
        <TeamPreviewCard username={seatName[2]} lineup={game.lineups[opponentUserId]} simEra={simEra}
          moveSrc={null} canRearrange={false} onSlotTap={() => {}} ready={oppReady} onPlayerInfo={onPlayerInfo} />
      </div>
      <div className="text-center">
        <button onClick={onReady} disabled={myReady}
          className="px-8 py-2.5 rounded-xl font-logo font-bold text-darkBg bg-yamabuki hover:bg-white disabled:opacity-50 transition-colors inline-flex items-center gap-2">
          <CoachIcon size={15} /> {myReady ? "Waiting for opponent…" : "Continue to Coaches"}
        </button>
      </div>
    </div>
  );
}

function TeamPreviewCard({ username, lineup, simEra, moveSrc, canRearrange, onSlotTap, ready, onPlayerInfo }) {
  const lu = lineup || EMPTY_LINEUP;
  const starters = POSITIONS.map(p => lu[p]).filter(Boolean);
  const fit = computeLineupFit(starters, simEra);
  const pct = fit ? Math.round(fit.lineupScore * 100) : 0;
  const perPlayerMap = {};
  POSITIONS.forEach((pos, i) => { if (lu[pos] && fit?.perPlayer?.[i]) perPlayerMap[pos] = fit.perPlayer[i]; });

  const Row = ({ pos, bench }) => {
    const p = lu[pos]; if (!p) return null;
    const pp = perPlayerMap[pos];
    const base = Math.round((parseFloat(p.overall_score) || 0) * 100);
    const qPct = pp ? Math.round(pp.quality * 100) : base;
    const isPrimary = !bench && getPrimaryPos(p) === pos;
    return (
      <button onClick={() => onSlotTap(pos)} disabled={!canRearrange}
        className={`w-full flex items-center gap-2 py-1.5 border-b last:border-b-0 text-left transition-colors
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
        <span className="font-logo text-sm font-bold text-white flex items-center gap-1.5 truncate">
          {username}
          {ready && <span className="text-emerald-300 shrink-0"><CheckIcon size={13} /></span>}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9.5px] text-gray-500 uppercase tracking-widest">Team Score</span>
          <span className={`font-logo text-xl font-black tabular-nums ${pct >= 78 ? "text-blue-300" : pct >= 62 ? "text-sky-300" : "text-gray-300"}`}>{pct}</span>
        </div>
      </div>
      {canRearrange && moveSrc && (
        <p className="text-[9.5px] text-yamabuki/90">Moving {lu[moveSrc]?.PLAYER_NAME?.split(" ").slice(-1)[0]} — tap a destination slot</p>
      )}
      <div>
        {POSITIONS.map(pos => <Row key={pos} pos={pos} />)}
        {BENCH_SLOTS.map(pos => <Row key={pos} pos={pos} bench />)}
      </div>
      <BenchCoverage bench={BENCH_SLOTS.map(pos => lu[pos])} />
    </div>
  );
}

// ── Best-of-7 seri — her iki taraf da "Simulate Game N"e basabilir ─────────
function SeriesPanel({ game, matchup, seatName, myUserId, opponentUserId, toSeatGame, onNextGame }) {
  const myWins = game.series_wins[myUserId] || 0;
  const oppWins = game.series_wins[opponentUserId] || 0;
  const seriesOver = myWins >= 4 || oppWins >= 4;
  const games = game.series_games || [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-center">
        <div className="font-logo text-[11px] uppercase tracking-widest text-gray-500 mb-1">Best-of-7 Series</div>
        <div className="font-logo text-4xl font-black text-white tabular-nums">
          {myWins}<span className="text-gray-600 mx-2">–</span>{oppWins}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {seriesOver
            ? `${myWins > oppWins ? seatName[1] : seatName[2]} wins the series ${Math.max(myWins, oppWins)}-${Math.min(myWins, oppWins)}`
            : myWins === oppWins ? "Series tied" : (myWins > oppWins ? `${seatName[1]} leads` : `${seatName[2]} leads`)}
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

      <div className="space-y-3">
        {games.map((g) => <GameBox key={g.gameIndex} game={toSeatGame(g)} labels={{ 1: seatName[1], 2: seatName[2] }} />)}
      </div>
    </div>
  );
}

function gradeFor(pct) {
  return pct >= 85 ? "S" : pct >= 78 ? "A" : pct >= 70 ? "B" : pct >= 62 ? "C" : "D";
}

function TeamEvalCard({ name, wins, won, coach, lineup, simEra, mine, token, onPlayerInfo }) {
  const starters = POSITIONS.map(p => lineup[p]).filter(Boolean);
  const fit = computeLineupFit(starters, simEra);
  const pct = fit ? Math.round(fit.lineupScore * 100) : 0;
  const grade = gradeFor(pct);
  const coveragePct = Math.round((fit?.coverage || 0) * 100);
  const qualityPct = Math.round((fit?.avgQuality || 0) * 100);
  const roleFitPct = Math.round((fit?.roleFit ?? 1) * 100);

  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const saveLineup = async () => {
    if (!token || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    const names = starters.map(p => p.PLAYER_NAME);
    try {
      const r = await fetch("/api/profile/saved-lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ players: names, score: pct / 100, grade, pct, label: names.join(" · ") }),
      });
      setSaveState(r.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
  };

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${won ? "border-yamabuki bg-yamabuki/10" : "border-gray-800 bg-surfaceBg"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-base font-bold text-white truncate">{name}</span>
        <span className="text-3xl font-black tabular-nums shrink-0" style={{ color: won ? "var(--accent)" : "#e5e7eb" }}>{wins}</span>
      </div>
      {coach && (
        <div className="text-[11px] text-gray-400 flex items-center gap-1"><CoachIcon size={12} /> {coach}</div>
      )}

      <div className="rounded-xl border border-gray-800 bg-darkBg/40 p-3 flex items-center gap-3">
        <div className="text-center shrink-0">
          <div className={`font-logo text-3xl font-black tabular-nums ${pct >= 78 ? "text-blue-400" : pct >= 62 ? "text-sky-400" : "text-gray-300"}`}>{pct}</div>
          <div className={`font-logo text-sm font-bold ${pct >= 85 ? "text-blue-300" : pct >= 78 ? "text-sky-300" : pct >= 70 ? "text-emerald-300" : pct >= 62 ? "text-yamabuki" : "text-red-400"}`}>{grade}</div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-1.5 min-w-0">
          {[["Quality", qualityPct], ["Coverage", coveragePct], ["Role Fit", roleFitPct]].map(([label, val]) => (
            <div key={label} className="rounded-lg border border-gray-800 bg-surfaceCard/60 py-1.5 text-center">
              <div className={`text-sm font-black ${val >= 75 ? "text-blue-300" : val >= 55 ? "text-gray-200" : "text-red-400"}`}>{val}</div>
              <div className="text-[8px] text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <BenchCoverage bench={BENCH_SLOTS.map(pos => lineup[pos])} />

      <div className="flex flex-wrap gap-1">
        {POSITIONS.concat(BENCH_SLOTS).map(pos => lineup[pos] && (
          <button key={pos} onClick={() => onPlayerInfo && onPlayerInfo(lineup[pos])}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${POS_COLORS[pos] || "border-gray-700 text-gray-400"} hover:brightness-125`}
            title={`${lineup[pos]._cost ?? priceOf(lineup[pos])}% cap — tap for details`}>
            {lineup[pos].PLAYER_NAME?.split(" ").slice(-1)[0]}
          </button>
        ))}
      </div>

      {mine && token && (
        <button onClick={saveLineup} disabled={saveState === "saving" || saveState === "saved"}
          className={`w-full py-2 rounded-lg text-xs font-logo font-bold transition-colors inline-flex items-center justify-center gap-1.5
            ${saveState === "saved" ? "border border-emerald-600/50 text-emerald-300 bg-emerald-950/30 cursor-default"
              : "border border-gray-700 text-gray-300 hover:border-yamabuki/60 hover:text-yamabuki"}`}>
          {saveState === "saved" ? <><CheckIcon size={13} /> Saved to your lineups</>
            : saveState === "saving" ? "Saving…"
            : saveState === "error" ? "Couldn't save — try again"
            : "Save my starting 5"}
        </button>
      )}
    </div>
  );
}

function ResultPanel({ game, seatName, myUserId, opponentUserId, simEra, token, onPlayerInfo }) {
  const myWins = game.series_wins[myUserId] || 0;
  const oppWins = game.series_wins[opponentUserId] || 0;
  const iWon = myWins > oppWins;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-center">
        <TrophyIcon size={32} />
        <div className="font-logo text-2xl font-bold text-white mt-1">
          {myWins === oppWins ? "It's a tie!" : `${iWon ? seatName[1] : seatName[2]} wins the series!`}
        </div>
        <div className="font-logo text-3xl font-black text-white mt-1 tabular-nums">
          {myWins}<span className="text-gray-600 mx-2">–</span>{oppWins}
        </div>
        <div className="text-[11px] text-gray-500 mt-1">{(game.series_games || []).length} game{(game.series_games || []).length !== 1 ? "s" : ""} played</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TeamEvalCard uid={myUserId} name={seatName[1]} wins={myWins} won={iWon}
          coach={game.coaches[myUserId]} lineup={game.lineups[myUserId]} simEra={simEra}
          mine token={token} onPlayerInfo={onPlayerInfo} />
        <TeamEvalCard uid={opponentUserId} name={seatName[2]} wins={oppWins} won={!iWon && myWins !== oppWins}
          coach={game.coaches[opponentUserId]} lineup={game.lineups[opponentUserId]} simEra={simEra}
          mine={false} token={token} onPlayerInfo={onPlayerInfo} />
      </div>
      <p className="text-center text-xs text-gray-500">Head back to the mode select screen to start a new room.</p>
    </div>
  );
}
