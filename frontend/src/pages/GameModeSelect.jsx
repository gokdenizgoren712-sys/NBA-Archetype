import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { PlayIcon, UsersIcon, GlobeIcon, ScreenIcon } from "../game/GameIcons";
import HowToPlayModal from "../game/HowToPlayModal";
import "../components/PlayerCard.css";

const MODES = [
  {
    key: "single",
    Icon: PlayIcon,
    title: "Single Player",
    desc: "Daily challenge to fill the lineup grid",
    path: "/game/single",
    live: true,
    accent: "#FFB11B",
  },
  {
    key: "friend",
    Icon: UsersIcon,
    title: "With a Friend",
    desc: "Challenge a friend to a head-to-head draft",
    path: "/game/friend",
    live: true,
    accent: "#60a5fa",
  },
  {
    key: "online",
    Icon: GlobeIcon,
    title: "Online Opponent",
    desc: "Compete with another online fan",
    path: "/game/online",
    live: false,
    accent: "#9ca3af",
  },
  {
    key: "same-screen",
    Icon: ScreenIcon,
    title: "Same Screen",
    desc: "Play with a friend on the same device",
    path: "/game/same-screen",
    live: true,
    accent: "#4ade80",
  },
];

export default function GameModeSelect() {
  const navigate = useNavigate();
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <SEO
        title="Lineup Builder Game"
        description="Build the greatest 5-man lineup in NBA history — solo, with a friend, or online."
        path="/game"
      />
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <div className="relative text-center mb-9 overflow-visible">
          <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: "50%", top: -20, width: 260, height: 160, transform: "translateX(-50%)", opacity: 0.2 }} />
          <h1 className="relative font-logo text-3xl font-bold text-white tracking-wide">Lineup Builder</h1>
          <p className="relative text-sm mt-2" style={{ color: "var(--text-muted)" }}>Pick a mode to start drafting</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
          {MODES.map(({ key, Icon, title, desc, path, live, accent }) => (
            <div
              key={key}
              onClick={() => live && navigate(path)}
              className={`mode-card${live ? "" : " disabled"}`}
              style={{ "--accent": accent, "--accent-a": accent + "1a", "--accent-line": accent + "55" }}
            >
              <div className="pcard-holo" /><div className="pcard-grain" />
              <span className="aura-blob" style={{ "--slot-color": accent, right: -20, top: -20, width: 130, height: 100, opacity: live ? 0.22 : 0.1, zIndex: 0 }} />
              <span className="mode-card-badge">{live ? "Live" : "Coming Soon"}</span>
              <div className="mode-card-icon"><Icon size={28} /></div>
              <div className="mode-card-title" style={{ opacity: live ? 1 : 0.55 }}>{title}</div>
              <div className="mode-card-desc" style={{ opacity: live ? 1 : 0.6 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-7">
          <button onClick={() => setHowToPlayOpen(true)} className="aura-pill-btn">
            How to Play
          </button>
        </div>
      </div>

      <HowToPlayModal open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
    </div>
  );
}
