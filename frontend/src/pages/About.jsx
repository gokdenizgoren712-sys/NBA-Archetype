import { useState } from "react";
import { Link } from "react-router-dom";
import ExploreHeader from "../components/explore/ExploreHeader";
import { FUNDAMENTALS_TABS } from "./Glossary";
import { CORE_COMPONENTS, MODIFIER_COMPONENTS } from "../data/glossary";
import { ARCHETYPE_COLOR } from "../constants/archetypeColors";
import "./fundamentals.css";

// ── Fundamentals · About & method (handoff 17a) ─────────────────────────────
// Solda okunur bölümler (24px başlık + 15px paragraf, ~68ch), sağda veriden
// gelen büyük sayılar + arketip renkleri + sürüm notları. Önceki emoji ikonlu
// açılır kartlar kalktı; her bölüm doğrudan ilgili sayfaya bağlanıyor.

const CHANGELOG = [
  // v1.5.0 notlarından (b33b267, 31 Temmuz) bu yana bu dala giren 214 commit,
  // kullanıcıya görünen haliyle gruplandı. RankIt'in kendi sürüm notları ayrı.
  {
    version: "v1.6.0", date: "September 2026",
    label: "Football, fantasy basketball, and a redesigned site",
    items: [
      "Two sports on one site: everything basketball now lives under /basketball, a new football section under /football, and the home page lets you pick. Every old link still redirects to its new address",
      "Football is live: Europe's big five leagues across ten seasons, 24 archetypes built for each phase of the game, player cards with licensed cut-out photos and credits, a glossary generated straight from the scoring engine, and an About page that says what the numbers can and can't tell you",
      "Squad chemistry for football, measured rather than assumed — every XI is ranked against the 28,388 starting elevens clubs actually fielded, and the page is honest that chemistry doesn't predict results on its own",
      "Football Spin & Build: draft an eleven from spun seasons and clubs, hire a manager, then play a full league season whose goal model is fitted to real matches (home advantage comes out at +0.31 goals). Same Screen, With a Friend rooms and Online head-to-heads are played as two-legged ties, with extra time and penalties, resolved on the server",
      "Basketball fantasy, brand new: rankings for 9-cat, 8-cat and points leagues with G- and Z-scores, punting and tiers; projections with honest ranges from game logs, backtested against a season they never saw; a draft plan for your slot, a mock draft with a graded result, a live draft assistant, a schedule heatmap, and saved leagues and drafts",
      "Online Opponent is live: matchmaking against another fan, or Board Challenge — draft against the 25 best Salary Cap rosters ever submitted. Rosters can now be saved to your profile",
      "Rewrite History grew up: it now replays the whole league on the real schedule, every one of the 30 rosters simulated, through a real play-in and playoff bracket with box scores, awards and a champion",
      "The whole site redesigned: a sidebar you can collapse, one sport switch, player lists with a filter column, archetype counts and Load more (football used to load 600 cards at once), a new player profile with a career chart and similar players, and a new Explore map, Compare and Affinity heat map",
      "The game screens rebuilt for both sports — mode select, draft, coach pick, results, rooms and lobbies — with no page asking you to scroll on arrival, and every game playable on a phone",
      "Numbers labelled for what they are: Lineup Fit is a score out of 100, not a percentile; football chemistry is shown as a percentile only where it truly is one; role similarity and head-to-head bars say how they're drawn",
      "Accounts: new sign-in and sign-up screens, delete your own account from the web, new passwords of 6–18 characters, and a profile that keeps basketball rosters and football squads apart",
      "Security hardening: stricter sign-in and rate limits, sanitised blog content, signed image uploads, and a test that keeps API keys out of the web bundle",
      "Blog, legal pages and contact rebuilt: a featured post and read times on the blog, one reading layout for the (still draft) legal pages, and a contact page that opens a ready-to-send email",
      "Admin: a Data page that shows how fresh every source is and refreshes the NBA season (the old sidebar button never had the rights to), one tab bar for every admin page, and confirmation before anything is deleted",
      "RankIt, our match-rating app, launched alongside: a web version at /rankit and Android alpha builds up to 0.7.1",
    ],
  },
  {
    version: "v1.5.0", date: "Late July 2026",
    label: "With a Friend (Online) live, counter-jokers, real award badges",
    items: [
      "With a Friend is live — the fourth and final promised mode. Draft head-to-head against another player over a real-time connection, complete with room codes, a live \"opponent's connection dropped\" banner if they disconnect, and game state that survives a server restart",
      "New Counter-Joker system, shared by Same Screen and With a Friend: while your opponent is on the clock, an automatic pop-up offers three one-time answers — BAN (block a player from their pick), Force Team, or Force Year (make them re-spin) — instead of a single all-purpose BAN button",
      "A full How to Play guide, reachable from the mode-select screen: three tiles covering every archetype and modifier, every joker and counter-joker, and a plain-language breakdown of the rating engine's actual weights plus each simulation era's meta",
      "Player cards now show real career hardware — MVP, DPOY, Finals MVP, championship rings, and Sixth Man of the Year — as visible badges, both on the main site and inside every game mode; also fixed a name-matching bug that had silently hidden these awards for any player with an accented name (Nikola Jokić's three MVPs, for one)",
      "Position-fit penalties (−10% for a secondary spot, −25% elsewhere) are now shown wherever you place a player in Same Screen and With a Friend, matching what Single Player already showed — placing someone out of position was silently costing rating with no on-screen warning",
      "The Lineups page and every game mode now share one scoring formula end to end, closing a real ~30-point gap where an identical 5-man lineup could grade wildly differently depending on where it was built; the Lineups page also now splits Defense into separate Rim Protection and Perimeter Defense, matching the game's own pillars",
      "NBA scoring now pulls in more real tracking data (fixing an under-weighted Engine archetype and a completely unscored Speed archetype) and extends full percentile-based scoring — the same rigor the current season gets — back through every tracking-era season, 2013-14 to today",
      "G-League and NCAA no longer score the Initiator archetype, since neither league's data includes the optical tracking it depends on — a note explains why on both league pages instead of silently showing a diluted score",
      "Versatility, lineup affinity, and duo compatibility are now computed from live data end to end — the previous versions had drifted weeks stale and, in one case, disagreed with each other depending on which page you checked",
      "Bench coverage indicators and click-for-details player popups reconnected across all three playable modes",
    ],
  },
  {
    version: "v1.4.0", date: "July 2026",
    label: "Four game modes, Same Screen head-to-head, BAN joker",
    items: [
      "The Lineup Builder now opens on a mode-select screen: Single Player (live), Same Screen (live), With a Friend and Online Opponent (both marked Coming Soon — arriving with the rebrand)",
      "New mode: Same Screen — two players draft head-to-head on one device. Every round the wheel spins once for both; you draft from the same shared roster in snake order, so going second one round means going first the next",
      "New joker, exclusive to head-to-head play: BAN. While your opponent is on the clock, spend it to block one player from their pick — but if they respond with any joker of their own, your ban is voided (though it's still spent)",
      "No court in Same Screen — with two players sharing one screen, the layout is two side-by-side mobile-style panels instead, each with its own 9-man roster, 5 solo jokers, and the shared BAN",
      "Single Player's start screen re-centered, plus a layout bug where the Role-15% score segment could overflow its card is fixed",
      "Shared game UI pieces (spin wheel, lineup slots, player rows, joker buttons, info modal) split out into their own reusable files so Same Screen and Single Player stay in sync instead of drifting apart",
    ],
  },
  {
    version: "v1.0.0", date: "June – July 2026",
    label: "Launch — multi-league archetype engine and Lineup Builder game",
    items: [
      "12 core archetypes plus modifier tags, percentile-based scoring so players are comparable across eras and leagues instead of by raw stats",
      "Four leagues live: NBA (current + full historical back to 1983), G-League, NCAA, and EuroLeague — each scored within its own league percentiles, with real season/team/conference/tier filters",
      "Prospect grading (floor/ceiling/grade/tier) and a comparables engine ('projects like a young X', matched against the 1983+ NBA rookie-season pool)",
      "Lineup & duo compatibility engine, and an archetype affinity matrix (partly grounded in real NBA lineup outcome data for the current season)",
      "Lineup Builder game: spin-and-draft 9-man rosters across any era, Classic or Salary Cap mode, jokers, a coach draft, and a full 82-game + playoff season simulation with awards, dynasties, and a leaderboard",
      "Accounts, admin panel, blog/CMS, community tag corrections, and the full Primary Arch dark brand system across every page",
    ],
  },
];

const SECTIONS = [
  {
    h: "Identities, not just numbers",
    p: "Every player is more than a stat line. Their role on the floor, what they give the team's system and the pressure they put on opponents together form an archetype. The goal is a reference that bridges scouting jargon and statistical depth: see at a glance whether a player is an \"Ecosystem Engine\" or a \"Pressure Three-Level Creator\", test how a lineup fits, and compare across eras.",
  },
  {
    h: "Archetype tagging",
    p: `${CORE_COMPONENTS.length} core archetypes (Ecosystem, Engine, Anchor, Spacer…) and ${MODIFIER_COMPONENTS.length} modifier tags (Pressure, Gravity, Stretch…) give each player a layered identity. The tags start from a hand-written jargon dictionary; the metrics validate and extend those definitions.`,
    link: "/basketball/glossary", label: "Browse the glossary",
  },
  {
    h: "Percentile-based scoring",
    p: "Raw statistics don't compare across eras. Every metric is turned into a within-season percentile rank — the only fair way to put a 1990 player and a 2025-26 player on the same scale. It works the same way across leagues: G League, NCAA and EuroLeague players are ranked within their own league.",
    link: "/basketball/methodology", label: "Read the methodology",
  },
  {
    h: "Lineup compatibility",
    p: "A compatibility engine built on functional role slots (primary creation, floor spacing, interior defense…) scores five-man units on five pillars, with real lineup data from the current season blended in where it exists.",
    link: "/basketball/lineups", label: "Build a lineup",
  },
  {
    h: "Historical depth",
    p: "Every season from 1983-84 onward. Fallback signatures stand in for the tracking and hustle metrics older seasons don't have, so Michael Jordan and Shai Gilgeous-Alexander are judged inside the same framework.",
    link: "/basketball/players", label: "Explore a historical season",
  },
  {
    h: "Philosophy",
    p: "A player isn't simply good or bad — they fit or they don't, in the right system and roster. Nikola Jokić can be the centre of a five-man unit or create redundancy next to another dominant Force. We trust the data, but it doesn't tell the whole story; that's why the calculations come with lineup explanations, role breakdowns and win correlations.",
  },
];

const FACTS = [
  { v: CORE_COMPONENTS.length, l: "Core archetypes", c: "#FFB11B" },
  { v: MODIFIER_COMPONENTS.length, l: "Modifier tags", c: "#60a5fa" },
  { v: "1983", l: "First season on record", c: "#4ade80" },
  { v: 4, l: "Basketball leagues scored", c: "#fb7185" },
];

function Release({ entry, first }) {
  const [open, setOpen] = useState(first);
  return (
    <div className={`fa-rel${open ? " open" : ""}`}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <b style={first ? { color: "#FFB11B" } : undefined}>{entry.version}</b>
        <span>{entry.date}</span>
      </button>
      <p className="lbl">{entry.label}</p>
      {open && <ul>{entry.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
    </div>
  );
}

export default function AboutContent() {
  return (
    <div className="fg-page">
      <div className="fg-inner">
        <ExploreHeader title="Fundamentals" active="about" tabs={FUNDAMENTALS_TABS} />

        <div className="fa-grid">
          <div className="fa-main">
            {SECTIONS.map(s => (
              <section key={s.h}>
                <h2>{s.h}</h2>
                <p>{s.p}</p>
                {s.link && <Link to={s.link}>{s.label} →</Link>}
              </section>
            ))}
            <section className="fa-by">
              <h2>Created by</h2>
              <p><span className="av">GG</span>Gökdeniz Gören</p>
            </section>
            <p className="fa-disc">
              Not an official NBA product. Data comes from stats.nba.com via the nba_api library, with Basketball-Reference BPM for NBA seasons.
              Archetype definitions and tags are original interpretive work.
            </p>
          </div>

          <aside className="fa-side">
            {FACTS.map(f => (
              <div key={f.l} className="fa-fact">
                <b style={{ color: f.c, textShadow: `0 0 20px ${f.c}55` }}>{f.v}</b>
                <span>{f.l}</span>
              </div>
            ))}
            <div className="fa-colors">
              <span className="k">Archetype colors</span>
              <div>
                {Object.entries(ARCHETYPE_COLOR).map(([n, c]) => (
                  <span key={n}><i style={{ background: c, boxShadow: `0 0 8px ${c}` }} />{n}</span>
                ))}
              </div>
            </div>
            <div className="fa-releases">
              <span className="k">Release notes</span>
              {CHANGELOG.map((e, i) => <Release key={e.version} entry={e} first={i === 0} />)}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
