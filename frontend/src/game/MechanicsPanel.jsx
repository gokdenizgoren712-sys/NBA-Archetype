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
import "./game.css";

const CARDS = [
  { key: "jokers",  Icon: CardsIcon,  hex: "#FFB11B", title: "Jokers",         desc: "5 one-time abilities, each player" },
  { key: "counter", Icon: WarnIcon,   hex: "#f87171", title: "Counter-Jokers", desc: "BAN · Force Team · Force Year" },
  { key: "cap",     Icon: CapIcon,    hex: "#4ade80", title: "Salary Cap",     desc: "100% budget, star premiums" },
  { key: "series",  Icon: TrophyIcon, hex: "#c084fc", title: "Best-of-7",      desc: "Game-by-game box scores" },
];

export default function MechanicsPanel() {
  const [modal, setModal] = useState(null);
  const activeHex = CARDS.find(c => c.key === modal)?.hex || "#FFB11B";
  return (
    <>
      {/* Single Player'daki "How Scoring Works" paneliyle aynı iskelet:
          önce ağırlık şeridi + formül, sonra ayırıcı, sonra mekanik kartları. */}
      <div className="g-panel p-4 space-y-4">
        <span className="aura-blob" style={{ "--slot-color": "#c084fc", right: "12%", top: -44, width: 200, height: 110, opacity: 0.14 }} />
        <div className="g-label">How Scoring Works</div>

        <div>
          <div className="flex h-9 rounded-xl overflow-hidden text-[10.5px] font-bold font-logo tracking-wide"
            style={{ border: "1px solid rgba(255,255,255,.08)" }}>
            <div className="flex items-center justify-center min-w-0 overflow-hidden whitespace-nowrap"
              style={{ width: "45%", background: "linear-gradient(90deg,#1D428A,#2a5cb8)", color: "#dbeafe" }}>QUALITY 45%</div>
            <div className="flex items-center justify-center min-w-0 overflow-hidden whitespace-nowrap"
              style={{ width: "40%", background: "linear-gradient(90deg,#274690,#3b5ba8)", color: "#dbeafe" }}>COVERAGE 40%</div>
            <div className="flex items-center justify-center min-w-0 overflow-hidden whitespace-nowrap"
              style={{ width: "15%", background: "rgba(255,255,255,.06)", color: "var(--text-muted)" }}>ROLE 15%</div>
          </div>
          <p className="text-[11.5px] mt-2.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Both rosters are graded on the same scale, then played head-to-head —
            {" "}<b style={{ color: "var(--text-primary)" }}>Quality</b> is talent adjusted for era fit,
            {" "}<b style={{ color: "var(--text-primary)" }}>Coverage</b> is how completely your archetypes span the floor,
            {" "}<b style={{ color: "var(--text-primary)" }}>Role</b> penalises redundancy.
          </p>
        </div>

        <div className="pt-1" style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <div className="g-label mt-3 mb-2.5">Match Mechanics</div>
          <div className="grid grid-cols-2 gap-2">
            {CARDS.map(({ key, Icon, hex, title, desc }) => (
              <button key={key} onClick={() => setModal(key)} className="g-tile"
                style={{ "--accent": hex, "--accent-a": hex + "1a", "--accent-line": hex + "4d", padding: "12px 13px" }}>
                <span className="aura-blob" style={{ "--slot-color": hex, right: -18, top: -18, width: 96, height: 70, opacity: 0.22 }} />
                <div className="g-tile-title" style={{ fontSize: 12.5 }}>
                  <span style={{ color: hex }}><Icon size={14} /></span> {title}
                </div>
                <div className="g-tile-desc" style={{ marginTop: 5, fontSize: 10.5 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <InfoModal accent={activeHex} open={modal === "jokers"} onClose={() => setModal(null)}
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
          <p className="text-[12.5px] pt-2 mt-1" style={{color:"var(--text-faint)",borderTop:"1px solid rgba(255,255,255,.08)"}}>Each player has their own 5 jokers, one use each per game.</p>
        </div>
      </InfoModal>

      <InfoModal accent={activeHex} open={modal === "counter"} onClose={() => setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span style={{ color: "#f87171" }}><WarnIcon size={17} /></span> Counter-Jokers</span>}>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Three extra <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>vs-mode-only</span> jokers you play on
            your <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>opponent's</span> turn, not your own. You get
            one of each per game, and you may use only one per pick.
          </p>

          {[
            [WarnIcon, "#f87171", "BAN",
              "Block one player from the roster your opponent is currently drafting from — they cannot take that player."],
            [RefreshIcon, "#60a5fa", "Force Team",
              "Re-spin the team wheel on their turn. Same season, a different roster — whatever they were eyeing is gone."],
            [CalendarIcon, "#c084fc", "Force Year",
              "Re-spin the season wheel on their turn. A whole different era lands, so the entire player pool changes."],
          ].map(([Icon, hex, name, desc]) => (
            <div key={name} className="flex gap-3 items-start">
              <span className="shrink-0 mt-0.5" style={{ color: hex }}><Icon size={17} /></span>
              <div>
                <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{name}</div>
                <div className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</div>
              </div>
            </div>
          ))}

          <p className="text-xs leading-relaxed pt-2" style={{ color: "var(--text-faint)", borderTop: "1px solid rgba(255,255,255,.08)" }}>
            BAN can be answered: if the targeted player's owner spends any of their own jokers on that same pick, the BAN is
            voided and the player is pickable again — though your BAN is still gone. Force Team and Force Year take effect
            immediately and can't be undone.
          </p>
        </div>
      </InfoModal>

      <InfoModal accent={activeHex} open={modal === "cap"} onClose={() => setModal(null)}
        title={<span className="inline-flex items-center gap-2"><span className="text-emerald-300"><CapIcon size={17} /></span> Salary Cap</span>}>
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>This mode is always played under Salary Cap rules. Each player starts with a <span className="text-emerald-300 font-semibold">100% budget</span>, independent of the other.</p>
          <p>Every player costs a slice of that budget by quality — a superstar eats <span style={{ color: "#a78bfa" }}>~30%</span>, a role player <span style={{ color: "#fb923c" }}>4%</span>. Each roster's best men carry a star premium (14/10/7% floors), so nobody's franchise player comes cheap.</p>
          <p className="text-gray-400 text-xs">Fit all 9 contracts — 5 starters, 4 bench — before your cap runs out. A player you can't afford shows locked in the list.</p>
        </div>
      </InfoModal>

      <InfoModal accent={activeHex} open={modal === "series"} onClose={() => setModal(null)}
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
