import { FORMATIONS, SHAPE_KEYS } from "../football/formations";
import { posPenaltyFor, isPrimarySlot } from "../football/positions";
import { LEAGUE_LABEL } from "../football/leagues";
import { PHASE_COLOR } from "../football/theme";
import * as D from "../football/draft";
import {
  VersusFrame, VersusHead, SeatColumn, VersusBody, SpinningCenter, PoolTable, PlacePanel, CounterStrip,
  TitleBlock, StatusPill, VersusCourt, TeamList, LockedLayout, VersusHire, VersusMatchup, VersusSeries, VersusFinal, seatClass,
} from "./VersusUi";

// Futbol bağdaştırıcısı: Same Screen'in draft durumunu (football/draft.js) ve sonraki adımları
// (menajer, eşleşme, iki ayak, final) VersusUi bileşenlerine çevirir. Oyun mantığı sayfada/draft.js'te.

const last = (n) => (n || "").split(" ").slice(-1)[0];
const q100 = (p) => Math.round((p?.overall_score || 0) * 100);
const pct = (v) => Math.round((v || 0) * 100);
const valColor = (v) => (v >= 0.8 ? "var(--sb-good)" : v >= 0.7 ? "var(--sb-warn)" : "var(--sb-bad)");
const costText = (pen) => (pen === 0 ? "natural" : `−${Math.round(pen * 100)}`);
const costTone = (pen) => (pen === 0 ? "good" : pen <= 0.11 ? "warn" : "bad");
const nz = (v) => { const x = parseFloat(v); return Number.isNaN(x) ? null : x; };
const fmt = (p, k, count) => {
  const v = nz(p?.[k]);
  if (v == null) return "—";
  return count ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 2);
};
const COLUMNS = [
  { key: "MINUTES_TOTAL", label: "MIN" }, { key: "goals_90", label: "G/90" }, { key: "assists_90", label: "A/90" },
  { key: "CLEAN_SHEETS", label: "CS" }, { key: "APPS", label: "APP" }, { key: "OVR", label: "OVR" },
];
const COUNT_KEYS = new Set(["CLEAN_SHEETS", "APPS", "MINUTES_TOTAL"]);
const JOKER_ICON = { reTeam: "↻", reYear: "▦", reBoth: "ϟ", double: "×2", discover: "⌕" };
const JOKER_LABEL = { reTeam: "Club", reYear: "Year", reBoth: "Both", double: "Pick 2", discover: "Discover" };
const slotLabel = (sl, i) => (sl.bench ? `S${String(sl.id).replace("SUB", "")}` : sl.pos);

// ── Giriş (8a) ─────────────────────────────────────────────────────────────
function MiniPitch({ shape }) {
  const f = FORMATIONS[shape];
  return (
    <svg viewBox="0 0 100 70" className="sb-vs-mini" aria-hidden="true">
      <path d="M1 1H99V69H1Z M50 1V69 M1 17H15V53H1 M99 17H85V53H99" />
      {(f?.slots || []).map((s) => <circle key={s.id} cx={100 - s.y} cy={s.x * 0.7} r="2.6" />)}
    </svg>
  );
}

export function FootballVersusEntry({ names, setNames, shapes, setShapes, wheelMode, setWheelMode, ready, onStart, msg }) {
  return (
    <VersusFrame sport="football">
      <TitleBlock eyebrow="Same Screen · SETUP" title="Pick your" accent="shapes"
        lede="Each player picks a formation before the first spin. You take turns off the same spun squad in snake order, eighteen picks each (eleven starters, seven subs), then hire a manager and play a two-leg tie."
        right={
          <div className="sb-rules" role="radiogroup" aria-label="Wheel rule">
            {[{ key: "round", label: "Round", hint: "1 spin / round" }, { key: "pick", label: "Pick", hint: "1 spin / pick" }].map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={wheelMode === r.key} className="sb-rule" onClick={() => setWheelMode(r.key)}>
                <b>{r.label}</b><i>{r.hint}</i>
              </button>
            ))}
          </div>} />
      <div className="sb-vs-hire">
        {[1, 2].map((s) => (
          <section key={s} className={`sb-vs-hirecol ${seatClass(s)}`}>
            <div className="h"><span className="dot" />
              <input className="sb-vs-name" value={names[s]} maxLength={18} aria-label={`Player ${s} name`}
                onChange={(e) => setNames({ ...names, [s]: e.target.value })} />
            </div>
            <div className="sb-vs-shapes" role="radiogroup" aria-label={`Player ${s} formation`}>
              {SHAPE_KEYS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={shapes[s] === k} onClick={() => setShapes({ ...shapes, [s]: k })}>{k}</button>
              ))}
            </div>
            <MiniPitch shape={shapes[s]} />
          </section>
        ))}
      </div>
      <div className="sb-vs-cta">
        <button type="button" className="sb-btn solid cta" disabled={!ready} onClick={onStart}>{ready ? "Start draft" : "Loading clubs…"} →</button>
      </div>
      {msg && <p className="sb-lede" style={{ color: "var(--sb-bad)", textAlign: "center" }}>{msg}</p>}
    </VersusFrame>
  );
}

// ── Draft (8b / 8c) ────────────────────────────────────────────────────────
export function FootballVersusDraft({
  d, names, spinning, pickingFor, msg, canPick, onChoose, onPlace, onCancel, round,
  jokers, onUseJoker, doubleActive, discoverActive, bannedId, banVoided, banPicking, onConfirmBan, counter,
}) {
  const seat = D.activeSeat(d);
  const waiting = D.waitingSeat(d);
  const pool = d.pool;
  const seatProps = (s) => ({
    seat: s, name: names[s], active: seat === s, count: D.filled(d, s), total: D.slotsOf(d, s).length,
    sub: `${d.shapes[s]} · 11 + 7 subs`,
    rows: D.slotsOf(d, s).map((sl) => {
      const p = d.squads[s][sl.id];
      return { key: sl.id, slot: slotLabel(sl), slotColor: sl.bench ? "var(--sb-muted)" : PHASE_COLOR[sl.phase] || "var(--sb-muted)", name: p?.PLAYER_NAME, arch: p?.primary_arch, archColor: PHASE_COLOR[p?.PHASE] || "#8a8a94" };
    }),
  });

  const usable = !!pool && !spinning && !pickingFor && d.phase === "drafting";
  const jokerViews = Object.keys(JOKER_LABEL).map((k) => {
    const active = (k === "double" && doubleActive) || (k === "discover" && discoverActive);
    const used = !active && !jokers[k];
    return {
      key: k, icon: JOKER_ICON[k], label: JOKER_LABEL[k], state: active ? "pressed" : used ? "used" : "ready",
      enabled: usable && !!jokers[k] && !active, onClick: () => onUseJoker(k),
    };
  });

  let mid;
  if (spinning || !pool) {
    mid = <SpinningCenter text="Spinning" sub={d.wheelMode === "pick" ? `Fresh spin for ${names[seat]}'s pick. Jokers lock until it lands.` : `Shared spin for round ${d.round}. Jokers lock until it lands.`} />;
  } else if (pickingFor) {
    const open = D.openSlotsFor(d, seat, pickingFor);
    const pitch = open.filter((sl) => !sl.bench), subs = open.filter((sl) => sl.bench);
    mid = (
      <PlacePanel name={pickingFor.PLAYER_NAME} arch={pickingFor.primary_arch || "—"} archColor={PHASE_COLOR[pickingFor.PHASE]}
        sub={`natural ${pickingFor.POSITION} · ${names[seat]}`} hint="Pick a slot (off-position costs rating)" onCancel={onCancel}
        slots={pitch.map((sl) => {
          const pen = posPenaltyFor(pickingFor, sl);
          return { key: sl.id, label: sl.pos, nat: isPrimarySlot(pickingFor, sl), off: pen > 0, note: costText(pen), tone: costTone(pen), onClick: () => onPlace(pickingFor, sl.id) };
        })}
        bench={subs.map((sl) => ({ key: sl.id, label: slotLabel(sl), onClick: () => onPlace(pickingFor, sl.id) }))} />
    );
  } else {
    const rows = pool.players.map((p) => {
      const banned = bannedId === p.PLAYER_ID && !banVoided;
      return {
        id: String(p.PLAYER_ID), pos: p.POSITION, name: p.PLAYER_NAME, arch: p.primary_arch || "—", archColor: PHASE_COLOR[p.PHASE] || "#8a8a94",
        disabled: banPicking ? false : banned || !canPick(p), onClick: () => (banPicking ? onConfirmBan(p) : onChoose(p)),
        cells: COLUMNS.map((c) => (c.key === "OVR" ? { v: discoverActive ? q100(p) : "??" } : { v: fmt(p, c.key, COUNT_KEYS.has(c.key)) })),
      };
    });
    const banned = bannedId && !banVoided && pool.players.find((p) => p.PLAYER_ID === bannedId);
    const strip = counter && (
      <CounterStrip who={names[seat]} onSkip={counter.onDismiss}
        items={[
          { key: "ban", label: "BAN a player", enabled: counter.jokers.ban, onClick: () => counter.onUse("ban") },
          { key: "club", label: "Force Club", enabled: counter.jokers.forceTeam, onClick: () => counter.onUse("forceTeam") },
          { key: "year", label: "Force Year", enabled: counter.jokers.forceYear, onClick: () => counter.onUse("forceYear") },
        ]} />
    );
    mid = <PoolTable title={`${pool.team} squad`} note={banPicking ? `${pool.season} · ${names[waiting]}: pick a player to ban` : `${pool.season} · ratings hidden`}
      columns={COLUMNS} rows={rows} empty="Nobody left here for this side."
      banNote={banned ? `${banned.PLAYER_NAME} is banned this pick. Using any joker lifts the ban.` : msg || null} counter={strip} />;
  }

  return (
    <VersusFrame sport="football">
      <VersusHead title="Same Screen" meta={`Snake draft · two legs · round ${round}`}
        chip={`${d.shapes[1] === d.shapes[2] ? d.shapes[1] : `${d.shapes[1]} v ${d.shapes[2]}`} · all leagues`}
        turn={{ seat, who: `${names[seat]}'s pick`, season: pool?.season, team: pool?.team, seasonLabel: "SEASON", teamLabel: pool ? (LEAGUE_LABEL[pool.league] || pool.league).toUpperCase() : "CLUB", spinning }}
        jokers={jokerViews} />
      <VersusBody left={<SeatColumn {...seatProps(1)} />} right={<SeatColumn {...seatProps(2)} />}>{mid}</VersusBody>
    </VersusFrame>
  );
}

// ── Kilitli XI'lar (8d) ────────────────────────────────────────────────────
const PITCH = (
  <>
    <rect x="10" y="10" width="920" height="480" /><line x1="470" y1="10" x2="470" y2="490" /><circle cx="470" cy="250" r="60" />
    <rect x="10" y="130" width="140" height="240" /><rect x="10" y="190" width="50" height="120" />
    <rect x="790" y="130" width="140" height="240" /><rect x="880" y="190" width="50" height="120" />
  </>
);

export function FootballVersusLocked({ d, names, scores, moveSrc, onSlotTap, msg, onPlay }) {
  const tapOf = (s, id) => !!(d.squads[s][id] || moveSrc[s]);
  const spots = [1, 2].flatMap((s) => D.pitchOf(d, s).map((sl) => {
    const x = (100 - sl.y) * 0.44 + 3;
    return { key: `${s}-${sl.id}`, seat: s, x: s === 1 ? x : 100 - x, y: s === 1 ? sl.x : 100 - sl.x, label: sl.pos, name: d.squads[s][sl.id]?.PLAYER_NAME,
      tap: tapOf(s, sl.id), sel: moveSrc[s] === sl.id, onClick: () => onSlotTap(s, sl.id) };
  }));
  const bench = [1, 2].map((s) => ({
    seat: s, name: names[s],
    cells: D.slotsOf(d, s).filter((sl) => sl.bench).map((sl) => ({ key: sl.id, slot: slotLabel(sl), name: d.squads[s][sl.id]?.PLAYER_NAME, tap: tapOf(s, sl.id), sel: moveSrc[s] === sl.id, onClick: () => onSlotTap(s, sl.id) })),
  }));
  const rows = (s) => D.slotsOf(d, s).map((sl) => {
    const p = d.squads[s][sl.id];
    return { key: sl.id, ps: sl.bench ? "SUB" : sl.pos, name: p?.PLAYER_NAME || "Open", sub: p ? p.primary_arch : "", q: p ? q100(p) : "", qColor: valColor(p?.overall_score || 0),
      tap: tapOf(s, sl.id), sel: moveSrc[s] === sl.id, onClick: () => onSlotTap(s, sl.id) };
  });
  return (
    <VersusFrame sport="football">
      <TitleBlock eyebrow="Same Screen · DRAFT COMPLETE" title="XIs" accent="locked"
        lede="Review both XIs before hiring your managers. Tap a slot on the pitch or the bench to rearrange one last time."
        right={<StatusPill>Status: Review</StatusPill>} />
      <LockedLayout
        court={<VersusCourt lines={PITCH} spots={spots} names={names} scores={scores} bench={bench} />}
        teams={[1, 2].map((s) => <TeamList key={s} seat={s} name={names[s]} score={scores[s]} rows={rows(s)} />)}>
        {msg && <p className="sb-lede" style={{ color: "var(--sb-bad)", alignSelf: "center", marginRight: 16 }}>{msg}</p>}
        <button type="button" className="sb-btn solid cta" onClick={onPlay}>Continue to managers →</button>
      </LockedLayout>
    </VersusFrame>
  );
}

// ── Menajer sırası (8i) ────────────────────────────────────────────────────
const gradeColor = (g) => (g?.[0] === "A" ? "var(--sb-good)" : g?.[0] === "B" ? "var(--sb-warn)" : g?.[0] === "C" ? "var(--sb-warn-2)" : "var(--sb-bad)");
const titleCase = (s) => (s || "").toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());

export function FootballVersusHire({ names, shapes, active, options, hired, onHire }) {
  const card = (o, shape) => ({
    key: o.name, name: o.name, raw: o,
    sub: `${o.tag ? `${titleCase(o.tag)} · ` : ""}prefers ${o.shape}${o.shape === shape ? " ✓" : ""}`,
    grades: [["Attack", o.att, gradeColor(o.att)], ["Defence", o.def, gradeColor(o.def)]],
  });
  const seats = [1, 2].map((seat) => ({
    seat, name: names[seat], status: hired[seat] ? "HIRED" : active === seat ? "PICKING…" : "",
    waiting: !hired[seat] && active !== seat && !options[seat]?.length,
    options: (options[seat] || []).map((o) => card(o, shapes[seat])), hired: hired[seat]?.name,
  }));
  return (
    <VersusFrame sport="football">
      <TitleBlock eyebrow="Same Screen · MANAGER HIRING" title="Hire your" accent="manager"
        lede="A manager who prefers your formation gives a bigger bonus; attack and defence grades shift the team score. Player 1 hires first, then Player 2. A hire cannot be taken back." />
      <VersusHire seats={seats} active={active} onHire={onHire} ctaLabel="Hire & see matchup" />
    </VersusFrame>
  );
}

// ── Eşleşme (8e) ───────────────────────────────────────────────────────────
const gradeFor = (p) => (p >= 85 ? "S" : p >= 78 ? "A" : p >= 70 ? "B" : p >= 62 ? "C" : "D");
const GRADE_COLOR = { S: "var(--sb-special)", A: "var(--sb-good)", B: "var(--sb-opp)", C: "var(--sb-warn)", D: "var(--sb-bad)" };

export function FootballVersusMatchup({ names, squads, managers, numbers, pillars, coverage, onPlay, loading }) {
  const heroes = [1, 2].map((seat) => {
    const score = pct(numbers[seat].quality);
    return { seat, name: names[seat], grade: gradeFor(score), gradeColor: GRADE_COLOR[gradeFor(score)], score,
      coach: managers[seat] ? `Manager ${managers[seat].name} · ${squads[seat].shape}` : squads[seat].shape };
  });
  const part = (label, weight, fn, tone) => ({ label, weight, a: fn(numbers[1]), b: fn(numbers[2]), ac: tone(numbers[1]), bc: tone(numbers[2]) });
  const parts = [
    part("Quality", "mean rating of the XI", (n) => pct(n.mean), (n) => valColor(n.mean)),
    part("Position fit", "natural slots", (n) => pct(n.positionFit), (n) => valColor(n.positionFit)),
    part("Manager", "shape match + grades", (n) => `+${(n.bonus * 100).toFixed(1)}`, (n) => (n.matched ? "var(--sb-good)" : "var(--sb-muted)")),
  ];
  const pl = pillars.map((p) => ({ label: p.key, tag: "", a: pct(p.a), b: pct(p.b), ac: valColor(p.a), bc: valColor(p.b) }));
  const wg = coverage[1] && coverage[2] ? [1, 2].map((seat) => ({ seat, name: names[seat], weapon: coverage[seat].strongest, gap: coverage[seat].weakest })) : [];
  return (
    <VersusFrame sport="football">
      <VersusMatchup eyebrow="MATCHUP · LEG 1" title="Draft" accent="analysis" chip={`${squads[1].shape}${squads[1].shape === squads[2].shape ? "" : ` v ${squads[2].shape}`} · all leagues`}
        heroes={heroes} parts={parts} pillarsTitle="Role coverage · where the two XIs differ most" pillars={pl} wg={wg}
        seriesLabel="AGGREGATE" score="0 - 0" btn={{ label: loading ? "Loading…" : "▶ Play leg 1", onClick: onPlay, disabled: loading }} />
    </VersusFrame>
  );
}

// ── İki ayak (8f / 8g) + penaltı takipçisi ─────────────────────────────────
function TieReport({ tie, odds, names }) {
  const aPct = odds ? Math.round(odds.aWinPct * 100) : null;
  return (
    <div className="sb-vs-boxes" style={{ flex: "none" }}>
      <section className="sb-panel sb-vs-box s1" style={{ gap: 10 }}>
        <div className="h"><b>{tie.shootout ? "Penalties" : tie.extraTime ? "Extra time" : "Decided on aggregate"}</b></div>
        {tie.extraTime && <p className="sb-lede">Extra time {tie.extraTime.ag}–{tie.extraTime.hg} (at {tie.extraTime.host}).</p>}
        {tie.shootout && (
          <div className="sb-vs-pens">
            <span className="sb-mono sb-eyebrow">{tie.shootout.kicks.some((k) => k.sudden) ? "Sudden death after five kicks" : "Five kicks each"}</span>
            {[["a", names[1], "var(--seat-1)"], ["b", names[2], "var(--seat-2)"]].map(([k, nm, c]) => (
              <div key={k} className="row"><span style={{ color: c }}>{nm}</span>
                {tie.shootout.kicks.map((kick, i) => <i key={i} className={kick[k] ? "in" : ""} style={{ "--c": c }} title={kick[k] ? "Scored" : "Missed"} />)}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="sb-panel sb-vs-box s2" style={{ gap: 10 }}>
        <div className="h"><b>If replayed {odds?.runs ?? 400} times</b></div>
        {odds && <>
          <div className="sb-vs-odds"><span style={{ width: `${aPct}%`, background: "var(--seat-1)" }} /><span style={{ width: `${100 - aPct}%`, background: "var(--seat-2)" }} /></div>
          <div className="sb-vs-oddsl"><b style={{ color: "var(--seat-1)" }}>{names[1]} · {aPct}%</b><b style={{ color: "var(--seat-2)" }}>{names[2]} · {100 - aPct}%</b></div>
          <p className="sb-lede">{Math.round(odds.penaltiesPct * 100)}% of replays reach penalties. Squad fit decides the odds, not the result. This tie is one draw from that spread, not a verdict.</p>
        </>}
      </section>
    </div>
  );
}

export function FootballVersusLegs({ tie, odds, names, shown, stats, selected, onSelect, onNext, onSeeResult }) {
  const over = shown >= 2;
  const l1 = tie.legs[0], l2 = tie.legs[1];
  const aggA = shown >= 2 ? tie.aggA : l1.hg, aggB = shown >= 2 ? tie.aggB : l1.ag;
  const win = tie.winner === "a" ? 1 : 2;
  const leader = aggA === aggB ? 0 : aggA > aggB ? 1 : 2;
  const how = tie.decidedBy === "penalties" ? `${names[win]} win ${Math.max(tie.shootout.a, tie.shootout.b)}–${Math.min(tie.shootout.a, tie.shootout.b)} on penalties`
    : tie.decidedBy === "extra time" ? `${names[win]} go through after extra time` : `${names[win]} go through on aggregate`;
  const chips = [
    { key: 1, label: "LEG 1", score: `${l1.hg}-${l1.ag}`, played: true, cur: shown === 1 },
    { key: 2, label: "LEG 2", score: over ? `${l2.ag}-${l2.hg}` : "", played: over, cur: shown === 1 },
    { key: "et", label: "ET", score: over && tie.extraTime ? `${tie.extraTime.ag}-${tie.extraTime.hg}` : "", played: false },
    { key: "pens", label: "PENS", score: over && tie.shootout ? `${tie.shootout.a}-${tie.shootout.b}` : "", played: false },
  ];
  const sel = selected === 2 && over ? 2 : 1;
  const home = sel === 1 ? names[1] : names[2];
  const gA = sel === 1 ? l1.hg : l2.ag, gB = sel === 1 ? l1.ag : l2.hg;
  const box = (seat) => ({
    seat, name: names[seat], pts: seat === 1 ? gA : gB, win: (seat === 1 ? gA : gB) > (seat === 1 ? gB : gA), head: ["MIN", "G", "A"],
    rows: stats[sel][seat].map((r) => ({ key: r.id, name: last(r.name), bench: false, hl: 1, cells: [r.min, r.g, r.a] })),
  });
  return (
    <VersusFrame sport="football">
      <VersusSeries eyebrow={over ? "TWO LEGS · FINAL" : "TWO LEGS · LEG 2 NEXT"} scoreA={aggA} scoreB={aggB}
        lead={over ? how : leader === 0 ? "All square" : `${names[leader]} leads`} leadSeat={over ? win : leader} chips={chips} selected={sel} onSelect={onSelect}
        btn={over ? { label: "See result", onClick: onSeeResult } : { label: "▶ Play leg 2", onClick: onNext }}
        boxTitle={`Leg ${sel} · Match stats`} home={`Home: ${home}`} boxes={[box(1), box(2)]} cols={3}
        footer={over ? <TieReport tie={tie} odds={odds} names={names} /> : null} />
    </VersusFrame>
  );
}

export function FootballVersusFinal({ tie, names, squads, managers, onAgain }) {
  const win = tie.winner === "a" ? 1 : 2;
  const agg = { 1: tie.aggA, 2: tie.aggB };
  const how = tie.decidedBy === "penalties" ? `${Math.max(tie.shootout.a, tie.shootout.b)}–${Math.min(tie.shootout.a, tie.shootout.b)} on penalties` : tie.decidedBy;
  const cards = [1, 2].map((s) => ({
    seat: s, name: names[s], score: agg[s], win: win === s,
    coach: `${managers[s] ? `Manager ${managers[s].name} · ` : ""}${squads[s].shape}`,
    names: [...squads[s].players.map((p) => ({ n: last(p.PLAYER_NAME), st: true })), ...squads[s].bench.map((p) => ({ n: last(p.PLAYER_NAME), st: false }))],
  }));
  const share = async () => {
    const text = `${names[win]} won ${tie.aggA}–${tie.aggB} (${tie.decidedBy}) in Football Same Screen on Primary Arch`;
    try { if (navigator.share) await navigator.share({ text, url: location.href }); else await navigator.clipboard.writeText(`${text} ${location.href}`); } catch { /* iptal */ }
  };
  return (
    <VersusFrame sport="football">
      <VersusFinal eyebrow="Same Screen · FINAL" big="Winners" winner={names[win]} winnerSeat={win}
        summary={<><b>win the two legs {tie.aggA}–{tie.aggB}</b>{tie.decidedBy !== "aggregate" ? ` · ${how}` : ""}</>}
        cards={cards} onAgain={onAgain} onShare={share} />
    </VersusFrame>
  );
}

