import { useState } from "react";
import { SEO } from "../hooks/useSEO";
import ModeAboutModal from "../game/ModeAboutModal";
import ModeSelect from "../game/ui/ModeSelect";

// Mod seçimi (mockup 3g): dört mod kartı, sırayla Spin & Build, Same Screen,
// With a Friend, Online Opponent. Kart metinleri game/ui/ModeSelect.jsx'te.
// `key` kural pop-up'ının (ModeAboutModal) anahtarı.
const MODES = [
  { key: "single",      path: "/basketball/game/single" },
  { key: "same-screen", path: "/basketball/game/same-screen" },
  { key: "friend",      path: "/basketball/game/friend" },
  { key: "online",      path: "/basketball/game/online" },
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
      <ModeSelect sport="basketball" modes={MODES} onRules={setAbout} />
      <ModeAboutModal mode={about} onClose={() => setAbout(null)} />
    </>
  );
}
