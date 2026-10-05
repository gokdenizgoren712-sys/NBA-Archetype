import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import { ERAS } from "../game/eras";
import { COACHES, pickCoachOptions } from "../game/coaches";
import {
  POSITIONS, ALL_SLOTS, getPrimaryPos, posPenaltyFor,
} from "../game/positions";
import { START_BUDGET, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "../game/salary";
import { buildMatchup, simulateOneGame } from "../game/headToHead";
import { computeLineupFit } from "../game/lineupScore";
import PlayerDetailModal from "../game/PlayerDetailModal";
import SeasonSimPanel from "../game/SeasonSimPanel";
import {
  BasketballVersusDraft, BasketballVersusLocked, BasketballVersusHire, BasketballVersusMatchup,
  BasketballVersusSeries, BasketballVersusFinal,
} from "../game/ui/VersusBasketball";
import { RoomEntry, RoomGate, RoomShare, RoomSetup, RoomNotice, RoomBanner } from "../game/ui/RoomUi";
import "../game/game.css";

const EMPTY_LINEUP = { PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null, B4: null };
const NO_JOKERS = { reTeam: false, reYear: false, reBoth: false, double: false, discover: false, ban: false, forceTeam: false, forceYear: false };

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
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [joinFail, setJoinFail] = useState(null);      // { code, msg }: bulunamadı / dolu kartı
  const [showFinal, setShowFinal] = useState(false);    // seri bitti, sonuç ekranı henüz açılmadı
  const [shownGame, setShownGame] = useState(null);     // box score gösterilen maç (null = en yeni)

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

  const { connected, send, fatalError } = useGameSocket(
    roomCode ? `/ws/game/room/${roomCode}` : null,
    token,
    { onMessage: onSocketMessage },
  );

  // Faz3-M6: sunucu bağlantıyı kalıcı reddettiğinde (oda yok/artık senin
  // değil, oturum süresi doldu) useGameSocket bir daha denemeyi bırakır ve
  // bunu bildirir — önceden bu durumda ekran sonsuza dek "Connecting…"
  // gösterirdi. Odayı tamamen terk edip lobiye dön.
  const leaveFatalRoom = () => {
    setRoomCode(null);
    setServerState(null);
    setActionError("");
    setOpponentDisconnected(false);
  };

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
      .catch(e => { setErrorMsg(""); setJoinFail({ code, msg: e.message }); })
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
  let myCoachObj = null;
  if (game && (game.phase === "series" || game.phase === "complete")) {
    const seatLineups = { 1: game.lineups[myUserId], 2: game.lineups[opponentUserId] };
    const seatCoaches = {
      1: COACHES.find(c => c.name === game.coaches[myUserId]) || null,
      2: COACHES.find(c => c.name === game.coaches[opponentUserId]) || null,
    };
    matchup = buildMatchup(seatLineups, seatCoaches, simEra);
    myCoachObj = seatCoaches[1];
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

  // ── Ekranlar: tümü game/ui (oda: RoomUi, oyun: VersusBasketball). Mantık yukarıda. ──
  const names = { 1: user?.username || "You", 2: opponentUsername || "Friend" };
  const rulesLine = `${simEra ? `${simEra.label} · ` : ""}classic · 9 spins each · best of 7${room?.wheel_mode === "pick" || (!room && wheelModeChoice === "pick") ? " · 1 spin per pick" : ""}`;
  const entryRules = `Salary cap · ${wheelModeChoice === "pick" ? "1 spin per pick" : "1 spin per round"} · 9 players each · best of 7`;
  const isHost = !!room && myUserId === room.player1_user_id;
  const hostName = room ? (isHost ? names[1] : names[2]) : names[1];
  const guestName = room ? (isHost ? names[2] : names[1]) : names[2];
  const seatCards = {
    host: { name: hostName, tag: isHost ? "you" : "host", status: "Ready" },
    opponent: opponentConnected ? { name: guestName, tag: isHost ? "guest" : "you", status: "Joined" } : null,
  };
  const goModes = () => navigate("/basketball/game");

  const banners = (
    <div className="sb-room-banners">
      {roomCode && !fatalError && !connected && <RoomBanner tone="warn">Reconnecting…</RoomBanner>}
      {opponentDisconnected && <RoomBanner tone="warn">{opponentUsername || "Your opponent"}'s connection dropped. The game resumes automatically when they reconnect.</RoomBanner>}
      {actionError && <RoomBanner tone="bad">{actionError}</RoomBanner>}
    </div>
  );

  const shell = (body) => (
    <div className="h-full overflow-y-auto">
      <SEO title="With a Friend — Lineup Builder" description="Challenge a friend to a head-to-head draft, from two different devices — same rules as Same Screen, synced live over the network." path="/basketball/game/friend" />
      {body}
      {banners}
      <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
    </div>
  );

  if (!isLoggedIn) {
    return shell(<RoomGate sport="basketball" title="With a Friend" onSignIn={() => navigate("/login")}
      onAlt={() => navigate("/basketball/game/same-screen")} altLabel="Play Same Screen instead" />);
  }

  if (joinFail) {
    const full = /full/i.test(joinFail.msg);
    return shell(<RoomNotice sport="basketball" tone="bad" kicker="Error"
      title={full ? "Room is full" : /not found|no room/i.test(joinFail.msg) ? "Room not found" : "Could not join"}
      text={full ? "This room already has two players. Ask your friend for a new code or create your own." : /not found|no room/i.test(joinFail.msg) ? `No room matches ${joinFail.code}. Check the 6-character code or ask your friend to resend it.` : joinFail.msg}
      code={joinFail.code}
      actions={[{ label: "Try again", onClick: () => setJoinFail(null) }, { label: "Create a room", onClick: () => { setJoinFail(null); createRoom(); }, solid: true }, { label: "Back to modes", onClick: goModes }]} />);
  }

  if (!roomCode) {
    return shell(<RoomEntry sport="basketball" modeLabel="Basketball · WITH A FRIEND" wheelMode={wheelModeChoice} onWheel={setWheelModeChoice}
      onCreate={createRoom} creating={creating} code={joinCodeInput} onCode={setJoinCodeInput} onJoin={joinRoom} joining={joining}
      error={errorMsg} rulesLine={entryRules} />);
  }

  if (fatalError) {
    return shell(<RoomNotice sport="basketball" tone="bad" kicker="Connection" title="Can't reach this room" text={fatalError.message}
      code={roomCode} actions={[{ label: "Back to lobby", onClick: leaveFatalRoom, solid: true }, { label: "Back to modes", onClick: goModes }]} />);
  }

  if (!game) {
    if (!opponentConnected) {
      return shell(<RoomShare sport="basketball" modeLabel="Basketball" code={roomCode}
        sub={!connected ? "Opening the room…" : "Waiting for your friend to join…"}
        host={{ name: names[1], tag: "host", status: connected ? "Ready" : "Connecting" }} opponent={null}
        rulesLine={entryRules} inviteUrl={`${window.location.origin}/basketball/game/friend?room=${roomCode}`} onLeave={leaveFatalRoom} />);
    }
    return shell(<RoomSetup sport="basketball" modeLabel="Basketball" code={roomCode} title="Setting up" accent="the game"
      host={seatCards.host} opponent={seatCards.opponent} rulesLine={rulesLine} eras={[]} canPick={false} waitText="Setting up the game…" />);
  }

  const bothNames = names;
  const lineups = { 1: game.lineups[myUserId] || EMPTY_LINEUP, 2: game.lineups[opponentUserId] || EMPTY_LINEUP };

  if (game.phase === "era") {
    return shell(<RoomSetup sport="basketball" modeLabel="Basketball" code={roomCode}
      title={isHost ? "Guest joined ·" : "Waiting for"} accent={isHost ? "pick the era" : "the host"}
      host={seatCards.host} opponent={seatCards.opponent} rulesLine={rulesLine}
      eras={ERAS.map(e => ({ ...e, years: `${e.years[0]}–${Math.min(e.years[1], 2026)}` }))}
      canPick={isHost} onPick={pickEraAction} onRandom={() => pickEraAction(ERAS[Math.floor(Math.random() * ERAS.length)])}
      waitText={`${hostName} is picking the simulation era…`} />);
  }

  if (game.phase === "drafting" || game.phase === "placing") {
    const banPickingMe = !isMyTurn && !!game.ban_picking;
    const poolVisible = game.phase === "placing" ? isMyTurn : (isMyTurn || banPickingMe);
    return shell(
      <BasketballVersusDraft title="With a Friend" names={bothNames} eraLabel={simEra?.label} wheelMode={game.wheel_mode || room?.wheel_mode || "round"}
        round={game.round} phase={spinAnimating ? "spinning" : game.phase} activeSeat={isMyTurn ? 1 : 2} waitingSeat={isMyTurn ? 2 : 1}
        season={game.chosen_season} team={game.chosen_team} lineups={lineups} moveSrc={{ 1: moveSrc, 2: null }}
        canRearrange={{ 1: canRearrange, 2: false }} onSlotTap={(seat, pos) => seat === 1 && handleSlotTap(pos)}
        jokers={{ 1: game.jokers[myUserId] || NO_JOKERS, 2: game.jokers[opponentUserId] || NO_JOKERS }} canAct={isMyTurn} onUseJoker={useJokerAction}
        players={poolVisible ? applyTeamPricing(game.pool || []) : []} posFilter={posFilter} setPosFilter={setPosFilter}
        sortKey={sortKey} setSortKey={setSortKey} discoverActive={!!game.discover_active} doubleActive={!!game.double_active}
        bannedName={game.banned_player_id} banVoided={!!game.ban_voided} banPicking={banPickingMe}
        pickedPlayer={isMyTurn ? game.picked_player : null} onPick={pickPlayerAction} onPlace={placePosAction} onCancel={cancelPickAction}
        onConfirmBan={confirmBanAction} poolVisible={poolVisible} waitText={`${bothNames[2]} is picking…`}
        counter={!isMyTurn && game.phase === "drafting" && !game.counter_dismissed && !game.ban_picking
          ? { show: true, jokers: game.jokers[myUserId] || NO_JOKERS, onUse: useCounterJokerAction, onDismiss: dismissCounterAction } : null} />
    );
  }

  if (game.phase === "review") {
    const myReady = game.ready_for_coaches?.[myUserId];
    return shell(
      <BasketballVersusLocked title="With a Friend" names={bothNames} lineups={lineups} simEra={simEra} moveSrc={{ 1: moveSrc, 2: null }}
        canRearrange={{ 1: canRearrange, 2: false }} onSlotTap={(seat, pos) => seat === 1 && handleSlotTap(pos)}
        canContinue={!myReady} continueLabel={myReady ? "Waiting for opponent…" : "Continue to coaches"} onContinue={readyForCoachesAction} />
    );
  }

  if (game.phase === "coach1" || game.phase === "coach2") {
    const pickerUid = game.phase === "coach1" ? game.player1_user_id : game.player2_user_id;
    const activeSeatNo = pickerUid === myUserId ? 1 : 2;
    const hired = {
      1: COACHES.find(c => c.name === game.coaches?.[myUserId]) || null,
      2: COACHES.find(c => c.name === game.coaches?.[opponentUserId]) || null,
    };
    const opts = game.coach_seed != null ? pickCoachOptions(game.coach_seed) : [];
    return shell(
      <BasketballVersusHire key={game.phase} title="With a Friend" names={bothNames} active={activeSeatNo} hired={hired}
        options={{ 1: activeSeatNo === 1 ? opts : [], 2: activeSeatNo === 2 ? opts : [] }} canAct={activeSeatNo === 1}
        onHire={(seat, c) => pickCoachAction(c)}
        waitTexts={{ 1: `Waiting for ${bothNames[activeSeatNo]} to hire first.`, 2: `Waiting for ${bothNames[activeSeatNo]} to hire first.` }}
        note="Attack and defence grades shift the team score all game. The host hires first, then the guest. A hire cannot be taken back." />
    );
  }

  if ((game.phase === "series" || game.phase === "complete") && matchup) {
    const coachesBySeat = {
      1: COACHES.find(c => c.name === game.coaches?.[myUserId]) || null,
      2: COACHES.find(c => c.name === game.coaches?.[opponentUserId]) || null,
    };
    const games = (game.series_games || []).map(toSeatGame).sort((a, b) => b.gameIndex - a.gameIndex);
    const seriesW = { 1: game.series_wins?.[myUserId] || 0, 2: game.series_wins?.[opponentUserId] || 0 };
    const seriesOver = seriesW[1] >= 4 || seriesW[2] >= 4;
    if (game.phase === "series" && games.length === 0) {
      return shell(<BasketballVersusMatchup title="With a Friend" names={bothNames} lineups={lineups} coaches={coachesBySeat} simEra={simEra} wins={seriesW} onPlay={playNextGameAction} />);
    }
    if (game.phase === "series" || !showFinal) {
      return shell(
        <BasketballVersusSeries names={bothNames} games={games} seriesW={seriesW} seriesOver={seriesOver} selected={shownGame} onSelect={setShownGame}
          onNext={playNextGameAction} onSeeResult={() => setShowFinal(true)} />
      );
    }
    const extra = (
      <div className="sb-skin" style={{ width: "min(860px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <SaveStarters lineup={lineups[1]} simEra={simEra} token={token} />
        {game.mode === "challenge" && game.real_season && game.real_team && (
          <BonusHistoryPanel game={game} matchup={matchup} coach={coachesBySeat[1]} simEra={simEra} />
        )}
      </div>
    );
    return shell(
      <BasketballVersusFinal title="With a Friend" names={bothNames} lineups={lineups} coaches={coachesBySeat} seriesW={seriesW}
        seriesGames={games} onAgain={goModes} againLabel="Back to modes" extra={extra} />
    );
  }

  return shell(null);
}

// "Save my starting 5": eski sonuç kartındaki işlev, yeni finalin altında
function SaveStarters({ lineup, simEra, token }) {
  const [state, setState] = useState("idle");   // idle | saving | saved | error
  const starters = POSITIONS.map(p => lineup[p]).filter(Boolean);
  if (!token || starters.length === 0) return null;
  const save = async () => {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    const fit = computeLineupFit(starters, simEra);
    const pct = fit ? Math.round(fit.lineupScore * 100) : 0;
    const grade = pct >= 85 ? "S" : pct >= 78 ? "A" : pct >= 70 ? "B" : pct >= 62 ? "C" : "D";
    const names = starters.map(p => p.PLAYER_NAME);
    try {
      const r = await fetch("/api/profile/saved-lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ players: names, score: pct / 100, grade, pct, label: names.join(" · ") }),
      });
      setState(r.ok ? "saved" : "error");
    } catch { setState("error"); }
  };
  return (
    <button type="button" className="sb-btn" style={{ alignSelf: "center" }} disabled={state === "saving" || state === "saved"} onClick={save}>
      {state === "saved" ? "Saved to your lineups" : state === "saving" ? "Saving…" : state === "error" ? "Couldn't save, try again" : "Save my starting 5"}
    </button>
  );
}

// ── Rewrite History bonus (Board Challenge) ─────────────────────────────────
// Board kadrosu gerçek bir sezon/takımın yerine geçtiyse (bkz. LineupGame.jsx
// Single Player Rewrite History), meydan okuyan AYNI sezondan FARKLI bir
// gerçek takımı kendi kadrosuyla simüle edebilir. Kullanıcı kararı: bu koşu
// 7 maçlık seriden TAMAMEN AYRI, isteğe bağlı bir ekstra — seri sonucunu
// ETKİLEMEZ, hiçbir şey leaderboard'a kaydedilmez (SeasonSimPanel noSave).
function BonusHistoryPanel({ game, matchup, coach, simEra }) {
  const [open, setOpen] = useState(false);
  const side = matchup[1];
  return (
    <div className="g-panel p-4 space-y-3" style={{ border: "1px solid rgba(255,177,27,.25)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] flex items-center gap-1.5" style={{ color: "var(--yamabuki)" }}>
            <DnaIcon size={12} /> Rewrite History — Bonus
          </div>
          <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">
            This board roster played as the <span className="text-white font-semibold">{game.real_season} {game.real_team}</span>.
            Simulate your own roster as a different {game.real_season} team — just for fun, it won't change the series.
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)}
            className="shrink-0 px-3 py-2 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5"
            style={{ background: "linear-gradient(90deg,#FFD470,#FFB11B)", color: "#000" }}>
            <DnaIcon size={12} /> Simulate
          </button>
        )}
      </div>
      {open && (
        <SeasonSimPanel
          players={side.players} bench={side.bench} coach={coach}
          simEra={simEra} fit={side.fit} affinity01={null}
          enableRealHistory fixedSeason={game.real_season} excludeTeam={game.real_team} noSave
        />
      )}
    </div>
  );
}
