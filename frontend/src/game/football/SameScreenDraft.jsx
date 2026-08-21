import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import Pitch from "./Pitch";
import { SHAPE_KEYS } from "./formations";
import { PENALTY_LABEL, posPenaltyFor } from "./positions";
import * as D from "./draft";
import { LEAGUE_LABEL } from "./leagues";

// ── Same Screen draft ────────────────────────────────────────────────────────
// İki oyuncu tek cihazda sırayla seçiyor. Kurallar draft.js'te (saf durum
// makinesi); burası yalnızca onu çiziyor ve çarkı çeviriyor.
//
// Basketbolun SameScreenGame'iyle aynı iskelet — yılan sırası, iki çark modu,
// paylaşılan havuz — ama futbola özgü iki fark var: seçilen oyuncu bir SLOT'a
// yerleşiyor (kalede kimse yoksa kadro geçersiz), ve draft 11 seçimle bitiyor
// çünkü eleme skoru yalnızca ilk 11'den hesaplanıyor.

const ACC = "#3FB08C";
const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };
const SEAT_COLOR = { 1: "#3FB08C", 2: "#F2C14E" };

export default function SameScreenDraft({ onDone }) {
  const [pairs, setPairs] = useState([]);
  const [shapes, setShapes] = useState({ 1: "4-3-3", 2: "4-3-3" });
  const [wheelMode, setWheelMode] = useState("round");
  const [names, setNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [d, setD] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [spinLabel, setSpinLabel] = useState("");
  const [pickingFor, setPickingFor] = useState(null);   // slot bekleyen oyuncu
  const [msg, setMsg] = useState("");
  const timer = useRef(null);
  const spinRef = useRef(false);

  useEffect(() => {
    api.footballGameTeams({})
      .then((r) => setPairs(r.pairs || []))
      .catch(() => setMsg("Could not load the club pool."));
    return () => clearInterval(timer.current);
  }, []);

  const seat = d ? D.activeSeat(d) : 1;

  /** Çark: kullanılmamış bir kulüp-sezon seç, kadrosunu getir. */
  const spin = useCallback((state) => {
    if (spinRef.current || !pairs.length) return;
    const used = new Set(state.usedPairs);
    const pool = pairs.filter((p) => !used.has(`${p.team}|${p.season}`));
    if (!pool.length) { setMsg("No fresh club-season left."); return; }

    spinRef.current = true;
    setSpinning(true); setMsg(""); setPickingFor(null);
    const target = pool[Math.floor(Math.random() * pool.length)];

    let ticks = 0;
    const total = 14 + Math.floor(Math.random() * 8);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      ticks++;
      const r = pool[Math.floor(Math.random() * pool.length)];
      setSpinLabel(`${r.team} · ${r.season}`);
      if (ticks >= total) {
        clearInterval(timer.current);
        setSpinLabel(`${target.team} · ${target.season}`);
        api.footballGamePlayers({ season: target.season, team: target.team })
          .then((r) => {
            spinRef.current = false; setSpinning(false);
            setD((cur) => D.setPool(cur, { ...target, players: r.players || [] }));
          })
          .catch(() => {
            spinRef.current = false; setSpinning(false);
            setMsg("Could not load that squad — spin again.");
          });
      }
    }, 70);
  }, [pairs]);

  // Faz "spinning"e düştüğünde otomatik çevir; havuz ölüyse tekrar çevir.
  useEffect(() => {
    if (!d) return;
    if (d.phase === "spinning" && !spinRef.current) spin(d);
    else if (d.phase === "drafting" && D.poolIsDead(d) && !spinRef.current) {
      setMsg("Nobody left there for this side — spinning again.");
      spin(d);
    }
  }, [d, spin]);

  const start = () => {
    setD(D.createDraft({ shapes, wheelMode, first: Math.random() < 0.5 ? 1 : 2 }));
  };

  const choose = (p) => {
    if (!D.canPick(d, seat, p)) return;
    const open = D.openSlotsFor(d, seat, p);
    if (open.length === 1) { place(p, open[0].id); return; }
    setPickingFor(p);
    setMsg(`Pick a slot for ${p.PLAYER_NAME}.`);
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
      <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Two players, one device. You take turns off the same spun squad, snake order,
          eleven picks each. Nothing is sent anywhere.
        </p>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16 }}>
          {[1, 2].map((s) => (
            <div key={s} style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em",
                color: SEAT_COLOR[s] }}>Player {s}</div>
              <input className="aura-ghost-input" value={names[s]} style={{ marginTop: 5 }}
                onChange={(e) => setNames({ ...names, [s]: e.target.value })} />
              <div className="aura-select-wrap" style={{ marginTop: 7 }}>
                <select className="aura-select" value={shapes[s]}
                  onChange={(e) => setShapes({ ...shapes, [s]: e.target.value })}>
                  {SHAPE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em",
            color: "var(--text-faint)" }}>Wheel</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {[["round", "One spin a round", "Both of you pick off the same squad — you are fighting over one roster."],
              ["pick", "A spin per pick", "Everyone gets their own squad. Less blocking, more luck."]]
              .map(([k, label, tip]) => (
              <button key={k} title={tip} onClick={() => setWheelMode(k)} className="aura-pill-btn"
                style={wheelMode === k ? { borderColor: ACC, color: ACC } : undefined}>{label}</button>
            ))}
          </div>
        </div>

        <button onClick={start} disabled={!pairs.length} className="aura-rating-btn"
          style={{ borderColor: ACC, color: ACC, marginTop: 16 }}>
          {pairs.length ? "Start the draft" : "Loading clubs…"}
        </button>
        {msg && <div style={{ fontSize: 11.5, color: "#E8654C", marginTop: 10 }}>{msg}</div>}
      </div>
    );
  }

  /* ── Draft bitti ─────────────────────────────────────────────────────── */
  if (d.phase === "done") {
    return (
      <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Both elevens are in</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
          {[1, 2].map((s) => {
            const sq = D.squadOf(d, s);
            return (
              <div key={s} style={{ flex: "1 1 260px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: SEAT_COLOR[s] }}>
                  {names[s]} · {sq.shape}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                  out of position −{Math.round(sq.positionPenalty * 100)}
                </div>
                {sq.players.map((p) => (
                  <div key={p.PLAYER_ID} style={{ display: "flex", gap: 7, fontSize: 11.5,
                    padding: "2px 0" }}>
                    <span style={{ width: 26, color: PHASE_COLOR[p.PHASE] }}>{p._slot}</span>
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden",
                      textOverflow: "ellipsis" }}>{p.PLAYER_NAME}</span>
                    <span style={{ color: "var(--text-faint)" }}>{p.primary_arch}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <button onClick={() => onDone?.({
            1: { ...D.squadOf(d, 1), name: names[1] },
            2: { ...D.squadOf(d, 2), name: names[2] },
          })}
          className="aura-rating-btn" style={{ borderColor: ACC, color: ACC, marginTop: 14 }}>
          Play the tie
        </button>
      </div>
    );
  }

  /* ── Draft sürüyor ───────────────────────────────────────────────────── */
  const mySlots = D.slotsOf(d, seat);
  const openIds = pickingFor
    ? new Set(D.openSlotsFor(d, seat, pickingFor).map((s) => s.id))
    : null;

  return (
    <div className="g-panel p-4" style={{ "--accent": SEAT_COLOR[seat],
      "--accent-line": SEAT_COLOR[seat] + "44" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: SEAT_COLOR[seat] }}>
          {names[seat]}'s pick
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          round {d.round} · {D.filled(d, seat)}/{mySlots.length} placed
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>
          {names[D.waitingSeat(d)]} {D.filled(d, D.waitingSeat(d))}/{D.slotsOf(d, D.waitingSeat(d)).length}
        </span>
      </div>

      <div style={{ fontSize: 12, color: ACC, marginTop: 6 }}>
        {spinning ? `Spinning… ${spinLabel}` : d.pool ? `${d.pool.team} · ${d.pool.season}` : ""}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: "0 0 260px", maxWidth: 300 }}>
          <Pitch shape={shapes[seat]} squad={d.squads[seat]}
            pickingFor={pickingFor}
            onSlotClick={(s) => {
              if (!pickingFor) return;
              if (openIds && !openIds.has(s.id)) return;
              place(pickingFor, s.id);
            }} />
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          {pickingFor && (
            <div style={{ fontSize: 12, color: "#F2C14E", marginBottom: 8 }}>
              Tap a slot for <b>{pickingFor.PLAYER_NAME}</b> ·{" "}
              <button onClick={() => { setPickingFor(null); setMsg(""); }}
                className="aura-pill-btn" style={{ fontSize: 10 }}>cancel</button>
            </div>
          )}
          {!pickingFor && !spinning && d.pool && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4,
              maxHeight: 330, overflowY: "auto" }}>
              {d.pool.players.map((p) => {
                const ok = D.canPick(d, seat, p);
                return (
                  <button key={p.PLAYER_ID} onClick={() => choose(p)} disabled={!ok}
                    className="w-full text-left"
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                      padding: "6px 9px", borderRadius: 8, opacity: ok ? 1 : 0.35,
                      cursor: ok ? "pointer" : "not-allowed",
                      background: "rgba(255,255,255,.022)",
                      border: `1px solid ${ok ? PHASE_COLOR[p.PHASE] + "44" : "var(--border)"}` }}>
                    <span style={{ fontSize: 9, minWidth: 22, textTransform: "uppercase",
                      color: PHASE_COLOR[p.PHASE] }}>{p.POSITION}</span>
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden",
                      textOverflow: "ellipsis" }}>{p.PLAYER_NAME}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-faint)",
                      maxWidth: 110, whiteSpace: "nowrap", overflow: "hidden",
                      textOverflow: "ellipsis" }}>{p.primary_arch}</span>
                  </button>
                );
              })}
            </div>
          )}
          {msg && <div style={{ fontSize: 11.5, color: "#E8654C", marginTop: 8 }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}
