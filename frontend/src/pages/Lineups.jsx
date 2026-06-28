import { useState, useEffect } from "react";
import { api } from "../api";
import RoleBreakdown from "../components/RoleBreakdown";
import RoleImpactChart from "../components/RoleImpactChart";
import PlayerNameInput from "../components/PlayerNameInput";
import { explainLineup } from "../utils/lineupExplain";
import { useLang } from "../contexts/LanguageContext";

const SCORE_COLOR = (v) =>
  v >= 0.85 ? "text-blue-400"   :
  v >= 0.70 ? "text-blue-400"   :
  v >= 0.55 ? "text-emerald-400": "text-slate-500";

function MiniBar({ value }) {
  const pct = Math.round((value||0)*100);
  const bg  = value>=0.80?"bg-blue-500":value>=0.65?"bg-blue-600":"bg-slate-700";
  return (
    <div className="flex items-center gap-1">
      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${bg}`} style={{ width:`${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 w-5">{pct}</span>
    </div>
  );
}

const POS_BADGE = {
  PG:"bg-blue-900/40 text-blue-300",
  SG:"bg-sky-900/40 text-sky-300",
  SF:"bg-emerald-900/40 text-emerald-300",
  PF:"bg-amber-900/40 text-amber-300",
  C: "bg-red-900/40 text-red-300"
};

export default function Lineups() {
  const { t, lang } = useLang();
  const [topLineups, setTopLineups]   = useState([]);
  const [loading, setLoading]         = useState(false);
  const [slots, setSlots]             = useState(["", "", "", "", ""]);
  const [allNames, setAllNames]       = useState([]);
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError]   = useState("");
  const [mode, setMode] = useState("positional");
  const [tab, setTab] = useState("theoretical");  // "theoretical" | "real"
  const [realLineups, setRealLineups] = useState([]);
  const [realLoading, setRealLoading] = useState(false);
  const [realSort, setRealSort] = useState("NET_RATING");
  const [corr, setCorr] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.lineupCompat({ limit: 50, positional: mode === "positional" ? 1 : 0, unique: 1 })
      .then(d => setTopLineups(d.lineups||[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => {
    if (tab !== "real") return;
    setRealLoading(true);
    api.realLineups({ limit: 50, sort_by: realSort, min_min: 50 })
      .then(d => setRealLineups(d.lineups||[]))
      .catch(console.error)
      .finally(() => setRealLoading(false));
    if (!corr) {
      fetch("/api/lineups/correlation").then(r => r.json()).then(setCorr).catch(() => {});
    }
  }, [tab, realSort]);

  // Oyuncu adlarını bir kez yükle (autocomplete için)
  useEffect(() => {
    fetch("/api/player-names")
      .then(r => r.json())
      .then(d => setAllNames(d.names || []))
      .catch(() => {});
  }, []);

  const setSlot = (i, v) => setSlots(prev => { const a=[...prev]; a[i]=v; return a; });

  const evalCustom = async () => {
    setCustomResult(null);
    setCustomError("");
    const names = slots.map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { setCustomError(t("enter_min_2")); return; }
    try {
      const r = await api.customLineup(names);
      setCustomResult(r);
    } catch (e) { setCustomError(e.message); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Custom lineup calculator */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-white font-semibold mb-3">{t("custom_lineup_title")}</h2>
        <div className="flex gap-4">
          {/* 5 slot autocomplete inputs */}
          <div className="flex-1 space-y-2">
            {slots.map((v, i) => (
              <PlayerNameInput
                key={i}
                value={v}
                onChange={val => setSlot(i, val)}
                placeholder={`${t("position")} ${i+1}…`}
                allNames={allNames}
                slotLabel={`${i+1}`}
              />
            ))}
          </div>
          <div className="flex flex-col justify-between w-44">
            <button onClick={evalCustom}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              {t("calculate_fit")}
            </button>
            {customError && <p className="text-red-400 text-xs">{customError}</p>}
            {customResult && (
              <div className="bg-slate-800 rounded-lg p-3 space-y-1.5 text-sm">
                <PillarBreakdown result={customResult} lang={lang} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Season Role Impact */}
      <RoleImpactChart />

      {/* Top lineups — Theoretical / Real tabs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            <button onClick={() => setTab("theoretical")}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${tab==="theoretical"?"bg-blue-600 text-white":"bg-slate-900 text-slate-400 hover:text-white"}`}>
              {lang==="tr" ? "Teorik" : "Theoretical"}
            </button>
            <button onClick={() => setTab("real")}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${tab==="real"?"bg-blue-600 text-white":"bg-slate-900 text-slate-400 hover:text-white"}`}>
              {lang==="tr" ? "Gerçek Lineup'lar" : "Real Lineups"}
            </button>
          </div>
          {tab === "theoretical" && (
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {[["positional", t("positional_mode")], ["any", t("any_mode")]].map(([k,l])=>(
                <button key={k} onClick={() => setMode(k)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode===k?"bg-slate-700 text-white":"bg-slate-900 text-slate-400 hover:text-white"
                  }`}>{l}</button>
              ))}
            </div>
          )}
          {tab === "real" && (
            <select value={realSort} onChange={e => setRealSort(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
              <option value="NET_RATING">NET_RATING ↓</option>
              <option value="fit_score">{lang==="tr" ? "Fit Skoru ↓" : "Fit Score ↓"}</option>
              <option value="MIN">{lang==="tr" ? "Dakika ↓" : "Minutes ↓"}</option>
            </select>
          )}
        </div>

        {tab === "theoretical" && (
          <>
            {mode==="positional" && (
              <p className="text-xs text-slate-500 mb-4">{t("positional_note")}</p>
            )}
            {loading ? (
              <div className="text-slate-500 text-sm">{t("loading")}</div>
            ) : (
              <div className="space-y-2">
                {topLineups.map((lu, i) => (
                  <LineupCard key={i} lu={lu} rank={i} t={t} lang={lang} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "real" && (
          <>
            <p className="text-xs text-slate-500 mb-4">
              {lang==="tr"
                ? `Sezonda ≥50 dk oynanan gerçek 5'li grup'lar — fit skoru teorik arketip uyumu, NET_RATING sahadan gerçek veri.${corr?.r != null ? ` r=${corr.r} (n=${corr.n})` : ""}`
                : `Real 5-man groups with ≥50 min played — fit score is theoretical archetype compatibility, NET_RATING is on-court data.${corr?.r != null ? ` r=${corr.r} (n=${corr.n})` : ""}`}
            </p>
            {realLoading ? (
              <div className="text-slate-500 text-sm">{t("loading")}</div>
            ) : (
              <div className="space-y-2">
                {realLineups.map((lu, i) => (
                  <RealLineupCard key={i} lu={lu} rank={i} lang={lang} />
                ))}
                {realLineups.length === 0 && (
                  <div className="text-slate-500 text-sm text-center py-8">
                    {lang==="tr" ? "Veri yüklenemedi — API çalışıyor mu?" : "No data — is the API running?"}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const PILLAR_LABELS = {
  tr: { creation: "Yaratıcılık", spacing: "Spacing", defense: "Savunma", finishing: "Finishing", role_fit: "Rol Uyumu" },
  en: { creation: "Creation",    spacing: "Spacing",  defense: "Defense",  finishing: "Finishing", role_fit: "Role Fit"  },
};

function PillarBreakdown({ result, lang = "en", compact = false }) {
  if (!result) return null;

  // API eski alan adları (LineupCard: Kapsama vs) veya yeni pillar alanlar
  const pillars = result.pillar_breakdown || {
    Creation:  result.creation  ?? result.Kapsama,
    Spacing:   result.spacing   ?? result.ShotDepth,
    Defense:   result.defense   ?? result.balance,
    Finishing: result.finishing,
    "Role Fit":result.role_fit  ?? result.Denge,
  };
  const score = result.lineup_score ?? result.Uyum_Skoru ?? 0;
  const nShooters = result.n_shooters;
  const lbl = PILLAR_LABELS[lang] || PILLAR_LABELS.en;
  const PMAP = {
    Creation: lbl.creation, Spacing: lbl.spacing,
    Defense: lbl.defense, Finishing: lbl.finishing, "Role Fit": lbl.role_fit,
  };

  return (
    <div className="space-y-1">
      {Object.entries(pillars).map(([k, v]) => {
        if (v == null) return null;
        const pct = Math.round(v * 100);
        const barColor = v >= 0.80 ? "bg-blue-500" : v >= 0.65 ? "bg-blue-600/70" : "bg-slate-700";
        const label = PMAP[k] || k;
        const extra = k === "Spacing" && nShooters != null ? ` (${nShooters})` : "";
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-20 shrink-0">{label}{extra}</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-[10px] w-6 text-right ${SCORE_COLOR(v)}`}>{pct}</span>
          </div>
        );
      })}
      {!compact && (
        <div className="border-t border-slate-700 pt-1.5 flex justify-between font-semibold mt-1">
          <span className="text-slate-300 text-sm">Fit</span>
          <span className="text-blue-400 text-sm">{Math.round(score * 100)}</span>
        </div>
      )}
      {compact && (
        <div className="flex justify-between items-center pt-1 border-t border-slate-800 mt-0.5">
          <span className="text-[9px] text-slate-500">Fit</span>
          <span className={`text-lg font-bold ${SCORE_COLOR(score)}`}>{Math.round(score * 100)}</span>
        </div>
      )}
    </div>
  );
}

function LineupCard({ lu, rank, t, lang }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-slate-500 text-xs w-5">{rank+1}</span>
          <span className="text-white text-sm font-medium">
            {[lu.Oyuncu_1,lu.Oyuncu_2,lu.Oyuncu_3,lu.Oyuncu_4,lu.Oyuncu_5]
              .filter(Boolean).join(" · ")}
          </span>
        </div>
        {/* Positions */}
        {(lu.Pos_PG||lu.PG) && (
          <div className="flex flex-wrap gap-1 ml-7 mt-1">
            {[["PG",lu.Pos_PG||lu.PG],["SG",lu.Pos_SG||lu.SG],["SF",lu.Pos_SF||lu.SF],
              ["PF",lu.Pos_PF||lu.PF],["C",lu.Pos_C||lu.C]].map(([pos,name])=>
              name ? (
                <span key={pos} className={`text-[10px] px-1.5 py-0.5 rounded ${POS_BADGE[pos]||"bg-slate-800 text-slate-400"}`}>
                  {pos}: {name}
                </span>
              ) : null
            )}
          </div>
        )}
        {lu.Arketipler && (
          <div className="text-xs text-slate-500 ml-7 mt-0.5">{lu.Arketipler}</div>
        )}
        {/* Dinamik lineup açıklaması */}
        <div className="text-[10px] text-slate-400 ml-7 mt-1.5 leading-relaxed max-w-xl">
          {explainLineup(lu, lang)}
        </div>
      </div>

      {/* Sağ panel: pillar bars + fit skoru */}
      <div className="flex flex-col gap-2 ml-7 sm:ml-0 shrink-0 w-52">
        <PillarBreakdown result={lu} lang={lang} compact />
      </div>
    </div>
  );
}

function RealLineupCard({ lu, rank, lang }) {
  const net = lu.NET_RATING;
  const fit = lu.fit_score;
  const netColor = net >= 10 ? "text-emerald-400" : net >= 0 ? "text-blue-300" : "text-red-400";
  const players = (lu.GROUP_NAME || "").split(" - ");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
      <span className="text-slate-600 text-xs w-6 shrink-0">{rank + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-x-1 mb-1">
          {players.map((p, i) => (
            <span key={i} className="text-xs text-white font-medium">{p}{i < players.length - 1 ? " ·" : ""}</span>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
          <span>{Math.round(lu.MIN || 0)} min</span>
          {lu.PLUS_MINUS != null && <span>+/−: {lu.PLUS_MINUS > 0 ? "+" : ""}{lu.PLUS_MINUS}</span>}
        </div>
      </div>
      <div className="flex gap-4 shrink-0">
        {fit != null && (
          <div className="text-center">
            <div className={`text-lg font-bold ${SCORE_COLOR(fit)}`}>{Math.round(fit * 100)}</div>
            <div className="text-[9px] text-slate-500">Fit</div>
          </div>
        )}
        {net != null && (
          <div className="text-center">
            <div className={`text-lg font-bold ${netColor}`}>{net > 0 ? "+" : ""}{net.toFixed(1)}</div>
            <div className="text-[9px] text-slate-500">NET RTG</div>
          </div>
        )}
      </div>
    </div>
  );
}
