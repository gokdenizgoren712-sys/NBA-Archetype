import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { NBAIcon, FootballIcon } from "../components/BrandIcons";
import { RankItMark } from "../rankit/web/cards";
import ModeCardStage from "../components/ModeCardStage";
import "../components/PlayerCard.css";
import "../game/game.css";
import "./sport-select.css";

// ── Kök spor seçim ekranı ────────────────────────────────────────────────────
// 2026-08: site tek domainde İKİ BAĞIMSIZ ürüne ayrıldı (/basketball, /football).
// Ortak kalan tek şey altyapı (hesap, blog, admin, yasal) ve persantil yöntemi —
// veri hattı, arketip sözlüğü ve sayfa akışı her iki tarafta tamamen ayrı.
// Görsel dil bilinçli olarak GameModeSelect'in pcard deseniyle aynı: kullanıcı
// bu "N seçenekten birini seç" hareketini oyunun mod ekranından zaten tanıyor.
//
// 2026-09: RankIt önce kartların üstünde yatay bir şerit olarak duruyordu.
// Amaç "spor değil, ayrı ürün" demekti ama sonuç tersine çıktı: şerit 664px,
// kart grubu 544px — hiçbir kenar hizalanmıyordu, ve düz bir dikdörtgen kesik
// köşeli koleksiyon kartlarının yanında yamalı duruyordu. Sayfa üç KAPI
// sunuyor; üçü de aynı nesne olmalı. RankIt'i sporlardan ayıran şey biçim
// değil içerik: kendi işareti, kendi rozeti, kendi cümlesi.
const DESTINATIONS = [
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
    live: true,
    accent: "#3FB08C",
  },
];

// RankIt sporların yanına değil ÜSTÜNE gidiyor, çünkü farklı bir iş yapıyor:
// Basketball/Football istatistik ve oyun tarafı, RankIt günlük tarafı. Ama
// ayrım BİÇİMDE olmalı, DİLDE değil — ilk denemede düz bir dikdörtgen banner'dı
// ve kesik köşeli koleksiyon kartlarının yanında yamalı duruyordu (üstelik
// 664px genişlikle 544px'lik kart grubunun hiçbir kenarına hizalanmıyordu).
// Şimdi aynı koleksiyon kartı malzemesi — holo, foil, grain, kesik köşe, isim
// bandı, rozet — sadece yatay dizilmiş, ve genişliği kart grubuyla birebir aynı.
// Bu yatay koleksiyon kartı RankIt'in kendi kart dili (bkz. rankit/DESIGN.md).
const RANKIT_GATE = {
  title: "RankIt",
  meta: "Ratings · Reviews · Diary",
  desc: "Rate the matches you watch, keep a record of them, and follow the people whose taste you recognise.",
  path: "/rankit",
  badge: "NEW",
  accent: "#FFB11B",
};

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
            Scout a sport, or rate the matches you watch
          </p>
        </div>

        {/* Yatay koleksiyon kartı — RankIt'in kendi kart dili. Sporlarla aynı
            malzeme, farklı geometri: ayrım biçimde, dilde değil. */}
        <ModeCardStage index={0} className="rankit-gate">
          <div className="pcard pcard-h pcard-tilt"
            onClick={() => navigate(RANKIT_GATE.path)}
            style={{ "--accent": RANKIT_GATE.accent, "--accent-a": RANKIT_GATE.accent + "48",
                     "--accent-b": RANKIT_GATE.accent + "30", "--accent-line": RANKIT_GATE.accent + "66" }}>
            <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
            <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" />

            <div className="pcard-h-photo">
              <div className="pcard-photo-glow" />
              <div className="mode-emblem"><RankItMark size={34} /></div>
            </div>

            <div className="pcard-h-body">
              <div className="pcard-nameband">
                <h3 className="pcard-name">{RANKIT_GATE.title}</h3>
                <div className="pcard-meta"><span className="pcard-arch">{RANKIT_GATE.meta}</span></div>
              </div>
              <p className="pcard-h-desc">{RANKIT_GATE.desc}</p>
            </div>

            <div className="pcard-h-go">
              <span className="pcard-rank top">{RANKIT_GATE.badge}</span>
              <span className="pcard-peek">
                Open <span className="pcard-chev" style={{ transform: "rotate(-90deg)" }}>▾</span>
              </span>
            </div>
          </div>
        </ModeCardStage>

        <div className="flex flex-wrap gap-6 justify-center sport-select-row" style={{ position: "relative" }}>
          <span className="aura-blob aura-blob-liquid" style={{ "--slot-color": "#FFB11B", left: "-4%", top: "-16%", width: 300, height: 210, opacity: 0.14 }} />
          <span className="aura-blob aura-blob-liquid" style={{ "--slot-color": "#3FB08C", right: "-2%", bottom: "-16%", width: 280, height: 200, opacity: 0.12, animationDelay: "-4s, -3s" }} />
          {DESTINATIONS.map(({ key, Icon, title, meta, desc, path, live, badge, accent }, i) => (
            <ModeCardStage key={key} index={i} className={live ? "" : "soon"}>
              <div className="pcard pcard-tilt"
                onClick={() => navigate(path)}
                style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-b": accent + "30", "--accent-line": accent + "66" }}>
                <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
                <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" /><span className="pcard-sparkle s3" />

                <div className="pcard-top">
                  <span className="pcard-rank top">{badge || (live ? "LIVE" : "IN DEV")}</span>
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
            </ModeCardStage>
          ))}
        </div>
      </div>
    </div>
  );
}
