import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import "./methodology.css";

// /basketball/methodology (v3 L1): bölüm menüsü + düz okuma paneli.
// Metin yalnızca sistemin gerçekten yaptığı şeyleri anlatır (CLAUDE.md ve motor kodu); sayı uydurulmaz.
const SECTIONS = [
  ["archetypes", "Archetypes", [
    "An archetype describes what a player does on the floor, not where he stands. The system names twelve core roles: Engine, Ecosystem, Hub, Connector, Creator, Anchor, Spacer, Finisher, Force, Initiator, Stopper and Rim Runner.",
    "Every player gets a score for each of the twelve roles. The role with the highest score that clears its threshold is the primary archetype shown on the card.",
  ]],
  ["ratings", "Ratings", [
    "The rating on a card is a single overall score for the season. It blends how strongly the player fits his archetype with an impact measure (box plus-minus), so a player who fits a role and also produces rates higher.",
    "The rating is a Primary Arch opinion built from public data. It is not an official league statistic.",
  ]],
  ["percentiles", "Percentiles", [
    "Every metric is turned into a percentile rank instead of a raw number. That is what lets a 1990 player and a 2025-26 player sit on the same scale, and lets NBA, G League, NCAA and EuroLeague players be read the same way.",
    "A percentile is computed inside the pool it belongs to: the season and the league. The percentile on a card, such as top 1%, is the share of that pool the player rates at or above.",
  ]],
  ["data", "Data and freshness", [
    "NBA data comes from the league's public stats, and box plus-minus from Basketball-Reference. History goes back to the 1983 season. G League, NCAA and EuroLeague come from their own public sources, with a box plus-minus we estimate ourselves because those leagues do not publish one.",
    "Cached tables refresh when new games are loaded. A season that has just started has small samples, and cards mark players with few games as small sample.",
  ]],
  ["limits", "Known limits", [
    "Optical tracking metrics, such as speed, distance and time of possession, only exist for the NBA. In other leagues and in older seasons the system uses a reduced set of signals, and roles that depend mostly on tracking data are removed in the leagues that cannot support them.",
    "Modifier tags exist for the NBA only. Lineup fit is a model of how roles combine, checked against real lineup results for the current NBA season, not a prediction of any single game.",
  ]],
];

export default function Methodology() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  const go = (k) => { setActive(k); document.getElementById(`mt-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return (
    <div className="mt-page">
      <SEO title="Methodology" description="How Primary Arch scores players: twelve archetypes, percentile ranks, ratings, data sources and known limits." path="/basketball/methodology" />
      <header className="mt-head">
        <p className="pa-eyebrow">Learn · Fundamentals · Basketball</p>
        <h1 className="pa-h1">Methodology</h1>
      </header>
      <div className="mt-grid">
        <nav className="mt-nav" aria-label="On this page">
          <span className="pa-eyebrow">On this page</span>
          {SECTIONS.map(([k, l]) => (
            <button key={k} type="button" className={active === k ? "on" : ""} aria-current={active === k ? "true" : undefined} onClick={() => go(k)}>{l}</button>
          ))}
        </nav>
        <article className="mt-article pa-panel">
          {SECTIONS.map(([k, l, ps]) => (
            <section key={k} id={`mt-${k}`}>
              <h2>{l}</h2>
              {ps.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
            </section>
          ))}
          <p className="mt-more"><Link to="/basketball/glossary">Browse the glossary</Link> · <Link to="/basketball/about">About and release notes</Link></p>
        </article>
      </div>
    </div>
  );
}
