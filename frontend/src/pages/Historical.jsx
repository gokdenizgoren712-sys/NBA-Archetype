import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { useLang } from "../contexts/LanguageContext";
import RadarProfile from "../components/RadarProfile";

const TIER_COLOR = {
  Elite:        "bg-blue-500/20 text-blue-300",
  Versatile:    "bg-sky-500/20 text-sky-300",
  Contributor:  "bg-emerald-500/20 text-emerald-300",
  "Role Player":"bg-slate-700 text-slate-400",
  Specialist:   "bg-slate-800 text-slate-500",
};

// Sıralanabilir sütun tanımları
const COLUMNS = [
  { key: "PLAYER_NAME",      label: "Player",    align: "left",  fmt: v => v,                          numeric: false },
  { key: "GP",               label: "GP",        align: "right", fmt: v => v,                          numeric: true  },
  { key: "MIN",              label: "MIN",        align: "right", fmt: v => Number(v||0).toFixed(1),   numeric: true  },
  { key: "PTS",              label: "PTS",        align: "right", fmt: v => Number(v||0).toFixed(1),   numeric: true  },
  { key: "REB",              label: "REB",        align: "right", fmt: v => Number(v||0).toFixed(1),   numeric: true  },
  { key: "AST",              label: "AST",        align: "right", fmt: v => Number(v||0).toFixed(1),   numeric: true  },
  { key: "STL",              label: "STL",        align: "right", fmt: v => v != null ? Number(v).toFixed(1) : "—", numeric: true },
  { key: "BLK",              label: "BLK",        align: "right", fmt: v => v != null ? Number(v).toFixed(1) : "—", numeric: true },
  { key: "FGA",              label: "FGA",        align: "right", fmt: v => v != null ? Number(v).toFixed(1) : "—",          numeric: true },
  { key: "FG_PCT",           label: "FG%",        align: "right", fmt: v => v != null ? (Number(v)*100).toFixed(1)+"%" : "—", numeric: true },
  { key: "FG3A",             label: "3PA",        align: "right", fmt: v => v != null ? Number(v).toFixed(1) : "—",          numeric: true },
  { key: "FG3_PCT",          label: "3P%",        align: "right", fmt: v => v != null ? (Number(v)*100).toFixed(1)+"%" : "—", numeric: true },
  { key: "overall_score",    label: "Overall",    align: "right", fmt: v => v != null ? Math.round(Number(v)*100) : "—", numeric: true },
  { key: "primary_arch",     label: "Archetype",  align: "left",  fmt: v => v || "—",                 numeric: false },
  { key: "versatility_score",label: "V.Score",    align: "right", fmt: v => v != null ? Math.round(Number(v)*100) : "—", numeric: true },
  { key: "versatility_tier", label: "Tier",       align: "left",  fmt: null,                           numeric: false },
  { key: "Bileşenler",       label: "Components", align: "left",  fmt: v => v || "—",                 numeric: false },
];

function SortIcon({ col, sortCol, sortAsc }) {
  if (col !== sortCol) return <span className="text-slate-700 ml-1">↕</span>;
  return <span className="text-blue-400 ml-1">{sortAsc ? "↑" : "↓"}</span>;
}

export default function Historical() {
  const { lang } = useLang();
  const [seasons, setSeasons]     = useState([]);
  const [season, setSeason]       = useState("");
  const [tab, setTab]             = useState("players");
  const [search, setSearch]       = useState("");
  const [searchInput, setSearchInput] = useState(""); // debounce için ham input
  const debounceRef               = useRef(null);

  const [players, setPlayers]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [dataEra, setDataEra]     = useState("");
  const [loadingP, setLoadingP]   = useState(false);

  const [sortCol, setSortCol]     = useState("overall_score");
  const [sortAsc, setSortAsc]     = useState(false);

  const [lineups, setLineups]     = useState([]);
  const [loadingL, setLoadingL]   = useState(false);

  const [selected, setSelected]   = useState(null);
  const [selDetail, setSelDetail] = useState(null);
  const [career, setCareer]       = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);

  useEffect(() => {
    api.seasons().then(d => {
      setSeasons(d.seasons || []);
      if (d.seasons?.length) setSeason(d.seasons[0]);
    });
  }, []);

  const fetchPlayers = useCallback(() => {
    if (!season || tab !== "players") return;
    setLoadingP(true);
    const params = { limit: 100, sort_col: sortCol, sort_asc: sortAsc };
    if (search) params.search = search;
    api.historical(season, params)
      .then(d => { setPlayers(d.players || []); setTotal(d.total || 0); setDataEra(d.data_era || ""); })
      .catch(console.error)
      .finally(() => setLoadingP(false));
  }, [season, search, tab, sortCol, sortAsc]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  useEffect(() => {
    if (!season || tab !== "lineups") return;
    if (season === "2025-26") { setLineups([]); return; }
    setLoadingL(true);
    api.historicalLineup(season, 30)
      .then(d => setLineups(d.lineups || []))
      .catch(console.error)
      .finally(() => setLoadingL(false));
  }, [season, tab]);

  const openPlayer = async (name) => {
    setSelected(name);
    setSelDetail(null);
    setCareer(null);
    try {
      const sc = await api.historicalPlayer(season, name);
      setSelDetail(sc);
    } catch (e) { console.error(e); }
    // Kariyer zaman çizelgesi
    setCareerLoading(true);
    try {
      const c = await api.playerCareer(name);
      setCareer(c);
    } catch (e) { /* ok — kariyer yoksa gösterme */ }
    setCareerLoading(false);
  };

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(a => !a);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const TABS_LABEL = {
    players: lang === "tr" ? "Oyuncular" : "Players",
    lineups: lang === "tr" ? "En İyi Lineup'lar" : "Best Lineups",
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex flex-wrap gap-2 items-center">
          <select value={season} onChange={e => setSeason(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {dataEra && (
            <span className={`text-[10px] px-2 py-1 rounded border font-mono ${
              dataEra === "tracking"
                ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                : dataEra === "hustle"
                ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                : "bg-slate-700/40 text-slate-400 border-slate-600/30"
            }`}
              title={
                dataEra === "tracking"
                  ? (lang === "tr" ? "Hustle + Tracking metrikleri mevcut (2015-16+)" : "Hustle + Tracking metrics available (2015-16+)")
                  : dataEra === "hustle"
                  ? (lang === "tr" ? "Tracking metrikleri mevcut, Hustle yok (2013-15)" : "Tracking metrics available, no Hustle (2013-15)")
                  : (lang === "tr" ? "Yalnızca box-score + advanced (1983-2013)" : "Box-score + advanced only (1983-2013)")
              }
            >
              {dataEra === "tracking" ? "Tracking Era" : dataEra === "hustle" ? "Hustle Era" : "Classic Era"}
            </span>
          )}

          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {Object.entries(TABS_LABEL).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === k ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"
                }`}>{l}</button>
            ))}
          </div>

          {tab === "players" && (
            <input
              value={searchInput}
              onChange={e => {
                setSearchInput(e.target.value);
                clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => setSearch(e.target.value), 350);
              }}
              placeholder={lang === "tr" ? "Oyuncu ara..." : "Search player..."}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          )}
          {tab === "players" && (
            <span className="text-xs text-slate-500">{total} {lang === "tr" ? "oyuncu" : "players"}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {tab === "players" && (
            loadingP ? (
              <div className="p-8 text-center text-slate-500">
                {lang === "tr" ? "Yükleniyor..." : "Loading..."}
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs sticky top-0 bg-slate-950 z-10">
                    <th className="p-3 text-left w-6">#</th>
                    {COLUMNS.filter(c => c.key !== "Bileşenler").map(col => (
                      <th key={col.key}
                        onClick={() => col.numeric || col.key === "PLAYER_NAME" ? handleSort(col.key) : null}
                        className={`p-3 text-${col.align} whitespace-nowrap select-none ${
                          col.numeric || col.key === "PLAYER_NAME"
                            ? "cursor-pointer hover:text-white"
                            : ""
                        } ${sortCol === col.key ? "text-blue-400" : ""}`}
                      >
                        {col.label}
                        {(col.numeric || col.key === "PLAYER_NAME") && (
                          <SortIcon col={col.key} sortCol={sortCol} sortAsc={sortAsc} />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={i}
                      onClick={() => openPlayer(p.PLAYER_NAME)}
                      className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                        selected === p.PLAYER_NAME ? "bg-blue-900/20" : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="p-3 text-slate-600 text-xs">{i + 1}</td>
                      {COLUMNS.filter(c => c.key !== "Bileşenler").map(col => {
                        if (col.key === "versatility_tier") {
                          const tier = p[col.key];
                          return (
                            <td key={col.key} className="p-3">
                              {tier ? (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${TIER_COLOR[tier] || "bg-slate-800 text-slate-500"}`}>
                                  {tier}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                          );
                        }
                        if (col.key === "overall_score") {
                          const v = p[col.key];
                          const score = v != null ? Math.round(Number(v) * 100) : null;
                          return (
                            <td key={col.key} className="p-3 text-right">
                              {score != null ? (
                                <span className={`font-bold ${
                                  score >= 80 ? "text-blue-400" :
                                  score >= 65 ? "text-sky-400" :
                                  score >= 50 ? "text-slate-300" : "text-slate-500"
                                }`}>{score}</span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                          );
                        }
                        if (col.key === "primary_arch") {
                          return (
                            <td key={col.key} className="p-3 text-left">
                              <span className="text-blue-400/80 text-xs">{p[col.key] || "—"}</span>
                            </td>
                          );
                        }
                        const raw = p[col.key];
                        const display = col.fmt ? col.fmt(raw) : (raw ?? "—");
                        return (
                          <td key={col.key} className={`p-3 text-${col.align} ${
                            col.key === "PLAYER_NAME"
                              ? "font-medium text-white"
                              : col.numeric
                                ? "text-slate-300 tabular-nums"
                                : "text-slate-400 text-xs"
                          }`}>
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tab === "lineups" && season === "2025-26" && (
            <div className="p-8 text-center text-slate-500 text-sm">
              {lang === "tr"
                ? "2025-26 için teorik lineup'ları görmek üzere '5'li Uyum' sayfasını kullanın."
                : "For 2025-26 theoretical lineups, visit the 5-Man Fit page."}
            </div>
          )}
          {tab === "lineups" && season !== "2025-26" && (
            loadingL ? <div className="p-8 text-center text-slate-500">Loading...</div> :
            <div className="p-4 space-y-2">
              {lineups.map((lu, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-slate-500 text-xs mr-2">{i+1}</span>
                      <span className="text-white text-sm font-medium">
                        {[lu.Oyuncu_1,lu.Oyuncu_2,lu.Oyuncu_3,lu.Oyuncu_4,lu.Oyuncu_5]
                          .filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-blue-400 shrink-0">
                      {Math.round(lu.Uyum_Skoru*100)}
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    <span>Coverage: <span className="text-slate-300">{Math.round(lu.Kapsama*100)}</span></span>
                    <span>Depth: <span className="text-slate-300">{Math.round(lu.Derinlik*100)}</span></span>
                    <span>Strong Roles: <span className="text-slate-300">{lu.Guclu_Rol}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Oyuncu detay paneli */}
      {selDetail && (
        <div className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col overflow-y-auto shrink-0">
          <div className="p-4 border-b border-slate-800 flex justify-between items-start">
            <div>
              <div className="font-bold text-white text-sm">{selDetail.name}</div>
              <div className="text-xs text-slate-500">{selDetail.team} · {season}</div>
              {selDetail.primary_arch && (
                <div className="text-xs text-blue-400 mt-0.5">{selDetail.primary_arch}</div>
              )}
            </div>
            <button onClick={() => { setSelected(null); setSelDetail(null); setCareer(null); }}
              className="text-slate-500 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="p-3">
            <RadarProfile scores={selDetail.scores} name={selDetail.name} />
            {/* Overall score */}
            {selDetail.overall_score != null && (
              <div className="mt-3 text-center">
                <div className="text-xs text-slate-500 mb-1">Overall Score</div>
                <div className={`text-2xl font-bold ${
                  selDetail.overall_score >= 0.80 ? "text-blue-400" :
                  selDetail.overall_score >= 0.65 ? "text-sky-400" : "text-slate-300"
                }`}>{Math.round(selDetail.overall_score * 100)}</div>
              </div>
            )}
            {selDetail.versatility_score != null && (
              <div className="mt-2 flex justify-center gap-4 text-xs">
                <span className="text-slate-400">Versatility: <span className="text-blue-400 font-bold">{Math.round(selDetail.versatility_score*100)}</span></span>
                {selDetail.versatility_tier && (
                  <span className={`px-2 py-0.5 rounded text-xs ${TIER_COLOR[selDetail.versatility_tier]||""}`}>
                    {selDetail.versatility_tier}
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Kariyer sparkline */}
          {careerLoading && (
            <div className="px-3 pb-2 text-xs text-slate-600 text-center">Loading career...</div>
          )}
          {career && career.seasons?.length > 1 && (() => {
            const pts = career.seasons.filter(s => s.overall_score != null);
            if (pts.length < 2) return null;
            const vals = pts.map(s => s.overall_score);
            const minV = Math.min(...vals), maxV = Math.max(...vals);
            const range = maxV - minV || 0.01;
            const W = 248, H = 48, PAD = 4;
            const xs = pts.map((_, i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2));
            const ys = vals.map(v => H - PAD - ((v - minV) / range) * (H - PAD * 2));
            const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
            const curIdx = pts.findIndex(s => s.season === season);
            return (
              <div className="px-3 pb-3 mt-1">
                <div className="text-[10px] text-slate-600 mb-1 uppercase tracking-wider">Career Overall</div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
                  <polyline points={polyline} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
                  {pts.map((s, i) => (
                    <circle key={i} cx={xs[i]} cy={ys[i]} r={i === curIdx ? 4 : 2.5}
                      fill={i === curIdx ? "#60a5fa" : "#1d4ed8"}
                      stroke={i === curIdx ? "#fff" : "none"} strokeWidth={1}
                    />
                  ))}
                </svg>
                <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                  <span>{pts[0].season}</span>
                  <span>{pts[pts.length-1].season}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
