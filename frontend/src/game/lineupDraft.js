// ── Lineup Builder draft motoru (arayüzsüz) ──────────────────────────────────
// LineupGame.jsx'in içindeki durum makinesi buraya taşındı ki web sayfası ve
// RankIt uygulamasının mobil arayüzü (arcade/basketball) AYNI kurallarla
// oynasın — ikisi aynı skor tablosuna yazıyor (docs/GAMES_IN_APP_PLAN.md §4.2).
//
// React'e bağımlı DEĞİL: bağımlılıklar (fetch, zamanlayıcı, rastgelelik)
// dışarıdan veriliyor, böylece node:test sahte saat ve sahte ağla sürebiliyor.
// React tarafı useLineupDraft.js (useSyncExternalStore ile ince sarmalayıcı).
//
// Fazlar: idle | pick_era | spin_season | spin_team | fetching | pick_player
//         | pick_pos | pick_coach | complete
import { ERAS } from "./eras";
import { COACHES } from "./coaches";
import { computeLineupFit } from "./lineupScore";
import { POSITIONS, ALL_SLOTS, getPrimaryPos, posPenaltyFor } from "./positions";
import { START_BUDGET, totalSpent, maxSpendNow, applyTeamPricing, priceOf } from "./salary";
import { finalScore } from "./draftScore";
import { apiUrl } from "../lib/apiOrigin";

export const EMPTY_LINEUP = Object.freeze({ PG: null, SG: null, SF: null, PF: null, C: null, B1: null, B2: null, B3: null, B4: null });
export const FRESH_JOKERS = Object.freeze({ reTeam: true, reYear: true, reBoth: true, double: true, discover: true });

// Çark süreleri (ms) — web'deki animasyonla aynı.
export const SPIN_MS = 1600;
export const TEAM_SETTLE_MS = 250;   // takım korunuyorsa çark dönmez, kısa yerleşme payı
export const JOKER_SPIN_MS = 2000;
export const NEXT_SPIN_MS = 400;     // pozisyon seçildikten sonra yeni tur
export const EMPTY_RESPIN_MS = 700;  // rosterda kimse kalmadıysa yeniden çevir
export const TIER_RESPIN_MS = 650;   // Salary Cap: alınabilir oyuncu yoksa yeniden çevir
export const TIER_HUNT_LIMIT = 15;   // bu kadar denemeden sonra wildcard: herkes alınabilir

function initialState() {
  return {
    phase: "idle",
    mode: "classic",          // classic | salarycap
    simEra: null,
    seasons: [],
    affinityMatrix: null,
    teamPool: [],
    players: [],
    lineup: EMPTY_LINEUP,
    pickedPlayer: null,
    coach: null,
    coachOptions: [],
    fitResult: null,
    statusMsg: "",
    moveSrc: null,            // sahada taşınan slot
    posFilter: "",            // oyuncu listesi G/F/C filtresi
    spinSeasons: false,
    spinTeams: false,
    targetSIdx: 0,
    targetTIdx: 0,
    chosenSeason: "",
    chosenTeam: "",
    jokers: FRESH_JOKERS,
    doubleActive: false,
    discoverActive: false,
    wildcard: false,          // Salary Cap: 15 denemede tier bulunamadı
  };
}

const defaultFetchJson = (url) => globalThis.fetch(url).then((r) => r.json());

export function createLineupDraft({
  fetchJson = defaultFetchJson,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
  random = Math.random,
} = {}) {
  let state = initialState();
  let guarantee = 0;          // Salary Cap: art arda kaç turda alınabilir tier çıkmadı
  let mainTimer = null;       // çarkın kendi zamanlayıcısı (joker/yeni spin onu iptal eder)
  const timers = new Set();   // tüm bekleyen zamanlayıcılar — reset/dispose hepsini temizler
  const listeners = new Set();
  let generation = 0;         // reset'ten önce başlamış isteklerin sonucu yok sayılır

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const later = (fn, ms) => {
    const id = setTimer(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const cancelMain = () => {
    if (mainTimer != null) { clearTimer(mainTimer); timers.delete(mainTimer); mainTimer = null; }
  };
  const laterMain = (fn, ms) => { mainTimer = later(() => { mainTimer = null; fn(); }, ms); };
  // Bir isteği o anki "nesle" bağla: reset'ten sonra dönen cevap durumu bozmasın.
  const guarded = (promise) => {
    const gen = generation;
    return new Promise((resolve, reject) => {
      promise.then((v) => { if (gen === generation) resolve(v); }, (e) => { if (gen === generation) reject(e); });
    });
  };
  const pick = (arr) => arr[Math.floor(random() * arr.length)];

  // ── Oyuncu çek (ortak) ─────────────────────────────────────────────────
  function fetchPlayers(season, team, onEmpty) {
    set({ phase: "fetching", statusMsg: "Loading players..." });
    guarded(fetchJson(apiUrl(`/api/game/players?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`)))
      .then((d) => {
        const taken = Object.values(state.lineup).filter(Boolean).map((x) => x.PLAYER_NAME);
        let list = (d.players || []).filter((p) => !taken.includes(p.PLAYER_NAME));
        if (list.length === 0) { onEmpty(); return; }

        // Takım içi fiyatlama: rosterın en iyi 3'üne yıldız primi tabanı
        if (state.mode === "salarycap") list = applyTeamPricing(list);

        // Salary Cap garantisi: rosterda kalan bütçeyle alınabilir oyuncu olmalı
        // (kalan her slota %4 rezerv bırakarak). Yoksa otomatik yeniden çevir
        // (15 denemeden sonra wildcard: rezerv şartı kalkar).
        if (state.mode === "salarycap" && !state.wildcard) {
          const lu = Object.values(state.lineup);
          const budgetLeft = START_BUDGET - totalSpent(lu);
          const slotsLeft = ALL_SLOTS.length - lu.filter(Boolean).length;
          const cap = maxSpendNow(budgetLeft, slotsLeft);
          if (!list.some((p) => priceOf(p) <= cap)) {
            guarantee++;
            if (guarantee >= TIER_HUNT_LIMIT) {
              set({ wildcard: true, statusMsg: "Tier hunt exhausted — wildcard round: anyone is pickable" });
            } else {
              set({ statusMsg: `No open-tier players on this roster — respinning (${guarantee})...` });
              later(() => startFullSpin(), TIER_RESPIN_MS);
              return;
            }
          } else {
            guarantee = 0;
          }
        }

        set({ players: list, posFilter: "", phase: "pick_player", ...(state.wildcard ? {} : { statusMsg: "" }) });
      })
      .catch(() => set({ statusMsg: "API error", phase: "idle" }));
  }

  // ── TAM SPIN: sezon → takım → oyuncular ─────────────────────────────────
  // fixed* ("değer önceden belli") ile spin* ("o çark dönsün mü") AYRI
  // kavramlar: Year jokeri sezonu yeniden yuvarlar ama takımı korur.
  function startFullSpin(fixedSeason = null, fixedTeam = null, opts = {}) {
    const seasons = state.seasons;
    if (seasons.length === 0) return;
    cancelMain();

    const spinSeason = opts.spinSeason ?? !fixedSeason;
    const spinTeam = opts.spinTeam ?? true;

    const sIdx = fixedSeason ? seasons.indexOf(fixedSeason) : Math.floor(random() * seasons.length);
    set({
      targetSIdx: Math.max(0, sIdx), spinSeasons: spinSeason, spinTeams: false,
      players: [], phase: spinSeason ? "spin_season" : "spin_team", statusMsg: "",
    });

    const afterSeasonStop = (season) => {
      set({ chosenSeason: season, statusMsg: "Loading teams..." });
      guarded(fetchJson(apiUrl(`/api/game/teams?season=${encodeURIComponent(season)}`)))
        .then((d) => {
          const teams = d.teams || [];
          if (teams.length === 0) { startFullSpin(); return; }
          // Sabit takım varsa onu seç, yoksa rastgele
          let tIdx;
          if (fixedTeam) {
            const fi = teams.indexOf(fixedTeam);
            tIdx = fi >= 0 ? fi : Math.floor(random() * teams.length);
          } else {
            tIdx = Math.floor(random() * teams.length);
          }
          set({ teamPool: teams, targetTIdx: tIdx, spinTeams: spinTeam, phase: "spin_team", statusMsg: "" });
          // Takım korunuyorsa çarkı döndürmenin anlamı yok — kısa bir
          // yerleşme payı bırakıp doğrudan rostere geç.
          laterMain(() => {
            const team = teams[tIdx];
            set({ spinTeams: false, chosenTeam: team });
            fetchPlayers(season, team, () => {
              set({ statusMsg: "No data, re-spinning..." });
              later(() => startFullSpin(), EMPTY_RESPIN_MS);
            });
          }, spinTeam ? SPIN_MS : TEAM_SETTLE_MS);
        })
        .catch(() => startFullSpin());
    };

    const landedSeason = fixedSeason || seasons[Math.max(0, sIdx)];
    if (spinSeason) {
      laterMain(() => { set({ spinSeasons: false }); afterSeasonStop(landedSeason); }, SPIN_MS);
    } else {
      afterSeasonStop(landedSeason);
    }
  }

  // ── Jokerler ─────────────────────────────────────────────────────────────
  function jokerReTeam() {
    const { jokers, teamPool, chosenTeam, chosenSeason } = state;
    if (!jokers.reTeam || teamPool.length === 0) return;
    cancelMain();
    // Mevcut takımı havuzdan çıkar
    const otherTeams = teamPool.filter((t) => t !== chosenTeam);
    const pool = otherTeams.length > 0 ? otherTeams : teamPool;
    const tIdx = teamPool.indexOf(pick(pool));
    set({
      jokers: { ...jokers, reTeam: false }, targetTIdx: Math.max(0, tIdx),
      spinTeams: true, spinSeasons: false, players: [], phase: "spin_team",
    });
    laterMain(() => {
      const team = teamPool[Math.max(0, tIdx)];
      set({ spinTeams: false, chosenTeam: team });
      fetchPlayers(chosenSeason, team, () => {
        // hâlâ boş ise bir kez daha dene
        const alt = pool.filter((t) => t !== team);
        if (alt.length === 0) return;
        const ai = teamPool.indexOf(pick(alt));
        set({ targetTIdx: Math.max(0, ai), spinTeams: true });
        laterMain(() => {
          const t2 = teamPool[Math.max(0, ai)];
          set({ spinTeams: false, chosenTeam: t2 });
          fetchPlayers(chosenSeason, t2, () => {});
        }, JOKER_SPIN_MS);
      });
    }, JOKER_SPIN_MS);
  }

  // Sadece yılı çevir (mevcut sezon hariç): sezon çarkı döner, takım korunur.
  function jokerReYear() {
    const { jokers, seasons, chosenSeason, chosenTeam } = state;
    if (!jokers.reYear || seasons.length === 0) return;
    set({ jokers: { ...jokers, reYear: false } });
    const other = seasons.filter((s) => s !== chosenSeason);
    startFullSpin(pick(other.length > 0 ? other : seasons), chosenTeam, { spinSeason: true, spinTeam: false });
  }

  // İkisini de çevir (aynı sezonu almamaya çalış): iki çark da döner.
  function jokerReBoth() {
    const { jokers, seasons, chosenSeason } = state;
    if (!jokers.reBoth) return;
    set({ jokers: { ...jokers, reBoth: false } });
    const other = seasons.filter((s) => s !== chosenSeason);
    startFullSpin(pick(other.length > 0 ? other : seasons), null, { spinSeason: true, spinTeam: true });
  }

  function jokerDouble() {
    if (!state.jokers.double) return;
    set({ jokers: { ...state.jokers, double: false }, doubleActive: true });
  }

  function jokerDiscover() {
    if (!state.jokers.discover) return;
    set({ jokers: { ...state.jokers, discover: false }, discoverActive: true });
  }

  // ── Salary Cap: bu turda harcanabilecek en fazla ────────────────────────
  function spendCapNow(s = state) {
    const lu = Object.values(s.lineup);
    const budgetLeft = START_BUDGET - totalSpent(lu);
    const slotsLeft = ALL_SLOTS.length - lu.filter(Boolean).length;
    return { budgetLeft, cap: s.wildcard ? budgetLeft : maxSpendNow(budgetLeft, slotsLeft) };
  }

  // ── Oyuncu seç ───────────────────────────────────────────────────────────
  function pickPlayer(player) {
    // Yalnız oyuncu seçme anında ve kadroda olmayan biri: pozisyon seçildikten
    // sonraki 400 ms'de eski liste hâlâ ekrandaysa aynı oyuncu ikinci kez
    // alınabiliyordu (telefonda yakalandı, 2026-09-26).
    if (state.phase !== "pick_player") return;
    if (Object.values(state.lineup).some((x) => x && x.PLAYER_NAME === player.PLAYER_NAME)) return;
    let enriched = player;
    // Salary Cap: bütçeyi aşan sözleşme alınamaz (wildcard'da rezerv şartı düşer)
    if (state.mode === "salarycap") {
      const c = priceOf(player);
      if (c > spendCapNow().cap) return;
      enriched = { ...player, _cost: c };
    }
    set({ pickedPlayer: enriched, discoverActive: false, statusMsg: "", phase: "pick_pos" });
  }

  function cancelPick() {
    set({ pickedPlayer: null, phase: "pick_player" });
  }

  // ── Pozisyon seç (starter mevkisi veya bench slotu) ─────────────────────
  function pickPos(pos) {
    const picked = state.pickedPlayer;
    if (!picked) return;
    const isStarter = POSITIONS.includes(pos);
    const isPrimary = isStarter && getPrimaryPos(picked) === pos;
    const enriched = {
      ...picked, _season: state.chosenSeason, _team: state.chosenTeam, _isPrimary: isPrimary,
      _assignedPos: pos, _isBench: !isStarter, _posPenalty: posPenaltyFor(picked, pos),
    };
    const newLineup = { ...state.lineup, [pos]: enriched };
    const filled = ALL_SLOTS.filter((p) => newLineup[p] !== null);
    if (filled.length === ALL_SLOTS.length) {
      // Koç draft'ı: 4 rastgele aday. Fit koç seçilirken hesaplanır
      // (pick_coach sırasında dizilim hâlâ değiştirilebilir).
      set({ lineup: newLineup, pickedPlayer: null, coachOptions: [...COACHES].sort(() => random() - 0.5).slice(0, 4), phase: "pick_coach" });
    } else if (state.doubleActive) {
      // İkili seçim: aynı havuzdan tekrar seç
      set({
        lineup: newLineup, pickedPlayer: null, doubleActive: false, phase: "pick_player",
        players: state.players.filter((p) => p.PLAYER_NAME !== picked.PLAYER_NAME),
      });
    } else {
      set({ lineup: newLineup, pickedPlayer: null });
      later(() => startFullSpin(), NEXT_SPIN_MS);
    }
  }

  // ── Sahada taşı / takas et ──────────────────────────────────────────────
  function slotTap(slot) {
    const cur = state.lineup;
    const src = state.moveSrc;
    if (src == null) {
      if (cur[slot]) set({ moveSrc: slot });
      return;
    }
    if (src === slot) { set({ moveSrc: null }); return; }
    const place = (pl, s) => (pl ? {
      ...pl, _assignedPos: s, _isBench: !POSITIONS.includes(s),
      _posPenalty: posPenaltyFor(pl, s), _isPrimary: POSITIONS.includes(s) && getPrimaryPos(pl) === s,
    } : null);
    set({ lineup: { ...cur, [slot]: place(cur[src], slot), [src]: place(cur[slot], src) }, moveSrc: null });
  }

  // ── Koç seç → Lineup Fit ─────────────────────────────────────────────────
  function pickCoach(coach) {
    const fit = computeLineupFit(POSITIONS.map((p) => state.lineup[p]), state.simEra, state.affinityMatrix);
    set({ coach, moveSrc: null, fitResult: fit, phase: "complete" });
  }

  // ── Giriş / dönem ───────────────────────────────────────────────────────
  function init() {
    guarded(fetchJson(apiUrl("/api/game/seasons")))
      .then((d) => set({ seasons: d.seasons || ["2025-26"] }))
      .catch(() => set({ seasons: ["2025-26"] }));
    guarded(fetchJson(apiUrl("/api/affinity")))
      .then((d) => set({ affinityMatrix: d.matrix || null }))
      .catch(() => {});
  }

  function setMode(mode) { set({ mode }); }
  function setPosFilter(posFilter) { set({ posFilter }); }
  function beginEraPick() { set({ phase: "pick_era" }); }
  function chooseEra(era) { set({ simEra: era }); startFullSpin(); }
  function randomEra() { chooseEra(pick(ERAS)); }

  function reset() {
    for (const id of timers) clearTimer(id);
    timers.clear();
    mainTimer = null;
    guarantee = 0;
    generation++;
    const keep = { mode: state.mode, seasons: state.seasons, affinityMatrix: state.affinityMatrix, posFilter: state.posFilter };
    state = { ...initialState(), ...keep };
    listeners.forEach((l) => l());
  }

  function dispose() {
    for (const id of timers) clearTimer(id);
    timers.clear();
    mainTimer = null;
    generation++;
  }

  return {
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    actions: {
      init, dispose, reset, setMode, setPosFilter, beginEraPick, chooseEra, randomEra, startFullSpin,
      jokerReTeam, jokerReYear, jokerReBoth, jokerDouble, jokerDiscover,
      pickPlayer, cancelPick, pickPos, slotTap, pickCoach,
    },
    spendCapNow,
  };
}

// ── Türetilmiş değerler (iki yüzey de aynı hesabı kullanır) ───────────────
export function deriveDraft(s) {
  const filledSlots = ALL_SLOTS.filter((p) => s.lineup[p] !== null);
  const emptySlots = ALL_SLOTS.filter((p) => s.lineup[p] === null);
  // Kimya: mevcut dizilime göre türetilir (taşıma/swap sonrası güncel kalır)
  const primaryCount = POSITIONS.filter((p) => s.lineup[p] && getPrimaryPos(s.lineup[p]) === p).length;
  const lu = Object.values(s.lineup);
  const budgetLeft = START_BUDGET - totalSpent(lu);
  return {
    filledSlots, emptySlots, primaryCount,
    isSpinPhase: s.phase === "spin_season" || s.phase === "spin_team" || s.phase === "fetching",
    canRearrange: ["spin_season", "spin_team", "fetching", "pick_player", "pick_coach"].includes(s.phase),
    budgetLeft,
    spendCap: s.mode === "salarycap" ? (s.wildcard ? budgetLeft : maxSpendNow(budgetLeft, emptySlots.length)) : null,
    jokerAvailable: {
      reTeam: s.jokers.reTeam, reYear: s.jokers.reYear, reBoth: s.jokers.reBoth,
      double: s.jokers.double && !s.doubleActive && emptySlots.length >= 2,
      discover: s.jokers.discover && !s.discoverActive,
    },
    score: s.phase === "complete" && s.fitResult ? finalScore(s.fitResult, primaryCount) : null,
  };
}
