import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { RankItMark } from "../rankit/redesign/BrandMark";
import PaIcon from "../components/shell/PaIcon";
import "./sport-select.css";

// ── Kök spor seçim ekranı (handoff 4a / 4c) ─────────────────────────────────
// İki spor önde, RankIt ikinci planda. Site tek domainde iki bağımsız ürün
// (/basketball, /football); ortak kalan altyapı ve persantil yöntemi.
//
// 2026-09 handoff: kesik köşe + holo artık yalnız oyuncu kartında. Giriş
// kartları sporun renginde yukarıdan solan tek yüzeyli kart; RankIt ayrı bir
// ürün olduğu için kartların altında ince bir şerit (biçim farkı bilinçli).
const SPORTS = [
  {
    key: "basketball",
    icon: "nba",
    title: "Basketball",
    leagues: "NBA · G League · NCAA · EuroLeague",
    desc: "12 core archetypes and 22 modifiers across four leagues, every season back to 1983 — plus the Lineup Builder game.",
    path: "/basketball",
    accent: "#FFB11B",
  },
  {
    key: "football",
    icon: "football",
    title: "Football",
    leagues: "Premier League · La Liga · Serie A · Bundesliga · Ligue 1",
    desc: "Player cards for Europe's big five, built on a separate archetype dictionary with its own roles for every phase of the game.",
    path: "/football",
    accent: "#3FB08C",
  },
];

export default function SportSelect() {
  const navigate = useNavigate();
  const go = (path) => (e) => {
    if (e.type === "click" || e.key === "Enter" || e.key === " ") navigate(path);
  };

  return (
    <div className="ss-page">
      {/* title verilmiyor — SEO bileşeni varsayılan marka başlığını kuruyor;
          vermek "Primary Arch | Primary Arch" gibi çift başlık üretiyordu. */}
      <SEO
        description="Identify every player's true role — archetype scouting for basketball and football."
        path="/"
      />
      <span className="ss-glow gold" />
      <span className="ss-glow teal" />

      <header className="ss-hero">
        <h1>Primary Arch</h1>
        <p>Scout a sport, or rate the matches you watch</p>
      </header>

      <div className="ss-sports">
        {SPORTS.map((s) => (
          <div key={s.key} className="ss-card" role="link" tabIndex={0}
            aria-label={`${s.title} — ${s.leagues}`} style={{ "--m": s.accent }}
            onClick={go(s.path)} onKeyDown={go(s.path)}>
            <span className="ss-card-glow" />
            <span className="ss-live"><i />Live</span>
            <span className="ss-icon"><PaIcon name={s.icon} size={64} color={s.accent} /></span>
            <span className="ss-title">{s.title}</span>
            <span className="ss-leagues">{s.leagues}</span>
            <span className="ss-desc">{s.desc}</span>
            <span className="ss-enter">Enter →</span>
          </div>
        ))}
      </div>

      <div className="ss-rankit" role="link" tabIndex={0} aria-label="RankIt — Ratings, Reviews, Diary"
        onClick={go("/rankit")} onKeyDown={go("/rankit")}>
        <RankItMark size={34} />
        <div className="ss-rankit-text">
          <span className="name">RankIt <b>New</b></span>
          <span className="desc">Rate the matches you watch, keep a record of them, and follow the people whose taste you recognise.</span>
        </div>
        <span className="ss-rankit-go">Open →</span>
      </div>
    </div>
  );
}
