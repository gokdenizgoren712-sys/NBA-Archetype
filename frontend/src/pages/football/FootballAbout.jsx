import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { ACCENT as ACC, PHASE_COLOR } from "../../game/football/theme";

// ── Futbol About ─────────────────────────────────────────────────────────────
// Basketboldaki About'un futbol karşılığı, ama içerik ortak değil: futbol
// sözlüğü ayrı bir dille (faz + rol) kuruldu ve ölçüm sonuçları farklı.
//
// Sayfanın açık bir tavrı var: neyi ölçtüğümüz kadar NEYİ ÖLÇMEDİĞİMİZİ de
// yazıyor. Kimya bölümü bunun en net örneği — 28 bin gerçek ilk-11'de
// ölçtüğümüz şey "iyi kurulmuş kadro maç kazandırır" demeye yetmiyor ve
// sayfa bunu saklamak yerine söylüyor.

const PHASES = [
  { key: "gk", label: "Goalkeeper", blurb: "Judged apart from the ten outfield players — a keeper's archetype does not interact with theirs.",
    archs: ["Shot Stopper", "Sweeper Keeper", "Distributor", "Command of Area"] },
  { key: "def", label: "Defence", blurb: "Centre-backs and full-backs, including wing-backs. Wing-back is a position, not a role.",
    archs: ["Ball-Playing CB", "Stopper", "Overlapping Fullback", "Inverted Fullback", "Defensive Fullback"] },
  { key: "mid", label: "Midfield", blurb: "Everyone who builds and screens. A pure number ten counts as attack, not midfield.",
    archs: ["Anchor", "Ball-Winner", "Regista", "Metronome", "Box-to-Box", "Mezzala", "Late Runner"] },
  { key: "fwd", label: "Attack", blurb: "Strikers, wingers and tens. Wide players are forwards here, whatever the formation calls them.",
    archs: ["Poacher", "Target Man", "Complete Forward", "Pressing Forward", "Inside Forward", "Touchline Winger", "Take-On Merchant", "Creator"] },
];

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-8">
      <span className="w-0.5 h-4 rounded-full" style={{ background: ACC }} />
      <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{children}</h2>
    </div>
  );
}

function Fact({ n, label }) {
  return (
    <div style={{ flex: "1 1 108px", minWidth: 108 }}>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: ACC }}>{n}</div>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".07em",
        color: "var(--text-faint)" }}>{label}</div>
    </div>
  );
}

function PhaseCard({ p }) {
  const [open, setOpen] = useState(false);
  const c = PHASE_COLOR[p.key];
  return (
    <div className="g-panel p-3" style={{ "--accent": c, "--accent-line": c + "44", cursor: "pointer" }}
      onClick={() => setOpen(o => !o)}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>{p.label}</span>
        <span style={{ fontSize: 11, color: c }}>{p.archs.length} roles</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>
          {open ? "−" : "+"}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.55 }}>
        {p.blurb}
      </div>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
          {p.archs.map(a => (
            <span key={a} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20,
              background: c + "18", border: `1px solid ${c}44`, color: "#fff" }}>{a}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FootballAbout() {
  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <SEO title="About — Football"
        description="How Primary Arch labels footballers: four phases, 24 roles, and what the numbers can and cannot tell you."
        path="/football/about" />
      <div className="g-smoke" />

      <div className="relative max-w-3xl w-full mx-auto p-5 flex-1 flex flex-col min-h-0">
        <h1 className="font-logo text-3xl font-bold text-white tracking-wide shrink-0">Football</h1>
        <p className="shrink-0" style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.6 }}>
          A separate dictionary from the basketball side, with its own language. A player
          is not described by his position but by the <b style={{ color: "#fff" }}>job he
          does</b> in one phase of the game — and a player who does two jobs gets two rows.
        </p>

        <div className="shrink-0" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14,
          paddingTop: 12, paddingBottom: 4, borderTop: "1px solid var(--border)" }}>
          <Fact n="24" label="roles" />
          <Fact n="5" label="leagues" />
          <Fact n="10" label="seasons" />
          <Fact n="28,388" label="real elevens" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <SectionLabel>The four phases</SectionLabel>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 }}>
          Every role lives inside one phase, because the metrics that separate a Regista
          from a Metronome say nothing about a Poacher. Tap a phase to see its roles, or
          open the <Link to="/football/glossary" style={{ color: ACC }}>glossary</Link> for
          the exact metrics behind each one.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {PHASES.map(p => <PhaseCard key={p.key} p={p} />)}
        </div>

        <SectionLabel>How a player gets a role</SectionLabel>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
          Each role is a weighted set of per-90 metrics. Those metrics are turned into
          percentiles inside the player's own league and season, so a 2016 Bundesliga
          defender is measured against his peers rather than against 2025 Barcelona.
          Whichever role scores highest wins.
        </p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 10 }}>
          Two rules keep it honest. A missing metric is <i>dropped from the weight</i>
          rather than filled in with an average — assuming "typical" for something never
          recorded quietly flatters the player. And if less than half a role's weight is
          available, no score is produced at all.
        </p>

        <SectionLabel>What chemistry measures — and what it does not</SectionLabel>
        <div className="g-panel p-4" style={{ "--accent": ACC, "--accent-line": ACC + "44" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
            A squad's chemistry score asks one question: <b style={{ color: "#fff" }}>does
            this eleven cover the eight jobs a team needs done, without doing any of them
            three times over?</b> It is reported as a percentile against the 28,388
            starting elevens clubs actually fielded across ten seasons.
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 10 }}>
            It is <b style={{ color: "#fff" }}>not</b> a prediction of results. We tested
            that. Holding the club and the season fixed, the best-built 30% of real elevens
            outscore the worst-built 30% by about 0.04 expected goals a match — real, but
            small, and impossible to separate cleanly from squad quality. Pair affinity, the
            idea that two particular roles suit each other, showed nothing at all once the
            club was controlled for, and was removed from the score entirely.
          </p>
          <p style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.7, marginTop: 10 }}>
            One more caveat worth stating: real managers never field sides as unbalanced as
            the game lets you build. What happens far below the professional range is
            genuinely unmeasured — not proven harmless, just unobserved.
          </p>
        </div>

        <SectionLabel>The season simulation</SectionLabel>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
          When you drop an eleven into a league, the goal model is not invented. It comes
          from a regression on real matches: squad quality, chemistry and the opponent's
          quality, fitted against the goals that actually followed. Home advantage falls
          out at <b style={{ color: "#fff" }}>+0.31 goals</b>, which is what the football
          literature finds. Goals are Poisson because the observed distribution is
          Poisson — that was checked, not assumed.
        </p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 10 }}>
          The model explains about 14% of the variance in a single match. Football is
          mostly noise, so a season is simulated 200 times and the spread is shown rather
          than one lucky table.
        </p>

        <SectionLabel>Where the data comes from, and where it thins out</SectionLabel>
        <ul style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.8,
          paddingLeft: 18, listStyle: "disc" }}>
          <li>Match data is FotMob's, gathered per match and cached. Every listed player
              meets a minutes threshold set from the season's own length.</li>
          <li><b style={{ color: "#fff" }}>Expected goals only exist from 2020/21.</b> Earlier
              seasons have none, which is why the card's quick stats show goals, assists,
              clean sheets and saves — the set that is complete across the whole archive.</li>
          <li>Distance covered and sprint counts are recorded for about 3% of players, so
              roles that lean on them (Box-to-Box most of all) are handicapped.</li>
          <li>The dictionary has been checked against 116 hand-labelled players. That is
              enough to say the outfield roles beat a naive baseline comfortably; it is not
              enough to fine-tune individual weights, and we do not pretend otherwise.</li>
        </ul>

        <SectionLabel>Photographs</SectionLabel>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
          Player photographs come from Wikimedia Commons and are used only where the licence
          allows it — images without a free licence are rejected rather than downloaded.
          Each card names the photographer and the licence, and marks the image as edited
          where the background has been removed. Photographs remain the property of their
          authors under the terms shown.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 26 }}>
          <Link to="/football/game" className="aura-rating-btn"
            style={{ borderColor: ACC, color: ACC }}>Play the game</Link>
          <Link to="/football/glossary" className="aura-pill-btn">Every role, in detail</Link>
          <Link to="/football/players" className="aura-pill-btn">Browse players</Link>
          <Link to="/football/lineups" className="aura-pill-btn">Squad chemistry</Link>
        </div>
        </div>
      </div>
    </div>
  );
}
