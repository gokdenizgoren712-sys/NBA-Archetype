// ── Idle ekranda çark alt-modu seçimi: Round-Based / Pick-Based ─────────────
// Same Screen ve With a Friend arasında paylaşılır — içerik sabit, value/
// onChange dışarıdan geliyor.
import { WheelIcon, LoopIcon } from "./GameIcons";

export default function WheelModePicker({ value, onChange, disabled = false }) {
  return (
    <>
      <div className="text-[10.5px] text-gray-500 uppercase tracking-widest font-logo px-0.5">Wheel Mode</div>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={disabled} onClick={() => onChange("round")}
          className={`text-left rounded-xl border p-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed
            ${value === "round" ? "border-brandBlue bg-brandBlue/10 shadow-[0_0_15px_rgba(29,66,138,0.15)]" : "border-gray-800 bg-surfaceCard hover:border-gray-700"}`}>
          <div className="font-logo text-base font-bold text-white flex items-center gap-1.5"><span className="text-brandBlue"><WheelIcon size={15} /></span> Round-Based</div>
          <div className="text-[11px] text-gray-400 mt-1 leading-snug">The wheel spins once per round. Both players draft from that same team, in snake order.</div>
        </button>
        <button disabled={disabled} onClick={() => onChange("pick")}
          className={`text-left rounded-xl border p-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed
            ${value === "pick" ? "border-yamabuki bg-yamabuki/10 shadow-[0_0_15px_rgba(255,177,27,0.15)]" : "border-gray-800 bg-surfaceCard hover:border-gray-700"}`}>
          <div className="font-logo text-base font-bold text-white flex items-center gap-1.5"><span className="text-yamabuki"><LoopIcon size={15} /></span> Pick-Based</div>
          <div className="text-[11px] text-gray-400 mt-1 leading-snug">The wheel spins again before every single pick — each player gets their own fresh team.</div>
        </button>
      </div>
    </>
  );
}
