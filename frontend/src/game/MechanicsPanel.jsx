// ── Idle ekranın sağ paneli: tıklanabilir Jokers/BAN/Cap/Best-of-7 kartları
// + kendi InfoModal'ları. Same Screen ve With a Friend arasında paylaşılır —
// içerik sabit (mekanikler her iki modda da aynı), sadece modal state
// (modal/setModal) çağıran sayfadan geliyor.
import { useState } from "react";
import InfoModal from "./InfoModal";
import {
  CardsIcon, WarnIcon, CapIcon, TrophyIcon,
  RefreshIcon, CalendarIcon, BoltIcon, UsersIcon, SearchIcon,
} from "./GameIcons";

const CARDS = [
  { key: "jokers", Icon: CardsIcon, color: "text-yamabuki", title: "Jokers", desc: "5 one-time abilities, each player" },
  { key: "ban", Icon: WarnIcon, color: "text-brandRed", title: "BAN", desc: "Block your opponent's pick" },
  { key: "cap", Icon: CapIcon, color: "text-emerald-300", title: "Salary Cap", desc: "100% budget, star premiums" },
  { key: "series", Icon: TrophyIcon, color: "text-yamabuki", title: "Best-of-7", desc: "Game-by-game box scores" },
];

export default function MechanicsPanel() {
  const [modal, setModal] = useState(null);
  return (
    <>
      <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-4 space-y-3">
        <div className="font-logo text-[11px] uppercase tracking-widest text-gray-500">Mechanics</div>
        <div className="grid grid-cols-2 gap-2">
          {CARDS.map(({ key, Icon, color, title, desc }) => (
            <button key={key} onClick={() => setModal(key)}
              className="bg-surfaceCard hover:bg-gray-800 rounded-lg p-3 text-left transition-colors border border-gray-800 hover:border-gray-700">
              <div className="font-logo text-sm font-bold text-white mb-0.5 flex items-center gap-1.5"><span className={color}><Icon size={15} /></span> {title}</div>
              <div className="text-[11px] text-gray-400 leading-relaxed">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      <InfoModal open={modal === "jokers"} onClose={() => setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-yamabuki"><CardsIcon size={17} /></span> Jokers</span>}>
        <div className="space-y-3">
          {[
            [RefreshIcon, "Team", "Re-spin the team wheel. Get a different roster from the same season."],
            [CalendarIcon, "Year", "Re-spin the season wheel. Jump to a completely different era."],
            [BoltIcon, "Both", "Re-spin both wheels at once. Full reset of the current pick."],
            [UsersIcon, "Pick 2", "Choose two players from the current roster in a single turn."],
            [SearchIcon, "Discover", "Reveal every player's hidden overall score this turn, then choose with full information."],
          ].map(([Icon, name, desc]) => (
            <div key={name} className="flex gap-3 items-start">
              <span className="shrink-0 text-yamabuki mt-0.5"><Icon size={18} /></span>
              <div>
                <div className="text-white font-medium text-sm">{name}</div>
                <div className="text-gray-400 text-xs leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
          <p className="text-[12.5px] text-gray-600 pt-1 border-t border-gray-800">Each player has their own 5 jokers, one use each per game.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal === "ban"} onClose={() => setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-brandRed"><WarnIcon size={17} /></span> BAN</span>}>
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>BAN is a sixth, <span className="text-white font-medium">vs-mode-only</span> joker. While your opponent is on the clock, you can BAN one player from their current roster — they won't be able to pick that player.</p>
          <p>Each player has one BAN, usable once per game, only on their opponent's turn.</p>
          <p className="text-gray-400 text-xs">If the banned player's owner uses any other joker on that same pick, the BAN is voided — the player becomes pickable again. Countering a BAN costs your opponent a joker, so it's a real trade-off, not a free block.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal === "cap"} onClose={() => setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-emerald-300"><CapIcon size={17} /></span> Salary Cap</span>}>
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>This mode is always played under Salary Cap rules. Each player starts with a <span className="text-emerald-300 font-semibold">100% budget</span>, independent of the other.</p>
          <p>Every player costs a slice of that budget by quality — a superstar eats <span style={{ color: "#a78bfa" }}>~30%</span>, a role player <span style={{ color: "#fb923c" }}>4%</span>. Each roster's best men carry a star premium (14/10/7% floors), so nobody's franchise player comes cheap.</p>
          <p className="text-gray-400 text-xs">Fit all 9 contracts — 5 starters, 4 bench — before your cap runs out. A player you can't afford shows locked in the list.</p>
        </div>
      </InfoModal>

      <InfoModal open={modal === "series"} onClose={() => setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-yamabuki"><TrophyIcon size={17} /></span> Best-of-7 Series</span>}>
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>Once both rosters are drafted and both coaches are hired, the two lineups face off in a <span className="text-white font-medium">best-of-7 series</span> — same engine as the single-player season sim, home court in a 2-2-1-1-1 pattern.</p>
          <p>Simulate one game at a time and read the full box score — minutes, points, rebounds, assists, steals, blocks — for both rosters before moving to the next game.</p>
          <p className="text-gray-400 text-xs">First to 4 wins takes the series.</p>
        </div>
      </InfoModal>
    </>
  );
}
