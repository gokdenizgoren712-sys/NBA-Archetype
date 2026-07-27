import { useLang } from "../contexts/LanguageContext";
import { SEO } from "../hooks/useSEO";
import { Logo } from "../components/BrandIcons";

const CHANGELOG = [
  {
    version: "v1.4.0",
    date_en: "July 2026",
    label_en: "4 Game Modes + Same Screen (Head-to-Head) + BAN Joker",
    items_en: [
      "The Lineup Builder now opens on a mode-select screen: Single Player (live), Same Screen (live), With a Friend and Online Opponent (both marked Coming Soon — arriving with the rebrand)",
      "New mode: Same Screen — two players draft head-to-head on one device. Every round the wheel spins once for both; you draft from the same shared roster in snake order, so going second one round means going first the next",
      "New joker, exclusive to head-to-head play: BAN. While your opponent is on the clock, spend it to block one player from their pick — but if they respond with any joker of their own, your ban is voided (though it's still spent)",
      "No court in Same Screen — with two players sharing one screen, the layout is two side-by-side mobile-style panels instead, each with its own 9-man roster, 5 solo jokers, and the shared BAN",
      "Single Player's start screen re-centered: the half-court preview now sits in the true middle of the page with the how-it-works and mechanics panels flanking it symmetrically, plus a layout bug where the Role-15% score segment could overflow its card is fixed",
      "Shared game UI pieces (spin wheel, lineup slots, player rows, joker buttons, info modal) split out into their own reusable files so Same Screen and Single Player stay in sync instead of drifting apart",
    ],
  },
  {
    version: "v1.0.0",
    date_en: "June – July 2026",
    label_en: "Launch — Multi-League Archetype Engine + Lineup Builder Game",
    items_en: [
      "12 core archetypes + 22 modifier tags, percentile-based scoring so players are comparable across eras and leagues instead of by raw stats",
      "Four leagues live: NBA (current + full historical back to 1983), G-League, NCAA, and EuroLeague — each scored within its own league percentiles, with real season/team/conference/tier filters",
      "Prospect grading (floor/ceiling/grade/tier) and a comparables engine ('projects like a young X', matched against the 1983+ NBA rookie-season pool)",
      "Lineup & duo compatibility engine, and an archetype affinity matrix (partly grounded in real NBA lineup outcome data for the current season)",
      "Lineup Builder game: spin-and-draft 9-man rosters across any era, Classic or Salary Cap mode, jokers, a coach draft, and a full 82-game + playoff season simulation with awards, dynasties, and a leaderboard",
      "Accounts, admin panel, blog/CMS, community tag corrections, and the full Primary Arch dark brand system (Rajdhani/Outfit type, yamabuki/asagi palette) across every page",
    ],
  },
];

const WHAT = [
  {
    icon: "🏷",
    title: "Archetype Tagging",
    text: `Using 12 core archetypes (Ecosystem, Engine, Anchor, Spacer…) and 22 modifier tags (Pressure, Gravity, Switchable…), we assign a multi-layered identity to each player. Tags are grounded in a hand-crafted jargon dictionary; metrics validate and extend these definitions.`,
  },
  {
    icon: "📐",
    title: "Percentile-Based Scoring",
    text: `Raw statistics are not comparable across eras. All metrics are converted to within-season percentile ranks — the only reliable way to evaluate a 1990 player on the same scale as a 2025-26 player.`,
  },
  {
    icon: "🔗",
    title: "Lineup Compatibility",
    text: `A compatibility engine built on 11 functional role slots (Primary Creation, Floor Spacing, Interior Defense…) computes the theoretically best 5-man lineups with real NBA dynamics baked in.`,
  },
  {
    icon: "📚",
    title: "Historical Depth",
    text: `All seasons from 1989-90 onward. Fallback signatures handle missing tracking and hustle metrics in older seasons, allowing Michael Jordan and Shai Gilgeous-Alexander to be evaluated within the same framework.`,
  },
  {
    icon: "🗺",
    title: "Archetype Map",
    text: `The 12-dimensional score vector is projected to 2D and visualized as an interactive scatter plot. See which players are similar, how archetypes cluster, and the demographic spread of the league.`,
  },
];

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-0.5 h-4 rounded-full" style={{ background: "var(--accent)" }} />
      <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{children}</h2>
    </div>
  );
}

export default function About() {
  const { lang } = useLang();

  return (
    <>
    <SEO
      title="About"
      description="Learn how the Primary Arch system works: 12 core roles, 22 modifier tags, percentile-based scoring across every season since 1983. Full changelog and methodology."
      path="/about"
    />
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto pb-16">
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 items-start">

          {/* Left column */}
          <div className="flex-1 space-y-10 min-w-0">

            {/* Hero */}
            <div className="text-center pt-4 pb-2">
              <div className="flex justify-center mb-3"><Logo size={44} /></div>
              <h1 className="font-logo text-xl font-bold mb-1 tracking-wide" style={{ color: "var(--accent)" }}>PRIMARY ARCH</h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Understanding basketball through identities, not just numbers.
              </p>
            </div>

            {/* Mission & Vision */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  label: "Mission",
                  text: `To understand the NBA through identities, not just numbers. Every player is more than a stat line — their role on the floor, their contribution to the team system, and the pressure they apply on opponents together form an "archetype."`,
                },
                {
                  label: "Vision",
                  text: `A reference platform bridging scouting jargon with statistical depth. A system where you can see at a glance whether a player is an "Ecosystem Engine" or a "Pressure Three-Level Creator," test lineup compatibility, and compare across historical eras.`,
                },
              ].map(({ label, text }) => (
                <div key={label} className="p-5 rounded"
                  style={{ border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>{label}</div>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{text}</p>
                </div>
              ))}
            </div>

            {/* What we do */}
            <div>
              <SectionLabel>What We Do</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {WHAT.map(({ icon, title, text }) => (
                  <div key={title} className="p-4 rounded"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{icon}</span>
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{title}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Philosophy */}
            <div className="p-6 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <SectionLabel>Philosophy</SectionLabel>
              <div className="space-y-3">
                {[
                  `Basketball analysis too often lives in two separate worlds: abstract statistics detached from the game, and scouting jargon that ignores the numbers. We're building a language that bridges both.`,
                  `A player is not simply "good" or "bad" — they are "fit" or "misfit" in the right system, the right roster context. Nikola Jokić can be the centerpiece of a five-man unit or create redundancy next to another dominant Force player. The archetype system makes this compatibility visible.`,
                  `We trust the data, but we also know data doesn't tell the whole story. That's why alongside the calculations we provide auto-generated lineup explanations, role breakdowns, and season-level win correlations.`,
                ].map((para, i) => (
                  <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{para}</p>
                ))}
              </div>
            </div>

            {/* Authors */}
            <div>
              <SectionLabel>Created By</SectionLabel>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                  GG
                </div>
                <div className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Gökdeniz Gören</div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="pt-6 border-t text-center" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
                This site is not an official NBA product. All data is sourced from stats.nba.com via the nba_api library.
                Archetype definitions and tags are entirely the product of original interpretive work.
              </p>
              <p className="text-[10px] mt-2" style={{ color: "var(--text-faint)" }}>© 2025-26 · Gökdeniz Gören</p>
            </div>
          </div>

          {/* Right column — changelog */}
          <div className="w-full md:w-72 md:shrink-0 md:sticky md:top-6 space-y-3">
            <SectionLabel>Release Notes</SectionLabel>
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="p-4 rounded space-y-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ color: "var(--accent)", background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}>
                    {entry.version}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{entry.date_en}</span>
                </div>
                <div className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{entry.label_en}</div>
                <ul className="space-y-1.5">
                  {entry.items_en.map((item, i) => (
                    <li key={i} className="flex gap-2 text-[11px] leading-relaxed">
                      <span style={{ color: "var(--accent)" }} className="shrink-0 mt-0.5">+</span>
                      <span style={{ color: "var(--text-muted)" }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-[10px] text-center pt-1" style={{ color: "var(--text-faint)" }}>
              More updates coming soon
            </p>
          </div>

        </div>
      </div>
    </div>
    </>
  );
}
