import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { getAwardBadges } from "../game/awards";
import "./PlayerCard.css";

const AWARD_STYLE = {
  MVP:   { color: "#facc15", label: (c) => `MVP×${c}` },
  DPOY:  { color: "#38bdf8", label: (c) => `DPOY×${c}` },
  RING:  { color: "#fbbf24", label: (c) => `🏆×${c}` },
  FMVP:  { color: "#fb923c", label: (c) => `FMVP×${c}` },
  SIXTH: { color: "#f97316", label: () => "6th Man" },
};

// Gerçek NBA ödül geçmişi (kariyer toplamları) — game/awards.js'in sahip
// olduğu aynı veri (getAwardBadges, aksan-duyarsız isim eşleştirmesiyle).
// Kartın AÇIK (expanded) halinde, "Full Profile" başlığının altında ve
// tab bar'ın üstünde gösterilir — kapalı halde YOK (kullanıcı kararı).
// Sadece gerçek/doğrulanabilir ödülleri kapsar (MVP/DPOY/FMVP/şampiyonluk
// yüzüğü/6. Adam) — Versatile/Timeless/Duo gibi oyuna özgü kavramlar
// KASITLI OLARAK dışarıda bırakıldı (kullanıcı kararı).
function awardBadges(name) {
  return getAwardBadges(name).map(({ key, count }) => {
    const s = AWARD_STYLE[key];
    return { label: s.label(count), color: s.color };
  });
}

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

const ARCH_COLOR = {
  Engine:       "#fb923c",
  Ecosystem:    "#4ade80",
  Hub:          "#2dd4bf",
  Connector:    "#c084fc",
  Creator:      "#fb7185",
  Anchor:       "#60a5fa",
  Spacer:       "#22d3ee",
  Finisher:     "#a3e635",
  Force:        "#f87171",
  Initiator:    "#FFB11B",
  Stopper:      "#d1d5db",
  "Rim Runner": "#34d399",
};

const ARCH_SLUG = {
  Engine: "engine", Ecosystem: "ecosystem", Hub: "hub", Connector: "connector",
  Creator: "creator", Anchor: "anchor", Spacer: "spacer", Finisher: "finisher",
  Force: "force", Initiator: "initiator", Stopper: "stopper", "Rim Runner": "rim-runner",
};

const TAG_LABEL = {
  "3-and-D": "3&D", "Pick-and-Roll": "P&R",
};
const tl = n => TAG_LABEL[n] || n;

const TIER_COLOR = {
  "Elite Prospect": "#a855f7", "First-Round": "#3b82f6", "Rotation Upside": "#10b981",
  "Developmental": "#d97706", "Longshot": "#9ca3af",
};
const OUTCOME_COLOR = {
  "Superstar": "#a855f7", "All-Star": "#3b82f6", "Quality Starter": "#10b981",
  "Starter": "#22c55e", "Rotation": "#d97706", "Fringe": "#9ca3af",
};

/* ── Per-league behavior: detail endpoint, small-sample cutoff, prospect copy ── */
const LEAGUE_CONFIG = {
  gleague:    { fetchDetail: (name, season) => api.gleaguePlayerScores(name, season),    smallSample: 15, ceilingNote: "NBA readiness → age-projected ceiling" },
  ncaa:       { fetchDetail: (name, season) => api.ncaaPlayerScores(name, season),       smallSample: 15, ceilingNote: "NBA readiness (SOS-adjusted) → age-projected ceiling" },
  euroleague: { fetchDetail: (name, season) => api.euroleaguePlayerScores(name, season), smallSample: 8,  ceilingNote: "Production vs. EuroLeague pro pool → age-projected ceiling" },
};

function topPctLabel(pct) {
  if (pct == null) return null;
  const p = Math.round(pct * 100);
  return p >= 99 ? "<1%" : `${100 - p}%`;
}

/* ── Mini radar (trig-generated, no chart lib — keeps the card light) ── */
function MiniRadar({ scores }) {
  const n = CORE.length, cx = 100, cy = 100, maxR = 74;
  const angleOf = i => (-90 + i * (360 / n)) * Math.PI / 180;
  const ptAt = (i, r) => [cx + r * Math.cos(angleOf(i)), cy + r * Math.sin(angleOf(i))];
  const values = CORE.map(name => Math.max(0, Math.min(1, scores?.[name] || 0)));
  const poly = values.map((v, i) => ptAt(i, maxR * v).join(",")).join(" ");

  return (
    <svg viewBox="0 0 200 200" className="pcard-radar">
      {[0.33, 0.66, 1].map(f => (
        <polygon key={f} fill="none" stroke="rgba(255,255,255,.06)"
          points={CORE.map((_, i) => ptAt(i, maxR * f).join(",")).join(" ")} />
      ))}
      {CORE.map((_, i) => {
        const [x, y] = ptAt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.08)" />;
      })}
      <polygon points={poly} fill="var(--accent)" fillOpacity="0.28" stroke="var(--accent)" strokeWidth="1.5" />
      {values.map((v, i) => {
        const [x, y] = ptAt(i, maxR * v);
        return <circle key={i} cx={x} cy={y} r="2.2" fill="var(--accent)" />;
      })}
      {CORE.map((label, i) => {
        const [x, y] = ptAt(i, maxR + 14);
        const c = Math.cos(angleOf(i));
        const anchor = c > 0.35 ? "start" : c < -0.35 ? "end" : "middle";
        return (
          <text key={label} x={x} y={y} fontSize="6.5" fill="#9a9a9a" textAnchor={anchor} dominantBaseline="middle">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Mini career trajectory chart ───────────────────────────────────── */
function MiniCareerChart({ seasons }) {
  const scored = seasons.filter(s => s.overall_score != null);
  if (scored.length < 2) return null;

  const W = 240, H = 76, PX = 10, PY = 9, iW = W - PX * 2, iH = H - PY * 2;
  const vals = scored.map(s => s.overall_score);
  const minV = Math.min(...vals), maxV = Math.max(...vals), range = (maxV - minV) || 0.01;
  const pts = scored.map((s, i) => ({
    x: PX + (i / (scored.length - 1)) * iW,
    y: PY + iH - ((s.overall_score - minV) / range) * iH,
    s,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${(PY + iH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PY + iH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <path d={area} fill="var(--accent)" fillOpacity="0.15" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.3" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="1.8" fill="var(--accent)" />
          <text x={p.x} y={p.y - 4} fontSize="6" fill="var(--accent)" textAnchor="middle">
            {Math.round(p.s.overall_score * 100)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Prospect tab content (G-League / NCAA / EuroLeague) ────────────── */
function ProspectPanel({ prospect, ceilingNote }) {
  if (!prospect) return <div className="pcard-empty">No prospect data</div>;
  const tierColor = TIER_COLOR[prospect.tier] || "var(--accent)";
  return (
    <>
      <div className="pcard-prospect-head">
        <div>
          <div className="pcard-prospect-grade" style={{ color: tierColor }}>{prospect.grade}</div>
          <div className="pcard-section-lbl" style={{ margin: 0 }}>Prospect Grade</div>
        </div>
        <span className="pcard-tier-badge" style={{ color: tierColor, borderColor: tierColor + "55", background: tierColor + "22" }}>
          {prospect.tier}
        </span>
      </div>

      <div className="pcard-ceiling">
        <div className="pcard-ceiling-labels">
          <span>Floor <b>{prospect.floor}</b></span>
          <span>Ceiling <b>{prospect.ceiling}</b></span>
        </div>
        <div className="pcard-arch-track"><div style={{ width: `${prospect.ceiling}%`, background: `linear-gradient(90deg, var(--accent), ${tierColor})` }} /></div>
        <div className="pcard-ceiling-note">{ceilingNote}</div>
        {prospect.ceiling_validated === false && (
          <div className="pcard-ceiling-warn">⚠ Floor is validated · ceiling/grade are model estimates</div>
        )}
      </div>

      {(prospect.strengths?.length > 0 || prospect.weaknesses?.length > 0) && (
        <div className="pcard-sw-grid">
          <div>
            <div className="pcard-section-lbl" style={{ color: "#10b981" }}>Strengths</div>
            {(prospect.strengths || []).map(s => <span key={s} className="pcard-sw-chip good">{s}</span>)}
          </div>
          <div>
            <div className="pcard-section-lbl" style={{ color: "#ef4444" }}>Weaknesses</div>
            {(prospect.weaknesses || []).map(w => <span key={w} className="pcard-sw-chip bad">{w}</span>)}
          </div>
        </div>
      )}

      {(prospect.comparables?.length > 0) && (
        <>
          <div className="pcard-section-lbl" style={{ marginTop: 10 }}>Similar to</div>
          {prospect.comparables.map((c, i) => (
            <div key={i} className="pcard-sim-row">
              <div className="pcard-sim-name">{c.name}</div>
              <div className="pcard-sim-pct">
                <div className="v" style={{ color: OUTCOME_COLOR[c.outcome] || "var(--accent)" }}>{c.outcome}</div>
                {c.peak_bpm != null && <div className="l">BPM {c.peak_bpm}</div>}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

export default function PlayerCard({ player, rank, onClick, discover, season, expandable = false, league = "nba", defaultExpanded = false, compact = false }) {
  const isNBA = !league || league === "nba";
  const leagueCfg = LEAGUE_CONFIG[league];
  const smallSampleThreshold = leagueCfg?.smallSample ?? 20;
  const isCurrent = isNBA ? !season : true;

  const arch = player.primary_arch || "";
  const color = ARCH_COLOR[arch] || "#9ca3af";
  const slug = ARCH_SLUG[arch];
  const imgSrc = slug ? `/archetypes/${slug}.png` : null;

  const hasOverall = player.overall_score != null;
  const overall = hasOverall ? Math.round(player.overall_score * 100) : null;
  const topPct = topPctLabel(player.overall_pct);
  const pts = player.PTS != null ? Number(player.PTS).toFixed(1) : null;
  const reb = player.REB != null ? Number(player.REB).toFixed(1) : null;
  const ast = player.AST != null ? Number(player.AST).toFixed(1) : null;
  const awards = awardBadges(player.PLAYER_NAME);

  const cardRef = useRef(null);
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [tab, setTab] = useState(() => (isNBA ? "radar" : league === "euroleague" ? "radar" : "prospect"));
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [similar, setSimilar] = useState(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [career, setCareer] = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);

  useEffect(() => {
    if (defaultExpanded) ensureDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureDetail = async () => {
    if (detail || detailLoading) return;
    setDetailLoading(true);
    try {
      const sc = isNBA
        ? (isCurrent ? await api.playerScores(player.PLAYER_NAME) : await api.historicalPlayer(season, player.PLAYER_NAME))
        : await leagueCfg.fetchDetail(player.PLAYER_NAME, season);
      setDetail(sc);
      if (league === "euroleague" && sc?.prospect) setTab("prospect");
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };
  const ensureSimilar = async () => {
    if (similar || similarLoading) return;
    setSimilarLoading(true);
    try { const r = await api.similarPlayers(player.PLAYER_NAME, 10); setSimilar(r.similar || []); }
    catch (e) { console.error(e); }
    setSimilarLoading(false);
  };
  const ensureCareer = async () => {
    if (career || careerLoading) return;
    setCareerLoading(true);
    try { const r = await api.playerCareer(player.PLAYER_NAME); setCareer(r); }
    catch (e) { setCareer({ error: true }); }
    setCareerLoading(false);
  };

  const selectTab = (k) => {
    setTab(k);
    if (k === "similar" && isCurrent) ensureSimilar();
    if (k === "career") ensureCareer();
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      ensureDetail();
      if (tab === "similar" && isCurrent) ensureSimilar();
      if (tab === "career") ensureCareer();
    }
    if (cardRef.current) cardRef.current.style.transform = "";
  };

  const handleCardClick = () => {
    if (expandable) { if (!expanded) toggleExpand(); }
    else if (onClick) onClick(player);
  };
  const handleMouseMove = (e) => {
    if (expanded || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cardRef.current.style.transform = `rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 10}deg) scale(1.02)`;
    cardRef.current.style.setProperty("--mx", `${x * 100}%`);
    cardRef.current.style.setProperty("--my", `${y * 100}%`);
  };
  const handleMouseLeave = () => {
    if (expanded || !cardRef.current) return;
    cardRef.current.style.transform = "";
  };

  const tabs = isNBA
    ? [
        ["radar", "Radar"], ["scores", "Archs"], ["mods", "Mods"],
        ...(isCurrent ? [["similar", "Similar"]] : []),
        ["career", "Career"],
      ]
    : league === "euroleague"
      ? [...(detail?.prospect ? [["prospect", "Prospect"]] : []), ["radar", "Radar"], ["scores", "Archs"]]
      : [["prospect", "Prospect"], ["radar", "Radar"], ["scores", "Archs"]];

  const sortedMods = detail?.active_modifiers?.length
    ? [...detail.active_modifiers].sort((a, b) => (detail.modifier_scores?.[b] || 0) - (detail.modifier_scores?.[a] || 0))
    : [];

  return (
    <div className={`pcard-stage${compact ? " compact" : ""}`}>
      <div
        ref={cardRef}
        className={`pcard${expanded ? " pcard-expanded" : ""}${discover ? " pcard-discover" : ""}`}
        style={{ "--accent": color, "--accent-a": color + "48", "--accent-b": color + "30", "--accent-line": color + "66" }}
        onClick={handleCardClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="pcard-holo" />
        <div className="pcard-foil" />
        <div className="pcard-grain" />
        <span className="pcard-sparkle s1" /><span className="pcard-sparkle s2" /><span className="pcard-sparkle s3" />

        <div className="pcard-top">
          <span className={`pcard-rank${rank != null && rank <= 3 ? " top" : ""}`}>{rank != null ? `#${rank}` : ""}</span>
          {hasOverall ? <span className="pcard-rating">{overall}</span> : <span className="pcard-gp">{player.GP || 0} gp</span>}
        </div>

        <div className="pcard-photo">
          <div className="pcard-photo-glow" />
          {topPct && <span className="pcard-toppct">top {topPct}</span>}
          {imgSrc
            ? <img src={imgSrc} alt={arch} className="pcard-photo-img" loading="lazy" />
            : <div className="pcard-photo-fallback" />}
          <div className="pcard-photo-fade" />
        </div>

        <div className="pcard-nameband">
          <h3 className="pcard-name">{player.PLAYER_NAME}</h3>
          <div className="pcard-meta">
            <span className="pcard-team">
              {player.TEAM_ABBREVIATION}{player.POSITION ? ` · ${player.POSITION}` : ""}
              {season && season !== "2025-26" ? ` · ${season}` : ""}
            </span>
            {arch && <><span className="pcard-dot">·</span><span className="pcard-arch">{arch}</span></>}
          </div>
        </div>

        <div className={`pcard-stats${expandable ? "" : " flat"}`}>
          <div className="pcard-stat-row">
            <div><div className="pcard-stat-val hi">{pts ?? "—"}</div><div className="pcard-stat-lbl">PTS</div></div>
            <div><div className="pcard-stat-val">{reb ?? "—"}</div><div className="pcard-stat-lbl">REB</div></div>
            <div><div className="pcard-stat-val">{ast ?? "—"}</div><div className="pcard-stat-lbl">AST</div></div>
          </div>
        </div>

        {(player.league || (player.GP != null && Number(player.GP) < smallSampleThreshold)) && (
          <div className="pcard-tags">
            {player.league && player.league !== "nba" && <span className="pcard-league-tag">{player.league}</span>}
            {player.GP != null && Number(player.GP) < smallSampleThreshold && <span className="pcard-sample-tag">small sample</span>}
          </div>
        )}

        {expandable && (
          <>
            <div className="pcard-peek" onClick={(e) => { e.stopPropagation(); toggleExpand(); }}>
              <span>Full Profile</span><span className="pcard-chev">▾</span>
            </div>
            <div className="pcard-expand-wrap">
              <div className="pcard-expand-inner">
                <div className="pcard-detail">
                  {awards.length > 0 && (
                    <div className="pcard-award-row" onClick={(e) => e.stopPropagation()}>
                      {awards.map(a => (
                        <span key={a.label} className="pcard-award-tag"
                          style={{ color: a.color, borderColor: a.color + "55", background: a.color + "1f" }}>
                          {a.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="pcard-tabbar" onClick={(e) => e.stopPropagation()}>
                    {tabs.map(([k, l]) => (
                      <button key={k} className={tab === k ? "active" : ""} onClick={() => selectTab(k)}>{l}</button>
                    ))}
                  </div>
                  <div className="pcard-tabcontent" onClick={(e) => e.stopPropagation()}>
                    {detailLoading && !detail && tab !== "similar" && tab !== "career" && (
                      <div className="pcard-loading">Loading…</div>
                    )}

                    {tab === "radar" && detail && (
                      <>
                        <MiniRadar scores={detail.scores} />
                        <div className="pcard-quickstats">
                          {[[pts ?? "—", "PTS"], [reb ?? "—", "REB"], [ast ?? "—", "AST"], [player.GP ?? "—", "GP"]].map(([v, l]) => (
                            <div key={l}><div className="v">{v}</div><div className="l">{l}</div></div>
                          ))}
                        </div>
                        <div className="pcard-radar-summary">
                          <span style={{ color: "var(--accent)", fontWeight: 700 }}>{detail.primary_arch || arch}</span>
                          {detail.overall_score != null && (
                            <>
                              {" · "}
                              <span style={{ color: "var(--accent)", fontWeight: 700 }}>{Math.round(detail.overall_score * 100)}</span>
                              {detail.overall_pct != null && <> top {topPctLabel(detail.overall_pct)}</>}
                            </>
                          )}
                        </div>
                      </>
                    )}

                    {tab === "scores" && detail && (
                      <>
                        <div className="pcard-section-lbl">Core Archetypes</div>
                        {!isNBA && (
                          <div className="pcard-arch-note">
                            Primary archetype is picked by how much a player stands out from their league's peers, not by the highest raw bar — tracking data is limited outside the NBA, so raw scores cluster on a few archetypes.
                          </div>
                        )}
                        {CORE.map(name => {
                          const v = Math.round((detail.scores?.[name] || 0) * 100);
                          const isPrimary = name === (detail.primary_arch || arch);
                          return (
                            <div key={name} className={`pcard-arch-item${isPrimary ? " primary" : ""}`}>
                              <span className="lbl">{name}</span>
                              <div className="pcard-arch-track"><div style={{ width: `${v}%` }} /></div>
                              <span className="val">{v}</span>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {tab === "mods" && detail && (
                      sortedMods.length > 0 ? (
                        <>
                          <div className="pcard-section-lbl">Active Modifiers</div>
                          <div className="pcard-chip-row">
                            {sortedMods.map(m => <span key={m} className="pcard-chip">{tl(m)}</span>)}
                          </div>
                          {sortedMods.map(m => {
                            const v = Math.round((detail.modifier_scores?.[m] || 0) * 100);
                            return (
                              <div key={m} className="pcard-arch-item">
                                <span className="lbl">{tl(m)}</span>
                                <div className="pcard-arch-track"><div style={{ width: `${v}%` }} /></div>
                                <span className="val">{v}</span>
                              </div>
                            );
                          })}
                        </>
                      ) : <div className="pcard-empty">No active modifiers</div>
                    )}

                    {tab === "prospect" && detail && (
                      <ProspectPanel prospect={detail.prospect} ceilingNote={leagueCfg?.ceilingNote} />
                    )}

                    {tab === "similar" && isCurrent && (
                      similarLoading ? <div className="pcard-loading">Loading…</div> :
                      (similar?.length ? similar.map((p, i) => (
                        <div key={i} className="pcard-sim-row">
                          <div>
                            <div className="pcard-sim-name">{p.name}</div>
                            <div className="pcard-sim-meta">{p.team} · {p.position} · <span className="a">{p.primary_arch}</span></div>
                          </div>
                          <div className="pcard-sim-pct">
                            <div className="v">{Math.round(p.similarity * 100)}%</div>
                            <div className="l">similarity</div>
                          </div>
                        </div>
                      )) : <div className="pcard-empty">No data</div>)
                    )}

                    {tab === "career" && (
                      careerLoading ? <div className="pcard-loading">Loading…</div> :
                      career?.error ? <div className="pcard-empty">Career data not available</div> :
                      career?.seasons ? (
                        <>
                          <div className="pcard-section-lbl">Overall Trajectory</div>
                          <MiniCareerChart seasons={career.seasons} />
                          <div className="pcard-section-lbl" style={{ marginTop: 10 }}>Season-by-Season</div>
                          {career.seasons.slice().reverse().map((s, i) => {
                            const score = s.overall_score != null ? Math.round(s.overall_score * 100) : null;
                            const isCur = s.season === "2025-26";
                            return (
                              <div key={i} className={`pcard-season-row${isCur ? " cur" : ""}`}>
                                <span className="yr">{s.season}</span>
                                <span className="tm">{s.team}</span>
                                <span className="arc">{s.primary_arch || "—"}</span>
                                <span className="stat">
                                  {s.pts != null ? `${s.pts}p` : ""}{s.reb != null ? ` ${s.reb}r` : ""}{s.ast != null ? ` ${s.ast}a` : ""}
                                </span>
                                {score != null && <span className="sc">{score}</span>}
                              </div>
                            );
                          })}
                        </>
                      ) : null
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
