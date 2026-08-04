import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { PlayIcon, UsersIcon, GlobeIcon, ScreenIcon, InfoIcon } from "../game/GameIcons";
import ModeAboutModal from "../game/ModeAboutModal";
import "../components/PlayerCard.css";
import "../game/game.css";

const MODES = [
  {
    key: "single",
    Icon: PlayIcon,
    title: "Single Player",
    meta: "Solo · Leaderboard",
    desc: "Spin the wheels, draft nine across any era, hire a coach and simulate a full season.",
    path: "/game/single",
    live: true,
    accent: "#FFB11B",
  },
  {
    key: "friend",
    Icon: UsersIcon,
    title: "With a Friend",
    meta: "2 devices · Room code",
    desc: "Invite a friend with a code and snake-draft head-to-head, synced live across both screens.",
    path: "/game/friend",
    live: true,
    accent: "#60a5fa",
  },
  {
    key: "same-screen",
    Icon: ScreenIcon,
    title: "Same Screen",
    meta: "2 players · 1 device",
    desc: "Pass one device back and forth. Shared roster, snake order, and a BAN to block their pick.",
    path: "/game/same-screen",
    live: true,
    accent: "#4ade80",
  },
  {
    key: "online",
    Icon: GlobeIcon,
    title: "Online Opponent",
    meta: "Matchmaking · The Board",
    desc: "Queue against a random fan, or draft head-to-head against the 25 best Salary Cap rosters ever submitted.",
    path: "/game/online",
    live: true,
    accent: "#f472b6",
  },
];

export default function GameModeSelect() {
  const navigate = useNavigate();
  const [about, setAbout] = useState(null);

  return (
    <div className="h-full overflow-y-auto relative">
      <SEO
        title="Lineup Builder Game"
        description="Build the greatest 5-man lineup in NBA history — solo, with a friend, or online."
        path="/game"
      />

      {/* Alttan yükselen duman dokusu — başlığın arkasındaki nokta-glow'un
          yerini aldı. Üst %33 bilinçli boş. */}
      <div className="g-smoke" />

      <div className="relative min-h-full flex flex-col items-center justify-center p-6 py-12">
        <div className="text-center mb-10">
          <h1 className="font-logo text-4xl font-bold text-white tracking-wide">Lineup Builder</h1>
          <p className="text-sm mt-2.5" style={{ color: "var(--text-muted)" }}>Pick a mode to start drafting</p>
        </div>

        <div className="flex flex-wrap gap-6 justify-center">
          {MODES.map(mode => {
            const { key, Icon, title, meta, desc, path, live, accent } = mode;
            return (
              <div key={key} className={`pcard-stage mode${live ? "" : " soon"}`}>
                <div className="pcard"
                  onClick={() => live && navigate(path)}
                  style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-b": accent + "30", "--accent-line": accent + "66" }}>
                  <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
                  <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" /><span className="pcard-sparkle s3" />

                  <div className="pcard-top">
                    <span className="pcard-rank top">{live ? "LIVE" : "SOON"}</span>
                    <button className="mode-about" title={`About ${title}`}
                      onClick={e => { e.stopPropagation(); setAbout(mode); }}>
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
                    <p style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)", margin: 0 }}>{desc}</p>
                  </div>

                  <div className="pcard-peek" style={{ marginBottom: 12 }}>
                    <span>{live ? "Play" : "Coming Soon"}</span>
                    {live && <span className="pcard-chev" style={{ transform: "rotate(-90deg)" }}>▾</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ModeAboutModal mode={about} onClose={() => setAbout(null)} />
    </div>
  );
}
