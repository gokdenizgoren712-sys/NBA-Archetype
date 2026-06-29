import { useState, useEffect } from "react";
import { api } from "../api";
import RoleBreakdown from "../components/RoleBreakdown";
import RoleImpactChart from "../components/RoleImpactChart";
import PlayerNameInput from "../components/PlayerNameInput";
import { explainLineup } from "../utils/lineupExplain";
import { useLang } from "../contexts/LanguageContext";

const SCORE_COLOR = (v) =>
  v >= 0.80 ? "var(--accent)" :
  v >= 0.65 ? "#d97706"       :
              "var(--text-muted)";

function MiniBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: value >= 0.70 ? "var(--accent)" : "var(--border)" }} />
      </div>
      <span className="text-[10px] w-5" style={{ color: "var(--text-muted)" }}>{pct}</span>
    </div>
  );
}

const POS_COLOR = {
  PG: "#a78bfa", SG: "#60a5fa", SF: "#34d399", PF: "#fb923c", C: "#f87171",
};

function PillarBreakdown({ result, lang = "en", compact = false }) {
  if (!result) return null;
  const pillars = result.pillar_breakdown || {
    Creation:   result.creation   ?? result.Kapsama,
    Spacing:    result.spacing    ?? result.ShotDepth,
    Defense:    result.defense    ?? result.balance,
    Finishing:  result.finishing,
    "Role Fit": result.role_fit   ?? result.Denge,
  };
  const score = result.lineup_score ?? result.Uyum_Skoru ?? 0;
  const nShooters = result.n_shooters;

  const LABELS = {
    Creation: "Creation", Spacing: "Spacing", Defense: "Defense",
    Finishing: "Finishing", "Role Fit": "Role Fit",
  };

  return (
    <div className="space-y-1">
      {Object.entries(pillars).map(([k, v]) => {
        if (v == null) return null;
        const pct = Math.round(v * 100);
        const extra = k === "Spacing" && nShooters != null ? ` (${nShooters})` : "";
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[10px] w-20 shrink-0" style={{ color: "var(--text-muted)" }}>
              {LABELS[k] || k}{extra}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SCORE_COLOR(v) }} />
            </div>
            <span className="text-[10px] w-6 text-right" style={{ color: SCORE_COLOR(v) }}>{pct}</span>
          </div>
        );
      })}
      <div className="border-t pt-1.5 flex justify-between font-semibold mt-1" style={{ borderColor: "var(--border)" }}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Fit</span>
        <span className="text-sm font-bold" style={{ color: SCORE_COLOR(score) }}>{Math.round(score * 100)}</span>
      </div>
    </div>
  );
}

function LineupCard({ lu, rank, t, lang }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 p-4 rounded"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs w-5" style={{ color: "var(--text-faint)" }}>{rank + 1}</span>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {[lu.Oyuncu_1, lu.Oyuncu_2, lu.Oyuncu_3, lu.Oyuncu_4, lu.Oyuncu_5]
              .filter(Boolean).join(" · ")}
          </span>
        </div>
        {(lu.Pos_PG || lu.PG) && (
          <div className="flex flex-wrap gap-1 ml-7 mt-1">
            {[["PG", lu.Pos_PG || lu.PG], ["SG", lu.Pos_SG || lu.SG], ["SF", lu.Pos_SF || lu.SF],
              ["PF", lu.Pos_PF || lu.PF], ["C", lu.Pos_C || lu.C]].map(([pos, name]) =>
              name ? (
                <span key={pos} className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ color: POS_COLOR[pos] || "var(--text-muted)", border: `1px solid ${POS_COLOR[pos] || "var(--border)"}50` }}>
                  {pos}: {name}
                </span>
              ) : null
            )}
          </div>
        )}
        {lu.Arketipler && (
          <div className="text-xs ml-7 mt-0.5" style={{ color: "var(--text-muted)" }}>{lu.Arketipler}</div>
        )}
        <div className="text-[10px] ml-7 mt-1.5 leading-relaxed max-w-xl" style={{ color: "var(--text-muted)" }}>
          {explainLineup(lu, lang)}
        </div>
      </div>
      <div className="flex flex-col gap-2 ml-7 sm:ml-0 shrink-0 w-52">
        <PillarBreakdown result={lu} lang={lang} compact />
      </div>
    </div>
  );
}

function RealLineupCard({ lu, rank }) {
  const net = lu.NET_RATING;
  const fit = lu.fit_score;
  const netColor = net >= 10 ? "#34d399" : net >= 0 ? "var(--accent)" : "#f87171";
  const players = (lu.GROUP_NAME || "").split(" - ");

  return (
    <div className="flex items-center gap-4 p-4 rounded"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <span className="text-xs w-6 shrink-0" style={{ color: "var(--text-faint)" }}>{rank + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-x-1 mb-1">
          {players.map((p, i) => (
            <span key={i} className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              {p}{i < players.length - 1 ? " ·" : ""}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
          <span>{Math.round(lu.MIN || 0)} min</span>
          {lu.PLUS_MINUS != null && <span>+/−: {lu.PLUS_MINUS > 0 ? "+" : ""}{lu.PLUS_MINUS}</span>}
        </div>
      </div>
      <div className="flex gap-4 shrink-0">
        {fit != null && (
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: SCORE_COLOR(fit) }}>{Math.round(fit * 100)}</div>
            <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>Fit</div>
          </div>
        )}
        {net != null && (
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: netColor }}>{net > 0 ? "+" : ""}{net.toFixed(1)}</div>
            <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>NET RTG</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className="px-4 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent-dim)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: 6,
      }}>
      {children}
    </button>
  );
}

export default function Lineups() {
  const { t, lang } = useLang();
  const [topLineups, setTopLineups]     = useState([]);
  const [loading, setLoading]           = useState(false);
  const [slots, setSlots]               = useState(["", "", "", "", ""]);
  const [allNames, setAllNames]         = useState([]);
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError]   = useState("");
  const [mode, setMode]                 = useState("positional");
  const [tab, setTab]                   = useState("theoretical");
  const [realLineups, setRealLineups]   = useState([]);
  const [realLoading, setRealLoading]   = useState(false);
  const [realSort, setRealSort]         = useState("NET_RATING");
  const [corr, setCorr]                 = useState(null);

  useEffect(() => {
    setLoading(true);
    api.lineupCompat({ limit: 50, positional: mode === "positional" ? 1 : 0, unique: 1 })
      .then(d => setTopLineups(d.lineups || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => {
    if (tab !== "real") return;
    setRealLoading(true);
    api.realLineups({ limit: 50, sort_by: realSort, min_min: 50 })
      .then(d => setRealLineups(d.lineups || []))
      .catch(console.error)
      .finally(() => setRealLoading(false));
    if (!corr) {
      fetch("/api/lineups/correlation").then(r => r.json()).then(setCorr).catch(() => {});
    }
  }, [tab, realSort]);

  useEffect(() => {
    fetch("/api/player-names").then(r => r.json()).then(d => setAllNames(d.names || [])).catch(() => {});
  }, []);

  const setSlot = (i, v) => setSlots(prev => { const a = [...prev]; a[i] = v; return a; });

  const evalCustom = async () => {
    setCustomResult(null); setCustomError("");
    const names = slots.map(s => s.trim()).filter(Boolean);
    if (names.length < 2) { setCustomError(t("enter_min_2")); return; }
    try { const r = await api.customLineup(names); setCustomResult(r); }
    catch (e) { setCustomError(e.message); }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Custom lineup */}
        <div className="p-5 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <h2 className="font-semibold mb-3 text-sm" style={{ color: "var(--text-primary)" }}>
            {t("custom_lineup_title")}
          </h2>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              {slots.map((v, i) => (
                <PlayerNameInput key={i} value={v} onChange={val => setSlot(i, val)}
                  placeholder={`${t("position")} ${i + 1}…`} allNames={allNames} slotLabel={`${i + 1}`} />
              ))}
            </div>
            <div className="flex flex-col justify-between w-44">
              <button onClick={evalCustom}
                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#000" }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                {t("calculate_fit")}
              </button>
              {customError && <p className="text-red-400 text-xs">{customError}</p>}
              {customResult && (
                <div className="p-3 rounded space-y-1.5 text-sm"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <PillarBreakdown result={customResult} lang={lang} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Season Role Impact */}
        <RoleImpactChart />

        {/* Top lineups */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-2">
              <TabBtn active={tab === "theoretical"} onClick={() => setTab("theoretical")}>
                {lang === "tr" ? "Teorik" : "Theoretical"}
              </TabBtn>
              <TabBtn active={tab === "real"} onClick={() => setTab("real")}>
                {lang === "tr" ? "Gerçek Lineup'lar" : "Real Lineups"}
              </TabBtn>
            </div>

            {tab === "theoretical" && (
              <div className="flex gap-2">
                {[["positional", t("positional_mode")], ["any", t("any_mode")]].map(([k, l]) => (
                  <TabBtn key={k} active={mode === k} onClick={() => setMode(k)}>{l}</TabBtn>
                ))}
              </div>
            )}

            {tab === "real" && (
              <select value={realSort} onChange={e => setRealSort(e.target.value)}
                className="rounded px-3 py-1.5 text-xs focus:outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <option value="NET_RATING">NET_RATING ↓</option>
                <option value="fit_score">Fit Score ↓</option>
                <option value="MIN">Minutes ↓</option>
              </select>
            )}
          </div>

          {tab === "theoretical" && (
            <>
              {mode === "positional" && (
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{t("positional_note")}</p>
              )}
              {loading ? (
                <div className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>{t("loading")}</div>
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
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                {`Real 5-man groups with ≥50 min played — fit score is theoretical archetype compatibility, NET_RATING is on-court data.${corr?.r != null ? ` r=${corr.r} (n=${corr.n})` : ""}`}
              </p>
              {realLoading ? (
                <div className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>{t("loading")}</div>
              ) : (
                <div className="space-y-2">
                  {realLineups.map((lu, i) => <RealLineupCard key={i} lu={lu} rank={i} />)}
                  {realLineups.length === 0 && (
                    <div className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                      No data — is the API running?
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
