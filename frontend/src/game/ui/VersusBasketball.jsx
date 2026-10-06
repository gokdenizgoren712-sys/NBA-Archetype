import { useEffect, useState } from "react";
import { ERAS, ERA_PILLAR_WEIGHTS } from "../eras";
import { useDrawFlow } from "./useDrawFlow";
import { ReelOverlay } from "./DraftScreen";
import {
  POSITIONS, BENCH_SLOTS, ALL_SLOTS, getPrimaryPos, getEligiblePos, posPenaltyFor, posGroupOf,
} from "../positions";
import { START_BUDGET, totalSpent, maxSpendNow, priceOf } from "../salary";
import { computeLineupFit, computePlayerFit } from "../lineupScore";
import { ARCHETYPE_COLOR as ARCH_HEX } from "../../constants/archetypeColors";
import {
  VersusFrame, VersusHead, SeatColumn, VersusBody, SpinningCenter, PoolTable, CounterStrip, PlacePanel,
  TitleBlock, StatusPill, VersusCourt, TeamList, LockedLayout, VersusHire, VersusMatchup, VersusSeries, VersusFinal,
} from "./VersusUi";

// Basketbol bağdaştırıcısı: Same Screen / With a Friend'in oyun durumunu VersusUi'nin sunum bileşenlerine çevirir.
// Oyun mantığı sayfada kalır; burada yalnız biçim (sütunlar, sıralama, renkler) var.

const POS_VAR = { PG: "var(--sb-pos-pg)", SG: "var(--sb-pos-sg)", SF: "var(--sb-pos-sf)", PF: "var(--sb-pos-pf)", C: "var(--sb-pos-c)" };
const last = (n) => (n || "").split(" ").slice(-1)[0];
const pct100 = (v) => Math.round((v || 0) * 100);
const archHex = (a) => ARCH_HEX[a] || "#8a8a94";
const valColor = (v) => (v >= 0.75 ? "var(--sb-good)" : v >= 0.55 ? "var(--sb-warn)" : v >= 0.4 ? "var(--sb-warn-2)" : "var(--sb-bad)");
const GRADE_COLOR = { S: "var(--sb-special)", A: "var(--sb-good)", B: "var(--sb-opp)", C: "var(--sb-warn)", D: "var(--sb-bad)" };
const gradeFor = (p) => (p >= 85 ? "S" : p >= 78 ? "A" : p >= 70 ? "B" : p >= 62 ? "C" : "D");

export function capFor(lineup) {
  const filled = Object.values(lineup).filter(Boolean);
  const budgetLeft = START_BUDGET - totalSpent(filled);
  return { budgetLeft, cap: maxSpendNow(budgetLeft, ALL_SLOTS.length - filled.length) };
}

const JOKER_ICON = { reTeam: "↻", reYear: "▦", reBoth: "ϟ", double: "×2", discover: "⌕" };
const JOKER_LABEL = { reTeam: "Team", reYear: "Year", reBoth: "Both", double: "Pick 2", discover: "Discover" };

const COLUMNS = [
  { key: "CAP", label: "CAP" }, { key: "PTS", label: "PTS" }, { key: "REB", label: "REB" }, { key: "AST", label: "AST" },
  { key: "FG3_PCT", label: "3P%" }, { key: "STL", label: "STL" }, { key: "BLK", label: "BLK" },
];
const SORTS = COLUMNS.filter((c) => c.key !== "CAP");
const stat = (p, k) => {
  const v = p[k];
  if (v == null || isNaN(+v)) return "—";
  return k === "FG3_PCT" ? `${Math.round(+v * 100)}%` : (+v).toFixed(1);
};

function seatRows(lineup, { canRearrange, moveSrc, onSlotTap }) {
  return ALL_SLOTS.map((pos) => {
    const p = lineup[pos];
    return {
      key: pos, slot: pos, slotColor: POS_VAR[pos] || "var(--sb-muted)", name: p?.PLAYER_NAME, arch: p?.primary_arch, archColor: archHex(p?.primary_arch),
      tap: !!(canRearrange && (p || moveSrc)), sel: moveSrc === pos, onClick: () => onSlotTap?.(pos),
    };
  });
}

// ── Draft ekranı (7b / 7c) ─────────────────────────────────────────────────
export function BasketballVersusDraft({
  title = "Same Screen", names, eraLabel, wheelMode = "round", round, totalRounds = 9, phase, activeSeat, waitingSeat,
  season, team, statusMsg, lineups, moveSrc, canRearrange, onSlotTap, jokers, canAct = true, onUseJoker,
  players, posFilter, setPosFilter, sortKey, setSortKey, discoverActive, doubleActive, bannedName, banVoided, banPicking,
  pickedPlayer, onPick, onPlace, onCancel, counter, onConfirmBan, sport = "basketball",
  poolVisible = true, waitText, children,
  seasons = [], teamPool = [], targetSIdx = 0, targetTIdx = 0,
}) {
  const spinning = phase === "spinning";
  // Single player ile aynı çark: iki şerit kayar, sonuç gelince LOCKED damgası, sonra örtü kapanır.
  const [spinSeq, setSpinSeq] = useState(0);
  useEffect(() => { if (spinning) setSpinSeq((n) => n + 1); }, [spinning]);
  const flow = useDrawFlow({
    spinSeq, spinKind: "both", seasons, teamPool, targetSIdx, targetTIdx,
    chosenSeason: season, chosenTeam: team, ready: !spinning && !!team && players.length > 0,
  });
  const reels = seasons.length > 0;
  const drafting = phase === "drafting";
  const j = jokers[activeSeat] || {};
  const seatProps = (seat) => ({
    seat, name: names[seat], total: 9, active: activeSeat === seat,
    count: ALL_SLOTS.filter((p) => lineups[seat][p]).length, sub: `${capFor(lineups[seat]).budgetLeft}% cap left`,
    rows: seatRows(lineups[seat], { canRearrange: typeof canRearrange === "object" ? !!canRearrange[seat] : canRearrange, moveSrc: moveSrc[seat], onSlotTap: (pos) => onSlotTap(seat, pos) }),
  });
  const jokerViews = Object.keys(JOKER_LABEL).map((k) => {
    const active = (k === "double" && doubleActive) || (k === "discover" && discoverActive);
    const used = !active && !j[k];
    return {
      key: k, icon: JOKER_ICON[k], label: JOKER_LABEL[k], state: active ? "pressed" : used ? "used" : "ready",
      enabled: canAct && drafting && !!j[k] && !active, onClick: () => onUseJoker(k),
    };
  });

  const { cap } = capFor(lineups[activeSeat]);
  const filtered = posFilter ? players.filter((p) => posGroupOf(p) === posFilter) : players;
  const list = filtered.slice().sort((a, b) => (parseFloat(b[sortKey] || 0) || 0) - (parseFloat(a[sortKey] || 0) || 0));
  const rows = list.map((p, i) => {
    const cost = priceOf(p);
    const banned = bannedName === p.PLAYER_NAME && !banVoided;
    const noData = p.overall_score == null || +p.overall_score <= 0;
    const ovr = p.overall_score != null ? Math.round(p.overall_score * 100) : "—";
    return {
      id: `${p.PLAYER_NAME}-${i}`, pos: getPrimaryPos(p), name: p.PLAYER_NAME, arch: p.primary_arch || "—", archColor: archHex(p.primary_arch),
      disabled: banPicking ? false : banned || noData || cost > cap,
      onClick: () => (banPicking ? onConfirmBan(p) : onPick(p)),
      cells: [{ v: discoverActive && !banPicking ? `${cost}% · ${ovr}` : `${cost}%`, cls: "cap" },
        ...COLUMNS.slice(1).map((c) => ({ v: stat(p, c.key) }))],
    };
  });

  let mid;
  if (spinning) {
    mid = reels ? <div className="sb-vs-spinwait" role="status" aria-label="Spinning"><span>{statusMsg || "Spinning…"}</span></div> : <SpinningCenter text="Spinning" sub={statusMsg || (wheelMode === "pick" ? `Fresh spin for ${names[activeSeat]}'s pick. Jokers lock until it lands.` : `Shared spin for round ${round}. Jokers lock until it lands.`)} />;
  } else if (!poolVisible) {
    mid = (
      <>
        <SpinningCenter text="Waiting" sub={waitText || `${names[activeSeat]} is picking…`} />
        {counter?.show && <CounterStrip who={names[activeSeat]} onSkip={counter.onDismiss}
          items={[
            { key: "ban", label: "BAN a player", enabled: counter.jokers.ban, onClick: () => counter.onUse("ban") },
            { key: "team", label: "Force Team", enabled: counter.jokers.forceTeam, onClick: () => counter.onUse("forceTeam") },
            { key: "year", label: "Force Year", enabled: counter.jokers.forceYear, onClick: () => counter.onUse("forceYear") },
          ]} />}
      </>
    );
  } else if (phase === "placing" && pickedPlayer) {
    const eligible = getEligiblePos(pickedPlayer);
    mid = (
      <PlacePanel name={pickedPlayer.PLAYER_NAME} arch={pickedPlayer.primary_arch || "—"} archColor={archHex(pickedPlayer.primary_arch)}
        sub={`natural ${eligible[0]} · ${names[activeSeat]}`} hint="Pick a slot (off-position costs rating)" onCancel={onCancel}
        slots={POSITIONS.filter((p) => !lineups[activeSeat][p]).map((pos) => {
          const pen = posPenaltyFor(pickedPlayer, pos);
          const nat = eligible[0] === pos;
          return { key: pos, label: pos, nat, off: !eligible.includes(pos), note: pen >= 1 ? (nat ? "natural" : "") : pen >= 0.9 ? "−10%" : "−25%", tone: pen >= 1 ? "good" : pen >= 0.9 ? "warn" : "bad", onClick: () => onPlace(pos) };
        })}
        bench={BENCH_SLOTS.filter((b) => !lineups[activeSeat][b]).map((b) => ({ key: b, label: b, onClick: () => onPlace(b) }))} />
    );
  } else {
    const showBan = bannedName && !banVoided;
    const counterStrip = counter?.show && (
      <CounterStrip who={names[activeSeat]} onSkip={counter.onDismiss}
        items={[
          { key: "ban", label: "BAN a player", enabled: counter.jokers.ban, onClick: () => counter.onUse("ban") },
          { key: "team", label: "Force Team", enabled: counter.jokers.forceTeam, onClick: () => counter.onUse("forceTeam") },
          { key: "year", label: "Force Year", enabled: counter.jokers.forceYear, onClick: () => counter.onUse("forceYear") },
        ]} />
    );
    mid = (
      <PoolTable title={`${team} roster`} note={banPicking ? `${season} · ${names[waitingSeat]}: pick a player to ban` : `${season} · ratings hidden`}
        sortChips={banPicking ? null : SORTS} sortKey={sortKey} onSort={setSortKey}
        filters={banPicking ? null : [{ key: "G", label: "G" }, { key: "F", label: "F" }, { key: "C", label: "C" }]} filterKey={posFilter} onFilter={setPosFilter}
        columns={COLUMNS} rows={rows} empty="No players in this group."
        banNote={showBan ? `${bannedName} is banned this pick. Using any joker lifts the ban.` : null} counter={counterStrip} />
    );
  }

  return (
    <VersusFrame sport={sport}>
      <VersusHead title={title} meta={`${wheelMode === "pick" ? "Pick-based spin" : "Snake draft"} · best-of-7 · round ${round} of ${totalRounds}`}
        chip={eraLabel}
        turn={{ seat: activeSeat, who: `${names[activeSeat]}'s pick`, season: season, team, seasonLabel: "SEASON", teamLabel: "TEAM", spinning }}
        jokers={jokerViews} />
      {children}
      <VersusBody left={<SeatColumn {...seatProps(1)} />} right={<SeatColumn {...seatProps(2)} />}
        overlay={reels ? <ReelOverlay flow={flow} entity="TEAM" /> : null}>{mid}</VersusBody>
    </VersusFrame>
  );
}

// ── Kilitli kadrolar (7d) ──────────────────────────────────────────────────
const LINES = (
  <>
    <rect x="10" y="10" width="920" height="480" /><line x1="470" y1="10" x2="470" y2="490" /><circle cx="470" cy="250" r="60" />
    <rect x="10" y="170" width="180" height="160" /><path d="M 190 190 A 60 60 0 0 1 190 310" />
    <line x1="10" y1="30" x2="140" y2="30" /><line x1="10" y1="470" x2="140" y2="470" /><path d="M 140 30 A 234 234 0 0 1 140 470" />
    <rect x="750" y="170" width="180" height="160" /><path d="M 750 190 A 60 60 0 0 0 750 310" />
    <line x1="800" y1="30" x2="930" y2="30" /><line x1="800" y1="470" x2="930" y2="470" /><path d="M 800 30 A 234 234 0 0 0 800 470" />
  </>
);
const SPOT_L = { C: { x: 10, y: 36 }, PF: { x: 20, y: 66 }, SF: { x: 31, y: 16 }, SG: { x: 31, y: 84 }, PG: { x: 41, y: 50 } };
const teamScore = (lineup, era) => {
  const fit = computeLineupFit(POSITIONS.map((p) => lineup[p]).filter(Boolean), era);
  return { fit, pct: fit ? pct100(fit.lineupScore) : 0 };
};

export function BasketballVersusLocked({
  title = "Same Screen", names, lineups, simEra, moveSrc, canRearrange, onSlotTap, canContinue = true, onContinue, continueLabel = "Continue to coaches",
  waitNote, sport = "basketball",
}) {
  const scores = { 1: teamScore(lineups[1], simEra), 2: teamScore(lineups[2], simEra) };
  const tapOf = (seat, slot) => !!(canRearrange?.[seat] && (lineups[seat][slot] || moveSrc[seat]));
  const spots = [1, 2].flatMap((seat) => POSITIONS.map((pos) => {
    const base = SPOT_L[pos];
    return { key: `${seat}-${pos}`, seat, x: seat === 1 ? base.x : 100 - base.x, y: base.y, label: pos, name: lineups[seat][pos]?.PLAYER_NAME,
      tap: tapOf(seat, pos), sel: moveSrc[seat] === pos, onClick: () => onSlotTap(seat, pos) };
  }));
  const bench = [1, 2].map((seat) => ({
    seat, name: names[seat],
    cells: BENCH_SLOTS.map((b) => ({ key: b, slot: b, name: lineups[seat][b]?.PLAYER_NAME, tap: tapOf(seat, b), sel: moveSrc[seat] === b, onClick: () => onSlotTap(seat, b) })),
  }));
  const teamRows = (seat) => {
    const fit = scores[seat].fit;
    const lu = lineups[seat];
    return ALL_SLOTS.map((pos, idx) => {
      const p = lu[pos]; if (!p) return { key: pos, ps: pos.startsWith("B") ? "BN" : pos, name: "Open", q: "", qColor: "" };
      const pp = !pos.startsWith("B") ? fit?.perPlayer?.[POSITIONS.indexOf(pos)] : null;
      const q = pp ? pct100(pp.quality) : Math.round((parseFloat(p.overall_score) || 0) * 100);
      return { key: pos, ps: pos.startsWith("B") ? "BN" : pos, name: p.PLAYER_NAME, sub: p.primary_arch, q, qColor: valColor(q / 100),
        tap: tapOf(seat, pos), sel: moveSrc[seat] === pos, onClick: () => onSlotTap(seat, pos) };
    });
  };
  return (
    <VersusFrame sport={sport}>
      <TitleBlock eyebrow={`${title} · DRAFT COMPLETE`} title="Rosters" accent="locked"
        lede="Review both teams before hiring your coaches. Tap a slot on the court to rearrange one last time."
        right={<StatusPill>Status: Review</StatusPill>} />
      <LockedLayout
        court={<VersusCourt lines={LINES} spots={spots} names={names} scores={{ 1: scores[1].pct, 2: scores[2].pct }} bench={bench} />}
        teams={[1, 2].map((s) => <TeamList key={s} seat={s} name={names[s]} score={scores[s].pct} rows={teamRows(s)} />)}>
        {waitNote ? <p className="sb-lede">{waitNote}</p>
          : <button type="button" className="sb-btn solid cta" disabled={!canContinue} onClick={onContinue}>{continueLabel} →</button>}
      </LockedLayout>
    </VersusFrame>
  );
}

// ── Koç sırası (7i) ────────────────────────────────────────────────────────
const gradeColor = (g) => (g?.[0] === "A" ? "var(--sb-good)" : g?.[0] === "B" ? "var(--sb-warn)" : g?.[0] === "C" ? "var(--sb-warn-2)" : "var(--sb-bad)");
const titleCase = (s) => (s || "").toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
const coachCard = (o) => ({ key: o.name, name: o.name, sub: `${titleCase(o.tag || "Balanced")} · ${o.years}`, grades: [["Attack", o.off, gradeColor(o.off)], ["Defence", o.def, gradeColor(o.def)]], raw: o });

export function BasketballVersusHire({ title = "Same Screen", names, active, options, hired, statuses, onHire, sport = "basketball", note, canAct = true, waitTexts }) {
  const seats = [1, 2].map((seat) => {
    const opts = options[seat]?.length ? options[seat].map(coachCard) : hired[seat] ? [coachCard(hired[seat])] : [];
    return {
      seat, name: names[seat], status: statuses?.[seat] || (hired[seat] ? "HIRED" : active === seat ? "PICKING…" : ""),
      waiting: !hired[seat] && active !== seat && !opts.length, waitText: waitTexts?.[seat],
      options: opts, hired: hired[seat]?.name,
    };
  });
  return (
    <VersusFrame sport={sport}>
      <TitleBlock eyebrow={`${title} · COACH HIRING`} title="Hire your" accent="coach"
        lede={note || "Attack and defence grades shift the team score all game. Player 1 hires first, then Player 2. A hire cannot be taken back."} />
      <VersusHire seats={seats} active={active} onHire={onHire} ctaLabel="Hire & see matchup" canAct={canAct} />
    </VersusFrame>
  );
}

// ── Eşleşme (7e) ───────────────────────────────────────────────────────────
const PILLARS = [["creation", "Creation"], ["spacing", "Spacing"], ["rim_protection", "Rim Protection"], ["perimeter_d", "Perimeter D"], ["finishing", "Finishing"]];
const weightTag = (w) => (w >= 1.2 ? "KEY" : w >= 0.95 ? "CORE" : "MINOR");

export function BasketballVersusMatchup({ title = "Same Screen", names, lineups, coaches, simEra, onPlay, nextGame = 1, wins = { 1: 0, 2: 0 }, playLabel, disabled, sport = "basketball" }) {
  const era = simEra || ERAS[5];
  const W = ERA_PILLAR_WEIGHTS[era.id];
  const fits = { 1: computeLineupFit(POSITIONS.map((p) => lineups[1][p]).filter(Boolean), era), 2: computeLineupFit(POSITIONS.map((p) => lineups[2][p]).filter(Boolean), era) };
  if (!fits[1] || !fits[2]) return null;
  const heroes = [1, 2].map((seat) => {
    const score = pct100(fits[seat].lineupScore);
    return { seat, name: names[seat], grade: gradeFor(score), gradeColor: GRADE_COLOR[gradeFor(score)], score, coach: coaches[seat] ? `Coach ${coaches[seat].name}` : "" };
  });
  const parts = [["Quality", "avgQuality", "45%"], ["Coverage", "coverage", "40%"], ["Chemistry", "roleFit", "15%"]].map(([label, k, weight]) => ({
    label, weight: `weight ${weight}`, a: pct100(fits[1][k]), b: pct100(fits[2][k]), ac: valColor(fits[1][k]), bc: valColor(fits[2][k]),
  }));
  const pillars = PILLARS.map(([k, label]) => ({ label, tag: weightTag(W[k]), a: pct100(fits[1][k]), b: pct100(fits[2][k]), ac: valColor(fits[1][k]), bc: valColor(fits[2][k]) }));
  const wg = [1, 2].map((seat) => {
    const scored = PILLARS.map(([k, l]) => ({ l, val: fits[seat][k], w: W[k] }));
    const weapon = [...scored].sort((x, y) => y.w * y.val - x.w * x.val)[0];
    const gap = [...scored].sort((x, y) => y.w * (1 - y.val) - x.w * (1 - x.val))[0];
    return { seat, name: names[seat], weapon: `${weapon.l} (${pct100(weapon.val)})`, gap: `${gap.l} (${pct100(gap.val)})${gap.w >= 1.2 ? ", a KEY pillar, it will cost games" : ""}` };
  });
  return (
    <VersusFrame sport={sport}>
      <VersusMatchup eyebrow={`SERIES MATCHUP · GAME ${nextGame}`} title="Draft" accent="analysis" chip={era.label}
        heroes={heroes} parts={parts} pillarsTitle={`Five pillars · weighted for the ${era.label}`} pillars={pillars} wg={wg}
        seriesLabel="BEST-OF-7 SERIES" score={`${wins[1]} - ${wins[2]}`}
        btn={{ label: playLabel || `▶ Simulate game ${nextGame}`, onClick: onPlay, disabled }} />
    </VersusFrame>
  );
}

// ── Seri (7f / 7g) ─────────────────────────────────────────────────────────
export function BasketballVersusSeries({ names, games, seriesW, seriesOver, selected, onSelect, onNext, onSeeResult, canPlay = true, waitNote, sport = "basketball" }) {
  const newest = games[0];
  const shown = games.find((g) => g.gameIndex === selected) || newest;
  const leader = seriesW[1] === seriesW[2] ? 0 : seriesW[1] > seriesW[2] ? 1 : 2;
  const lead = seriesOver ? `${names[leader]} wins the series ${Math.max(seriesW[1], seriesW[2])}–${Math.min(seriesW[1], seriesW[2])}`
    : leader === 0 ? "Series tied" : `${names[leader]} leads`;
  const chips = Array.from({ length: 7 }, (_, i) => {
    const g = games.find((x) => x.gameIndex === i);
    return { key: i, label: `G${i + 1}`, played: !!g, cur: !seriesOver && i === games.length, score: g ? `${g.teamPts[1]}-${g.teamPts[2]}` : "" };
  });
  const box = (seat) => {
    const lines = [...shown.box[seat]].sort((a, b) => (a.bench === b.bench ? 0 : a.bench ? 1 : -1));
    return {
      seat, name: names[seat], pts: shown.teamPts[seat], win: shown.winner === seat, head: ["MIN", "PTS", "REB", "AST", "STL", "BLK"],
      rows: lines.map((l, i) => ({ key: i, name: last(l.name), bench: l.bench, hl: 1, cells: [l.min, l.pts, l.reb, l.ast, l.stl, l.blk] })),
    };
  };
  return (
    <VersusFrame sport={sport}>
      <VersusSeries eyebrow={seriesOver ? "SERIES OVER" : `BEST-OF-7 · GAME ${games.length + 1}`} scoreA={seriesW[1]} scoreB={seriesW[2]}
        lead={lead} leadSeat={leader} chips={chips} selected={shown.gameIndex} onSelect={onSelect}
        btn={seriesOver ? { label: "See result", onClick: onSeeResult }
          : canPlay ? { label: `▶ Simulate game ${games.length + 1}`, onClick: onNext } : { label: waitNote || "Waiting…", onClick: () => {} }}
        boxTitle={`Game ${shown.gameIndex + 1} · Box score`} home={`Home: ${names[shown.home]}`}
        boxes={[box(1), box(2)]} cols={6} />
    </VersusFrame>
  );
}

// ── Sonuç (7h) ─────────────────────────────────────────────────────────────
export function BasketballVersusFinal({ title = "Same Screen", names, lineups, coaches, seriesW, seriesGames, onAgain, againLabel, sport = "basketball", extra }) {
  const winner = seriesW[1] === seriesW[2] ? 0 : seriesW[1] > seriesW[2] ? 1 : 2;
  const hi = Math.max(seriesW[1], seriesW[2]); const lo = Math.min(seriesW[1], seriesW[2]);
  const cards = [1, 2].map((seat) => ({
    seat, name: names[seat], score: seriesW[seat], win: winner === seat, coach: coaches[seat] ? `Coach ${coaches[seat].name}` : "",
    names: [...POSITIONS.map((p) => [p, true]), ...BENCH_SLOTS.map((p) => [p, false])].filter(([p]) => lineups[seat][p]).map(([p, st]) => ({ n: last(lineups[seat][p].PLAYER_NAME), st })),
  }));
  const share = async () => {
    const text = `${winner ? names[winner] : "Tie"} ${hi}–${lo} in Same Screen on Primary Arch`;
    try { if (navigator.share) await navigator.share({ text, url: location.href }); else await navigator.clipboard.writeText(`${text} ${location.href}`); } catch { /* iptal */ }
  };
  return (
    <VersusFrame sport={sport}>
      <VersusFinal eyebrow={`${title} · FINAL`} big={winner ? "Champions" : "Tie"} winner={winner ? names[winner] : "Series level"} winnerSeat={winner}
        summary={<><b>{winner ? `wins the series ${hi}–${lo}` : `${hi}–${lo}`}</b> · {seriesGames.length} game{seriesGames.length === 1 ? "" : "s"} played</>}
        cards={cards} onAgain={onAgain} againLabel={againLabel} onShare={share} extra={extra} />
    </VersusFrame>
  );
}

