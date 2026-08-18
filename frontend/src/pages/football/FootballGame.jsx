import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import { SEO } from "../../hooks/useSEO";
import { useAuth } from "../../contexts/AuthContext";
import Pitch from "../../game/football/Pitch";
import { FORMATIONS, SHAPE_KEYS, allSlots, BENCH_COUNT } from "../../game/football/formations";
import { posPenaltyFor, isPrimarySlot, canPlace, PENALTY_LABEL } from "../../game/football/positions";
import { drawManagers, managerBonus } from "../../game/football/managers";
import SeasonPanel from "../../game/football/SeasonPanel";
import SquadAnalysis from "../../game/football/SquadAnalysis";
import FootballLeaderboard from "../../game/football/LeaderboardPanel";
import { RefreshIcon, CalendarIcon, BoltIcon, UsersIcon, SearchIcon } from "../../game/GameIcons";
import "../../game/game.css";
import { LEAGUE_LABEL } from "../../game/football/leagues";

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

const ACCENT = "#3FB08C";
// Draft satırında gösterilecek per-90 statlar — faz başına farklı, çünkü
// bir stoperi gol/asistle, bir forveti müdahaleyle ölçmek anlamsız.
// Basketbol tarafında tek bir kolon seti yeterliydi (herkes aynı oyunu
// oynuyor); futbolda değil.
// ÖNEMLİ: oyunun roster endpoint'i (/api/football/game/players) kart
// sayfasındakinden çok daha dar bir alan seti döndürüyor (17 alan).
// Burada YALNIZCA o sette gerçekten bulunanlar kullanılabilir — aksi hâlde
// hücreler "—" basıyor. Mevcutlar: goals_90, assists_90, CLEAN_SHEETS,
// MINUTES_TOTAL, APPS, primary_score.
const ROW_STATS = {
  gk:  [["CLEAN_SHEETS", "CS"], ["APPS", "APP"], ["MINUTES_TOTAL", "MIN"]],
  def: [["CLEAN_SHEETS", "CS"], ["assists_90", "A"], ["MINUTES_TOTAL", "MIN"]],
  mid: [["goals_90", "G"], ["assists_90", "A"], ["MINUTES_TOTAL", "MIN"]],
  fwd: [["goals_90", "G"], ["assists_90", "A"], ["MINUTES_TOTAL", "MIN"]],
};
const COUNT_STAT = new Set(["CLEAN_SHEETS", "APPS"]);   // sezon toplamı, ondalık yok
const statVal = (p, key) => {
  const v = parseFloat(p?.[key]);
  if (isNaN(v)) return "—";
  if (key === "MINUTES_TOTAL") return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v);
  if (COUNT_STAT.has(key)) return Math.round(v);
  return v.toFixed(v >= 10 ? 0 : 1);        // per-90
};
// Menajer notları harf; bar genişliği için 0-1'e çevir (basketbol
// CoachPicker'ındaki GRADE_VAL ile aynı cetvel).
const GRADE_VAL = {
  "A+": 1.00, A: 0.92, "A-": 0.85, "B+": 0.78, B: 0.70, "B-": 0.63,
  "C+": 0.56, C: 0.48, "C-": 0.41, "D+": 0.34, D: 0.27, "D-": 0.20, F: 0.10,
};
const gradeVal = (g) => GRADE_VAL[g] ?? 0.5;
const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };
const PHASE_LABEL = { gk: "Goalkeeper", def: "Defence", mid: "Midfield", fwd: "Attack" };

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
        setRoster(avail);
        if (!avail.length) setMsg(`${team} ${season} has nobody you can still use — spin again.`);
      })
      .catch(() => setMsg("Could not load that squad."));
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
    if (done) { setMgrOptions(drawManagers(3)); setPhase("pick_manager"); }
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

  // Draft sürüyor mu? (kurulum + çark + seçim). complete/pick_manager rapor.
  const playing = phase !== "complete";
  // Giriş blokları (anlatım, kalibrasyon uyarısı, çark havuzu) yalnızca
  // kurulum ekranına ait: çark ilk kez döndüğü an oyun başlamış demektir.
  const setupScreen = !chosen && filledCount === 0;

  const avgOverall = filledCount
    ? Math.round(slots.reduce((a, s) => a + (squad[s.id]?.overall_score || 0), 0)
                 / filledCount * 100) : 0;

  // Basketbol dock'undaki JokerBtn ile aynı görsel dil: kutusuz, hover'da
  // (dokunmatikte kalıcı) yuvarlak çerçeve, harcanınca hayalet.
  const jokerBtn = (key, Icon, label, onClick, enabled) => (
    <button key={key} onClick={onClick} disabled={!enabled}
      className={`g-joker${enabled ? " on" : ""}`}
      style={{ "--accent": ACCENT, "--accent-line": ACCENT + "80" }}>
      <Icon size={17} />
      <span className="lbl">{label}</span>
    </button>
  );

  return (
    <div className={`relative ${playing ? "h-full flex flex-col overflow-hidden" : "h-full overflow-y-auto"}`}>
      <SEO title="Football — Spin & Build"
        description="Spin for a club and a season, draft eighteen, and see whether the XI fits."
        path="/football/game" noindex />
      <div className="g-smoke" />

      {/* Oyun oynanırken sayfa DİKEY KAYMAZ — sitenin ana kuralı. Dock ve
          kurulum sabit yükseklikte, iki sütun kalan alanı doldurur, uzun
          listeler kendi panellerinin içinde kayar. Kadro bitince (complete)
          ekran bir rapora dönüşüyor, orada kaydırma serbest. */}
      <div className={`relative max-w-[1500px] w-full mx-auto p-4 ${playing ? "flex-1 min-h-0 flex flex-col gap-3" : "space-y-4"}`}>
        {/* ── HEADER DOCK — basketbol oyunundaki yapının aynısı:
            solda kimlik + ilerleme, ortada diziliş, sagda durum. ── */}
        <div className={`g-dock${setupScreen ? "" : " thin"}`}
          style={{ "--accent": ACCENT, "--accent-line": ACCENT + "55" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />

          <div className="g-dock-left flex items-center gap-3">
            <div>
              <h1 className="g-dock-title">Spin &amp; Build</h1>
              <p className="g-dock-sub">Draft eighteen · one club-season at a time</p>
            </div>
            {filledCount > 0 && (
              <div className="flex items-center gap-2 min-w-[110px]">
                <div className="g-progress"><div style={{ width: `${(filledCount / slots.length) * 100}%` }} /></div>
                <span className="text-[10.5px] tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>
                  {filledCount}/{slots.length}
                </span>
              </div>
            )}
          </div>

          <div className="g-dock-center">
            <div className="aura-select-wrap">
              <select value={shape} onChange={e => { setShape(e.target.value); reset(); }}
                className="aura-select accent" disabled={filledCount > 0}>
                {SHAPE_KEYS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="g-dock-right">
            {chosen ? (
              <div className="g-dock-team">
                <div className="tm">{chosen.team}</div>
                <div className="yr">{chosen.season}</div>
              </div>
            ) : (
              <span className="g-status"
                style={{ "--accent": "#E8654C", "--accent-a": "#E8654C1f", "--accent-line": "#E8654C55" }}>
                Infrastructure
              </span>
            )}
          </div>
        </div>

        {/* Uzun anlatım yalnızca kadro boşken (giriş anı) — oyun başlayınca
            dikey alan sahaya ve havuza gitmeli. */}
        <div className={setupScreen ? "" : "hidden"}>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Two wheels give you a club and a season. Take a player, put him where
            you want him on the pitch, and build eighteen. The same club can come
            up again in a different season — it's a different squad.
          </p>
          <div className={`mt-2 text-[11px] px-3 py-2 rounded-lg ${setupScreen ? "" : "hidden"}`}
            style={{ background: "#E8654C14", border: "1px solid #E8654C40",
                     color: "var(--text-muted)" }}>
            <b style={{ color: "#E8654C" }}>Not calibrated yet.</b>{" "}
            The squad score runs on the chemistry engine, which is not calibrated
            against ground truth yet — read it as directional. The season
            simulation underneath it is a separate thing and <i>is</i> fitted on
            real matches.
          </div>
        </div>

        {/* Kurulum — diziliş dock'a taşındı, çarkın havuzu burada seçiliyor.
            Kadro başlayınca zaten kilitleniyor; dikey alanı sahaya bırakmak
            için gizleniyor (Reset dock'tan değil, bitişte "Play again"den). */}
        <div className={`g-panel p-3 flex flex-wrap gap-2 items-center ${setupScreen ? "" : "hidden"}`}
          style={{ "--accent": ACCENT, "--accent-line": ACCENT + "3d" }}>
          <span className="aura-blob" style={{ "--slot-color": ACCENT, left: "6%", top: -38, width: 180, height: 96, opacity: 0.12 }} />
          <span className="g-label shrink-0">Wheel pool</span>
          <button onClick={() => { setMode("open"); setLeague(""); reset(); }}
            className={`aura-pill-btn${mode === "open" ? " active" : ""}`}
            disabled={filledCount > 0}>All leagues</button>
          {(meta?.leagues || []).map(l => (
            <button key={l} onClick={() => { setMode("league"); setLeague(l); reset(); }}
              className={`aura-pill-btn${mode === "league" && league === l ? " active" : ""}`}
              disabled={filledCount > 0}>{LEAGUE_LABEL[l] || l}</button>
          ))}
          <span className="text-[11px] ml-auto" style={{ color: "var(--text-faint)" }}>
            {pairs.length} club-seasons in the wheel
          </span>
          {filledCount > 0 && <button onClick={reset} className="aura-pill-btn">Reset</button>}
        </div>

        <div className={`grid gap-3 ${playing ? "flex-1 min-h-0" : ""}`}
          style={{ gridTemplateColumns: "minmax(420px,1.35fr) minmax(330px,1fr)", alignItems: "stretch" }}>

          {/* SAHA */}
          {/* Saha — basketbol tarafındaki kort paneliyle aynı kabuk:
              nokta matrisi zemin + mono teknik başlık. */}
          <div className={`g-court-panel ${playing ? "flex flex-col min-h-0" : ""}`}>
            <div className="g-dotgrid" />
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="g-mono" style={{ color: ACCENT }}>// {shape}</span>
              <span className="g-status"
                style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
                {filledCount}/{slots.length} filled
              </span>
            </div>
            <div className={playing ? "flex-1 min-h-0 flex items-center justify-center" : ""}>
              <Pitch shape={shape} squad={squad} onSlotClick={onSlotClick}
                moveSrc={moveSrc} pickingFor={pickingFor} fill={playing} />
            </div>

            {/* Yedek kulübesi */}
            <div className="g-bench-strip" style={{ display: "block" }}>
              <div className="g-label mb-2">Bench · {BENCH_COUNT}</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                {slots.filter(s => s.bench).map(s => {
                  const p = squad[s.id];
                  return (
                    <button key={s.id} onClick={() => onSlotClick(s)}
                      className="g-slot"
                      style={{ "--accent": p ? PHASE_COLOR[p.PHASE] : "#8b857e",
                               "--accent-line": moveSrc === s.id ? "#fff"
                                 : p ? PHASE_COLOR[p.PHASE] + "55" : "rgba(255,255,255,.12)",
                               padding: "5px 7px", textAlign: "left" }}>
                      <div className="text-[10px] truncate"
                        style={{ color: p ? "#fff" : "var(--text-faint)" }}>
                        {p ? p.PLAYER_NAME.split(" ").slice(-1)[0] : s.id}
                      </div>
                      {p && (
                        <div className="text-[9px]" style={{ color: PHASE_COLOR[p.PHASE] }}>
                          {p.POSITION} · {Math.round((p.overall_score || 0) * 100)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {moveSrc && (
              <div className="text-[11px] mt-2 text-center" style={{ color: "#F2C14E" }}>
                Moving — tap another slot to swap, or tap again to cancel.
              </div>
            )}
          </div>

          {/* ÇARK / SEÇİM */}
          <div className={`g-panel p-4 ${playing ? "flex flex-col min-h-0 overflow-y-auto" : ""}`}>
            {phase === "pick_manager" ? (
              <>
                <div className="g-label mb-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
                  Squad complete — pick a manager
                </div>
                <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>
                  A manager who prefers your shape ({shape}) gives a bigger bonus.
                </p>
                {/* Basketbol tarafındaki CoachPicker ile aynı dil: her kart
                    kendi rengini kimliğinden alıyor (şekil uyumu = accent),
                    notlar bar olarak, aura yoğunluğu uyuma göre. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mgrOptions.map(m => {
                    const match = m.shape === shape;
                    const hex = match ? ACCENT : "#8b857e";
                    return (
                      <button key={m.name} onClick={() => pickManager(m)} className="g-tile text-left"
                        style={{ "--accent": hex, "--accent-a": hex + "1a", "--accent-line": hex + "4d", padding: "12px 13px" }}>
                        <span className="aura-blob" style={{ "--slot-color": hex, right: -22, top: -24, width: 120, height: 80, opacity: match ? 0.26 : 0.12 }} />
                        <div className="flex items-center justify-between gap-2">
                          <span className="g-tile-title" style={{ fontSize: 13 }}>{m.name}</span>
                          <span className="g-status shrink-0"
                            style={{ "--accent": hex, "--accent-a": hex + "1a", "--accent-line": hex + "4d" }}>
                            {m.shape}{match ? " ✓" : ""}
                          </span>
                        </div>
                        <div className="mt-2.5 space-y-1.5">
                          {[["ATT", m.att], ["DEF", m.def]].map(([k, g]) => (
                            <div key={k} className="flex items-center gap-2">
                              <span className="g-mono w-6 shrink-0" style={{ color: "var(--text-faint)" }}>{k}</span>
                              <div className="g-bar-track flex-1" style={{ height: 6 }}>
                                <div className="g-bar-fill" style={{ width: `${gradeVal(g) * 100}%`,
                                  "--fill": hex, "--fill-a": hex + "66" }} />
                              </div>
                              <span className="font-logo text-[11px] font-bold w-6 text-right shrink-0"
                                style={{ color: hex }}>{g}</span>
                            </div>
                          ))}
                        </div>
                        {m.tag && (
                          <div className="mt-2.5 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
                            <span className="g-status" style={{ "--accent": hex, "--accent-a": hex + "1a", "--accent-line": hex + "55" }}>
                              {m.tag}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : phase === "complete" ? (
              <div>
                {/* Ödül anı — basketboldaki g-score-hero'nun futbol karşılığı:
                    holo doku + not renginde aura + dev sayı. */}
                <div className="g-score-hero"
                  style={{ "--accent": ACCENT, "--accent-a": ACCENT + "40", "--accent-line": ACCENT + "55" }}>
                  <div className="g-holo" />
                  <span className="aura-blob" style={{ "--slot-color": ACCENT, left: "50%", top: -40, width: 300, height: 180, transform: "translateX(-50%)", opacity: 0.3 }} />
                  <div className="g-label center mb-3">Squad Fit</div>
                  <div className="g-score-pct" style={{ color: ACCENT }}>
                    {fit ? Math.round(fit.final * 100) : "…"}
                    <span style={{ fontSize: 15, color: "var(--text-faint)" }}> / 100</span>
                  </div>
                  {manager && (
                    <div className="text-[11px] mt-3 inline-flex items-center gap-1.5"
                      style={{ color: fit?.manager_matched ? ACCENT : "var(--text-muted)" }}>
                      {manager.name}{fit?.manager_matched ? " · shape match" : ""}
                    </div>
                  )}
                  {fit && (
                    <div className="g-score-parts max-w-sm mx-auto">
                      {[
                        ["Chemistry", Math.round(fit.score * 100), ACCENT],
                        ["Natural", `+${Math.round(fit.chemistry_bonus * 100)}`, ACCENT],
                        ["Out of pos", `−${Math.round(fit.position_penalty * 100)}`, "#E8654C"],
                      ].map(([label, val, hex]) => (
                        <div key={label} className="g-score-part">
                          <div className="v" style={{ color: hex }}>{val}</div>
                          <div className="l">{label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {fit && (
                  <div className="mt-3 space-y-2">
                    <div className="g-label">What moved the number</div>
                    {[
                      ["Chemistry", fit.score, ACCENT],
                      ["Natural slots", fit.chemistry_bonus / 0.165, ACCENT],
                      ["Manager", fit.manager_bonus / 0.05, fit.manager_matched ? ACCENT : "#8b857e"],
                      ["Average quality", avgOverall / 100, "#4C9BE8"],
                    ].map(([label, v, hex]) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <span className="text-[11.5px] shrink-0 text-right" style={{ width: 104, color: "var(--text-muted)" }}>{label}</span>
                        <div className="g-bar-track flex-1" style={{ height: 8 }}>
                          <div className="g-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Math.round((v ?? 0) * 100)))}%`,
                            "--fill": hex, "--fill-a": hex + "66" }} />
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 items-start pt-1">
                      <span className="g-rr-chip" style={{ "--c": ACCENT, "--c-a": ACCENT + "14", "--c-line": ACCENT + "3d" }}>
                        {fit.strongest}
                      </span>
                      <span className="g-rr-chip" style={{ "--c": "#E8654C", "--c-a": "#E8654C14", "--c-line": "#E8654C3d" }}>
                        {fit.weakest}
                      </span>
                      <span className="g-rr-chip" style={{ "--c": "#8b857e", "--c-a": "rgba(255,255,255,.04)", "--c-line": "rgba(255,255,255,.12)" }}>
                        {fit.natural_slots}/11 natural
                      </span>
                    </div>
                  </div>
                )}
                {isLoggedIn ? (
                  <div className="mt-4 flex gap-1.5">
                    <input value={saveName} onChange={e => setSaveName(e.target.value)}
                      placeholder="Name this squad" className="aura-ghost-input"
                      style={{ flex: 1 }} />
                    <button onClick={saveRoster} className="aura-pill-btn active">Save</button>
                  </div>
                ) : (
                  <div className="text-[11px] mt-4" style={{ color: "var(--text-faint)" }}>
                    Log in to save this squad.
                  </div>
                )}
                {saveMsg && <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{saveMsg}</div>}
                <button onClick={reset} className="aura-rating-btn mt-3" style={{ padding: "9px 22px" }}>
                  Play again
                </button>
              </div>
            ) : (
              <>
                {/* İki çark */}
                <div className="flex gap-3 justify-center text-center py-2">
                  <div style={{ flex: 1 }}>
                    <div className="g-label">Season</div>
                    <div className="font-logo text-base font-bold"
                      style={{ color: chosen ? "#F2C14E" : "var(--text-muted)", minHeight: 24 }}>
                      {chosen?.season || seasons[spinS] || "—"}
                    </div>
                  </div>
                  <div style={{ flex: 1.4 }}>
                    <div className="g-label">Club</div>
                    <div className="font-logo text-base font-bold"
                      style={{ color: chosen ? "#3FB08C" : "var(--text-muted)", minHeight: 24 }}>
                      {chosen?.team || teams[spinT] || "—"}
                    </div>
                    {chosen && (
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {LEAGUE_LABEL[chosen.league] || chosen.league}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 justify-center mb-2">
                  <button onClick={() => doSpin()} className="aura-rating-btn"
                    style={{ padding: "9px 24px" }}
                    disabled={spinning || !!chosen || !pairs.length}>
                    Spin
                  </button>
                </div>

                {/* Jokerler */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {jokerBtn("rt", RefreshIcon,  "Club",     jokerReTeam,  jokers.reTeam && !!chosen)}
                  {jokerBtn("ry", CalendarIcon, "Year",     jokerReYear,  jokers.reYear && !!chosen)}
                  {jokerBtn("rb", BoltIcon,     "Both",     jokerReBoth,  jokers.reBoth && !!chosen)}
                  {jokerBtn("d2", UsersIcon,    "Pick 2",   jokerDouble,
                    jokers.double && phase === "picking" && openSlots.length >= 2)}
                  {jokerBtn("dc", SearchIcon,   "Discover", jokerDiscover, jokers.discover && !!chosen)}
                </div>

                {msg && <div className="text-[11.5px] text-center mt-3"
                  style={{ color: pickingFor ? "#F2C14E" : "#E8654C" }}>{msg}</div>}

                {roster.length > 0 && !pickingFor && (
                  <div className="mt-3">
                    <div className="g-label mb-2">
                      {doubleLeft > 1 ? "Pick 2 — first player" : "Pick a player"}
                    </div>
                    {/* Basketbol draft havuzuyla aynı satır dili: mevki rozeti,
                        isim + arketip, sağda (Discover açıksa) kalite. */}
                    <div className="space-y-0.5" style={{ maxHeight: 330, overflowY: "auto" }}>
                      {roster.map(p => {
                        const hex = PHASE_COLOR[p.PHASE];
                        const q = Math.round((p.overall_score || 0) * 100);
                        return (
                          <button key={`${p.PLAYER_ID}-${p.PHASE}-${p.LEAGUE}`} onClick={() => choosePlayer(p)}
                            className="g-rr w-full"
                            style={{ "--accent": hex, "--accent-a": hex + "1f", "--accent-line": hex + "4d" }}>
                            <span className="g-rr-pos">{p.POSITION}</span>
                            <div className="flex-1 min-w-0">
                              <div className="g-rr-name truncate">{p.PLAYER_NAME}</div>
                              <div className="g-rr-meta">
                                <span className="g-rr-arch" style={{ color: hex }}>{p.primary_arch}</span>
                              </div>
                            </div>
                            {/* Per-90 statlar — Discover'dan bağımsız görünür.
                                Gizlenen şey oyuncunun NOTU; ham sayılarla
                                kendin karar veresin diye statlar açık
                                (basketboldaki draft havuzuyla aynı kural). */}
                            {(ROW_STATS[p.PHASE] || []).map(([key, label]) => (
                              <span key={key} className="g-rr-stat">
                                <span className="v">{statVal(p, key)}</span>
                                <span className="k">{label}</span>
                              </span>
                            ))}
                            {discover ? (
                              <>
                                <div className="g-bar-track shrink-0" style={{ height: 7, width: 40 }}>
                                  <div className="g-bar-fill" style={{ width: `${q}%`, "--fill": hex, "--fill-a": hex + "66" }} />
                                </div>
                                <span className="g-rr-val" style={{ color: hex }}>{q}</span>
                              </>
                            ) : (
                              <span className="g-rr-val" style={{ color: "var(--text-faint)", fontSize: 13 }}>?</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {!discover && (
                      <div className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
                        Ratings are hidden — spend Discover to see them.
                      </div>
                    )}
                  </div>
                )}

                {pickingFor && (
                  <div className="g-panel subtle mt-3 px-3 py-2.5"
                    style={{ "--accent": "#F2C14E", "--accent-line": "#F2C14E80" }}>
                    <span className="aura-blob" style={{ "--slot-color": "#F2C14E", right: -18, top: -20, width: 110, height: 66, opacity: 0.2 }} />
                    <div className="g-rr-name">{pickingFor.PLAYER_NAME}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {pickingFor.primary_arch} · natural {pickingFor.POSITION}
                    </div>
                    <div className="text-[10.5px] mt-1" style={{ color: "var(--text-faint)" }}>
                      Tap a slot on the pitch. Off-position slots cost you points.
                    </div>
                    <button onClick={() => { setPickingFor(null); setMsg(""); }}
                      className="aura-pill-btn mt-2" style={{ fontSize: 11 }}>Cancel</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Kadro tamamlandığında: önce karne, sonra simülasyon.
            Karne "bu XI ne yapabiliyor", simülasyon "peki ne kazanır". */}
        {phase === "complete" && fit && (
          <SquadAnalysis
            fit={fit}
            starters={pitchSlots.map(s => squad[s.id]).filter(Boolean)}
            slotOf={(p) => {
              const s = pitchSlots.find(x => squad[x.id]?.PLAYER_ID === p.PLAYER_ID);
              return s ? posPenaltyFor(p, s) : 0;
            }}
          />
        )}

        {phase === "complete" && fit && (
          <SeasonPanel
            starters={pitchSlots.map(s => squad[s.id]).filter(Boolean)}
            chemistry={fit.score}
            positionPenalty={fit.position_penalty}
            managerBonus={fit.manager_bonus}
            season={pitchSlots.map(s => squad[s.id]).find(Boolean)?.SEASON}
            squadName={saveName.trim() || "Your XI"}
          />
        )}

        {/* Kaydedilmiş kadroların sıralaması — kendi skorunu başkalarınınkiyle
            karşılaştırmak, tek başına bir sayıya bakmaktan anlamlı. */}
        {phase === "complete" && <FootballLeaderboard />}
      </div>
    </div>
  );
}
