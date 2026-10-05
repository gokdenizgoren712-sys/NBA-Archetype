import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { api } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { playTie, tieOdds, buildSide } from "../../game/football/headToHead";
import { ModeInfoButton } from "../../game/football/ModeAbout";
import SameScreenDraft from "../../game/football/SameScreenDraft";
import { FootballVersusHire, FootballVersusMatchup, FootballVersusLegs, FootballVersusFinal } from "../../game/ui/VersusFootball";
import { drawManagers } from "../../game/football/managers";
import { sideNumbers, roleCoverage, pillarsOf, legStats } from "../../game/football/versusFit";
import { PageGlow } from "../../components/states/States";
import RoomLobby from "../../game/RoomLobby";
import RoomDraft from "../../game/football/RoomDraft";
import { UsersIcon, GlobeIcon } from "../../game/GameIcons";
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

// ── Eleme sonucu (handoff 13b) ─────────────────────────────────────────────
// Tek büyük an: 96px toplam skor, iki taraf kendi renginde (A mavi, B kırmızı).
// Altında ayaklar, gerekiyorsa penaltı noktaları, en altta 400 tekrarlık
// olasılık çubuğu — tek elemenin bir hüküm değil bir örnek olduğunu gösteriyor.
const SIDE_A = "#60a5fa", SIDE_B = "#f87171";

function TieResult({ tie, odds }) {
  if (!tie) return null;
  const a = tie.sides?.a, b = tie.sides?.b;
  const aWon = tie.winner === "a";
  const winner = (aWon ? a?.name : b?.name) || (aWon ? "Side A" : "Side B");
  // Ayakları A–B yönüne çevir (2. ayakta ev sahibi B)
  const legs = [
    { l: "Leg 1", a: tie.legs[0].hg, b: tie.legs[0].ag, note: `at ${tie.legs[0].home}` },
    { l: "Leg 2", a: tie.legs[1].ag, b: tie.legs[1].hg, note: `at ${tie.legs[1].home}` },
    ...(tie.extraTime ? [{ l: "Extra time", a: tie.extraTime.ag, b: tie.extraTime.hg, note: `at ${tie.extraTime.host}` }] : []),
  ];
  const how = tie.decidedBy === "penalties"
    ? `After extra time · ${winner} win ${Math.max(tie.shootout.a, tie.shootout.b)}–${Math.min(tie.shootout.a, tie.shootout.b)} on penalties`
    : tie.decidedBy === "extra time" ? `${winner} go through after extra time`
    : `${winner} go through on aggregate`;
  const aPct = odds ? Math.round(odds.aWinPct * 100) : null;

  return (
    <div className="g-tie">
      <div className="g-tie-score">
        <div className="side a">
          <span className="tag" style={{ color: SIDE_A }}>Home first leg</span>
          <span className="nm">{a?.name}</span>
        </div>
        <div className="mid">
          <span className="lbl">Aggregate</span>
          <span className="agg">
            <b style={{ color: SIDE_A, textShadow: aWon ? `0 0 40px ${SIDE_A}99` : "none" }}>{tie.aggA}</b>
            <i> – </i>
            <b style={{ color: SIDE_B, textShadow: !aWon ? `0 0 40px ${SIDE_B}99` : "none" }}>{tie.aggB}</b>
          </span>
          <span className="how">{how}</span>
        </div>
        <div className="side b">
          <span className="tag" style={{ color: SIDE_B }}>Home second leg</span>
          <span className="nm">{b?.name}</span>
        </div>
      </div>

      <div className="g-tie-legs">
        {legs.map(l => (
          <div key={l.l}>
            <span className="lbl">{l.l}</span>
            <span className="sc"><b style={{ color: SIDE_A }}>{l.a}</b><i> – </i><b style={{ color: SIDE_B }}>{l.b}</b></span>
            <span className="note">{l.note}</span>
          </div>
        ))}
      </div>

      {tie.shootout && (
        <div className="g-tie-pens">
          <span className="lbl">Penalties{tie.shootout.kicks.some(k => k.sudden) ? " · sudden death" : ""}</span>
          {[["a", a?.name, SIDE_A], ["b", b?.name, SIDE_B]].map(([k, nm, c]) => (
            <div key={k} className="row">
              <span className="who" style={{ color: c }}>{nm}</span>
              {tie.shootout.kicks.map((kick, i) => (
                <span key={i} className={`dot${kick[k] ? " in" : ""}`} style={{ "--c": c }}
                  title={kick[k] ? "Scored" : "Missed"} />
              ))}
            </div>
          ))}
        </div>
      )}

      {odds && (
        <div className="g-tie-odds">
          <div className="head">
            <span>If this tie were replayed {odds.runs} times</span>
            <i>Squad fit decides the odds, not the result</i>
          </div>
          <div className="bar">
            <span style={{ width: `${aPct}%`, background: SIDE_A, boxShadow: `0 0 14px ${SIDE_A}` }} />
            <span style={{ width: `${100 - aPct}%`, background: SIDE_B, opacity: 0.8 }} />
          </div>
          <div className="foot">
            <b style={{ color: SIDE_A }}>{a?.name} · {aPct}%</b>
            <b style={{ color: SIDE_B }}>{100 - aPct}%</b>
          </div>
          <p>{Math.round(odds.penaltiesPct * 100)}% of replays reach penalties. Two matches decide very little
            in football — the tie above is one draw from that spread, not a verdict.</p>
        </div>
      )}
    </div>
  );
}

/* ── Same Screen: gerçek draft, sunucu yok ────────────────────────────────── */
// Önceden iki kaydırıcıyla soyut "kalite/kimya" giriliyordu — oynanacak bir şey
// yoktu. Artık basketboldaki gibi gerçek draft: yılan sırası, çark, slot
// yerleşimi (draft.js + SameScreenDraft.jsx), sonunda aynı eleme motoru.
function SameScreen({ coeffs }) {
  const [sq, setSq] = useState(null);                 // iki taraf: oyuncular, yedekler, dizilişler
  const [mgrs, setMgrs] = useState({ 1: null, 2: null });
  const [mgrOpts, setMgrOpts] = useState({ 1: [], 2: [] });
  const [stage, setStage] = useState("draft");        // draft | hire | matchup | legs | final
  const [cover, setCover] = useState({ 1: null, 2: null });
  const [covLoading, setCovLoading] = useState(false);
  const [tie, setTie] = useState(null);
  const [odds, setOdds] = useState(null);
  const [stats, setStats] = useState(null);
  const [shown, setShown] = useState(0);              // kaç ayak açıldı
  const [selLeg, setSelLeg] = useState(1);

  const names = sq ? { 1: sq[1].name, 2: sq[2].name } : null;
  const reset = () => { setSq(null); setMgrs({ 1: null, 2: null }); setMgrOpts({ 1: [], 2: [] }); setStage("draft"); setCover({ 1: null, 2: null }); setTie(null); setOdds(null); setStats(null); setShown(0); setSelLeg(1); };

  const onDraftDone = (squads) => { setSq(squads); setMgrOpts({ 1: drawManagers(4), 2: [] }); setStage("hire"); };
  const hire = (seat, m) => {
    const next = { ...mgrs, [seat]: m };
    setMgrs(next);
    if (seat === 1) { setMgrOpts((o) => ({ ...o, 2: drawManagers(4) })); return; }
    setStage("matchup"); setCovLoading(true);
    Promise.all([roleCoverage(sq[1]), roleCoverage(sq[2])]).then(([a, b]) => { setCover({ 1: a, 2: b }); setCovLoading(false); });
  };
  const numbers = sq ? { 1: sideNumbers(sq[1], mgrs[1]), 2: sideNumbers(sq[2], mgrs[2]) } : null;

  const playLeg1 = () => {
    if (!coeffs) return;
    const a = numbers[1].side, b = numbers[2].side;
    const t = playTie(coeffs, a, b);
    t.sides = { a, b };
    // Maç istatistiği: skor motordan, kimin attığı sezon verisinden. Ayak 1'de 1 ev sahibi, ayak 2'de 2.
    setStats({
      1: { 1: legStats(sq[1].players, t.legs[0].hg), 2: legStats(sq[2].players, t.legs[0].ag) },
      2: { 1: legStats(sq[1].players, t.legs[1].ag), 2: legStats(sq[2].players, t.legs[1].hg) },
    });
    setTie(t); setOdds(tieOdds(coeffs, a, b, 400)); setShown(1); setSelLeg(1); setStage("legs");
  };
  const playLeg2 = () => { setShown(2); setSelLeg(2); };

  if (stage === "draft") return <SameScreenDraft onDone={onDraftDone} />;
  if (stage === "hire") {
    const active = mgrs[1] ? 2 : 1;
    return <FootballVersusHire names={names} shapes={{ 1: sq[1].shape, 2: sq[2].shape }} active={active} options={mgrOpts} hired={mgrs} onHire={hire} />;
  }
  if (stage === "matchup") {
    return <FootballVersusMatchup names={names} squads={sq} managers={mgrs} numbers={numbers} coverage={cover}
      pillars={pillarsOf(cover[1], cover[2])} loading={covLoading || !coeffs} onPlay={playLeg1} />;
  }
  if (stage === "legs" && tie) {
    return <FootballVersusLegs tie={tie} odds={odds} names={names} shown={shown} stats={stats} selected={selLeg} onSelect={setSelLeg}
      onNext={playLeg2} onSeeResult={() => setStage("final")} />;
  }
  if (stage === "final" && tie) return <FootballVersusFinal tie={tie} names={names} squads={sq} managers={mgrs} onAgain={reset} />;
  return null;
}

/* ── Oda: With a Friend / Online ───────────────────────────────────────────── */
function RoomPanel({ mode }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [msg, setMsg] = useState("");
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

  /* Odaya girilmemiş: kompakt başlık (handoff 3a/14a kalıbı) + açıklama */
  if (!room) {
    return (
      <div className="relative">
        <PageGlow tint={ACC} />
        <header className="g-idle-hero compact">
          <div>
            <h1 className="g-wordmark lg">{M.title}</h1>
            <p>{M.sub}</p>
          </div>
          <div className="g-idle-actions">
            <div className="g-seg" role="tablist">
              {[["friend", "With a Friend"], ["online", "Online"]].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mode === k}
                  className={`g-seg-btn${mode === k ? " on" : ""}`}
                  onClick={() => mode !== k && navigate(`/football/game/${k}`)}>{l}</button>
              ))}
            </div>
            {isLoggedIn && (
              <div className="g-join">
                <input className="aura-ghost-input" placeholder="Room code" aria-label="Room code"
                  value={code} onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && code.trim().length >= 4 && join()} />
                <button onClick={join} disabled={code.trim().length < 4} className="pa-btn-secondary">Join</button>
              </div>
            )}
            {isLoggedIn ? (
              <button onClick={create} className="aura-rating-btn g-idle-cta">Open a room</button>
            ) : (
              <button onClick={() => navigate("/login")} className="aura-rating-btn g-idle-cta">Sign in to play</button>
            )}
          </div>
        </header>

        <div className="g-room-note">
          <p>
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
            <p>
              A room needs an account so the two devices can find each other.{" "}
              <Link to="/football/game/same-screen" style={{ color: ACC }}>Same Screen</Link>{" "}
              works without one.
            </p>
          )}
          {msg && <p style={{ color: RED }}>{msg}</p>}
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

  // Tek başına bekliyor: handoff 14a lobisi — kod tek büyük an.
  return (
    <RoomLobby
      wordmark={M.title} accent={ACC}
      modes={[{ key: "friend", label: "With a Friend", to: "/football/game/friend" },
              { key: "online", label: "Online", to: "/football/game/online" }]}
      activeMode={mode}
      kicker={mode === "friend" ? "Room code — send it to whoever you want to play" : "Room open — waiting for an opponent"}
      code={room.room_code}
      sub={mode === "friend" ? "The draft starts when they join." : "The draft starts when someone joins."}
      host={{ name: room.p1_name || "You", status: "Host · ready" }}
      opponent={null}
      waitingLabel="Waiting to join"
      rules={[
        { k: "Format", v: "Two legs" }, { k: "Ties", v: "Extra time, penalties" },
        { k: "Resolved", v: "On the server" }, { k: "Squads", v: "Hidden until both send" },
      ]}
      cta={{ label: "Leave room", secondary: true, onClick: () => { setRoom(null); setCode(""); } }}
    >
      {msg && <p style={{ color: RED, fontSize: 13, marginTop: 12 }}>{msg}</p>}
    </RoomLobby>
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

  // Same Screen kendi tam ekran sahnesini çiziyor (game/ui/VersusFootball): sayfa kabuğu yok, kurallar ⓘ'si köşede.
  if (fixedMode === "same") {
    return (
      <div className="h-full relative">
        <SEO title="Head to head — Football" description="Put two elevens against each other over two legs." path="/football/versus" noindex />
        <SameScreen coeffs={coeffs} />
        <div className="absolute top-3 right-4 z-10"><ModeInfoButton mode="same" /></div>
      </div>
    );
  }

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
