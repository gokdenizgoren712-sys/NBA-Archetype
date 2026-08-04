import { useState, useEffect, useRef, useCallback } from "react";
import { SEO } from "../hooks/useSEO";
import { ERAS, ERA_META_BLURB, ERA_HEX } from "../game/eras";
import { COACHES } from "../game/coaches";
import { getPlayerTags } from "../game/awards";
import { ERA_GUIDE } from "../data/glossary";
import InfoModal from "../game/InfoModal";
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
import FullCourtBoard from "../game/FullCourtBoard";
import CoachPicker from "../game/CoachPicker";
import DraftAnalysis from "../game/DraftAnalysis";
import GameBox from "../game/GameBox";
import CounterJokerPrompt from "../game/CounterJokerPrompt";
import BenchCoverage from "../game/BenchCoverage";
import PlayerDetailModal from "../game/PlayerDetailModal";
import {
  StarIcon, CoachIcon, TrophyIcon, WheelIcon, CapIcon, RefreshIcon,
  CalendarIcon, BoltIcon, UsersIcon, SearchIcon, WarnIcon, DiceIcon, PlayIcon,
  EyeIcon, LoopIcon, InfoIcon,
} from "../game/GameIcons";
import "../game/game.css";

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
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [eraInfo, setEraInfo] = useState(null);
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
        {/* ── HEADER DOCK: başlık + çark alt-modu anahtarı tek barda ── */}
        {gamePhase === "idle" ? (
          <div className="g-dock">
            <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />
            <div className="g-dock-left">
              <h1 className="g-dock-title">Same Screen</h1>
              <p className="g-dock-sub">2 players · 1 device · snake draft · best-of-7</p>
            </div>

            {/* Kurallar artık giriş ekranındaki mod kartının ⓘ'sinde —
                burada ikinci bir "How to Play" tutmuyoruz. */}
            <div className="g-dock-center">
              <button onClick={() => setGamePhase("era")} className="aura-rating-btn"
                style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em" }}>
                <WheelIcon size={16} /> <span className="ml-2">Start Draft Phase</span>
              </button>
            </div>

            <div className="g-dock-right">
              <div className="g-seg stacked">
                {[
                  { key: "round", Icon: WheelIcon, hex: "#60a5fa", label: "Round", hint: "1 spin / round" },
                  { key: "pick", Icon: LoopIcon, hex: "#FFB11B", label: "Pick", hint: "1 spin / pick" },
                ].map(({ key, Icon, hex, label, hint }) => (
                  <button key={key} onClick={() => setWheelMode(key)}
                    className={`g-seg-btn${wheelMode === key ? " on" : ""}`}
                    style={{ "--accent": hex, "--accent-a": hex + "22", "--accent-line": hex + "66" }}>
                    <Icon size={14} /> {label}
                    <span className="opacity-55 font-normal tracking-normal normal-case">({hint})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : !["era", "spinning", "drafting", "placing"].includes(gamePhase) ? (
          // Bu fazların kendi ince dock'u var; başlığı tekrar yazma.
          <div>
            <h1 className="font-logo text-2xl font-bold text-white tracking-wide">Same Screen</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              One shared spin each round, both players draft under a Salary Cap budget. Snake order. Each player has their own 5 jokers plus one shared-round BAN. Winner is decided in a best-of-7 series.
            </p>
          </div>
        ) : null}

        {/* ── IDLE: tam saha ───────────────────────────────────────────────
            Yan paneller (Match Flow / How Scoring Works / Match Mechanics)
            kaldırıldı — hepsi giriş ekranındaki mod kartının ⓘ'sinde tek
            kaynaktan anlatılıyor. Bu ekranın işi oyunun şeklini göstermek,
            o da 1v1: tam saha + iki bench. */}
        {gamePhase === "idle" && (
          <FullCourtBoard status="Lobby" />
        )}

        {gamePhase === "era" && (
          <>
            <div className="g-dock thin">
              <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: -30, top: -60, width: 220, height: 130, opacity: 0.14 }} />
              <div className="g-dock-left"><h1 className="g-dock-title">Same Screen</h1></div>
              <div className="g-dock-center">
                <span className="g-mono" style={{ color: "var(--yamabuki)" }}>// Step 1 — Pick Your Simulation Era</span>
              </div>
              <div className="g-dock-right" />
            </div>

            <div className="g-panel p-5 space-y-3 max-w-3xl mx-auto">
              <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: "20%", top: -50, width: 260, height: 140, opacity: 0.16 }} />
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Both rosters are simulated inside this era. Every player's power scales with distance from their home decade —
                but an archetype the era loves travels one era closer, one it dumps travels one further.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ERAS.map(era => {
                  const eHex = ERA_HEX[era.id] || "#9ca3af";
                  return (
                    <div key={era.id} className="g-tile" onClick={() => pickEra(era)}
                      style={{ "--accent": eHex, "--accent-a": eHex + "1a", "--accent-line": eHex + "55" }}>
                      <span className="aura-blob" style={{ "--slot-color": eHex, right: -24, top: -24, width: 120, height: 88, opacity: 0.26 }} />
                      <button className="g-tile-info" title={`About the ${era.label}`}
                        onClick={(e) => { e.stopPropagation(); setEraInfo(era); }}>
                        <InfoIcon size={12} />
                      </button>
                      <div className="g-tile-title" style={{ color: eHex, paddingRight: 30 }}>{era.label}</div>
                      <div className="g-tile-sub">{era.years[0]}–{Math.min(era.years[1], 2026)}</div>
                      <div className="g-tile-desc" style={{ fontSize: 10, marginTop: 6 }}>{ERA_META_BLURB[era.id]}</div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => pickEra(ERAS[Math.floor(Math.random() * ERAS.length)])}
                className="aura-pill-btn w-full justify-center" style={{ padding: "10px" }}>
                <DiceIcon size={15} /> Random Era
              </button>
            </div>

            {/* Era bilgi pop-up'ı — Glossary ERA_GUIDE'ından (tek kaynak) */}
            {eraInfo && (() => {
              const g = ERA_GUIDE.find(x => x.short === eraInfo.short);
              const eHex = ERA_HEX[eraInfo.id] || "#9ca3af";
              return (
                <InfoModal open onClose={() => setEraInfo(null)} accent={eHex}
                  title={<span style={{ color: eHex }}>{eraInfo.label}</span>}>
                  <div className="space-y-3">
                    <div className="g-mono" style={{ color: "var(--text-faint)" }}>
                      {eraInfo.years[0]}–{Math.min(eraInfo.years[1], 2026)}
                    </div>
                    {g?.meta && <p className="text-[13px] italic" style={{ color: eHex }}>{g.meta}</p>}
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {g?.desc || ERA_META_BLURB[eraInfo.id]}
                    </p>
                    {g && (
                      <div className="pt-3" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                        <div className="g-label mb-2">Archetype Weights</div>
                        <div className="flex flex-wrap gap-1.5">
                          {g.top.map(t => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ color: "#4ade80", border: "1px solid #4ade8040", background: "#4ade8015" }}>{t}</span>
                          ))}
                          {g.low?.map(t => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ color: "#f87171", border: "1px solid #f8717140", background: "#f8717115" }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={() => { const e = eraInfo; setEraInfo(null); pickEra(e); }}
                      className="aura-rating-btn w-full" style={{ padding: "11px", fontSize: 12.5, letterSpacing: ".1em" }}>
                      Play this era
                    </button>
                  </div>
                </InfoModal>
              );
            })()}
          </>
        )}

        {(gamePhase === "spinning" || gamePhase === "drafting" || gamePhase === "placing") && (
          <div className="space-y-3">
            {/* ── İNCE DOCK: tur durumu | spin | düşen takım ── */}
            <div className="g-dock thin">
              <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: -30, top: -60, width: 220, height: 130, opacity: isSpinPhase ? 0.24 : 0.12, transition: "opacity .4s ease" }} />

              <div className="g-dock-left flex items-center gap-3">
                <h1 className="g-dock-title">Round {round}</h1>
                {simEra && (
                  <span className="g-status" style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.14)", "--accent-line": "rgba(156,163,175,.4)" }}>
                    {simEra.short}
                  </span>
                )}
              </div>

              <div className="g-dock-center">
                {isSpinPhase ? (
                  <div className="g-spin-row flex items-center gap-7">
                    <InlineSpin items={seasons} spinning={spinS} targetIdx={targetSIdx} label="Season" accent="#FFB11B" />
                    <InlineSpin items={teamPool.length > 0 ? teamPool : ["…"]} spinning={spinT} targetIdx={targetTIdx} label="Team" accent="#60a5fa" />
                  </div>
                ) : waitingSeat ? (
                  <span className="font-logo text-[12px] font-bold uppercase tracking-widest" style={{ color: "var(--yamabuki)" }}>
                    Player {activeSeat}'s pick — P{waitingSeat} waiting
                  </span>
                ) : null}
              </div>

              <div className="g-dock-right">
                {chosenTeam && !isSpinPhase && (
                  <div className="g-dock-team">
                    <div className="tm">{chosenTeam}</div>
                    <div className="yr">{chosenSeason}</div>
                  </div>
                )}
              </div>
            </div>

            {isSpinPhase && (
              <p className="text-center text-xs animate-pulse py-8" style={{ color: "var(--text-muted)" }}>{statusMsg || "Spinning…"}</p>
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
            <CoachPicker
              title={`Player ${seat} — Hire a Coach`}
              options={coachOptions}
              onPick={(c) => pickCoach(seat, c)}
            />
          );
        })()}

        {gamePhase === "series" && matchup && (
          <SeriesPanel matchup={matchup} games={seriesGames} seriesW={seriesW} seriesOver={seriesOver}
            lineups={lineups} coaches={coaches} simEra={simEra}
            onNextGame={playNextGame} onSeeResult={() => setGamePhase("complete")} />
        )}

        {gamePhase === "complete" && (
          <SameScreenResult lineups={lineups} coaches={coaches} seriesW={seriesW} seriesGames={seriesGames} onReset={resetGame} />
        )}

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
    <div className={`rounded-2xl border p-3 space-y-2 ${isActive ? "border-yamabuki/60 bg-yamabuki/[.06] shadow-[0_0_24px_-8px_rgba(255,177,27,.7)]" : "border-white/8 bg-white/[.02]"}`}>
      <div className="flex items-center justify-between">
        <span className="font-logo text-sm font-bold text-white">Player {seat}</span>
        {isActive && <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-yamabuki/20 border border-yamabuki/50 text-yamabuki font-bold uppercase tracking-wider">Your pick</span>}
        {isWaiting && <span className="text-[9.5px] px-2 py-0.5 rounded-full border border-white/12 text-[var(--text-faint)] uppercase tracking-wider">Waiting</span>}
      </div>

      {/* Salary Cap bütçe barı */}
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
                    ${isPrim ? "bg-yamabuki/25 border-yamabuki text-yamabuki shadow-[0_0_16px_-5px_#FFB11B]" : isElig ? "bg-white/[.04] border-white/20 text-white" : "border-dashed border-white/12 text-[var(--text-faint)]"}`}>
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
                  className="flex-1 py-1.5 rounded-xl text-xs transition-all hover:-translate-y-px" style={{color:"var(--text-muted)",border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.03)"}}>{b}</button>
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
          <div className="max-h-80 overflow-auto rounded-xl" style={{border:"1px solid rgba(255,255,255,.08)"}}>
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
  // Takım skorları tam saha başlığında da görünsün (kartlarla aynı hesap).
  const teamScore = (seat) => {
    const fit = computeLineupFit(POSITIONS.map(p => lineups[seat][p]).filter(Boolean), simEra);
    return fit ? Math.round(fit.lineupScore * 100) : 0;
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="font-logo text-lg font-bold text-white">Rosters Complete</div>
        <p className="text-xs text-gray-500 mt-0.5">Review both teams before hiring your coaches. Tap a slot on the court to rearrange one last time.</p>
      </div>

      {/* İki kadro TEK sahada — 1v1 yapısı burada tam görünür. Yerleşim
          değişikliği doğrudan kortun üzerinden yapılabiliyor. */}
      <FullCourtBoard
        lineups={lineups}
        label="// Rosters Locked"
        status="Review"
        scores={{ 1: teamScore(1), 2: teamScore(2) }}
        moveSrc={moveSrc}
        canTap={{ 1: canRearrange, 2: canRearrange }}
        onSlotTap={onSlotTap}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
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
function SeriesPanel({ matchup, games, seriesW, seriesOver, onNextGame, onSeeResult, lineups, coaches, simEra }) {
  const leaderSeat = seriesW[1] === seriesW[2] ? 0 : (seriesW[1] > seriesW[2] ? 1 : 2);
  return (
    <div className="space-y-4">
      {/* Seri boyunca sabit: kim kime karşı oynuyor, tek sahada */}
      {lineups && (
        <FullCourtBoard
          lineups={lineups}
          coaches={coaches}
          label="// Series Matchup"
          status={seriesOver ? "Final" : `Game ${games.length + 1}`}
        />
      )}

      {/* Simülasyon ÖNCESİ karne — ilk maç oynanana kadar açık durur */}
      {lineups && games.length === 0 && (
        <DraftAnalysis simEra={simEra}
          teams={[
            { name: "Player 1", lineup: lineups[1], coach: coaches?.[1] },
            { name: "Player 2", lineup: lineups[2], coach: coaches?.[2] },
          ]} />
      )}

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
          <div key={seat} className={`rounded-2xl border p-4 space-y-3 ${winner === seat ? "border-yamabuki bg-yamabuki/[.08] shadow-[0_0_30px_-10px_rgba(255,177,27,.8)]" : "border-white/8 bg-white/[.02]"}`}>
            <div className="flex items-center justify-between">
              <span className="font-logo text-base font-bold text-white">Player {seat}</span>
              <span className="text-3xl font-black tabular-nums" style={{ color: winner === seat ? "var(--accent)" : "#e5e7eb" }}>{seriesW[seat]}</span>
            </div>
            {coaches[seat] && (
              <div className="text-[11px] text-gray-400 flex items-center gap-1"><CoachIcon size={12} /> {coaches[seat].name}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {POSITIONS.concat(BENCH_SLOTS).map(pos => lineups[seat][pos] && (
                <span key={pos} className={`text-[10px] px-1.5 py-0.5 rounded border ${POS_COLORS[pos] || "border-white/12 text-[var(--text-muted)]"}`}
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
