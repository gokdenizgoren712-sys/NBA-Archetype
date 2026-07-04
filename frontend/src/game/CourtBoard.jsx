// ── Yarım saha görünümü (v3.5 Faz 2.5) ───────────────────────────────────────
// Split-pane'in sağ tarafı: 5 starter yarım saha üzerinde, 4 bench altta.
// Slot tıklama ile oyuncular oyun boyunca yer değiştirebilir (move/swap).

import { benchCoverage } from "./seasonSim";

const POSITIONS   = ["PG", "SG", "SF", "PF", "C"];
const BENCH_SLOTS = ["B1", "B2", "B3", "B4"];

// Yarım saha üzerindeki slot konumları (%)
const SPOT = {
  PG: { left: "50%", top: "82%" },
  SG: { left: "80%", top: "62%" },
  SF: { left: "20%", top: "62%" },
  PF: { left: "30%", top: "34%" },
  C:  { left: "63%", top: "26%" },
};

const POS_RING = {
  PG: "#3b82f6", SG: "#0ea5e9", SF: "#10b981", PF: "#f59e0b", C: "#ef4444",
};

function CourtSpot({ pos, player, isPrimary, selected, canTap, onTap }) {
  const pen = player?._posPenalty ?? 1;
  return (
    <button
      onClick={() => canTap && onTap(pos)}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group"
      style={{ left: SPOT[pos].left, top: SPOT[pos].top, cursor: canTap ? "pointer" : "default" }}>
      <div
        className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center transition-all
          ${selected ? "scale-110 shadow-lg" : player ? "group-hover:scale-105" : ""}`}
        style={{
          borderColor: selected ? "#facc15" : player ? POS_RING[pos] : "#334155",
          borderStyle: player ? "solid" : "dashed",
          background: player ? "rgba(2,8,23,0.92)" : "rgba(2,8,23,0.55)",
          boxShadow: selected ? "0 0 14px rgba(250,204,21,.45)" : "none",
        }}>
        {player ? (
          <>
            <span className="text-[10px] font-bold text-white leading-none max-w-[3.2rem] truncate px-0.5">
              {player.PLAYER_NAME?.split(" ").slice(-1)[0]}
            </span>
            <span className="text-[8px] text-slate-500 leading-none mt-0.5">{(player._season || "").slice(0, 4)}</span>
            {pen < 1 && <span className="text-[7.5px] text-red-400 leading-none mt-0.5">{pen <= 0.75 ? "−25%" : "−10%"}</span>}
          </>
        ) : (
          <span className="text-[11px] font-bold" style={{ color: POS_RING[pos] }}>{pos}</span>
        )}
      </div>
      <span className="text-[8.5px] mt-1 font-semibold tracking-wide"
        style={{ color: player ? POS_RING[pos] : "#475569" }}>
        {pos}{isPrimary ? " ⭐" : ""}
      </span>
    </button>
  );
}

export default function CourtBoard({ lineup, coach, moveSrc, canRearrange, onSlotTap, getPrimaryPos }) {
  const bench = BENCH_SLOTS.map(b => lineup[b]).filter(Boolean);
  const cover = benchCoverage(bench);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 select-none">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] text-slate-600 uppercase tracking-widest">Your Roster</div>
        {canRearrange ? (
          <span className="text-[9.5px] text-slate-500">
            {moveSrc ? "Now tap a destination slot (occupied = swap)" : "Tap a player, then a slot to move / swap"}
          </span>
        ) : (
          <span className="text-[9.5px] text-slate-700">rearranging locked</span>
        )}
      </div>

      {/* Yarım saha */}
      <div className="relative w-full" style={{ aspectRatio: "10/9" }}>
        <svg viewBox="0 0 400 360" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {/* Zemin çizgileri */}
          <rect x="6" y="6" width="388" height="348" rx="8" fill="none" stroke="#1e293b" strokeWidth="2" />
          {/* Pota + backboard */}
          <line x1="176" y1="26" x2="224" y2="26" stroke="#475569" strokeWidth="3" />
          <circle cx="200" cy="38" r="9" fill="none" stroke="#C8102E" strokeWidth="2.5" />
          {/* Boyalı alan */}
          <rect x="140" y="6" width="120" height="140" fill="rgba(29,66,138,0.07)" stroke="#1e293b" strokeWidth="2" />
          <circle cx="200" cy="146" r="44" fill="none" stroke="#1e293b" strokeWidth="2" />
          {/* 3 sayı çizgisi */}
          <path d="M 26 6 L 26 90 A 174 174 0 0 0 374 90 L 374 6" fill="none" stroke="#1e293b" strokeWidth="2" />
          {/* Yarı saha çizgisi + orta yuvarlak */}
          <line x1="6" y1="354" x2="394" y2="354" stroke="#1e293b" strokeWidth="2" />
          <path d="M 156 354 A 44 44 0 0 1 244 354" fill="none" stroke="#1e293b" strokeWidth="2" />
        </svg>

        {POSITIONS.map(pos => (
          <CourtSpot key={pos} pos={pos} player={lineup[pos]}
            isPrimary={!!lineup[pos] && getPrimaryPos(lineup[pos]) === pos}
            selected={moveSrc === pos}
            canTap={canRearrange && (!!lineup[pos] || !!moveSrc)}
            onTap={onSlotTap} />
        ))}
      </div>

      {/* Bench */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[9.5px] text-slate-600 uppercase tracking-widest">Bench · 22% load</div>
          <div className="flex items-center gap-1" title="Bench with a Guard, Forward AND Center earns a small buff">
            {["G", "F", "C"].map(g => (
              <span key={g} className={`text-[8.5px] w-4 h-4 rounded flex items-center justify-center border font-bold
                ${cover[g] ? "border-emerald-600 text-emerald-400 bg-emerald-950/40" : "border-slate-800 text-slate-700"}`}>
                {g}
              </span>
            ))}
            {cover.balanced && <span className="text-[8.5px] text-emerald-400 ml-0.5">+buff</span>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BENCH_SLOTS.map(b => {
            const p = lineup[b];
            const selected = moveSrc === b;
            return (
              <button key={b}
                onClick={() => canRearrange && (p || moveSrc) && onSlotTap(b)}
                className={`rounded-lg border p-1.5 text-center min-w-0 transition-all
                  ${selected ? "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,.35)]"
                             : p ? "border-slate-600/60 bg-slate-800/40 hover:border-slate-500"
                                 : "border-dashed border-slate-800 bg-slate-900/50"}`}
                style={{ cursor: canRearrange && (p || moveSrc) ? "pointer" : "default" }}>
                <div className="text-[8px] uppercase tracking-wider text-slate-600 mb-0.5">{b}</div>
                {p ? (
                  <>
                    <div className="text-[10px] text-white font-semibold truncate leading-tight">
                      {p.PLAYER_NAME?.split(" ").slice(-1)[0]}
                    </div>
                    <div className="text-[8px] text-slate-500">{(p._season || "").slice(0, 4)}</div>
                  </>
                ) : (
                  <div className="text-slate-700 text-xs py-0.5">—</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Koç */}
      {coach && (
        <div className="flex items-center gap-2 border-t border-slate-800 pt-2">
          <span className="text-sm">🧠</span>
          <span className="text-xs text-white font-medium flex-1 truncate">{coach.name}</span>
          <span className="text-[9.5px] font-mono text-slate-400">O:{coach.off} D:{coach.def}</span>
          {coach.champs > 0 && <span className="text-[9.5px] text-yellow-400">🏆×{coach.champs}</span>}
        </div>
      )}
    </div>
  );
}
