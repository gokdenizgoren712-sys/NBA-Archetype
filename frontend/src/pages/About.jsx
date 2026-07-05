import { useLang } from "../contexts/LanguageContext";
import { SEO } from "../hooks/useSEO";

const CHANGELOG = [
  {
    version: "v3.6 — Phase D+E",
    date_en: "July 2026",
    label_en: "Minutes, Fatigue & the THREEPEAT",
    items_en: [
      "Rotation editor before every sim: 35 min per starter, 25/15/13/12 off the bench (a real 240-minute game), each adjustable ±5 within a minute bank",
      "Minutes drive everything: contributions and stat lines are minute-weighted (the old fixed 78/22 split is gone)",
      "Fatigue: 37+ minutes bleeds rating (39 min ≈ −4.5%); resting starters under 32 banks playoff freshness (up to +2)",
      "Contract curve + Timeless recalibrated to the REAL score distribution: supermax club is now Jokić/SGA/Dončić/Wemby (~30%), Timeless = the season's top five (≥75)",
      "THE THREEPEAT: win it all, then defend the title — the roster ages every extra season. Three straight rings earns the 👑 crown on the leaderboard",
      "Dynasty flow: back-to-back banner, dynasty-over epitaph, REPEAT/THREEPEAT recorded per player",
    ],
  },
  {
    version: "v3.6 — Phase C3",
    date_en: "July 2026",
    label_en: "Team-Relative Contracts + Detailed Sim Stats",
    items_en: [
      "Star premium: every roster's top 3 players carry contract floors of 14% / 10% / 7% — a weak team's franchise player never comes cheap (real cap logic, and a deliberate 'bad contract' trap)",
      "Cost curve bottom degraded: 0.60→7%, 0.55→5%, floor 4% only for true end-of-bench — no more 'entire roster costs 4%' spins",
      "Cheap-fill strategy survives: beyond the top 3, weak rosters are still bargain bins for bench spots",
      "Season stat lines expanded: STL, BLK and 3P% per player plus a TEAM totals row",
    ],
  },
  {
    version: "v3.6 — Phase C2",
    date_en: "July 2026",
    label_en: "Era Report + Timeless Rework",
    items_en: [
      "TIMELESS threshold lowered 90 → 85 overall — Durant/Curry-class stars now travel across eras like the true greats",
      "Lineup Analysis replaced by the Era Report: pillar importance changes per era (Defense ×1.40 in Dead Ball, Spacing ×1.45 in Small Ball) with KEY/CORE/MINOR badges",
      "Era weights feed the actual score: coverage is now the era-weighted pillar average — the same roster grades differently in different eras",
      "Era weapon / era liability callouts: a weak KEY pillar warns it will cost you games; a strong MINOR pillar admits the era barely pays for it",
      "Redundant sections removed: duplicate coverage bars and the generic verdict paragraph are gone — pillars live in one place",
    ],
  },
  {
    version: "v3.6 — Phase C",
    date_en: "July 2026",
    label_en: "Salary Cap % + Open Archetypes",
    items_en: [
      "Salary Cap mode rebuilt: tier quotas (2S/2A/2B/2C/1D) replaced by a real 100% cap — every player costs a slice by quality (superstar ~30%, role player 4% minimum)",
      "Contract price shown on every row; players over your spendable cap are locked. Each pick reserves 4% per remaining slot so you can always finish the roster",
      "Spin guarantee reworked for budgets: rosters with nothing affordable auto-respin",
      "Archetypes are now visible while drafting in both modes — overalls stay hidden. Contract price, stats and tags are your quality clues",
      "Discover joker now reveals hidden overalls only",
      "Start screen visualized: 4-step flow strip and a weighted formula bar instead of three paragraphs",
    ],
  },
  {
    version: "v3.6 — Phase B",
    date_en: "July 2026",
    label_en: "Era Distance Model + 3P%",
    items_en: [
      "Era effect is now pure distance to YOUR chosen era (eraball model): same era full power, each step away costs more (−6% → −44%)",
      "Archetype-meta multipliers removed from player quality — archetypes now speak only through lineup coverage, where they belong",
      "Draft score and season sim share one era-distance formula; the score card shows 'built for the [era]'",
      "TIMELESS greats (overall ≥ 90) ignore distance — Bird and Magic travel, their role players don't",
      "3P% added to the pick list stats and sort tabs",
      "Roster Breakdown rows show −N era distance and TL badges instead of meta arrows",
    ],
  },
  {
    version: "v3.6 — Phase A",
    date_en: "July 2026",
    label_en: "Game UI Overhaul — Tags Panel + Unified Roster Table",
    items_en: [
      "Player Tag Effects panel: a fourth mechanic card on the start screen opens an eraball-style color-striped guide for all 8 tags",
      "Post-game screen decluttered: Final Lineup + Player Quality + Era Fit merged into one Roster Breakdown table (position, name, archetype, era, tags, quality bar) covering starters, bench and coach",
      "Score card visualized: three weighted stat tiles (Quality 45% / Coverage 40% / Role Fit 15%) instead of text lists",
      "Readability pass: faint labels brightened (slate-600 → slate-400), body fonts bumped, result page widened",
    ],
  },
  {
    version: "v3.5.1",
    date_en: "July 2026",
    label_en: "Game Balance + Pick List Redesign",
    items_en: [
      "Player pick screen rebuilt as a scouting list: headshots, award tag chips, tier letters, sortable stat columns (TAGGED/PTS/REB/AST/STL/BLK) and a G/F/C position filter",
      "Draft score formula reworked: 45% player quality + 40% coverage + 15% role fit (weighted sum) — the old multiplication crushed every draft into the 47-57 band",
      "Grades recalibrated: S ≥ 85, A ≥ 78, B ≥ 70, C ≥ 62 — a typical draft lands C+/B, a great one is genuinely reachable",
      "Era Fit panel fixed: it now actually measures how well a player's archetype profile matched their era's meta (the old ×5 formula saturated at 100 for any good player)",
    ],
  },
  {
    version: "v3.5 — Phase 3b",
    date_en: "July 2026",
    label_en: "Salary Cap Draft Mode",
    items_en: [
      "New game mode: build within tier limits — 2 S · 2 A · 2 B · 2 C · 1 D across your 9 spots",
      "Tiers computed from overall score (S ≥ 87, A ≥ 78, B ≥ 70, C ≥ 58, D below) and shown on every card",
      "Players from full tiers are locked out; every spin guarantees at least one open-tier player or auto-respins",
      "Tier hunt failsafe: after 15 fruitless spins a wildcard round opens the whole roster",
      "Live quota tracker (S/A/B/C/D) under the progress bar",
      "Salary Cap has its own leaderboard — scores saved and ranked per mode",
    ],
  },
  {
    version: "v3.5 — Phase 3a",
    date_en: "July 2026",
    label_en: "Season Awards from Simulated Stats",
    items_en: [
      "Every simulated season now produces per-player stat lines: real PTS/REB/AST scaled by sim effectiveness (era meta, era distance, position penalty) and minutes share",
      "League MVP: requires a 55+ win season and a dominant leader — odds scale with quality and wins",
      "All-NBA and All-Star selections for high-performing starters",
      "Defensive POY from the best defensive composite (Anchor / Stopper / Two-Way) on a 48+ win team",
      "Sixth Man of the Year for the best bench player — real 6MOY winners get better odds",
      "Finals MVP awarded to your best starter when you win it all",
    ],
  },
  {
    version: "v3.5 — Phase 2.5",
    date_en: "July 2026",
    label_en: "Court View + Player Tags",
    items_en: [
      "Split-pane game: controls on the left, a live half-court on the right — always visible while drafting",
      "Free rearranging: tap a player then a slot to move or swap, any time between picks (penalties recompute live)",
      "Balanced bench buff: covering Guard + Forward + Center on the bench earns a small rating bonus",
      "Real-history player tags: MVP, DPOY, Champion (rings), Finals MVP, 6th Man, Dynamic Duo, Timeless, Versatile",
      "Tag effects in the sim: MVP/DPOY boost the season, rings boost playoffs, Finals MVP activates only in the Finals, 6th Man only off the bench",
      "Dynamic Duos (Jordan+Pippen, Shaq+Kobe, Jokic+Murray...) activate when both are drafted",
      "Timeless stars (overall ≥ 90) shrug off era distance penalties — computed from data, not curated",
    ],
  },
  {
    version: "v3.5 — Phase 2",
    date_en: "July 2026",
    label_en: "Game Overhaul — 9-Man Rosters, Position Penalties, Coach Draft",
    items_en: [
      "Rosters expanded to 9 spots: 5 starters + 4 bench — starters carry ~78% of the simulation load",
      "Positional fit penalties: natural spot is free, one position off −10%, way off −25%",
      "FLEX players (Versatile tag) slot anywhere with no penalty — computed from data, not hand-picked",
      "Coach draft: 40 curated coaches with O/D grades that shift your season rating",
      "Championship coaches carry playoff DNA — each ring boosts your playoff rating (Phil Jackson caps the scale)",
      "OFF GURU / DEF GURU coach tags, bench-aware star power, and per-slot penalty preview while drafting",
    ],
  },
  {
    version: "v3.5 — Phase 1",
    date_en: "July 2026",
    label_en: "Game Overhaul — Season Simulation",
    items_en: [
      "Pick your simulation era before drafting — your five will live or die by that era's meta",
      "Full 82-game season simulated game by game: opponents, home/away, hot streaks and skids",
      "Make the playoffs at 41+ wins, then survive four best-of-7 rounds to win the ring",
      "Era modifiers: archetype meta weight (a Spacer thrives in Small Ball, drowns in the 80s) plus a distance penalty for players far from their home decade",
      "Star power matters more in the playoffs — team rating shifts toward your best player",
      "Run It Back: re-simulate the same roster for a different outcome (only the first run counts)",
      "Leaderboard now shows win totals and a 🏆 badge for simulated champions",
    ],
  },
  {
    version: "v3.1",
    date_en: "July 2026",
    label_en: "Multi-League — G-League + League Nav Icons",
    items_en: [
      "G-League players page with full archetype scoring (league-internal percentiles, current season only)",
      "Custom SVG league icons in the left nav: NBA, G-League, NCAA, EuroLeague",
      "BPM proxy computed from box-score stats for G-League players (no external scraping)",
      "NCAA and EuroLeague placeholders added — full data pipelines in v3.2",
      "Mobile nav filters out Coming Soon league pages to avoid dead taps",
    ],
  },
  {
    version: "v3.0",
    date_en: "July 2026",
    label_en: "Living Platform — Tag Corrections + Confidence Bands + Manual Refresh",
    items_en: [
      "Users can now flag incorrect archetypes directly from a player's profile page",
      "Admin review panel: approve / reject corrections, then apply with one click",
      "Approved corrections update primary_arch in scores and widen the ground truth set for validation",
      "Confidence band on score bars and radar: wider range for low-sample players (GP<30)",
      "Admin data panel: 'Refresh Now' button triggers a full pipeline re-run (fetch + score rebuild)",
    ],
  },
  {
    version: "v2.7",
    date_en: "July 2026",
    label_en: "UI Refresh — Deep Black + NBA Colors",
    items_en: [
      "Backgrounds deepened to near-pure black across the entire app",
      "NBA red (#C8102E) accent line on the left nav border, top bar, and mobile nav",
      "Score bars in LineupGame now use NBA blue (#1D428A)",
      "LineupGame tile widened (max-w-xl → max-w-2xl) for better readability",
      "All small in-game font sizes bumped +0.5px (8→8.5, 9→9.5, 10→10.5, 11→11.5px)",
    ],
  },
  {
    version: "v2.6",
    date_en: "June 2026",
    label_en: "LineupGame Completion",
    items_en: [
      "Profile save bug fixed — players now correctly saved to your profile",
      "Ball-dominant players now shown by name (e.g. 'LeBron, Durant — 2 playmakers')",
      "Ball-dom penalty now graduated: 1 playmaker = 0%, 2 = −5%, 3 = −18%, 4 = −33%, 5 = −50%",
      "Context note: high usage on a weak team ≠ ball-dominant in a strong lineup",
      "Era fit now uses weighted top-5 archetypes (not just primary) for more accurate scoring",
      "Post-game archetype affinity score — average pairwise synergy of your 5 players",
      "Global leaderboard: top 10 scores shown after each game (auto-saved if logged in)",
    ],
  },
  {
    version: "v2.5",
    date_en: "June 2026",
    label_en: "Player Profile Pages",
    items_en: [
      "Every player now has a permanent URL — /players/:name — shareable and SEO-indexed",
      "Player profile page: radar, stats, core scores, modifiers, career timeline, similar players",
      "Share button (Web Share API on mobile, clipboard fallback on desktop)",
      "DetailPanel ↗ button opens the player's profile page in-app",
      "Dynamic sitemap: all 500+ player profiles included in /sitemap.xml for search engine indexing",
    ],
  },
  {
    version: "v2.4",
    date_en: "June 2026",
    label_en: "Data Quality Sprint",
    items_en: [
      "BPM proxy (OBPM/DBPM) now injected at pipeline step 1 — Engine, Creator, Anchor scores more accurate",
      "build_score_table() and run_validation.py both get BPM as a safety net",
      "Affinity alpha is now per-pair adaptive (0→0.6 based on lineup minutes) instead of a fixed 0.3",
      "Small sample badge (~small sample) on player cards with fewer than 20 games played",
      "DetailPanel warning banner for low-GP players — scores flagged as potentially unstable",
    ],
  },
  {
    version: "v2.3",
    date_en: "June 2026",
    label_en: "Auth & UI Polish",
    items_en: [
      "Google Sign-In added to Login and Register pages",
      "Google-only accounts stored securely; password login blocked for OAuth users",
      "UI fully in English — 'Giriş' → 'Log In', all Turkish error messages translated",
      "Admin route ordering bug fixed (DELETE /users/all no longer shadowed by /{user_id})",
      "Password reset flow via Gmail SMTP App Password",
    ],
  },
  {
    version: "v2.2",
    date_en: "June 2026",
    label_en: "Historical Seasons & Affinity Engine",
    items_en: [
      "Affinity page: SplitPane layout — click any cell to see real lineups in a side panel",
      "Affinity now mobile-friendly with full-screen drill-down panel",
      "Compare page: independent season selector per player — compare across eras (e.g. 2003 Kobe vs 2025 SGA)",
      "Lineups page: season selector — browse theoretical lineups for any season since 1983",
      "Custom lineup builder now works for historical seasons with autocomplete search",
      "OBPM / DBPM breakdown added to Compare stats",
      "BPM, PTS, REB, AST now returned for all historical seasons",
    ],
  },
  {
    version: "v2.1",
    date_en: "June 2026",
    label_en: "Mobile Fixes & Scoring Overhaul",
    items_en: [
      "Mobile bottom nav: split into two rows (4 + 3) for easier tapping",
      "Fixed Glossary, About, Explore pages not rendering on mobile",
      "About page layout adapts to mobile (single column)",
      "Lineup Game year joker no longer changes the team",
      "New two-stage scoring: Player Quality (overall × era) × Lineup Coverage",
      "Score reveal shows per-player era-adjusted quality + 4-pillar coverage breakdown",
      "Specialist players no longer penalized — coverage uses max across lineup",
    ],
  },
  {
    version: "v2.0",
    date_en: "June 2026",
    label_en: "Design Overhaul",
    items_en: [
      "Full UI redesign — amber/gold theme, deep black background",
      "Top bar + left icon sidebar + mobile bottom nav (VS Code style)",
      "Split-pane layout for Players, Explore, Glossary",
      "Explore: click a dot to open player detail panel",
      "Glossary: Components and Eras sections with click-to-select detail",
      "Players: team filter for historical seasons, career tab for all players, SVG career chart",
      "Historical modifier scores computed on-the-fly",
      "Career tab enabled for historical players",
    ],
  },
  {
    version: "v1.2",
    date_en: "June 2026",
    label_en: "Players Page Overhaul",
    items_en: [
      "Historical seasons: card grid view (no table), team filter",
      "Modifier scores for historical players (computed on-the-fly)",
      "Career tab enabled for all seasons",
      "SVG line chart for career overall_score trajectory",
      "Modifier filter removed from current season",
    ],
  },
  {
    version: "v1.1",
    date_en: "June 2026",
    label_en: "Game & Position Update",
    items_en: [
      "Historical player positions fixed — LeBron, Kawhi now correctly shown as SF/PF",
      "Post-game analysis suggests a specific player for your weakest pillar",
      "2TM/3TM/TOT rows removed from game",
      "Jokers no longer re-spin the same season or team",
      "Era Fit system added to Lineup Builder game",
      "Discover joker: see archetypes before picking",
    ],
  },
  {
    version: "v1.0",
    date_en: "June 2026",
    label_en: "Initial Release",
    items_en: [
      "12 core archetypes + 22 modifier tag system",
      "Percentile-based scoring for all players from 1989-90 to present",
      "5-pillar lineup fit engine (Creation · Spacing · Defense · Finishing · Role Fit)",
      "Archetype affinity matrix",
      "Historical player search with radar profiles",
      "Lineup Builder game — build a roster across different eras",
      "Player comparison page",
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
      title="About NBA Archetype"
      description="Learn how the NBA Archetype system works: 12 core roles, 22 modifier tags, percentile-based scoring across every season since 1983. Full changelog and methodology."
      path="/about"
    />
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto pb-16">
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 items-start">

          {/* Left column */}
          <div className="flex-1 space-y-10 min-w-0">

            {/* Hero */}
            <div className="text-center pt-4 pb-2">
              <div className="text-4xl mb-3">🏀</div>
              <h1 className="text-xl font-bold mb-1" style={{ color: "var(--accent)" }}>NBA Archetype</h1>
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
