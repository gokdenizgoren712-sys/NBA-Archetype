import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { PlayIcon, UsersIcon, GlobeIcon, ScreenIcon } from "../game/GameIcons";

const MODES = [
  {
    key: "single",
    Icon: PlayIcon,
    title: "Single Player",
    desc: "Daily challenge to fill the lineup grid",
    path: "/game/single",
    live: true,
  },
  {
    key: "friend",
    Icon: UsersIcon,
    title: "With a Friend",
    desc: "Challenge a friend to a head-to-head draft",
    path: "/game/friend",
    live: false,
  },
  {
    key: "online",
    Icon: GlobeIcon,
    title: "Online Opponent",
    desc: "Compete with another online fan",
    path: "/game/online",
    live: false,
  },
  {
    key: "same-screen",
    Icon: ScreenIcon,
    title: "Same Screen",
    desc: "Play with a friend on the same device",
    path: "/game/same-screen",
    live: false,
  },
];

export default function GameModeSelect() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto">
      <SEO
        title="Lineup Builder Game"
        description="Build the greatest 5-man lineup in NBA history — solo, with a friend, or online."
        path="/game"
      />
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <h1 className="font-logo text-3xl font-bold text-white tracking-wide">Lineup Builder</h1>
          <p className="text-sm text-gray-500 mt-2">Pick a mode to start drafting</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
          {MODES.map(({ key, Icon, title, desc, path, live }) => (
            <button
              key={key}
              disabled={!live}
              onClick={() => live && navigate(path)}
              className={`relative text-center rounded-2xl border p-6 transition-all
                ${live
                  ? "border-gray-800 bg-surfaceBg hover:border-yamabuki/60 hover:bg-surfaceCard cursor-pointer"
                  : "border-gray-800/60 bg-surfaceBg/50 cursor-not-allowed"}`}
            >
              {!live && (
                <span className="absolute top-3 right-3 text-[9px] font-logo font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-gray-700 text-gray-500">
                  Coming Soon
                </span>
              )}
              <div className={`flex justify-center mb-3 ${live ? "text-yamabuki" : "text-gray-600"}`}>
                <Icon size={34} />
              </div>
              <div className={`font-logo text-base font-bold uppercase tracking-wide ${live ? "text-yamabuki" : "text-gray-500"}`}>
                {title}
              </div>
              <div className={`text-xs mt-1.5 leading-snug ${live ? "text-gray-400" : "text-gray-600"}`}>
                {desc}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
