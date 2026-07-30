import { useState } from "react";
import { COMPONENTS, METRIC_LABELS, CORE_COMPONENTS, MODIFIER_COMPONENTS, ERA_GUIDE as ERAS } from "../data/glossary";
import { useLang } from "../contexts/LanguageContext";
import { api } from "../api";
import "../components/PlayerCard.css";

const CORE_HEX = {
  Engine: "#fb923c", Ecosystem: "#4ade80", Hub: "#2dd4bf", Connector: "#c084fc",
  Creator: "#fb7185", Anchor: "#60a5fa", Spacer: "#22d3ee", Finisher: "#a3e635",
  Force: "#f87171", Initiator: "#FFB11B", Stopper: "#d1d5db", "Rim Runner": "#34d399",
};
const ARCH_SLUG = {
  Engine: "engine", Ecosystem: "ecosystem", Hub: "hub", Connector: "connector",
  Creator: "creator", Anchor: "anchor", Spacer: "spacer", Finisher: "finisher",
  Force: "force", Initiator: "initiator", Stopper: "stopper", "Rim Runner": "rim-runner",
};
const MODIFIER_HEX = {
  "Two-Way": "#a78bfa", Heliocentric: "#fdba74", Pressure: "#fca5a5",
  Shotmaker: "#fde047", "Three-Level": "#f472b6", Scoring: "#fda4af", Speed: "#67e8f9",
  Versatile: "#818cf8", Defensive: "#94a3b8", "Half-Court": "#fcd34d", "Point-of-Attack": "#f87171",
  Gravity: "#c4b5fd", Scalable: "#86efac", Stretch: "#7dd3fc", "Point-": "#93c5fd",
  "Off-Ball": "#d8b4fe", Slashing: "#fca5a5", "Pick-and-Roll": "#facc15", "3-and-D": "#60a5fa",
  Playmaking: "#4ade80", Secondary: "#cbd5e1",
};

/* ── One archetype/modifier, in the site's card language ─────────── */
function ComponentCard({ comp, lang }) {
  const isCore = comp.type === "Core";
  const color = isCore ? (CORE_HEX[comp.name] || "#9ca3af") : (MODIFIER_HEX[comp.name] || "#9ca3af");
  const slug = isCore ? ARCH_SLUG[comp.name] : null;
  const imgSrc = slug ? `/archetypes/${slug}.png` : null;
  const desc = lang === "tr" && comp.desc_tr ? comp.desc_tr : comp.desc;

  const [expanded, setExpanded] = useState(false);
  const [topPlayers, setTopPlayers] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && isCore && !topPlayers && !loading) {
      setLoading(true);
      try {
        const d = await api.players({ arch: comp.name, sort_by: "overall_score", limit: 10 });
        setTopPlayers(d.players || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
  };

  return (
    <div className="pcard-stage">
      <div className={`pcard${expanded ? " pcard-expanded" : ""}`}
        style={{ "--accent": color, "--accent-a": color + "48", "--accent-b": color + "30", "--accent-line": color + "66" }}
        onClick={() => !expanded && toggle()}>
        <div className="pcard-holo" /><div className="pcard-foil" /><div className="pcard-grain" />
        <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" /><span className="pcard-sparkle s3" />

        <div className="pcard-top">
          <span className="pcard-rank top">{comp.type}</span>
          <span className="pcard-rating">{comp.threshold?.replace("Top ", "")}</span>
        </div>

        {imgSrc && (
          <div className="pcard-photo">
            <img src={imgSrc} alt={comp.name} className="pcard-photo-img" loading="lazy" />
            <div className="pcard-photo-fade" />
          </div>
        )}

        <div className="pcard-nameband" style={!imgSrc ? { marginTop: 14 } : undefined}>
          <h3 className="pcard-name">{comp.name}</h3>
          <div className="pcard-meta"><span className="pcard-arch">{comp.threshold} of players</span></div>
        </div>

        <div className="pcard-stats flat">
          <p style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--text-muted)", margin: 0 }}>{desc}</p>
        </div>

        <div className="pcard-peek" onClick={(e) => { e.stopPropagation(); toggle(); }}>
          <span>{isCore ? "Top Players" : "Metrics"}</span><span className="pcard-chev">▾</span>
        </div>
        <div className="pcard-expand-wrap">
          <div className="pcard-expand-inner">
            <div className="pcard-detail">
              <div className="pcard-tabcontent" onClick={(e) => e.stopPropagation()}>
                {isCore ? (
                  loading ? <div className="pcard-loading">Loading…</div> :
                  topPlayers?.length ? topPlayers.map((p, i) => (
                    <div key={i} className="pcard-sim-row">
                      <div>
                        <div className="pcard-sim-name">{p.PLAYER_NAME}</div>
                        <div className="pcard-sim-meta">{p.TEAM_ABBREVIATION} · {p.POSITION}</div>
                      </div>
                      <div className="pcard-sim-pct">
                        <div className="v">{p.overall_score != null ? Math.round(p.overall_score * 100) : "—"}</div>
                        <div className="l">overall</div>
                      </div>
                    </div>
                  )) : <div className="pcard-empty">No data</div>
                ) : (
                  (comp.metrics || []).map(m => {
                    const meta = METRIC_LABELS[m.key] || { label: m.key };
                    const label = lang === "tr" && meta.label_tr ? meta.label_tr : meta.label;
                    const pct = Math.round(m.w * 100);
                    return (
                      <div key={m.key} className="pcard-arch-item" style={{ gridTemplateColumns: "84px 1fr 26px" }}>
                        <span className="lbl">{label}</span>
                        <div className="pcard-arch-track"><div style={{ width: `${pct}%` }} /></div>
                        <span className="val">{pct}%</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EraCard({ era }) {
  return (
    <div className="aura-glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
          style={{ color: era.color, border: `1px solid ${era.color}50`, background: `${era.color}15` }}>
          {era.short}
        </span>
        <span className="font-bold text-base" style={{ color: era.color }}>{era.label}</span>
        <span className="text-xs ml-auto" style={{ color: "var(--text-faint)" }}>{era.years}</span>
      </div>
      <p className="text-xs italic mb-2" style={{ color: "var(--text-muted)" }}>{era.meta}</p>
      <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-primary)" }}>{era.desc}</p>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-1.5">
          {era.top.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ color: "#34d399", border: "1px solid #34d39940", background: "#34d39915" }}>{t}</span>
          ))}
        </div>
        {era.low?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {era.low.map(t => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ color: "#f87171", border: "1px solid #f8717140", background: "#f8717115" }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function GlossaryContent() {
  const { lang } = useLang();
  const [filter, setFilter] = useState("all");
  const [section, setSection] = useState("components"); // "components" | "eras"

  const shownComps = filter === "core" ? CORE_COMPONENTS
    : filter === "modifier" ? MODIFIER_COMPONENTS
    : COMPONENTS;

  const filterLabels = lang === "tr"
    ? [["all","Tümü"],["core","Temel"],["modifier","Modifier"]]
    : [["all","All"],["core","Core"],["modifier","Modifiers"]];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Section tabs */}
      <div className="flex shrink-0 gap-1 px-4 pt-3">
        {[["components", lang === "tr" ? "Bileşenler" : "Components"], ["eras", "NBA Eras"]].map(([k, l]) => (
          <button key={k} onClick={() => setSection(k)} className={`aura-pill-btn${section === k ? " active" : ""}`}>{l}</button>
        ))}
      </div>

      {section === "components" && (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-1 px-4 py-2 shrink-0">
            {filterLabels.map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`aura-pill-btn${filter === k ? " active" : ""}`}>{l}</button>
            ))}
            <span className="ml-auto text-xs" style={{ color: "var(--text-faint)" }}>{shownComps.length}</span>
          </div>

          {/* Card grid */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid gap-6 justify-items-center items-start"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {shownComps.map(comp => <ComponentCard key={comp.name} comp={comp} lang={lang} />)}
            </div>
          </div>
        </>
      )}

      {section === "eras" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl mx-auto space-y-4">
            {ERAS.map(era => <EraCard key={era.short} era={era} />)}
            <div className="aura-glass p-4 rounded-2xl">
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                How era weights were determined
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Era weights are set based on observable NBA trends: pace, 3-point attempt rates, championship roster construction, and rule changes.
                The Spacer weight rises from ×0.45 (Magic/Bird) to ×1.35 (Small Ball) tracking the 3-point rate's growth from ~3 to ~35 attempts per team per game.
                Weights are intentionally coarse — directional accuracy, not a regression model.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
