import { useState } from "react";
import GameStage from "./GameStage";
import "./versus.css";

// İki oyunculu ekranların sunum bileşenleri (Same Screen / With a Friend, basketbol + futbol).
// Hepsi saf sunum: veri ve davranış sayfadan gelir, spora özgü şey (saha çizgisi, sütunlar, notlar) prop'tur.
// Taraf 1 = mavi, taraf 2 = pembe-kırmızı (versus.css).

export const seatClass = (seat) => (seat === 1 ? "s1" : "s2");
const last = (n) => (n || "").split(" ").slice(-1)[0];

export function VersusFrame({ sport, className = "", children }) {
  return <GameStage sport={sport} className={`sb-vs ${className}`.trim()}>{children}</GameStage>;
}

// ── Draft başlığı: kimlik | sıra + çekiliş | jokerler ─────────────────────
export function VersusHead({ title, meta, chip, turn, jokers }) {
  return (
    <header className="sb-vs-head">
      <div className="sb-vs-id">
        <h1>{title}</h1>
        <div className="meta"><span>{meta}</span>{chip && <span className="sb-vs-chip">{chip}</span>}</div>
      </div>
      <div className={`sb-vs-turn ${seatClass(turn.seat)}${turn.spinning ? " spinning" : ""}`} aria-live="polite">
        <span className="who">{turn.who}</span>
        <span className="col grow"><span className={`val season${(turn.season || "").length > 8 ? " md" : ""}`}>{turn.season || "—"}</span><span className="lbl">{turn.seasonLabel}</span></span>
        <span className="col"><span className={`val${(turn.team || "").length > 8 ? " long" : ""}`}>{turn.team || "—"}</span><span className="lbl">{turn.teamLabel}</span></span>
      </div>
      {jokers.length > 0 && <div className="sb-vs-jokers" role="group" aria-label="Jokers">
        {jokers.map((j) => (
          <button key={j.key} type="button" className="sb-vs-joker" data-state={j.state} disabled={!j.enabled} onClick={j.onClick}>
            <span className="ic" aria-hidden="true">{j.icon}</span><span className="lb">{j.label}</span>
          </button>
        ))}
      </div>}
    </header>
  );
}

// ── Taraf kadro kolonu ─────────────────────────────────────────────────────
//   rows: [{ key, slot, slotColor, name, arch, archColor, tap, sel, onClick }]
export function SeatColumn({ seat, name, count, total, sub, rows, active }) {
  return (
    <aside className={`sb-vs-seat ${seatClass(seat)}${active ? " on" : ""}`}>
      <div className="sb-vs-seat-head">
        <div className="row"><span className="dot" /><span className="nm">{name}</span><span className="ct">{count}/{total}</span></div>
        <div className="sub">{sub}</div>
      </div>
      <div className="sb-vs-seat-rows">
        {rows.map((r) => (
          <button key={r.key} type="button" className={`sb-vs-slot${r.name ? "" : " open"}${r.tap ? " tap" : ""}${r.sel ? " sel" : ""}`}
            style={{ "--p": r.slotColor }} onClick={() => r.tap && r.onClick?.()} tabIndex={r.tap ? 0 : -1}>
            <span className="ps">{r.slot}</span>
            <span style={{ minWidth: 0 }}>
              <span className="nm">{r.name || "Open"}</span>
              {r.name && r.arch && <span className="ar" style={{ color: r.archColor }}>{r.arch}</span>}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function VersusBody({ left, right, children }) {
  return <div className="sb-vs-body">{left}<section className="sb-vs-mid">{children}</section>{right}</div>;
}

export function SpinningCenter({ text, sub }) {
  return (
    <div className="sb-vs-spinning" role="status">
      <h2>{text}</h2>
      <div className="dots" aria-hidden="true"><i /><i /><i /></div>
      <p>{sub}</p>
    </div>
  );
}

// ── Havuz tablosu ──────────────────────────────────────────────────────────
//   columns: [{ key, label }]  rows: [{ id, pos, name, arch, archColor, cells: [{ v, cls }], disabled, onClick }]
export function PoolTable({
  title, note, sortChips, sortKey, onSort, filters, filterKey, onFilter, columns, rows, banNote, empty, counter,
}) {
  const cols = columns.length;
  return (
    <>
      <div className="sb-vs-pool-head">
        <h2>{title}</h2><span className="note">{note}</span>
        <div className="tools">
          {sortChips && <>
            <span className="lb">SORT</span>
            {sortChips.map((c) => (
              <button key={c.key} type="button" aria-pressed={sortKey === c.key} onClick={() => onSort(c.key)}>{c.label}</button>
            ))}
          </>}
          {filters && filters.map((f) => (
            <button key={f.key} type="button" className="pos" aria-pressed={filterKey === f.key}
              onClick={() => onFilter(filterKey === f.key ? "" : f.key)}>{f.label}</button>
          ))}
        </div>
      </div>
      {banNote && <div className="sb-vs-ban" role="status">{banNote}</div>}
      <div className="sb-vs-table" style={{ "--cols": cols }}>
        <div className="sb-vs-th"><span>PLAYER</span>{columns.map((c) => <span key={c.key} className={sortKey === c.key ? "on" : ""}>{c.label}</span>)}</div>
        {rows.length === 0 && <div className="sb-vs-empty">{empty}</div>}
        {rows.map((r) => (
          <button key={r.id} type="button" className="sb-vs-tr" disabled={r.disabled} onClick={r.onClick}>
            <span className="who">
              <span className="pb">{r.pos}</span>
              <span style={{ minWidth: 0 }}><span className="nm">{r.name}</span><span className="ar" style={{ color: r.archColor }}>{r.arch}</span></span>
            </span>
            {r.cells.map((c, i) => <span key={i} className={`c ${c.cls || ""}${columns[i]?.key === sortKey ? " hl" : ""}`}>{c.v}</span>)}
          </button>
        ))}
      </div>
      {counter}
    </>
  );
}

// ── Karşı-joker şeridi (bekleyen taraf) ────────────────────────────────────
export function CounterStrip({ who, items, onSkip }) {
  return (
    <div className="sb-vs-counter" role="group" aria-label="Counter jokers">
      <p>Counter {who}'s pick? Use a joker on the shared spin before you pick.</p>
      <div className="btns">
        {items.map((i) => <button key={i.key} type="button" disabled={!i.enabled} onClick={i.onClick}>{i.label}</button>)}
        <button type="button" className="no" onClick={onSkip}>No thanks</button>
      </div>
    </div>
  );
}

// ── Slot seçimi (seçilen oyuncu → hangi yuvaya) ────────────────────────────
//   slots: [{ key, label, nat, off, note, tone, onClick }]  bench: [{ key, label, onClick }]
export function PlacePanel({ name, arch, archColor, sub, slots, bench, onCancel, hint }) {
  return (
    <div className="sb-vs-place">
      <div className="top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{name}</h2>
          <span className="sub"><b style={{ color: archColor, fontWeight: 600 }}>{arch}</b>{sub ? ` · ${sub}` : ""}</span>
        </div>
        <button type="button" className="back" onClick={onCancel}>← Back</button>
      </div>
      <span className="lab">{hint}</span>
      <div className="grp">
        {slots.map((s) => (
          <button key={s.key} type="button" className={`slotbtn${s.nat ? " nat" : ""}${s.off ? " off" : ""}`} onClick={s.onClick}>
            {s.label}{s.note && <small className={`tone-${s.tone || "warn"}`}>{s.note}</small>}
          </button>
        ))}
      </div>
      {bench.length > 0 && <>
        <span className="lab">Bench</span>
        <div className="grp">{bench.map((b) => <button key={b.key} type="button" className="slotbtn bench" onClick={b.onClick}>{b.label}</button>)}</div>
      </>}
    </div>
  );
}

// ── Kilitli kadrolar ───────────────────────────────────────────────────────
export function TitleBlock({ eyebrow, title, accent, lede, right }) {
  return (
    <header className="sb-vs-title">
      <div className="t">
        <p className="sb-mono sb-eyebrow">{eyebrow}</p>
        <h1>{title} {accent && <span className="sb-accent">{accent}</span>}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {right}
    </header>
  );
}

export function StatusPill({ children }) { return <span className="sb-vs-status">{children}</span>; }

//   spots: [{ key, seat, x, y, label, name, tap, sel, onClick }]  bench: [{ seat, name, cells:[{ key, slot, name, tap, sel, onClick }] }]
export function VersusCourt({ lines, spots, names, scores, bench }) {
  return (
    <section className="sb-panel sb-vs-court">
      <div className="scores">
        <span className="s1" style={{ color: "var(--seat-1)" }}>{names[1]} <b>{scores[1]}</b></span>
        <span className="s2 r" style={{ color: "var(--seat-2)" }}><b>{scores[2]}</b> {names[2]}</span>
      </div>
      <div className="field">
        <svg viewBox="0 0 940 500" preserveAspectRatio="none" aria-hidden="true">{lines}</svg>
        <span className="vs">VS</span>
        {spots.map((s) => (
          <button key={s.key} type="button" className={`sb-vs-spot ${seatClass(s.seat)}${s.tap ? " tap" : ""}${s.sel ? " sel" : ""}`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, color: s.name ? "var(--sb-text)" : "var(--sb-faint)" }}
            onClick={() => s.tap && s.onClick?.()} tabIndex={s.tap ? 0 : -1} aria-label={`${s.label} ${s.name || "open"}`}>
            <span className="dot">{s.label}</span><span className="nm">{s.name ? last(s.name) : "—"}</span>
          </button>
        ))}
      </div>
      <div className="sb-vs-bench">
        {bench.map((b) => (
          <div key={b.seat} className={seatClass(b.seat)}>
            <div className="lab">{b.name} · Bench</div>
            <div className="cells" style={b.cells.length > 4 ? { gridTemplateColumns: `repeat(${b.cells.length}, minmax(0, 1fr))` } : undefined}>
              {b.cells.map((c) => (
                <button key={c.key} type="button" className={`sb-vs-bcell${c.name ? "" : " empty"}${c.tap ? " tap" : ""}${c.sel ? " sel" : ""}`}
                  onClick={() => c.tap && c.onClick?.()} tabIndex={c.tap ? 0 : -1}>
                  <i>{c.slot}</i><b>{c.name ? last(c.name) : "Open"}</b>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

//   rows: [{ key, ps, name, sub, q, qColor, tap, sel, onClick }]
export function TeamList({ seat, name, score, scoreLabel = "TEAM SCORE", rows }) {
  return (
    <section className={`sb-vs-team ${seatClass(seat)}`}>
      <div className="h"><b>{name}</b><span>{scoreLabel}<em>{score}</em></span></div>
      {rows.map((r) => (
        <button key={r.key} type="button" className={`sb-vs-trow${r.tap ? " tap" : ""}${r.sel ? " sel" : ""}`}
          onClick={() => r.tap && r.onClick?.()} tabIndex={r.tap ? 0 : -1}>
          <span className="ps">{r.ps}</span>
          <span className="nm">{r.name}{r.sub && <small>{r.sub}</small>}</span>
          <span className="q" style={{ color: r.qColor }}>{r.q}</span>
        </button>
      ))}
    </section>
  );
}

export function LockedLayout({ court, teams, children }) {
  return (
    <>
      <div className="sb-vs-lock">{court}<div className="sb-vs-teams">{teams}</div></div>
      <div className="sb-vs-cta">{children}</div>
    </>
  );
}

// ── Koç / menajer sırası ──────────────────────────────────────────────────
//   seats: [{ seat, name, status, waiting, options: [{ key, name, sub, grades: [[label, grade, color]], raw }], hired }]
export function VersusHire({ seats, active, onHire, ctaLabel, canAct = true }) {
  const [sel, setSel] = useState(null);
  const cur = seats.find((s) => s.seat === active);
  const pick = sel && cur?.options.find((o) => o.key === sel);
  const finalSeat = active === seats[seats.length - 1].seat;
  return (
    <>
      <div className="sb-vs-hire">
        {seats.map((s) => (
          <section key={s.seat} className={`sb-vs-hirecol ${seatClass(s.seat)}`}>
            <div className="h"><span className="dot" /><b>{s.name}</b><span>{s.status}</span></div>
            {s.waiting ? <div className="wait">{s.waitText || `Waiting for ${seats[0].name} to hire first.`}</div> : s.options.map((o) => {
              const mine = s.seat === active && canAct;
              const on = mine ? sel === o.key : s.hired === o.key;
              const dim = !on && (mine ? !!sel : !mine && !!s.hired);
              return (
                <button key={o.key} type="button" className={`sb-vs-hc${on ? " on" : ""}${dim ? " dim" : ""}`} disabled={!mine}
                  aria-pressed={on} onClick={() => setSel(on ? null : o.key)}>
                  <span><h3>{o.name}</h3><span className="sub">{o.sub}</span></span>
                  {o.grades.map(([label, g, color]) => <span key={label} className="g"><b style={{ color }}>{g}</b><i>{label}</i></span>)}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      {canAct ? <div className="sb-vs-cta">
        <button type="button" className="sb-btn solid cta md" disabled={!pick}
          onClick={() => { if (pick) { setSel(null); onHire(active, pick.raw); } }}>
          {pick ? (finalSeat ? ctaLabel : `Hire ${pick.name.split(" ").slice(-1)[0]}`) : "Pick one"} →
        </button>
      </div> : null}
    </>
  );
}

// ── Eşleşme analizi ────────────────────────────────────────────────────────
//   heroes: [{ seat, name, grade, gradeColor, score, coach }]  parts: [{ label, weight, a, b, ac, bc }]
//   pillars: [{ label, tag, a, b, ac, bc }]  wg: [{ seat, name, weapon, gap }]
export function VersusMatchup({ eyebrow, title, accent, chip, heroes, parts, pillarsTitle, pillars, wg, seriesLabel, score, btn }) {
  return (
    <>
      <TitleBlock eyebrow={eyebrow} title={title} accent={accent} right={chip && <span className="sb-vs-chip">{chip}</span>} />
      <div className="sb-vs-heroes">
        {heroes.map((h) => (
          <section key={h.seat} className={`sb-vs-hero ${seatClass(h.seat)}`}>
            <span className="gr" style={{ color: h.gradeColor, background: `${h.gradeColor}1f`, borderColor: `${h.gradeColor}88` }}>{h.grade}</span>
            <div><div className="nm">{h.name}</div><div className="big">{h.score}<small>/ 100</small></div><div className="co">{h.coach}</div></div>
          </section>
        ))}
      </div>
      <div className="sb-vs-parts">
        {parts.map((p) => (
          <div key={p.label} className="sb-vs-part">
            <b style={{ color: p.ac }}>{p.a}</b>
            <span className="m">{p.label}<i>{p.weight}</i></span>
            <b style={{ color: p.bc }}>{p.b}</b>
          </div>
        ))}
      </div>
      {(pillars.length > 0 || wg.length > 0) && <section className="sb-panel sb-vs-pillars">
        {pillars.length > 0 && <h3>{pillarsTitle}</h3>}
        {pillars.map((p) => (
          <div key={p.label} className="sb-vs-pl">
            <span className="v l" style={{ color: p.ac }}>{p.a}</span>
            <span className="bar l"><i style={{ width: `${p.a}%`, "--k": p.ac }} /></span>
            <span className="lb">{p.label}<small>{p.tag}</small></span>
            <span className="bar"><i style={{ width: `${p.b}%`, "--k": p.bc }} /></span>
            <span className="v r" style={{ color: p.bc }}>{p.b}</span>
          </div>
        ))}
        <div className="sb-vs-wg">
          {wg.map((w) => (
            <div key={w.seat} className={seatClass(w.seat)}>
              <b>{w.name}</b>
              <span className="w">Weapon: {w.weapon}</span> · <span className="g">Gap: {w.gap}</span>
            </div>
          ))}
        </div>
      </section>}
      <div className="sb-vs-play">
        <div className="sr">{seriesLabel}<b>{score}</b></div>
        <button type="button" className="sb-btn solid cta md" onClick={btn.onClick} disabled={btn.disabled}>{btn.label}</button>
      </div>
    </>
  );
}

// ── Seri / maç ekranı ──────────────────────────────────────────────────────
//   chips: [{ key, label, score, played, cur }]  boxes: [{ seat, name, pts, win, head: [..], rows: [{ key, name, bench, cells: [..] }], total: [..] }]
export function VersusSeries({ eyebrow, scoreA, scoreB, lead, leadSeat, chips, selected, onSelect, btn, boxTitle, home, boxes, cols, footer }) {
  return (
    <>
      <div className="sb-vs-series">
        <div className="sc">
          <p className="sb-mono sb-eyebrow">{eyebrow}</p>
          <div className="big">{scoreA}<s>–</s>{scoreB}</div>
        </div>
        <div className={`lead ${leadSeat ? seatClass(leadSeat) : ""}`}>{lead}</div>
        <div className="sb-vs-chips">
          {chips.map((c) => (
            <button key={c.key} type="button" className={`sb-vs-gchip${c.played ? " played" : ""}${c.cur ? " cur" : ""}`}
              aria-pressed={selected === c.key} disabled={!c.played} onClick={() => onSelect(c.key)}>
              {c.label}<b>{c.score || "—"}</b>
            </button>
          ))}
        </div>
        <button type="button" className="sb-btn solid cta md" onClick={btn.onClick}>{btn.label}</button>
      </div>
      <div className="sb-vs-boxh"><h2>{boxTitle}</h2><span>{home}</span></div>
      <div className="sb-vs-boxes">
        {boxes.map((b) => (
          <section key={b.seat} className={`sb-vs-box ${seatClass(b.seat)}${b.win ? " win" : ""}`}>
            <div className="h"><b>{b.name}</b><span>{b.pts}</span></div>
            <div className="sb-vs-bx head" style={{ "--cols": cols }}><span>PLAYER</span>{b.head.map((h) => <span key={h}>{h}</span>)}</div>
            {b.rows.map((r) => (
              <div key={r.key} className={`sb-vs-bx${r.bench ? " bench" : ""}`} style={{ "--cols": cols }}>
                <span>{r.bench ? "· " : ""}{r.name}</span>
                {r.cells.map((c, i) => <span key={i} className={i === r.hl ? "hl" : ""}>{c}</span>)}
              </div>
            ))}
          </section>
        ))}
      </div>
      {footer}
    </>
  );
}

// ── Final ──────────────────────────────────────────────────────────────────
//   cards: [{ seat, name, score, win, coach, names: [{ n, st }] }]
export function VersusFinal({ eyebrow, big = "Champions", winner, winnerSeat, summary, cards, onAgain, againLabel = "Play again", onShare, shareLabel = "Share", extra }) {
  return (
    <div className="sb-vs-final">
      <p className="eye" style={{ color: winnerSeat === 1 ? "var(--seat-1)" : "var(--seat-2)" }}>{eyebrow}</p>
      <h1>{big}</h1>
      <h2 className={winnerSeat ? seatClass(winnerSeat) : ""}>{winner}</h2>
      <p className="sum">{summary}</p>
      <div className="sb-vs-finalcards">
        {cards.map((c) => (
          <section key={c.seat} className={`sb-vs-fcard ${seatClass(c.seat)}${c.win ? " win" : ""}`}>
            <div className="h"><b>{c.name}</b><span>{c.score}</span></div>
            <p className="co">{c.coach}</p>
            <div className="names">{c.names.map((n, i) => <span key={i} className={n.st ? "st" : ""}>{n.n}</span>)}</div>
          </section>
        ))}
      </div>
      <div className="cta">
        <button type="button" className="sb-btn solid cta md" onClick={onAgain}>{againLabel}</button>
        <button type="button" className="sb-btn ghost cta md" onClick={onShare}>{shareLabel}</button>
      </div>
      {extra}
    </div>
  );
}
