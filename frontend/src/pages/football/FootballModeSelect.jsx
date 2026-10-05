import { useState } from "react";
import { SEO } from "../../hooks/useSEO";
import ModeAbout from "../../game/football/ModeAbout";
import ModeSelect from "../../game/ui/ModeSelect";

// Futbol mod seçimi (mockup 4g): basketbolla aynı kalıp, yeşil accent.
// /football/game doğrudan Spin & Build'i açmaz; önce modu seçtirir.
const MODES = [
  { key: "spin",   path: "/football/game/single" },
  { key: "same",   path: "/football/game/same-screen" },
  { key: "friend", path: "/football/game/friend" },
  { key: "online", path: "/football/game/online" },
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
      <ModeSelect sport="football" modes={MODES} onRules={setAbout} />
      {about && <ModeAbout mode={about.key} path={about.path} onClose={() => setAbout(null)} />}
    </>
  );
}
