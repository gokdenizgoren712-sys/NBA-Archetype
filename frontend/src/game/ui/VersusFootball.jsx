import { FORMATIONS, SHAPE_KEYS } from "../football/formations";
import { posPenaltyFor, isPrimarySlot } from "../football/positions";
import { LEAGUE_LABEL } from "../football/leagues";
import { PHASE_COLOR } from "../football/theme";
import * as D from "../football/draft";
import {
  VersusFrame, VersusHead, SeatColumn, VersusBody, SpinningCenter, PoolTable, PlacePanel,
  TitleBlock, StatusPill, VersusCourt, TeamList, LockedLayout, VersusFinal, seatClass,
} from "./VersusUi";

// Futbol bağdaştırıcısı: Same Screen'in draft durumunu (football/draft.js) VersusUi bileşenlerine çevirir.
// Kapsam bilinçli olarak mevcut oyunu izler: 11 seçim (yedek yok), menajer adımı yok, çift maçlı eleme tek seferde çözülür.

const last = (n) => (n || "").split(" ").slice(-1)[0];
const q100 = (p) => Math.round((p?.overall_score || 0) * 100);
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
  { key: "CLEAN_SHEETS", label: "CS" }, { key: "APPS", label: "APP" },
];

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
        lede="Each player picks a formation before the first spin. You take turns off the same spun squad in snake order, eleven picks each, then the two XIs play a two-leg tie."
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
export function FootballVersusDraft({ d, names, spinning, pickingFor, msg, canPick, onChoose, onPlace, onCancel, round }) {
  const seat = D.activeSeat(d);
  const waiting = D.waitingSeat(d);
  const pool = d.pool;
  const seatProps = (s) => ({
    seat: s, name: names[s], active: seat === s, count: D.filled(d, s), total: D.slotsOf(d, s).length, sub: d.shapes[s],
    rows: D.slotsOf(d, s).map((sl) => {
      const p = d.squads[s][sl.id];
      return { key: sl.id, slot: sl.pos, slotColor: PHASE_COLOR[sl.phase] || "var(--sb-muted)", name: p?.PLAYER_NAME, arch: p?.primary_arch, archColor: PHASE_COLOR[p?.PHASE] || "#8a8a94" };
    }),
  });

  let mid;
  if (spinning || !pool) {
    mid = <SpinningCenter text="Spinning" sub={d.wheelMode === "pick" ? `Fresh spin for ${names[seat]}'s pick.` : `Shared spin for round ${d.round}.`} />;
  } else if (pickingFor) {
    const open = D.openSlotsFor(d, seat, pickingFor);
    mid = (
      <PlacePanel name={pickingFor.PLAYER_NAME} arch={pickingFor.primary_arch || "—"} archColor={PHASE_COLOR[pickingFor.PHASE]}
        sub={`natural ${pickingFor.POSITION} · ${names[seat]}`} hint="Pick a slot (off-position costs rating)" onCancel={onCancel}
        slots={open.map((sl) => {
          const pen = posPenaltyFor(pickingFor, sl);
          return { key: sl.id, label: sl.pos, nat: isPrimarySlot(pickingFor, sl), off: pen > 0, note: costText(pen), tone: costTone(pen), onClick: () => onPlace(pickingFor, sl.id) };
        })}
        bench={[]} />
    );
  } else {
    const rows = pool.players.map((p) => ({
      id: String(p.PLAYER_ID), pos: p.POSITION, name: p.PLAYER_NAME, arch: p.primary_arch || "—", archColor: PHASE_COLOR[p.PHASE] || "#8a8a94",
      disabled: !canPick(p), onClick: () => onChoose(p),
      cells: COLUMNS.map((c) => ({ v: fmt(p, c.key, c.key === "CLEAN_SHEETS" || c.key === "APPS" || c.key === "MINUTES_TOTAL") })),
    }));
    mid = <PoolTable title={`${pool.team} squad`} note={`${pool.season} · ratings hidden`} columns={COLUMNS} rows={rows}
      banNote={msg || null} empty="Nobody left here for this side." />;
  }

  return (
    <VersusFrame sport="football">
      <VersusHead title="Same Screen" meta={`Snake draft · two legs · round ${round}`}
        chip={`${d.shapes[1] === d.shapes[2] ? d.shapes[1] : `${d.shapes[1]} v ${d.shapes[2]}`} · all leagues`}
        turn={{ seat, who: `${names[seat]}'s pick`, season: pool?.season, team: pool?.team, seasonLabel: "SEASON", teamLabel: pool ? (LEAGUE_LABEL[pool.league] || pool.league).toUpperCase() : "CLUB", spinning }}
        jokers={[]} />
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

export function FootballVersusLocked({ d, names, scores, onPlay }) {
  const spots = [1, 2].flatMap((s) => D.slotsOf(d, s).map((sl) => {
    const x = (100 - sl.y) * 0.44 + 3;
    return { key: `${s}-${sl.id}`, seat: s, x: s === 1 ? x : 100 - x, y: s === 1 ? sl.x : 100 - sl.x, label: sl.pos, name: d.squads[s][sl.id]?.PLAYER_NAME };
  }));
  const rows = (s) => D.slotsOf(d, s).map((sl) => {
    const p = d.squads[s][sl.id];
    return { key: sl.id, ps: sl.pos, name: p?.PLAYER_NAME || "Open", sub: p ? p.primary_arch : "", q: p ? q100(p) : "", qColor: valColor((p?.overall_score || 0)) };
  });
  return (
    <VersusFrame sport="football">
      <TitleBlock eyebrow="Same Screen · DRAFT COMPLETE" title="XIs" accent="locked"
        lede="Both elevens are in. Every pick went straight into a slot, so the formation and the position costs are already counted in the team score."
        right={<StatusPill>Status: Review</StatusPill>} />
      <LockedLayout
        court={<VersusCourt lines={PITCH} spots={spots} names={names} scores={scores} bench={[]} />}
        teams={[1, 2].map((s) => <TeamList key={s} seat={s} name={names[s]} score={scores[s]} rows={rows(s)} />)}>
        <button type="button" className="sb-btn solid cta" onClick={onPlay}>Play the tie →</button>
      </LockedLayout>
    </VersusFrame>
  );
}

// ── Çift maçlı eleme sonucu (8g benzeri) + penaltı takipçisi ───────────────
export function FootballVersusTie({ tie, odds, names, onFinal, onRematch }) {
  const a = tie.sides?.a, b = tie.sides?.b;
  const win = tie.winner === "a" ? 1 : 2;
  const legs = [
    { l: "LEG 1", s: `${tie.legs[0].hg}-${tie.legs[0].ag}`, note: `at ${tie.legs[0].home}` },
    { l: "LEG 2", s: `${tie.legs[1].ag}-${tie.legs[1].hg}`, note: `at ${tie.legs[1].home}` },
    ...(tie.extraTime ? [{ l: "ET", s: `${tie.extraTime.ag}-${tie.extraTime.hg}` }] : []),
    ...(tie.shootout ? [{ l: "PENS", s: `${tie.shootout.a}-${tie.shootout.b}` }] : []),
  ];
  const how = tie.decidedBy === "penalties" ? `${names[win]} win ${Math.max(tie.shootout.a, tie.shootout.b)}–${Math.min(tie.shootout.a, tie.shootout.b)} on penalties`
    : tie.decidedBy === "extra time" ? `${names[win]} go through after extra time` : `${names[win]} go through on aggregate`;
  const aPct = odds ? Math.round(odds.aWinPct * 100) : null;
  return (
    <VersusFrame sport="football">
      <div className="sb-vs-series">
        <div className="sc">
          <p className="sb-mono sb-eyebrow">TWO LEGS · FINAL</p>
          <div className="big">{tie.aggA}<s>–</s>{tie.aggB}</div>
        </div>
        <div className={`lead ${seatClass(win)}`}>{how}</div>
        <div className="sb-vs-chips">
          {legs.map((c) => <span key={c.l} className="sb-vs-gchip played" style={{ cursor: "default" }}>{c.l}<b style={{ color: "var(--sb-text)" }}>{c.s}</b></span>)}
        </div>
        <button type="button" className="sb-btn solid cta md" onClick={onFinal}>See result</button>
      </div>
      <div className="sb-vs-boxh"><h2>Tie report</h2><span>Home first leg: {names[1]} · second leg: {names[2]}</span></div>
      <div className="sb-vs-boxes">
        <section className="sb-panel sb-vs-box s1" style={{ gap: 12 }}>
          <div className="h"><b>Legs</b></div>
          {legs.filter((c) => c.note).map((c) => (
            <div key={c.l} className="sb-vs-bx" style={{ "--cols": 1 }}><span>{c.l} · {c.note}</span><span className="hl">{c.s}</span></div>
          ))}
          {tie.shootout && (
            <div className="sb-vs-pens">
              <span className="sb-mono sb-eyebrow">Penalties{tie.shootout.kicks.some((k) => k.sudden) ? " · sudden death" : ""}</span>
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
          <button type="button" className="sb-btn" style={{ alignSelf: "flex-start" }} onClick={onRematch}>Rematch</button>
        </section>
      </div>
    </VersusFrame>
  );
}

export function FootballVersusFinal({ tie, names, squads, onAgain }) {
  const win = tie.winner === "a" ? 1 : 2;
  const agg = { 1: tie.aggA, 2: tie.aggB };
  const how = tie.decidedBy === "penalties" ? `${Math.max(tie.shootout.a, tie.shootout.b)}–${Math.min(tie.shootout.a, tie.shootout.b)} on penalties` : tie.decidedBy;
  const cards = [1, 2].map((s) => ({ seat: s, name: names[s], score: agg[s], win: win === s, coach: squads[s].shape, names: squads[s].players.map((p) => ({ n: last(p.PLAYER_NAME), st: true })) }));
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
