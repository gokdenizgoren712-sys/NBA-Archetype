import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import Pitch from "./Pitch";
import SeatPanel, { PHASE_COLOR, SEAT_COLOR } from "./SeatPanel";
import InlineSpin from "../InlineSpin";
import { ScreenIcon } from "../GameIcons";
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

  /* ── Kurulum (handoff 18b/13a kalıbı) ─────────────────────────────────── */
  // Kompakt başlık + iki taraf kolonu: isim, diziliş çipleri, sahanın canlı
  // önizlemesi (yüksekliğe sığar — sayfa kaymaz). Diziliş ilk spin'den ÖNCE
  // seçiliyor ve sonradan değişmiyor.
  if (!d) {
    return (
      <div className="g-fb-ss">
        <header className="g-idle-hero compact">
          <div>
            <h1 className="g-wordmark lg">Same Screen</h1>
            <p>2 players · 1 device · snake draft · two legs</p>
          </div>
          <div className="g-idle-actions">
            <div className="g-modebtn-row" role="radiogroup" aria-label="Wheel rule">
              {[{ key: "round", hex: "#60a5fa", label: "Round", hint: "1 spin / round" },
                { key: "pick", hex: "#FFB11B", label: "Pick", hint: "1 spin / pick" }].map(r => (
                <button key={r.key} role="radio" aria-checked={wheelMode === r.key}
                  className={`g-modebtn${wheelMode === r.key ? " on" : ""}`} style={{ "--c": r.hex }}
                  onClick={() => setWheelMode(r.key)}>
                  <span className="dot" /><span className="lbl"><b>{r.label}</b><i>{r.hint}</i></span>
                </button>
              ))}
            </div>
            <button onClick={start} disabled={!meta.pairs.length} className="aura-rating-btn g-idle-cta">
              {meta.pairs.length ? "Start draft" : "Loading clubs…"}
            </button>
          </div>
        </header>

        <div className="g-fb-ss-cols">
          {[1, 2].map((s) => (
            <section key={s} className="g-fb-ss-seat" style={{ "--c": SEAT_COLOR[s] }}>
              <div className="g-fb-ss-head">
                <span className="dot" />
                <input className="aura-ghost-input" value={names[s]} maxLength={18} aria-label={`Player ${s} name`}
                  onChange={(e) => setNames({ ...names, [s]: e.target.value })} />
              </div>
              <div className="g-fb-shapes">
                {SHAPE_KEYS.map((k) => (
                  <button key={k} onClick={() => setShapes({ ...shapes, [s]: k })}
                    className={`g-fb-shape sm${shapes[s] === k ? " on" : ""}`}>{k}</button>
                ))}
              </div>
              <div className="g-fb-ss-pitch"><Pitch shape={shapes[s]} squad={{}} fill /></div>
            </section>
          ))}
        </div>

        <p className="g-fb-ss-note">
          You take turns off the same spun squad in snake order — whoever picks second
          in one round picks first in the next. Eleven picks each, and every pick goes
          straight into a slot, so a keeper you take is a keeper you play. Nothing is
          sent anywhere; both squads stay in this browser.
          {msg && <span style={{ color: "#E8654C" }}> {msg}</span>}
        </p>
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
                    <div key={p.PLAYER_ID} className="flex gap-2 text-[13px] py-px">
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
            <span className="font-logo text-[12px] font-bold"
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
