import { useState, useEffect, useRef, useCallback } from "react";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB } from "../game/eras";
import { COACHES } from "../game/coaches";
import {
  POSITIONS, ALL_SLOTS, getPrimaryPos, posPenaltyFor,
} from "../game/positions";
import { START_BUDGET, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "../game/salary";
import { buildMatchup, simulateOneGame } from "../game/headToHead";
import SetupHub from "../game/ui/SetupHub";
import EraStep from "../game/ui/EraStep";
import {
  BasketballVersusDraft, BasketballVersusLocked, BasketballVersusHire, BasketballVersusMatchup,
  BasketballVersusSeries, BasketballVersusFinal, capFor,
} from "../game/ui/VersusBasketball";
import PlayerDetailModal from "../game/PlayerDetailModal";
import "../game/game.css";

const EMPTY_LINEUP = { PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null, B4: null };
const EMPTY_JOKERS = {
  reTeam: true, reYear: true, reBoth: true, double: true, discover: true,
  ban: true, forceTeam: true, forceYear: true,
};
const other = (seat) => (seat === 1 ? 2 : 1);

export default function SameScreenGame() {
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
  const [coachOptions1, setCoachOptions1] = useState([]); // 1. oyuncunun işe alım seçenekleri (7i iki kolon gösterir)
  const [shownGame, setShownGame] = useState(null);       // box score gösterilen maç (null = en yeni)

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
    const opts = [...COACHES].sort(() => Math.random() - 0.5).slice(0, 4);
    setCoachOptions(opts); setCoachOptions1(opts);
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
    setShownGame(null);
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
    setCoachOptions([]); setCoachOptions1([]); setCoaches({ 1: null, 2: null }); setShownGame(null);
    setMatchup(null); setSeriesGames([]); setSeriesW({ 1: 0, 2: 0 });
  };

  const seriesOver = seriesW[1] >= 4 || seriesW[2] >= 4;
  const names = { 1: "Player 1", 2: "Player 2" };
  const rearrange = { 1: canRearrange, 2: canRearrange };
  const coachSeat = gamePhase === "coach1" ? 1 : 2;

  const shell = (body) => (
    <div className="h-full overflow-y-auto">
      <SEO title="Same Screen — Lineup Builder" description="Two players draft head-to-head on one screen — same shared pool, snake order, BAN joker, best-of-7 series." path="/basketball/game/same-screen" />
      {body}
      <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
    </div>
  );

  if (gamePhase === "idle") {
    const RULES = [
      { key: "round", label: "Round", hint: "1 spin / round" },
      { key: "pick", label: "Pick", hint: "1 spin / pick" },
    ];
    return shell(
      <SetupHub sport="basketball" eyebrow="SPIN & BUILD · SAME SCREEN" title="Same Screen"
        subtitle="2 players · 1 device · snake draft · best-of-7. Each player has their own 5 jokers plus one counter."
        rules={RULES} ruleKey={wheelMode} onRule={setWheelMode}
        startLabel={seasons.length === 0 ? "Loading…" : "Start draft"} startDisabled={seasons.length === 0}
        onStart={() => setGamePhase("era")}
        steps={[
          { n: "1", t: "Pick an era", d: "Both rosters play inside one era." },
          { n: "2", t: "Draft 9 each", d: "Shared spin, snake order, salary cap." },
          { n: "3", t: "Hire coaches", d: "One each, in draft order." },
          { n: "4", t: "Best-of-7", d: "Simulated game by game." },
        ]}
        total={9} leaderboard={null} />
    );
  }

  if (gamePhase === "era") {
    return shell(
      <EraStep sport="basketball" className="sb-vs" eras={ERAS} blurbs={ERA_META_BLURB} eyebrow="Same Screen · STEP 1 OF 4"
        lede="Both rosters are simulated inside this era. Every player's power scales with distance from their home decade, but an archetype the era loves travels one era closer, one it dumps travels one further."
        onChoose={pickEra} onRandom={() => pickEra(ERAS[Math.floor(Math.random() * ERAS.length)])} />
    );
  }

  if (["spinning", "drafting", "placing"].includes(gamePhase)) {
    return shell(
      <BasketballVersusDraft names={names} eraLabel={simEra?.label} wheelMode={wheelMode} round={round} phase={gamePhase}
        activeSeat={activeSeat} waitingSeat={waitingSeat} season={chosenSeason} team={chosenTeam} statusMsg={statusMsg}
        lineups={lineups} moveSrc={moveSrc} canRearrange={canRearrange} onSlotTap={handleSlotTap}
        jokers={jokers} onUseJoker={useJoker} players={players} posFilter={posFilter} setPosFilter={setPosFilter}
        sortKey={sortKey} setSortKey={setSortKey} discoverActive={discoverActive} doubleActive={doubleActive}
        bannedName={bannedName} banVoided={banVoided} banPicking={banPicking && !!waitingSeat}
        pickedPlayer={pickedPlayer} onPick={pickPlayer} onPlace={placePos} onCancel={cancelPick} onConfirmBan={confirmBan}
        counter={waitingSeat && gamePhase === "drafting" && !counterDismissed && !banPicking
          ? { show: true, jokers: jokers[waitingSeat], onUse: useCounterJoker, onDismiss: () => setCounterDismissed(true) } : null} />
    );
  }

  if (gamePhase === "review") {
    return shell(
      <BasketballVersusLocked names={names} lineups={lineups} simEra={simEra} moveSrc={moveSrc} canRearrange={rearrange}
        onSlotTap={handleSlotTap} onContinue={continueToCoaches} />
    );
  }

  if (gamePhase === "coach1" || gamePhase === "coach2") {
    return shell(
      <BasketballVersusHire key={coachSeat} names={names} active={coachSeat} hired={coaches}
        options={{ 1: coachOptions1, 2: coachSeat === 2 ? coachOptions : [] }} onHire={pickCoach} />
    );
  }

  if (gamePhase === "series" && matchup) {
    if (seriesGames.length === 0) {
      return shell(
        <BasketballVersusMatchup names={names} lineups={lineups} coaches={coaches} simEra={simEra} wins={seriesW} onPlay={playNextGame} />
      );
    }
    return shell(
      <BasketballVersusSeries names={names} games={seriesGames} seriesW={seriesW} seriesOver={seriesOver}
        selected={shownGame} onSelect={setShownGame} onNext={playNextGame} onSeeResult={() => setGamePhase("complete")} />
    );
  }

  if (gamePhase === "complete") {
    return shell(
      <BasketballVersusFinal names={names} lineups={lineups} coaches={coaches} seriesW={seriesW} seriesGames={seriesGames} onAgain={resetGame} />
    );
  }
  return shell(null);
}
