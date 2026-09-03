import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { FOOTBALL_ARCHETYPES } from "../../data/footballGlossary";
import { PHASE_COLOR } from "../../game/football/theme";

// ── Futbol sözlüğü ───────────────────────────────────────────────────────────
// Basketbolda About ve Glossary ayrı iki sayfa: biri "bu proje ne yapıyor",
// öbürü "her arketip tam olarak neyi ölçüyor". Futbolda ikincisi eksikti.
//
// Buradaki veri ELLE YAZILMADI — config/football_signatures.py'den üretiliyor
// (src/football/build_glossary.py). Basketbol tarafında ağırlıklar elle
// kopyalanmış ve imza değiştiğinde sayfa sessizce eskiyor; bu oturumda
// imzalar üç kez değiştiği için o riski hiç açmadık.

const PHASES = [
  { key: "all", label: "All", hex: "#9ca3af" },
  { key: "gk", label: "Goalkeeper", hex: PHASE_COLOR.gk },
  { key: "def", label: "Defence", hex: PHASE_COLOR.def },
  { key: "mid", label: "Midfield", hex: PHASE_COLOR.mid },
  { key: "fwd", label: "Attack", hex: PHASE_COLOR.fwd },
];

function MetricRow({ m, max }) {
  const pctOfMax = Math.round((m.w / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
      <span style={{ flex: "1 1 150px", color: m.thin ? "var(--text-faint)" : "var(--text-muted)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {m.label}
        {!m.higher && (
          <span title="Lower is better for this role"
            style={{ color: "#E8654C", marginLeft: 4 }}>↓</span>
        )}
        {m.thin && (
          <span title="Recorded for only ~3% of players, so this metric rarely contributes"
            style={{ color: "#E8654C", marginLeft: 4, fontSize: 9 }}>rare</span>
        )}
      </span>
      <span style={{ width: 62, height: 5, borderRadius: 3, background: "var(--bg-surface)" }}>
        <span style={{ display: "block", height: "100%", borderRadius: 3,
          width: `${pctOfMax}%`, background: "currentColor", opacity: m.thin ? 0.35 : 1 }} />
      </span>
      <span style={{ width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums",
        opacity: m.thin ? 0.5 : 1 }}>
        {Math.round(m.w * 100)}
      </span>
    </div>
  );
}

function ArchCard({ a }) {
  const [open, setOpen] = useState(false);
  const max = Math.max(...a.metrics.map(m => m.w));
  return (
    <div className="g-panel p-3" style={{ "--accent": a.color, "--accent-line": a.color + "44",
      color: a.color, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{a.name}</span>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em" }}>
          {a.phaseLabel}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-faint)" }}>
          {open ? "−" : "+"}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.55 }}>
        {a.desc}
      </div>

      {a.positions.length > 0 && (
        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 5 }}>
          Only considered for {a.positions.join(", ")}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em",
            color: "var(--text-faint)", marginBottom: 2 }}>
            What it weighs ({a.metrics.length} metrics)
          </div>
          {a.metrics.map(m => <MetricRow key={m.key} m={m} max={max} />)}
        </div>
      )}
    </div>
  );
}

export default function FootballGlossary() {
  const [phase, setPhase] = useState("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FOOTBALL_ARCHETYPES.filter(a =>
      (phase === "all" || a.phase === phase) &&
      (!needle || a.name.toLowerCase().includes(needle) ||
        a.desc.toLowerCase().includes(needle) ||
        a.metrics.some(m => m.label.toLowerCase().includes(needle))));
  }, [phase, q]);

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <SEO title="Glossary — Football"
        description="Every football archetype, what it means, and the exact metrics behind it."
        path="/football/glossary" />
      <div className="g-smoke" />

      <div className="relative max-w-3xl w-full mx-auto p-5 flex-1 flex flex-col min-h-0">
        <h1 className="font-logo text-3xl font-bold text-white tracking-wide shrink-0">Glossary</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.6 }}>
          All 24 roles, and the metrics each one actually weighs. Open a card to see the
          weights — they are read straight from the engine, so what you see here is what
          the scoring uses, not a description of it.
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {PHASES.map(p => (
            <button key={p.key} onClick={() => setPhase(p.key)} className="aura-pill-btn"
              style={phase === p.key ? { borderColor: p.hex, color: p.hex } : undefined}>
              {p.label}
            </button>
          ))}
        </div>

        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search a role or a metric…"
          className="aura-ghost-input w-full" style={{ marginTop: 8 }} />

        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
          {shown.length} role{shown.length === 1 ? "" : "s"}
          {" · "}<span style={{ color: "#E8654C" }}>↓</span> means lower is better
          {" · "}<span style={{ color: "#E8654C" }}>rare</span> marks a metric recorded for
          about 3% of players
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1"
          style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          {shown.map(a => <ArchCard key={`${a.phase}-${a.name}`} a={a} />)}
        </div>

        {!shown.length && (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 20 }}>
            Nothing matches that.
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 22, lineHeight: 1.7 }}>
          Weights are relative within a role, not across roles — a 20 in one role and a 20
          in another do not mean the same thing. Metrics are compared as percentiles inside
          a player's own league and season, and any metric a player has no record for is
          dropped from the weighting rather than guessed at.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
          <Link to="/football/about" className="aura-pill-btn">How this works</Link>
          <Link to="/football/players" className="aura-pill-btn">Browse players</Link>
        </div>
        </div>
      </div>
    </div>
  );
}
