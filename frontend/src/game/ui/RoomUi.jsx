import { useRef, useState } from "react";
import { VersusFrame } from "./VersusUi";
import "./room.css";

// Oda ekranları (With a Friend / Online): giriş, kod paylaşımı, kurulum, durumlar.
// Saf sunum — ağ, WebSocket ve oda durumu sayfada kalır. Basketbol ve futbol aynı bileşenleri kullanır.

export function RoomStage({ sport, children }) {
  return <VersusFrame sport={sport}><div className="sb-room">{children}</div></VersusFrame>;
}

export function RoomHead({ eyebrow, title, accent }) {
  return (
    <header>
      <p className="sb-mono eyebrow">{eyebrow}</p>
      <h1>{title} {accent && <span className="sb-accent">{accent}</span>}</h1>
    </header>
  );
}

const clean = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** 6 haneli kod: yalnız gösterim. */
export function CodeTiles({ code, small, bad }) {
  const chars = (code || "").padEnd(6, " ").slice(0, 6).split("");
  return <div className={`sb-code${small ? " small" : ""}${bad ? " bad" : ""}`} aria-label={`Room code ${code}`}>{chars.map((c, i) => <span key={i}>{c.trim()}</span>)}</div>;
}

/** 6 haneli kod girişi: tek görünmez input + altı kutu (yapıştırma ve klavye çalışır). */
export function CodeInput({ value, onChange, onEnter }) {
  const ref = useRef(null);
  const chars = value.padEnd(6, " ").split("");
  return (
    <div className="sb-code-input" onClick={() => ref.current?.focus()}>
      <div className="sb-code" aria-hidden="true">{chars.map((c, i) => <span key={i} className={i === value.length ? "cur" : ""}>{c.trim()}</span>)}</div>
      <input ref={ref} value={value} aria-label="Room code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6}
        onChange={(e) => onChange(clean(e.target.value))} onKeyDown={(e) => e.key === "Enter" && onEnter?.()} />
    </div>
  );
}

export function RulesStrip({ children }) {
  return <div className="sb-room-strip"><span className="k">Room rules</span><b>{children}</b></div>;
}

/** Ev sahibi ve rakip koltuğu. opponent = null → açık koltuk. */
export function SeatCards({ host, opponent, waitingLabel = "Waiting to join" }) {
  const initial = (n) => (n || "?").trim()[0]?.toUpperCase();
  return (
    <div className="sb-room-seats">
      <div className="sb-seatcard s1">
        <span className="av">{initial(host.name)}</span>
        <div style={{ minWidth: 0 }}><span className="nm">{host.name}{host.tag && <small> · {host.tag}</small>}</span><span className="st">● {host.status || "Ready"}</span></div>
      </div>
      <span className="vs">VS</span>
      {opponent ? (
        <div className="sb-seatcard s2">
          <span className="av">{initial(opponent.name)}</span>
          <div style={{ minWidth: 0 }}><span className="nm">{opponent.name}{opponent.tag && <small> · {opponent.tag}</small>}</span><span className="st">● {opponent.status || "Joined"}</span></div>
        </div>
      ) : (
        <div className="sb-seatcard open">
          <span className="av">?</span>
          <div><span className="nm">Open seat</span><span className="st">{waitingLabel}</span></div>
        </div>
      )}
    </div>
  );
}

export function WaitLine({ children }) {
  return <div className="sb-room-wait" role="status"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{children}</div>;
}

// ── Oda kur / katıl (6n, 5o) ────────────────────────────────────────────────
export function RoomEntry({
  sport, modeLabel, wheelMode, onWheel, onCreate, creating, code, onCode, onJoin, joining, error, rulesLine, extra, hostText,
}) {
  return (
    <RoomStage sport={sport}>
      <RoomHead eyebrow={`${modeLabel}`} title="Create a room" accent="or join one" />
      <div className="sb-room-cards">
        <section className="sb-room-card hot">
          <h2>Host</h2>
          <p>{hostText || "Get a 6-character code, send it to your friend and pick the rules."}</p>
          {onWheel && <div className="sb-room-rule" role="radiogroup" aria-label="Wheel rule">
            {[{ key: "round", l: "Round", h: "1 spin / round" }, { key: "pick", l: "Pick", h: "1 spin / pick" }].map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={wheelMode === r.key} onClick={() => onWheel(r.key)}>{r.l}<i>{r.h}</i></button>
            ))}
          </div>}
          <span className="grow" />
          <button type="button" className="sb-btn solid" disabled={creating} onClick={onCreate}>{creating ? "Creating…" : "Create room"}</button>
        </section>
        <section className="sb-room-card">
          <h2>Join</h2>
          <p>Already have a code? Enter it here.</p>
          <CodeInput value={code} onChange={onCode} onEnter={onJoin} />
          <span className="grow" />
          <button type="button" className="sb-btn ghost" disabled={joining || code.length < 4} onClick={onJoin}>{joining ? "Joining…" : "Join room"}</button>
        </section>
      </div>
      {error && <p className="sb-room-err" role="alert">{error}</p>}
      <RulesStrip>{rulesLine}</RulesStrip>
      {extra}
    </RoomStage>
  );
}

/** Giriş yapılmamış: bulanık önizleme + giriş kartı (6a, 5a). */
export function RoomGate({ sport, title, onSignIn, onAlt, altLabel }) {
  return (
    <RoomStage sport={sport}>
      <div className="sb-room-gate">
        <div className="ghost" aria-hidden="true">
          <h1>{title}</h1><CodeTiles code="K7QX2M" /><CodeTiles code="" />
        </div>
        <section className="card">
          <p className="sb-mono eyebrow sb-accent" style={{ margin: 0 }}>Sign in required</p>
          <h2>Sign in to play {title.toLowerCase()}</h2>
          <p>Rooms need an account so your opponent knows who they are playing and your score lands on the leaderboard.</p>
          <button type="button" className="sb-btn solid" onClick={onSignIn}>Sign in</button>
          {onAlt && <button type="button" className="sb-btn ghost" onClick={onAlt}>{altLabel}</button>}
        </section>
      </div>
    </RoomStage>
  );
}

// ── Oda kuruldu: kodu paylaş (6o, 5p) ───────────────────────────────────────
export function RoomShare({ sport, modeLabel, code, kicker, host, opponent, rulesLine, sub, onLeave, inviteUrl }) {
  const [copied, setCopied] = useState(null);
  const copy = (what, text) => navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  return (
    <RoomStage sport={sport}>
      <RoomHead eyebrow={`${kicker || "Room created"} · ${modeLabel}`} title="Share the" accent="code" />
      <CodeTiles code={code} />
      <p className="lede" style={{ textAlign: "center" }} role="status">{sub}</p>
      <div className="sb-room-actions">
        <button type="button" className="sb-btn ghost" onClick={() => copy("code", code)}>{copied === "code" ? "Code copied" : "Copy code"}</button>
        {inviteUrl && <button type="button" className="sb-btn ghost" onClick={() => copy("link", inviteUrl)}>{copied === "link" ? "Link copied" : "Copy invite link"}</button>}
        {onLeave && <button type="button" className="sb-btn ghost" onClick={onLeave}>Leave room</button>}
      </div>
      <SeatCards host={host} opponent={opponent} />
      <RulesStrip>{rulesLine}</RulesStrip>
    </RoomStage>
  );
}

// ── Katıldı, kurulum: dönem seç (6r) ya da bekle (6q) ───────────────────────
export function RoomSetup({ sport, modeLabel, code, title, accent, host, opponent, rulesLine, eras, onPick, onRandom, canPick, waitText }) {
  return (
    <RoomStage sport={sport}>
      <RoomHead eyebrow={`Room ${code} · ${modeLabel}`} title={title} accent={accent} />
      <SeatCards host={host} opponent={opponent} />
      {canPick ? (
        <>
          <div className="sb-room-eras">
            {eras.map((e) => <button key={e.id} type="button" className="sb-room-era" onClick={() => onPick(e)}><b>{e.label}</b><span>{e.years}</span></button>)}
          </div>
          <div className="sb-room-foot">
            <span className="lede">Only the host picks. Your friend sees this live.</span>
            <button type="button" className="sb-btn ghost" onClick={onRandom}>Random</button>
          </div>
        </>
      ) : (
        <WaitLine>{waitText}</WaitLine>
      )}
      <RulesStrip>{rulesLine}</RulesStrip>
    </RoomStage>
  );
}

/** Durum kartı: bulunamadı / dolu / rakip ayrıldı / bağlantı koptu / yükleniyor (6i, 5j). */
export function RoomNotice({ sport, tone = "bad", kicker, title, text, code, actions = [] }) {
  return (
    <RoomStage sport={sport}>
      <section className={`sb-room-state ${tone}`} role="alert">
        <span className="k">{kicker}</span>
        <h2>{title}</h2>
        <p>{text}</p>
        {code && <CodeTiles code={code} small bad={tone === "bad"} />}
        {actions.length > 0 && (
          <div className="sb-room-actions" style={{ justifyContent: "flex-start" }}>
            {actions.map((a) => <button key={a.label} type="button" className={`sb-btn${a.solid ? " solid" : " ghost"}`} onClick={a.onClick}>{a.label}</button>)}
          </div>
        )}
      </section>
    </RoomStage>
  );
}

/** Oyun sırasında üstte duran ince uyarı: yeniden bağlanıyor, rakip koptu, hata. */
export function RoomBanner({ tone = "warn", children }) {
  return <div className={`sb-room-banner ${tone}`} role="status">{children}</div>;
}
