import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import Pitch from "../../game/football/Pitch";
import ShapeStep from "../../game/ui/ShapeStep";
import FootballDraft from "../../game/ui/FootballDraft";
import ModeAbout from "../../game/football/ModeAbout";
import GameStage from "../../game/ui/GameStage";
import CoachPicker from "../../game/CoachPicker";
import { FORMATIONS, allSlots } from "../../game/football/formations";
import { posPenaltyFor, isPrimarySlot, canPlace } from "../../game/football/positions";
import { drawManagers, managerBonus } from "../../game/football/managers";
import SeasonPanel from "../../game/football/SeasonPanel";
import SquadAnalysis from "../../game/football/SquadAnalysis";
import FootballLeaderboard from "../../game/football/LeaderboardPanel";
import SquadResult from "../../game/football/SquadResult";
import "../../game/game.css";
import { LEAGUE_LABEL } from "../../game/football/leagues";
import { ACCENT } from "../../game/football/theme";

// ── Futbol çark oyunu ────────────────────────────────────────────────────────
// Basketbol LineupGame'in futbol karşılığı. Ortak mekanikler: iki çark (yıl +
// takım), 5 joker, slot seçimi, tahtada taşıma, pozisyon cezası, kadro kaydetme.
//
// FUTBOLA ÖZGÜ OLANLAR
//   • Saha — slotların sahada yeri var, diziliş değişince yerleşim değişir
//   • Menajer — koçtan farkı: tercih ettiği diziliş seninkiyle eşleşirse bonus,
//     yani menajer seçimi draft öncesi verilmiş bir karara bağlanıyor
//   • 11 ilk + 7 yedek (kullanıcı kararı)
//
// YIL ÇARKI: eklenmesiyle AYNI TAKIM BİRDEN FAZLA KEZ çıkabilir hale geldi
// (Barcelona 2023/24 ile Barcelona 2025/26 farklı kadrolar). Bu yüzden
// "kullanılmış" kaydı takım adı değil takım+sezon çifti.


export default function FootballGame() {
  const { isLoggedIn } = useAuth();
  const [meta, setMeta]   = useState(null);
  const [shape, setShape] = useState("4-3-3");
  const [mode, setMode]   = useState("open");     // open | league
  const [league, setLeague] = useState("");

  // idle | spin | picking | pick_manager | complete
  const [phase, setPhase] = useState("idle");
  const [pairs, setPairs]     = useState([]);   // geçerli (sezon, kulüp) çiftleri
  const [seasons, setSeasons] = useState([]);
  const [teams, setTeams]     = useState([]);
  const [spinS, setSpinS] = useState(0);
  const [spinT, setSpinT] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [chosen, setChosen]   = useState(null);   // {team, league, season}
  const [roster, setRoster]   = useState([]);
  const [squad, setSquad]     = useState({});     // slotId -> oyuncu
  const [used, setUsed]       = useState([]);     // "team|season"
  const [moveSrc, setMoveSrc] = useState(null);
  const [pickingFor, setPickingFor] = useState(null);  // slot seçimi bekleyen oyuncu
  const [fit, setFit]       = useState(null);
  const [msg, setMsg]       = useState("");
  const [manager, setManager] = useState(null);
  const [mgrOptions, setMgrOptions] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg]   = useState("");
  const [spinSeq, setSpinSeq]   = useState(0);          // çark başlangıç sayacı: arayüz animasyonu buna bağlı
  const [spinKind, setSpinKind] = useState("both");
  const [rosterReady, setRosterReady] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Jokerler — basketbolla aynı set
  const [jokers, setJokers] = useState({
    reTeam: true, reYear: true, reBoth: true, double: true, discover: true });
  const [doubleLeft, setDoubleLeft] = useState(0);   // Pick 2 aktifken kalan seçim
  const [discover, setDiscover] = useState(false);

  const timer = useRef(null);
  const spinningRef = useRef(false);   // bkz. doSpin — state yarışına karşı
  const watchdog = useRef(null);       // takılan spin'i kurtaran zamanlayıcı
  const slots = allSlots(shape);
  const pitchSlots = FORMATIONS[shape]?.slots || [];
  const filledCount = slots.filter(s => squad[s.id]).length;
  const openSlots = slots.filter(s => !squad[s.id]);

  useEffect(() => {
    api.footballMeta().then(setMeta).catch(() => setMeta({ available: false }));
  }, []);

  // Havuz GEÇERLİ ÇİFTLER olarak gelir. Sezon ve takımı bağımsız seçmek
  // olmayan bir kadroyu işaret edebiliyordu (La Liga'da yalnız 2025/26 var).
  useEffect(() => {
    api.footballGameTeams({ ...(mode === "league" && league ? { league } : {}) })
      .then(r => {
        setPairs(r.pairs || []);
        setTeams(r.teams || []);
        setSeasons(r.seasons || []);
        // Havuz boşsa Spin sonsuza dek disabled kalıyor ve hiçbir açıklama
        // görünmüyordu — oyun sessizce ölmüş gibi duruyordu.
        if (!(r.pairs || []).length) setMsg("No club-seasons available for this filter.");
        else setMsg("");
      })
      .catch(() => {
        setPairs([]); setTeams([]); setSeasons([]);
        setMsg("Could not reach the server — reload the page to try again.");
      });
  }, [mode, league]);

  // Modul yeniden yuklenir ya da bilesen sokulup takilirsa kilit acik
  // kalmali: spinningRef true'da kalirsa Spin sessiz bir no-op'a doner.
  useEffect(() => {
    spinningRef.current = false;
    return () => { clearInterval(timer.current); spinningRef.current = false; };
  }, []);

  const reset = useCallback(() => {
    clearInterval(timer.current); clearTimeout(watchdog.current);
    spinningRef.current = false; setSpinning(false);
    setSquad({}); setUsed([]); setFit(null); setChosen(null); setRoster([]);
    setPhase("idle"); setMsg(""); setManager(null); setMgrOptions([]);
    setMoveSrc(null); setPickingFor(null); setSaveMsg(""); setSaveName("");
    setJokers({ reTeam: true, reYear: true, reBoth: true, double: true, discover: true });
    setDoubleLeft(0); setDiscover(false);
  }, []);

  // ── Çarklar ───────────────────────────────────────────────────────────────
  const loadRoster = useCallback((team, season) => {
    api.footballGamePlayers({ season, team })
      .then(r => {
        const inSquad = new Set(Object.values(squad).map(p => p.PLAYER_ID));
        const avail = (r.players || []).filter(p =>
          !inSquad.has(p.PLAYER_ID) &&
          openSlots.some(s => canPlace(p, s)));
        setRoster(avail); setRosterReady(true);
        if (!avail.length) setMsg(`${team} ${season} has nobody you can still use — spin again.`);
      })
      .catch(() => { setRosterReady(true); setMsg("Could not load that squad."); });
  }, [squad, openSlots]);

  const doSpin = useCallback((lockSeason = null, lockTeam = null) => {
    // Guard REF üzerinden — setSpinning(true) asenkron uygulandığı için aynı
    // tick'teki iki tıklama da state'i hâlâ false görüyor, ikisi de interval
    // başlatıyordu. timer.current ikincisiyle ezilince birincisi hiç
    // temizlenmiyor: çarklar sonsuza dek dönüyor, spinning true'da kalıyor ve
    // oyun kilitleniyordu. Ref senkron güncellendiği için yarış kapanıyor.
    if (!pairs.length || spinningRef.current) return;
    const pool = pairs.filter(pr =>
      (!lockTeam || pr.team === lockTeam) &&
      (!lockSeason || pr.season === lockSeason) &&
      !used.includes(`${pr.team}|${pr.season}`));
    if (!pool.length) {
      spinningRef.current = false;
      setSpinning(false); setPhase("idle");
      setMsg(lockTeam || lockSeason
        ? "No fresh option left for that lock."
        : "No fresh club-season left.");
      return;
    }

    spinningRef.current = true;
    setSpinSeq((q) => q + 1); setRosterReady(false);
    setSpinKind(lockSeason && !lockTeam ? "team" : lockTeam && !lockSeason ? "season" : "both");
    setSpinning(true); setMsg(""); setRoster([]); setChosen(null);
    setPhase("spin");
    const target = pool[Math.floor(Math.random() * pool.length)];

    let ticks = 0;
    const total = 20 + Math.floor(Math.random() * 10);
    clearInterval(timer.current);
    clearTimeout(watchdog.current);
    // BEKCI: sekme arka plandayken tarayici timer'lari saniyede bire kisiyor,
    // yani 68ms'lik tik 1sn'ye cikabiliyor. Normal sure ~2sn; 25sn'yi asarsa
    // bir sey ters gitmis demektir. Kilidi birak ki oyun kilitlenmesin.
    watchdog.current = setTimeout(() => {
      if (!spinningRef.current) return;
      clearInterval(timer.current);
      spinningRef.current = false;
      setSpinning(false);
      setPhase("idle");
      setMsg("That spin stalled — press Spin again.");
    }, 25000);
    timer.current = setInterval(() => {
      ticks++;
      setSpinT(i => (i + 1) % teams.length);
      if (ticks % 2 === 0) setSpinS(i => (i + 1) % seasons.length);
      if (ticks >= total) {
        clearInterval(timer.current);
        clearTimeout(watchdog.current);
        setSpinT(Math.max(0, teams.indexOf(target.team)));
        setSpinS(seasons.indexOf(target.season));
        setChosen(target);
        spinningRef.current = false;
        setSpinning(false);
        setPhase("picking");
        loadRoster(target.team, target.season);
      }
    }, 68);
  }, [pairs, teams, seasons, used, loadRoster]);

  // ── Jokerler ──────────────────────────────────────────────────────────────
  const jokerReTeam = () => {
    if (!jokers.reTeam || !chosen) return;
    setJokers(j => ({ ...j, reTeam: false }));
    doSpin(chosen.season, null);              // yıl sabit, takım yeniden
  };
  const jokerReYear = () => {
    if (!jokers.reYear || !chosen) return;
    setJokers(j => ({ ...j, reYear: false }));
    doSpin(null, chosen.team);                // takım sabit, yıl yeniden
  };
  const jokerReBoth = () => {
    if (!jokers.reBoth) return;
    setJokers(j => ({ ...j, reBoth: false }));
    doSpin(null, null);
  };
  const jokerDouble = () => {
    if (!jokers.double || openSlots.length < 2 || phase !== "picking") return;
    setJokers(j => ({ ...j, double: false }));
    setDoubleLeft(2);
    setMsg("Pick 2 — take two players from this squad.");
  };
  const jokerDiscover = () => {
    if (!jokers.discover) return;
    setJokers(j => ({ ...j, discover: false }));
    setDiscover(true);
  };

  // ── Oyuncu seçimi ve slot yerleştirme ─────────────────────────────────────
  const choosePlayer = (p) => {
    const fits = slots.filter(s => !squad[s.id] && canPlace(p, s));
    if (!fits.length) return;
    setPickingFor(p);                          // saha tıklamasını bekle
    setMsg("Pick a slot on the pitch (or a bench spot below).");
  };

  const placeInSlot = (slot) => {
    if (!pickingFor) return;
    if (squad[slot.id] || !canPlace(pickingFor, slot)) return;
    const next = { ...squad, [slot.id]: pickingFor };
    setSquad(next);
    setPickingFor(null);
    setMsg("");

    if (doubleLeft > 1) {
      setDoubleLeft(1);
      setRoster(r => r.filter(x => x.PLAYER_ID !== pickingFor.PLAYER_ID));
      return;                                  // aynı kadrodan bir tane daha
    }
    setDoubleLeft(0);
    setUsed(u => [...u, `${chosen.team}|${chosen.season}`]);
    setChosen(null); setRoster([]); setDiscover(false);

    const done = slots.every(s => next[s.id]);
    if (done) { setMgrOptions(drawManagers(4)); setPhase("pick_manager"); }
    else setPhase("idle");
  };

  // Tahtada taşı / takas — basketboldaki handleSlotTap deseni
  const onSlotClick = (slot) => {
    if (pickingFor) { placeInSlot(slot); return; }
    if (moveSrc == null) {
      if (squad[slot.id]) setMoveSrc(slot.id);
      return;
    }
    if (moveSrc === slot.id) { setMoveSrc(null); return; }
    const a = squad[moveSrc], b = squad[slot.id];
    const srcSlot = slots.find(s => s.id === moveSrc);
    // Kaleci kuralı iki yönde de korunmalı
    if (!canPlace(a, slot) || (b && !canPlace(b, srcSlot))) {
      setMsg("A goalkeeper can only stand in goal."); setMoveSrc(null); return;
    }
    const next = { ...squad, [slot.id]: a };
    if (b) next[moveSrc] = b; else delete next[moveSrc];
    setSquad(next); setMoveSrc(null); setMsg("");
    if (phase === "complete") scoreSquad(next, manager);
  };

  const pickManager = (m) => {
    setManager(m);
    setPhase("complete");
    scoreSquad(squad, m);
  };

  const scoreSquad = (sq, mgr) => {
    const starters = pitchSlots.map(s => sq[s.id]).filter(Boolean);
    const ids = starters.map(p => p.PLAYER_ID);
    // Çark farklı yıllardan oyuncu verdiği için her oyuncunun sezonu ayrı
    // gidiyor; tek sezon gönderilince çoğu bulunamayıp kimya NaN oluyordu.
    const entries = starters.map(p => ({ player_id: p.PLAYER_ID, season: p.SEASON }));
    api.footballLineupFit(ids, starters[0]?.SEASON, entries).then(f => {
      if (!f || f.error) { setFit(null); setMsg("Could not score this XI."); return; }
      const pen = pitchSlots.reduce((a, s) =>
        a + (sq[s.id] ? posPenaltyFor(sq[s.id], s) : 0), 0) / pitchSlots.length;
      const natural = pitchSlots.filter(s => sq[s.id] && isPrimarySlot(sq[s.id], s)).length;
      const { bonus, matched } = managerBonus(mgr, shape);
      setFit({
        ...f,
        position_penalty: pen,
        natural_slots: natural,
        chemistry_bonus: natural * 0.015,
        manager_bonus: bonus,
        manager_matched: matched,
        final: Math.max(0, Math.min(1,
          (f.score || 0) - pen + natural * 0.015 + bonus)),
      });
    }).catch(() => setFit(null));
  };

  const saveRoster = () => {
    if (!saveName.trim()) { setSaveMsg("Give the squad a name."); return; }
    const roster18 = slots.map(s => squad[s.id] ? { ...squad[s.id], _slot: s.id } : null)
                          .filter(Boolean);
    fetch("/api/rosters", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: saveName.trim(), sport: "football", source_mode: "single",
        mode: shape, roster: roster18,
        overall_pct: fit?.score ?? 0,
        grade: null,
      }),
    }).then(async r => {
      if (r.ok) { setSaveMsg("Saved — check the leaderboard."); return; }
      // Sunucunun sebebini yut­ma: 400'ler ("18 oyuncu olmali", "ayni isimde
      // kadron var") kullaniciya bir sey soylemeli.
      const d = await r.json().catch(() => null);
      setSaveMsg(d?.detail || "Could not save.");
    }).catch(() => setSaveMsg("Could not save."));
  };

  // Giriş blokları (anlatım, kalibrasyon uyarısı, çark havuzu) yalnızca
  // kurulum ekranına ait: çark ilk kez döndüğü an oyun başlamış demektir.
  const setupScreen = phase === "idle" && !chosen && filledCount === 0;

  // Kurulum ekranı (mockup 11a): diziliş + lig + liderlik; kendi sahnesini çizer.
  if (setupScreen) {
    return (
      <>
        <SEO title="Football — Spin & Build"
          description="Spin for a club and a season, draft eighteen, and see whether the XI fits."
          path="/football/game" noindex />
        <ShapeStep shape={shape} onShape={(k) => { setShape(k); reset(); }}
          leagues={[{ key: "", label: "All leagues" }, ...(meta?.leagues || []).map((l) => ({ key: l, label: LEAGUE_LABEL[l] || l }))]}
          league={mode === "open" ? "" : league}
          onLeague={(k) => { setMode(k ? "league" : "open"); setLeague(k); reset(); }}
          poolCount={pairs.length}
          onStart={() => doSpin()} startDisabled={spinning || !pairs.length} spinning={spinning}
          leaderboard={<FootballLeaderboard />} />
      </>
    );
  }

  // Draft ekranı (mockup 11b / Draft Flow): çark → havuz → slot. Menajer ve sonuç eski düzende (Faz 3).
  if (["idle", "spin", "picking"].includes(phase)) {
    return (
      <>
        <SEO title="Football — Spin & Build"
          description="Spin for a club and a season, draft eighteen, and see whether the XI fits."
          path="/football/game" noindex />
        <FootballDraft shape={shape} squad={squad} phase={phase} spinning={spinning} chosen={chosen}
          roster={roster} rosterReady={rosterReady} pickingFor={pickingFor} jokers={jokers}
          doubleLeft={doubleLeft} discover={discover} seasons={seasons} teams={teams}
          spinSeq={spinSeq} spinKind={spinKind} msg={msg} moveSrc={moveSrc}
          onSpin={() => doSpin()} jokerReTeam={jokerReTeam} jokerReYear={jokerReYear} jokerReBoth={jokerReBoth}
          jokerDouble={jokerDouble} jokerDiscover={jokerDiscover}
          choosePlayer={choosePlayer} cancelPick={() => { setPickingFor(null); setMsg(""); }}
          onSlotClick={onSlotClick} onInfo={() => setRulesOpen(true)} />
        {rulesOpen && <ModeAbout mode="spin" onClose={() => setRulesOpen(false)} />}
      </>
    );
  }

  // Menajer seçimi (mockup 4d): koç ekranıyla aynı bileşen, futbol teması.
  if (phase === "pick_manager") {
    return (
      <GameStage sport="football">
        <CoachPicker sport="football" shape={shape} title="Hire your manager" options={mgrOptions}
          onPick={pickManager} cta={(last, full) => `Hire ${full}`} />
      </GameStage>
    );
  }

  // Sonuç (mockup 11c / 11d): kadro raporu, rol kapsaması, sezon simülasyonu, liderlik.
  if (phase === "complete" && fit) {
    const starters = pitchSlots.map((s) => squad[s.id]).filter(Boolean);
    const slotOf = (p) => {
      const sl = pitchSlots.find((x) => squad[x.id]?.PLAYER_ID === p.PLAYER_ID);
      return sl ? posPenaltyFor(p, sl) : 0;
    };
    return (
      <GameStage sport="football" className="sb-skin">
        <SEO title="Football — Spin & Build" description="Your XI against the real starting elevens." path="/football/game" noindex />
        <SquadResult fit={fit} shape={shape} manager={manager} starters={starters} slotOf={slotOf}
          slotPosOf={(p) => pitchSlots.find((x) => squad[x.id]?.PLAYER_ID === p.PLAYER_ID)?.pos}
          saveUI={isLoggedIn ? (
            <div className="sb-fres-save">
              <label htmlFor="fb-save">Save this squad</label>
              <input id="fb-save" value={saveName} onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Invincibles remix" className="aura-ghost-input" />
              <button type="button" onClick={saveRoster} className="pa-btn-secondary">Save</button>
              {saveMsg && <p className="sb-fres-note">{saveMsg}</p>}
            </div>
          ) : <span className="sb-fres-note">Sign in to save squads and land on the board.</span>}
          onPlaySeason={() => document.getElementById("fb-season")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onReset={reset} />
        <div id="fb-season" />
        <div className="sb-fgrid">
          <SquadAnalysis detailOnly fit={fit} starters={starters} slotOf={slotOf} />
          <div className="sb-fcol">
            <SeasonPanel starters={starters} chemistry={fit.score} positionPenalty={fit.position_penalty}
              managerBonus={fit.manager_bonus} season={starters[0]?.SEASON} squadName={saveName.trim() || "Your XI"} />
            <FootballLeaderboard />
          </div>
        </div>
      </GameStage>
    );
  }

  // Kadro puanlanırken (complete, fit henüz yok).
  return (
    <GameStage sport="football">
      <p className="sb-fres-note">Scoring your XI…</p>
    </GameStage>
  );
}
