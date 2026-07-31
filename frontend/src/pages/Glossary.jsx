import { useState } from "react";
import { COMPONENTS, METRIC_LABELS, CORE_COMPONENTS, MODIFIER_COMPONENTS, ERA_GUIDE as ERAS, ERA_CHAMPIONS } from "../data/glossary";
import { ERAS as GAME_ERAS } from "../game/eras";
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
  Heliocentric: "#fdba74", Pressure: "#fca5a5",
  Shotmaker: "#fde047", "Three-Level": "#f472b6", Scoring: "#fda4af", Speed: "#67e8f9",
  "All-Around": "#fbbf24",
  Gravity: "#c4b5fd", Stretch: "#7dd3fc",
  Slashing: "#f87171", "Pick-and-Roll": "#facc15", "3-and-D": "#60a5fa",
  Playmaking: "#4ade80",
};

/* ── One archetype/modifier, in the site's card language ─────────── */
function ComponentCard({ comp, lang, compact }) {
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
    <div className={`pcard-stage${compact ? " compact" : ""}`}>
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
          <p style={{ fontSize: compact ? 9.5 : 11.5, lineHeight: 1.4, color: "var(--text-muted)", margin: 0 }}>{desc}</p>
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
                      <div key={m.key} className="pcard-arch-item" style={{ gridTemplateColumns: compact ? "62px 1fr 22px" : "84px 1fr 26px" }}>
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

// Dataset 1983-84'ten başlıyor (bkz. CLAUDE.md) ve 2025-26 hâlâ oynanıyor —
// o yüzden era aralığı bu iki sınıra kırpılır (canlı sezon ayrı skorlama
// yolundan geldiği için tarihsel karşılaştırmaya dahil edilmiyor).
function seasonsInEra(gameEra) {
  const [startYr, endYr] = gameEra.years;
  const lo = Math.max(startYr, 1983), hi = Math.min(endYr, 2025);
  const out = [];
  for (let y = lo; y < hi; y++) out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return out;
}

// Bir era için gerçek en başarılı takımların ve o dönemin GERÇEKTEN en yüksek
// overall'a sahip, era'yı tanımlayan oyuncularının sadece tıklanınca açılan kart hali.
function EraCard({ era, lang }) {
  const [expanded, setExpanded] = useState(false);
  const [lineup, setLineup] = useState(null);
  const [loading, setLoading] = useState(false);

  const champions = ERA_CHAMPIONS[era.short] || [];
  const gameEra = GAME_ERAS.find(e => e.short === era.short);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !lineup && !loading && gameEra) {
      setLoading(true);
      try {
        const seasonList = seasonsInEra(gameEra);
        const results = await Promise.all(
          seasonList.map(s => api.historical(s, { limit: 300, sort_col: "overall_score" }).catch(() => ({ players: [] })))
        );
        // Bir oyuncunun bu era'daki EN İYİ (zirve) sezonunu tut — aynı isim
        // birden fazla sezonda çıkarsa en yüksek overall'ı kazanır.
        const bestByName = new Map();
        results.forEach((d, i) => {
          for (const p of d.players || []) {
            if ((p.GP || 0) < 40 || p.overall_score == null) continue;   // yarım-sezon/az-maç gürültüsünü ele
            const prev = bestByName.get(p.PLAYER_NAME);
            if (!prev || p.overall_score > prev.overall_score) bestByName.set(p.PLAYER_NAME, { ...p, _season: seasonList[i] });
          }
        });
        const top5 = [...bestByName.values()].sort((a, b) => b.overall_score - a.overall_score).slice(0, 5);
        setLineup(top5);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
  };

  // Arkadaki dokuyu (holo çizgileri) kaldırıp yerine, o eranın META
  // arketiplerinin kendi renginde soluk glow'ları serpiştiriyoruz.
  const metaArchs = era.top.map(t => t.split(" ×")[0].trim());

  return (
    <div className={`era-card${expanded ? " expanded" : ""}`}
      style={{ "--accent": era.color, "--accent-a": era.color + "48", "--accent-b": era.color + "30", "--accent-line": era.color + "66" }}
      onClick={() => !expanded && toggle()}>
      {metaArchs.map((arch, i) => (
        <span key={arch} className="aura-blob era-card-meta-glow"
          style={{ "--slot-color": CORE_HEX[arch] || era.color, left: `${((i + 0.5) / metaArchs.length) * 100}%`, transform: `translateX(-50%) rotate(${i * 53}deg)` }} />
      ))}

      <div className="era-card-head">
        <div className="era-card-badge" style={{ background: era.color + "1a", border: `1px solid ${era.color}55`, color: era.color }}>
          {era.short}
        </div>
        <div className="min-w-0 flex-1">
          <div className="era-card-title-row">
            <span className="era-card-label">{era.label}</span>
            <span className="era-card-years">{era.years}</span>
          </div>
          <div className="era-card-tagline" style={{ color: era.color }}>{era.meta}</div>
          <p className="era-card-desc">{era.desc}</p>
        </div>
        <div className="era-card-chev-wrap" onClick={(e) => { e.stopPropagation(); toggle(); }}>
          <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: era.color, fontFamily: "var(--font-logo)", fontWeight: 700 }}>
            {lang === "tr" ? "Detay" : "Details"}
          </span>
          <span className="era-chev" style={{ color: era.color }}>▾</span>
        </div>
      </div>

      <div className="era-card-expand-wrap">
        <div className="era-card-expand-inner">
          <div className="era-card-body" onClick={(e) => e.stopPropagation()}>

            <div className="pcard-section-lbl">{lang === "tr" ? "META ARKETİPLER" : "META ARCHETYPES"}</div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {era.top.map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ color: "#34d399", border: "1px solid #34d39940", background: "#34d39915" }}>{t}</span>
              ))}
              {era.low?.map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ color: "#f87171", border: "1px solid #f8717140", background: "#f8717115" }}>{t}</span>
              ))}
            </div>

            {champions.length > 0 && (
              <>
                <div className="pcard-section-lbl">{lang === "tr" ? "GERÇEK ŞAMPİYONLAR" : "REAL CHAMPIONS"}</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {champions.map(c => (
                    <div key={c.team} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,.04)" }}>
                      <span style={{ fontSize: 12 }}>🏆</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{c.team}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>×{c.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="pcard-section-lbl">
              {lang === "tr" ? "ERA'YI TANIMLAYAN OYUNCULAR" : "ERA-DEFINING PLAYERS"}
            </div>
            <p className="text-[9.5px] mb-2" style={{ color: "var(--text-faint)" }}>
              {lang === "tr"
                ? "Bu dönemin sezonları arasında en yüksek overall'a sahip 5 gerçek oyuncu (her biri kendi zirve sezonunda). Gerçekte birlikte oynamadılar."
                : "The 5 real players with the highest overall score across this era's seasons (each at their own peak season). Not an actual roster that played together."}
            </p>
            {loading ? <div className="pcard-loading">Loading…</div> : (
              lineup?.length ? lineup.map((p, i) => (
                <div key={i} className="pcard-sim-row">
                  <div>
                    <div className="pcard-sim-name">{p.PLAYER_NAME}</div>
                    <div className="pcard-sim-meta">{p.TEAM_ABBREVIATION} · <span className="a">{p.primary_arch}</span> · {p._season}</div>
                  </div>
                  <div className="pcard-sim-pct">
                    <div className="v">{p.overall_score != null ? Math.round(p.overall_score * 100) : "—"}</div>
                    <div className="l">overall</div>
                  </div>
                </div>
              )) : lineup && <div className="pcard-empty">No data</div>
            )}
          </div>
        </div>
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

          {/* Card grid — compact everywhere so ~5 fit per row */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid gap-5 justify-items-center items-start"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {shownComps.map(comp => <ComponentCard key={comp.name} comp={comp} lang={lang} compact />)}
            </div>
          </div>
        </>
      )}

      {section === "eras" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-3xl mx-auto space-y-4">
            {ERAS.map(era => <EraCard key={era.short} era={era} lang={lang} />)}
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
