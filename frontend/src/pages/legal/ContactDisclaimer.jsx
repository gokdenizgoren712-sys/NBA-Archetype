import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { LEGAL_NAV } from "./LegalPageLayout";
import "./legal.css";

// ── İletişim (handoff 18c) ──────────────────────────────────────────────────
// Sunucuda iletişim ucu YOK — form bir şey "gönderiyormuş" gibi yapmıyor:
// konu + başlık + mesaj, kullanıcının e-posta uygulamasında hazır bir e-posta
// açıyor ve bunu açıkça söylüyor. Feragatname ve veri kaynakları metni
// (taslak, hukuki inceleme bekliyor) sol sütunda korunuyor.

const EMAIL = "info@primaryarch.net";
const TOPICS = ["Wrong stat", "Missing player", "Game bug", "Something else"];

export default function ContactDisclaimer() {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState("");

  const href = `mailto:${EMAIL}?subject=${encodeURIComponent(`[${topic}] ${subject}`.trim())}&body=${encodeURIComponent(msg)}`;

  return (
    <div className="ct-page">
      <SEO title="Contact & Disclaimer" description="How to reach Primary Arch, and a general disclaimer about the site's content." path="/contact" noindex />
      <div className="ct-grid">
        <div className="ct-left">
          <h1>Get in touch</h1>
          <p className="ct-sub">Found a wrong stat, a missing player or a bug in the game? Tell us — we read everything.</p>
          <div className="ct-info">
            <div><span>Email</span><a href={`mailto:${EMAIL}`}>{EMAIL}</a></div>
            <div><span>X (Twitter)</span><a href="https://x.com/primary_arch" target="_blank" rel="noopener noreferrer">@primary_arch</a></div>
            <div><span>Instagram</span><a href="https://www.instagram.com/primary_arch" target="_blank" rel="noopener noreferrer">@primary_arch</a></div>
          </div>

          <div className="ct-legal">
            <p className="lg-draft"><b>Draft — not yet legally reviewed.</b> The disclaimer below is a placeholder until a qualified reviewer approves it.</p>
            <h2>Disclaimer</h2>
            <p>Primary Arch is an independent stats and entertainment project. It is not affiliated with, endorsed by, or sponsored by the NBA, WNBA, NCAA, EuroLeague, any G-League team, or any of their players, teams, or leagues. All team names, player names, and league names are used for identification and commentary purposes only.</p>
            <p>Player archetypes and scores are the site's own statistical opinions, generated algorithmically from public data — they are not official league statistics or endorsed rankings.</p>
            <h2>Data sources</h2>
            <p>Statistics are sourced from publicly available data (e.g. stats.nba.com and other public basketball-statistics providers). [PLACEHOLDER: a reviewer should confirm each data source's terms of use permit this kind of public, non-commercial-or-commercial (whichever applies) redisplay and derived scoring.]</p>
          </div>

          <nav className="ct-links" aria-label="Legal">
            {LEGAL_NAV.map(n => <Link key={n.to} to={n.to} className={n.to === "/contact" ? "on" : ""}>{n.label}</Link>)}
          </nav>
        </div>

        <form className="ct-form" onSubmit={e => { e.preventDefault(); window.location.href = href; }}>
          <span className="lbl">Topic</span>
          <div className="ct-topics" role="radiogroup" aria-label="Topic">
            {TOPICS.map(t => (
              <button type="button" key={t} role="radio" aria-checked={topic === t} className={topic === t ? "on" : ""} onClick={() => setTopic(t)}>{t}</button>
            ))}
          </div>
          <label className="ct-field">
            <span>Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={topic === "Wrong stat" ? "e.g. Jokić's assist rate looks off" : "A short summary"} />
          </label>
          <label className="ct-field">
            <span>Message</span>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={6}
              placeholder="What did you see, and where? A player name, a season or a link helps us find it fast." />
          </label>
          <div className="ct-send">
            <span>Opens a ready-to-send email in your mail app — nothing is sent from this page.</span>
            <button type="submit" className="aura-rating-btn" disabled={!msg.trim()}>Write email</button>
          </div>
        </form>
      </div>
    </div>
  );
}
