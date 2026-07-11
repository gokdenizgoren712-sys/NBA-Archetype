import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import { GLeagueIcon } from "../components/LeagueIcons";
import PlayerCard from "../components/PlayerCard";
import ScoreBar from "../components/ScoreBar";
import RadarProfile from "../components/RadarProfile";
import SplitPane from "../components/SplitPane";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = ["","PG","SG","SF","PF","C"];

const POS_COLOR = {
  PG: "text-violet-400", SG: "text-blue-400",
  SF: "text-emerald-400", PF: "text-orange-400", C: "text-red-400",
};

const GLG = "#A8263F";
const TIER_COLOR = {
  "Elite Prospect": "#a855f7", "First-Round": "#3b82f6", "Rotation Upside": "#10b981",
  "Developmental": "#f59e0b", "Longshot": "#94a3b8",
};
const OUTCOME_COLOR = {
  "Superstar": "#a855f7", "All-Star": "#3b82f6", "Quality Starter": "#10b981",
  "Starter": "#22c55e", "Rotation": "#f59e0b", "Fringe": "#94a3b8",
};

function topPct(pct) {
  if (pct == null) return null;
  const p = Math.round(pct * 100);
  return p >= 99 ? "<1%" : `${100 - p}%`;
}

/* ── G-League detail panel ───────────────────────────────────────── */
function GLeagueDetailPanel({ selected, detail, tab, setTab }) {
  if (!selected) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {selected.PLAYER_NAME}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {detail?.position && (
                <span className={`text-[10px] font-mono font-medium ${POS_COLOR[detail.position] || ""}`}>
                  {detail.position}
                </span>
              )}
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {selected.TEAM_ABBREVIATION}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: "rgba(168,38,63,.15)", color: "#A8263F", border: "1px solid rgba(168,38,63,.3)" }}>
                G-Lg
              </span>
            </div>
            {detail?.age != null && (
              <div className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
                Age {detail.age}
              </div>
            )}
          </div>
          {detail?.overall_score != null && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
                {Math.round(detail.overall_score * 100)}
              </div>
              {detail.overall_pct != null && (
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  top {topPct(detail.overall_pct)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
        {[["prospect", "Prospect"], ["radar", "Radar"], ["scores", "Scores"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              color: tab === k ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
            }}>{l}</button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!detail ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : (
          <>
            {selected?.GP != null && Number(selected.GP) < 15 && (
              <div className="mx-4 mt-3 px-3 py-1.5 rounded text-[11px]"
                style={{ background: "rgba(245,158,11,.10)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.25)" }}>
                ⚠ Small sample ({selected.GP} games)
              </div>
            )}

            {tab === "prospect" && (
              detail.prospect ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold leading-none"
                      style={{ color: TIER_COLOR[detail.prospect.tier] || "var(--accent)" }}>
                      {detail.prospect.grade}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide mt-1" style={{ color: "var(--text-faint)" }}>
                      Prospect Grade
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: (TIER_COLOR[detail.prospect.tier] || "#888") + "22",
                      color: TIER_COLOR[detail.prospect.tier] || "var(--text-primary)",
                      border: `1px solid ${(TIER_COLOR[detail.prospect.tier] || "#888")}55`,
                    }}>
                    {detail.prospect.tier}
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>
                    <span>Floor (now) <b style={{ color: "var(--text-primary)" }}>{detail.prospect.floor}</b></span>
                    <span>Ceiling <b style={{ color: "var(--text-primary)" }}>{detail.prospect.ceiling}</b></span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${detail.prospect.ceiling}%`,
                      background: `linear-gradient(90deg, ${GLG}, ${TIER_COLOR[detail.prospect.tier] || "#a855f7"})`,
                    }} />
                  </div>
                  <div className="text-[9px] mt-1" style={{ color: "var(--text-faint)" }}>
                    NBA-uygunluk → yaş-projeksiyonlu tavan
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#10b981" }}>İyi olduğu</div>
                    <div className="flex flex-col gap-1">
                      {(detail.prospect.strengths || []).map(s => (
                        <span key={s} className="text-xs px-2 py-1 rounded"
                          style={{ background: "rgba(16,185,129,.10)", color: "#10b981", border: "1px solid rgba(16,185,129,.25)" }}>{s}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#ef4444" }}>Zayıf olduğu</div>
                    <div className="flex flex-col gap-1">
                      {(detail.prospect.weaknesses || []).map(w => (
                        <span key={w} className="text-xs px-2 py-1 rounded"
                          style={{ background: "rgba(239,68,68,.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,.25)" }}>{w}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {(detail.prospect.comparables || []).length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: GLG }}>NBA'de benziyor</div>
                    <div className="flex flex-col gap-1">
                      {detail.prospect.comparables.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded"
                          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                          <span style={{ color: "var(--text-primary)" }}>{c.name}</span>
                          <span className="text-[10px]" style={{ color: OUTCOME_COLOR[c.outcome] || "var(--text-muted)" }}>
                            {c.outcome}{c.peak_bpm != null ? ` · BPM ${c.peak_bpm}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[9px] mt-1" style={{ color: "var(--text-faint)" }}>
                      Giriş (rookie) arketip profili benzerliği · zirve = kariyer sonucu
                    </div>
                  </div>
                )}
              </div>
              ) : (
                <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Prospect verisi yok</div>
              )
            )}

            {tab === "radar" && (
              <div className="p-4">
                <RadarProfile scores={detail.scores} name={detail.name} primaryArch={detail.primary_arch}
                  margin={detail.confidence_margin || 0} />
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {["PTS","REB","AST","GP"].map(k => {
                    const val = selected[k];
                    return (
                      <div key={k} className="text-center p-2 rounded"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                          {k === "GP" ? (val ?? "—") : val != null ? Number(val).toFixed(1) : "—"}
                        </div>
                        <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: "var(--text-faint)" }}>{k}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Archetype: </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{detail.primary_arch}</span>
                </div>
              </div>
            )}

            {tab === "scores" && (
              <div className="p-4 space-y-1">
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
                  Core Archetypes
                </div>
                {CORE.map(c => (
                  <ScoreBar key={c} label={c} value={detail.scores?.[c] || 0}
                    highlight={c === detail.primary_arch}
                    margin={detail.confidence_margin || 0} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function GLeague() {
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pos, setPos]                 = useState("");
  const [arch, setArch]               = useState("");
  const [sortBy, setSortBy]           = useState("overall_score");

  const [players, setPlayers] = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData]   = useState(false);
  const debounceRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [tab, setTab]           = useState("prospect");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 80, sort_by: sortBy };
      if (search) params.search   = search;
      if (pos)    params.position = pos;
      if (arch)   params.arch     = arch;
      const data = await api.gleaguePlayers(params);
      if (data.coming_soon) { setNoData(true); setPlayers([]); setTotal(0); }
      else {
        setNoData(false);
        setPlayers(data.players || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error(e);
      setNoData(true);
    }
    setLoading(false);
  }, [search, pos, arch, sortBy]);

  useEffect(() => { load(); }, [load]);

  const openPlayer = async (p) => {
    setSelected(p); setDetail(null); setTab("prospect");
    try {
      const sc = await api.gleaguePlayerScores(p.PLAYER_NAME);
      setDetail(sc);
    } catch (e) { console.error(e); }
  };

  const clearFilters = () => { setSearch(""); setSearchInput(""); setPos(""); setArch(""); };
  const hasFilters = search || pos || arch;

  return (
    <>
    <SEO
      title="G-League — NBA Archetype"
      description="NBA G-League player archetype profiles — engine, anchor, spacer and more, scored within league context."
      path="/gleague"
    />
    <SplitPane
      detail={selected ? (
        <GLeagueDetailPanel selected={selected} detail={detail} tab={tab} setTab={setTab} />
      ) : null}
      onClose={() => { setSelected(null); setDetail(null); }}
    >
      {/* Filter bar */}
      <div className="p-3 border-b flex flex-wrap gap-2 items-center shrink-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

        {/* League badge */}
        <div className="flex items-center gap-1.5 mr-1">
          <GLeagueIcon size={16} />
          <span className="text-xs font-semibold" style={{ color: "#A8263F" }}>G-League</span>
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>2025-26</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[140px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => setSearch(e.target.value), 300);
            }}
            placeholder="Search player..."
            className="w-full rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Position */}
        <select value={pos} onChange={e => setPos(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="">Position</option>
          {POSITIONS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {/* Archetype */}
        <select value={arch} onChange={e => setArch(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="">Archetype</option>
          {CORE.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="overall_score">Overall ↓</option>
          <option value="PTS">PTS ↓</option>
          <option value="REB">REB ↓</option>
          <option value="AST">AST ↓</option>
          <option value="GP">GP ↓</option>
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="px-2 py-1.5 rounded text-xs"
            style={{ color: "var(--accent)", border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
            ✕ Clear
          </button>
        )}

        <span className="text-xs" style={{ color: "var(--text-faint)" }}>{total}</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : noData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <GLeagueIcon size={40} />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>G-League data not yet fetched</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Run <code className="px-1 rounded" style={{ background: "var(--bg-elevated)" }}>python src/fetch_gleague.py</code> to load player data
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p, i) => (
              <PlayerCard
                key={i}
                player={{ ...p, overall_tier: p.overall_tier || "", league: "G-Lg" }}
                rank={p.overall_score != null ? i + 1 : null}
                onClick={openPlayer}
              />
            ))}
          </div>
        )}
      </div>
    </SplitPane>
    </>
  );
}
