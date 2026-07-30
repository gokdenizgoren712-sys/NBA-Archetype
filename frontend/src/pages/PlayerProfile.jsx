import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { SEO } from "../hooks/useSEO";
import PlayerCard from "../components/PlayerCard";
import { useAuth } from "../contexts/AuthContext";
import { FlagIcon } from "../components/BrandIcons";

const CORE = ["Engine","Ecosystem","Hub","Connector","Creator","Anchor","Spacer","Finisher","Force","Initiator","Stopper","Rim Runner"];

export default function PlayerProfile() {
  const { name: rawName } = useParams();
  const navigate = useNavigate();
  const name = decodeURIComponent(rawName || "");

  const { isLoggedIn, token } = useAuth();
  const [detail, setDetail] = useState(null);
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
    api.playerScores(name)
      .then(d => setDetail(d))
      .catch(() => setNotFound(true))
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
  const pts = detail?.pts != null ? Number(detail.pts) : null;
  const reb = detail?.reb != null ? Number(detail.reb) : null;
  const ast = detail?.ast != null ? Number(detail.ast) : null;
  const gp  = detail?.gp  ?? detail?.GP ?? null;

  const seoDesc = detail
    ? `${name} (${arch})${pts != null ? `: ${pts.toFixed(1)} PTS · ${reb.toFixed(1)} REB · ${ast.toFixed(1)} AST` : ""}${detail.overall_score != null ? ` · Overall: ${Math.round(detail.overall_score * 100)}` : ""}. Radar profile, career timeline, and similar players.`
    : `${name} — Primary Arch profile.`;

  const cardPlayer = detail ? {
    PLAYER_NAME: name,
    TEAM_ABBREVIATION: detail.team,
    POSITION: detail.pos5,
    primary_arch: arch,
    overall_score: detail.overall_score,
    overall_pct: detail.overall_pct,
    PTS: pts, REB: reb, AST: ast, GP: gp,
  } : null;

  if (loading) return (
    <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      Loading...
    </div>
  );

  if (notFound || !detail) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>Player not found: {name}</div>
      <button onClick={() => navigate("/players")} className="aura-pill-btn active">← Back to Players</button>
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
        <div className="max-w-md mx-auto px-4 py-6 pb-16 space-y-5">

          {/* Top bar — bare, no boxes */}
          <div className="flex items-center justify-between">
            <button onClick={() => navigate("/players")}
              className="aura-pill-btn" style={{ paddingLeft: 8 }}>
              ← Players
            </button>
            <div className="flex items-center gap-1">
              {isLoggedIn && arch && (
                <button
                  onClick={() => { setFlagOpen(true); setFlagArch(""); setFlagNote(""); setFlagStatus(null); }}
                  className="aura-pill-btn" title="Flag incorrect archetype">
                  <FlagIcon size={11} /> Flag
                </button>
              )}
              <button onClick={share} className={`aura-pill-btn${copied ? " active" : ""}`}>
                {copied ? "Copied!" : "Share ↗"}
              </button>
            </div>
          </div>

          {/* Hero — the card itself, opened by default. This replaces every
              separate Radar/Scores/Modifiers/Career/Similar box the page used
              to duplicate; the expandable card already covers all of it. */}
          <div className="flex justify-center">
            <PlayerCard player={cardPlayer} expandable defaultExpanded />
          </div>

        </div>
      </div>

      {/* Flag archetype modal */}
      {flagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={e => { if (e.target === e.currentTarget) setFlagOpen(false); }}>
          <div className="aura-glass w-full max-w-sm p-5 rounded-2xl space-y-4">
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
              <div className="aura-select-wrap" style={{ width: "100%" }}>
                <select value={flagArch} onChange={e => setFlagArch(e.target.value)}
                  className="aura-select" style={{ width: "100%" }}>
                  <option value="">— select —</option>
                  {CORE.filter(a => a !== arch).map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px]" style={{ color: "var(--text-muted)" }}>Note (optional)</label>
              <textarea value={flagNote} onChange={e => setFlagNote(e.target.value)}
                rows={2} placeholder="Why do you think this is wrong?"
                className="aura-ghost-input w-full resize-none" />
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
              <button onClick={() => setFlagOpen(false)} className="aura-pill-btn">
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
                className="text-xs px-3 py-1.5 rounded-full font-medium"
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
