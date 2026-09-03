import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { CheckIcon, WarnIcon } from "../../game/GameIcons";
import "../../game/game.css";
import { ACCENT } from "../../game/football/theme";

// ── Futbol arketip sözlüğü geri bildirimi ────────────────────────────────────
// Futbol tarafında henüz oyuncu verisi yok, o yüzden basketboldaki
// "bu oyuncunun etiketi yanlış" akışı (tag_corrections) burada işlemiyor —
// tartışılan şey sözlüğün KENDİSİ: bir arketibin adı ya da eksik bir arketip.
// Giriş zorunlu (kullanıcı kararı), backend de get_current_user ile bunu şart koşuyor.

const PHASES = [
  { key: "gk",  label: "Goalkeeper", roles: ["Shot Stopper", "Sweeper Keeper", "Distributor", "Command of Area"] },
  { key: "def", label: "Defence",    roles: ["Ball-Playing CB", "Stopper", "Front-Foot Defender", "Overlapping FB", "Inverted FB", "Wing-Back", "Defensive FB"] },
  { key: "mid", label: "Midfield",   roles: ["Anchor", "Ball-Winner", "Regista", "Metronome", "Box-to-Box", "Mezzala", "Late Runner"] },
  { key: "fwd", label: "Attack",     roles: ["Poacher", "Target Man", "Complete Forward", "Pressing Forward", "Inside Forward", "Touchline Winger", "Take-On Merchant", "Creator"] },
];

const KINDS = [
  { key: "add",    label: "Missing archetype", hint: "A role we haven't covered" },
  { key: "rename", label: "Rename one",        hint: "The name doesn't fit the role" },
  { key: "other",  label: "Something else",    hint: "Anything about the dictionary" },
];

export default function FootballFeedbackModal({ onClose }) {
  const { isLoggedIn, token } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("def");
  const [kind, setKind] = useState("add");
  const [archetype, setArchetype] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const roles = PHASES.find(p => p.key === phase)?.roles || [];

  const submit = async () => {
    setError("");
    if (suggestion.trim().length < 2) { setError("Type your suggestion first."); return; }
    if (kind === "rename" && !archetype) { setError("Pick which archetype you'd rename."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/football/archetype-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phase, kind,
          archetype: kind === "rename" ? archetype : null,
          suggestion: suggestion.trim(),
          note: note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not send that — try again.");
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = {
    background: "var(--bg-surface)", color: "var(--text-primary)",
    border: "1px solid var(--border)", borderRadius: 8,
    padding: "8px 10px", fontSize: 13, width: "100%", outline: "none",
  };

  return (
    <div className="g-modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520, "--accent": ACCENT, "--accent-a": ACCENT + "1f", "--accent-line": ACCENT + "55" }}>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-logo text-lg font-bold text-white">Shape the dictionary</h2>
            <p className="text-[11.5px] mt-1" style={{ color: "var(--text-muted)" }}>
              These archetypes aren't final. Tell us what's missing or what's named wrong.
            </p>
          </div>
          <button onClick={onClose} className="nav-drawer-close" aria-label="Close">×</button>
        </div>

        {done ? (
          <div className="text-center py-8 space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full"
              style={{ color: ACCENT, background: ACCENT + "1a", border: `1px solid ${ACCENT}55` }}>
              <CheckIcon size={22} />
            </div>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>Thanks — that's logged.</p>
            <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              Every suggestion is read before the dictionary is locked in.
            </p>
            <button onClick={onClose} className="aura-pill-btn" style={{ padding: "8px 20px" }}>Close</button>
          </div>
        ) : !isLoggedIn ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>Log in to send feedback</p>
            <p className="text-[11.5px] max-w-xs mx-auto" style={{ color: "var(--text-muted)" }}>
              We keep suggestions tied to an account so we can follow up on the good ones.
            </p>
            <button onClick={() => navigate("/login")} className="aura-rating-btn"
              style={{ padding: "10px 24px", fontSize: 13 }}>Log In</button>
          </div>
        ) : (
          <div className="space-y-3.5 mt-4">

            <div>
              <div className="g-label mb-1.5">Phase</div>
              <div className="grid grid-cols-4 gap-1.5">
                {PHASES.map(p => (
                  <button key={p.key}
                    onClick={() => { setPhase(p.key); setArchetype(""); }}
                    className="py-1.5 rounded-[8px] text-[11px] font-semibold transition-colors"
                    style={{
                      background: phase === p.key ? ACCENT + "24" : "var(--bg-surface)",
                      color: phase === p.key ? ACCENT : "var(--text-muted)",
                      border: `1px solid ${phase === p.key ? ACCENT + "66" : "var(--border)"}`,
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="g-label mb-1.5">What's the feedback?</div>
              <div className="grid grid-cols-3 gap-1.5">
                {KINDS.map(k => (
                  <button key={k.key} onClick={() => setKind(k.key)} title={k.hint}
                    className="py-1.5 px-2 rounded-[8px] text-[11px] font-semibold transition-colors"
                    style={{
                      background: kind === k.key ? ACCENT + "24" : "var(--bg-surface)",
                      color: kind === k.key ? ACCENT : "var(--text-muted)",
                      border: `1px solid ${kind === k.key ? ACCENT + "66" : "var(--border)"}`,
                    }}>
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            {kind === "rename" && (
              <div>
                <div className="g-label mb-1.5">Which archetype?</div>
                <select value={archetype} onChange={e => setArchetype(e.target.value)} style={field}>
                  <option value="">Pick one…</option>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            <div>
              <div className="g-label mb-1.5">
                {kind === "rename" ? "Better name" : kind === "add" ? "Archetype name" : "Your suggestion"}
              </div>
              <input value={suggestion} onChange={e => setSuggestion(e.target.value)}
                maxLength={120} style={field}
                placeholder={kind === "add" ? "e.g. Half-Space Runner" : kind === "rename" ? "e.g. Libero" : "In a few words…"} />
            </div>

            <div>
              <div className="g-label mb-1.5">Why? <span style={{ color: "var(--text-faint)" }}>optional</span></div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={600}
                style={{ ...field, resize: "vertical" }}
                placeholder="Which players would fit it, what it captures that the others miss…" />
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "#f87171" }}>
                <WarnIcon size={13} /> {error}
              </div>
            )}

            <button onClick={submit} disabled={saving} className="aura-rating-btn w-full"
              style={{ padding: "11px", fontSize: 13, letterSpacing: ".1em", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Sending…" : "Send feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
