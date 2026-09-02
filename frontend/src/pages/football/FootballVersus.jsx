import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { api } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { playTie, tieOdds, buildSide } from "../../game/football/headToHead";
import { ModeInfoButton } from "../../game/football/ModeAbout";
import SameScreenDraft from "../../game/football/SameScreenDraft";
import RoomDraft from "../../game/football/RoomDraft";
import { UsersIcon, GlobeIcon, LinkIcon, CheckIcon, LoopIcon } from "../../game/GameIcons";
import "../../game/game.css";
import { ACCENT as ACC } from "../../game/football/theme";

// ── Kafa kafaya ──────────────────────────────────────────────────────────────
// Üç mod, iki farklı yol:
//   Same Screen — tek cihaz, sunucuya HİÇ gitmiyor. Draft de eleme de burada.
//   With a Friend / Online — iki ayrı cihaz. Oda açılıyor, herkes kendi XI'ini
//                 gönderiyor, eleme SUNUCUDA çözülüyor. Sonucu istemcide
//                 hesaplamak, oyuncunun kendi skorunu bildirmesi demek olurdu.
//
// Rakibin kadrosu, iki taraf da göndermeden görünmüyor — yoksa ikinci oyuncu
// birincininkine bakarak kurar.
//
// EKRAN DÜZENİ basketbolun SameScreenGame/WithAFriendGame'iyle aynı: geniş
// kolon, g-dock başlık barı, g-panel kutular. Önceden dar (max-w-3xl) bir
// sütunda düz paragraf + pill satırı vardı; sitenin geri kalanına benzemiyordu.

const RED = "#E8654C";
const MODE_META = {
  friend: { title: "With a Friend", sub: "2 devices · room code · two legs", Icon: UsersIcon },
  online: { title: "Online", sub: "2 devices · open room · two legs", Icon: GlobeIcon },
};

function Side({ label, side, color }) {
  if (!side) return null;
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150 }}>
      <div className="g-label">{label}</div>
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
    <div>
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

/* ── Same Screen: gerçek draft, sunucu yok ────────────────────────────────── */
// Önceden iki kaydırıcıyla soyut "kalite/kimya" giriliyordu — oynanacak bir şey
// yoktu. Artık basketboldaki gibi gerçek draft: yılan sırası, çark, slot
// yerleşimi (draft.js + SameScreenDraft.jsx), sonunda aynı eleme motoru.
function SameScreen({ coeffs }) {
  const [tie, setTie] = useState(null);
  const [odds, setOdds] = useState(null);

  const play = (sq) => {
    if (!coeffs) return;
    const a = buildSide(sq[1].name, sq[1].players, null, sq[1].positionPenalty);
    const b = buildSide(sq[2].name, sq[2].players, null, sq[2].positionPenalty);
    const t = playTie(coeffs, a, b);
    t.sides = { a, b };
    setTie(t);
    setOdds(tieOdds(coeffs, a, b, 400));
  };

  if (!tie) return <SameScreenDraft onDone={play} />;

  const aWon = tie.winner === "a";
  return (
    <div className="space-y-3">
      <div className="g-dock thin">
        <span className="aura-blob" style={{ "--slot-color": ACC, left: -30, top: -60,
          width: 220, height: 130, opacity: 0.22 }} />
        <div className="g-dock-left"><h1 className="g-dock-title">Tie Result</h1></div>
        <div className="g-dock-center">
          <span className="font-logo text-[13px] font-bold uppercase tracking-widest"
            style={{ color: ACC }}>
            {(aWon ? tie.sides?.a?.name : tie.sides?.b?.name)} go through
          </span>
        </div>
        <div className="g-dock-right">
          <button onClick={() => { setTie(null); setOdds(null); }}
            className="aura-rating-btn" style={{ padding: "9px 20px", fontSize: 12 }}>
            <LoopIcon size={14} /><span className="ml-2">New Draft</span>
          </button>
        </div>
      </div>

      <div className="g-panel p-4 max-w-3xl mx-auto"
        style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
        <span className="aura-blob" style={{ "--slot-color": ACC, left: "20%", top: -50,
          width: 260, height: 140, opacity: 0.14 }} />
        <TieResult tie={tie} odds={odds} />
      </div>
    </div>
  );
}

/* ── Oda: With a Friend / Online ───────────────────────────────────────────── */
function RoomPanel({ mode }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const poll = useRef(null);
  const M = MODE_META[mode] || MODE_META.friend;

  // Rakip kadrosunu gönderene kadar oda değişmiyor; kısa aralıklı yoklama
  // websocket kurmadan yeterli (oda içinde canlı draft henüz yok).
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

  const copy = () => {
    navigator.clipboard?.writeText(room.room_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  /* Odaya girilmemiş: dock + açıklama */
  if (!room) {
    return (
      <div className="space-y-3">
        <div className="g-dock">
          <span className="aura-blob" style={{ "--slot-color": ACC, left: -30, top: -70,
            width: 240, height: 150, opacity: 0.16 }} />
          <div className="g-dock-left">
            <h1 className="g-dock-title">{M.title}</h1>
            <p className="g-dock-sub">{M.sub}</p>
          </div>

          <div className="g-dock-center">
            {isLoggedIn ? (
              <button onClick={create} className="aura-rating-btn"
                style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em" }}>
                <M.Icon size={16} /><span className="ml-2">Open a Room</span>
              </button>
            ) : (
              <button onClick={() => navigate("/login")} className="aura-rating-btn"
                style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em" }}>
                Log In to Play
              </button>
            )}
          </div>

          <div className="g-dock-right">
            {isLoggedIn && (
              <div className="flex items-center gap-2">
                <input className="aura-ghost-input" placeholder="paste a code"
                  value={code} onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && code.trim().length >= 4 && join()}
                  style={{ width: 132, textTransform: "uppercase", letterSpacing: ".1em" }} />
                <button onClick={join} disabled={code.trim().length < 4}
                  className="aura-pill-btn" style={{ opacity: code.trim().length < 4 ? 0.4 : 1 }}>
                  Join
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="g-panel subtle p-4 max-w-3xl mx-auto">
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {mode === "friend"
              ? "Open a room and send the six-character code to whoever you want to play. "
              : "Open a room and wait, or paste a code you were given. "}
            Each of you builds an eleven and neither sees the other's until both have
            sent. The tie is played on the server, from player ids — quality and
            chemistry are computed there, with the same definitions the season panel
            uses. Working it out in the browser would amount to letting a player report
            their own score.
          </p>
          {!isLoggedIn && (
            <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>
              A room needs an account so the two devices can find each other.{" "}
              <Link to="/football/game/same-screen" style={{ color: ACC }}>Same Screen</Link>{" "}
              works without one.
            </p>
          )}
          {msg && <div className="text-xs mt-2" style={{ color: RED }}>{msg}</div>}
        </div>
      </div>
    );
  }

  /* Odaya girilmiş */
  // İki kişi de geldiyse ekranı DRAFT devralıyor: kendi dock'u oda kodunu,
  // bağlantı durumunu ve çıkışı zaten taşıyor. Buranın ikinci bir dock +
  // ikinci bir oyuncu kartı çifti çizmesi aynı bilgiyi iki kez göstermekti.
  const bothIn = Boolean(room.p2_name || room.p2_ready);
  if (bothIn) {
    return (
      <div className="space-y-3">
        <RoomDraft roomCode={room.room_code}
          onLeave={() => { setRoom(null); setCode(""); }}
          onResult={() => api.footballH2HRoom(room.room_code).then(setRoom).catch(() => {})} />
        {msg && <div className="text-xs text-center" style={{ color: RED }}>{msg}</div>}
      </div>
    );
  }

  // Tek başına bekliyor: kod büyük dursun, kopyalanabilsin.
  return (
    <div className="space-y-3">
      <div className="g-dock thin">
        <span className="aura-blob" style={{ "--slot-color": ACC, left: -30, top: -60,
          width: 220, height: 130, opacity: 0.2 }} />
        <div className="g-dock-left flex items-center gap-3">
          <h1 className="g-dock-title">{M.title}</h1>
          <span className="g-status" style={{ "--accent": "#9ca3af",
            "--accent-a": "rgba(156,163,175,.14)", "--accent-line": "rgba(156,163,175,.4)" }}>
            {room.status}
          </span>
        </div>
        <div className="g-dock-center">
          <div className="flex items-center gap-2">
            <span className="font-logo text-3xl font-black tracking-[0.2em]"
              style={{ color: ACC }}>{room.room_code}</span>
            <button onClick={copy} title="Copy code"
              className="w-8 h-8 flex items-center justify-center rounded-xl"
              style={{ color: "var(--text-muted)", border: "1px solid rgba(255,255,255,.12)" }}>
              {copied ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            </button>
          </div>
        </div>
        <div className="g-dock-right">
          <button onClick={() => { setRoom(null); setCode(""); }}
            className="aura-pill-btn">Leave</button>
        </div>
      </div>

      <p className="text-center text-xs animate-pulse" style={{ color: "var(--text-faint)" }}>
        {mode === "friend"
          ? "Send that code to whoever you want to play. The draft starts when they join."
          : "Waiting for an opponent. The draft starts when someone joins."}
      </p>
      {msg && <div className="text-xs text-center" style={{ color: RED }}>{msg}</div>}
    </div>
  );
}

// Her mod KENDİ rotasında (/football/game/same-screen, /friend, /online),
// basketboldaki gibi. Sekme yerine rota olmasının sebebi: mod seçim ekranından
// gelen kişi zaten modunu seçmiş oluyor, bir de sekmeyle tekrar seçtirmek
// gereksiz — ve tek bir /versus sayfası mod seçim kartlarından görünmüyordu.
export default function FootballVersus({ mode: fixedMode }) {
  // TÜRETİLMİŞ, state DEĞİL. Üç rota da bu bileşeni render ediyor, dolayısıyla
  // /same-screen'den /friend'e geçildiğinde React aynı örneği yeniden kullanıyor
  // ve useState(fixedMode) ilk mount'taki değerde donup kalıyordu — Same Screen'in
  // sonucu Friend rotasında ekranda kalıyordu.
  const [pickedMode, setPickedMode] = useState("same");
  const mode = fixedMode || pickedMode;
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

      <div className="relative p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-8">
        {/* Sabit moda gelindiyse mod seçtirme satırı YOK — kullanıcı modunu
            zaten mod seçim ekranında seçti. Yalnız kuralların ⓘ'si duruyor. */}
        {fixedMode ? (
          <div className="flex justify-end">
            <ModeInfoButton mode={fixedMode} />
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap items-center">
            {[["same", "Same screen"], ["friend", "With a friend"], ["online", "Online"]]
              .map(([k, label]) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <button onClick={() => setPickedMode(k)} className="aura-pill-btn"
                  style={mode === k ? { borderColor: ACC, color: ACC } : undefined}>{label}</button>
                <ModeInfoButton mode={k} />
              </span>
            ))}
          </div>
        )}

        {mode === "same" ? <SameScreen coeffs={coeffs} /> : <RoomPanel mode={mode} />}
      </div>
    </div>
  );
}
