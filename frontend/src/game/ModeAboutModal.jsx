import {
  TargetIcon, WheelIcon, CoachIcon, TrophyIcon, CardsIcon, WarnIcon,
  CapIcon, UsersIcon, LinkIcon, DnaIcon, TagIcon, LoopIcon, StarIcon,
} from "./GameIcons";
import "./game.css";

// ── Moda özel "About" pop-up'ı ─────────────────────────────────────────────
// Eskiden hem giriş ekranında hem her oyunun kendi ana ekranında ayrı bir
// "How to Play" modalı vardı; aynı bilgi iki yerde duruyordu. Artık tek yer
// burası: her mod kartının ⓘ düğmesi kendi kurallarını açıyor.
//
// İçerik uydurulmuyor — akış ve sayılar oyunun kendi kodundan (lineupScore,
// salary.js, useCounterJoker, headToHead) geliyor.

const SCORE = [
  ["Quality", "45%", "#60a5fa", "Each player's overall, scaled by how far their prime sits from your sim era, then by position fit."],
  ["Coverage", "40%", "#4ade80", "Whether your archetypes collectively cover Creation, Spacing, Defense and Finishing."],
  ["Chemistry", "15%", "#FFB11B", "A penalty for redundancy — stacking three ball-dominant Engines costs you."],
];

const MODES = {
  single: {
    tagline: "Solo run · leaderboard scored",
    flow: [
      [TargetIcon, "Pick your era", "The whole run simulates inside one era. Distance from a player's real prime costs power — one era off ≈ −3%, five ≈ −22%."],
      [WheelIcon, "Spin & draft 9", "Two wheels land on a random season and team; you draft one player off that exact roster. 5 starters + 4 bench."],
      [CoachIcon, "Hire a coach", "Offense/Defense grades shift your rating all season. Championship rings add playoff DNA."],
      [TrophyIcon, "Simulate 82", "Full regular season, then playoffs — standings, awards, a champion, and your final grade."],
    ],
    extras: [
      [CardsIcon, "#f0abfc", "5 jokers", "Team, Year, Both, Pick 2 and Discover — one use each, per game."],
      [CapIcon, "#4ade80", "Two rule sets", "Classic is pure wheel luck. Salary Cap gives you a 100% budget where stars carry a premium."],
      [DnaIcon, "#60a5fa", "Overalls stay hidden", "You see the archetype, box score and tags while drafting — never the rating. Burn Discover to reveal them."],
    ],
  },
  "same-screen": {
    tagline: "2 players · 1 device · best-of-7",
    flow: [
      [TargetIcon, "Agree on an era", "Both rosters simulate in the same era, so it quietly decides which archetypes are worth drafting."],
      [LoopIcon, "Choose the wheel", "Round-based spins once per round and you fight over one roster. Pick-based spins fresh for every pick."],
      [UsersIcon, "Snake draft 9v9", "Nine picks each, alternating order — going second one round means going first the next."],
      [TrophyIcon, "Best-of-7 series", "Both lineups play a full series in 2-2-1-1-1 home court. Read every box score between games."],
    ],
    extras: [
      [CapIcon, "#4ade80", "Always Salary Cap", "Each side gets an independent 100% budget. Overspend early and you'll fill the bench with 4% role players."],
      [CardsIcon, "#f0abfc", "5 jokers each", "Team, Year, Both, Pick 2, Discover — yours alone, one use apiece."],
      [WarnIcon, "#f87171", "Counter-jokers", "BAN, Force Team and Force Year are played on your opponent's turn. A BAN can be voided if they spend a joker of their own."],
    ],
  },
  friend: {
    tagline: "2 devices · room code · live sync",
    flow: [
      [LinkIcon, "Create or join a room", "One of you creates a room and shares the short code; the other joins with it. You need an account."],
      [LoopIcon, "Set the wheel rule", "The room creator picks Round-based or Pick-based for both sides."],
      [UsersIcon, "Snake draft 9v9", "Every pick, joker and BAN appears on the other screen the moment it happens."],
      [TrophyIcon, "Best-of-7 series", "Same engine as Same Screen — first to 4 wins takes it."],
    ],
    extras: [
      [CapIcon, "#4ade80", "Always Salary Cap", "Independent 100% budgets, star premiums on each roster's best men."],
      [CardsIcon, "#f0abfc", "5 jokers each", "Plus the three counter-jokers you play on your opponent's clock."],
      [WarnIcon, "#f87171", "Counter-jokers", "BAN blocks a pick; Force Team and Force Year re-spin their wheel. Force effects can't be undone."],
    ],
  },
  online: {
    tagline: "Random opponent · or the top 25 board",
    flow: [
      [UsersIcon, "Pick your opponent", "Two ways in: queue for a random fan, or open The Board and challenge one of the 25 best Salary Cap rosters ever submitted."],
      [TargetIcon, "Their era, their rules", "A board roster was built for one era, and that's the era you draft in. No home-field advantage on either side."],
      [LoopIcon, "Draft nine", "Same wheels, same 100% cap, same five jokers. Against a live opponent you snake-draft; against the board their nine is already locked."],
      [TrophyIcon, "Best-of-7", "Both lineups play a full series in 2-2-1-1-1 home court, same engine as every other mode."],
    ],
    extras: [
      [CapIcon, "#4ade80", "The Board never waits", "Challenging a saved roster needs no second player online — the score you're chasing is already on the leaderboard."],
      [CardsIcon, "#f0abfc", "Jokers still apply", "Five personal jokers; counter-jokers only exist in live matches, since a frozen roster can't answer back."],
      [StarIcon, "#FFB11B", "Beat the number", "Win and the result is recorded against their entry — the board is a ladder, not a museum."],
    ],
  },
};

export default function ModeAboutModal({ mode, onClose }) {
  if (!mode) return null;
  const cfg = MODES[mode.key];
  if (!cfg) return null;
  const a = mode.accent;

  return (
    <div className="g-modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={e => e.stopPropagation()}
        style={{
          "--accent": a, "--accent-a": a + "26", "--accent-line": a + "55",
          maxWidth: "37rem", maxHeight: "86vh", display: "flex", flexDirection: "column", padding: 0,
        }}>
        {/* Panini dokusu — kartın kendi katmanları */}
        <div className="g-holo" />
        <span className="aura-blob" style={{ "--slot-color": a, left: "10%", top: -60, width: 280, height: 160, opacity: 0.28 }} />

        {/* Başlık — kart isim bandı diliyle */}
        <div className="shrink-0 px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div className="flex items-start gap-3.5">
            <div className="mode-emblem" style={{ width: 52, height: 52, borderRadius: 15, flexShrink: 0 }}>
              <mode.Icon size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-logo text-lg font-bold tracking-wide" style={{ color: a }}>{mode.title}</h3>
              <div className="g-mono mt-1" style={{ color: "var(--text-faint)" }}>{cfg.tagline}</div>
            </div>
            <button onClick={onClose} className="text-2xl leading-none shrink-0 transition-colors"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}>×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Akış — numaralı adımlar (Draft Process paneliyle aynı dil) */}
          <div>
            <div className="g-label mb-2.5">How a run plays out</div>
            <div className="space-y-2">
              {cfg.flow.map(([Icon, title, desc], i) => (
                <div key={title} className="g-step" style={{ "--accent": a, "--accent-a": a + "1a", "--accent-line": a + "3d", display: "block" }}>
                  <div className="flex items-start gap-3">
                    <span className="g-step-idx">{String(i + 1).padStart(2, "0")}</span>
                    <span className="shrink-0 mt-0.5" style={{ color: a }}><Icon size={17} /></span>
                    <div className="min-w-0">
                      <div className="g-step-title">{title}</div>
                      <div className="text-[11.5px] leading-relaxed mt-1" style={{ color: "var(--text-muted)" }}>{desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Moda özel mekanikler */}
          <div>
            <div className="g-label mb-2.5">What's different here</div>
            <div className="space-y-2">
              {cfg.extras.map(([Icon, hex, title, desc]) => (
                <div key={title} className="flex gap-3 items-start">
                  <span className="shrink-0 mt-0.5" style={{ color: hex }}><Icon size={16} /></span>
                  <div className="min-w-0">
                    <div className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{title}</div>
                    <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Skorlama — her modda ortak */}
          <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <div className="g-label mb-2.5">How your lineup is scored</div>
            <div className="space-y-2">
              {SCORE.map(([name, weight, hex, desc]) => (
                <div key={name} className="flex gap-3 items-start">
                  <span className="font-logo text-[11px] font-bold shrink-0 w-9 text-right" style={{ color: hex }}>{weight}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{name}</div>
                    <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 items-start pt-1">
                <span className="shrink-0 mt-0.5" style={{ color: "#FFB11B" }}><StarIcon size={15} /></span>
                <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  On top of that, slotting a player at their natural position earns a
                  {" "}<b style={{ color: "var(--text-primary)" }}>chemistry</b> bonus, and real award tags
                  {" "}(<TagIcon size={11} /> MVP, rings, iconic duos) feed small boosts into the simulation.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
