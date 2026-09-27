import { useState } from "react";
import { SEO } from "../hooks/useSEO";
import ModeAboutModal from "../game/ModeAboutModal";
import ModeGrid from "../game/ModeGrid";

// Handoff 4b: dört tek yüzeyli mod kartı. Kesik köşe/holo artık yalnız oyuncu
// kartında; mod kartı modun renginde yukarıdan solan bir yüzey.

const MODES = [
  {
    key: "single",
    icon: "play",
    title: "Single Player",
    tag: "Solo · Leaderboard",
    desc: "Spin the wheels, draft nine across any era, hire a coach and simulate a full season.",
    path: "/basketball/game/single",
    live: true,
    accent: "#FFB11B",
  },
  {
    key: "friend",
    icon: "users",
    title: "With a Friend",
    tag: "2 devices · Room code",
    desc: "Invite a friend with a code and snake-draft head-to-head, synced live across both screens.",
    path: "/basketball/game/friend",
    live: true,
    accent: "#60a5fa",
  },
  {
    key: "same-screen",
    icon: "monitor",
    title: "Same Screen",
    tag: "2 players · 1 device",
    desc: "Pass one device back and forth. Shared roster, snake order, and a BAN to block their pick.",
    path: "/basketball/game/same-screen",
    live: true,
    accent: "#4ade80",
  },
  {
    key: "online",
    icon: "globe",
    title: "Online Opponent",
    tag: "Matchmaking · The Board",
    desc: "Queue against a random fan, or draft head-to-head against the 25 best Salary Cap rosters ever submitted.",
    path: "/basketball/game/online",
    live: true,
    accent: "#f472b6",
  },
];

export default function GameModeSelect() {
  const [about, setAbout] = useState(null);
  return (
    <>
      <SEO
        title="Lineup Builder Game"
        description="Build the greatest 5-man lineup in NBA history — solo, with a friend, or online."
        path="/basketball/game"
      />
      <ModeGrid wordmark="Lineup Builder" sub="Pick a mode to start drafting"
        modes={MODES} onRules={setAbout} accent="#FFB11B" />
      <ModeAboutModal mode={about} onClose={() => setAbout(null)} />
    </>
  );
}
