// Lineup Builder'ın sonuç ve sezon ekranları (tuval 10–14): sonuç, sezon
// kurulumu + rotasyon, Rewrite History seçimi, sezon akışı + playoff'lar,
// skor tablosu, misafir girişi. Kurallar ortak motorda (game/seasonRun.js).
import { useEffect, useState } from "react";
import { Crown, Dna, Disc3, Play, Share2, Trophy } from "lucide-react";
import { BASE_MINUTES, MINUTE_FLEX } from "../../game/seasonSim";
import { ERA_PILLAR_WEIGHTS, PILLARS, PILLAR_LABELS } from "../../game/eras";
import { stepBracket } from "../../game/playoffBracket";
import { apiUrl } from "../../lib/apiOrigin";
import { Head, CloseButton, Sheet } from "../ui";
import { GRADE_HEX, MODE_LABEL } from "../format";

const pctOf = (v) => Math.round((Number(v) || 0) * 100);
const barHex = (v) => (v >= 0.75 ? "#4ade80" : v >= 0.55 ? "#facc15" : v >= 0.4 ? "#fb923c" : "#f87171");
export const SITE_GAME_URL = "https://primaryarch.net/basketball/game";

// ── 10 · Sonuç ──────────────────────────────────────────────────────────────
export function ResultScreen({ draft, score, era, isGuest, posted, token, onBack, onClose, onSeason, onLeaderboard, onSignIn }) {
  const { fitResult: fit, coach, primaryCount } = draft;
  const [saveName, setSaveName] = useState("");
  const [save, setSave] = useState({ status: "idle", err: "" });
  const [shared, setShared] = useState("");
  const weights = ERA_PILLAR_WEIGHTS[era.id] || {};

  const saveRoster = () => {
    if (!saveName.trim()) { setSave({ status: "error", err: "Give the roster a name." }); return; }
    setSave({ status: "saving", err: "" });
    fetch(apiUrl("/api/rosters"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: saveName.trim(), source_mode: "single", mode: draft.mode, sim_era: era.id,
        roster: Object.values(draft.lineup).filter(Boolean), overall_pct: score.pct, grade: score.grade,
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => setSave(ok ? { status: "saved", err: "" } : { status: "error", err: d.detail || "Could not save" }))
      .catch(() => setSave({ status: "error", err: "Connection error" }));
  };

  const share = async () => {
    const text = `My Lineup Builder draft graded ${score.grade} (${score.pct}/100) in the ${era.label} — ${SITE_GAME_URL}`;
    try {
      if (navigator.share) { await navigator.share({ title: "Lineup Builder", text }); setShared("Shared"); return; }
      await navigator.clipboard.writeText(text);
      setShared("Copied to clipboard");
    } catch { setShared(""); }
  };

  return (
    <>
      <Head onBack={onBack} backLabel="Start over" eyebrow={`LINEUP BUILDER · ${era.label.toUpperCase()}`} title="Your lineup"
        right={<CloseButton onClose={onClose} />} />
      <main className="arc-main" style={{ gap: 14 }}>
        <section className="arc-hero" aria-label={`Lineup fit ${score.grade}, ${score.pct} out of 100`}>
          <small className="arc-kicker">LINEUP FIT · {MODE_LABEL[draft.mode].toUpperCase()}</small>
          <strong className="arc-hero-grade" style={{ color: GRADE_HEX[score.grade] }}>{score.grade}</strong>
          <span style={{ font: "700 18px/1 var(--font-logo)", color: "var(--arc-text-2)" }}><span className="arc-num">{score.pct}</span> / 100{coach ? ` · coached by ${coach.name}` : ""}</span>
          {primaryCount > 0 && <span className="arc-small" style={{ color: "var(--arc-gold)" }}>★ Chemistry bonus · {primaryCount} primary slot{primaryCount === 1 ? "" : "s"} (+{Math.round(score.chemBonus * 100)})</span>}
          <div className="arc-metrics">
            {[["Quality", fit.avgQuality, "45%"], ["Coverage", fit.coverage, "40%"], ["Chemistry", fit.roleFit, "15%"]].map(([l, v, w]) => (
              <div key={l} className="arc-metric"><b className="arc-num" style={{ color: barHex(v) }}>{pctOf(v)}</b><small>{l} · {w}</small></div>
            ))}
          </div>
        </section>

        <section className="arc-card arc-stack" style={{ gap: 10 }}>
          <small className="arc-kicker">YOUR COVERAGE · WHAT THE {era.label.toUpperCase()} WANTS</small>
          {PILLARS.map((p) => (
            <div key={p} className="arc-bar">
              <span>{PILLAR_LABELS[p]}</span>
              <span className="arc-bar-track"><i style={{ width: `${pctOf(fit[p])}%`, background: barHex(fit[p]) }} /></span>
              <b title="Era weight">×{(weights[p] ?? 1).toFixed(2)}</b>
            </div>
          ))}
        </section>

        {isGuest ? (
          <button type="button" className="arc-note" onClick={onSignIn}>
            <span className="arc-small" style={{ flex: "1 1 auto", color: "var(--arc-text-2)" }}>Playing as a guest — sign in to post this score.</span>
            <span style={{ font: "700 11px/1 var(--font-logo)", letterSpacing: ".1em" }}>SIGN IN ›</span>
          </button>
        ) : (
          <p role="status" className={`arc-small ${posted === "error" ? "arc-err" : "arc-ok"}`} style={{ margin: 0 }}>
            {posted === "posted" ? "Posted to the leaderboard." : posted === "error" ? "Could not post the score — check your connection." : "Posting to the leaderboard…"}
          </p>
        )}

        {!isGuest && (
          <section className="arc-card arc-stack" style={{ gap: 10 }}>
            <small className="arc-kicker">SAVE THIS ROSTER</small>
            {save.status === "saved" ? <p className="arc-small arc-ok" style={{ margin: 0 }}>Roster saved — find it on your Primary Arch profile.</p> : (
              <div className="arc-row">
                <input className="arc-input" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Fear the Deer 2011" aria-label="Roster name" />
                <button type="button" className="arc-ghost" style={{ minHeight: 46 }} disabled={save.status === "saving" || !saveName.trim()} onClick={saveRoster}>
                  {save.status === "saving" ? "Saving…" : "Save"}
                </button>
              </div>
            )}
            {save.err && <p className="arc-small arc-err" style={{ margin: 0 }}>{save.err}</p>}
          </section>
        )}
      </main>
      <footer className="arc-foot" style={{ flexDirection: "column" }}>
        <button type="button" className="arc-cta" onClick={onSeason}>Simulate the season</button>
        <div className="arc-row">
          <button type="button" className="arc-ghost is-fill" onClick={share}><Share2 size={15} />{shared || "Share"}</button>
          <button type="button" className="arc-ghost is-fill" onClick={onLeaderboard}><Trophy size={15} />Top scores</button>
        </div>
      </footer>
    </>
  );
}

// ── 11 · Sezon kurulumu + rotasyon ──────────────────────────────────────────
function RotationEditor({ season, roster }) {
  return (
    <section aria-label="Rotation" className="arc-rot">
      <div className="arc-row" style={{ justifyContent: "space-between", padding: "2px 2px 6px" }}>
        <small className="arc-kicker">ROTATION</small>
        <span style={{ font: "700 11px/1 var(--font-logo)", letterSpacing: ".06em", color: season.minuteBank > 0 ? "var(--arc-green)" : "var(--arc-faint)" }}>
          {season.minuteBank > 0 ? `${season.minuteBank} min in the bank` : "240 / 240 min"}
        </span>
      </div>
      {roster.map((p, i) => {
        const m = season.minutes[i] ?? 0;
        const base = BASE_MINUTES[i] ?? 13;
        const note = m >= 39 ? ["fatigue −%", "var(--arc-red)"] : m >= 37 ? ["tiring", "var(--arc-gold)"] : i < 5 && m <= 31 ? ["fresh +PO", "var(--arc-green)"] : null;
        return (
          <div key={`${i}-${p.PLAYER_NAME}`} className="arc-rot-row">
            <b className="role" style={{ color: i < 5 ? "#60a5fa" : "var(--arc-faint)" }}>{i < 5 ? "ST" : i === 5 ? "6TH" : `B${i - 4}`}</b>
            <span className="name">{p.PLAYER_NAME}</span>
            {note && <em style={{ color: note[1] }}>{note[0]}</em>}
            <button type="button" className="arc-step-btn" aria-label={`Fewer minutes for ${p.PLAYER_NAME}`}
              disabled={m <= Math.max(6, base - MINUTE_FLEX)} onClick={() => season.bumpMinute(i, -1)}>−</button>
            <b className="min arc-num" aria-live="polite">{m}</b>
            <button type="button" className="arc-step-btn" aria-label={`More minutes for ${p.PLAYER_NAME}`}
              disabled={m >= base + MINUTE_FLEX || season.minuteBank <= 0} onClick={() => season.bumpMinute(i, 1)}>+</button>
          </div>
        );
      })}
    </section>
  );
}

function LeagueProgress({ progress }) {
  const total = progress?.total || 29;
  const built = progress?.built || 0;
  return (
    <div role="status" className="arc-stack" style={{ gap: 8, width: "100%" }}>
      <div className="arc-cta" style={{ background: "#2a2210", color: "var(--arc-gold)" }}>Building the league · {built} / {total}</div>
      <span className="arc-progress"><i style={{ width: `${Math.round((built / total) * 100)}%` }} /></span>
    </div>
  );
}

export function SeasonSetupScreen({ season, roster, era, onBack, onPickHistory, onRun }) {
  const rh = season.rhActive;
  const sched = season.rhSchedule;
  return (
    <>
      <Head onBack={onBack} eyebrow={`STEP 4 OF 4 · ${era.label.toUpperCase()}`} title="Set up the season" />
      <main className="arc-main" style={{ gap: 12 }}>
        <div role="radiogroup" aria-label="Simulation" className="arc-tabs">
          <button type="button" role="radio" aria-checked={!rh} onClick={() => season.setSimMode("quick")}><Disc3 size={14} />QUICK SIM</button>
          <button type="button" role="radio" aria-checked={rh} className="is-rh" onClick={() => season.setSimMode("history")}><Dna size={14} />REWRITE HISTORY</button>
        </div>
        {rh && (sched && season.rhStep === "ready" ? (
          <button type="button" className="arc-standin" onClick={onPickHistory}>
            <span className="arc-stack" style={{ gap: 5 }}>
              <small className="arc-eyebrow">STANDING IN FOR</small>
              <strong style={{ font: "700 17px/1 var(--font-logo)", color: "var(--arc-gold)" }}>{sched.season} {sched.team} <span style={{ color: "var(--arc-faint)", fontWeight: 600 }}>({sched.wins}-{sched.losses})</span></strong>
            </span>
            <span style={{ font: "700 11px/1 var(--font-logo)", letterSpacing: ".1em", color: "var(--arc-text-2)" }}>CHANGE ›</span>
          </button>
        ) : (
          <button type="button" className="arc-standin" onClick={onPickHistory}>
            <span className="arc-small" style={{ color: "var(--arc-text-2)" }}>Step into a real {era.label} season: pick the year, then the team your draft replaces.</span>
            <span style={{ font: "700 11px/1 var(--font-logo)", letterSpacing: ".1em", color: "var(--arc-gold)", flex: "none" }}>PICK ›</span>
          </button>
        ))}
        <p className="arc-small" style={{ margin: "0 2px" }}>
          {rh ? "Their exact schedule, real opponents and all." : `An 82-game season in the ${era.label}. Win 50%+ for the playoffs, survive four rounds — then defend the title.`}
          {" "}Minutes drive production; 37+ brings fatigue, resting starters banks playoff freshness.
        </p>
        <RotationEditor season={season} roster={roster} />
      </main>
      <footer className="arc-foot">
        {season.leagueLoading ? <LeagueProgress progress={season.leagueProgress} />
          : <button type="button" className="arc-cta" disabled={rh && !sched} onClick={onRun}>
              {rh ? (sched ? `Simulate the ${sched.team}'s season` : "Pick a real season first") : "Simulate the season"}
            </button>}
      </footer>
    </>
  );
}

// ── 12 · Rewrite History seçimi ─────────────────────────────────────────────
export function HistoryPickScreen({ season, era, onBack, onDone }) {
  const teams = season.visibleRhTeams;
  return (
    <>
      <Head onBack={onBack} eyebrowColor="var(--arc-gold)" eyebrow={`REWRITE HISTORY · ${era.label.toUpperCase()}`} title="Pick a real season" />
      <main className="arc-main" style={{ gap: 14 }}>
        <p className="arc-small" style={{ margin: "0 2px" }}>Pick the year, then the team your draft replaces. You play their exact schedule, real opponents and all.</p>
        <section className="arc-stack" style={{ gap: 8 }}>
          <small className="arc-kicker">SEASON</small>
          {season.rhSeasons.length ? (
            <div role="radiogroup" aria-label="Season" className="arc-grid-3">
              {season.rhSeasons.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={season.rhSeason === s} className="arc-tile is-center"
                  disabled={season.rhLoading} onClick={() => season.pickRhSeason(s)}>{s}</button>
              ))}
            </div>
          ) : <p className="arc-small">No completed real seasons in this era yet.</p>}
        </section>
        {season.rhSeason && (
          <section className="arc-stack" style={{ gap: 8 }}>
            <small className="arc-kicker">TEAM YOUR DRAFT REPLACES · {season.rhSeason}</small>
            {season.rhLoading && !teams.length && <p role="status" className="arc-small">Loading…</p>}
            <div role="radiogroup" aria-label="Team" className="arc-grid-2" style={{ gap: 6 }}>
              {teams.map((t) => (
                <button key={t.abbr} type="button" role="radio" aria-checked={season.rhTeam === t.abbr} className="arc-tile"
                  disabled={season.rhLoading} onClick={() => season.pickRhTeam(t.abbr)}>
                  <strong style={{ font: "700 15px/1 var(--font-logo)" }}>{t.abbr}</strong><span className="arc-num">{t.wins}-{t.losses}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {season.rhError && <p role="alert" className="arc-warn">{season.rhError}</p>}
      </main>
      <footer className="arc-foot">
        <button type="button" className="arc-cta" disabled={season.rhStep !== "ready" || !season.rhSchedule || season.rhLoading} onClick={onDone}>
          {season.rhSchedule && season.rhStep === "ready" ? `Stand in for the ${season.rhSchedule.team}` : "Pick a team"}
        </button>
      </footer>
    </>
  );
}

// ── 13 · Sezon akışı + playoff'lar ──────────────────────────────────────────
const ROUND_LABEL = { R1: "First Round", SEMI: "Conference Semifinals", CF: "Conference Finals", F: "NBA Finals" };

function BracketList({ season }) {
  const b = season.bracket;
  const [auto, setAuto] = useState(false);
  const user = season.rhSchedule?.team;
  const step = () => season.updateBracket({ ...stepBracket(b) });
  useEffect(() => {
    if (!auto || b.champion) return undefined;
    const id = setTimeout(() => season.updateBracket({ ...stepBracket(b) }), 500);
    return () => clearTimeout(id);
  }, [auto, b, season]);
  const rounds = [...b.rounds].reverse();
  return (
    <div className="arc-stack">
      {b.champion ? (
        <div className={`arc-banner ${b.champion.abbr === user ? "champ" : "neutral"}`}>
          <Crown size={22} color={b.champion.abbr === user ? "#FFB11B" : "#9aa0a6"} />
          <p className="arc-h2" style={{ fontSize: 22, marginTop: 6 }}>{b.champion.abbr === user ? "NBA Champions" : `${b.champion.abbr} win the title`}</p>
        </div>
      ) : (
        <div className="arc-row">
          <button type="button" className="arc-ghost is-fill" onClick={step} disabled={auto}><Play size={15} />Play next game</button>
          <button type="button" className="arc-ghost" onClick={() => setAuto((a) => !a)} aria-pressed={auto}>{auto ? "Pause" : "Auto"}</button>
        </div>
      )}
      {rounds.map((round, ri) => (
        <section key={round[0]?.round || ri} className="arc-stack" style={{ gap: 6 }}>
          <small className="arc-kicker">{ROUND_LABEL[round[0]?.round] || "Round"}</small>
          {round.map((s, i) => {
            const mine = s.teamA.abbr === user || s.teamB.abbr === user;
            return (
              <div key={`${s.teamA.abbr}-${s.teamB.abbr}-${i}`} className={`arc-series${mine ? " is-user" : ""}`}>
                <span style={{ flex: "1 1 auto" }} className={s.winner?.abbr === s.teamA.abbr ? "w" : ""}>{s.teamA.seed ? `${s.teamA.seed} ` : ""}{s.teamA.abbr}</span>
                <b className="arc-num">{s.wA}–{s.wB}</b>
                <span style={{ flex: "1 1 auto", textAlign: "right" }} className={s.winner?.abbr === s.teamB.abbr ? "w" : ""}>{s.teamB.abbr}{s.teamB.seed ? ` ${s.teamB.seed}` : ""}</span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function SeasonScreen({ season, era, onBack, onLeaderboard }) {
  const [tab, setTab] = useState("regular");
  const r = season.result;
  const rh = season.rhActive;
  const done = season.stage === "done";
  const n = season.nGames;
  const sched = season.rhSchedule;
  const canPlayoffs = done && rh && season.league && season.league.teamsBuilt >= 20;
  const lastFive = r ? r.gameLog.slice(0, season.revealGames).map((won, i) => ({ won, i, g: r.gameSchedule?.[i] })).slice(-5).reverse() : [];
  const defendable = done && (rh ? season.rhTitleWon : r?.champion) && season.dynasty.titles < 3;
  const eyebrow = rh && sched ? `STANDING IN FOR ${sched.season} ${sched.team} · YEAR ${season.dynasty.year}` : `${era.label.toUpperCase()} · YEAR ${season.dynasty.year}`;
  const openPlayoffs = () => { if (!season.bracket) season.startBracket(); setTab("playoffs"); };

  return (
    <>
      <Head onBack={onBack} backLabel="Back to your lineup" eyebrowColor={rh ? "var(--arc-gold)" : "#34d399"} eyebrow={eyebrow} title="Season simulation"
        right={season.dynasty.titles > 0 && <span className="arc-chip is-gold" aria-label={`${season.dynasty.titles} titles`}>{Array.from({ length: Math.min(3, season.dynasty.titles) }, (_, i) => <Trophy key={i} size={12} />)}</span>} />
      <main className="arc-main" style={{ gap: 14 }}>
        {rh && (
          <div role="tablist" aria-label="Season stage" className="arc-tabs">
            <button type="button" role="tab" aria-checked={tab === "regular"} aria-selected={tab === "regular"} onClick={() => setTab("regular")}>REGULAR SEASON</button>
            <button type="button" role="tab" aria-checked={tab === "playoffs"} aria-selected={tab === "playoffs"} disabled={!canPlayoffs} onClick={openPlayoffs}>PLAYOFFS</button>
          </div>
        )}
        {season.leagueLoading && <LeagueProgress progress={season.leagueProgress} />}
        {season.leagueWarning && <p role="alert" className="arc-warn">{season.leagueWarning}</p>}

        {tab === "playoffs" && season.bracket ? <BracketList season={season} /> : r && (
          <>
            <section className="arc-card arc-stack" style={{ padding: 18, gap: 12 }}>
              <div className="arc-row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                <div className="arc-stack" style={{ gap: 6 }}>
                  <small className="arc-kicker">{season.revealGames < n ? `REGULAR SEASON · ${season.month}` : "FINAL RECORD"}</small>
                  <strong className="arc-record arc-num">{season.shownWins}–{season.shownLosses}</strong>
                </div>
                <span className="arc-small arc-num" style={{ fontFamily: "var(--font-logo)", fontWeight: 700, letterSpacing: ".08em" }}>GAME {season.revealGames} / {n}</span>
              </div>
              <span className="arc-progress"><i style={{ width: `${(season.revealGames / Math.max(1, n)) * 100}%` }} /></span>
              {rh && season.shownReal.length > 0 && <span className="arc-small">Real {sched?.team} at this point: <b className="arc-num" style={{ color: "var(--arc-text-2)" }}>{season.shownRealWins}–{season.shownRealLosses}</b></span>}
              {season.revealGames >= n && !r.madePlayoffs && <span className="arc-small arc-err">Missed the playoffs — needed {Math.ceil(n / 2)} wins.</span>}
            </section>

            {lastFive.length > 0 && (
              <section className="arc-stack" style={{ gap: 6 }}>
                <small className="arc-kicker">LAST FIVE</small>
                {lastFive.map(({ won, i, g }) => (
                  <div key={i} className="arc-game">
                    <b className={`arc-wl ${won ? "w" : "l"}`}>{won ? "W" : "L"}</b>
                    <span className="arc-small" style={{ flex: "1 1 auto" }}>Game {i + 1}{g ? ` · ${g.isHome ? "vs" : "@"} ${g.opponent}` : ""}</span>
                    {g && <span className="arc-small arc-num">real {g.realTeamPts}–{g.realOppPts}</span>}
                  </div>
                ))}
              </section>
            )}

            {!rh && r.madePlayoffs && season.revealRounds > 0 && (
              <section className="arc-stack" style={{ gap: 6 }}>
                <small className="arc-kicker">PLAYOFFS</small>
                {r.playoffRounds.slice(0, season.revealRounds).map((rd) => (
                  <div key={rd.label} className={`arc-round ${rd.won ? "won" : "lost"}`}>
                    <span className="arc-small" style={{ flex: "1 1 auto", color: "var(--arc-text-2)" }}>{rd.label}</span>
                    <span className="arc-small">vs {Math.round(rd.opp * 100)}-rated</span>
                    <b className={rd.won ? "arc-ok" : "arc-err"} style={{ font: "700 13px/1 var(--font-logo)" }}>{rd.won ? "W" : "L"} {rd.w}–{rd.l}</b>
                  </div>
                ))}
              </section>
            )}

            {done && (rh ? (
              <div className="arc-banner neutral">
                <p className="arc-h2" style={{ fontSize: 20 }}>Regular season complete</p>
                <p className="arc-small" style={{ margin: "6px 0 0" }}>{r.madePlayoffs || canPlayoffs ? "The real bracket decides your playoffs." : "Your season ends here."}</p>
              </div>
            ) : (
              <div className={`arc-banner ${r.champion ? "champ" : r.madePlayoffs ? "neutral" : "out"}`}>
                {r.champion && <Crown size={22} color="#FFB11B" />}
                <p className="arc-h2" style={{ fontSize: 20, marginTop: r.champion ? 6 : 0 }}>{r.champion ? "NBA Champions" : r.resultLabel || (r.madePlayoffs ? "Playoff run over" : "Missed the playoffs")}</p>
              </div>
            ))}
            {done && <p className="arc-small" style={{ margin: 0 }}>Win the title, then defend it. Three straight rings is a <b style={{ color: "var(--arc-gold)", fontWeight: 600 }}>THREEPEAT</b>.</p>}
          </>
        )}
      </main>
      <footer className="arc-foot" style={{ flexDirection: "column" }}>
        {!done && r ? <button type="button" className="arc-cta" onClick={season.skipReveal}>Skip to the end</button> : done && (
          <>
            {canPlayoffs && tab === "regular" && <button type="button" className="arc-cta" onClick={openPlayoffs}><Trophy size={16} />{season.bracket ? "Back to the playoffs" : "Simulate playoffs"}</button>}
            {defendable && <button type="button" className="arc-cta" disabled={season.leagueLoading} onClick={() => { setTab("regular"); season.defend(); }}>Defend the title · year {season.dynasty.year + 1}</button>}
            <div className="arc-row">
              <button type="button" className="arc-ghost is-fill" disabled={season.leagueLoading} onClick={() => { setTab("regular"); season.run(); }}>Run it back</button>
              <button type="button" className="arc-ghost is-fill" onClick={onLeaderboard}><Trophy size={15} />Top scores</button>
            </div>
          </>
        )}
      </footer>
    </>
  );
}

// ── Skor tablosu ────────────────────────────────────────────────────────────
const RESULT_MARK = { THREEPEAT: "THREEPEAT", REPEAT: "REPEAT", CHAMPION: "CHAMPION", FINALS: "FINALS", CF: "CONF FINALS", SEMI: "SEMIS", R1: "ROUND 1", MISSED: "MISSED" };

export function LeaderboardScreen({ initialMode, onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [data, setData] = useState({ mode: null, entries: null });
  useEffect(() => {
    let alive = true;
    fetch(apiUrl(`/api/leaderboard?limit=25&mode=${mode}`))
      .then((r) => r.json())
      .then((d) => { if (alive) setData({ mode, entries: d.entries || [] }); })
      .catch(() => { if (alive) setData({ mode, entries: [] }); });
    return () => { alive = false; };
  }, [mode]);
  const entries = data.mode === mode ? data.entries : null;
  return (
    <>
      <Head onBack={onBack} eyebrow="LINEUP BUILDER · SHARED WITH PRIMARYARCH.NET" title="Top scores" />
      <main className="arc-main" style={{ gap: 8 }}>
        <div role="radiogroup" aria-label="Mode" className="arc-tabs">
          {["classic", "salarycap"].map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m].toUpperCase()}</button>)}
        </div>
        {entries === null && <p role="status" className="arc-small">Loading…</p>}
        {entries?.length === 0 && <p className="arc-small">No scores in this mode yet. Be the first.</p>}
        {entries?.map((e, i) => (
          <div key={`${e.username}-${e.created_at}-${i}`} className="arc-lb-row">
            <b className="rank arc-num">{i + 1}</b>
            <span className="who">{e.username}<br /><small className="arc-small" style={{ fontSize: 11 }}>{e.season_result ? RESULT_MARK[e.season_result] || e.season_result : "No season"}{e.wins != null ? ` · ${e.wins}W` : ""}</small></span>
            <b className="pct arc-num" style={{ color: GRADE_HEX[e.grade] }}>{e.pct}</b>
          </div>
        ))}
      </main>
    </>
  );
}

// ── 14 · Misafir skor gönderir ──────────────────────────────────────────────
export function SignInSheet({ onSignIn, onClose }) {
  return (
    <Sheet label="Sign in to post your score" onClose={onClose}>
      <div className="arc-stack" style={{ gap: 8, paddingTop: 8 }}>
        <small className="arc-kicker">LEADERBOARD</small>
        <h2 className="arc-h2" style={{ fontSize: 23 }}>Sign in to post your score</h2>
        <p className="arc-body">You played this run as a guest. Leaderboard entries belong to a Primary Arch account — your result waits on this phone while you sign in, and posts when you are back.</p>
      </div>
      <button type="button" className="arc-cta" onClick={onSignIn}>Sign in with Primary Arch</button>
      <button type="button" className="arc-ghost is-fill" onClick={onClose}>Not now</button>
    </Sheet>
  );
}

