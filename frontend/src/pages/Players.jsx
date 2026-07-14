import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import PlayerCard from "../components/PlayerCard";
import ScoreBar from "../components/ScoreBar";
import RadarProfile from "../components/RadarProfile";
import SplitPane from "../components/SplitPane";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const POSITIONS = ["","PG","SG","SF","PF","C"];

const TAG_LABEL = {
  "Point-": "Point-Forward", "3-and-D": "3-and-D",
  "Pick-and-Roll": "Pick-and-Roll", "Point-of-Attack": "Point-of-Attack",
};
const tl = (n) => TAG_LABEL[n] || n;

function topPct(pct) {
  if (pct == null) return null;
  const p = Math.round(pct * 100);
  return p >= 99 ? "<1%" : `${100 - p}%`;
}

const POS_COLOR = {
  PG: "text-violet-400", SG: "text-blue-400",
  SF: "text-emerald-400", PF: "text-orange-400", C: "text-red-400",
};

/* ── Career SVG chart ────────────────────────────────────────────── */
function CareerChart({ seasons }) {
  const scored = seasons.filter(s => s.overall_score != null);
  if (scored.length < 2) return null;

  const W = 320, H = 90, PX = 24, PY = 12;
  const iW = W - PX * 2, iH = H - PY * 2;
  const vals = scored.map(s => s.overall_score);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 0.01;

  const pts = scored.map((s, i) => ({
    x: PX + (i / (scored.length - 1)) * iW,
    y: PY + iH - ((s.overall_score - minV) / range) * iH,
    s,
  }));

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length-1].x.toFixed(1)},${(PY+iH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PY+iH).toFixed(1)} Z`;

  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
        Overall Trajectory
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#cg)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="2.5" fill="var(--accent)" />
            <text x={p.x} y={p.y - 5} textAnchor="middle" fontSize="7" fill="var(--accent)">
              {Math.round(p.s.overall_score * 100)}
            </text>
            <text x={p.x} y={H - 1} textAnchor="middle" fontSize="7" fill="var(--text-faint)">
              {p.s.season?.slice(0, 4)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── Detail panel content ────────────────────────────────────────── */
function DetailPanel({ selected, detail, isCurrent, season, tab, setTab,
  similar, similarLoading, career, careerLoading, onLoadCareer,
  token, isLoggedIn }) {

  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSaved(false); }, [selected]);

  const savePlayer = async () => {
    if (!isLoggedIn) { window.location.href = "/login"; return; }
    setSaving(true);
    try {
      const res = await fetch("/api/profile/saved-players", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ player_name: selected.PLAYER_NAME, season: isCurrent ? "2025-26" : season }),
      });
      if (res.ok || res.status === 409) setSaved(true);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (!selected) return null;

  const tabs = [
    ["radar", "Radar"], ["scores", "Scores"],
    ...(isCurrent ? [["similar", "Similar"]] : []),
    ["career", "Career"],
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {selected.PLAYER_NAME}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {detail?.position && (
                <span className={`text-[10px] font-mono font-medium ${POS_COLOR[detail.position] || ""}`}>
                  {detail.position}
                </span>
              )}
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {selected.TEAM_ABBREVIATION}{!isCurrent ? ` · ${season}` : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(`/players/${encodeURIComponent(selected.PLAYER_NAME)}`)}
              title="Open profile page"
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors text-sm"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              ↗
            </button>
            <button
              onClick={savePlayer}
              disabled={saving || saved}
              title={saved ? "Saved!" : "Save player"}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{
                color: saved ? "var(--accent)" : "var(--text-muted)",
                border: `1px solid ${saved ? "var(--accent-border)" : "var(--border)"}`,
                background: saved ? "var(--accent-dim)" : "transparent",
                opacity: saving ? 0.5 : 1,
              }}>
              {saved ? "★" : "☆"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={async () => {
            setTab(k);
            if (k === "career" && !career) onLoadCareer(selected.PLAYER_NAME);
          }}
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
            {selected?.GP != null && Number(selected.GP) < 20 && (
              <div className="mx-4 mt-3 px-3 py-1.5 rounded text-[11px]"
                style={{ background: "rgba(255,177,27,.10)", color: "#FFB11B", border: "1px solid rgba(255,177,27,.25)" }}>
                ⚠ Small sample ({selected.GP} games) — scores may be unstable
              </div>
            )}
            {tab === "radar" && (
              <div className="p-4">
                <RadarProfile scores={detail.scores} name={detail.name} primaryArch={detail.primary_arch} />
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
                  {detail.overall_score != null && (
                    <>
                      <span className="mx-2" style={{ color: "var(--border)" }}>·</span>
                      <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                        {Math.round(detail.overall_score * 100)}
                      </span>
                      {detail.overall_pct != null && (
                        <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          top {topPct(detail.overall_pct)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === "scores" && (
              <div className="p-4 space-y-1">
                <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
                  Core Archetypes
                </div>
                {CORE.map(c => (
                  <ScoreBar key={c} label={c} value={detail.scores?.[c] || 0} highlight />
                ))}
                {detail.active_modifiers?.length > 0 && (() => {
                  const sorted = [...detail.active_modifiers].sort(
                    (a, b) => (detail.modifier_scores?.[b] || 0) - (detail.modifier_scores?.[a] || 0)
                  );
                  return (
                    <>
                      <div className="text-[10px] uppercase tracking-wider mt-4 mb-2" style={{ color: "var(--text-faint)" }}>
                        Active Modifiers
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {sorted.map(m => (
                          <span key={m} className="text-[10px] px-2 py-0.5 rounded font-medium"
                            style={{ color: "var(--accent)", border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
                            {tl(m)}
                          </span>
                        ))}
                      </div>
                      {sorted.map(m => (
                        <ScoreBar key={m} label={tl(m)} value={detail.modifier_scores?.[m] || 0} />
                      ))}
                    </>
                  );
                })()}
              </div>
            )}

            {tab === "similar" && isCurrent && (
              <div className="p-4 space-y-2">
                {similarLoading && <div className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>Loading...</div>}
                {!similarLoading && similar?.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {p.team} · {p.position} · <span style={{ color: "var(--accent)" }}>{p.primary_arch}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{Math.round(p.similarity * 100)}%</div>
                      <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>similarity</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "career" && (
              <div className="p-4">
                {careerLoading && <div className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>Loading...</div>}
                {!careerLoading && career?.error && (
                  <div className="text-center text-xs py-6" style={{ color: "var(--text-muted)" }}>Career data not available</div>
                )}
                {!careerLoading && career?.seasons && (
                  <>
                    <CareerChart seasons={career.seasons} />
                    <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--text-faint)" }}>
                      Season-by-Season
                    </div>
                    <div className="space-y-1.5">
                      {career.seasons.slice().reverse().map((s, i) => {
                        const score = s.overall_score != null ? Math.round(s.overall_score * 100) : null;
                        const isCur = s.season === "2025-26";
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded"
                            style={{
                              background: isCur ? "var(--accent-dim)" : "var(--bg-elevated)",
                              border: `1px solid ${isCur ? "var(--accent-border)" : "var(--border)"}`,
                            }}>
                            <span className="w-14 shrink-0 text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{s.season}</span>
                            <span className="w-8 shrink-0 text-[10px]" style={{ color: "var(--text-faint)" }}>{s.team}</span>
                            <span className="flex-1 text-xs font-medium truncate" style={{ color: "var(--accent)" }}>{s.primary_arch || "—"}</span>
                            <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {s.pts != null && <span>{s.pts}p</span>}
                              {s.reb != null && <span>{s.reb}r</span>}
                              {s.ast != null && <span>{s.ast}a</span>}
                            </div>
                            {score != null && (
                              <span className="w-8 text-xs font-bold text-right shrink-0" style={{ color: "var(--accent)" }}>{score}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function Players() {
  const { token, isLoggedIn } = useAuth();
  const [seasons, setSeasons]   = useState([]);
  const [season, setSeason]     = useState("2025-26");

  const [search, setSearch]         = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pos, setPos]               = useState("");
  const [arch, setArch]             = useState("");
  const [team, setTeam]             = useState("");
  const [tier, setTier]             = useState("");
  const [minGp, setMinGp]           = useState("");
  const [sortBy, setSortBy]         = useState("overall_score");

  const [players, setPlayers]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [teamList, setTeamList] = useState([]);
  const debounceRef = useRef(null);

  const [selected, setSelected]     = useState(null);
  const [detail, setDetail]         = useState(null);
  const [tab, setTab]               = useState("radar");
  const [similar, setSimilar]       = useState(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [career, setCareer]         = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);

  const isCurrent = season === "2025-26";

  const histTeams = useMemo(() => {
    if (isCurrent) return [];
    return [...new Set(players.map(p => p.TEAM_ABBREVIATION).filter(Boolean))].sort();
  }, [players, isCurrent]);

  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || [])).catch(() => {});
    api.teams().then(d => setTeamList(d.teams || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSelected(null); setDetail(null);
    setSimilar(null); setCareer(null);
    setSearch(""); setSearchInput("");
    setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp("");
    setSortBy("overall_score");
    setPlayers([]); setTotal(0);
  }, [season]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isCurrent) {
        const params = { limit: 60, sort_by: sortBy };
        if (search) params.search = search;
        if (team)   params.team   = team;
        if (pos)    params.position = pos;
        if (arch)   params.arch   = arch;
        if (tier)   params.tier   = tier;
        if (minGp)  params.min_gp = minGp;
        const data = await api.players(params);
        setPlayers(data.players || []);
        setTotal(data.total || 0);
      } else {
        const params = { limit: 200, sort_col: sortBy, sort_asc: false };
        if (search) params.search = search;
        const data = await api.historical(season, params);
        let rows = data.players || [];
        if (pos)   rows = rows.filter(p => (p.POSITION || "") === pos);
        if (arch)  rows = rows.filter(p => (p.primary_arch || "") === arch);
        if (team)  rows = rows.filter(p => (p.TEAM_ABBREVIATION || "") === team);
        if (minGp) rows = rows.filter(p => Number(p.GP || 0) >= Number(minGp));
        setPlayers(rows);
        setTotal(data.total || rows.length);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [isCurrent, season, search, team, pos, arch, tier, minGp, sortBy]);

  useEffect(() => { load(); }, [load]);

  const openPlayer = async (p) => {
    setSelected(p);
    setDetail(null); setSimilar(null); setCareer(null); setTab("radar");
    try {
      const sc = isCurrent
        ? await api.playerScores(p.PLAYER_NAME)
        : await api.historicalPlayer(season, p.PLAYER_NAME);
      setDetail(sc);
    } catch (e) { console.error(e); }
  };

  const loadSimilar = async (name) => {
    setSimilarLoading(true);
    try { const r = await api.similarPlayers(name, 10); setSimilar(r.similar); }
    catch(e) { console.error(e); }
    setSimilarLoading(false);
  };

  const loadCareer = async (name) => {
    setCareerLoading(true);
    try { const r = await api.playerCareer(name); setCareer(r); }
    catch(e) { setCareer({ error: true }); }
    setCareerLoading(false);
  };

  const clearFilters = () => { setSearch(""); setSearchInput(""); setPos(""); setArch(""); setTeam(""); setTier(""); setMinGp(""); };
  const hasFilters = search || pos || arch || team || tier || minGp;

  const toCardPlayer = (p) => ({ ...p, overall_tier: p.overall_tier || "" });

  const selectEl = (value, onChange, opts, placeholder) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded px-3 py-1.5 text-sm focus:outline-none"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <>
    <SEO
      title="NBA Players — Archetype Profiles"
      description="Browse every NBA player from 1983 to 2026 with their archetype classification, percentile scores, and modifier tags. Filter by position, archetype, or season."
      path="/players"
    />
    <SplitPane
      detail={selected ? (
        <DetailPanel
          selected={selected} detail={detail} isCurrent={isCurrent}
          season={season} tab={tab} setTab={async (k) => {
            setTab(k);
            if (k === "similar" && !similar && isCurrent) loadSimilar(selected.PLAYER_NAME);
            if (k === "career" && !career) loadCareer(selected.PLAYER_NAME);
          }}
          similar={similar} similarLoading={similarLoading}
          career={career} careerLoading={careerLoading}
          onLoadCareer={loadCareer}
          token={token} isLoggedIn={isLoggedIn}
        />
      ) : null}
      onClose={() => { setSelected(null); setDetail(null); }}
    >
      {/* Filter bar */}
      <div className="p-3 border-b flex flex-wrap gap-2 items-center shrink-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

        {/* Season */}
        <select value={season} onChange={e => setSeason(e.target.value)}
          className="rounded px-3 py-1.5 text-sm font-medium focus:outline-none"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
          <option value="2025-26">2025-26</option>
          {seasons.filter(s => s !== "2025-26").map(s => <option key={s} value={s}>{s}</option>)}
        </select>

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

        {selectEl(pos, setPos, POSITIONS.filter(Boolean), "Position")}
        {selectEl(arch, setArch, CORE, "Archetype")}
        {selectEl(team, setTeam, isCurrent ? teamList : histTeams, "Team")}
        {isCurrent && selectEl(tier, setTier, ["Elite", "Star", "Starter", "Role Player"], "Tier")}

        {/* Min GP */}
        <input type="number" min="0" value={minGp} onChange={e => setMinGp(e.target.value)}
          placeholder="Min GP" title="Minimum games played"
          className="w-[84px] rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="rounded px-3 py-1.5 text-sm focus:outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="overall_score">Overall ↓</option>
          <option value="PTS">PTS ↓</option>
          <option value="REB">REB ↓</option>
          <option value="AST">AST ↓</option>
          {isCurrent && <option value="BPM">BPM ↓</option>}
          <option value="GP">GP ↓</option>
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="px-2 py-1.5 rounded text-xs transition-colors"
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p, i) => (
              <PlayerCard
                key={i}
                player={toCardPlayer(p)}
                rank={p.overall_score != null ? i + 1 : null}
                onClick={openPlayer}
                season={!isCurrent ? season : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </SplitPane>
    </>
  );
}
