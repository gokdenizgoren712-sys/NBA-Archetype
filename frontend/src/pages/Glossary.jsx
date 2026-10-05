import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { METRIC_LABELS, CORE_COMPONENTS, MODIFIER_COMPONENTS, ERA_GUIDE as ERAS, ERA_CHAMPIONS } from "../data/glossary";
import { ERAS as GAME_ERAS } from "../game/eras";
import { useLang } from "../contexts/LanguageContext";
import { api } from "../api";
import PaIcon from "../components/shell/PaIcon";
import ExploreHeader from "../components/explore/ExploreHeader";
import { ARCHETYPE_COLOR as CORE_HEX, ARCHETYPE_BLURB, archetypeArt } from "../constants/archetypeColors";
import "./fundamentals.css";

// ── Fundamentals · Glossary (handoff 9b / mobil 21b) ────────────────────────
// Masaüstü: 4 sütun arketip kartı (renkli gradyan, arketip görseli, eşik,
// kısa tanım, "Top players →" o arketiple süzülmüş Players'a gider).
// Modifier'lar aynı kart dilinde, görsel yerine metrik ağırlıklarıyla.
// Mobil: akordeon liste (nokta · ad · oyuncu sayısı; açınca tanım + örnek).
// "NBA eras" aynı sayfada ayrı bir tür.

export const FUNDAMENTALS_TABS = [
  { key: "glossary", path: "/basketball/glossary", label: "Glossary" },
  { key: "about",    path: "/basketball/about",    label: "About & method" },
];

const MODIFIER_HEX = {
  Heliocentric: "#fdba74", Pressure: "#fca5a5", Shotmaker: "#fde047", "Three-Level": "#f472b6",
  Scoring: "#fda4af", Speed: "#67e8f9", "All-Around": "#fbbf24", Gravity: "#c4b5fd", Stretch: "#7dd3fc",
  Slashing: "#f87171", "Pick-and-Roll": "#facc15", "3-and-D": "#60a5fa", Playmaking: "#4ade80",
};
const colorOf = (c) => (c.type === "Core" ? CORE_HEX[c.name] : MODIFIER_HEX[c.name]) || "#9ca3af";

function GlossCard({ comp, lang, onTop }) {
  const isCore = comp.type === "Core";
  const c = colorOf(comp);
  const blurb = isCore ? (lang === "tr" && comp.desc_tr ? comp.desc_tr : ARCHETYPE_BLURB[comp.name] || comp.desc)
    : (lang === "tr" && comp.desc_tr ? comp.desc_tr : comp.desc);
  const metrics = [...(comp.metrics || [])].sort((a, b) => b.w - a.w).slice(0, 4);
  return (
    <article className={`fg-card${isCore ? "" : " mod"}`} style={{ "--c": c }}
      onClick={isCore ? onTop : undefined} role={isCore ? "link" : undefined} tabIndex={isCore ? 0 : undefined}
      onKeyDown={isCore ? (e) => e.key === "Enter" && onTop() : undefined}>
      <i className="glow" />
      <div className="top"><span>{comp.type}</span><b>{comp.threshold}</b></div>
      {isCore ? <img className="art" src={archetypeArt(comp.name)} alt="" loading="lazy" /> : (
        <div className="fg-metrics">
          {metrics.map(m => {
            const meta = METRIC_LABELS[m.key] || { label: m.key };
            return (
              <div key={m.key}>
                <span>{lang === "tr" && meta.label_tr ? meta.label_tr : meta.label}{m.higher === false && <em> (lower)</em>}</span>
                <div className="tr"><i style={{ width: `${Math.round(m.w * 100)}%` }} /></div>
                <b>{Math.round(m.w * 100)}%</b>
              </div>
            );
          })}
        </div>
      )}
      <h3>{comp.name}</h3>
      <p>{blurb}</p>
      {isCore && <span className="cta">Top players →</span>}
    </article>
  );
}

/* Mobil akordeon satırı (21b) */
function AccRow({ comp, count, lang, open, onToggle }) {
  const c = colorOf(comp);
  const [ex, setEx] = useState(null);
  useEffect(() => {
    if (!open || ex || comp.type !== "Core") return;
    api.players({ arch: comp.name, limit: 1, sort_by: "overall_score" })
      .then(d => setEx(d.players?.[0]?.PLAYER_NAME || "—")).catch(() => setEx("—"));
  }, [open, ex, comp]);
  return (
    <div className={`fg-acc-row${open ? " open" : ""}`} style={{ "--c": c }}>
      <button onClick={onToggle} aria-expanded={open}>
        <i /><span>{comp.name}</span>
        {count != null && <em>{count}</em>}
        <PaIcon name="chevron" size={14} color="var(--text-faint)" />
      </button>
      {open && (
        <div className="body">
          <p>{lang === "tr" && comp.desc_tr ? comp.desc_tr : comp.desc}</p>
          {comp.type === "Core" && <span>Example: <b>{ex || "…"}</b></span>}
          {comp.type !== "Core" && <span>{comp.threshold} of players</span>}
        </div>
      )}
    </div>
  );
}

// Dataset 1983-84'ten başlıyor ve 2025-26 hâlâ oynanıyor — era aralığı kırpılır.
function seasonsInEra(gameEra) {
  const [startYr, endYr] = gameEra.years;
  const lo = Math.max(startYr, 1983), hi = Math.min(endYr, 2025);
  const out = [];
  for (let y = lo; y < hi; y++) out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return out;
}

function EraCard({ era, lang }) {
  const [open, setOpen] = useState(false);
  const [lineup, setLineup] = useState(null);
  const [loading, setLoading] = useState(false);
  const champions = ERA_CHAMPIONS[era.short] || [];
  const gameEra = GAME_ERAS.find(e => e.short === era.short);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !lineup && !loading && gameEra) {
      setLoading(true);
      try {
        const seasonList = seasonsInEra(gameEra);
        const results = await Promise.all(seasonList.map(s => api.historical(s, { limit: 300, sort_col: "overall_score" }).catch(() => ({ players: [] }))));
        // Her oyuncunun bu era'daki zirve sezonu
        const best = new Map();
        results.forEach((d, i) => {
          for (const p of d.players || []) {
            if ((p.GP || 0) < 40 || p.overall_score == null) continue;
            const prev = best.get(p.PLAYER_NAME);
            if (!prev || p.overall_score > prev.overall_score) best.set(p.PLAYER_NAME, { ...p, _season: seasonList[i] });
          }
        });
        setLineup([...best.values()].sort((a, b) => b.overall_score - a.overall_score).slice(0, 5));
      } catch { setLineup([]); }
      setLoading(false);
    }
  };

  return (
    <div className={`fg-era${open ? " open" : ""}`} style={{ "--c": era.color }}>
      <button className="head" onClick={toggle} aria-expanded={open}>
        <span className="badge">{era.short}</span>
        <span className="txt">
          <span className="t"><b>{era.label}</b><em>{era.years}</em></span>
          <span className="m">{era.meta}</span>
        </span>
        <PaIcon name="chevron" size={16} color="var(--text-muted)" />
      </button>
      <p className="desc">{era.desc}</p>
      {open && (
        <div className="body">
          <div className="grp">
            <span className="lbl">{lang === "tr" ? "Meta arketipler" : "Meta archetypes"}</span>
            <div className="chips">
              {era.top.map(t => <span key={t} className="up">{t}</span>)}
              {era.low?.map(t => <span key={t} className="down">{t}</span>)}
            </div>
          </div>
          {champions.length > 0 && (
            <div className="grp">
              <span className="lbl">{lang === "tr" ? "Gerçek şampiyonlar" : "Real champions"}</span>
              <div className="chips">
                {champions.map(c => (
                  <span key={c.team} className="champ"><PaIcon name="trophy" size={14} color="#FFB11B" />{c.team}<em>×{c.count}</em></span>
                ))}
              </div>
            </div>
          )}
          <div className="grp">
            <span className="lbl">{lang === "tr" ? "Era'yı tanımlayan oyuncular" : "Era-defining players"}</span>
            <p className="note">
              {lang === "tr"
                ? "Bu dönemin sezonları arasında en yüksek overall'a sahip 5 gerçek oyuncu, her biri kendi zirve sezonunda. Birlikte oynamadılar."
                : "The five real players with the highest overall across this era's seasons, each at their own peak. They never played together."}
            </p>
            {loading ? <p className="note">Loading…</p> : lineup?.map(p => (
              <div key={p.PLAYER_NAME} className="pl">
                <span>{p.PLAYER_NAME}<em>{p.TEAM_ABBREVIATION} · <i style={{ color: CORE_HEX[p.primary_arch] }}>{p.primary_arch}</i> · {p._season}</em></span>
                <b>{Math.round(p.overall_score * 100)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GlossaryContent() {
  const { lang } = useLang();
  const navigate = useNavigate();
  const [kind, setKind] = useState("core");
  const [openAcc, setOpenAcc] = useState(null);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    api.players({ limit: 1 }).then(d => setCounts(d.arch_counts || {})).catch(() => {});
  }, []);

  const comps = kind === "core" ? CORE_COMPONENTS : kind === "modifier" ? MODIFIER_COMPONENTS : [];
  const tint = openAcc ? colorOf([...CORE_COMPONENTS, ...MODIFIER_COMPONENTS].find(c => c.name === openAcc) || {}) : "#FFB11B";
  const KINDS = [["core", lang === "tr" ? "Temel" : "Core"], ["modifier", "Modifiers"], ["eras", lang === "tr" ? "NBA era'ları" : "NBA eras"]];

  return (
    <div className="fg-page">
      <div className="fg-inner">
        <ExploreHeader title="Fundamentals" active="glossary" tabs={FUNDAMENTALS_TABS} aside={
          <div className="fg-kinds" role="radiogroup" aria-label="Show">
            {KINDS.map(([k, l]) => (
              <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
        } />

        {kind === "eras" ? (
          <div className="fg-eras">
            {ERAS.map(era => <EraCard key={era.short} era={era} lang={lang} />)}
            <p className="fg-note">
              Era weights follow observable NBA trends: pace, three-point attempt rate, championship roster construction and rule changes.
              The Spacer weight rises from ×0.45 (Magic/Bird) to ×1.35 (Small Ball), tracking the three-point rate's growth from about 3 to about 35 attempts per team per game.
              The weights are deliberately coarse — directional, not a regression model.
            </p>
          </div>
        ) : (
          <>
            <div className="fg-grid">
              {comps.map(c => (
                <GlossCard key={c.name} comp={c} lang={lang}
                  onTop={() => navigate(`/basketball/players?arch=${encodeURIComponent(c.name)}`)} />
              ))}
            </div>
            <div className="fg-acc">
              {comps.map(c => (
                <AccRow key={c.name} comp={c} lang={lang} count={c.type === "Core" ? counts[c.name] : null}
                  open={openAcc === c.name} onToggle={() => setOpenAcc(o => (o === c.name ? null : c.name))} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
