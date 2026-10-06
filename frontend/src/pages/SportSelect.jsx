import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { RankItMark } from "../rankit/redesign/BrandMark";
import { Button } from "../components/ui";
import "./sport-select.css";

// ── Kök spor seçim ekranı (v3 Home, 4a masaüstü / 4c telefon) ───────────────
// İki taktik tahta: her spor kendi oyun diyagramıyla (saha ve top; çizgi sanatı), üç özellik satırı, ligler ve
// giriş düğmesi. Altında RankIt şeridi (ayrı ürün; yer kararı açık). Kabuk yok (App `bare`), logo + hesap PageBar'da.
// Futbolda gerçek lig sayısı 5 (Ligue 1 dahil); mockup'ta 4 yazıyor, yanlış sayı vermemek için gerçeği gösteriyoruz.

const SPORTS = [
  {
    key: "basketball", title: "Basketball", path: "/basketball", accent: "#FFB11B",
    blurb: "Spin a team and an era, draft a lineup, scout by what players actually do.",
    features: [
      ["Lineup Builder", "Spin, draft nine, simulate a season."],
      ["Scout", "Four leagues, every player read by archetype."],
      ["Fantasy", "Rankings, draft plans and mock drafts for your league."],
    ],
    leagues: ["NBA", "G League", "NCAA", "EuroLeague"],
  },
  {
    key: "football", title: "Football", path: "/football", accent: "#3FB08C",
    blurb: "Spin a club and a season, build an XI, test the chemistry before the whistle.",
    features: [
      ["Spin & Build", "Fill an eleven and get a squad-fit report."],
      ["Scout", "Players and clubs read by role, not just position."],
      ["Compare", "Head-to-head, chemistry and the league map."],
    ],
    leagues: ["Bundesliga", "Premier", "La Liga", "Serie A", "Ligue 1"],
  },
];

// Yarım saha ve yarım saha çizgi sanatı: yalnız çizgiler ve top.
function Court() {
  return (
    <svg viewBox="0 0 260 250" className="ss-art" aria-hidden="true">
      <rect x="14" y="14" width="232" height="222" />
      <rect x="86" y="14" width="88" height="86" />
      <path d="M104 100a26 26 0 0 0 52 0" />
      <path d="M44 14v62a86 86 0 0 0 172 0V14" />
      <path d="M118 14h24M117 30a13 13 0 0 0 26 0" />
      <path d="M104 236a26 26 0 0 1 52 0" />
    </svg>
  );
}
function Pitch() {
  return (
    <svg viewBox="0 0 260 250" className="ss-art" aria-hidden="true">
      <rect x="14" y="40" width="232" height="190" />
      <rect x="70" y="40" width="120" height="58" />
      <rect x="104" y="40" width="52" height="22" />
      <circle cx="130" cy="80" r="1.5" />
      <path d="M110 98a20 20 0 0 0 40 0" />
      <path d="M96 230a34 34 0 0 1 68 0" />
    </svg>
  );
}

export default function SportSelect() {
  const navigate = useNavigate();
  return (
    <div className="ss-page">
      {/* title verilmiyor — SEO bileşeni varsayılan marka başlığını kuruyor. */}
      <SEO
        description="Identify every player's true role. Archetype scouting for basketball and football, plus RankIt for rating the matches you watch."
        path="/"
      />

      <header className="ss-head">
        <div>
          <p className="pa-eyebrow">Select a sport · 2 available</p>
          <h1 className="pa-h1">Read the game <span className="sl">/</span> <span className="gd">by archetype</span></h1>
        </div>
        <p className="ss-intro">Scout players by what they actually do, then draft a lineup or play a fantasy season.</p>
      </header>

      <div className="ss-sports">
        {SPORTS.map((s, i) => (
          <section key={s.key} className="pa-panel ss-card" style={{ "--m": s.accent }} aria-labelledby={`ss-${s.key}`}>
            <div className="ss-card-top">
              <span className="pa-eyebrow">Sport 0{i + 1} / {s.title}</span>
              <span className="pa-eyebrow">{s.leagues.length} leagues</span>
            </div>
            <div className="ss-card-body">
              <div className="ss-art-wrap">{s.key === "basketball" ? <Court /> : <Pitch />}</div>
              <div className="ss-copy">
                <h2 id={`ss-${s.key}`} className="ss-title">{s.title}<b>.</b></h2>
                <p className="ss-blurb">{s.blurb}</p>
                <ul className="ss-feats">
                  {s.features.map(([t, d], n) => (
                    <li key={t}><span className="n">0{n + 1}</span><div><b>{t}</b><span>{d}</span></div></li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="ss-card-foot">
              <ul className="ss-leagues" aria-label="Leagues">{s.leagues.map((l) => <li key={l} className="pa-chip">{l}</li>)}</ul>
              <Button variant="outline" size={48} className="ss-enter" onClick={() => navigate(s.path)}>Enter {s.title} →</Button>
            </div>
          </section>
        ))}
      </div>

      <section className="pa-panel ss-rankit" aria-label="RankIt">
        <RankItMark size={34} />
        <div className="ss-rankit-text">
          <span className="pa-eyebrow">RankIt · New</span>
          <p><b>Rate every match you watch</b> Keep a diary, write reviews, follow people whose taste you trust.</p>
        </div>
        <Button variant="outline" size={48} onClick={() => navigate("/rankit")}>Open RankIt →</Button>
      </section>
    </div>
  );
}
