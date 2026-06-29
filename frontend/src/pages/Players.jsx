import { useState, useEffect, useCallback, useRef } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import PlayerCard from "../components/PlayerCard";
import ScoreBar from "../components/ScoreBar";
import RadarProfile from "../components/RadarProfile";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const MODIFIERS = ["Two-Way","Heliocentric","Jumbo","Pressure","Shotmaker","Three-Level","Scoring","Speed","Versatile","Defensive","Half-Court","Point-of-Attack","Gravity","Scalable","Stretch","Point-","Off-Ball","Slashing","Pick-and-Roll","3-and-D","Playmaking","Secondary"];
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
  PG: "bg-violet-500/20 text-violet-300",
  SG: "bg-blue-500/20 text-blue-300",
  SF: "bg-emerald-500/20 text-emerald-300",
  PF: "bg-orange-500/20 text-orange-300",
  C:  "bg-red-500/20 text-red-300",
};

export default function Players() {
  const [seasons, setSeasons]   = useState([]);
  const [season, setSeason]     = useState("2025-26");

  const [search, setSearch]         = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pos, setPos]               = useState("");
  const [arch, setArch]             = useState("");
  const [mod, setMod]               = useState("");
  const [team, setTeam]             = useState("");
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

  useEffect(() => {
    api.seasons().then(d => setSeasons(d.seasons || [])).catch(() => {});
    api.teams().then(d => setTeamList(d.teams || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSelected(null); setDetail(null);
    setSimilar(null); setCareer(null);
    setSearch(""); setSearchInput("");
    setPos(""); setArch(""); setMod(""); setTeam("");
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
        if (mod)    params.modifier = mod;
        const data = await api.players(params);
        setPlayers(data.players || []);
        setTotal(data.total || 0);
      } else {
        const params = { limit: 200, sort_col: sortBy, sort_asc: false };
        if (search) params.search = search;
        const data = await api.historical(season, params);
        let rows = data.players || [];
        if (pos)  rows = rows.filter(p => (p.POSITION || "") === pos);
        if (arch) rows = rows.filter(p => (p.primary_arch || "") === arch);
        setPlayers(rows);
        setTotal(data.total || rows.length);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [isCurrent, season, search, team, pos, arch, mod, sortBy]);

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

  const clearFilters = () => {
    setSearch(""); setSearchInput(""); setPos(""); setArch(""); setMod(""); setTeam("");
  };
  const hasFilters = search || pos || arch || mod || team;

  // historical oyuncu nesnesini PlayerCard'a uyumlu hale getir
  const toCardPlayer = (p) => ({
    ...p,
    overall_tier: p.overall_tier || p.versatility_tier || "",
  });

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Filter bar */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap gap-2 items-center bg-slate-950">
          <select
            value={season}
            onChange={e => setSeason(e.target.value)}
            className="bg-slate-900 border border-blue-700/50 rounded-lg px-3 py-1.5 text-sm text-blue-300 font-medium focus:outline-none focus:border-blue-500"
          >
            <option value="2025-26">2025-26 (Current)</option>
            {seasons.filter(s => s !== "2025-26").map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchInput}
              onChange={e => {
                setSearchInput(e.target.value);
                clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => setSearch(e.target.value), 300);
              }}
              placeholder="Search player..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
            />
          </div>

          <select value={pos} onChange={e => setPos(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">All positions</option>
            {POSITIONS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={arch} onChange={e => { setArch(e.target.value); setMod(""); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">All archetypes</option>
            {CORE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {isCurrent && (
            <select value={mod} onChange={e => { setMod(e.target.value); setArch(""); }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
              <option value="">Modifier</option>
              {MODIFIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {isCurrent && (
            <select value={team} onChange={e => setTeam(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
              <option value="">Team</option>
              {teamList.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="overall_score">Overall ↓</option>
            {isCurrent && <option value="versatility_score">V.Score ↓</option>}
            <option value="PTS">PTS ↓</option>
            <option value="REB">REB ↓</option>
            <option value="AST">AST ↓</option>
            {isCurrent && <option value="BPM">BPM ↓</option>}
            <option value="GP">GP ↓</option>
          </select>

          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-violet-600/20 text-violet-300 border border-violet-600/30 hover:bg-violet-600/40 transition-colors">
              ✕ Clear
            </button>
          )}

          <span className="text-xs text-slate-500">{total} players</span>
        </div>

        {/* Kart grid */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-slate-500 py-12">Loading...</div>
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {players.map((p, i) => (
                <PlayerCard
                  key={i}
                  player={toCardPlayer(p)}
                  rank={p.overall_score != null ? i + 1 : null}
                  onClick={openPlayer}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="
          fixed inset-0 z-50 bg-slate-950 flex flex-col
          md:static md:inset-auto md:z-auto md:w-96 md:border-l md:border-slate-800 md:shrink-0
        ">
          <div className="p-4 border-b border-slate-800 flex justify-between items-start shrink-0">
            <div>
              <div className="font-bold text-white">{selected.PLAYER_NAME}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {detail?.position && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${POS_COLOR[detail.position] || "bg-slate-700 text-slate-400"}`}>
                    {detail.position}
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {selected.TEAM_ABBREVIATION}
                  {!isCurrent && ` · ${season}`}
                </span>
              </div>
            </div>
            <button onClick={() => { setSelected(null); setDetail(null); }}
              className="text-slate-500 hover:text-white text-lg leading-none">×</button>
          </div>

          <div className="flex border-b border-slate-800 shrink-0">
            {(isCurrent
              ? [["radar","Radar"],["scores","Scores"],["similar","Similar"],["career","Career"]]
              : [["radar","Radar"],["scores","Scores"]]
            ).map(([k,l]) => (
              <button key={k} onClick={async () => {
                setTab(k);
                if (k === "similar" && !similar && isCurrent) {
                  setSimilarLoading(true);
                  try { const r = await api.similarPlayers(selected.PLAYER_NAME, 10); setSimilar(r.similar); }
                  catch(e) { console.error(e); }
                  setSimilarLoading(false);
                }
                if (k === "career" && !career && isCurrent) {
                  setCareerLoading(true);
                  try { const r = await api.playerCareer(selected.PLAYER_NAME); setCareer(r); }
                  catch(e) { setCareer({ error: true }); }
                  setCareerLoading(false);
                }
              }}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  tab === k ? "text-violet-400 border-b-2 border-violet-500" : "text-slate-500 hover:text-slate-300"
                }`}>{l}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!detail ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
            ) : (
              <>
                {tab === "radar" && (
                  <div className="p-3">
                    <RadarProfile
                      scores={detail.scores}
                      name={detail.name}
                      primaryArch={detail.primary_arch}
                    />
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {["PTS","REB","AST","GP"].map(k => {
                        const val = selected[k];
                        return (
                          <div key={k} className="bg-slate-900 rounded-lg p-2 text-center">
                            <div className="text-sm font-bold text-white">
                              {k === "GP" ? (val ?? "—") : val != null ? Number(val).toFixed(1) : "—"}
                            </div>
                            <div className="text-[9px] text-slate-500 uppercase">{k}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-center">
                      <span className="text-xs text-slate-400">Archetype: </span>
                      <span className="text-xs font-semibold text-violet-300">{detail.primary_arch}</span>
                      {detail.overall_score != null ? (
                        <>
                          <span className="mx-2 text-slate-700">·</span>
                          <span className="text-xs font-semibold text-violet-300">
                            {Math.round(detail.overall_score * 100)}
                          </span>
                          {detail.overall_pct != null && (
                            <span className="ml-1 text-[10px] text-slate-500">top {topPct(detail.overall_pct)}</span>
                          )}
                        </>
                      ) : (
                        <span className="ml-2 text-xs text-slate-500 italic">not scored (GP &lt; 35)</span>
                      )}
                    </div>
                  </div>
                )}

                {tab === "scores" && (
                  <div className="p-4 space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Core Archetypes</div>
                    {CORE.map(c => (
                      <ScoreBar key={c} label={c} value={detail.scores?.[c] || 0} highlight />
                    ))}
                    {isCurrent && detail.active_modifiers?.length > 0 && (() => {
                      const sorted = [...detail.active_modifiers].sort(
                        (a, b) => (detail.modifier_scores?.[b] || 0) - (detail.modifier_scores?.[a] || 0)
                      );
                      return (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-slate-600 mt-4 mb-2">Active Modifier Tags</div>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {sorted.map(m => (
                              <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-300 border border-violet-700/40">{tl(m)}</span>
                            ))}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Modifier Scores</div>
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
                    {similarLoading && <div className="text-center text-slate-500 text-sm py-6">Loading...</div>}
                    {!similarLoading && similar && similar.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
                        <div>
                          <div className="text-sm text-white font-medium">{p.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {p.team} · {p.position} · <span className="text-violet-400">{p.primary_arch}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="text-xs text-slate-300">{Math.round(p.similarity * 100)}%</div>
                          <div className="text-[9px] text-slate-600">similarity</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "career" && isCurrent && (
                  <div className="p-4">
                    {careerLoading && <div className="text-center text-slate-500 text-sm py-6">Loading...</div>}
                    {!careerLoading && career?.error && (
                      <div className="text-center text-slate-500 text-xs py-6">Career data not available</div>
                    )}
                    {!careerLoading && career?.seasons && (
                      <>
                        <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-3">Season-by-Season</div>
                        <div className="space-y-1.5">
                          {career.seasons.slice().reverse().map((s, i) => {
                            const score = s.overall_score != null ? Math.round(s.overall_score * 100) : null;
                            return (
                              <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${s.season === "2025-26" ? "bg-violet-900/20 border border-violet-700/30" : "bg-slate-900/60"}`}>
                                <div className="w-14 shrink-0">
                                  <span className="text-[10px] text-slate-400 font-mono">{s.season}</span>
                                </div>
                                <div className="w-8 shrink-0 text-[10px] text-slate-500">{s.team}</div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-violet-300 font-medium truncate">{s.primary_arch || "—"}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-[10px] text-slate-500">
                                  {s.pts != null && <span>{s.pts}p</span>}
                                  {s.reb != null && <span>{s.reb}r</span>}
                                  {s.ast != null && <span>{s.ast}a</span>}
                                  {s.gp != null && <span className="text-slate-600">{s.gp}g</span>}
                                </div>
                                {score != null && (
                                  <div className="w-8 text-right shrink-0">
                                    <span className="text-xs font-bold text-violet-400">{score}</span>
                                  </div>
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
      )}
    </div>
  );
}
