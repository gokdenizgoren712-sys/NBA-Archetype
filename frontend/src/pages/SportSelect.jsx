import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { NBAIcon, FootballIcon } from "../components/BrandIcons";
import "../components/PlayerCard.css";
import "../game/game.css";

// ── Kök spor seçim ekranı ────────────────────────────────────────────────────
// 2026-08: site tek domainde İKİ BAĞIMSIZ ürüne ayrıldı (/basketball, /football).
// Ortak kalan tek şey altyapı (hesap, blog, admin, yasal) ve persantil yöntemi —
// veri hattı, arketip sözlüğü ve sayfa akışı her iki tarafta tamamen ayrı.
// Görsel dil bilinçli olarak GameModeSelect'in pcard deseniyle aynı: kullanıcı
// bu "N seçenekten birini seç" hareketini oyunun mod ekranından zaten tanıyor.
const SPORTS = [
  {
    key: "basketball",
    Icon: NBAIcon,
    title: "Basketball",
    meta: "NBA · G-League · NCAA · EuroLeague",
    desc: "12 core archetypes and 22 modifiers across four leagues, every season back to 1983 — plus the Lineup Builder game.",
    path: "/basketball",
    live: true,
    accent: "#FFB11B",
  },
  {
    key: "football",
    Icon: FootballIcon,
    title: "Football",
    meta: "Premier League · La Liga · Serie A · Bundesliga · Ligue 1",
    desc: "Player cards for Europe's big five, built on a separate archetype dictionary with its own roles for every phase of the game.",
    path: "/football",
    live: false,
    accent: "#3FB08C",
  },
];

export default function SportSelect() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto relative">
      {/* title verilmiyor — SEO bileşeni zaten varsayılan marka başlığını kuruyor
          ("Primary Arch — Identify Every Player's True Role"); vermek "Primary Arch |
          Primary Arch" gibi çiftlenmiş bir başlık üretiyordu. */}
      <SEO
        description="Identify every player's true role — archetype scouting for basketball and football."
        path="/"
      />

      <div className="g-smoke" />

      <div className="relative min-h-full flex flex-col items-center justify-center p-6 py-12">
        <div className="text-center mb-10">
          <h1 className="font-logo text-4xl font-bold text-white tracking-wide">Primary Arch</h1>
          <p className="text-sm mt-2.5" style={{ color: "var(--text-muted)" }}>
            Pick a sport to start scouting
          </p>
        </div>

        <div className="flex flex-wrap gap-6 justify-center">
          {SPORTS.map(({ key, Icon, title, meta, desc, path, live, accent }) => (
            <div key={key} className={`pcard-stage mode${live ? "" : " soon"}`}>
              <div className="pcard"
                onClick={() => navigate(path)}
                style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-b": accent + "30", "--accent-line": accent + "66" }}>
                <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
                <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" /><span className="pcard-sparkle s3" />

                <div className="pcard-top">
                  <span className="pcard-rank top">{live ? "LIVE" : "IN DEV"}</span>
                </div>

                <div className="pcard-photo">
                  <div className="pcard-photo-glow" />
                  <div className="mode-emblem"><Icon size={38} /></div>
                  <div className="pcard-photo-fade" />
                </div>

                <div className="pcard-nameband">
                  <h3 className="pcard-name">{title}</h3>
                  <div className="pcard-meta"><span className="pcard-arch">{meta}</span></div>
                </div>

                <div className="pcard-stats flat">
                  <p style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)", margin: 0 }}>{desc}</p>
                </div>

                <div className="pcard-peek" style={{ marginBottom: 12 }}>
                  <span>{live ? "Enter" : "Preview"}</span>
                  <span className="pcard-chev" style={{ transform: "rotate(-90deg)" }}>▾</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
