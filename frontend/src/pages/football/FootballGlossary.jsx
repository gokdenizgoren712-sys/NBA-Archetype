import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { FOOTBALL_ARCHETYPES } from "../../data/footballGlossary";
import { PHASE_COLOR } from "../../game/football/theme";
import PaIcon from "../../components/shell/PaIcon";
import ExploreHeader from "../../components/explore/ExploreHeader";
import "../fundamentals.css";

// ── Futbol · Fundamentals · Glossary (handoff 16c) ─────────────────────────
// Dört faz sütunu; her rol ad + tanım, tıklayınca motorun gerçekten tarttığı
// metrikler. Veri ELLE YAZILMADI — config/football_signatures.py'den üretiliyor
// (src/football/build_glossary.py), sayfa imzayla birlikte güncel kalıyor.

export const FOOTBALL_FUNDAMENTALS_TABS = [
  { key: "glossary", path: "/football/glossary", label: "Glossary" },
  { key: "about",    path: "/football/about",    label: "About & method" },
];
const PHASES = [
  { key: "gk",  label: "Goalkeepers" },
  { key: "def", label: "Defenders" },
  { key: "mid", label: "Midfielders" },
  { key: "fwd", label: "Attackers" },
];

function Role({ a }) {
  const [open, setOpen] = useState(false);
  const max = Math.max(...a.metrics.map(m => m.w));
  return (
    <div className={`ffg-role${open ? " open" : ""}`}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <b>{a.name}</b>
        <PaIcon name="chevron" size={14} color="var(--text-faint)" />
      </button>
      <p>{a.desc}</p>
      {a.positions.length > 0 && <span className="pos">Only considered for {a.positions.join(", ")}</span>}
      {open && (
        <div className="ffg-metrics">
          <span className="k">What it weighs · {a.metrics.length} metrics</span>
          {a.metrics.map(m => (
            <div key={m.key} className={m.thin ? "thin" : ""}>
              <span>{m.label}{!m.higher && <em title="Lower is better for this role"> ↓</em>}{m.thin && <em title="Recorded for only about 3% of players"> rare</em>}</span>
              <div className="tr"><i style={{ width: `${Math.round((m.w / max) * 100)}%` }} /></div>
              <b>{Math.round(m.w * 100)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FootballGlossary() {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => PHASES.map(p => ({
    ...p,
    items: FOOTBALL_ARCHETYPES.filter(a => a.phase === p.key && (!needle
      || a.name.toLowerCase().includes(needle) || a.desc.toLowerCase().includes(needle)
      || a.metrics.some(m => m.label.toLowerCase().includes(needle)))),
  })), [needle]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="fg-page">
      <SEO title="Glossary — Football" description="Every football archetype, what it means, and the exact metrics behind it." path="/football/glossary" />
      <div className="fg-inner">
        <ExploreHeader title="Fundamentals" active="glossary" tabs={FOOTBALL_FUNDAMENTALS_TABS} aside={
          <label className="ex-search" style={{ "--tint": "#3FB08C" }}>
            <PaIcon name="search" size={16} color="var(--text-muted)" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a role or a metric" aria-label="Search a role or a metric" />
          </label>
        } />

        <p className="ffg-intro">
          {total} role{total === 1 ? "" : "s"}. Open one to see the metrics it actually weighs — read straight from the engine, so this is what the scoring uses.
          <span> ↓ means lower is better; rare marks a metric recorded for about 3% of players.</span>
        </p>

        <div className="ffg-cols">
          {groups.map(g => (
            <section key={g.key} style={{ "--c": PHASE_COLOR[g.key] }}>
              <div className="ffg-h"><i /><b>{g.label}</b><span>{g.items.length}</span></div>
              {g.items.map(a => <Role key={`${a.phase}-${a.name}`} a={a} />)}
              {!g.items.length && <p className="ffg-none">No match here.</p>}
            </section>
          ))}
        </div>

        <p className="fg-note" style={{ marginTop: 28 }}>
          Weights are relative within a role, not across roles — a 20 in one role and a 20 in another do not mean the same thing.
          Metrics are compared as percentiles inside a player's own league and season, and any metric a player has no record for is dropped from the weighting rather than guessed at.
          {" "}<Link to="/football/about">How this works →</Link>
        </p>
      </div>
    </div>
  );
}
