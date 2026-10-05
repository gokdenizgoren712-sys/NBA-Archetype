import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { ACCENT as ACC, PHASE_COLOR } from "../../game/football/theme";
import ExploreHeader from "../../components/explore/ExploreHeader";
import { FOOTBALL_FUNDAMENTALS_TABS } from "./FootballGlossary";
import "../fundamentals.css";

// ── Futbol · Fundamentals · About & method (handoff 16c) ───────────────────
// 17a kalıbı: solda okunur bölümler, sağda büyük sayılar + fazlar. Sayfanın
// tavrı korunuyor: neyi ölçtüğümüz kadar NEYİ ÖLÇMEDİĞİMİZİ de yazıyor
// (kimya bir sonuç tahmini değil — 28 bin gerçek ilk-11'de test edildi).

const PHASES = [
  { key: "gk", label: "Goalkeepers", n: 4, blurb: "Judged apart from the ten outfield players — a keeper's archetype does not interact with theirs." },
  { key: "def", label: "Defenders", n: 5, blurb: "Centre-backs and full-backs, including wing-backs. Wing-back is a position, not a role." },
  { key: "mid", label: "Midfielders", n: 7, blurb: "Everyone who builds and screens. A pure number ten counts as attack, not midfield." },
  { key: "fwd", label: "Attackers", n: 8, blurb: "Strikers, wingers and tens. Wide players are forwards here, whatever the formation calls them." },
];

const FACTS = [
  { v: "24", l: "Roles across four phases", c: ACC },
  { v: "5", l: "Leagues", c: "#4C9BE8" },
  { v: "10", l: "Seasons in the archive", c: "#F2C14E" },
  { v: "28,388", l: "Real starting elevens", c: "#E8654C" },
];

export default function FootballAbout() {
  return (
    <div className="fg-page">
      <SEO title="About — Football"
        description="How Primary Arch labels footballers: four phases, 24 roles, and what the numbers can and cannot tell you."
        path="/football/about" />
      <div className="fg-inner">
        <ExploreHeader title="Fundamentals" active="about" tabs={FOOTBALL_FUNDAMENTALS_TABS} />

        <div className="fa-grid">
          <div className="fa-main">
            <section>
              <h2>A job, not a position</h2>
              <p>A separate dictionary from the basketball side, with its own language. A player is described not by his position but by the job he does in one phase of the game — and a player who does two jobs gets two rows.</p>
            </section>
            <section>
              <h2>How a player gets a role</h2>
              <p>Each role is a weighted set of per-90 metrics. Those metrics become percentiles inside the player's own league and season, so a 2016 Bundesliga defender is measured against his peers rather than against 2025 Barcelona. Whichever role scores highest wins.</p>
              <p>Two rules keep it honest. A missing metric is dropped from the weight rather than filled in with an average — assuming "typical" for something never recorded quietly flatters the player. And if less than half a role's weight is available, no score is produced at all.</p>
              <Link to="/football/glossary">Every role, with its metrics →</Link>
            </section>
            <section>
              <h2>What chemistry measures — and what it does not</h2>
              <p>A squad's chemistry score asks one question: does this eleven cover the eight jobs a team needs done, without doing any of them three times over? It is reported as a percentile against the 28,388 starting elevens clubs actually fielded across ten seasons.</p>
              <p>It is not a prediction of results. We tested that. Holding the club and the season fixed, the best-built 30% of real elevens outscore the worst-built 30% by about 0.04 expected goals a match — real, but small, and impossible to separate cleanly from squad quality. Pair affinity, the idea that two particular roles suit each other, showed nothing once the club was controlled for, and was removed from the score entirely.</p>
              <p className="fa-aside">Real managers never field sides as unbalanced as the game lets you build. What happens far below the professional range is genuinely unmeasured — not proven harmless, just unobserved.</p>
              <Link to="/football/lineups">Squad chemistry →</Link>
            </section>
            <section>
              <h2>The season simulation</h2>
              <p>The goal model isn't invented. It comes from a regression on real matches: squad quality, chemistry and the opponent's quality, fitted against the goals that followed. Home advantage falls out at +0.31 goals, which is what the football literature finds. Goals are Poisson because the observed distribution is Poisson — checked, not assumed.</p>
              <p>The model explains about 14% of the variance in a single match. Football is mostly noise, so a season is simulated 200 times and the spread is shown rather than one lucky table.</p>
              <Link to="/football/game">Play the game →</Link>
            </section>
            <section>
              <h2>Where the data comes from, and where it thins out</h2>
              <ul>
                <li>Match data is FotMob's, gathered per match and cached. Every listed player meets a minutes threshold set from the season's own length.</li>
                <li>Expected goals only exist from 2020/21. Earlier seasons have none, which is why the card's quick stats show goals, assists, clean sheets and saves — the set that is complete across the whole archive.</li>
                <li>Distance covered and sprint counts are recorded for about 3% of players, so roles that lean on them (Box-to-Box most of all) are handicapped.</li>
                <li>The dictionary has been checked against 116 hand-labelled players. Enough to say the outfield roles beat a naive baseline comfortably; not enough to fine-tune individual weights, and we don't pretend otherwise.</li>
              </ul>
            </section>
            <section>
              <h2>Photographs</h2>
              <p>Player photographs come from Wikimedia Commons and are used only where the licence allows it — images without a free licence are rejected rather than downloaded. Each card names the photographer and the licence, and marks the image as edited where the background has been removed. Photographs remain the property of their authors under the terms shown.</p>
            </section>
          </div>

          <aside className="fa-side">
            {FACTS.map(f => (
              <div key={f.l} className="fa-fact">
                <b style={{ color: f.c, textShadow: `0 0 20px ${f.c}55` }}>{f.v}</b>
                <span>{f.l}</span>
              </div>
            ))}
            <div className="ffa-phases">
              <span className="k">The four phases</span>
              {PHASES.map(p => (
                <div key={p.key} style={{ "--c": PHASE_COLOR[p.key] }}>
                  <b><i />{p.label}<em>{p.n} roles</em></b>
                  <p>{p.blurb}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
