import { useNavigate } from "react-router-dom";
import {
  TargetIcon, WheelIcon, CoachIcon, TrophyIcon, CardsIcon, WarnIcon,
  CapIcon, UsersIcon, LinkIcon, DnaIcon, LoopIcon, StarIcon,
} from "./GameIcons";
import RulesSheet from "./RulesSheet";
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
  const navigate = useNavigate();
  if (!mode) return null;
  const cfg = MODES[mode.key];
  if (!cfg) return null;

  // Handoff 17c: anahtar/değer satırları. İçerik aynı, yalnız sunum değişti.
  const sections = [
    { title: "How a run plays out", rows: cfg.flow.map(([, k, v]) => ({ k, v })) },
    { title: "What's different here", rows: cfg.extras.map(([, c, k, v]) => ({ k, v, c })) },
    { title: "How your lineup is scored", rows: SCORE.map(([name, w, c, v]) => ({ k: `${name} · ${w}`, v, c })) },
  ];
  return (
    <RulesSheet accent={mode.accent} title={mode.title} sub={cfg.tagline}
      sections={sections}
      footnote={<>Slotting a player at their natural position earns a chemistry bonus, and real award
        tags (MVP, rings, iconic duos) feed small boosts into the simulation.</>}
      cta={mode.path ? { label: `Start ${mode.title}`, onClick: () => navigate(mode.path) } : null}
      onClose={onClose} />
  );
}
