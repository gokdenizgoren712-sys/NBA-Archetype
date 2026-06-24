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
    </div>
  );
}
