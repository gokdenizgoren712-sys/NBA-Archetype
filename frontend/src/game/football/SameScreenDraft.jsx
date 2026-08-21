import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import Pitch from "./Pitch";
import InlineSpin from "../InlineSpin";
import { WheelIcon, LoopIcon, ScreenIcon } from "../GameIcons";
import { SHAPE_KEYS } from "./formations";
import * as D from "./draft";
import { LEAGUE_LABEL } from "./leagues";
import "../game.css";

// ── Same Screen draft ────────────────────────────────────────────────────────
// İki oyuncu tek cihazda sırayla seçiyor. Kurallar draft.js'te (saf durum
// makinesi); burası yalnızca onu çiziyor ve çarkı çeviriyor.
//
// EKRAN DÜZENİ basketbolun SameScreenGame'inden alındı, çünkü site zaten o dili
// konuşuyor: g-dock başlık barı, ortada InlineSpin şeritleri, altta yan yana iki
// koltuk paneli (aktif olan kendi renginde parlıyor). Önceki hâli tek düz bir
// panelde yalnız sıradaki oyuncuyu gösteriyordu — rakibin kadrosu kurulurken
// görünmüyordu ve sayfa sitenin geri kalanına hiç benzemiyordu.
//
// Futbola özgü iki fark duruyor: seçilen oyuncu bir SLOT'a yerleşiyor, ve draft
// 11 seçimle bitiyor (eleme skoru yalnızca ilk 11'den hesaplanıyor).

const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };
const SEAT_COLOR = { 1: "#3FB08C", 2: "#F2C14E" };
const SPIN_MS = 1500;

export default function SameScreenDraft({ onDone }) {
  const [meta, setMeta] = useState({ pairs: [], teams: [], seasons: [] });
  const [shapes, setShapes] = useState({ 1: "4-3-3", 2: "4-3-3" });
  const [wheelMode, setWheelMode] = useState("round");
  const [names, setNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [d, setD] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [target, setTarget] = useState(null);
  const [pickingFor, setPickingFor] = useState(null);   // slot bekleyen oyuncu
  const [msg, setMsg] = useState("");
  const timer = useRef(null);
  const spinRef = useRef(false);

  useEffect(() => {
    api.footballGameTeams({})
      .then((r) => setMeta({ pairs: r.pairs || [], teams: r.teams || [],
                             seasons: r.seasons || [] }))
      .catch(() => setMsg("Could not load the club pool."));
    return () => clearTimeout(timer.current);
  }, []);

  const seat = d ? D.activeSeat(d) : 1;
  const waiting = d ? D.waitingSeat(d) : 2;

  /** Çark: kullanılmamış bir kulüp-sezon seç, kadrosunu getir. */
  const spin = useCallback((state) => {
    if (spinRef.current || !meta.pairs.length) return;
    const used = new Set(state.usedPairs);
    const pool = meta.pairs.filter((p) => !used.has(`${p.team}|${p.season}`));
    if (!pool.length) { setMsg("No fresh club-season left."); return; }

    spinRef.current = true;
    setSpinning(true); setMsg(""); setPickingFor(null);
    const t = pool[Math.floor(Math.random() * pool.length)];
    setTarget(t);

    // Şeritlerin kendi animasyonu var (InlineSpin) — burada yalnız süre tutuluyor.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.footballGamePlayers({ season: t.season, team: t.team })
        .then((r) => {
          spinRef.current = false; setSpinning(false);
          setD((cur) => D.setPool(cur, { ...t, players: r.players || [] }));
        })
        .catch(() => {
          spinRef.current = false; setSpinning(false);
          setMsg("Could not load that squad — spin again.");
        });
    }, SPIN_MS);
  }, [meta.pairs]);

  // Faz "spinning"e düştüğünde otomatik çevir; havuz ölüyse tekrar çevir.
  useEffect(() => {
    if (!d) return;
    if (d.phase === "spinning" && !spinRef.current) spin(d);
    else if (d.phase === "drafting" && D.poolIsDead(d) && !spinRef.current) {
      setMsg("Nobody left there for this side — spinning again.");
      spin(d);
    }
  }, [d, spin]);

  const start = () =>
    setD(D.createDraft({ shapes, wheelMode, first: Math.random() < 0.5 ? 1 : 2 }));

  const choose = (p) => {
    if (!D.canPick(d, seat, p)) return;
    const open = D.openSlotsFor(d, seat, p);
    if (open.length === 1) { place(p, open[0].id); return; }
    setPickingFor(p);
  };

  const place = (player, slotId) => {
    const r = D.pick(d, seat, player, slotId);
    if (!r.ok) { setMsg(r.reason); return; }
    setPickingFor(null); setMsg("");
    setD(r.state);
  };

  /* ── Kurulum ─────────────────────────────────────────────────────────── */
  if (!d) {
    return (
      <div className="space-y-3">
        <div className="g-dock">
          <span className="aura-blob" style={{ "--slot-color": SEAT_COLOR[1],
            left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />
          <div className="g-dock-left">
            <h1 className="g-dock-title">Same Screen</h1>
            <p className="g-dock-sub">2 players · 1 device · snake draft · two legs</p>
          </div>

          <div className="g-dock-center">
            <button onClick={start} disabled={!meta.pairs.length} className="aura-rating-btn"
              style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em" }}>
              <WheelIcon size={16} />
              <span className="ml-2">{meta.pairs.length ? "Start the Draft" : "Loading Clubs…"}</span>
            </button>
          </div>

          <div className="g-dock-right">
            <div className="g-seg stacked">
              {[{ key: "round", Icon: WheelIcon, hex: "#60a5fa", label: "Round", hint: "1 spin / round" },
                { key: "pick", Icon: LoopIcon, hex: "#FFB11B", label: "Pick", hint: "1 spin / pick" }]
                .map(({ key, Icon, hex, label, hint }) => (
                <button key={key} onClick={() => setWheelMode(key)}
                  className={`g-seg-btn${wheelMode === key ? " on" : ""}`}
                  style={{ "--accent": hex, "--accent-a": hex + "22", "--accent-line": hex + "66" }}>
                  <Icon size={14} /> {label}
                  <span className="opacity-55 font-normal tracking-normal normal-case">({hint})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Diziliş ilk spin'den ÖNCE seçiliyor ve sonradan değişmiyor — o yüzden
            burada sahayı canlı gösteriyoruz: kaç kanat, kaç stoper. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2].map((s) => (
            <div key={s} className="g-panel p-4 space-y-3"
              style={{ "--accent": SEAT_COLOR[s], "--accent-line": SEAT_COLOR[s] + "55" }}>
              <span className="aura-blob" style={{ "--slot-color": SEAT_COLOR[s],
                right: -24, top: -40, width: 190, height: 120, opacity: 0.18 }} />

              <div className="g-label" style={{ color: SEAT_COLOR[s] }}>Player {s}</div>
              <input className="aura-ghost-input" value={names[s]} maxLength={18}
                onChange={(e) => setNames({ ...names, [s]: e.target.value })} />

              <div>
                <div className="g-label mb-2">Formation</div>
                <div className="flex flex-wrap gap-1.5">
                  {SHAPE_KEYS.map((k) => (
                    <button key={k} onClick={() => setShapes({ ...shapes, [s]: k })}
                      className="aura-pill-btn" style={{ fontSize: 11, padding: "5px 11px",
                        ...(shapes[s] === k
                          ? { borderColor: SEAT_COLOR[s], color: SEAT_COLOR[s],
                              background: SEAT_COLOR[s] + "14" }
                          : null) }}>{k}</button>
                  ))}
                </div>
              </div>

              <Pitch shape={shapes[s]} squad={{}} />
            </div>
          ))}
        </div>

        <div className="g-panel subtle p-4">
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            You take turns off the same spun squad in snake order — whoever picks second
            in one round picks first in the next. Eleven picks each, and every pick goes
            straight into a slot, so a keeper you take is a keeper you play. Nothing is
            sent anywhere; both squads stay in this browser.
          </p>
          {msg && <div className="text-xs mt-2" style={{ color: "#E8654C" }}>{msg}</div>}
        </div>
      </div>
    );
  }

  /* ── Draft bitti ─────────────────────────────────────────────────────── */
  if (d.phase === "done") {
    return (
      <div className="space-y-3">
        <div className="g-dock thin">
          <span className="aura-blob" style={{ "--slot-color": SEAT_COLOR[1],
            left: -30, top: -60, width: 220, height: 130, opacity: 0.2 }} />
          <div className="g-dock-left"><h1 className="g-dock-title">Both Elevens Are In</h1></div>
          <div className="g-dock-center">
            <button onClick={() => onDone?.({
                1: { ...D.squadOf(d, 1), name: names[1] },
                2: { ...D.squadOf(d, 2), name: names[2] },
              })}
              className="aura-rating-btn" style={{ padding: "13px 34px", fontSize: 13 }}>
              <ScreenIcon size={15} /><span className="ml-2">Play the Tie</span>
            </button>
          </div>
          <div className="g-dock-right" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((s) => {
            const sq = D.squadOf(d, s);
            return (
              <div key={s} className="g-panel p-4 space-y-3"
                style={{ "--accent": SEAT_COLOR[s], "--accent-line": SEAT_COLOR[s] + "55" }}>
                <span className="aura-blob" style={{ "--slot-color": SEAT_COLOR[s],
                  right: -24, top: -40, width: 190, height: 120, opacity: 0.18 }} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-logo text-sm font-bold" style={{ color: SEAT_COLOR[s] }}>
                    {names[s]}
                  </span>
                  <span className="g-status" style={{ "--accent": SEAT_COLOR[s],
                    "--accent-a": SEAT_COLOR[s] + "1f", "--accent-line": SEAT_COLOR[s] + "55" }}>
                    {sq.shape} · out of position −{Math.round(sq.positionPenalty * 100)}
                  </span>
                </div>
                <Pitch shape={sq.shape} squad={d.squads[s]} />
                <div className="flex flex-col gap-0.5">
                  {sq.players.map((p) => (
                    <div key={p.PLAYER_ID} className="flex gap-2 text-[11.5px] py-px">
                      <span style={{ width: 30, color: PHASE_COLOR[p.PHASE] }}>{p._slot}</span>
                      <span className="flex-1 truncate">{p.PLAYER_NAME}</span>
                      <span className="truncate max-w-[130px]"
                        style={{ color: "var(--text-faint)" }}>{p.primary_arch}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Draft sürüyor ───────────────────────────────────────────────────── */
  const acc = SEAT_COLOR[seat];
  return (
    <div className="space-y-3">
      <div className="g-dock thin">
        <span className="aura-blob" style={{ "--slot-color": acc, left: -30, top: -60,
          width: 220, height: 130, opacity: spinning ? 0.26 : 0.13,
          transition: "opacity .4s ease" }} />

        <div className="g-dock-left flex items-center gap-3">
          <h1 className="g-dock-title">Round {d.round}</h1>
          <span className="g-status" style={{ "--accent": "#9ca3af",
            "--accent-a": "rgba(156,163,175,.14)", "--accent-line": "rgba(156,163,175,.4)" }}>
            {d.wheelMode === "round" ? "1 spin / round" : "1 spin / pick"}
          </span>
        </div>

        <div className="g-dock-center">
          {spinning ? (
            <div className="g-spin-row flex items-center gap-7">
              <InlineSpin items={meta.teams} spinning label="Club" accent="#60a5fa"
                targetIdx={Math.max(0, meta.teams.indexOf(target?.team))} />
              <InlineSpin items={meta.seasons} spinning label="Season" accent="#FFB11B"
                targetIdx={Math.max(0, meta.seasons.indexOf(target?.season))} />
            </div>
          ) : (
            <span className="font-logo text-[12px] font-bold uppercase tracking-widest"
              style={{ color: acc }}>
              {names[seat]} to pick — {names[waiting]} waiting
            </span>
          )}
        </div>

        <div className="g-dock-right">
          {d.pool && !spinning && (
            <div className="g-dock-team">
              <div className="tm">{d.pool.team}</div>
              <div className="yr">
                {LEAGUE_LABEL[d.pool.league] || d.pool.league} · {d.pool.season}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((s) => (
          <SeatPanel key={s} seat={s} active={seat === s} name={names[s]}
            shape={shapes[s]} squad={d.squads[s]} slots={D.slotsOf(d, s)}
            pool={d.pool} spinning={spinning} pickingFor={seat === s ? pickingFor : null}
            canPick={(p) => D.canPick(d, s, p)}
            openIds={seat === s && pickingFor
              ? new Set(D.openSlotsFor(d, s, pickingFor).map((x) => x.id)) : null}
            onChoose={choose} onPlace={place}
            onCancel={() => { setPickingFor(null); setMsg(""); }}
            msg={seat === s ? msg : ""} />
        ))}
      </div>
    </div>
  );
}

/* ── Tek koltuğun paneli ───────────────────────────────────────────────────
   Basketbolun PlayerSeatPanel'inin karşılığı: aktif koltuk kendi renginde
   parlıyor, bekleyen sönük duruyor. İkisi de HER ZAMAN görünüyor — rakibinin
   sahasının dolduğunu görmek oyunun yarısı. */
function SeatPanel({ seat, active, name, shape, squad, slots, pool, spinning,
                     pickingFor, canPick, openIds, onChoose, onPlace, onCancel, msg }) {
  const acc = SEAT_COLOR[seat];
  const done = Object.keys(squad).length;

  return (
    <div className="rounded-2xl border p-3 space-y-2.5 transition-colors"
      style={active
        ? { borderColor: acc + "99", background: acc + "0f",
            boxShadow: `0 0 24px -8px ${acc}b3` }
        : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>

      <div className="flex items-center justify-between gap-2">
        <span className="font-logo text-sm font-bold text-white truncate">{name}</span>
        <div className="flex items-center gap-2 flex-none">
          <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
            {done}/{slots.length}
          </span>
          {active ? (
            <span className="text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
              style={{ color: acc, background: acc + "33", border: `1px solid ${acc}80` }}>
              Your pick
            </span>
          ) : (
            <span className="text-[9.5px] px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ color: "var(--text-faint)", border: "1px solid rgba(255,255,255,.12)" }}>
              Waiting
            </span>
          )}
        </div>
      </div>

      <Pitch shape={shape} squad={squad} pickingFor={pickingFor}
        onSlotClick={(s) => {
          if (!pickingFor) return;
          if (openIds && !openIds.has(s.id)) return;
          onPlace(pickingFor, s.id);
        }} />

      {/* Seçim listesi yalnız sıradaki koltukta — iki liste yan yana dursa
          hangisinin canlı olduğu belirsizleşirdi. */}
      {active && pickingFor && (
        <div className="text-[11.5px] flex items-center gap-2 flex-wrap"
          style={{ color: "#F2C14E" }}>
          <span>Tap a slot for <b>{pickingFor.PLAYER_NAME}</b></span>
          <button onClick={onCancel} className="aura-pill-btn"
            style={{ fontSize: 10, padding: "3px 9px" }}>cancel</button>
        </div>
      )}

      {active && !pickingFor && spinning && (
        <p className="text-center text-xs animate-pulse py-4"
          style={{ color: "var(--text-muted)" }}>Spinning for a club…</p>
      )}

      {active && !pickingFor && !spinning && pool && (
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 260 }}>
          {pool.players.map((p) => {
            const ok = canPick(p);
            return (
              <button key={p.PLAYER_ID} onClick={() => onChoose(p)} disabled={!ok}
                className="w-full text-left flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5"
                style={{ opacity: ok ? 1 : 0.32, cursor: ok ? "pointer" : "not-allowed",
                  background: "rgba(255,255,255,.022)",
                  border: `1px solid ${ok ? PHASE_COLOR[p.PHASE] + "44" : "var(--border)"}` }}>
                <span className="text-[9px] uppercase flex-none" style={{ minWidth: 22,
                  color: PHASE_COLOR[p.PHASE] }}>{p.POSITION}</span>
                <span className="flex-1 truncate">{p.PLAYER_NAME}</span>
                <span className="text-[10.5px] truncate max-w-[110px] flex-none"
                  style={{ color: "var(--text-faint)" }}>{p.primary_arch}</span>
              </button>
            );
          })}
        </div>
      )}

      {msg && <div className="text-[11.5px]" style={{ color: "#E8654C" }}>{msg}</div>}
    </div>
  );
}
