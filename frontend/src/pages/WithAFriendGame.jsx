import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import { ERAS, ERA_META_BLURB, ERA_HEX } from "../game/eras";
import { COACHES, pickCoachOptions } from "../game/coaches";
import { getPlayerTags } from "../game/awards";
import {
  POSITIONS, BENCH_SLOTS, ALL_SLOTS, getPrimaryPos, getEligiblePos, posPenaltyFor, isFlex, POS_COLORS,
} from "../game/positions";
import { START_BUDGET, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "../game/salary";
import { computeLineupFit } from "../game/lineupScore";
import { buildMatchup, simulateOneGame } from "../game/headToHead";
import InlineSpin from "../game/InlineSpin";
import LineupSlot from "../game/LineupSlot";
import PlayerRow, { posGroupOf } from "../game/PlayerRow";
import JokerBtn from "../game/JokerBtn";
import CounterJokerPrompt from "../game/CounterJokerPrompt";
import BenchCoverage from "../game/BenchCoverage";
import FullCourtBoard from "../game/FullCourtBoard";
import CoachPicker from "../game/CoachPicker";
import DraftAnalysis from "../game/DraftAnalysis";
import GameBox from "../game/GameBox";
import PlayerDetailModal from "../game/PlayerDetailModal";
import {
  WheelIcon, UsersIcon, TrophyIcon, CheckIcon, LinkIcon,
  StarIcon, CoachIcon, CapIcon, RefreshIcon, CalendarIcon, BoltIcon,
  SearchIcon, WarnIcon, DiceIcon, PlayIcon, EyeIcon, LoopIcon,
} from "../game/GameIcons";
import "../game/game.css";

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
        {/* ── HEADER DOCK: başlık + çark alt-modu anahtarı tek barda ── */}
        {!roomCode ? (
          <div className="g-dock">
            <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />
            <div className="g-dock-left">
              <h1 className="g-dock-title">With a Friend</h1>
              <p className="g-dock-sub">2 devices · room code · snake draft · best-of-7</p>
            </div>

            <div className="g-dock-center">
              {isLoggedIn ? (
                <button onClick={createRoom} disabled={creating} className="aura-rating-btn"
                  style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em", opacity: creating ? 0.6 : 1 }}>
                  <WheelIcon size={16} /> <span className="ml-2">{creating ? "Creating…" : "Create Room"}</span>
                </button>
              ) : (
                <button onClick={() => navigate("/login")} className="aura-rating-btn"
                  style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em" }}>
                  Log In to Play
                </button>
              )}
            </div>

            <div className="g-dock-right">
              {isLoggedIn && (
                <div className="g-seg stacked">
                  {[
                    { key: "round", Icon: WheelIcon, hex: "#60a5fa", label: "Round", hint: "1 spin / round" },
                    { key: "pick", Icon: LoopIcon, hex: "#FFB11B", label: "Pick", hint: "1 spin / pick" },
                  ].map(({ key, Icon, hex, label, hint }) => (
                    <button key={key} onClick={() => setWheelModeChoice(key)}
                      className={`g-seg-btn${wheelModeChoice === key ? " on" : ""}`}
                      style={{ "--accent": hex, "--accent-a": hex + "22", "--accent-line": hex + "66" }}>
                      <Icon size={14} /> {label}
                      <span className="opacity-55 font-normal tracking-normal normal-case">({hint})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : !(game && ["drafting", "placing"].includes(game.phase)) ? (
          // Draft fazının kendi ince dock'u var; başlığı tekrar yazma.
          <div>
            <h1 className="font-logo text-2xl font-bold text-white tracking-wide">With a Friend</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Same rules as Same Screen — Salary Cap, jokers, BAN, best-of-7 series — but you and your friend each play from your own device. Create a room and share the code, or join one.
            </p>
          </div>
        ) : null}

        {/* ── LOBBY: tam saha ──────────────────────────────────────────────
            Yan paneller (Match Flow / Match Mechanics) kaldırıldı — kurallar
            giriş ekranındaki mod kartının ⓘ'sinde tek kaynaktan anlatılıyor.
            Kalan tek işlevsel parça oda kodu; o da kortun altında. */}
        {!roomCode && (
          <div className="space-y-3">
            <FullCourtBoard
              names={{ 1: user?.username || "You", 2: "A friend" }}
              status={isLoggedIn ? "Lobby" : "Signed Out"}
            />

            {!isLoggedIn ? (
              <div className="g-panel subtle p-5 text-center max-w-md mx-auto">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Log in above to create or join a room.</p>
              </div>
            ) : (
              <div className="g-panel p-4 space-y-3 max-w-md mx-auto">
                <div className="g-label">Join an existing room</div>
                <div className="flex gap-2">
                  <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE" maxLength={8}
                    className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none"
                    style={{ color: "var(--text-primary)", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)" }} />
                  <button onClick={joinRoom} disabled={joining}
                    className="aura-rating-btn" style={{ padding: "10px 20px", fontSize: 14 }}>
                    {joining ? "Joining…" : "Join"}
                  </button>
                </div>
                {errorMsg && <p className="text-[11px] text-red-400">{errorMsg}</p>}
              </div>
            )}
          </div>
        )}


        {roomCode && !game && (
          <div className="max-w-md mx-auto text-center g-panel p-6 space-y-4">
            {!connected && <p className="text-sm text-gray-500 animate-pulse">Connecting…</p>}
            {connected && !opponentConnected && (
              <>
                <div className="text-[11px] text-gray-500 uppercase tracking-widest">Room Code — share this with your friend</div>
                <div className="flex items-center justify-center gap-2">
                  <div className="font-logo text-4xl font-black text-yamabuki tracking-[0.2em]">{roomCode}</div>
                  <button onClick={copyCode} title="Copy code"
                    className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors" style={{color:"var(--text-muted)",border:"1px solid rgba(255,255,255,.12)"}}>
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
              <div className="g-panel p-5 space-y-3 max-w-3xl mx-auto">
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
                      className="aura-pill-btn w-full justify-center" style={{padding:"10px"}}>
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
                {/* ── İNCE DOCK: tur durumu | spin | düşen takım ── */}
                <div className="g-dock thin">
                  <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: -30, top: -60, width: 220, height: 130, opacity: spinAnimating ? 0.24 : 0.12, transition: "opacity .4s ease" }} />

                  <div className="g-dock-left flex items-center gap-3">
                    <h1 className="g-dock-title">Round {game.round}</h1>
                    {simEra && (
                      <span className="g-status" style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.14)", "--accent-line": "rgba(156,163,175,.4)" }}>
                        {simEra.short}
                      </span>
                    )}
                  </div>

                  <div className="g-dock-center">
                    {spinAnimating ? (
                      <div className="g-spin-row flex items-center gap-7">
                        <InlineSpin items={seasons} spinning={spinS} targetIdx={targetSIdx} label="Season" accent="#FFB11B" />
                        <InlineSpin items={teamPool.length > 0 ? teamPool : ["…"]} spinning={spinT} targetIdx={targetTIdx} label="Team" accent="#60a5fa" />
                      </div>
                    ) : (
                      <span className="font-logo text-[12px] font-bold uppercase tracking-widest" style={{ color: "var(--yamabuki)" }}>
                        {isMyTurn ? "Your pick" : `${seatName[2]}'s pick`} — {isMyTurn ? seatName[2] : "you"} waiting
                      </span>
                    )}
                  </div>

                  <div className="g-dock-right">
                    {game.season && !spinAnimating && (
                      <div className="g-dock-team">
                        <div className="tm">{game.team}</div>
                        <div className="yr">{game.season}</div>
                      </div>
                    )}
                  </div>
                </div>

                {spinAnimating && (
                  <p className="text-center text-xs animate-pulse py-8" style={{ color: "var(--text-muted)" }}>Spinning…</p>
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
                <CoachPicker
                  title={`${pickerName} — Hire a Coach`}
                  options={coachOptions}
                  onPick={pickCoachAction}
                  waitingFor={pickerUid === myUserId ? null : opponentUsername}
                />
              );
            })()}

            {game.phase === "series" && matchup && (
              <SeriesPanel game={game} matchup={matchup} seatName={seatName} simEra={simEra}
                myUserId={myUserId} opponentUserId={opponentUserId}
                toSeatGame={toSeatGame} onNextGame={playNextGameAction} />
            )}

            {game.phase === "complete" && (
              <ResultPanel game={game} seatName={seatName} myUserId={myUserId} opponentUserId={opponentUserId}
                simEra={simEra} token={token} onPlayerInfo={setDetailPlayer} />
            )}
          </div>
        )}

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
    <div className={`rounded-2xl border p-3 space-y-2 ${isActive ? "border-yamabuki/60 bg-yamabuki/[.06] shadow-[0_0_24px_-8px_rgba(255,177,27,.7)]" : "border-white/8 bg-white/[.02]"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-sm font-bold text-white truncate">{username}</span>
        {isActive && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-yamabuki/20 border border-yamabuki/50 text-yamabuki font-bold uppercase tracking-wider shrink-0">{interactive ? "Your pick" : "Picking"}</span>}
        {isWaiting && <span className="text-[9.5px] px-2 py-0.5 rounded-full border border-white/12 text-[var(--text-faint)] uppercase tracking-wider shrink-0">Waiting</span>}
      </div>

      <div className="g-panel subtle px-2 py-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500 uppercase tracking-wider flex items-center gap-1"><CapIcon size={11} /> Cap</span>
          <span className={`font-black tabular-nums ${budgetLeft <= 15 ? "text-red-400" : budgetLeft <= 35 ? "text-yamabuki" : "text-emerald-300"}`}>{budgetLeft}%</span>
        </div>
        <div className="g-bar-track mt-1" style={{height:6}}>
          <div className="g-bar-fill" style={{ width: `${budgetLeft}%`, "--fill": budgetLeft <= 15 ? "#f87171" : budgetLeft <= 35 ? "#FFB11B" : "#4ade80", "--fill-a": (budgetLeft <= 15 ? "#f87171" : budgetLeft <= 35 ? "#FFB11B" : "#4ade80") + "66" }} />
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
                        ${isPrim ? "bg-yamabuki/25 border-yamabuki text-yamabuki shadow-[0_0_16px_-5px_#FFB11B]" : isElig ? "bg-white/[.04] border-white/20 text-white" : "border-dashed border-white/12 text-[var(--text-faint)]"}`}>
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
                      className="flex-1 py-1.5 rounded-xl text-xs transition-all hover:-translate-y-px" style={{color:"var(--text-muted)",border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.03)"}}>{b}</button>
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
              <div className="max-h-80 overflow-auto rounded-xl" style={{border:"1px solid rgba(255,255,255,.08)"}}>
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
  const seatLineups = { 1: game.lineups[myUserId] || EMPTY_LINEUP, 2: game.lineups[opponentUserId] || EMPTY_LINEUP };
  const teamScore = (seat) => {
    const fit = computeLineupFit(POSITIONS.map(p => seatLineups[seat][p]).filter(Boolean), simEra);
    return fit ? Math.round(fit.lineupScore * 100) : 0;
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="font-logo text-lg font-bold text-white">Rosters Complete</div>
        <p className="text-xs text-gray-500 mt-0.5">Review both teams. Tap a slot on your half of the court to rearrange one last time.</p>
      </div>

      {/* İki kadro TEK sahada. Sadece KENDİ yarını düzenleyebilirsin —
          rakibin dizilimi sunucudan geliyor, dokunulamaz. */}
      <FullCourtBoard
        lineups={seatLineups}
        names={{ 1: seatName[1], 2: seatName[2] }}
        label="// Rosters Locked"
        status="Review"
        scores={{ 1: teamScore(1), 2: teamScore(2) }}
        moveSrc={{ 1: moveSrc, 2: null }}
        canTap={{ 1: canRearrange, 2: false }}
        onSlotTap={(seat, slot) => seat === 1 && onSlotTap(slot)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
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
        <span className={`text-[9.5px] font-bold px-1.5 py-1 rounded border shrink-0 w-8 text-center ${bench ? "border-white/12 text-[var(--text-faint)]" : POS_COLORS[pos] || ""}`}>
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
        <div className="g-bar-track w-12 shrink-0" style={{height:6}}>
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
    <div className="g-panel p-4 space-y-2">
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
function SeriesPanel({ game, matchup, seatName, myUserId, opponentUserId, toSeatGame, onNextGame, simEra }) {
  const myWins = game.series_wins[myUserId] || 0;
  const oppWins = game.series_wins[opponentUserId] || 0;
  const seriesOver = myWins >= 4 || oppWins >= 4;
  const games = game.series_games || [];
  const seatLineups = { 1: game.lineups[myUserId] || EMPTY_LINEUP, 2: game.lineups[opponentUserId] || EMPTY_LINEUP };
  const seatCoaches = {
    1: COACHES.find(c => c.name === game.coaches?.[myUserId]) || null,
    2: COACHES.find(c => c.name === game.coaches?.[opponentUserId]) || null,
  };

  return (
    <div className="space-y-4">
      {/* Seri boyunca sabit: kim kime karşı oynuyor, tek sahada */}
      <FullCourtBoard
        lineups={seatLineups}
        names={{ 1: seatName[1], 2: seatName[2] }}
        coaches={seatCoaches}
        label="// Series Matchup"
        status={seriesOver ? "Final" : `Game ${games.length + 1}`}
      />

      {/* Simülasyon ÖNCESİ karne — ilk maç oynanana kadar açık durur */}
      {games.length === 0 && (
        <DraftAnalysis simEra={simEra}
          teams={[
            { name: seatName[1], lineup: seatLineups[1], coach: seatCoaches[1] },
            { name: seatName[2], lineup: seatLineups[2], coach: seatCoaches[2] },
          ]} />
      )}

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
    <div className={`rounded-2xl border p-4 space-y-3 ${won ? "border-yamabuki bg-yamabuki/[.08] shadow-[0_0_30px_-10px_rgba(255,177,27,.8)]" : "border-white/8 bg-white/[.02]"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-base font-bold text-white truncate">{name}</span>
        <span className="text-3xl font-black tabular-nums shrink-0" style={{ color: won ? "var(--accent)" : "#e5e7eb" }}>{wins}</span>
      </div>
      {coach && (
        <div className="text-[11px] text-gray-400 flex items-center gap-1"><CoachIcon size={12} /> {coach}</div>
      )}

      <div className="g-panel subtle p-3 flex items-center gap-3">
        <div className="text-center shrink-0">
          <div className={`font-logo text-3xl font-black tabular-nums ${pct >= 78 ? "text-blue-400" : pct >= 62 ? "text-sky-400" : "text-gray-300"}`}>{pct}</div>
          <div className={`font-logo text-sm font-bold ${pct >= 85 ? "text-blue-300" : pct >= 78 ? "text-sky-300" : pct >= 70 ? "text-emerald-300" : pct >= 62 ? "text-yamabuki" : "text-red-400"}`}>{grade}</div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-1.5 min-w-0">
          {[["Quality", qualityPct], ["Coverage", coveragePct], ["Role Fit", roleFitPct]].map(([label, val]) => (
            <div key={label} className="g-panel subtle py-1.5 text-center">
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
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${POS_COLORS[pos] || "border-white/12 text-[var(--text-muted)]"} hover:brightness-125`}
            title={`${lineup[pos]._cost ?? priceOf(lineup[pos])}% cap — tap for details`}>
            {lineup[pos].PLAYER_NAME?.split(" ").slice(-1)[0]}
          </button>
        ))}
      </div>

      {mine && token && (
        <button onClick={saveLineup} disabled={saveState === "saving" || saveState === "saved"}
          className={`w-full py-2 rounded-lg text-xs font-logo font-bold transition-colors inline-flex items-center justify-center gap-1.5
            ${saveState === "saved" ? "border border-emerald-600/50 text-emerald-300 bg-emerald-950/30 cursor-default"
              : "border border-white/12 text-[var(--text-muted)] hover:border-yamabuki/60 hover:text-yamabuki"}`}>
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
