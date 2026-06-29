import { useState } from "react";
import { COMPONENTS, METRIC_LABELS, CORE_COMPONENTS, MODIFIER_COMPONENTS } from "../data/glossary";
import { useLang } from "../contexts/LanguageContext";

function MetricRow({ metricKey, w, higher, lang }) {
  const meta = METRIC_LABELS[metricKey] || { label: metricKey, desc: "" };
  const pct  = Math.round(w * 100);
  const label = lang === "tr" && meta.label_tr ? meta.label_tr : meta.label;
  const desc  = lang === "tr" && meta.desc_tr  ? meta.desc_tr  : meta.desc;
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <div className="w-32 shrink-0">
        <div className="text-xs font-medium text-slate-200">{label}</div>
        <div className="text-[9px] text-slate-600 font-mono">{metricKey}</div>
      </div>
      <div className="w-24 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 w-6">{pct}%</span>
        </div>
      </div>
      <div className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
        higher
          ? "bg-emerald-900/40 text-emerald-400"
          : "bg-rose-900/40 text-rose-400"
      }`}>
        {higher
          ? (lang === "tr" ? "↑ yüksek = iyi" : "↑ higher = better")
          : (lang === "tr" ? "↓ düşük = iyi" : "↓ lower = better")}
      </div>
      <div className="text-[10px] text-slate-500 flex-1">{desc}</div>
    </div>
  );
}

function ComponentCard({ comp, expanded, onToggle, lang }) {
  const desc = lang === "tr" && comp.desc_tr ? comp.desc_tr : comp.desc;
  const typeLabel = lang === "tr"
    ? (comp.type === "Core" ? "Temel" : "Modifier")
    : comp.type;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${comp.bg}`}>
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-bold text-base ${comp.color}`}>{comp.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              comp.type === "Core"
                ? "bg-violet-900/30 text-violet-400 border-violet-700/40"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}>{typeLabel}</span>
          </div>
          <p className="text-sm text-slate-300">{desc}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {lang === "tr" ? "Eşik" : "Threshold"}: {comp.threshold}
          </p>
        </div>
        <span className="text-slate-500 text-lg mt-0.5">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            {lang === "tr"
              ? "Metrikler & Ağırlıklar (bileşik skor = ağırlıklı toplam, ardından persantil)"
              : "Metrics & Weights (composite score = weighted sum, then percentile-ranked)"}
          </div>
          {comp.metrics.map(m => (
            <MetricRow key={m.key} metricKey={m.key} w={m.w} higher={m.higher} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Glossary() {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter]     = useState("all");

  const toggle = (name) => setExpanded(p => ({ ...p, [name]: !p[name] }));
  const expandAll = () => {
    const next = {};
    COMPONENTS.forEach(c => next[c.name] = true);
    setExpanded(next);
  };

  const shown = filter === "core"     ? CORE_COMPONENTS
              : filter === "modifier" ? MODIFIER_COMPONENTS
              : COMPONENTS;

  const filterLabels = lang === "tr"
    ? [["all","Tümü"],["core","Temel"],["modifier","Modifier"]]
    : [["all","All"],["core","Core"],["modifier","Modifiers"]];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          {lang === "tr" ? "Arketip Sözlüğü" : "Archetype Glossary"}
        </h1>
        <p className="text-slate-400 text-sm">
          {lang === "tr" ? (
            <>Her oyuncu, her bileşen için bir <span className="text-violet-300 font-medium">0–100 skor</span> alır.
            Skorlar, aşağıdaki metriklerin ağırlıklı bileşiğinin{" "}
            <span className="text-violet-300 font-medium">persantil sıralamasıdır</span>.
            Bileşik değer eşiği aşarsa oyuncu o etiketi taşır.
            Tüm metrikler sezon içi persantil olarak hesaplanır — farklı dönemler doğrudan karşılaştırılabilir.</>
          ) : (
            <>Each player receives a <span className="text-violet-300 font-medium">0–100 score</span> for every component.
            Scores are computed as a <span className="text-violet-300 font-medium">percentile-ranked</span> weighted composite of the metrics below.
            A player "carries" a component when their score crosses the threshold percentile.
            All metrics are within-season percentiles, making eras directly comparable.</>
          )}
        </p>
      </div>

      {/* System overview */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          {
            label: lang === "tr" ? "Temel Arketip" : "Core Archetypes",
            value: "12",
            desc:  lang === "tr" ? "Birincil rol → radar'da görünür, lineup uyumunu yönlendirir" : "Primary role → shows on radar, drives lineup compat",
          },
          {
            label: lang === "tr" ? "Modifier Tag" : "Modifier Tags",
            value: "22",
            desc:  lang === "tr" ? "Aktif rozetler olarak gösterilen niteleyici özellikler" : "Qualifying attributes shown as active badges",
          },
          {
            label: lang === "tr" ? "Skor Aralığı" : "Score Range",
            value: "0–100",
            desc:  lang === "tr" ? "Persantil tabanlı, dönem bağımsız" : "Percentile-based, era-neutral",
          },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-violet-400">{s.value}</div>
            <div className="text-sm text-white font-medium mt-1">{s.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* How scores work */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-8">
        <h2 className="text-white font-semibold mb-3">
          {lang === "tr" ? "Bileşen Skorları Nasıl Hesaplanır" : "How Component Scores Work"}
        </h2>
        <ol className="space-y-2 text-sm text-slate-300">
          {lang === "tr" ? (
            <>
              <li><span className="text-violet-400 font-bold mr-2">1.</span>Her metrik için oyuncunun <span className="text-white">sezon içi persantil sırası</span> (0–1) hesaplanır.</li>
              <li><span className="text-violet-400 font-bold mr-2">2.</span>"Düşük = iyi" metrikler (ör. DEF_RATING) için persantil ters çevrilir: <code className="text-xs bg-slate-800 px-1 rounded">skor = 1 − persantil</code></li>
              <li><span className="text-violet-400 font-bold mr-2">3.</span>O bileşen için tüm metriklerin <span className="text-white">ağırlıklı toplamı</span> hesaplanır.</li>
              <li><span className="text-violet-400 font-bold mr-2">4.</span>Bu bileşik değer oyuncunun <span className="text-white">bileşen skorudur</span> (0–1 → 0–100 olarak gösterilir).</li>
              <li><span className="text-violet-400 font-bold mr-2">5.</span>Bileşik değer bileşenin <span className="text-white">eşik persantilini</span> geçerse oyuncu o etiketi taşır.</li>
            </>
          ) : (
            <>
              <li><span className="text-violet-400 font-bold mr-2">1.</span>For each metric, compute the player's <span className="text-white">within-season percentile rank</span> (0–1).</li>
              <li><span className="text-violet-400 font-bold mr-2">2.</span>For "lower = better" metrics (e.g. DEF_RATING), invert the percentile: <code className="text-xs bg-slate-800 px-1 rounded">score = 1 − percentile</code>.</li>
              <li><span className="text-violet-400 font-bold mr-2">3.</span>Compute the <span className="text-white">weighted sum</span> across all metrics for that component.</li>
              <li><span className="text-violet-400 font-bold mr-2">4.</span>This composite is the player's <span className="text-white">component score</span> (0–1 → displayed as 0–100).</li>
              <li><span className="text-violet-400 font-bold mr-2">5.</span>If the composite exceeds the component's <span className="text-white">percentile threshold</span>, the player "carries" that label.</li>
            </>
          )}
        </ol>
        <div className="mt-4 p-3 bg-slate-800 rounded-lg text-xs text-slate-400">
          <span className="text-slate-200 font-medium">
            {lang === "tr" ? "Örnek — SGA Engine skoru:" : "Example — SGA Engine score:"}
          </span>{" "}
          USG%(96th)×0.22 + Unassisted FGM%(91st)×0.18 + Time of Poss(88th)×0.18 + ... = <span className="text-violet-400">0.956 → 96/100</span>.
          {" "}{lang === "tr"
            ? "Eşik 80. persantil → ✓ Engine etiketini taşır."
            : "Threshold is 80th percentile → ✓ carries \"Engine\"."}
        </div>
      </div>

      {/* Component cards */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {filterLabels.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === k
                  ? "bg-violet-600 text-white"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}>{l}</button>
          ))}
        </div>
        <button onClick={expandAll} className="text-xs text-slate-500 hover:text-violet-400 transition-colors">
          {lang === "tr" ? "Tümünü genişlet" : "Expand all"}
        </button>
      </div>

      <div className="space-y-3">
        {shown.map(comp => (
          <ComponentCard
            key={comp.name}
            comp={comp}
            expanded={!!expanded[comp.name]}
            onToggle={() => toggle(comp.name)}
            lang={lang}
          />
        ))}
      </div>

      {/* NBA Eras */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-white mb-1">NBA Eras and Era Fit</h2>
        <p className="text-sm text-slate-400 mb-6">
          The Lineup Builder game scores each player's <span className="text-amber-300 font-medium">Era Fit</span> — how well their archetype aligned with the meta of the era they played in.
          Era Fit is computed as: <code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">era_weight[archetype] × score_[archetype]</code>.
          The archetype score is the player's within-season percentile composite (0–1).
          The era weight reflects how much NBA teams valued that archetype in a given period, derived from pace, shot distribution, and lineup construction trends of each era.
        </p>

        <div className="space-y-3">
          {[
            {
              short: "80s", label: "Magic vs Bird Era", years: "1979–1991",
              color: "text-amber-400", bg: "border-amber-700/30 bg-amber-900/10",
              meta: "Post play, team ball, mid-range dominance",
              desc: "The league ran through dominant big men (Kareem, Barkley, Malone) and all-court playmakers (Magic, Bird). The 3-pointer existed but was rarely attempted — Spacers were virtually irrelevant. Ecosystems and Force/Anchor archetypes commanded maximum value.",
              top: ["Ecosystem ×1.30", "Force ×1.20", "Anchor ×1.15", "Hub ×1.15"],
              low: ["Spacer ×0.45", "Initiator ×0.70", "Rim Runner ×0.70"],
            },
            {
              short: "Jordan", label: "Jordan Era", years: "1991–1998",
              color: "text-red-400", bg: "border-red-700/30 bg-red-900/10",
              meta: "Isolation scoring, lockdown defense, pure athleticism",
              desc: "Michael Jordan redefined individual excellence. Teams were built around one dominant scorer with supporting stoppers. Engines and Creators peaked in value; lockdown Stoppers were premium. The Ecosystem archetype declined as isolation replaced ball movement.",
              top: ["Engine ×1.25", "Creator ×1.20", "Stopper ×1.15"],
              low: ["Spacer ×0.60", "Ecosystem ×0.85", "Hub ×0.90"],
            },
            {
              short: "Dead Ball", label: "Dead Ball Era", years: "1998–2008",
              color: "text-slate-300", bg: "border-slate-600/30 bg-slate-800/20",
              meta: "Physical defense, post play, deliberately slow pace",
              desc: "The league's lowest-scoring era since the shot clock. Physical hand-checking rules rewarded defensive specialists. Interior bigs (Shaq, Duncan, KG) defined championship rosters. Spacing was minimal — teams rarely attempted 3s. Anchors and Stoppers dominated; Spacers had almost no value.",
              top: ["Anchor ×1.25", "Stopper ×1.20", "Force ×1.15"],
              low: ["Spacer ×0.55", "Ecosystem ×0.85", "Connector ×0.85"],
            },
            {
              short: "Proto ST", label: "Proto Super Team Era", years: "2008–2014",
              color: "text-blue-400", bg: "border-blue-700/30 bg-blue-900/10",
              meta: "Pick-and-roll revolution, emerging stretch bigs, early spacing",
              desc: "The post-handcheck era opened up driving lanes. Pick-and-roll became the primary offensive system (Nash Suns, LeBron Cavs, Thunder). Stretch bigs started emerging — Dirk proved a shooting big could win a title. Rim Runners became premium in the new pace-friendly game. A transitional era where most archetypes had balanced value.",
              top: ["Engine ×1.10", "Creator ×1.05", "Rim Runner ×1.10"],
              low: ["Spacer ×0.80", "Ecosystem ×0.95"],
            },
            {
              short: "Small Ball", label: "Small Ball Era", years: "2014–2020",
              color: "text-emerald-400", bg: "border-emerald-700/30 bg-emerald-900/10",
              meta: "Spacing is king, 3-point explosion, pace and space",
              desc: "The Warriors dynasty redefined basketball. Three-point volume exploded, traditional big men were phased out, and floor spacing became non-negotiable. A Spacer from this era was exponentially more valuable than in any prior period. Force and Anchor archetypes struggled as teams stopped playing through the post.",
              top: ["Spacer ×1.35", "Engine ×1.20", "Creator ×1.10"],
              low: ["Force ×0.65", "Anchor ×0.70", "Initiator ×0.90"],
            },
            {
              short: "Parity", label: "Parity Era", years: "2020–present",
              color: "text-violet-400", bg: "border-violet-700/30 bg-violet-900/10",
              meta: "Two-way versatility, load management, balanced rosters",
              desc: "No single dominant style defines this era. Teams value switchable, two-way players who can play multiple positions. The Ecosystem archetype (playmaking bigs, pass-first guards) has re-emerged as load management and roster depth became strategic priorities. Spacing remains important but pure Spacers are less dominant than in the Small Ball era.",
              top: ["Spacer ×1.20", "Ecosystem ×1.15", "Connector ×1.10"],
              low: ["Force ×0.80", "Anchor ×0.85"],
            },
          ].map(era => (
            <div key={era.label} className={`border rounded-xl p-4 ${era.bg}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${era.bg} ${era.color}`}>{era.short}</span>
                <span className={`font-bold text-base ${era.color}`}>{era.label}</span>
                <span className="text-xs text-slate-500">{era.years}</span>
              </div>
              <p className="text-xs text-slate-400 italic mb-2">{era.meta}</p>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">{era.desc}</p>
              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">Meta archetypes</div>
                  <div className="flex flex-wrap gap-1">
                    {era.top.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/30 border border-emerald-700/40 text-emerald-300">{t}</span>
                    ))}
                  </div>
                </div>
                {era.low?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-red-500 uppercase tracking-wider mb-1">Off-meta</div>
                    <div className="flex flex-wrap gap-1">
                      {era.low.map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-red-900/30 border border-red-700/40 text-red-400">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-2 text-sm">How era weights were determined</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Era weights are set manually based on observable NBA trends: pace, 3-point attempt rates, championship roster construction, and rule changes. For example, the Spacer weight rises from ×0.45 (Magic/Bird) to ×1.35 (Small Ball) tracking the 3-point rate's growth from ~3 attempts per team per game in 1985 to ~35 in 2019. Anchor weight falls as post-up frequency declined and switch-heavy defenses made traditional big men less effective. Weights are intentionally coarse — the goal is directional accuracy, not a regression model.
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            These weights are applied only in the Lineup Builder game's Era Fit score. Archetype scores in the Players and Historical pages are purely within-season percentile rankings and are not era-adjusted.
          </p>
        </div>
      </div>
    </div>
  );
}
