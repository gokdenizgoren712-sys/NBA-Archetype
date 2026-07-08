// ── Yarım saha görünümü (v3.11) ──────────────────────────────────────────────
// Split-pane'in sağ tarafı: 5 starter yarım sahada, 4 bench SAĞDA dikey.
// İki mod:
//   • rearrange: dolu slot'a tıkla → seç, sonra hedef slot → move/swap.
//   • placing (pick_pos): boş court/bench slot'una tıklayınca oyuncu yerleşir
//     (desktop). Mobilde court yok → LineupGame'deki pozisyon butonları kullanılır.

import { benchCoverage } from "./seasonSim";
import { StarIcon, CoachIcon, TrophyIcon } from "./GameIcons";

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

function CourtSpot({ pos, player, isPrimary, selected, canTap, onTap, placing, open, eligible, penalty }) {
  const pen = player?._posPenalty ?? 1;
  // Yerleştirme modunda boş slot vurgulanır (eligible = altın, değilse mavi)
  const placeOpen = placing && open;
  const penLabel = penalty >= 1 ? null : penalty >= 0.90 ? "−10%" : "−25%";
  return (
    <button
      onClick={() => canTap && onTap(pos)}
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group ${placeOpen ? "animate-pulse" : ""}`}
      style={{ left: SPOT[pos].left, top: SPOT[pos].top, cursor: canTap ? "pointer" : "default" }}>
      <div
        className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center transition-all
          ${selected ? "scale-110 shadow-lg" : (player || placeOpen) ? "group-hover:scale-110" : ""}`}
        style={{
          borderColor: selected ? "#facc15"
            : placeOpen ? (eligible ? "#facc15" : "#3b82f6")
            : player ? POS_RING[pos] : "#334155",
          borderStyle: (player || (placing && !open)) ? "solid" : "dashed",
          background: player ? "rgba(2,8,23,0.92)" : placeOpen ? "rgba(2,8,23,0.80)" : "rgba(2,8,23,0.55)",
          boxShadow: selected ? "0 0 14px rgba(250,204,21,.45)"
            : placeOpen ? (eligible ? "0 0 14px rgba(250,204,21,.40)" : "0 0 10px rgba(59,130,246,.35)") : "none",
          opacity: placing && !open ? 0.45 : 1,
        }}>
        {player ? (
          <>
            <span className="text-[10px] font-bold text-white leading-none max-w-[3.2rem] truncate px-0.5">
              {player.PLAYER_NAME?.split(" ").slice(-1)[0]}
            </span>
            <span className="text-[8px] text-slate-400 leading-none mt-0.5">{(player._season || "").slice(0, 4)}</span>
            {pen < 1 && <span className="text-[7.5px] text-red-400 leading-none mt-0.5">{pen <= 0.75 ? "−25%" : "−10%"}</span>}
          </>
        ) : placeOpen ? (
          <>
            <span className="text-[13px] font-black leading-none" style={{ color: eligible ? "#facc15" : "#60a5fa" }}>{pos}</span>
            {penLabel && <span className="text-[7.5px] text-red-400 leading-none mt-0.5">{penLabel}</span>}
            {!penLabel && eligible && <StarIcon size={9} />}
          </>
        ) : (
          <span className="text-[11px] font-bold" style={{ color: POS_RING[pos] }}>{pos}</span>
        )}
      </div>
      <span className="text-[8.5px] mt-1 font-semibold tracking-wide inline-flex items-center gap-0.5"
        style={{ color: player ? POS_RING[pos] : placeOpen ? (eligible ? "#facc15" : "#60a5fa") : "#475569" }}>
        {pos}{isPrimary && <span className="text-yellow-400"><StarIcon size={8} /></span>}
      </span>
    </button>
  );
}

export default function CourtBoard({ lineup, coach, moveSrc, canRearrange, onSlotTap, getPrimaryPos,
                                     placing = false, placingEligible = [], placingPenalties = {}, onPlace }) {
  const bench = BENCH_SLOTS.map(b => lineup[b]).filter(Boolean);
  const cover = benchCoverage(bench);
  const tapHandler = placing ? onPlace : onSlotTap;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 select-none">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] text-slate-500 uppercase tracking-widest">Your Roster</div>
        {placing ? (
          <span className="text-[10px] text-amber-300 font-medium">Tap a spot on the court or bench to place</span>
        ) : canRearrange ? (
          <span className="text-[9.5px] text-slate-400">
            {moveSrc ? "Now tap a destination slot (occupied = swap)" : "Tap a player, then a slot to move / swap"}
          </span>
        ) : (
          <span className="text-[9.5px] text-slate-600">rearranging locked</span>
        )}
      </div>

      {/* Court solda, bench SAĞDA dikey */}
      <div className="flex gap-3 items-stretch">
        <div className="relative flex-1 min-w-0 max-w-[420px]" style={{ aspectRatio: "10/8" }}>
          <svg viewBox="0 0 400 360" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <rect x="6" y="6" width="388" height="348" rx="8" fill="none" stroke="#1e293b" strokeWidth="2" />
            <line x1="176" y1="26" x2="224" y2="26" stroke="#475569" strokeWidth="3" />
            <circle cx="200" cy="38" r="9" fill="none" stroke="#C8102E" strokeWidth="2.5" />
            <rect x="140" y="6" width="120" height="140" fill="rgba(29,66,138,0.07)" stroke="#1e293b" strokeWidth="2" />
            <circle cx="200" cy="146" r="44" fill="none" stroke="#1e293b" strokeWidth="2" />
            <path d="M 26 6 L 26 90 A 174 174 0 0 0 374 90 L 374 6" fill="none" stroke="#1e293b" strokeWidth="2" />
            <line x1="6" y1="354" x2="394" y2="354" stroke="#1e293b" strokeWidth="2" />
            <path d="M 156 354 A 44 44 0 0 1 244 354" fill="none" stroke="#1e293b" strokeWidth="2" />
          </svg>

          {POSITIONS.map(pos => {
            const open = !lineup[pos];
            return (
              <CourtSpot key={pos} pos={pos} player={lineup[pos]}
                isPrimary={!!lineup[pos] && getPrimaryPos(lineup[pos]) === pos}
                selected={moveSrc === pos}
                placing={placing} open={open}
                eligible={placingEligible.includes(pos)}
                penalty={placingPenalties[pos] ?? 1}
                canTap={placing ? open : (canRearrange && (!!lineup[pos] || !!moveSrc))}
                onTap={tapHandler} />
            );
          })}
        </div>

        {/* Bench — court'un sağında, dikey stack */}
        <div className="w-[118px] shrink-0 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Bench</div>
            <div className="flex items-center gap-0.5" title="Bench with a Guard, Forward AND Center earns a small buff">
              {["G", "F", "C"].map(g => (
                <span key={g} className={`text-[8px] w-3.5 h-3.5 rounded flex items-center justify-center border font-bold
                  ${cover[g] ? "border-emerald-500 text-emerald-300 bg-emerald-950/50" : "border-slate-700 text-slate-500"}`}>
                  {g}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            {BENCH_SLOTS.map(b => {
              const p = lineup[b];
              const selected = moveSrc === b;
              const open = !p;
              const placeOpen = placing && open;
              const canTap = placing ? open : (canRearrange && (p || moveSrc));
              return (
                <button key={b}
                  onClick={() => canTap && tapHandler(b)}
                  className={`rounded-lg border px-2 py-1.5 text-left min-w-0 transition-all ${placeOpen ? "animate-pulse" : ""}
                    ${selected ? "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,.35)]"
                      : placeOpen ? "border-blue-500/70 bg-blue-950/30 shadow-[0_0_8px_rgba(59,130,246,.25)]"
                      : p ? "border-slate-600/70 bg-slate-800/50 hover:border-slate-500"
                      : "border-dashed border-slate-700 bg-slate-900/40"}`}
                  style={{ cursor: canTap ? "pointer" : "default", opacity: placing && !open ? 0.4 : 1 }}>
                  <div className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold leading-none mb-0.5">{p ? b : (placeOpen ? `${b} · open` : b)}</div>
                  {p ? (
                    <>
                      <div className="text-[11px] text-slate-100 font-semibold truncate leading-tight">
                        {p.PLAYER_NAME?.split(" ").slice(-1)[0]}
                      </div>
                      <div className="text-[8.5px] text-slate-400 leading-none mt-0.5">{(p._season || "").slice(0, 4)}</div>
                    </>
                  ) : (
                    <div className={`text-xs leading-tight ${placeOpen ? "text-blue-300 font-semibold" : "text-slate-600"}`}>{placeOpen ? "tap →" : "—"}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Koç */}
      {coach && (
        <div className="flex items-center gap-2 border-t border-slate-800 pt-2">
          <span className="text-slate-300"><CoachIcon size={15} /></span>
          <span className="text-xs text-white font-medium flex-1 truncate">{coach.name}</span>
          <span className="text-[9.5px] font-mono text-slate-400">O:{coach.off} D:{coach.def}</span>
          {coach.champs > 0 && (
            <span className="text-[9.5px] text-yellow-400 inline-flex items-center gap-0.5"><TrophyIcon size={10} />×{coach.champs}</span>
          )}
        </div>
      )}
    </div>
  );
}
