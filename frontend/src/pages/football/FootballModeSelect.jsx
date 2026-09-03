import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { PlayIcon, UsersIcon, GlobeIcon, ScreenIcon, InfoIcon } from "../../game/GameIcons";
import ModeAbout from "../../game/football/ModeAbout";
import ModeCardStage from "../../components/ModeCardStage";
import "../../components/PlayerCard.css";
import "../../game/game.css";
import { ACCENT, PHASE_COLOR } from "../../game/football/theme";

// ── Futbol mod seçimi ────────────────────────────────────────────────────────
// Basketboldaki GameModeSelect'in karşılığı ve aynı yeri tutuyor: /football/game
// artık doğrudan Spin & Build'i açmıyor, önce modu seçtiriyor.
//
// Önceden Spin & Build tek başına /football/game'deydi ve kafa kafaya modları
// ayrı bir /football/versus sayfasının içinde sekme olarak duruyordu — yani
// "Game"e tıklayan biri diğer üç modun varlığını hiç görmüyordu.

const MODES = [
  {
    key: "spin",
    Icon: PlayIcon,
    title: "Spin & Build",
    meta: "Solo · Leaderboard",
    desc: "Two wheels give you a club and a season. Draft eighteen, hire a manager, " +
          "then play out a full league season.",
    path: "/football/game/single",
    live: true,
    accent: ACCENT,
  },
  {
    key: "same",
    Icon: ScreenIcon,
    title: "Same Screen",
    meta: "2 players · 1 device",
    desc: "Two elevens on one device over two legs. Nothing leaves the browser and " +
          "no account is needed.",
    path: "/football/game/same-screen",
    live: true,
    accent: PHASE_COLOR.gk,
  },
  {
    key: "friend",
    Icon: UsersIcon,
    title: "With a Friend",
    meta: "2 devices · Room code",
    desc: "Share a six-character code. You each build an eleven in private, and the " +
          "tie is played on the server once both are in.",
    path: "/football/game/friend",
    live: true,
    accent: PHASE_COLOR.def,
  },
  {
    key: "online",
    Icon: GlobeIcon,
    title: "Online Opponent",
    meta: "2 devices · Open room",
    desc: "The same room machinery without handing the code to anyone in particular. " +
          "Matchmaking is not wired up yet.",
    path: "/football/game/online",
    live: true,
    accent: PHASE_COLOR.fwd,
  },
];

export default function FootballModeSelect() {
  const navigate = useNavigate();
  const [about, setAbout] = useState(null);

  return (
    <div className="h-full overflow-y-auto relative">
      <SEO
        title="Football — Squad Builder Game"
        description="Build an eleven from Europe's big five — solo, with a friend, or online."
        path="/football/game"
      />
      <div className="g-smoke" />

      <div className="relative min-h-full flex flex-col items-center justify-center p-6 py-12">
        <div className="text-center mb-10">
          <h1 className="font-logo text-4xl font-bold text-white tracking-wide">Squad Builder</h1>
          <p className="text-sm mt-2.5" style={{ color: "var(--text-muted)" }}>
            Pick a mode to start drafting
          </p>
        </div>

        <div className="flex flex-wrap gap-6 justify-center" style={{ position: "relative" }}>
          <span className="aura-blob aura-blob-liquid" style={{ "--slot-color": ACCENT, left: "-4%", top: "-14%", width: 320, height: 220, opacity: 0.14 }} />
          <span className="aura-blob aura-blob-liquid" style={{ "--slot-color": PHASE_COLOR.fwd, right: "-2%", bottom: "-18%", width: 280, height: 200, opacity: 0.1, animationDelay: "-4s, -3s" }} />
          {MODES.map((mode, i) => {
            const { key, Icon, title, meta, desc, path, live, accent } = mode;
            return (
              <ModeCardStage key={key} index={i} className={live ? "" : "soon"}>
                <div className="pcard pcard-tilt"
                  onClick={() => live && navigate(path)}
                  style={{ "--accent": accent, "--accent-a": accent + "48",
                           "--accent-b": accent + "30", "--accent-line": accent + "66" }}>
                  <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
                  <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" />
                  <span className="pcard-sparkle s3" />

                  <div className="pcard-top">
                    <span className="pcard-rank top">{live ? "LIVE" : "SOON"}</span>
                    <button className="mode-about" title={`About ${title}`}
                      onClick={(e) => { e.stopPropagation(); setAbout(key); }}>
                      <InfoIcon size={13} />
                    </button>
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
                    <p style={{ fontSize: 11.5, lineHeight: 1.45,
                      color: "var(--text-muted)", margin: 0 }}>{desc}</p>
                  </div>

                  <div className="pcard-peek" style={{ marginBottom: 12 }}>
                    <span>{live ? "Play" : "Coming Soon"}</span>
                    {live && <span className="pcard-chev"
                      style={{ transform: "rotate(-90deg)" }}>▾</span>}
                  </div>
                </div>
              </ModeCardStage>
            );
          })}
        </div>
      </div>

      {about && <ModeAbout mode={about} onClose={() => setAbout(null)} />}
    </div>
  );
}
