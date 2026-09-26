/* Companion — ekran 5a (maç öncesi), 5b (canlı) ve 6d (maç sonu).
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
import { SkeletonRows, Loading, ErrorState } from "./States";
import { RAMP, NAMES, inkFor } from "./heat";
import { companionMinute, measuredPulse, measuredRise } from "./companionView";
import { mergeThreadMessages, threadPageCursor } from "./threadPages";
import ContentActions from "./ContentActions";
import { useBlockedAuthors } from "./blockedAuthors";

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

/* 5b / 6d: yalnız ölçülmüş beşer dakikalık kovaları çiz. Eksik veya eşik
   altındaki aralıkları birleştirmek uydurma bir nabız eğrisi üretir. */
function PulseTimeline({ timeline = [], minute, sport = "Football", minimum = 20, finished = false }) {
  if (!timeline.length) return null;
  const buckets = timeline.map((bucket) => ({
    bucket: Number(bucket.bucket),
    value: measuredPulse(bucket.value, bucket.reads, minimum),
    reads: bucket.reads ?? 0,
  })).filter((bucket) => Number.isFinite(bucket.bucket));
  if (!buckets.length) return null;
  const first = buckets[0].bucket;
  const span = Math.max(5, buckets[buckets.length - 1].bucket - first);
  const x = (bucket) => 8 + ((bucket.bucket - first) / span) * 304;
  const y = (value) => 74 - ((value - 1) / 4) * 64;
  const measured = buckets.filter((bucket) => bucket.value !== null);
  return (
    <div style={{ marginTop: 11 }}>
      {measured.length > 0 ? <svg viewBox="0 0 320 84" preserveAspectRatio="none" role="img"
        aria-label={`Crowd pulse: ${measured.length} measured points, from ${measured[0].value.toFixed(1)} to ${measured[measured.length - 1].value.toFixed(1)} out of five`}
        style={{ width: "100%", height: 84, display: "block", overflow: "visible" }}>
        {buckets.slice(1).map((bucket, index) => {
          const previous = buckets[index];
          if (previous.value === null || bucket.value === null || bucket.bucket - previous.bucket !== 5) return null;
          return <line key={`${previous.bucket}-${bucket.bucket}`} x1={x(previous)} y1={y(previous.value)} x2={x(bucket)} y2={y(bucket.value)} stroke={inkFor(bucket.value)} strokeWidth="2.5" strokeLinecap="round" />;
        })}
        {measured.map((bucket) => <circle key={bucket.bucket} cx={x(bucket)} cy={y(bucket.value)} r="3.5" fill={inkFor(bucket.value)}>
          <title>{companionMinute(bucket.bucket, sport)} · {bucket.value.toFixed(1)} from {bucket.reads} reads</title>
        </circle>)}
      </svg> : <p className="ri-companion-note">No measured pulse yet.</p>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {(sport === "Basketball" ? ["TIP-OFF", ...[.25,.5,.75].map(part => companionMinute(buckets[Math.floor((buckets.length-1)*part)].bucket, sport)), finished ? "FT" : companionMinute(minute, sport) || "NOW"] : ["KO", "30'", "HT", "60'", finished ? "FT" : companionMinute(minute, sport) || "NOW"]).map((t,i) => (
          <span key={i} style={{ font: "700 9px Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: INK_4 }}>{t}</span>
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

export default function CompanionPanel({ matchId, isLoggedIn = true, rated = false, onRate, onStateChange, sport = "Football" }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [sendNotice, setSendNotice] = useState("");
  const [sending, setSending] = useState(false);
  const pendingRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const isBlocked = useBlockedAuthors();
  const [archiveCursor, setArchiveCursor] = useState(null);
  const [archiveHasMore, setArchiveHasMore] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  // Soket state DEGIL ref: efekt icinde setState fazladan bir render turu
  // ve React'in onerdigi yol degil (react-hooks/set-state-in-effect).
  const socketRef = useRef(null);

  const load = useCallback(() => {
    rankitApi.companion(matchId).then(data => {setState(data);onStateChange?.(data);setError(null);}).catch(setError);
  }, [matchId, onStateChange]);

  useEffect(() => { load(); }, [load]);

  // Canlı maçta durum kendi kendine tazelenir; nabız akan bir sayı.
  useEffect(() => {
    if (!["upcoming", "live"].includes(state?.status)) return undefined;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [state?.status, load]);

  useEffect(() => {
    let active = true;
    setMessages([]);
    setArchiveCursor(null);
    setArchiveHasMore(null);
    setArchiveError("");
    rankitApi.watchalong(matchId).then((page) => {
      if (!active) return;
      setMessages((current) => mergeThreadMessages(page.messages || [], current));
      setArchiveCursor(threadPageCursor(page));
      setArchiveHasMore(typeof page.has_more === "boolean" ? page.has_more : null);
    }).catch(() => { if (active) setArchiveError("The thread could not be loaded."); });
    return () => { active = false; };
  }, [matchId]);

  useEffect(() => {
    if (!isLoggedIn || !joinedRoom || !["upcoming", "live"].includes(state?.status) || state?.room_open === false) return undefined;
    let active = true;
    let retryTimer;
    let ws;
    const connect = () => {
    try {
      const token = localStorage.getItem("nba_arch_token") || "";
      ws = new WebSocket(rankitSocketUrl(`/api/rankit/ws/watchalong/${matchId}?token=${encodeURIComponent(token)}`));
    } catch { return undefined; }
    socketRef.current = ws;
    ws.onopen = () => { setConnected(true); load(); };
    ws.onclose = () => {setConnected(false);if(active) retryTimer = setTimeout(connect, 5000);};
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) setMessages((v) => mergeThreadMessages(v, [data.message]));
        if (data.client_id && data.client_id === pendingRef.current?.id) {
          const sentText = pendingRef.current.text;
          clearTimeout(pendingRef.current.timer);
          if (data.message) setDraft(value => value === sentText ? "" : value);
          setSending(false); setSendNotice(data.error || ""); pendingRef.current = null;
        }
      } catch { /* bicimsiz kare */ }
    };
    };
    connect();
    return () => {active=false;clearTimeout(retryTimer);clearTimeout(pendingRef.current?.timer);socketRef.current = null;ws?.close();};
  }, [matchId, isLoggedIn, joinedRoom, state?.status, state?.room_open, load]);

  const loadEarlier = async () => {
    if (!threadOpen || archiveHasMore !== true || archiveCursor == null || archiveLoading) return;
    setArchiveLoading(true);
    setArchiveError("");
    try {
      const page = await rankitApi.watchalong(matchId, "community", archiveCursor);
      setMessages((current) => mergeThreadMessages(page.messages || [], current));
      setArchiveCursor(threadPageCursor(page));
      setArchiveHasMore(page.has_more === true);
    } catch {
      setArchiveError("Older messages could not be loaded. Try again.");
    } finally {
      setArchiveLoading(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || sending || !joinedRoom || state?.room_open === false || !["upcoming", "live"].includes(state?.status) || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    setSending(true);setSendNotice("");
    pendingRef.current = {id,text,timer:setTimeout(()=>{setSending(false);setSendNotice("Delivery was not confirmed. Check the room before sending again; your text is still here.");},8000)};
    socketRef.current.send(JSON.stringify({ content: text, client_id: id }));
  };

  const setRead = async (step) => {
    if (!state?.live_read_open) return;
    try {
      await rankitApi.pulse(matchId, step);
      load();
    } catch { /* canli degilse sunucu 409 doner, sessizce yok say */ }
  };

  const countdown = useCountdown(state?.starts_at);
  const live = state?.status === "live";
  const pulse = measuredPulse(state?.pulse?.value, state?.pulse?.reads, state?.pulse?.min_reads);
  const roomOpen = state?.room_open ?? ["upcoming", "live"].includes(state?.status);

  if (!state) return error ? <ErrorState error={error} onRetry={load}/> : <Loading label="Loading the companion"><SkeletonRows count={2} height={88}/></Loading>;

  return (
    <div className="ri-companion">
      {error && <ErrorState error={error} onRetry={load}/>}
      {state.status === "finished" && <>
        <section className="ri-companion-night">
          <div className="ri-companion-night-head"><span>THE NIGHT, IN FULL</span><strong style={{ color: inkFor(pulse) }}>{pulse === null ? "—" : pulse.toFixed(1)}</strong></div>
          <PulseTimeline timeline={state.pulse?.timeline || []} sport={sport} minimum={state.pulse?.min_reads ?? 20} finished />
          {pulse !== null && <p className="ri-companion-read-count">{state.pulse?.reads ?? 0} live reads</p>}
          {pulse === null && <p className="ri-companion-note">{state.pulse?.reads ?? 0} live reads · Too few readings for a crowd pulse.</p>}
        </section>
        <div className="ri-companion-record" style={sport === "Basketball" ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : undefined}>
          <div><strong>{state.record?.peak?.minute != null ? companionMinute(state.record.peak.minute, sport) : "—"}</strong><span>Loudest{state.record?.peak?.reads != null && <small>{state.record.peak.reads} reads</small>}</span></div>
          {sport === "Football" && <div><strong>{measuredRise(state.record?.rise_from_ht)}</strong><span>Pulse rise<small>from HT</small></span></div>}
          <div><strong>{state.record?.messages ?? "—"}</strong><span>Messages<small>kept</small></span></div>
        </div>
        <section className="ri-companion-closed">
          <strong>ROOM CLOSED AT FULL TIME</strong>
          {/* Tahtanin (6d) kendi cumlesi: NEDENINI de soyluyor. Duz bir
              "read-only" tekrari urunun sesini dusuruyordu. */}
          <p>The thread stays. You can read every message from tonight, but nobody can
            add to it — a watchalong is the match, not a group chat that outlives it.</p>
          <span>{state.record?.attendance != null ? `${state.record.attendance} were in the room` : "Attendance not measured"}</span>
          <button type="button" aria-expanded={threadOpen} onClick={() => setThreadOpen(value => !value)}>{threadOpen ? "Hide the thread" : `Read the thread${state.record?.messages != null ? ` · ${state.record.messages}` : ""}`}</button>
        </section>
        {onRate && <div className="ri-companion-finish-action">
          <button className="ri-review-cta" onClick={()=>onRate(state.my_read?.value || 0)}>{rated ? "View your entry" : state.my_read?.value ? `Rate it — your live read was ${Number(state.my_read.value).toFixed(1)}` : "Rate this match"}</button>
          {!rated && <p>Your live read is a starting point, not your rating. Nothing is logged until you confirm.</p>}
        </div>}
      </>}
      {/* ── 5a: maç öncesi ────────────────────────────────────────────── */}
      {!live && state.status === "upcoming" && (
        <>
          <div className="ri-companion-card">
            <span>KICKS OFF IN</span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{countdown || "—"}</strong>
            <small>{state.joined} joining{state.joined ? "" : " yet"}</small>
          </div>
          <div className="ri-companion-join">
            <div><strong>{state.joined} joining</strong><span>{state.joined_following == null ? "Following attendance unavailable" : `${state.joined_following} you follow`}</span></div>
            {isLoggedIn && <button type="button" disabled={connected} onClick={() => setJoinedRoom(true)}>{connected ? "Joined" : joinedRoom ? "Joining…" : "Join"}</button>}
          </div>
          <p className="ri-companion-note">
            Live rating opens at kick-off. Your stars still wait for full time.
          </p>
        </>
      )}

      {/* ── 5b: canlı ─────────────────────────────────────────────────── */}
      {live && (
        <>
          <div className="ri-companion-night">
            <div className="ri-companion-night-head"><span>CROWD PULSE</span><strong style={{ color: inkFor(pulse) }}>{pulse === null ? "—" : pulse.toFixed(1)}</strong></div>
            <PulseTimeline timeline={state.pulse?.timeline || []} minute={state.minute} sport={sport} minimum={state.pulse?.min_reads ?? 20} />
            <p className="ri-companion-read-count">{state.pulse?.reads ?? 0} reading{state.pulse?.reads === 1 ? "" : "s"}{pulse === null ? ` · ${state.pulse?.min_reads ?? 20} needed for a crowd pulse` : ""}</p>
          </div>
          <div className="ri-companion-join"><div><strong>Live chat</strong><span>{state.in_room == null ? "Room size unavailable" : `${state.in_room} in the room`}</span></div>{isLoggedIn && <button type="button" disabled={connected} onClick={() => setJoinedRoom(true)}>{connected ? "Open" : joinedRoom ? "Joining…" : "Join"}</button>}</div>
          <LiveRead value={state.my_read?.value || 0} onChange={setRead} disabled={!isLoggedIn} />
        </>
      )}

      {/* MOMENTS — sağlayıcıdan gelen gol ve kartlar. */}
      {live && !!state.moments?.length && (
        <div className="ri-moments">
          <div className="ri-chip-title">MOMENTS <span>{state.moments.length}</span></div>
          {state.moments.map((m, index) => (
            <div key={m.id ?? `${m.minute}-${m.label}-${index}`} className="ri-moment">
              <b>{companionMinute(m.minute, sport)}</b>
              <span>{m.label}{m.pulse_delta != null && <small>Pulse {measuredRise(m.pulse_delta)}</small>}</span>
              {!!m.marks && <em><Flame size={11} /> {m.marks} marked this</em>}
            </div>
          ))}
        </div>
      )}

      {/* Sohbet: maç öncesi "TALK BEFORE THE WHISTLE", canlıda "LIVE CHAT". */}
      {/* Uc durum, iki degil: mac oncesi / canli / bitmis. Bitmis bir maca
          "whistle'dan once konus" demek yanlis — 5a'nin metni yalnizca
          oynanmamis mac icin. */}
      {(roomOpen || threadOpen) && <><div className="ri-chip-title" style={{ marginTop: 18 }}>
        {live ? "LIVE CHAT" : state.status === "upcoming" ? "TALK BEFORE THE WHISTLE" : "AFTER THE WHISTLE"}
        <span style={{ color: connected ? GREEN : INK_4 }}>{roomOpen ? connected ? "ON" : joinedRoom ? "RECONNECTING" : "JOIN TO CHAT" : "CLOSED"}</span>
      </div>
      {!roomOpen && threadOpen && archiveHasMore === true && <button type="button" className="ri-thread-older"
        onClick={loadEarlier} disabled={archiveLoading || archiveCursor == null} aria-busy={archiveLoading}>
        {archiveLoading ? "Loading earlier messages…" : "Load earlier messages"}
      </button>}
      <div className="ri-chat-log">
        {/* Engel sunucuda da suzuluyor; bu, ekrandaki mesajlari aninda kaldirir. */}
        {messages.filter((m) => !isBlocked(m.user_id)).map((m) => (
          <p key={m.id}>
            <ContentActions type="message" id={m.id} author={{ id: m.user_id, username: m.username }} />
            <strong>@{m.username}</strong><span>{m.content}</span>
          </p>
        ))}
        {!messages.length && (
          <span style={{ fontSize: 11, color: INK_3 }}>
            {live ? "Nobody has said anything yet."
              : state.status === "upcoming" ? "Be the first before the whistle."
              : "Nobody talked through this one."}
          </span>
        )}
      </div>
      {!roomOpen && threadOpen && archiveHasMore === null && state.record?.messages > messages.length && <p className="ri-companion-note">Only the latest {messages.length} messages are available from this server.</p>}
      {archiveError && <p role="alert" className="ri-companion-note">{archiveError}</p>}
      {sendNotice && <p role="status">{sendNotice}</p>}
      {isLoggedIn && joinedRoom && roomOpen ? (
        <div className="ri-chat-compose">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="Message the companion room"
            placeholder={live ? "Say something about the match" : state.status === "upcoming" ? "Say something before kick-off" : "Say something about it"} />
          <button onClick={send} disabled={!connected || sending || !draft.trim()} aria-label="Send"><Send size={15} /></button>
        </div>
      ) : !isLoggedIn && roomOpen && (
        <p className="ri-companion-note">Sign in to join the room.</p>
      )}</>}
    </div>
  );
}

