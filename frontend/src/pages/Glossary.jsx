import { useState } from "react";
import { COMPONENTS, METRIC_LABELS, CORE_COMPONENTS, MODIFIER_COMPONENTS } from "../data/glossary";
import { useLang } from "../contexts/LanguageContext";
import SplitPane from "../components/SplitPane";

const ERAS = [
  {
    short: "80s", label: "Magic vs Bird Era", years: "1979–1991",
    color: "#fbbf24", meta: "Post play, team ball, mid-range dominance",
    desc: "The league ran through dominant big men (Kareem, Barkley, Malone) and all-court playmakers (Magic, Bird). The 3-pointer existed but was rarely attempted — Spacers were virtually irrelevant. Ecosystems and Force/Anchor archetypes commanded maximum value.",
    top: ["Ecosystem ×1.30","Force ×1.20","Anchor ×1.15","Hub ×1.15"],
    low: ["Spacer ×0.45","Initiator ×0.70","Rim Runner ×0.70"],
  },
  {
    short: "Jordan", label: "Jordan Era", years: "1991–1998",
    color: "#f87171", meta: "Isolation scoring, lockdown defense, pure athleticism",
    desc: "Michael Jordan redefined individual excellence. Teams were built around one dominant scorer with supporting stoppers. Engines and Creators peaked in value; lockdown Stoppers were premium.",
    top: ["Engine ×1.25","Creator ×1.20","Stopper ×1.15"],
    low: ["Spacer ×0.60","Ecosystem ×0.85","Hub ×0.90"],
  },
  {
    short: "Dead Ball", label: "Dead Ball Era", years: "1998–2008",
    color: "#94a3b8", meta: "Physical defense, post play, deliberately slow pace",
    desc: "The league's lowest-scoring era since the shot clock. Physical hand-checking rules rewarded defensive specialists. Interior bigs (Shaq, Duncan, KG) defined championship rosters.",
    top: ["Anchor ×1.25","Stopper ×1.20","Force ×1.15"],
    low: ["Spacer ×0.55","Ecosystem ×0.85","Connector ×0.85"],
  },
  {
    short: "Proto ST", label: "Proto Super Team Era", years: "2008–2014",
    color: "#60a5fa", meta: "Pick-and-roll revolution, emerging stretch bigs",
    desc: "The post-handcheck era opened up driving lanes. Pick-and-roll became the primary offensive system. Stretch bigs started emerging — Dirk proved a shooting big could win a title.",
    top: ["Engine ×1.10","Creator ×1.05","Rim Runner ×1.10"],
    low: ["Spacer ×0.80","Ecosystem ×0.95"],
  },
  {
    short: "Small Ball", label: "Small Ball Era", years: "2014–2020",
    color: "#34d399", meta: "Spacing is king, 3-point explosion, pace and space",
    desc: "The Warriors dynasty redefined basketball. Three-point volume exploded, traditional big men were phased out, and floor spacing became non-negotiable.",
    top: ["Spacer ×1.35","Engine ×1.20","Creator ×1.10"],
    low: ["Force ×0.65","Anchor ×0.70","Initiator ×0.90"],
  },
  {
    short: "Parity", label: "Parity Era", years: "2020–present",
    color: "#a78bfa", meta: "Two-way versatility, load management, balanced rosters",
    desc: "No single dominant style defines this era. Teams value switchable, two-way players. The Ecosystem archetype has re-emerged as load management and roster depth became strategic priorities.",
    top: ["Spacer ×1.20","Ecosystem ×1.15","Connector ×1.10"],
    low: ["Force ×0.80","Anchor ×0.85"],
  },
];

function Tag({ children, color = "var(--accent)" }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded font-medium"
      style={{ color, border: `1px solid ${color}40`, background: `${color}15` }}>
      {children}
    </span>
  );
}

function MetricRow({ metricKey, w, higher, lang }) {
  const meta = METRIC_LABELS[metricKey] || { label: metricKey, desc: "" };
  const pct  = Math.round(w * 100);
  const label = lang === "tr" && meta.label_tr ? meta.label_tr : meta.label;
  const desc  = lang === "tr" && meta.desc_tr  ? meta.desc_tr  : meta.desc;

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div className="w-28 shrink-0">
        <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="text-[9px] font-mono" style={{ color: "var(--text-faint)" }}>{metricKey}</div>
      </div>
      <div className="w-20 shrink-0 flex items-center gap-1.5 pt-0.5">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
        <span className="text-[10px] w-6" style={{ color: "var(--accent)" }}>{pct}%</span>
      </div>
      <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded"
        style={{ color: higher ? "#34d399" : "#f87171", background: higher ? "#34d39915" : "#f8717115" }}>
        {higher ? "↑" : "↓"}
      </span>
      <div className="text-[10px] flex-1" style={{ color: "var(--text-muted)" }}>{desc}</div>
    </div>
  );
}

/* ── Detail panel content ────────────────────────────────────────── */
function CompDetail({ item, lang }) {
  if (!item) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-3xl mb-3 opacity-20">≡</div>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          {lang === "tr" ? "Detay için bir bileşen seç" : "Select a component to see details"}
        </div>
      </div>
    </div>
  );

  if (item._era) {
    const era = item._era;
    return (
      <div className="p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] px-2 py-0.5 rounded font-bold"
              style={{ color: era.color, border: `1px solid ${era.color}50`, background: `${era.color}15` }}>
              {era.short}
            </span>
            <span className="font-bold text-base" style={{ color: era.color }}>{era.label}</span>
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{era.years}</div>
        </div>
        <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>{era.meta}</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{era.desc}</p>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#34d399" }}>Meta Archetypes</div>
            <div className="flex flex-wrap gap-1.5">
              {era.top.map(t => <Tag key={t} color="#34d399">{t}</Tag>)}
            </div>
          </div>
          {era.low?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#f87171" }}>Off-Meta</div>
              <div className="flex flex-wrap gap-1.5">
                {era.low.map(t => <Tag key={t} color="#f87171">{t}</Tag>)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const comp = item;
  const desc = lang === "tr" && comp.desc_tr ? comp.desc_tr : comp.desc;

  return (
    <div className="p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-lg" style={{ color: comp.colorHex || "var(--accent)" }}>{comp.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              color: comp.type === "Core" ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${comp.type === "Core" ? "var(--accent-border)" : "var(--border)"}`,
            }}>
            {lang === "tr" ? (comp.type === "Core" ? "Temel" : "Modifier") : comp.type}
          </span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{desc}</p>
        <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {lang === "tr" ? "Eşik" : "Threshold"}: <span style={{ color: "var(--accent)" }}>{comp.threshold}</span>
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
        {lang === "tr" ? "Metrikler & Ağırlıklar" : "Metrics & Weights"}
      </div>
      {comp.metrics.map(m => (
        <MetricRow key={m.key} metricKey={m.key} w={m.w} higher={m.higher} lang={lang} />
      ))}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────── */
export default function Glossary() {
  const { lang } = useLang();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [section, setSection] = useState("components"); // "components" | "eras"

  const shownComps = filter === "core" ? CORE_COMPONENTS
    : filter === "modifier" ? MODIFIER_COMPONENTS
    : COMPONENTS;

  const filterLabels = lang === "tr"
    ? [["all","Tümü"],["core","Temel"],["modifier","Modifier"]]
    : [["all","All"],["core","Core"],["modifier","Modifiers"]];

  return (
    <SplitPane
      detail={selected ? <CompDetail item={selected} lang={lang} /> : null}
      onClose={() => setSelected(null)}
    >
      <div className="flex flex-col h-full">
        {/* Section tabs */}
        <div className="flex shrink-0 border-b px-4 pt-3" style={{ borderColor: "var(--border)" }}>
          {[["components", lang === "tr" ? "Bileşenler" : "Components"], ["eras", "NBA Eras"]].map(([k, l]) => (
            <button key={k} onClick={() => { setSection(k); setSelected(null); }}
              className="mr-4 pb-2 text-sm font-medium transition-colors"
              style={{
                color: section === k ? "var(--accent)" : "var(--text-muted)",
                borderBottom: section === k ? "2px solid var(--accent)" : "2px solid transparent",
              }}>{l}</button>
          ))}
        </div>

        {section === "components" && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2 shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
              {filterLabels.map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)}
                  className="px-3 py-1 rounded text-xs font-medium transition-colors"
                  style={{
                    background: filter === k ? "var(--accent-dim)" : "transparent",
                    color: filter === k ? "var(--accent)" : "var(--text-muted)",
                    border: `1px solid ${filter === k ? "var(--accent-border)" : "var(--border)"}`,
                  }}>{l}</button>
              ))}
              <span className="ml-auto text-xs" style={{ color: "var(--text-faint)" }}>{shownComps.length}</span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {shownComps.map(comp => {
                const isActive = selected?.name === comp.name;
                const desc = lang === "tr" && comp.desc_tr ? comp.desc_tr : comp.desc;
                return (
                  <button key={comp.name} onClick={() => setSelected(comp)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b"
                    style={{
                      borderColor: "var(--border)",
                      background: isActive ? "var(--accent-dim)" : "transparent",
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <span className="absolute left-0 w-0.5 h-8 rounded-r" style={{ background: "var(--accent)" }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: comp.colorHex || "var(--accent)" }}>
                          {comp.name}
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                          {lang === "tr" ? (comp.type === "Core" ? "Temel" : "Modifier") : comp.type}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{desc}</p>
                    </div>
                    <span className="text-xs shrink-0 mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {comp.metrics?.length || 0}m
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {section === "eras" && (
          <div className="flex-1 overflow-y-auto">
            {ERAS.map(era => {
              const isActive = selected?._era?.short === era.short;
              return (
                <button key={era.short} onClick={() => setSelected({ _era: era })}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b"
                  style={{
                    borderColor: "var(--border)",
                    background: isActive ? `${era.color}12` : "transparent",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? `${era.color}12` : "transparent"; }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ color: era.color, border: `1px solid ${era.color}40` }}>
                        {era.short}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: era.color }}>{era.label}</span>
                      <span className="text-xs" style={{ color: "var(--text-faint)" }}>{era.years}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{era.meta}</p>
                  </div>
                </button>
              );
            })}

            {/* Methodology note */}
            <div className="p-4 m-4 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
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
        )}
      </div>
    </SplitPane>
  );
}
