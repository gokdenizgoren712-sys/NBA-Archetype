import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageGlow } from "../components/states/States";
import "./game.css";

// ── Lobi (handoff 14a) ─────────────────────────────────────────────────────
// Oda kodu 112px (tek büyük an), kopyala düğmeleri, VS ızgarası: ev sahibi
// kartı · "VS" · rakip yuvası (katılınca kırmızı yanar), kurallar satırı.
// Üstte With a Friend / Online segmenti — iki mod aynı lobinin iki hali.
//
// modes: [{ key, label, to }] · rules: [{ k, v }]
export default function RoomLobby({
  wordmark, modes = [], activeMode, kicker, big, sub, code, inviteUrl,
  host = { name: "You", status: "Host · ready" }, opponent = null, waitingLabel = "Waiting…",
  rules = [], cta = null, accent = "#FFB11B", children,
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(null);
  const copy = (what, text) => navigator.clipboard?.writeText(text).then(() => {
    setCopied(what); setTimeout(() => setCopied(null), 1500);
  });
  const joined = !!opponent;
  const initial = (n) => (n || "?").trim()[0]?.toUpperCase();

  return (
    <div className="g-lobby" style={{ "--accent": accent }}>
      <PageGlow tint={joined ? "#f87171" : accent} />
      <header className="g-lobby-head">
        <h1 className="g-wordmark">{wordmark}</h1>
        {modes.length > 1 && (
          <div className="g-seg" role="tablist">
            {modes.map(m => (
              <button key={m.key} role="tab" aria-selected={activeMode === m.key}
                className={`g-seg-btn${activeMode === m.key ? " on" : ""}`}
                onClick={() => activeMode !== m.key && navigate(m.to)}>{m.label}</button>
            ))}
          </div>
        )}
      </header>

      <section className="g-lobby-hero">
        {kicker && <span className="g-lobby-kicker">{kicker}</span>}
        <span className="g-lobby-big">{big ?? code}</span>
        {sub && <span className="g-lobby-sub">{sub}</span>}
        {code && (
          <div className="g-lobby-copy">
            <button className="pa-btn-secondary" onClick={() => copy("code", code)}>
              {copied === "code" ? "Copied" : "Copy code"}
            </button>
            {inviteUrl && (
              <button className="pa-btn-secondary" onClick={() => copy("link", inviteUrl)}>
                {copied === "link" ? "Link copied" : "Copy invite link"}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="g-lobby-vs">
        <div className="g-lobby-seat host">
          <span className="av">{initial(host.name)}</span>
          <span className="nm">{host.name}</span>
          <span className="st">{host.status}</span>
        </div>
        <span className="g-lobby-vs-word">VS</span>
        <div className={`g-lobby-seat opp${joined ? " joined" : ""}`}>
          <span className="av">{joined ? initial(opponent.name) : "?"}</span>
          <span className="nm">{joined ? opponent.name : "Open seat"}</span>
          <span className="st">{joined ? (opponent.status || "Joined") : waitingLabel}</span>
        </div>
      </div>

      {rules.length > 0 && (
        <div className="g-lobby-rules">
          {rules.map(r => (
            <div key={r.k}><span>{r.k}</span><b>{r.v}</b></div>
          ))}
        </div>
      )}

      {cta && (
        <button className={cta.secondary ? "pa-btn-secondary g-lobby-cta2" : "aura-rating-btn g-lobby-cta"}
          disabled={cta.disabled} onClick={cta.onClick}>{cta.label}</button>
      )}
      {children}
    </div>
  );
}
