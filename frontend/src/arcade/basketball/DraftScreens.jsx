// Lineup Builder'ın draft ekranları (tuval 3–9): giriş, dönem, çark, oyuncu
// seçimi, pozisyon paneli, kadro, koç. Kurallar ortak motorda (game/lineupDraft.js);
// burası yalnız telefona göre çizer.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Dices, Disc3, RefreshCw, Search, Trophy, Users, Zap } from "lucide-react";
import { ERAS, ERA_HEX, ERA_META_BLURB } from "../../game/eras";
import { POSITIONS, BENCH_SLOTS, getPrimaryPos, getSecondaryPos, posPenaltyFor, posGroupOf } from "../../game/positions";
import { priceOf } from "../../game/salary";
import { getPlayerTags } from "../../game/awards";
import { Avatar, Head, CloseButton, Sheet } from "../ui";
import { MODE_LABEL, lastName, initials } from "../format";

const SORTS = [["PTS", "PTS"], ["REB", "REB"], ["AST", "AST"], ["FG3_PCT", "3P%"], ["TAGGED", "TAGS"]];
const eraYears = (era) => `${era.years[0]}–${Math.min(era.years[1], 2026)}`;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// ── 3 · Giriş ───────────────────────────────────────────────────────────────
export function HomeScreen({ draft, onClose, onLeaderboard }) {
  const ready = draft.seasons.length > 0;
  return (
    <>
      <Head brand right={<CloseButton onClose={onClose} />} />
      <main className="arc-main">
        <div className="arc-stack" style={{ gap: 8 }}>
          <small className="arc-kicker">BASKETBALL · NBA 1983 → TODAY</small>
          <h1 className="arc-h1" style={{ fontSize: 38 }}>Lineup Builder</h1>
          <p className="arc-body">Draft nine players across any era — five starters, four bench — hire a coach and simulate a full season.</p>
        </div>

        <div className="arc-stack">
          <small className="arc-kicker">DRAFT MODE</small>
          <div role="radiogroup" aria-label="Draft mode" className="arc-grid-2" style={{ gap: 10 }}>
            <button type="button" role="radio" aria-checked={draft.mode === "classic"} className="arc-option"
              style={{ flexDirection: "column", "--arc-opt": "rgba(96,165,250,.7)", "--arc-opt-bg": "rgba(96,165,250,.08)" }}
              onClick={() => draft.setMode("classic")}>
              <span style={{ width: 34, height: 34, borderRadius: 11, background: "rgba(96,165,250,.14)", color: "#60a5fa", display: "grid", placeItems: "center" }}><Disc3 size={18} /></span>
              <strong className="arc-option-title">Classic</strong>
              <span className="arc-small">Pure luck. The wheels pick the team, you pick the player.</span>
            </button>
            <button type="button" role="radio" aria-checked={draft.mode === "salarycap"} className="arc-option"
              style={{ flexDirection: "column" }}
              onClick={() => draft.setMode("salarycap")}>
              <span style={{ width: 34, height: 34, borderRadius: 11, background: "rgba(255,177,27,.1)", color: "#FFB11B", display: "grid", placeItems: "center", font: "700 15px/1 var(--font-logo)" }}>$</span>
              <strong className="arc-option-title">Salary Cap</strong>
              <span className="arc-small">Every player has a price. Nine picks on a 100% cap.</span>
            </button>
          </div>
        </div>

        <div className="arc-stack">
          <small className="arc-kicker">HOW IT WORKS</small>
          <div className="arc-steps">
            {[["Pick Era", "Distance & style fit"], ["Spin & Draft 9", "5 starters + 4 bench"], ["Hire Coach", "Offense & Defense grades"], ["Simulate 82", "Playoffs & awards"]].map(([t, s], i) => (
              <div key={t} className="arc-step"><b>{i + 1}</b><span><strong>{t}</strong><small>{s}</small></span></div>
            ))}
          </div>
        </div>

        <div className="arc-soon">
          <Users size={18} color="#9aa0a6" style={{ flex: "none" }} />
          <span className="arc-small" style={{ flex: "1 1 auto" }}>With a Friend and Online Opponent come later.</span>
          <em className="arc-badge">SOON</em>
        </div>
      </main>
      <footer className="arc-foot">
        <button type="button" className="arc-ghost" onClick={onLeaderboard}><Trophy size={16} />Top scores</button>
        <button type="button" className="arc-cta" disabled={!ready} onClick={draft.beginEraPick}>{ready ? "Start draft" : "Loading…"}</button>
      </footer>
    </>
  );
}

// ── 4 · Dönem ───────────────────────────────────────────────────────────────
export function EraScreen({ draft, onBack }) {
  const [picked, setPicked] = useState(null);
  return (
    <>
      <Head onBack={onBack} eyebrow={`STEP 1 OF 4 · ${MODE_LABEL[draft.mode].toUpperCase()}`} title="Pick an era" />
      <main className="arc-main" style={{ gap: 12 }}>
        <p className="arc-body">Your whole run is simulated inside one era. A player&apos;s power scales with how far his real prime sits from it.</p>
        <div role="radiogroup" aria-label="Era" className="arc-stack" style={{ gap: 8 }}>
          {ERAS.map((era) => (
            <button key={era.id} type="button" role="radio" aria-checked={picked?.id === era.id} className="arc-option"
              style={{ "--arc-opt": ERA_HEX[era.id], "--arc-opt-bg": "#111513", padding: "13px 14px" }}
              onClick={() => setPicked(era)}>
              <span className="arc-era-dot" style={{ background: ERA_HEX[era.id] }} />
              <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="arc-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ font: "700 16px/1 var(--font-logo)" }}>{era.label}</strong>
                  <small className="arc-era-years">{eraYears(era)}</small>
                </span>
                <span className="arc-small" style={{ fontSize: 11.5 }}>{ERA_META_BLURB[era.id]}</span>
              </span>
            </button>
          ))}
        </div>
      </main>
      <footer className="arc-foot">
        <button type="button" className="arc-ghost" onClick={draft.randomEra}><Dices size={16} />Random</button>
        <button type="button" className="arc-cta" disabled={!picked} onClick={() => draft.chooseEra(picked)}>Spin the wheels</button>
      </footer>
    </>
  );
}

// ── 5 · Çark ────────────────────────────────────────────────────────────────
function Wheel({ label, items, target, spinning, team = false }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!spinning || !items.length) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 70);
    return () => clearInterval(id);
  }, [spinning, items.length]);
  const n = items.length;
  const center = n ? (spinning ? (target + tick) % n : target) : 0;
  const at = (d) => (n ? items[(center + d + n * 4) % n] : "—");
  return (
    <section aria-label={`${label} wheel`} className="arc-stack">
      <small className="arc-kicker">{label}</small>
      <div className={`arc-wheel${team ? " is-team" : ""}${spinning ? " is-spinning" : ""}`}>
        <span className="far">{n ? at(-2) : ""}</span>
        <span>{n ? at(-1) : ""}</span>
        <span className="hit">{n ? at(0) : "—"}</span>
        <span>{n ? at(1) : ""}</span>
        <i className="top" /><i className="bot" />
      </div>
    </section>
  );
}

export function SpinScreen({ draft, onLeave }) {
  const { seasons, teamPool, phase, spinSeasons, spinTeams, targetSIdx, targetTIdx, chosenSeason, chosenTeam, statusMsg, filledSlots, simEra, mode } = draft;
  const seasonLanded = !spinSeasons && chosenSeason && phase !== "spin_season";
  const teamLanded = !spinTeams && chosenTeam && phase === "fetching";
  const status = statusMsg
    || (phase === "spin_season" ? "Picking season…" : phase === "spin_team" ? "Picking team…" : "Loading the roster…");
  return (
    <>
      <Head onBack={onLeave} backLabel="Leave the draft"
        eyebrow={`${simEra?.label?.toUpperCase() || ""} · ${MODE_LABEL[mode].toUpperCase()}`}
        title={`Pick ${Math.min(9, filledSlots.length + 1)} of 9`}
        right={<span className="arc-chip">{filledSlots.length}/9</span>} />
      <main className="arc-main" style={{ padding: "26px 20px 20px", gap: 22 }}>
        <Wheel label="SEASON" items={seasons} target={targetSIdx} spinning={spinSeasons} />
        <Wheel label="TEAM" items={phase === "spin_season" ? [] : teamPool} target={targetTIdx} spinning={spinTeams} team />
        <p role="status" className="arc-body" style={{ textAlign: "center" }}>
          {seasonLanded && teamLanded
            ? <>Wheel lands on <b style={{ color: "var(--arc-text)", fontWeight: 600 }}>{chosenSeason} {chosenTeam}</b> — loading the roster…</>
            : status}
        </p>
      </main>
    </>
  );
}

// ── 6 · Oyuncu seçimi (+ 7 pozisyon paneli) ─────────────────────────────────
const JOKERS = [
  ["reTeam", "TEAM", RefreshCw, "jokerReTeam", "Re-spin the team (keeps the season)"],
  ["reYear", "YEAR", CalendarDays, "jokerReYear", "Re-spin the season (keeps the team)"],
  ["reBoth", "BOTH", Zap, "jokerReBoth", "Re-spin season and team"],
  ["double", "PICK 2", Users, "jokerDouble", "Take two players from this roster"],
  ["discover", "DISCOVER", Search, "jokerDiscover", "Reveal overall ratings for this pick"],
];

function PlayerCard({ p, salary, spendCap, discover, onPick }) {
  const tags = getPlayerTags(p).slice(0, 3);
  const price = salary ? priceOf(p) : null;
  const over = salary && price > spendCap;
  const sec = getSecondaryPos(p);
  return (
    <button type="button" className="arc-player" disabled={over} onClick={() => onPick(p)}
      aria-label={`Draft ${p.PLAYER_NAME}${over ? ", over your cap" : ""}`}>
      <Avatar player={p} />
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="arc-row" style={{ gap: 7 }}>
          <strong className="arc-player-name">{p.PLAYER_NAME}</strong>
          <small style={{ flex: "none", font: "700 10px/1 var(--font-logo)", letterSpacing: ".06em", color: "var(--arc-faint)" }}>{getPrimaryPos(p)}{sec ? `/${sec}` : ""}</small>
        </span>
        <span className="arc-row" style={{ gap: 6, flexWrap: "wrap" }}>
          {p.primary_arch && <em className="arc-arch">{p.primary_arch}</em>}
          <small className="arc-line">{num(p.PTS).toFixed(1)} PTS · {num(p.REB).toFixed(1)} REB · {num(p.AST).toFixed(1)} AST</small>
          {tags.map((t) => <span key={t.key} className="arc-tag" title={t.detail} style={{ color: t.color, background: `${t.color}22`, border: `1px solid ${t.color}55` }}>{t.abbr}</span>)}
        </span>
      </span>
      <span className="arc-ovr">
        {salary ? <><small>COST</small><b className="arc-price">{price}%</b></>
          : <><small>OVR</small><b className={discover ? "is-open" : ""}>{discover ? Math.round(num(p.overall_score) * 100) : "??"}</b></>}
      </span>
    </button>
  );
}

export function PositionSheet({ draft }) {
  const p = draft.pickedPlayer;
  const primary = getPrimaryPos(p);
  const slotLabel = (pos) => {
    if (pos === primary) return ["★ PRIMARY", "is-primary"];
    const pen = posPenaltyFor(p, pos);
    if (pen >= 1) return ["VERSATILE", ""];
    return [pen >= 0.9 ? "−10%" : "−25%", "is-penalty"];
  };
  return (
    <Sheet label={`Place ${p.PLAYER_NAME}`} onClose={draft.cancelPick}>
      <div className="arc-row" style={{ gap: 12 }}>
        <Avatar player={p} size={48} />
        <div className="arc-stack" style={{ gap: 6 }}>
          <small className="arc-kicker">PLACE {p.PLAYER_NAME.toUpperCase()}{p.primary_arch ? ` · ${p.primary_arch.toUpperCase()}` : ""}</small>
          <h2 className="arc-h2">Which position?</h2>
        </div>
      </div>
      <p className="arc-small" style={{ margin: 0 }}><b style={{ color: "var(--arc-gold)", fontWeight: 600 }}>★ Primary</b> earns the chemistry bonus. His secondary spot costs 10%, anywhere else 25%.</p>
      <div className="arc-stack" style={{ gap: 8 }}>
        <small className="arc-kicker">STARTERS</small>
        <div className="arc-grid-5">
          {POSITIONS.map((pos) => {
            const taken = draft.lineup[pos];
            if (taken) return <button key={pos} type="button" className="arc-slot" disabled><strong>{pos}</strong><small>{lastName(taken.PLAYER_NAME)}</small></button>;
            const [label, cls] = slotLabel(pos);
            return <button key={pos} type="button" className={`arc-slot ${cls}`} onClick={() => draft.pickPos(pos)} aria-label={`Place at ${pos}, ${label}`}><strong>{pos}</strong><small>{label}</small></button>;
          })}
        </div>
      </div>
      <div className="arc-stack" style={{ gap: 8 }}>
        <small className="arc-kicker">BENCH · NO POSITION PENALTY, FEWER MINUTES</small>
        <div className="arc-grid-4">
          {BENCH_SLOTS.map((b) => {
            const taken = draft.lineup[b];
            return taken
              ? <button key={b} type="button" className="arc-slot is-bench" disabled><strong>{b}</strong><small>{lastName(taken.PLAYER_NAME)}</small></button>
              : <button key={b} type="button" className="arc-slot is-bench" onClick={() => draft.pickPos(b)}><strong>{b}</strong></button>;
          })}
        </div>
      </div>
      <button type="button" className="arc-ghost is-fill" onClick={draft.cancelPick}>Pick someone else</button>
    </Sheet>
  );
}

export function DraftScreen({ draft, onLeave, onRoster }) {
  const [sortKey, setSortKey] = useState("PTS");
  const salary = draft.mode === "salarycap";
  const list = useMemo(() => {
    const base = draft.posFilter ? draft.players.filter((p) => posGroupOf(p) === draft.posFilter) : draft.players;
    return [...base].sort((a, b) => {
      if (sortKey === "TAGGED") {
        const d = getPlayerTags(b).length - getPlayerTags(a).length;
        return d || num(b.PTS) - num(a.PTS);
      }
      return num(b[sortKey]) - num(a[sortKey]);
    });
  }, [draft.players, draft.posFilter, sortKey]);
  const nextSort = () => setSortKey((k) => SORTS[(SORTS.findIndex(([key]) => key === k) + 1) % SORTS.length][0]);
  const filled = draft.filledSlots.length;
  const capHex = draft.budgetLeft <= 15 ? "#f87171" : draft.budgetLeft <= 35 ? "#FFB11B" : "#4ade80";
  const title = draft.doubleActive ? "Pick 2 — take two" : "Draft one player";

  return (
    <>
      <Head onBack={onLeave} backLabel="Leave the draft" eyebrowColor="#60a5fa"
        eyebrow={`${draft.chosenSeason} · ${draft.chosenTeam}`} title={title}
        right={<span className="arc-chip">{filled}/9</span>} />

      <div role="toolbar" aria-label="Jokers" className="arc-jokers">
        {JOKERS.map(([key, label, Icon, action, hint]) => {
          const on = (key === "double" && draft.doubleActive) || (key === "discover" && draft.discoverActive);
          return (
            <button key={key} type="button" title={hint} aria-label={`${label} joker — ${hint}`}
              className={`arc-joker${on ? " is-on" : ""}`}
              disabled={!on && !draft.jokerAvailable[key]}
              onClick={() => !on && draft[action]()}>
              <Icon size={16} /><span>{label}</span>
            </button>
          );
        })}
      </div>

      {salary && (
        <div className="arc-cap" aria-label={`Cap left ${draft.budgetLeft}%, this pick up to ${draft.spendCap}%`}>
          <small className="arc-kicker" style={{ flex: "none" }}>CAP</small>
          <span className="arc-cap-track"><i style={{ width: `${Math.max(0, Math.min(100, draft.budgetLeft))}%`, background: capHex }} /></span>
          <small className="arc-small arc-num" style={{ flex: "none" }}>{draft.budgetLeft}% left · max {Math.max(0, draft.spendCap)}%</small>
        </div>
      )}
      {draft.statusMsg && <p role="status" className="arc-status">{draft.statusMsg}</p>}
      {draft.discoverActive && <p role="status" className="arc-status">Discover — overall ratings are showing for this pick.</p>}

      <div className="arc-filters">
        <div role="group" aria-label="Position filter" className="arc-seg">
          {[["", "ALL"], ["G", "G"], ["F", "F"], ["C", "C"]].map(([k, l]) => (
            <button key={l} type="button" aria-pressed={draft.posFilter === k} onClick={() => draft.setPosFilter(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="arc-sort" onClick={nextSort} aria-label={`Sort by ${sortKey}, tap to change`}>
          SORT · {SORTS.find(([k]) => k === sortKey)[1]}<ChevronDown size={12} />
        </button>
      </div>

      <main className="arc-main arc-players" style={{ paddingTop: 4 }}>
        {list.map((p) => (
          <PlayerCard key={p.PLAYER_NAME} p={p} salary={salary} spendCap={draft.spendCap}
            discover={draft.discoverActive} onPick={draft.pickPlayer} />
        ))}
        {!list.length && <p className="arc-body" style={{ textAlign: "center", padding: 20 }}>No {draft.posFilter} players on this roster.</p>}
      </main>

      <button type="button" className="arc-rosterbar" onClick={onRoster} aria-label={`Your roster, ${filled} of 9. Open`}>
        <span className="arc-pips" aria-hidden="true">
          {[...POSITIONS, ...BENCH_SLOTS].map((s, i) => <i key={s} className={`${draft.lineup[s] ? "on" : ""}${i === 5 ? " gap" : ""}`} />)}
        </span>
        <span className="arc-small" style={{ flex: "1 1 auto" }}>Your roster · {filled} of 9</span>
        <span style={{ font: "700 12px/1 var(--font-logo)", letterSpacing: ".08em", color: "var(--arc-text-2)" }}>VIEW ›</span>
      </button>

      {draft.phase === "pick_pos" && draft.pickedPlayer && <PositionSheet draft={draft} />}
    </>
  );
}

// ── 8 · Kadro ───────────────────────────────────────────────────────────────
const SPOTS = { PG: [50, 40], SG: [80, 112], SF: [20, 112], PF: [72, 232], C: [34, 250] };

export function RosterSheet({ draft, onClose }) {
  const { lineup, moveSrc, canRearrange, primaryCount, slotTap } = draft;
  const tap = (slot) => { if (canRearrange) slotTap(slot); };
  const spotLabel = (slot) => {
    const pl = lineup[slot];
    if (!pl) return "Open";
    return `${slot}${pl._isPrimary ? " ★" : ""} ${lastName(pl.PLAYER_NAME)}`;
  };
  return (
    <Sheet label="Your roster" onClose={onClose}>
      <div className="arc-row" style={{ justifyContent: "space-between" }}>
        <div className="arc-stack" style={{ gap: 6 }}>
          <small className="arc-kicker">{draft.filledSlots.length} OF 9</small>
          <h2 className="arc-h2">Your roster</h2>
        </div>
        <button type="button" className="arc-ghost" style={{ minHeight: 44 }} onClick={onClose}>Done</button>
      </div>
      <div className="arc-court">
        <svg className="lines" viewBox="0 0 358 356" preserveAspectRatio="none" aria-hidden="true">
          <path d="M119 356V206h120v150" stroke="rgba(255,255,255,.1)" strokeWidth="1.5" fill="none" />
          <path d="M129 206a50 50 0 0 1 100 0" stroke="rgba(255,255,255,.1)" strokeWidth="1.5" fill="none" />
          <path d="M28 356V296a151 151 0 0 1 302 0v60" stroke="rgba(255,255,255,.1)" strokeWidth="1.5" fill="none" />
          <circle cx="179" cy="330" r="8" stroke="rgba(255,177,27,.35)" strokeWidth="1.5" fill="none" />
          <path d="M129 1a50 50 0 0 0 100 0" stroke="rgba(255,255,255,.08)" strokeWidth="1.5" fill="none" />
        </svg>
        {POSITIONS.map((slot) => {
          const pl = lineup[slot];
          const [x, y] = SPOTS[slot];
          return (
            <button key={slot} type="button" onClick={() => tap(slot)} disabled={!canRearrange && !pl}
              className={`arc-spot${pl ? " is-filled" : ""}${pl?._isPrimary ? " is-primary" : ""}${moveSrc === slot ? " is-moving" : ""}`}
              style={{ left: `${x}%`, top: y }} aria-label={`${slot}: ${pl ? pl.PLAYER_NAME : "open"}`}>
              <span>{pl ? initials(pl.PLAYER_NAME) : slot}</span>
              <small>{spotLabel(slot)}</small>
            </button>
          );
        })}
      </div>
      <div className="arc-stack" style={{ gap: 8 }}>
        <small className="arc-kicker">BENCH</small>
        <div className="arc-grid-4">
          {BENCH_SLOTS.map((b) => {
            const pl = lineup[b];
            return (
              <button key={b} type="button" className={`arc-slot is-bench${moveSrc === b ? " is-primary" : ""}`} onClick={() => tap(b)}
                aria-label={`${b}: ${pl ? pl.PLAYER_NAME : "open"}`}>
                <strong>{b}</strong><small>{pl ? lastName(pl.PLAYER_NAME) : "Open"}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="arc-card arc-row" style={{ gap: 10 }}>
        <b style={{ font: "700 16px/1 var(--font-logo)", color: "var(--arc-gold)" }}>★ ×{primaryCount}</b>
        <span className="arc-small">
          {moveSrc ? `Moving ${lastName(lineup[moveSrc]?.PLAYER_NAME)} — tap where he goes.`
            : canRearrange ? "Primary spots earn chemistry. Tap two players to swap them." : "Primary spots earn chemistry."}
        </span>
      </div>
    </Sheet>
  );
}

// ── 9 · Koç ─────────────────────────────────────────────────────────────────
export function CoachScreen({ draft, onLeave, onRoster }) {
  const [picked, setPicked] = useState(null);
  return (
    <>
      <Head onBack={onLeave} backLabel="Leave the draft" eyebrow="STEP 3 OF 4 · ROSTER COMPLETE" title="Hire a coach"
        right={<span className="arc-chip is-gold">9/9</span>} />
      <main className="arc-main" style={{ gap: 10 }}>
        <p className="arc-body">Four candidates. Offense and Defense grades shift your team all season; championship rings add playoff DNA.</p>
        <div role="radiogroup" aria-label="Coach" className="arc-stack" style={{ gap: 8 }}>
          {draft.coachOptions.map((c) => (
            <button key={c.name} type="button" role="radio" aria-checked={picked?.name === c.name} className="arc-option"
              style={{ alignItems: "center" }} onClick={() => setPicked(c)}>
              <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="arc-row" style={{ gap: 8, alignItems: "baseline" }}>
                  <strong style={{ font: "700 18px/1 var(--font-logo)" }}>{c.name}</strong>
                  <small className="arc-era-years">{c.years}</small>
                </span>
                <span className="arc-row" style={{ gap: 10 }}>
                  <span className="arc-row arc-small" style={{ gap: 5 }}><Trophy size={14} />{c.champs === 1 ? "1 ring" : `${c.champs} rings`}</span>
                  {c.tag && <em className="arc-badge">{c.tag}</em>}
                </span>
              </span>
              <span className="arc-row" style={{ gap: 6, flex: "none" }}>
                <span className="arc-grade"><small>OFF</small><b>{c.off}</b></span>
                <span className="arc-grade"><small>DEF</small><b>{c.def}</b></span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="arc-link" onClick={onRoster}>View roster ›</button>
      </main>
      <footer className="arc-foot">
        <button type="button" className="arc-cta" disabled={!picked} onClick={() => draft.pickCoach(picked)}>Hire &amp; see your grade</button>
      </footer>
    </>
  );
}

