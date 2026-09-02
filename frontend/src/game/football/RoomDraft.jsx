import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useGameSocket } from "../../hooks/useGameSocket";
import SeatPanel, { SEAT_COLOR } from "./SeatPanel";
import Pitch from "./Pitch";
import InlineSpin from "../InlineSpin";
import { WheelIcon, LoopIcon, CheckIcon } from "../GameIcons";
import { SHAPE_KEYS, FORMATIONS } from "./formations";
import { canPlace } from "./positions";
import { LEAGUE_LABEL } from "./leagues";
import "../game.css";
import { ACCENT as ACC } from "./theme";

// ── Oda içi canlı draft (With a Friend / Online) ─────────────────────────────
// Same Screen'in ekranıyla AYNI parçaları kullanıyor (SeatPanel, Pitch,
// InlineSpin, g-dock) ama tek fark her şeyi belirliyor: burada durum bizim
// değil. Sıra kimde, çark neye düştü, seçim geçerli mi — hepsini sunucu
// söylüyor (api/football_ws.py), biz yalnız çiziyor ve niyet gönderiyoruz.
//
// Bu yüzden yerel bir "iyimser" güncelleme YOK: bir seçim gönderildiğinde
// ekran, sunucudan yeni durum gelene kadar olduğu gibi kalıyor. İyimser
// çizmek, sunucunun reddettiği bir seçimi bir an için olmuş gibi göstermek
// demek olurdu — ve iki cihazda o "bir an" ikisinde farklı görünür.

export default function RoomDraft({ roomCode, onResult, onLeave }) {
  const { token, user } = useAuth();
  const [state, setState] = useState(null);
  const [err, setErr] = useState("");
  const [pickingFor, setPickingFor] = useState(null);
  const [peerOn, setPeerOn] = useState(false);

  const onMessage = useCallback((m) => {
    if (m.type === "state") {
      setState(m);
      setErr("");
      setPickingFor(null);           // sunucu konuştu, bekleyen seçim düştü
      if (m.result) onResult?.(m.result);
    } else if (m.type === "error") {
      setErr(m.message || "That didn't work.");
      setPickingFor(null);
    } else if (m.type === "peer") {
      setPeerOn(true);
    } else if (m.type === "opponent_left") {
      setPeerOn(false);
    }
  }, [onResult]);

  const { connected, send, fatalError } = useGameSocket(
    roomCode ? `/ws/football/room/${roomCode}` : null, token, { onMessage });

  // Hangi koltuk biziz? Sunucu seats: {"1": user_id, "2": user_id} gönderiyor.
  const mySeat = useMemo(() => {
    if (!state?.seats || !user?.id) return null;
    return Number(Object.keys(state.seats).find(
      (s) => Number(state.seats[s]) === Number(user.id))) || null;
  }, [state, user]);

  if (fatalError) {
    return (
      <div className="g-panel p-4 max-w-lg mx-auto text-center space-y-2">
        <div className="g-label center" style={{ color: "#E8654C" }}>Can't join</div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{fatalError.message}</p>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="g-panel p-4 max-w-lg mx-auto text-center">
        <p className="text-xs animate-pulse" style={{ color: "var(--text-muted)" }}>
          {connected ? "Setting up the room…" : "Connecting…"}
        </p>
      </div>
    );
  }

  const theirSeat = mySeat === 1 ? 2 : 1;
  const active = state.activeSeat;
  const myTurn = active === mySeat;

  /* ── Kurulum: diziliş + hazır ───────────────────────────────────────── */
  if (state.stage === "setup") {
    const iAmReady = state.ready?.[String(mySeat)];
    const theyReady = state.ready?.[String(theirSeat)];
    return (
      <div className="space-y-3">
        <RoomDock state={state} connected={connected} peerOn={peerOn} mySeat={mySeat}
          roomCode={roomCode} onLeave={onLeave}>
          <button onClick={() => send({ type: "ready", ready: !iAmReady })}
            className="aura-rating-btn"
            style={{ padding: "13px 32px", fontSize: 13,
                     opacity: iAmReady ? 0.7 : 1 }}>
            {iAmReady ? <CheckIcon size={14} /> : <WheelIcon size={14} />}
            <span className="ml-2">{iAmReady ? "Ready — waiting" : "I'm Ready"}</span>
          </button>
        </RoomDock>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[mySeat, theirSeat].filter(Boolean).map((s) => {
            const mine = s === mySeat;
            return (
              <div key={s} className="g-panel p-4 space-y-3"
                style={{ "--accent": SEAT_COLOR[s], "--accent-line": SEAT_COLOR[s] + "55" }}>
                <span className="aura-blob" style={{ "--slot-color": SEAT_COLOR[s],
                  right: -24, top: -40, width: 190, height: 120, opacity: 0.18 }} />
                <div className="flex items-center justify-between gap-2">
                  <span className="g-label" style={{ color: SEAT_COLOR[s] }}>
                    {mine ? "You" : "Opponent"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider"
                    style={{ color: state.ready?.[String(s)] ? ACC : "var(--text-faint)" }}>
                    {state.ready?.[String(s)] ? "ready" : "choosing"}
                  </span>
                </div>

                {/* Rakibin dizilişini DEĞİŞTİREMEZSİN ama GÖRÜRSÜN — kimin neye
                    kurduğunu bilmek draftın parçası, gizlenecek bir şey değil. */}
                <div className="flex flex-wrap gap-1.5">
                  {SHAPE_KEYS.map((k) => (
                    <button key={k} disabled={!mine}
                      onClick={() => mine && send({ type: "shape", shape: k })}
                      className="aura-pill-btn"
                      style={{ fontSize: 11, padding: "5px 11px",
                        cursor: mine ? "pointer" : "default",
                        ...(state.shapes?.[String(s)] === k
                          ? { borderColor: SEAT_COLOR[s], color: SEAT_COLOR[s],
                              background: SEAT_COLOR[s] + "14" }
                          : { opacity: mine ? 1 : 0.25 }) }}>{k}</button>
                  ))}
                </div>

                <Pitch shape={state.shapes?.[String(s)] || "4-3-3"} squad={{}} />
              </div>
            );
          })}
        </div>

        {mySeat === 1 && (
          <div className="g-panel subtle p-4">
            <div className="g-label mb-2">Wheel — your call, you opened the room</div>
            <div className="g-seg" style={{ maxWidth: 420 }}>
              {[{ key: "round", Icon: WheelIcon, hex: "#60a5fa", label: "Round", hint: "1 spin / round" },
                { key: "pick", Icon: LoopIcon, hex: "#FFB11B", label: "Pick", hint: "1 spin / pick" }]
                .map(({ key, Icon, hex, label, hint }) => (
                <button key={key} onClick={() => send({ type: "wheel", wheelMode: key })}
                  className={`g-seg-btn${state.wheelMode === key ? " on" : ""}`}
                  style={{ "--accent": hex, "--accent-a": hex + "22", "--accent-line": hex + "66" }}>
                  <Icon size={14} /> {label}
                  <span className="opacity-55 font-normal tracking-normal normal-case">({hint})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!theyReady && (
          <p className="text-center text-xs" style={{ color: "var(--text-faint)" }}>
            The draft starts when you are both ready.
          </p>
        )}
        {err && <div className="text-center text-xs" style={{ color: "#E8654C" }}>{err}</div>}
      </div>
    );
  }

  /* ── Draft ──────────────────────────────────────────────────────────── */
  const pool = state.pool;
  const taken = new Set(state.takenIds || []);
  const mySquad = state.squads?.[String(mySeat)] || {};
  const myShape = state.shapes?.[String(mySeat)] || "4-3-3";
  const openSlots = pickingFor
    ? (FORMATIONS[myShape]?.slots || [])
        .filter((s) => !mySquad[s.id] && canPlace(pickingFor, s))
    : null;

  const choose = (p) => {
    if (!myTurn) return;
    const open = (FORMATIONS[myShape]?.slots || [])
      .filter((s) => !mySquad[s.id] && canPlace(p, s));
    if (open.length === 1) { send({ type: "pick", player_id: p.PLAYER_ID, slot: open[0].id }); return; }
    setPickingFor(p);
  };

  const canPickPlayer = (p) => myTurn && !taken.has(p.PLAYER_ID) &&
    (FORMATIONS[myShape]?.slots || []).some((s) => !mySquad[s.id] && canPlace(p, s));

  return (
    <div className="space-y-3">
      <RoomDock state={state} connected={connected} peerOn={peerOn} mySeat={mySeat}
        roomCode={roomCode} onLeave={onLeave} drafting />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[mySeat, theirSeat].filter(Boolean).map((s) => {
          const mine = s === mySeat;
          return (
            <SeatPanel key={s} seat={s} active={active === s}
              name={mine ? "You" : (state.names?.[String(s)] || "Opponent")}
              shape={state.shapes?.[String(s)] || "4-3-3"}
              squad={state.squads?.[String(s)] || {}}
              slots={FORMATIONS[state.shapes?.[String(s)] || "4-3-3"]?.slots || []}
              // Havuz listesi yalnız BİZE çiziliyor: rakibin sırasında liste
              // göstermek, tıklanamayan bir listeye bakmak demek.
              pool={mine && myTurn ? pool : null}
              spinning={mine && myTurn && !pool}
              pickingFor={mine ? pickingFor : null}
              canPick={canPickPlayer}
              openIds={mine && openSlots ? new Set(openSlots.map((x) => x.id)) : null}
              onChoose={choose}
              onPlace={(player, slotId) =>
                send({ type: "pick", player_id: player.PLAYER_ID, slot: slotId })}
              onCancel={() => setPickingFor(null)}
              msg={mine ? err : ""} />
          );
        })}
      </div>

      {!myTurn && state.stage === "drafting" && (
        <p className="text-center text-xs animate-pulse" style={{ color: "var(--text-faint)" }}>
          Waiting for {state.names?.[String(theirSeat)] || "your opponent"} to pick…
        </p>
      )}
    </div>
  );
}

/* ── Oda başlık barı ─────────────────────────────────────────────────────── */
function RoomDock({ state, connected, peerOn, mySeat, roomCode, onLeave, drafting, children }) {
  const teams = state.pool ? [state.pool.team] : ["—"];
  const seasons = state.pool ? [state.pool.season] : ["—"];
  const spinning = drafting && !state.pool;
  const active = state.activeSeat;
  const acc = SEAT_COLOR[active] || ACC;

  return (
    <div className={`g-dock${drafting ? " thin" : ""}`}>
      <span className="aura-blob" style={{ "--slot-color": acc, left: -30, top: -60,
        width: 220, height: 130, opacity: spinning ? 0.26 : 0.14 }} />

      <div className="g-dock-left flex items-center gap-3">
        <h1 className="g-dock-title">
          {drafting ? `Round ${state.round}` : (roomCode || state.room_code)}
        </h1>
        {/* Draft sırasında oda kodu başlıktan düşüyor ama kaybolmuyor —
            arkadaşına tekrar okuman gerekebilir. */}
        {drafting && (
          <span className="g-mono" style={{ color: "var(--text-faint)" }}>{roomCode}</span>
        )}
        <span className="g-status" style={{
          "--accent": connected && peerOn ? ACC : "#9ca3af",
          "--accent-a": (connected && peerOn ? ACC : "#9ca3af") + "22",
          "--accent-line": (connected && peerOn ? ACC : "#9ca3af") + "66" }}>
          {!connected ? "reconnecting" : peerOn ? "both here" : "opponent away"}
        </span>
      </div>

      <div className="g-dock-center">
        {children ? children : spinning ? (
          <div className="g-spin-row flex items-center gap-7">
            <InlineSpin items={teams} spinning label="Club" accent="#60a5fa" targetIdx={0} />
            <InlineSpin items={seasons} spinning label="Season" accent="#FFB11B" targetIdx={0} />
          </div>
        ) : (
          <span className="font-logo text-[12px] font-bold uppercase tracking-widest"
            style={{ color: acc }}>
            {active === mySeat ? "Your pick" : "Their pick"}
          </span>
        )}
      </div>

      <div className="g-dock-right flex items-center gap-3">
        {state.pool && (
          <div className="g-dock-team">
            <div className="tm">{state.pool.team}</div>
            <div className="yr">
              {LEAGUE_LABEL[state.pool.league] || state.pool.league} · {state.pool.season}
            </div>
          </div>
        )}
        {onLeave && (
          <button onClick={onLeave} className="aura-pill-btn"
            style={{ fontSize: 11 }}>Leave</button>
        )}
      </div>
    </div>
  );
}
