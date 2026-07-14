import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import RadarProfile from "../components/RadarProfile";
import ScoreBar from "../components/ScoreBar";
import PlayerCard from "../components/PlayerCard";
import { useAuth } from "../contexts/AuthContext";
import { FlagIcon } from "../components/BrandIcons";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

const ARCH_COLOR = {
  Engine: "text-orange-400 border-orange-500/40",
  Ecosystem: "text-green-400 border-green-500/40",
  Hub: "text-teal-400 border-teal-500/40",
  Connector: "text-purple-400 border-purple-500/40",
  Creator: "text-rose-400 border-rose-500/40",
  Anchor: "text-blue-400 border-blue-500/40",
  Spacer: "text-cyan-400 border-cyan-500/40",
  Finisher: "text-lime-400 border-lime-500/40",
  Force: "text-red-400 border-red-500/40",
  Initiator: "text-yamabuki border-yamabuki/40",
  Stopper: "text-gray-300 border-gray-500/40",
  "Rim Runner": "text-emerald-400 border-emerald-500/40",
};

const POS_COLOR = {
  PG: "text-violet-400", SG: "text-blue-400",
  SF: "text-emerald-400", PF: "text-orange-400", C: "text-red-400",
};

function CareerChart({ seasons }) {
  const scored = seasons.filter(s => s.overall_score != null);
  if (scored.length < 2) return null;

  const W = 520, H = 90, PX = 24, PY = 12;
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
    <div>
      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
        Overall Trajectory
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <defs>
          <linearGradient id="ppCG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ppCG)" />
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

function Section({ title, children }) {
  return (
    <div className="p-5 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="font-logo text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-faint)" }}>{title}</div>
      {children}
    </div>
  );
}

export default function PlayerProfile() {
  const { name: rawName } = useParams();
  const navigate = useNavigate();
  const name = decodeURIComponent(rawName || "");

  const { isLoggedIn, token } = useAuth();
  const [detail, setDetail] = useState(null);
  const [career, setCareer] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagArch, setFlagArch] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const [flagStatus, setFlagStatus] = useState(null); // null | "sending" | "ok" | "err"

  useEffect(() => {
    if (!name) return;
    setLoading(true); setNotFound(false);
    Promise.all([
      api.playerScores(name),
      api.playerCareer(name).catch(() => null),
      api.similarPlayers(name, 5).catch(() => ({ similar: [] })),
    ]).then(([d, c, s]) => {
      setDetail(d);
      setCareer(c?.seasons || null);
      setSimilar(s?.similar || []);
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [name]);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: name, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const arch = detail?.primary_arch || "";
  const archColor = ARCH_COLOR[arch] || "text-gray-400 border-gray-600/40";
  const overall = detail?.overall_score != null ? Math.round(detail.overall_score * 100) : null;
  const pct = detail?.overall_pct != null ? Math.round(detail.overall_pct * 100) : null;
  const topPctLabel = pct == null ? null : pct >= 99 ? "<1%" : `${100 - pct}%`;
  const pts = detail?.pts != null ? Number(detail.pts).toFixed(1) : null;
  const reb = detail?.reb != null ? Number(detail.reb).toFixed(1) : null;
  const ast = detail?.ast != null ? Number(detail.ast).toFixed(1) : null;
  const gp  = detail?.gp  ?? detail?.GP ?? null;
  const bpm = detail?.bpm != null ? Number(detail.bpm).toFixed(1) : null;
  const isSmallSample = gp != null && Number(gp) < 20;

  const seoDesc = detail
    ? `${name} (${arch})${pts ? `: ${pts} PTS · ${reb} REB · ${ast} AST` : ""}${overall ? ` · Overall: ${overall}` : ""}. Radar profile, career timeline, and similar players.`
    : `${name} — Primary Arch profile.`;

  if (loading) return (
    <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      Loading...
    </div>
  );

  if (notFound || !detail) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>Player not found: {name}</div>
      <button onClick={() => navigate("/players")} className="text-xs px-3 py-1.5 rounded"
        style={{ background: "var(--accent)", color: "#000" }}>← Back to Players</button>
    </div>
  );

  return (
    <>
      <SEO
        title={name}
        description={seoDesc}
        path={`/players/${encodeURIComponent(name)}`}
      />
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-16 space-y-4">

          {/* Top bar */}
          <div className="flex items-center justify-between">
            <button onClick={() => navigate("/players")}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
              ← Players
            </button>
            <button onClick={share}
              className="text-xs px-3 py-1 rounded transition-colors"
              style={{ border: "1px solid var(--border)", color: copied ? "var(--accent)" : "var(--text-muted)" }}>
              {copied ? "Copied!" : "Share ↗"}
            </button>
          </div>

          {/* Hero */}
          <div className="p-5 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {name}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {detail.pos5 && (
                    <span className={`text-[10px] font-mono font-semibold ${POS_COLOR[detail.pos5] || ""}`}>
                      {detail.pos5}
                    </span>
                  )}
                  {detail.team && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{detail.team}</span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${archColor}`}
                    style={{ background: "transparent" }}>
                    {arch || "—"}
                  </span>
                  {isLoggedIn && arch && (
                    <button
                      onClick={() => { setFlagOpen(true); setFlagArch(""); setFlagNote(""); setFlagStatus(null); }}
                      className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                      title="Flag incorrect archetype"
                      style={{ color: "var(--text-faint)", border: "1px solid var(--border)" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--text-muted)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--text-faint)"}
                    ><span className="inline-flex items-center gap-1"><FlagIcon size={10} /> flag</span></button>
                  )}
                  {isSmallSample && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(255,177,27,.15)", color: "#FFB11B" }}>
                      ~small sample
                    </span>
                  )}
                </div>
              </div>

              {overall != null && (
                <div className="text-right shrink-0">
                  <div className="font-logo text-3xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>{overall}</div>
                  {topPctLabel && (
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>top {topPctLabel}</div>
                  )}
                </div>
              )}
            </div>

            {isSmallSample && (
              <div className="mt-3 px-3 py-1.5 rounded text-[11px]"
                style={{ background: "rgba(255,177,27,.10)", color: "#FFB11B", border: "1px solid rgba(255,177,27,.25)" }}>
                ⚠ Small sample ({gp} games) — scores may be unstable
              </div>
            )}
          </div>

          {/* Radar */}
          <Section title="Archetype Radar">
            <RadarProfile scores={detail.scores} name={name} primaryArch={arch} margin={detail.confidence_margin || 0} />
          </Section>

          {/* Stats */}
          {(pts || reb || ast || gp || bpm) && (
            <Section title="Season Stats (2025-26)">
              <div className="grid grid-cols-5 gap-2">
                {[["PTS", pts], ["REB", reb], ["AST", ast], ["GP", gp != null ? String(gp) : null], ["BPM", bpm]].map(([label, val]) =>
                  val != null ? (
                    <div key={label} className="text-center p-2 rounded"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{val}</div>
                      <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: "var(--text-faint)" }}>{label}</div>
                    </div>
                  ) : null
                )}
              </div>
            </Section>
          )}

          {/* Core scores */}
          <Section title="Core Archetype Scores">
            <div className="space-y-1">
              {CORE.map(c => (
                <ScoreBar key={c} label={c} value={detail.scores?.[c] || 0} highlight={c === arch} margin={detail.confidence_margin || 0} />
              ))}
            </div>
          </Section>

          {/* Modifiers */}
          {detail.active_modifiers?.length > 0 && (
            <Section title="Active Modifiers">
              <div className="flex flex-wrap gap-2">
                {detail.active_modifiers.map(m => (
                  <span key={m} className="text-xs px-2.5 py-1 rounded font-medium"
                    style={{ background: "rgba(255,177,27,.12)", color: "#FFB11B", border: "1px solid rgba(255,177,27,.3)" }}>
                    {m}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Career */}
          {career && career.length >= 2 && (
            <Section title="Career Timeline">
              <CareerChart seasons={career} />
            </Section>
          )}

          {/* Similar */}
          {similar.length > 0 && (
            <Section title="Similar Players">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {similar.map((p, i) => (
                  <div key={p.name} className="cursor-pointer" onClick={() => navigate(`/players/${encodeURIComponent(p.name)}`)}>
                    <div className="flex items-center justify-between p-3 rounded transition-colors"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-border)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                      <div>
                        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {p.team}{p.primary_arch ? ` · ${p.primary_arch}` : ""}
                        </div>
                      </div>
                      <div className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                        {Math.round((p.similarity || 0) * 100)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      </div>

      {/* Flag archetype modal */}
      {flagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={e => { if (e.target === e.currentTarget) setFlagOpen(false); }}>
          <div className="w-full max-w-sm p-5 rounded-lg space-y-4"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Flag Archetype
              </h3>
              <button onClick={() => setFlagOpen(false)} style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            <div className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
              <div>Current: <span style={{ color: "var(--accent)" }}>{arch}</span></div>
              <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                Suggest a correction — an admin will review before it's applied.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px]" style={{ color: "var(--text-muted)" }}>Suggested archetype</label>
              <select value={flagArch} onChange={e => setFlagArch(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <option value="">— select —</option>
                {CORE.filter(a => a !== arch).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px]" style={{ color: "var(--text-muted)" }}>Note (optional)</label>
              <textarea value={flagNote} onChange={e => setFlagNote(e.target.value)}
                rows={2} placeholder="Why do you think this is wrong?"
                className="w-full px-3 py-2 rounded text-xs resize-none"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>

            {flagStatus === "ok" && (
              <div className="text-xs text-center py-1" style={{ color: "#4ade80" }}>
                ✓ Submitted — thanks for the feedback!
              </div>
            )}
            {flagStatus === "err" && (
              <div className="text-xs text-center py-1" style={{ color: "#f87171" }}>
                Failed to submit. Please try again.
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setFlagOpen(false)}
                className="text-xs px-3 py-1.5 rounded"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                Cancel
              </button>
              <button
                disabled={!flagArch || flagStatus === "sending" || flagStatus === "ok"}
                onClick={async () => {
                  if (!flagArch) return;
                  setFlagStatus("sending");
                  try {
                    const res = await fetch("/api/corrections", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({
                        player_name: name,
                        season: detail?.season || "2025-26",
                        current_arch: arch,
                        suggested_arch: flagArch,
                        note: flagNote,
                      }),
                    });
                    setFlagStatus(res.ok ? "ok" : "err");
                    if (res.ok) setTimeout(() => setFlagOpen(false), 1500);
                  } catch {
                    setFlagStatus("err");
                  }
                }}
                className="text-xs px-3 py-1.5 rounded font-medium"
                style={{ background: flagArch ? "var(--accent)" : "var(--border)", color: flagArch ? "#000" : "var(--text-faint)" }}>
                {flagStatus === "sending" ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
