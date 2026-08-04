import { CoachIcon, TrophyIcon, BoltIcon, ShieldIcon } from "./GameIcons";
import "./game.css";

// ── Koç seçimi ────────────────────────────────────────────────────────────
// Same Screen ve With a Friend paylaşıyor. Eskiden düz bir liste kutusuydu;
// artık draft'ın son kararı gibi duruyor: her koç kendi rengini notundan
// alıyor (hücum mu savunma mı iyi?), yüzükler afişte, ring sayısı kadar
// güçlü bir aura.

// A+..F → 0-1. Renk ve bar buradan türüyor, elle hex yazılmıyor.
const GRADE_VAL = {
  "A+": 1.00, A: 0.92, "A-": 0.85, "B+": 0.78, B: 0.70, "B-": 0.63,
  "C+": 0.56, C: 0.48, "C-": 0.41, "D+": 0.34, D: 0.27, "D-": 0.20, F: 0.10,
};
const gv = (g) => GRADE_VAL[g] ?? 0.5;
const VAL_HEX = (v) => v >= 0.85 ? "#4ade80" : v >= 0.70 ? "#facc15" : v >= 0.50 ? "#fb923c" : "#f87171";

// Koçun kimliği: hangi tarafı daha güçlü? Kartın accent'i bu.
function identity(c) {
  const o = gv(c.off), d = gv(c.def);
  if (c.tag === "OFF GURU" || o - d >= 0.12) return { hex: "#fb923c", label: "Offense", Icon: BoltIcon };
  if (c.tag === "DEF GURU" || d - o >= 0.12) return { hex: "#60a5fa", label: "Defense", Icon: ShieldIcon };
  return { hex: "#c084fc", label: "Balanced", Icon: CoachIcon };
}

function CoachCard({ coach, onPick, disabled }) {
  const { hex, label, Icon } = identity(coach);
  const o = gv(coach.off), d = gv(coach.def);
  // Yüzük sayısı auranın gücünü belirliyor — playoff DNA'sı görünür olsun.
  const ringGlow = Math.min(0.34, 0.10 + coach.champs * 0.035);

  return (
    <button onClick={() => !disabled && onPick(coach)} disabled={disabled}
      className="g-tile text-left"
      style={{ "--accent": hex, "--accent-a": hex + "1a", "--accent-line": hex + "4d", padding: "13px 14px" }}>
      <span className="aura-blob" style={{
        "--slot-color": hex, right: -24, top: -26, width: 132, height: 88, opacity: ringGlow,
      }} />

      <div className="flex items-start gap-2.5">
        <span className="shrink-0 mt-0.5" style={{ color: hex }}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-logo text-[13.5px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {coach.name}
          </div>
          <div className="g-mono mt-0.5" style={{ color: "var(--text-faint)" }}>{coach.years} · {label}</div>
        </div>
        {coach.champs > 0 && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10.5px] font-bold tabular-nums"
            style={{ color: "var(--yamabuki)" }} title={`${coach.champs} championship${coach.champs === 1 ? "" : "s"} — playoff DNA bonus`}>
            <TrophyIcon size={11} />×{coach.champs}
          </span>
        )}
      </div>

      {/* Notlar bar olarak — iki koçu yan yana karşılaştırmak sayıdan kolay */}
      <div className="mt-2.5 space-y-1.5">
        {[["OFF", coach.off, o], ["DEF", coach.def, d]].map(([k, g, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="g-mono w-6 shrink-0" style={{ color: "var(--text-faint)" }}>{k}</span>
            <div className="g-bar-track flex-1" style={{ height: 6 }}>
              <div className="g-bar-fill" style={{ width: `${v * 100}%`, "--fill": VAL_HEX(v), "--fill-a": VAL_HEX(v) + "66" }} />
            </div>
            <span className="font-logo text-[11px] font-bold w-5 text-right shrink-0" style={{ color: VAL_HEX(v) }}>{g}</span>
          </div>
        ))}
      </div>

      {coach.tag && (
        <div className="mt-2.5 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <span className="g-status" style={{ "--accent": hex, "--accent-a": hex + "1a", "--accent-line": hex + "55" }}>
            {coach.tag}
          </span>
        </div>
      )}
    </button>
  );
}

export default function CoachPicker({ title, subtitle, options, onPick, waitingFor = null }) {
  return (
    <div className="g-panel p-5 max-w-3xl mx-auto">
      <span className="aura-blob" style={{ "--slot-color": "#c084fc", left: "12%", top: -50, width: 260, height: 140, opacity: 0.18 }} />

      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="g-label">
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#c084fc" }} />
          {title}
        </div>
        <span className="g-status" style={{ "--accent": "#c084fc", "--accent-a": "rgba(192,132,252,.12)", "--accent-line": "rgba(192,132,252,.4)" }}>
          Final Call
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
        {subtitle || <>Offense and Defense grades shift your team rating all season. Rings add playoff DNA — the more titles, the bigger the edge once the postseason starts.</>}
      </p>

      {waitingFor ? (
        <p className="text-sm text-center animate-pulse py-8" style={{ color: "var(--text-muted)" }}>
          Waiting for {waitingFor} to hire a coach…
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {options.map(c => <CoachCard key={c.name} coach={c} onPick={onPick} />)}
        </div>
      )}
    </div>
  );
}
