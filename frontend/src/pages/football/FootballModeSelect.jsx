import { useState } from "react";
import { SEO } from "../../hooks/useSEO";
import ModeAbout from "../../game/football/ModeAbout";
import ModeGrid from "../../game/ModeGrid";
import { ACCENT } from "../../game/football/theme";

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
    icon: "play",
    title: "Spin & Build",
    tag: "Solo · Leaderboard",
    desc: "Two wheels give you a club and a season. Draft eighteen, hire a manager, " +
          "then play out a full league season.",
    path: "/football/game/single",
    live: true,
    accent: ACCENT,
  },
  {
    key: "same",
    icon: "monitor",
    title: "Same Screen",
    tag: "2 players · 1 device",
    desc: "Two elevens on one device over two legs. Nothing leaves the browser and " +
          "no account is needed.",
    path: "/football/game/same-screen",
    live: true,
    accent: ACCENT,
  },
  {
    key: "friend",
    icon: "users",
    title: "With a Friend",
    tag: "2 devices · Room code",
    desc: "Share a six-character code. You each build an eleven in private, and the " +
          "tie is played on the server once both are in.",
    path: "/football/game/friend",
    live: true,
    accent: ACCENT,
  },
  {
    key: "online",
    icon: "globe",
    title: "Online Opponent",
    tag: "2 devices · Open room",
    desc: "The same room machinery without handing the code to anyone in particular. " +
          "Matchmaking is not wired up yet.",
    path: "/football/game/online",
    live: true,
    accent: ACCENT,
  },
];

export default function FootballModeSelect() {
  const [about, setAbout] = useState(null);
  return (
    <>
      <SEO
        title="Football — Squad Builder Game"
        description="Build an eleven from Europe's big five — solo, with a friend, or online."
        path="/football/game"
      />
      <ModeGrid wordmark="Squad Builder" sub="Pick a mode to start drafting"
        modes={MODES} onRules={(m) => setAbout(m)} accent={ACCENT} />
      {about && <ModeAbout mode={about.key} path={about.path} onClose={() => setAbout(null)} />}
    </>
  );
}
