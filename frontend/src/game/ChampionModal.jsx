// ── Rewrite History: Şampiyon pop-up'ı ───────────────────────────────────────
// bracket.champion set edilince otomatik açılır (bkz. PlayoffBracketView.jsx).
// Mevcut modal deseniyle tutarlı (PlayerDetailModal/CoachPicker) — sabit
// overlay + kapatılabilir kart.
import { TrophyIcon, CrownIcon } from "./GameIcons";

export default function ChampionModal({ champion, season, finalsMVP, onClose }) {
  if (!champion) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.7)" }} onClick={onClose}>
      <div className="g-panel p-6 max-w-sm w-full text-center space-y-3" style={{ "--accent": "#FFB11B", "--accent-a": "rgba(255,177,27,.12)", "--accent-line": "rgba(255,177,27,.4)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center">
          <span className="inline-flex items-center justify-center rounded-full p-4" style={{ background: "rgba(255,177,27,.15)", boxShadow: "0 0 40px -8px rgba(255,177,27,.6)" }}>
            <CrownIcon size={40} />
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{season} NBA Champions</div>
        <div className="text-2xl font-black" style={{ color: "var(--yamabuki)" }}>{champion.abbr}</div>
        {finalsMVP && (
          <div className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <div className="text-[9.5px] uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Finals MVP</div>
            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
              <TrophyIcon size={14} /> {finalsMVP.name} <span style={{ color: "var(--text-faint)" }}>({finalsMVP.abbr})</span>
            </div>
          </div>
        )}
        <button onClick={onClose}
          className="mt-2 w-full py-2 rounded-lg text-[10.5px] font-bold uppercase tracking-wide"
          style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
          Close
        </button>
      </div>
    </div>
  );
}
