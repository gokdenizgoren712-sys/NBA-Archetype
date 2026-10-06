// Tasarım 1 — Fantezi ana sayfası: ligi kur, planı al; kayıtlı ligler ve draftlar.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PaIcon from "../../components/shell/PaIcon";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { FORMATS, useFantasy } from "./useFantasy";

function daysUntil(iso) {
  if (!iso) return null;
  const d = Math.ceil((new Date(`${iso}T00:00:00`) - new Date()) / 864e5);
  return d;
}

function openingLabel(iso) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const KIND_GROUPS = [["league", "Your leagues"], ["mock", "Mock drafts"], ["assistant", "Assistant drafts"]];

export default function FantasyHome() {
  const f = useFantasy();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { setSaved(null); return; }
    fz.drafts.list().then((d) => setSaved(d.drafts || [])).catch(() => setSaved([]));
  }, [isLoggedIn]);

  const days = daysUntil(f.meta?.opening_night);
  const go = (path) => navigate(`/basketball/fantasy${path}`);
  const shortcuts = [
    { t: "Rankings", d: "Format-correct values, tiers, punt builds.", m: f.meta ? `${f.meta.players} players` : "", to: "/rankings" },
    { t: "Draft plan", d: "Your pick numbers and three builds for your slot.", m: `Slot ${f.s} of ${f.t}`, to: "/draft-plan" },
    { t: "Mock draft", d: `Draft against ${f.t - 1} bots with different styles.`, m: `${f.rosterSize} rounds`, to: "/mock" },
    { t: "Draft assistant", d: "Track a real draft on your phone, one hand.", m: "Taken · Mine · Undo", to: "/assistant" },
    { t: "Schedule", d: "Games per week, back-to-backs, playoff weeks 20–22.", m: f.meta ? `${f.meta.weeks} weeks` : "", to: "/schedule" },
  ];

  return (
    <>
      <SEO title="Basketball fantasy" description="Rankings, draft plans and mock drafts built for your exact Yahoo league format." path="/basketball/fantasy" />
      <div className="fz-page">
        <div className="fz-two">
          <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
            <div className="fz-head">
              <div className="fz-head-l">
                <p className="pa-eyebrow">Fantasy · 2026-27 season</p>
        <h1 className="fz-h1">Basketball fantasy</h1>
                <span className="fz-sub" style={{ fontSize: 15 }}>
                  <span className="fz-desk-only">Rankings, draft plans and mock drafts built for your exact league format.</span>
                  <span className="fz-phone-only">
                    {days != null && days > 0 ? <>Opening night in <b style={{ color: "#e5e5e5", fontWeight: 600 }}>{days} days</b> · {openingLabel(f.meta?.opening_night)}</> : "The season is on."}
                  </span>
                </span>
              </div>
              {days != null && days > 0 && (
                <div className="fz-desk-only" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span className="fz-meta">Opening night · {openingLabel(f.meta?.opening_night)}</span>
                  <span className="fz-num" style={{ fontSize: 40, lineHeight: 1 }}>{days} <span style={{ fontSize: 18, color: "#8a8a8a" }}>days</span></span>
                </div>
              )}
            </div>

            <div className="fz-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
              <span className="fz-h2">Set up your league</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span className="fz-sub" style={{ fontSize: 13 }}>Format</span>
                <div className="fz-seg dark lg" style={{ flexWrap: "wrap" }}>
                  {FORMATS.map((o) => (
                    <button key={o.k} className={!f.isCustom && f.f === o.k ? "on" : ""} onClick={() => f.set({ f: o.k })}>{o.label}</button>
                  ))}
                  <button className={f.isCustom ? "on" : ""} onClick={f.openSettings}>{f.isCustom ? f.fmtInfo.label : "Custom…"}</button>
                </div>
                <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{f.fmtInfo.d}</span>
              </div>
              <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span className="fz-sub" style={{ fontSize: 13 }}>Teams</span>
                  <div className="fz-stepper">
                    <button aria-label="Fewer teams" disabled={f.t <= 6} onClick={() => f.set({ t: f.t - 1 })}>−</button>
                    <span className="v">{f.t}</span>
                    <button aria-label="More teams" disabled={f.t >= 16} onClick={() => f.set({ t: f.t + 1 })}>+</button>
                  </div>
                  <span className="fz-meta">6–16</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
                  <span className="fz-sub" style={{ fontSize: 13 }}>Your draft slot</span>
                  <div className="fz-slots">
                    {Array.from({ length: f.t }, (_, i) => i + 1).map((n) => (
                      <button key={n} className={n === f.s ? "on" : ""} aria-pressed={n === f.s} onClick={() => f.set({ s: n })}>{n}</button>
                    ))}
                  </div>
                  <span className="fz-meta">Snake · your picks <span style={{ color: "#e5e5e5" }}>{f.picks.slice(0, 5).join(", ")}…</span></span>
                </div>
              </div>
              <div className="fz-desk-only" style={{ display: "flex", gap: 10 }}>
                <button className="fz-gold" onClick={() => go("/draft-plan")}>Get my draft plan</button>
                <button className="fz-btn lg" onClick={() => go("/mock")}>Start a mock draft</button>
              </div>
            </div>

            <div className="fz-desk-only fz-steps">
              {shortcuts.map((s, i) => (
                <button key={s.t} onClick={() => go(s.to)} className="fz-step">
                  <b className="n">{String(i + 1).padStart(2, "0")}</b>
                  <span className="fz-h3">{s.t}</span>
                  <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45, flex: 1 }}>{s.d}</span>
                  <span className="fz-meta">{s.m}</span>
                </button>
              ))}
            </div>
            <div className="fz-phone-only" style={{ display: "flex", flexDirection: "column" }}>
              {shortcuts.map((s) => (
                <button key={s.t} onClick={() => go(s.to)} className="fz-row"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 60,
                           border: 0, background: "none", color: "inherit", textAlign: "left", padding: 0 }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="fz-d" style={{ fontSize: 17 }}>{s.t}</span>
                    <span className="fz-sub" style={{ fontSize: 13 }}>{s.d}</span>
                  </span>
                  <span style={{ transform: "rotate(-90deg)", display: "flex" }}><PaIcon name="chevron" size={16} color="#8a8a8a" /></span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {!isLoggedIn ? (
              <div className="fz-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Save leagues and drafts</span>
                <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>Sign in to keep your league settings, mock drafts and assistant drafts across devices.</span>
                <button className="fz-btn" onClick={() => navigate("/login")}>Sign in</button>
              </div>
            ) : KIND_GROUPS.map(([kind, title]) => {
              const rows = (saved || []).filter((d) => d.kind === kind).slice(0, 3);
              return (
                <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 6 }}>
                    <span className="fz-h3">{title}</span>
                    <button className="fz-link" onClick={() => go(`/saved?tab=${kind}`)}>View all</button>
                  </div>
                  {saved == null && <span className="fz-skel" style={{ height: 40 }} />}
                  {rows.map((r) => (
                    <button key={r.id} className="fz-row" onClick={() => go(`/saved?open=${r.id}`)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minHeight: 56,
                               border: 0, background: "none", color: "inherit", textAlign: "left", padding: 0, cursor: "pointer" }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</span>
                        <span className="fz-meta">{r.format_label || "Custom"} · {r.teams} teams{r.slot ? ` · slot ${r.slot}` : ""}</span>
                      </span>
                      <span className="fz-num" style={{ fontSize: 16, flexShrink: 0 }}>{r.grade || new Date(r.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </button>
                  ))}
                  {saved && rows.length === 0 && (
                    <span className="fz-sub" style={{ fontSize: 13, padding: "10px 0" }}>
                      {kind === "league" ? "No saved leagues yet. Save one from League settings." : kind === "mock" ? "No mock drafts yet." : "No assistant drafts yet."}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="fz-pinned"><button className="fz-gold" onClick={() => go("/draft-plan")}>Get my draft plan</button></div>
    </>
  );
}
