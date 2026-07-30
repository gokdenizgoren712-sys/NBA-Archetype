import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { Logo } from "../components/BrandIcons";
import "../components/PlayerCard.css";

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

// 12 çekirdek arketip paleti — Glossary/Explore/Affinity ile aynı, "What We Do"
// kartlarına dönüşümlü renk verir (site genelinde tutarlı kimlik).
const CYCLE_HEX = ["#fb923c", "#4ade80", "#2dd4bf", "#c084fc", "#60a5fa", "#f87171"];

const WHAT = [
  {
    icon: "🏷",
    title: "Archetype Tagging",
    text: `Using 12 core archetypes (Ecosystem, Engine, Anchor, Spacer…) and 22 modifier tags (Pressure, Gravity, Switchable…), we assign a multi-layered identity to each player. Tags are grounded in a hand-crafted jargon dictionary; metrics validate and extend these definitions.`,
    link: "/glossary", linkLabel: "Browse the glossary",
  },
  {
    icon: "📐",
    title: "Percentile-Based Scoring",
    text: `Raw statistics are not comparable across eras. All metrics are converted to within-season percentile ranks — the only reliable way to evaluate a 1990 player on the same scale as a 2025-26 player.`,
    link: "/players", linkLabel: "See it applied to players",
  },
  {
    icon: "🔗",
    title: "Lineup Compatibility",
    text: `A compatibility engine built on 11 functional role slots (Primary Creation, Floor Spacing, Interior Defense…) computes the theoretically best 5-man lineups with real NBA dynamics baked in.`,
    link: "/lineups", linkLabel: "Build a lineup",
  },
  {
    icon: "📚",
    title: "Historical Depth",
    text: `All seasons from 1989-90 onward. Fallback signatures handle missing tracking and hustle metrics in older seasons, allowing Michael Jordan and Shai Gilgeous-Alexander to be evaluated within the same framework.`,
    link: "/players", linkLabel: "Explore a historical season",
  },
  {
    icon: "🗺",
    title: "Archetype Map",
    text: `The 12-dimensional score vector is projected to 2D and visualized as an interactive scatter plot. See which players are similar, how archetypes cluster, and the demographic spread of the league.`,
    link: "/explore", linkLabel: "Open the map",
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

// "What We Do" kartı — era-card kabuğunun aynısı (badge + başlık + edge-bevel
// + organik blob), yatay tek-sütun oldukları için 5 öğede tek/çift grid
// hizalama sorunu hiç oluşmuyor. Tıklanınca ilgili gerçek sayfaya giden bir
// CTA açılıyor — burada sadece anlatmıyoruz, doğrudan o özelliğe gönderiyoruz.
function WhatCard({ icon, title, text, link, linkLabel, accent }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  return (
    <div className={`era-card${expanded ? " expanded" : ""}`}
      style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-b": accent + "30", "--accent-line": accent + "66" }}
      onClick={() => setExpanded(e => !e)}>
      <span className="aura-blob era-card-meta-glow" style={{ "--slot-color": accent, left: "80%" }} />
      <div className="era-card-head">
        <div className="era-card-badge" style={{ background: accent + "1a", border: `1px solid ${accent}55`, color: accent, fontSize: 20 }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="era-card-title-row">
            <span className="era-card-label">{title}</span>
          </div>
          <p className="era-card-desc" style={{ marginTop: 4 }}>{text}</p>
        </div>
        <div className="era-card-chev-wrap" onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}>
          <span className="era-chev" style={{ color: accent }}>▾</span>
        </div>
      </div>
      <div className="era-card-expand-wrap">
        <div className="era-card-expand-inner">
          <div className="era-card-body" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => navigate(link)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-transform hover:-translate-y-px"
              style={{ color: accent, border: `1px solid ${accent}55`, background: `${accent}14` }}>
              {linkLabel} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Release-notes kartı — kapalıyken sürüm rozeti + tarih + tek satır başlık,
// tıklanınca madde listesi aşağı doğru açılır (Era/Lineup kartlarıyla aynı dil).
function ChangelogCard({ entry, accent, defaultOpen }) {
  const [expanded, setExpanded] = useState(!!defaultOpen);
  return (
    <div className={`changelog-card${expanded ? " expanded" : ""}`}
      style={{ "--accent": accent, "--accent-a": accent + "48", "--accent-line": accent + "66" }}
      onClick={() => setExpanded(e => !e)}>
      <span className="aura-blob changelog-card-glow" style={{ "--slot-color": accent }} />
      <div className="changelog-card-head">
        <div className="changelog-card-top">
          <span className="changelog-version" style={{ color: accent, background: accent + "1a", border: `1px solid ${accent}55` }}>
            {entry.version}
          </span>
          <span className="changelog-date">{entry.date_en}</span>
          <span className="changelog-chev">▾</span>
        </div>
        <div className="changelog-label">{entry.label_en}</div>
        {!expanded && (
          <div className="changelog-peek">{entry.items_en.length} updates — tap to expand</div>
        )}
      </div>
      <div className="changelog-expand-wrap">
        <div className="changelog-expand-inner">
          <div className="changelog-body" onClick={e => e.stopPropagation()}>
            <ul className="space-y-1.5 pt-1">
              {entry.items_en.map((item, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed">
                  <span style={{ color: accent }} className="shrink-0 mt-0.5">+</span>
                  <span style={{ color: "var(--text-muted)" }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AboutContent() {
  const { lang } = useLang();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto pb-16">
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 items-start">

          {/* Left column */}
          <div className="flex-1 space-y-10 min-w-0">

            {/* Hero — the site's own identity, presented as an actual trading card */}
            <div className="pcard-stage mx-auto" style={{ marginBottom: 4 }}>
              <div className="pcard"
                style={{ "--accent": "#FFB11B", "--accent-a": "#FFB11B48", "--accent-b": "#FFB11B30", "--accent-line": "#FFB11B66", cursor: "default" }}>
                <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
                <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" /><span className="pcard-sparkle s3" />
                <div className="pcard-top">
                  <span className="pcard-rank top">EST. 2026</span>
                  <span className="pcard-rating">01</span>
                </div>
                <div className="pcard-photo" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, #FFB11B22, transparent 65%)" }} />
                  <Logo size={92} />
                  <div className="pcard-photo-fade" />
                </div>
                <div className="pcard-nameband">
                  <h1 className="pcard-name">PRIMARY ARCH</h1>
                  <div className="pcard-meta"><span className="pcard-arch">Identities, not just numbers</span></div>
                </div>
              </div>
            </div>

            {/* Mission & Vision */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  label: "Mission", accent: "#FFB11B",
                  text: `To understand the NBA through identities, not just numbers. Every player is more than a stat line — their role on the floor, their contribution to the team system, and the pressure they apply on opponents together form an "archetype."`,
                },
                {
                  label: "Vision", accent: "#60a5fa",
                  text: `A reference platform bridging scouting jargon with statistical depth. A system where you can see at a glance whether a player is an "Ecosystem Engine" or a "Pressure Three-Level Creator," test lineup compatibility, and compare across historical eras.`,
                },
              ].map(({ label, text, accent }) => (
                <div key={label} className="info-card" style={{ "--accent": accent, "--accent-line": accent + "66" }}>
                  <span className="aura-blob" style={{ "--slot-color": accent, right: -30, top: -30, width: 160, height: 130, opacity: 0.26, zIndex: 0 }} />
                  <div className="text-xs font-semibold mb-2" style={{ color: accent }}>{label}</div>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{text}</p>
                </div>
              ))}
            </div>

            {/* What we do — era-card shell, single column so 5 items never leave an orphan.
                Each one opens onto the real page it describes. */}
            <div>
              <SectionLabel>What We Do</SectionLabel>
              <div className="space-y-3">
                {WHAT.map(({ icon, title, text, link, linkLabel }, i) => (
                  <WhatCard key={title} icon={icon} title={title} text={text} link={link} linkLabel={linkLabel}
                    accent={CYCLE_HEX[i % CYCLE_HEX.length]} />
                ))}
              </div>
            </div>

            {/* Philosophy */}
            <div className="relative aura-glass p-6 rounded-2xl overflow-hidden">
              <span className="aura-blob" style={{ "--slot-color": "var(--accent)", left: "50%", top: -40, width: 220, height: 150, transform: "translateX(-50%)", opacity: 0.16 }} />
              <div className="relative">
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
            <div className="pt-6 text-center" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
                This site is not an official NBA product. All data is sourced from stats.nba.com via the nba_api library.
                Archetype definitions and tags are entirely the product of original interpretive work.
              </p>
              <p className="text-[10px] mt-2" style={{ color: "var(--text-faint)" }}>© 2025-26 · Gökdeniz Gören</p>
            </div>
          </div>

          {/* Right column — changelog (card-style, collapse/expand) */}
          <div className="w-full md:w-72 md:shrink-0 md:sticky md:top-6 space-y-3">
            <SectionLabel>Release Notes</SectionLabel>
            {CHANGELOG.map((entry, i) => (
              <ChangelogCard key={entry.version} entry={entry}
                accent={i === 0 ? "#FFB11B" : "#9ca3af"} defaultOpen={i === 0} />
            ))}
            <p className="text-[10px] text-center pt-1" style={{ color: "var(--text-faint)" }}>
              More updates coming soon
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
