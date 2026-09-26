// Games by Primary Arch — RankIt uygulamasının içindeki konuk modül.
// Discover'daki tuşla açılır (rankit/RankItPrototype.jsx), tam ekran, kendi
// başlığı ve kendi ekran yığınıyla. Kurallar web ile ortak motorlarda:
// game/lineupDraft.js (draft) + game/seasonRun.js (sezon). Plan:
// docs/GAMES_IN_APP_PLAN.md.
import { useEffect, useRef, useState } from "react";
import { useBackClose } from "../rankit/redesign/backStack";
import { useLineupDraft } from "../game/useLineupDraft";
import { useSeasonSim } from "../game/useSeasonSim";
import { computeAffinity } from "../game/lineupScore";
import { ERAS } from "../game/eras";
import { POSITIONS, BENCH_SLOTS, ALL_SLOTS } from "../game/positions";
import { apiUrl } from "../lib/apiOrigin";
import { savePendingScore, savePendingSeason } from "./pendingScore";
import { Confirm } from "./ui";
import { HomeScreen, EraScreen, SpinScreen, DraftScreen, RosterSheet, CoachScreen } from "./basketball/DraftScreens";
import { ResultScreen, SeasonSetupScreen, HistoryPickScreen, SeasonScreen, LeaderboardScreen, SignInSheet } from "./basketball/SeasonScreens";
import "./arcade.css";

// Oturum RankIt ile aynı anahtarlarda (RankItMobileApp / AuthContext).
function readToken() {
  try { return localStorage.getItem("nba_arch_token") || null; } catch { return null; }
}

// ── Draft bittikten sonrası: skor, sezon, skor tablosu ──────────────────────
function CompletedRun({ draft, token, view, setView, onReset, onClose, onGuestSignIn, signInOpen, setSignInOpen }) {
  const era = draft.simEra || ERAS[5];
  const score = draft.score;
  const isGuest = !token;
  const players = POSITIONS.map((p) => draft.lineup[p]).filter(Boolean);
  const bench = BENCH_SLOTS.map((p) => draft.lineup[p]).filter(Boolean);
  const roster = [...players, ...bench];
  const [affinity01] = useState(() => {
    const a = computeAffinity(players, draft.affinityMatrix);
    return a == null ? null : Math.round(a * 100) / 100;
  });
  const [post, setPost] = useState({ status: "pending", id: null });

  // Skor: giriş yapmışsa tabloya bir kez yazılır (web'deki ScoreReveal gibi);
  // misafirse girişe kadar cihazda bekler.
  const postedFor = useRef(null);
  useEffect(() => {
    if (!score || postedFor.current === draft.fitResult) return;
    postedFor.current = draft.fitResult;
    const body = {
      pct: score.pct, grade: score.grade, lineup: roster.map((p) => p.PLAYER_NAME), mode: draft.mode,
      roster: draft.mode === "salarycap" && roster.length === ALL_SLOTS.length ? roster : [],
    };
    if (!token) { savePendingScore(body); return; }
    fetch(apiUrl("/api/game/score"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setPost({ status: "posted", id: d?.id ?? null }))
      .catch(() => setPost({ status: "error", id: null }));
  });

  const season = useSeasonSim({
    players, bench, simEra: era, fit: draft.fitResult, affinity01, coach: draft.coach,
    gameScoreId: post.id, isLoggedIn: !!token, token,
    onGuestResult: (body) => savePendingSeason(body),
  });

  const leaderboard = view === "leaderboard";
  let screen;
  if (leaderboard) {
    screen = <LeaderboardScreen initialMode={draft.mode} onBack={() => setView("result")} />;
  } else if (view === "setup") {
    screen = <SeasonSetupScreen season={season} roster={roster} era={era} onBack={() => setView("result")}
      onPickHistory={() => setView("history")} onRun={() => { season.run(); setView("season"); }} />;
  } else if (view === "history") {
    screen = <HistoryPickScreen season={season} era={era} onBack={() => setView("setup")} onDone={() => setView("setup")} />;
  } else if (view === "season") {
    screen = <SeasonScreen season={season} era={era} onBack={() => setView("result")} onLeaderboard={() => setView("leaderboard")} />;
  } else {
    screen = <ResultScreen draft={draft} score={score} era={era} isGuest={isGuest} posted={post.status} token={token}
      onBack={onReset} onClose={onClose} onLeaderboard={() => setView("leaderboard")}
      onSignIn={() => setSignInOpen(true)}
      onSeason={() => setView(season.stage === "idle" ? "setup" : "season")} />;
  }
  return (
    <>
      {screen}
      {signInOpen && <SignInSheet onClose={() => setSignInOpen(false)}
        onSignIn={() => { setSignInOpen(false); onGuestSignIn?.(); }} />}
    </>
  );
}

export default function GamesSurface({ onClose, onGuestSignIn }) {
  const draft = useLineupDraft();
  const [token] = useState(readToken);
  const [view, setView] = useState("result");       // draft bitince: result | setup | history | season | leaderboard
  const [homeBoard, setHomeBoard] = useState(false); // girişten açılan skor tablosu
  const [rosterOpen, setRosterOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [runKey, setRunKey] = useState(0);           // her yeni draft kendi sonuç/sezon durumuyla başlar
  const { phase } = draft;
  const inDraft = ["spin_season", "spin_team", "fetching", "pick_player", "pick_pos", "pick_coach"].includes(phase);

  const startOver = () => { setConfirm(null); setRosterOpen(false); setView("result"); setRunKey((k) => k + 1); draft.reset(); };
  const askLeave = () => setConfirm({
    title: "Leave the draft?",
    body: "Your picks so far will be lost.",
    confirmLabel: "Leave the draft",
    onConfirm: startOver,
  });
  const askStartOver = () => setConfirm({
    title: "Start a new draft?",
    body: token ? "This lineup's score is already on the leaderboard." : "Your guest result stays on this phone until you sign in.",
    confirmLabel: "Start over",
    cancelLabel: "Stay here",
    onConfirm: startOver,
  });

  // Android geri tuşu + Escape: önce açık katman, sonra ekran yığınında bir adım.
  const back = () => {
    if (confirm) { setConfirm(null); return; }
    if (signInOpen) { setSignInOpen(false); return; }
    if (rosterOpen) { setRosterOpen(false); return; }
    if (phase === "pick_pos") { draft.cancelPick(); return; }
    if (homeBoard) { setHomeBoard(false); return; }
    if (phase === "idle") { onClose(); return; }
    if (phase === "pick_era") { draft.reset(); return; }
    if (inDraft) { askLeave(); return; }
    if (phase === "complete") {
      if (view === "history") setView("setup");
      else if (view !== "result") setView("result");
      else askStartOver();
    }
  };
  useBackClose(back);
  const backRef = useRef(back);
  useEffect(() => { backRef.current = back; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); backRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  let body;
  if (phase === "idle") {
    body = homeBoard
      ? <LeaderboardScreen initialMode={draft.mode} onBack={() => setHomeBoard(false)} />
      : <HomeScreen draft={draft} onClose={onClose} onLeaderboard={() => setHomeBoard(true)} />;
  } else if (phase === "pick_era") {
    body = <EraScreen draft={draft} onBack={draft.reset} />;
  } else if (phase === "pick_player" || (phase === "pick_pos" && draft.pickedPlayer)) {
    // Pozisyon seçildikten sonraki kısa arada (yeni çark başlamadan) eski liste
    // gösterilmez — alttaki else çark ekranına düşer.
    body = <DraftScreen draft={draft} onLeave={askLeave} onRoster={() => setRosterOpen(true)} />;
  } else if (phase === "pick_coach") {
    body = <CoachScreen draft={draft} onLeave={askLeave} onRoster={() => setRosterOpen(true)} />;
  } else if (phase === "complete" && draft.score) {
    body = <CompletedRun key={runKey} draft={draft} token={token} view={view} setView={setView}
      onReset={askStartOver} onClose={onClose} onGuestSignIn={onGuestSignIn}
      signInOpen={signInOpen} setSignInOpen={setSignInOpen} />;
  } else {
    body = <SpinScreen draft={draft} onLeave={askLeave} />;
  }

  return (
    <div className="arc-surface" role="dialog" aria-modal="true" aria-label="Games by Primary Arch">
      {body}
      {rosterOpen && <RosterSheet draft={draft} onClose={() => setRosterOpen(false)} />}
      {confirm && <Confirm {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
