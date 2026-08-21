import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { api } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { playTie, tieOdds, buildSide } from "../../game/football/headToHead";
import { ModeInfoButton } from "../../game/football/ModeAbout";

// ── Kafa kafaya ──────────────────────────────────────────────────────────────
// TASLAK ARAYÜZ (kullanıcı kararı: altyapı tam, ön yüz iskelet).
//
// Üç mod, iki farklı yol:
//   Same Screen — tek cihaz, sunucuya HİÇ gitmiyor. İki kadro da burada,
//                 eleme headToHead.js ile tarayıcıda çözülüyor.
//   With a Friend / Online — iki ayrı cihaz. Oda açılıyor, herkes kendi
//                 XI'ini gönderiyor, eleme SUNUCUDA çözülüyor. Sonucu
//                 istemcide hesaplamak, oyuncunun kendi skorunu bildirmesi
//                 demek olurdu.
//
// Rakibin kadrosu, iki taraf da göndermeden görünmüyor — yoksa ikinci oyuncu
// birincininkine bakarak kurar.

const ACC = "#3FB08C";
const RED = "#E8654C";

function Side({ label, side, color }) {
  if (!side) return null;
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150 }}>
      <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em",
        color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{side.name}</div>
      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
        quality {Number(side.quality).toFixed(3)} · chemistry {Number(side.chemistry).toFixed(3)}
      </div>
    </div>
  );
}

function TieResult({ tie, odds }) {
  if (!tie) return null;
  const aWon = tie.winner === "a";
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Side label="Home first leg" side={tie.sides?.a} color={aWon ? ACC : "var(--text)"} />
        <Side label="Home second leg" side={tie.sides?.b} color={!aWon ? ACC : "var(--text)"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 14 }}>
        {tie.legs.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
            padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,.022)",
            border: "1px solid var(--border)" }}>
            <span style={{ fontSize: 10, color: "var(--text-faint)", width: 44 }}>
              LEG {i + 1}</span>
            <span style={{ flex: 1 }}>{l.home}</span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{l.hg}–{l.ag}</b>
            <span style={{ flex: 1, textAlign: "right" }}>{l.away}</span>
          </div>
        ))}
        {tie.extraTime && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", paddingLeft: 10 }}>
            Extra time at {tie.extraTime.host}: {tie.extraTime.hg}–{tie.extraTime.ag}
          </div>
        )}
        {tie.shootout && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", paddingLeft: 10 }}>
            Penalties {tie.shootout.a}–{tie.shootout.b}
            {tie.shootout.kicks.some(k => k.sudden) ? " (sudden death)" : ""}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10,
        background: `${ACC}0f`, border: `1px solid ${ACC}33` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {(aWon ? tie.sides?.a?.name : tie.sides?.b?.name) || (aWon ? "A" : "B")} go through
          {" "}<span style={{ color: ACC }}>{tie.aggA}–{tie.aggB}</span> on aggregate
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
          decided by {tie.decidedBy}
        </div>
      </div>

      {odds && (
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.7 }}>
          Over {odds.runs} replays the first side goes through{" "}
          <b style={{ color: "#fff" }}>{Math.round(odds.aWinPct * 100)}%</b> of the time.
          Two matches decide very little in football — the single tie above is one draw
          from that spread, not a verdict. {Math.round(odds.penaltiesPct * 100)}% of
          replays reach penalties.
        </p>
      )}
    </div>
  );
}

/* ── Same Screen: sunucu yok ───────────────────────────────────────────────── */
function SameScreen({ coeffs }) {
  const [a, setA] = useState({ name: "Player 1", quality: 0.68, chemistry: 0.66 });
  const [b, setB] = useState({ name: "Player 2", quality: 0.64, chemistry: 0.66 });
  const [tie, setTie] = useState(null);
  const [odds, setOdds] = useState(null);

  const run = () => {
    if (!coeffs) return;
    const t = playTie(coeffs, a, b);
    t.sides = { a, b };
    setTie(t);
    setOdds(tieOdds(coeffs, a, b, 400));
  };

  const field = (side, set, label) => (
    <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em",
        color: "var(--text-faint)" }}>{label}</div>
      <input className="aura-ghost-input" value={side.name}
        onChange={(e) => set({ ...side, name: e.target.value })} />
      {[["quality", "Quality", 0.25, 0.95], ["chemistry", "Chemistry", 0.3, 0.9]].map(
        ([k, lbl, min, max]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ width: 70, color: "var(--text-muted)" }}>{lbl}</span>
          <input type="range" min={min} max={max} step={0.005} value={side[k]}
            onChange={(e) => set({ ...side, [k]: parseFloat(e.target.value) })}
            style={{ flex: 1, accentColor: ACC }} />
          <span style={{ width: 40, textAlign: "right", color: ACC,
            fontVariantNumeric: "tabular-nums" }}>{side[k].toFixed(3)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Two squads on one device. Nothing is sent anywhere — the tie is played in your
        browser. Draft eleven in Spin &amp; Build first if you want real numbers; the
        sliders below stand in for a squad until then.
      </p>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14 }}>
        {field(a, setA, "Side A — hosts the first leg")}
        {field(b, setB, "Side B — hosts the second leg")}
      </div>
      <button onClick={run} disabled={!coeffs} className="aura-rating-btn"
        style={{ borderColor: ACC, color: ACC, marginTop: 14 }}>
        {tie ? "Play again" : "Play the tie"}
      </button>
      <TieResult tie={tie} odds={odds} />
    </div>
  );
}

/* ── Oda: With a Friend / Online ───────────────────────────────────────────── */
function RoomPanel({ mode }) {
  const { isLoggedIn } = useAuth();
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("");
  const poll = useRef(null);

  // Rakip kadrosunu gönderene kadar oda değişmiyor; kısa aralıklı yoklama
  // websocket kurmadan yeterli (bu bir taslak, canlı draft yok).
  useEffect(() => {
    clearInterval(poll.current);
    if (!room?.room_code || room.status === "resolved") return;
    poll.current = setInterval(() => {
      api.footballH2HRoom(room.room_code).then(setRoom).catch(() => {});
    }, 4000);
    return () => clearInterval(poll.current);
  }, [room?.room_code, room?.status]);

  const create = useCallback(() => {
    setMsg("");
    api.footballH2HCreate({ mode })
      .then((r) => api.footballH2HRoom(r.room_code))
      .then(setRoom)
      .catch((e) => setMsg(String(e.message || e)));
  }, [mode]);

  const join = useCallback(() => {
    setMsg("");
    api.footballH2HJoin(code.trim().toUpperCase())
      .then(setRoom)
      .catch((e) => setMsg(String(e.message || e)));
  }, [code]);

  if (!isLoggedIn) {
    return (
      <div className="g-panel subtle p-4" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        Log in to open or join a room. Same Screen works without an account.
      </div>
    );
  }

  return (
    <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
      {!room && (
        <>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            {mode === "friend"
              ? "Open a room and send the code to whoever you want to play."
              : "Open a room and wait, or paste a code you were given."}
            {" "}Each of you builds an eleven; neither sees the other's until both
            have sent. The tie is played on the server.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={create} className="aura-rating-btn"
              style={{ borderColor: ACC, color: ACC }}>Open a room</button>
            <input className="aura-ghost-input" placeholder="or paste a code"
              value={code} onChange={(e) => setCode(e.target.value)}
              style={{ width: 150, textTransform: "uppercase" }} />
            <button onClick={join} disabled={code.trim().length < 4}
              className="aura-pill-btn">Join</button>
          </div>
        </>
      )}

      {room && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".12em", color: ACC }}>
              {room.room_code}
            </span>
            <span className="g-status" style={{ "--accent": "#9ca3af",
              "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
              {room.status}
            </span>
            <button onClick={() => { setRoom(null); setCode(""); }}
              className="aura-pill-btn" style={{ marginLeft: "auto", fontSize: 11 }}>
              Leave
            </button>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
            {[["p1", room.p1_name, room.p1_ready], ["p2", room.p2_name, room.p2_ready]]
              .map(([slot, name, ready]) => (
              <div key={slot} style={{ flex: "1 1 150px", padding: "9px 11px", borderRadius: 10,
                background: ready ? `${ACC}0f` : "rgba(255,255,255,.022)",
                border: `1px solid ${ready ? ACC + "33" : "var(--border)"}` }}>
                <div style={{ fontSize: 9.5, textTransform: "uppercase",
                  letterSpacing: ".08em", color: "var(--text-faint)" }}>
                  {slot === room.you ? "You" : "Opponent"}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>
                  {name || (slot === "p2" && !room.p2_name ? "waiting…" : slot)}
                </div>
                <div style={{ fontSize: 11, color: ready ? ACC : "var(--text-faint)" }}>
                  {ready ? "squad sent" : "still building"}
                </div>
              </div>
            ))}
          </div>

          {!room.your_squad && (
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 12,
              lineHeight: 1.6 }}>
              Build an eleven in <Link to="/football/game" style={{ color: ACC }}>Spin
              &amp; Build</Link>, then send it here. (Submission from the game screen is
              not wired up yet — this panel is the infrastructure, not the finished flow.)
            </p>
          )}

          {room.result && <TieResult tie={room.result} odds={room.result.odds} />}
        </>
      )}

      {msg && <div style={{ fontSize: 11.5, color: RED, marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

export default function FootballVersus() {
  const [mode, setMode] = useState("same");
  const [coeffs, setCoeffs] = useState(null);

  useEffect(() => {
    api.footballSimSetup({})
      .then((d) => setCoeffs(d.available ? d.coeffs : null))
      .catch(() => setCoeffs(null));
  }, []);

  return (
    <div className="h-full overflow-y-auto relative">
      <SEO title="Head to head — Football"
        description="Put two elevens against each other over two legs."
        path="/football/versus" noindex />
      <div className="g-smoke" />

      <div className="relative max-w-3xl mx-auto p-5 pb-16">
        <h1 className="font-logo text-2xl font-bold text-white tracking-wide">Head to head</h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.7 }}>
          Two elevens, two legs, aggregate score. Level after both matches means extra
          time at the second leg's ground, then penalties. No away-goals rule — UEFA
          dropped it in 2021. The match engine is the same one the season simulation
          uses, with the same coefficients fitted on real matches.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {[["same", "Same screen"], ["friend", "With a friend"], ["online", "Online"]]
            .map(([k, label]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <button onClick={() => setMode(k)} className="aura-pill-btn"
                style={mode === k ? { borderColor: ACC, color: ACC } : undefined}>{label}</button>
              <ModeInfoButton mode={k} />
            </span>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {mode === "same" ? <SameScreen coeffs={coeffs} /> : <RoomPanel mode={mode} />}
        </div>

        <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 18, lineHeight: 1.7 }}>
          Draft note: this page is the plumbing. Same Screen is playable now; the room
          modes create, join and resolve correctly, but sending a squad straight from
          Spin &amp; Build still has to be wired to them.
        </p>
      </div>
    </div>
  );
}
