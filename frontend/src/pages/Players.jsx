import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import PlayerCard from "../components/PlayerCard";
import ScoreBar from "../components/ScoreBar";
import RadarProfile from "../components/RadarProfile";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];
const MODIFIERS = ["Two-Way","Heliocentric","Jumbo","Pressure","Shotmaker","Three-Level","Scoring","Speed","Versatile","Defensive","Half-Court","Point-of-Attack","Gravity","Scalable","Stretch","Point-","Off-Ball","Slashing","Pick-and-Roll","3-and-D","Playmaking","Secondary"];
const POSITIONS = ["","PG","SG","SF","PF","C"];

const TAG_LABEL = {
  "Point-": "Point-Forward",
  "3-and-D": "3-and-D",
  "Pick-and-Roll": "Pick-and-Roll",
  "Point-of-Attack": "Point-of-Attack",
};
const tl = (n) => TAG_LABEL[n] || n;

function topPct(pct) {
  if (pct == null) return null;
  const p = Math.round(pct * 100);
  return p >= 99 ? "<1%" : `${100 - p}%`;
}

export default function Players() {
  const [search, setSearch]     = useState("");
  const [team, setTeam]         = useState("");
  const [pos, setPos]           = useState("");
  const [arch, setArch]         = useState("");   // core noun filtre
  const [mod, setMod]           = useState("");   // modifier filtre
  const [sortBy, setSortBy]     = useState("overall_score");
  const [players, setPlayers]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [tab, setTab]           = useState("radar");

  const [compare, setCompare]       = useState(null);
  const [compareDetail, setCompareDetail] = useState(null);
  const [similar, setSimilar]       = useState(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [career, setCareer]         = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);
  const [teamList, setTeamList]     = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 60 };
      if (search) params.search = search;
      if (team)   params.team   = team;
      if (pos)    params.position = pos;
      if (arch)   params.arch     = arch;
      if (mod)    params.modifier = mod;
      params.sort_by = sortBy;
      const data = await api.players(params);
      setPlayers(data.players || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, team, pos, arch, mod, sortBy]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.teams().then(d => setTeamList(d.teams || [])).catch(() => {});
  }, []);

  const openPlayer = async (p) => {
    setSelected(p);
    setDetail(null);
    setCompare(null);
    setCompareDetail(null);
    setSimilar(null);
    setCareer(null);
    setTab("radar");
    const sc = await api.playerScores(p.PLAYER_NAME);
    setDetail(sc);
  };

  const openCompare = async (name, team, arch) => {
    try {
      const sc = await api.playerScores(name);
      setCompare({ PLAYER_NAME: name, TEAM_ABBREVIATION: team, primary_arch: arch });
      setCompareDetail(sc);
      setTab("radar");
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex h-full">
      {/* Player list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap gap-2 items-center bg-slate-950">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search player..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <select value={team} onChange={e => setTeam(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">Team</option>
            {teamList.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={pos} onChange={e => setPos(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">All positions</option>
            {POSITIONS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={arch} onChange={e => { setArch(e.target.value); setMod(""); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">All</option>
            {CORE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={mod} onChange={e => { setMod(e.target.value); setArch(""); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
            <option value="">Modifier</option>
            {MODIFIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="overall_score">Overall ↓</option>
            <option value="versatility_score">V.Score ↓</option>
            <option value="PTS">PTS ↓</option>
            <option value="REB">REB ↓</option>
            <option value="AST">AST ↓</option>
            <option value="BPM">BPM ↓</option>
            <option value="GP">GP ↓</option>
          </select>
          <span className="text-xs text-slate-500">{total} players</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-slate-500 py-12">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {players.map((p, i) => (
                <PlayerCard key={i} player={p} rank={p.overall_score != null ? i + 1 : null} onClick={openPlayer} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — mobilde full-screen modal, masaüstünde sidebar */}
      {selected && (
        <div className="
          fixed inset-0 z-50 bg-slate-950 flex flex-col
          md:static md:inset-auto md:z-auto md:w-96 md:border-l md:border-slate-800 md:shrink-0
        ">
          <div className="p-4 border-b border-slate-800 flex justify-between items-start shrink-0">
            <div>
              <div className="font-bold text-white">{selected.PLAYER_NAME}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {selected.TEAM_ABBREVIATION} · {selected.POS5 || selected.POSITION || "—"}
              </div>
              {compare && (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px] text-amber-400">vs</span>
                  <span className="text-xs text-amber-300 font-medium">{compare.PLAYER_NAME}</span>
                  <button onClick={() => { setCompare(null); setCompareDetail(null); }}
                    className="text-slate-600 hover:text-slate-300 text-xs">×</button>
                </div>
              )}
            </div>
            <button onClick={() => { setSelected(null); setCompare(null); }}
              className="text-slate-500 hover:text-white text-lg leading-none">×</button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-800 shrink-0">
            {[["radar","Radar"],["scores","Scores"],["similar","Similar"],["career","Career"]].map(([k,l]) => (
              <button key={k} onClick={async () => {
                setTab(k);
                if (k === "similar" && !similar && selected) {
                  setSimilarLoading(true);
                  try {
                    const res = await api.similarPlayers(selected.PLAYER_NAME, 10);
                    setSimilar(res.similar);
                  } catch(e) { console.error(e); }
                  setSimilarLoading(false);
                }
                if (k === "career" && !career && selected) {
                  setCareerLoading(true);
                  try {
                    const res = await api.playerCareer(selected.PLAYER_NAME);
                    setCareer(res);
                  } catch(e) { console.error(e); setCareer({ error: true }); }
                  setCareerLoading(false);
                }
              }}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  tab === k
                    ? "text-violet-400 border-b-2 border-violet-500"
                    : "text-slate-500 hover:text-slate-300"
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
                      scores2={compareDetail?.scores}
                      name={detail.name}
                      name2={compareDetail?.name}
                      primaryArch={detail.primary_arch}
                      primaryArch2={compareDetail?.primary_arch}
                    />
                    {!compare && (
                      <p className="text-[10px] text-slate-600 text-center mt-1">
                        Click a duo partner to compare on radar
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {["PTS","REB","AST","GP"].map(k => (
                        <div key={k} className="bg-slate-900 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-white">
                            {k === "GP" ? selected[k] : Number(selected[k] || 0).toFixed(1)}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">{k}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-center">
                      <span className="text-xs text-slate-400">Primary Archetype: </span>
                      <span className="text-xs font-semibold text-violet-300">{detail.primary_arch}</span>
                      {detail.overall_score != null ? (
                        <>
                          <span className="mx-2 text-slate-700">·</span>
                          <span className="text-xs font-semibold text-violet-300">
                            {Math.round(detail.overall_score * 100)}
                          </span>
                          {detail.overall_tier && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400 border border-violet-700/30">
                              {detail.overall_tier}
                            </span>
                          )}
                          {detail.overall_pct != null && (
                            <span className="ml-1 text-[10px] text-slate-500">
                              top {topPct(detail.overall_pct)}
                            </span>
                          )}
                          {detail.bpm != null && (
                            <span className="ml-2 text-[10px] text-slate-500">
                              BPM {detail.bpm > 0 ? "+" : ""}{detail.bpm}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="mx-2 text-slate-700">·</span>
                          <span className="text-xs text-slate-500 italic">not ranked (GP &lt; 35)</span>
                        </>
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
                    {detail.active_modifiers?.length > 0 && (() => {
                      // Modifier'ları score'a göre azalan sırayla göster
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

                {tab === "similar" && (
                  <div className="p-4 space-y-2">
                    {similarLoading && (
                      <div className="text-center text-slate-500 text-sm py-6">Loading...</div>
                    )}
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
                    {!similarLoading && !similar && (
                      <div className="text-center text-slate-600 text-xs py-6">Click "Similar" tab to load</div>
                    )}
                  </div>
                )}

                {tab === "career" && (
                  <div className="p-4">
                    {careerLoading && (
                      <div className="text-center text-slate-500 text-sm py-6">Loading...</div>
                    )}
                    {!careerLoading && career?.error && (
                      <div className="text-center text-slate-500 text-xs py-6">Career data not available (historical data required)</div>
                    )}
                    {!careerLoading && career?.seasons && (
                      <>
                        <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-3">Season-by-Season</div>
                        <div className="space-y-1.5">
                          {career.seasons.slice().reverse().map((s, i) => {
                            const score = s.overall_score != null ? Math.round(s.overall_score * 100) : null;
                            const isCurrent = s.season === "2025-26";
                            return (
                              <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isCurrent ? "bg-violet-900/20 border border-violet-700/30" : "bg-slate-900/60"}`}>
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
