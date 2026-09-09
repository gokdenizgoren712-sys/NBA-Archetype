/* Companion — ekran 5a (maç öncesi) ve 5b (canlı).
 *
 * Watchalong sekmesi EMEKLİ. Aynı oda, ama artık maç durumuna göre iki farklı
 * yüzü var ve rozeti de onunla değişiyor: katılım sayısı → LIVE → hiçbir şey.
 *
 * Nabız SAĞLAYICININ momentum'u değil. FotMob aynı yanıtta momentum
 * gönderiyor ama 5b'nin CROWD PULSE'ı izleyenlerin o an verdiği okuma —
 * ikisini karıştırmak "kalabalığın nabzı"nı bir istatistiğe çevirir.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Flame } from "lucide-react";
import { rankitApi, rankitSocketUrl } from "../rankitApi";
import { RAMP, NAMES, inkFor } from "./heat";

const INK_3 = "#9aa0a6";
const INK_4 = "#7f868b";
const GREEN = "#3fb08c";
// DESIGN.md `line` token'i — tek kenarlik rengi, 1px.
const LINE = "rgba(255,255,255,.09)";

/* Maça kalan süre. 5a "KICKS OFF IN 24:18" gösteriyor — dakika:saniye. */
function useCountdown(startsAt) {
  const target = useMemo(() => (startsAt ? new Date(startsAt).getTime() : 0), [startsAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const left = Math.max(0, target - now);
  if (left <= 0) return null;
  const total = Math.floor(left / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* Zaman çizelgesi (5b). Beşer dakikalık kovalar, ısı rampasıyla renklenmiş.
   Etiketler maçın kendi anları: KO / 30' / HT / 60' / şu an. */
function PulseTimeline({ timeline = [], minute }) {
  if (!timeline.length) return null;
  const max = 5;
  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 46 }}>
        {timeline.map((b) => (
          <div key={b.bucket} title={`${b.bucket}' · ${b.value}`}
            style={{
              flex: 1, minWidth: 0,
              height: `${Math.max(6, (b.value / max) * 100)}%`,
              borderRadius: 2, background: inkFor(b.value),
            }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {["KO", "30'", "HT", "60'", minute ? `${minute}'` : "NOW"].map((t) => (
          <span key={t} style={{ font: "700 9px Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: INK_4 }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/* YOUR LIVE READ — COLD ←→ HOT. Renk tek başına anlam taşımıyor (§1):
   seçilen basamağın adı ve sayısı yanında yazıyor. */
function LiveRead({ value, onChange, disabled }) {
  return (
    <div style={{ marginTop: 13 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ font: "700 9px Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: INK_4 }}>YOUR LIVE READ</span>
        <strong style={{ font: "700 13px Rajdhani,system-ui,sans-serif", color: inkFor(value) }}>
          {value ? `${NAMES[Math.round(value) - 1]} ${value.toFixed(1)}` : "—"}
        </strong>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {[1, 2, 3, 4, 5].map((step) => {
          const on = Math.round(value) >= step;
          return (
            <button key={step} type="button" disabled={disabled}
              onClick={() => onChange(step)}
              aria-label={`${NAMES[step - 1]} — ${step} of 5`}
              aria-pressed={Math.round(value) === step}
              style={{
                flex: 1, minWidth: 0, height: 44, borderRadius: 10,
                border: `1px solid ${on ? RAMP[step - 1] : LINE}`,
                background: on ? `${RAMP[step - 1]}22` : "transparent",
                color: on ? RAMP[step - 1] : INK_4,
                font: "700 9px Rajdhani,system-ui,sans-serif", letterSpacing: ".1em",
                cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
              }}>
              {NAMES[step - 1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CompanionPanel({ matchId, isLoggedIn = true }) {
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  // Soket state DEGIL ref: efekt icinde setState fazladan bir render turu
  // ve React'in onerdigi yol degil (react-hooks/set-state-in-effect).
  const socketRef = useRef(null);

  const load = useCallback(() => {
    rankitApi.companion(matchId).then(setState).catch(() => setState(null));
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  // Canlı maçta durum kendi kendine tazelenir; nabız akan bir sayı.
  useEffect(() => {
    if (state?.status !== "live") return undefined;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [state?.status, load]);

  useEffect(() => {
    rankitApi.watchalong(matchId).then((d) => setMessages(d.messages || [])).catch(() => {});
    if (!isLoggedIn) return undefined;
    let ws;
    try {
      const token = localStorage.getItem("nba_arch_token") || "";
      ws = new WebSocket(rankitSocketUrl(`/api/rankit/ws/watchalong/${matchId}?token=${encodeURIComponent(token)}`));
    } catch { return undefined; }
    socketRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) setMessages((v) => [...v, data.message]);
      } catch { /* bicimsiz kare */ }
    };
    return () => { socketRef.current = null; ws.close(); };
  }, [matchId, isLoggedIn]);

  const send = () => {
    const text = draft.trim();
    if (!text || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ content: text }));
    setDraft("");
  };

  const setRead = async (step) => {
    if (!state?.live_read_open) return;
    const minute = state.minute ?? 0;
    try {
      await rankitApi.pulse(matchId, step, minute);
      load();
    } catch { /* canli degilse sunucu 409 doner, sessizce yok say */ }
  };

  const countdown = useCountdown(state?.starts_at);
  const live = state?.status === "live";
  const pulse = state?.pulse?.value;

  if (!state) return <div className="ri-entity-loading">Loading…</div>;

  return (
    <div className="ri-companion">
      {/* ── 5a: maç öncesi ────────────────────────────────────────────── */}
      {!live && state.status === "upcoming" && (
        <>
          <div className="ri-companion-card">
            <span>KICKS OFF IN</span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{countdown || "—"}</strong>
            <small>{state.joined} joining{state.joined ? "" : " yet"}</small>
          </div>
          <p className="ri-companion-note">
            Live rating opens at kick-off. Your stars still wait for full time.
          </p>
        </>
      )}

      {/* ── 5b: canlı ─────────────────────────────────────────────────── */}
      {live && (
        <>
          <div className="ri-pulse-head">
            <div>
              <span>CROWD PULSE</span>
              <strong style={{ color: inkFor(pulse) }}>{pulse ?? "—"}</strong>
            </div>
            <small>{state.pulse.reads} reading{state.pulse.reads === 1 ? "" : "s"}</small>
          </div>
          <PulseTimeline timeline={state.pulse.timeline} minute={state.minute} />
          <LiveRead value={state.my_read?.value || 0} onChange={setRead} disabled={!isLoggedIn} />
        </>
      )}

      {/* MOMENTS — sağlayıcıdan gelen gol ve kartlar. */}
      {!!state.moments?.length && (
        <div className="ri-moments">
          <div className="ri-chip-title">MOMENTS <span>{state.moments.length}</span></div>
          {state.moments.map((m) => (
            <div key={m.id} className="ri-moment">
              <b>{m.minute}&apos;</b>
              <span>{m.label}</span>
              {!!m.marks && <em><Flame size={11} /> {m.marks}</em>}
            </div>
          ))}
        </div>
      )}

      {/* Sohbet: maç öncesi "TALK BEFORE THE WHISTLE", canlıda "LIVE CHAT". */}
      {/* Uc durum, iki degil: mac oncesi / canli / bitmis. Bitmis bir maca
          "whistle'dan once konus" demek yanlis — 5a'nin metni yalnizca
          oynanmamis mac icin. */}
      <div className="ri-chip-title" style={{ marginTop: 18 }}>
        {live ? "LIVE CHAT" : state.status === "upcoming" ? "TALK BEFORE THE WHISTLE" : "AFTER THE WHISTLE"}
        <span style={{ color: connected ? GREEN : INK_4 }}>{connected ? "ON" : "—"}</span>
      </div>
      <div className="ri-chat-log">
        {messages.map((m) => (
          <p key={m.id}><strong>@{m.username}</strong><span>{m.content}</span></p>
        ))}
        {!messages.length && (
          <span style={{ fontSize: 11, color: INK_3 }}>
            {live ? "Nobody has said anything yet."
              : state.status === "upcoming" ? "Be the first before the whistle."
              : "Nobody talked through this one."}
          </span>
        )}
      </div>
      {isLoggedIn ? (
        <div className="ri-chat-compose">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="Message the companion room"
            placeholder={live ? "Say something about the match" : state.status === "upcoming" ? "Say something before kick-off" : "Say something about it"} />
          <button onClick={send} disabled={!connected || !draft.trim()} aria-label="Send"><Send size={15} /></button>
        </div>
      ) : (
        <p className="ri-companion-note">Sign in to join the room.</p>
      )}
    </div>
  );
}

