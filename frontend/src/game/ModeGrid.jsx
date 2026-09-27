import { useNavigate } from "react-router-dom";
import PaIcon from "../components/shell/PaIcon";
import { PageGlow } from "../components/states/States";
import "./game.css";

// ── Oyun modu seçimi (handoff 4b / 18a) ────────────────────────────────────
// İki sporun mod ekranı aynı kalıp: büyük wordmark, dört tek yüzeyli kart.
// Kesik köşe ve holo artık yalnız oyuncu kartında (handoff kural 7); mod kartı
// modun kendi renginde yukarıdan solan bir yüzey + üstte bir ışık bulutu.
//
// modes: [{ key, icon, title, tag, desc, path, accent, live }]
export default function ModeGrid({ wordmark, sub, modes, onRules, accent = "#FFB11B" }) {
  const navigate = useNavigate();
  return (
    <div className="g-modes-page">
      <PageGlow tint={accent} />
      <header className="g-modes-hero">
        <h1 className="g-wordmark lg">{wordmark}</h1>
        <p>{sub}</p>
      </header>

      <div className="g-modes">
        {modes.map((m) => (
          <div key={m.key} className={`g-mode${m.live === false ? " soon" : ""}`}
            role="link" tabIndex={0} aria-label={`${m.title} — ${m.tag}`}
            style={{ "--m": m.accent }}
            onClick={() => m.live !== false && navigate(m.path)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && m.live !== false && navigate(m.path)}>
            <span className="g-mode-glow" />
            <div className="g-mode-top">
              <span className="g-mode-live"><i />{m.live === false ? "Soon" : "Live"}</span>
              <button className="g-mode-rules" onClick={(e) => { e.stopPropagation(); onRules(m); }}
                aria-label={`Rules for ${m.title}`}>
                <PaIcon name="info" size={16} color="#b4afa8" />Rules
              </button>
            </div>
            <div className="g-mode-icon"><PaIcon name={m.icon} size={52} color={m.accent} /></div>
            <div className="g-mode-text">
              <span className="g-mode-title">{m.title}</span>
              <span className="g-mode-tag">{m.tag}</span>
              <span className="g-mode-desc">{m.desc}</span>
            </div>
            <span className="g-mode-play">{m.live === false ? "Coming soon" : "Play →"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
