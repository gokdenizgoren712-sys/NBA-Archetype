// ── Sezon simülasyonu motoru (arayüzsüz) ─────────────────────────────────────
// SeasonSimPanel.jsx'in içindeki mantık buraya taşındı ki web paneli ve RankIt
// uygulamasının mobil sezon ekranları (arcade/basketball) AYNI sezonu oynasın:
// rotasyon/dakika editörü, Quick Sim, Rewrite History (gerçek sezon + takım +
// 29 takımlık lig), maç maç akış, gerçek playoff bracket'i, dynasty → REPEAT →
// THREEPEAT ve skor tablosuna yazılan sezon sonucu.
//
// React'e bağımlı DEĞİL (bkz. lineupDraft.js): ağ, lig kurucu, zamanlayıcı ve
// rastgelelik dışarıdan verilir. React tarafı useSeasonSim.js.
//
// Aşamalar (stage): idle | regular | playoffs | done
import { simulateSeason, BASE_MINUTES, MINUTE_FLEX, agePenaltyFor } from "./seasonSim";
import { buildLeague as defaultBuildLeague } from "./leagueSim";
import { initBracket, deriveRhResultKey } from "./playoffBracket";
import { apiUrl } from "../lib/apiOrigin";

export const MONTHS = ["OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR"];
export const TOTAL_MINUTES = 240;
export const REVEAL_TICK_MS = 60;     // her tikte 2 maç
export const ROUND_TICK_MS = 950;     // playoff turu başına
export const DONE_DELAY_MS = 600;

// "Rewrite History" — era.years [start, endExclusive) aralığındaki gerçek
// sezon string'lerini üretir (bkz. game/eras.js ERAS). İçinde bulunulan/açık
// sezon hariç.
export function seasonsInEra(era, nowYear = new Date().getFullYear()) {
  if (!era?.years) return [];
  const [start, endExcl] = era.years;
  const end = Math.min(endExcl, nowYear);
  const out = [];
  for (let y = start; y < end; y++) out.push(`${y}-${String(y + 1).slice(-2)}`);
  return out;
}

const defaultFetchJson = (url) => globalThis.fetch(url).then((r) => r.json());
const defaultPostJson = (url, body, token) => globalThis.fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

/** inputs: { players, bench, simEra, fit, affinity01, coach, gameScoreId,
 *            fixedSeason, excludeTeam, noSave, isLoggedIn, token, onGuestResult }
 *  onGuestResult(body): misafirken sezon sonucu (uygulama bunu cihaza yazar). */
export function createSeasonRun({
  fetchJson = defaultFetchJson,
  postJson = defaultPostJson,
  buildLeague = defaultBuildLeague,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
  random = Math.random,
} = {}, initialInputs = {}) {
  let inputs = { bench: [], players: [], ...initialInputs };
  const fixedSeason = inputs.fixedSeason || null;
  const nRoster = (inputs.players?.length || 0) + (inputs.bench?.length || 0);

  let state = {
    stage: "idle",
    result: null,
    revealGames: 0,
    revealRounds: 0,
    runCount: 0,
    minutes: BASE_MINUTES.slice(0, nRoster),     // 5 starter + N bench
    dynasty: { year: 1, titles: 0 },
    leagueLoading: false,
    leagueProgress: null,                        // { built, total } — Rewrite History lig kurulumu
    league: null,                                // { teamRatings, teamSeasons, rosterByAbbr, ... }
    leagueWarning: null,
    bracket: null,                               // gerçek playoff bracket'i (Rewrite History)
    rhTitleWon: false,                           // RH'de şampiyonluk YALNIZ gerçek bracket'ten
    simMode: fixedSeason ? "history" : "quick",  // quick | history
    rhStep: fixedSeason ? "team" : "season",     // season | team | ready
    rhSeasons: seasonsInEra(inputs.simEra),
    rhSeason: fixedSeason,
    rhTeams: [],
    rhTeam: null,
    rhSchedule: null,
    rhLoading: false,
    rhError: "",
  };

  const listeners = new Set();
  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
  let alive = true;
  let generation = 0;
  let animTimer = null;
  let pendingAfter = null;
  let postedRh = false;       // RH gerçek bracket sonucu (yıl 1) bir kez yazılır

  const guarded = (promise) => {
    const gen = generation;
    return new Promise((resolve, reject) => {
      promise.then((v) => { if (gen === generation) resolve(v); }, (e) => { if (gen === generation) reject(e); });
    });
  };
  const cancelAnim = () => { if (animTimer != null) { clearTimer(animTimer); animTimer = null; } };
  const later = (fn, ms) => { animTimer = setTimer(() => { animTimer = null; fn(); }, ms); };
  const onProgress = (built, total) => set({ leagueProgress: { built, total } });

  // Skor tablosuna sezon sonucu. /api/game/score'un id'si varsa TAM o satır
  // güncellenir (api/main.py save_season_result). Misafir: uygulama saklar.
  function report(res, resultKey) {
    if (inputs.noSave) return;
    const body = {
      wins: res.wins, season_result: resultKey, sim_era: inputs.simEra?.id ?? "",
      game_id: inputs.gameScoreId ?? null,
      real_season: res.realSeason || null, real_team: res.realTeam || null,
    };
    if (inputs.isLoggedIn && inputs.token) {
      Promise.resolve().then(() => postJson(apiUrl("/api/game/season-result"), body, inputs.token)).catch(() => {});
    } else {
      inputs.onGuestResult?.(body);
    }
  }

  // Ortak animasyon: sezonu akıt, playoff'u aç. nGames sabit 82 DEĞİL — RH'de
  // kısaltılmış gerçek sezonlar olabilir (1998-99 lockout 50 maç vb.).
  function animate(res, after) {
    cancelAnim();
    const nGames = res.gameLog.length;
    pendingAfter = after || null;
    set({ result: res, revealGames: 0, revealRounds: 0, stage: "regular" });
    const finish = () => {
      set({ stage: "done" });
      const cb = pendingAfter; pendingAfter = null; cb?.();
    };
    let g = 0;
    const tickGames = () => {
      g = Math.min(nGames, g + 2);
      set({ revealGames: g });
      if (g < nGames) { later(tickGames, REVEAL_TICK_MS); return; }
      if (!res.madePlayoffs) { finish(); return; }
      set({ stage: "playoffs" });
      let r = 0;
      const tickRounds = () => {
        r++;
        set({ revealRounds: r });
        if (r >= res.playoffRounds.length) later(finish, DONE_DELAY_MS);
        else later(tickRounds, ROUND_TICK_MS);
      };
      later(tickRounds, ROUND_TICK_MS);
    };
    later(tickGames, REVEAL_TICK_MS);
  }

  /** Telefonun "Skip to the end"ü: akışı atlayıp sonuca geç (sonuç aynı). */
  function skipReveal() {
    const res = state.result;
    if (!res || (state.stage !== "regular" && state.stage !== "playoffs")) return;
    cancelAnim();
    set({
      revealGames: res.gameLog.length,
      revealRounds: res.madePlayoffs ? res.playoffRounds.length : 0,
      stage: "done",
    });
    const cb = pendingAfter; pendingAfter = null; cb?.();
  }

  async function loadLeague(season, team) {
    set({ leagueLoading: true, leagueProgress: null });
    try {
      return await guarded(buildLeague(season, team, inputs.simEra, { onProgress }));
    } finally {
      if (alive) set({ leagueLoading: false });
    }
  }

  // Yeni dynasty (sezon 1). Yalnızca İLK koşu skor tablosuna işlenir.
  async function run() {
    if (state.leagueLoading) return;
    const gen = generation;
    set({ bracket: null, leagueWarning: null });
    postedRh = false;   // yeni dynasty — gerçek sonuç henüz yazılmadı
    const extras = { bench: inputs.bench, coach: inputs.coach, minutes: state.minutes };
    const history = state.simMode === "history";
    if (history && state.rhSchedule) {
      const sched = state.rhSchedule;
      extras.realSchedule = sched;
      try {
        const built = await loadLeague(sched.season, sched.team);
        set({ league: built });
        extras.teamRatings = built.teamRatings;
        // Takımların %70'inden azı kurulduysa bozuk bir ligi sessizce gösterme.
        if (built.teamsBuilt < built.teamsExpected * 0.7) {
          set({ leagueWarning: `Only ${built.teamsBuilt} of ${built.teamsExpected} teams built successfully — the league, awards, and playoff bracket below may be incomplete. Try "Run It Back" to rebuild.` });
        }
      } catch {
        if (gen !== generation) return;
        set({ leagueWarning: "Couldn't build the rest of the league (network error) — opponent strength fell back to the old win-rate estimate, and the league/playoff sections below won't appear. Try again." });
      }
      if (gen !== generation) return;
    }
    const res = simulateSeason(inputs.players, inputs.simEra, inputs.fit, inputs.affinity01, extras);
    const isFirst = state.runCount === 0;
    // RH'de "şampiyon musun" YALNIZ gerçek bracket'ten gelir; Quick Sim
    // sentetik result.champion'a bakar.
    set({
      runCount: state.runCount + 1, rhTitleWon: false,
      dynasty: { year: 1, titles: history ? 0 : (res.champion ? 1 : 0) },
    });
    animate(res);
    // RH'de playoff'a kalmadıysa sonuç KESİN (gerçek galibiyet sayısı) — hemen
    // yaz; kaldıysa gerçek bracket karar verince updateBracket yazar.
    if (isFirst) {
      if (history) { if (!res.madePlayoffs) report(res, "MISSED"); }
      else report(res, res.resultKey);
    }
  }

  // Şampiyonluğu savun — kadro her sezon yaşlanır. RH'de bir sonraki GERÇEK
  // sezona ilerlenir (aynı era içinde) ve lig o sezonla yeniden kurulur; era'da
  // sonraki sezon yoksa aynı sezon yaşlanmış kadroyla tekrar oynanır.
  async function defend() {
    if (state.leagueLoading) return;
    const gen = generation;
    const { dynasty, rhSchedule, league, rhSeasons, rhTitleWon, runCount } = state;
    const history = state.simMode === "history";
    set({ bracket: null, leagueWarning: null });
    const nextYear = dynasty.year + 1;
    const extras = { bench: inputs.bench, coach: inputs.coach, minutes: state.minutes, agePenalty: agePenaltyFor(nextYear) };
    if (history && rhSchedule) {
      const idx = rhSeasons.indexOf(rhSchedule.season);
      const nextSeason = idx >= 0 && idx < rhSeasons.length - 1 ? rhSeasons[idx + 1] : null;
      const targetSeason = nextSeason || rhSchedule.season;
      try {
        set({ leagueLoading: true, leagueProgress: null });
        const sched = await guarded(fetchJson(apiUrl(`/api/historical/${targetSeason}/team/${rhSchedule.team}/schedule`)));
        if (!sched?.games?.length) throw new Error("no schedule for target season");
        const built = await loadLeague(targetSeason, rhSchedule.team);
        set({ league: built, rhSchedule: sched });
        extras.realSchedule = sched;
        extras.teamRatings = built.teamRatings;
        if (built.teamsBuilt < built.teamsExpected * 0.7) {
          set({ leagueWarning: `Only ${built.teamsBuilt} of ${built.teamsExpected} teams built successfully for ${targetSeason} — the league/bracket below may be incomplete.` });
        } else if (!nextSeason) {
          set({ leagueWarning: `No more real ${inputs.simEra.label} seasons after this one — replaying ${targetSeason} with your aged roster.` });
        }
      } catch {
        if (gen !== generation) return;
        set({ leagueWarning: `Couldn't advance to a new real season — replayed ${rhSchedule.season} again instead.` });
        extras.realSchedule = rhSchedule;
        if (league?.teamRatings) extras.teamRatings = league.teamRatings;
      } finally {
        if (alive) set({ leagueLoading: false });
      }
      if (gen !== generation) return;
    }
    const res = simulateSeason(inputs.players, inputs.simEra, inputs.fit, inputs.affinity01, extras);
    const wonThisSeason = history ? rhTitleWon : !!res.champion;
    const newTitles = wonThisSeason ? dynasty.titles + 1 : dynasty.titles;
    set({ rhTitleWon: false, dynasty: { year: nextYear, titles: newTitles, ended: !wonThisSeason } });
    animate(res, () => {
      // İlk dynasty koşusunda repeat/threepeat skor tablosuna yükseltilir
      if (runCount === 1 && wonThisSeason) {
        if (newTitles >= 3) report(res, "THREEPEAT");
        else if (newTitles === 2) report(res, "REPEAT");
      }
    });
  }

  // Gerçek bracket'in "kim şampiyon" kararı: dynasty/Defend the Title bunu
  // izler; yıl 1'de sonucu skor tablosuna bir kez yazar.
  function updateBracket(bracket) {
    set({ bracket });
    const { rhSchedule } = state;
    if (bracket?.champion && rhSchedule && bracket.champion.abbr === rhSchedule.team) set({ rhTitleWon: true });
    if (state.simMode !== "history" || !bracket || state.dynasty.year !== 1 || postedRh) return;
    const key = deriveRhResultKey(bracket, rhSchedule?.team);
    if (!key) return;
    postedRh = true;
    if (state.result) report(state.result, key);
  }

  // "Simulate Playoffs": ligin gerçek bracket'ini kur.
  function startBracket() {
    const { league, rhSchedule, result, dynasty } = state;
    if (!league || !rhSchedule || !result) return;
    // Playoff box-score + organik MVP için roster/profil bilgisi
    const rosterInfo = {};
    for (const [abbr, r] of Object.entries(league.rosterByAbbr)) {
      rosterInfo[abbr] = {
        players: r.starters, bench: r.bench,
        profiles: league.teamSeasons[abbr]?.profiles, benchProfiles: league.teamSeasons[abbr]?.benchProfiles,
      };
    }
    const userRoster = { players: inputs.players, bench: inputs.bench, profiles: result.profiles, benchProfiles: result.benchProfiles };
    // initBracket bir konferansta çok az takım kurulduysa açık bir Error fırlatır.
    try {
      updateBracket(initBracket(rhSchedule.season, league.teamSeasons, league.teamRatings, rhSchedule.team,
        result.rating, result.wins, result.losses, random, rosterInfo, userRoster, agePenaltyFor(dynasty.year)));
    } catch (err) {
      set({ leagueWarning: err.message });
    }
  }

  // ── Rewrite History kurulumu ─────────────────────────────────────────────
  function loadRhTeams(season, onDone) {
    set({ rhLoading: true });
    guarded(fetchJson(apiUrl(`/api/historical/${season}/teams`)))
      .then((d) => set({ rhTeams: d.teams || [], ...(onDone ? onDone() : {}) }))
      .catch(() => set({ rhError: "Could not load teams for this season." }))
      .finally(() => { if (alive) set({ rhLoading: false }); });
  }

  function pickRhSeason(season) {
    set({ rhSeason: season, rhTeam: null, rhSchedule: null, rhError: "" });
    loadRhTeams(season, () => ({ rhStep: "team" }));
  }

  function pickRhTeam(abbr) {
    const season = state.rhSeason;
    set({ rhTeam: abbr, rhError: "", rhLoading: true });
    guarded(fetchJson(apiUrl(`/api/historical/${season}/team/${abbr}/schedule`)))
      .then((d) => set({ rhSchedule: d, rhStep: "ready" }))
      .catch(() => set({ rhError: "Could not load that team's schedule." }))
      .finally(() => { if (alive) set({ rhLoading: false }); });
  }

  function setSimMode(simMode) { set({ simMode }); }
  function backToSeasons() { set({ rhStep: "season", rhTeam: null }); }
  function changeTeam() { set({ rhStep: "team" }); }

  // Rotasyon: taban ±MINUTE_FLEX (en az 6), toplam 240'ı aşamaz.
  function bumpMinute(i, d) {
    const ms = state.minutes;
    const base = BASE_MINUTES[i] ?? 13;
    const next = ms[i] + d;
    if (next < Math.max(6, base - MINUTE_FLEX) || next > base + MINUTE_FLEX) return;
    if (d > 0 && minuteBankOf(ms) <= 0) return;
    const copy = [...ms];
    copy[i] = next;
    set({ minutes: copy });
  }

  function init() {
    alive = true;
    if (fixedSeason) loadRhTeams(fixedSeason);
  }

  function dispose() {
    alive = false;
    generation++;
    cancelAnim();
    pendingAfter = null;
  }

  return {
    getState: () => state,
    getInputs: () => inputs,
    setInputs: (next) => { inputs = { bench: [], players: [], ...next }; },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    actions: {
      init, dispose, run, defend, skipReveal, startBracket, updateBracket,
      pickRhSeason, pickRhTeam, setSimMode, backToSeasons, changeTeam, bumpMinute,
    },
  };
}

export function minuteBankOf(minutes) {
  return TOTAL_MINUTES - minutes.reduce((a, b) => a + b, 0);
}

// ── Türetilmiş değerler (iki yüzey de aynı hesabı kullanır) ───────────────
export function deriveSeason(s, inputs = {}) {
  const shownLog = s.result ? s.result.gameLog.slice(0, s.revealGames) : [];
  const shownWins = shownLog.filter(Boolean).length;
  // Canlı akış sırasında gerçek takımın O ANA KADARki kaydı — result.gameSchedule
  // her maçın gerçek skorunu taşıyor.
  const shownReal = s.result?.gameSchedule ? s.result.gameSchedule.slice(0, s.revealGames) : [];
  const shownRealWins = shownReal.filter((g) => g.realTeamPts > g.realOppPts).length;
  return {
    minuteBank: minuteBankOf(s.minutes),
    rhActive: s.simMode === "history",
    visibleRhTeams: inputs.excludeTeam ? s.rhTeams.filter((t) => t.abbr !== inputs.excludeTeam) : s.rhTeams,
    nGames: s.result ? s.result.gameLog.length : 0,
    shownLog, shownWins, shownLosses: shownLog.length - shownWins,
    shownReal, shownRealWins, shownRealLosses: shownReal.length - shownRealWins,
    month: MONTHS[Math.min(6, Math.floor(s.revealGames / 12))],
  };
}
