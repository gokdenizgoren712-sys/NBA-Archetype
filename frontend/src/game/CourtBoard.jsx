// ── Yarım saha görünümü (Primary Arch tasarım sistemi) ───────────────────────
// Split-pane sağ tarafı: "Taktiksel Veri Haritası" (blueprint). 5 starter yarım
// sahada 12-gen mevki düğümleriyle, 4 bench SAĞDA dikey. Fonksiyon korunur:
//   • rearrange: dolu slot'a tıkla → seç, sonra hedef → move/swap.
//   • placing (pick_pos): boş court/bench slot'una tıkla → oyuncu yerleşir (desktop).
// Mevki düğümü = 12-gen SVG + içinde <text> (kusursuz ortalama, Rajdhani).

import { benchCoverage } from "./seasonSim";
import { StarIcon, CoachIcon, TrophyIcon } from "./GameIcons";

const POSITIONS   = ["PG", "SG", "SF", "PF", "C"];
const BENCH_SLOTS = ["B1", "B2", "B3", "B4"];

// Referans koordinatları (yarım saha, % top/left)
const SPOT = {
  C:  { left: "65%", top: "18%" },
  PF: { left: "30%", top: "35%" },
  SF: { left: "15%", top: "60%" },
  SG: { left: "85%", top: "60%" },
  PG: { left: "50%", top: "80%" },
};

// Referans mevki renkleri
const POS_COLOR = {
  PG: "#1d428a", SG: "#00A3AF", SF: "#6da7ec", PF: "#FFB11B", C: "#c8102e",
};
const DODECA = "24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7";

// 12-gen düğüm — içine <text> ile mevki harfi (kusursuz ortalanır)
function Node({ pos, color, dim, glow, size = 54 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48"
      className={glow ? "drop-shadow-[0_0_10px_rgba(255,177,27,0.5)]" : ""}>
      <polygon points={DODECA} fill="#0b0b0b" stroke={color} strokeWidth="2"
        strokeLinejoin="round" opacity={dim ? 0.5 : 1} />
      <text x="24" y="25.5" dominantBaseline="middle" textAnchor="middle"
        fill={color} fontFamily="Rajdhani" fontWeight="700" fontSize="16"
        opacity={dim ? 0.6 : 1}>{pos}</text>
    </svg>
  );
}

function CourtSpot({ pos, player, isPrimary, selected, canTap, onTap, placing, open, eligible, penalty }) {
  const pen = player?._posPenalty ?? 1;
  const placeOpen = placing && open;
  const penLabel = penalty >= 1 ? null : penalty >= 0.90 ? "−10%" : "−25%";
  const ring = POS_COLOR[pos];
  const nodeColor = selected ? "#FFB11B"
    : placeOpen ? (eligible ? "#FFB11B" : "#6da7ec")
    : player ? ring : ring;

  return (
    <button
      onClick={() => canTap && onTap(pos)}
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group
        ${placeOpen ? "animate-pulse" : ""} ${(player || placeOpen || selected) ? "hover:scale-105" : ""} transition-transform`}
      style={{ left: SPOT[pos].left, top: SPOT[pos].top, cursor: canTap ? "pointer" : "default",
        opacity: placing && !open ? 0.4 : 1 }}>
      <Node pos={pos} color={nodeColor} dim={!player && !placeOpen && !selected}
        glow={selected || (placeOpen && eligible)} />
      {/* Alt etiket */}
      {player ? (
        <div className="flex flex-col items-center mt-0.5">
          <span className="font-logo font-semibold text-[10px] text-white leading-none max-w-[4.5rem] truncate px-0.5">
            {player.PLAYER_NAME?.split(" ").slice(-1)[0]}
          </span>
          <span className="text-[8px] text-gray-500 leading-none mt-0.5 inline-flex items-center gap-0.5">
            {(player._season || "").slice(0, 4)}
            {pen < 1 && <span className="text-brandRed">{pen <= 0.75 ? "−25%" : "−10%"}</span>}
            {isPrimary && <span className="text-yamabuki"><StarIcon size={7} /></span>}
          </span>
        </div>
      ) : placeOpen ? (
        <span className="text-[8px] mt-0.5 font-logo font-semibold inline-flex items-center gap-0.5"
          style={{ color: eligible ? "#FFB11B" : "#6da7ec" }}>
          {penLabel || (eligible ? <StarIcon size={8} /> : "open")}
        </span>
      ) : (
        <span className="text-[8px] mt-0.5 text-gray-600 uppercase tracking-wide">{pos}</span>
      )}
    </button>
  );
}

export default function CourtBoard({ lineup, coach, moveSrc, canRearrange, onSlotTap, getPrimaryPos,
                                     placing = false, placingEligible = [], placingPenalties = {}, onPlace }) {
  const bench = BENCH_SLOTS.map(b => lineup[b]).filter(Boolean);
  const cover = benchCoverage(bench);
  const tapHandler = placing ? onPlace : onSlotTap;

  return (
    <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-4 space-y-3 select-none">
      <div className="flex items-center justify-between gap-2">
        <div className="font-logo text-[11px] text-gray-500 uppercase tracking-widest font-semibold">Your Roster</div>
        {placing ? (
          <span className="text-[10px] text-yamabuki font-medium">Tap a spot on the court or bench to place</span>
        ) : canRearrange ? (
          <span className="text-[9.5px] text-gray-400">
            {moveSrc ? "Now tap a destination slot (occupied = swap)" : "Tap a player, then a slot to move / swap"}
          </span>
        ) : (
          <span className="text-[9px] text-gray-600 uppercase tracking-widest">Rearranging Locked</span>
        )}
      </div>

      {/* Court solda (blueprint), bench SAĞDA dikey */}
      <div className="flex gap-3 items-stretch">
        {/* Aspect viewBox (300×400 = 3:4) ile AYNI → SVG letterbox'suz doldurur,
            % mevki düğümleri kort çizgileriyle hizalanır */}
        <div className="relative flex-1 min-w-0" style={{ aspectRatio: "3 / 4" }}>
          {/* Blueprint yarım saha (referans) — opacity-60 */}
          <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full opacity-60"
            fill="none" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round">
            <rect x="10" y="10" width="280" height="380" />
            <rect x="100" y="10" width="100" height="140" />
            <path d="M 100 150 A 50 50 0 0 0 200 150" />
            <path d="M 100 150 A 50 50 0 0 1 200 150" strokeDasharray="6 6" />
            <path d="M 25 10 V 80 C 25 220 275 220 275 80 V 10" />
            <line x1="130" y1="25" x2="170" y2="25" stroke="#c8102e" strokeWidth="3" />
            <circle cx="150" cy="35" r="8" stroke="#c8102e" />
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
        <div className="w-[110px] shrink-0 flex flex-col border-l border-gray-800/60 pl-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-logo text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Bench</div>
            <div className="flex items-center gap-0.5" title="Bench with a Guard, Forward AND Center earns a small buff">
              {["G", "F", "C"].map(g => (
                <span key={g} className={`font-logo text-[8px] w-3.5 h-3.5 rounded flex items-center justify-center border font-bold
                  ${cover[g] ? "border-asagi text-asagi bg-asagi/10" : "border-gray-700 text-gray-600"}`}>
                  {g}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-evenly gap-2">
            {BENCH_SLOTS.map(b => {
              const p = lineup[b];
              const selected = moveSrc === b;
              const open = !p;
              const placeOpen = placing && open;
              const canTap = placing ? open : (canRearrange && (p || moveSrc));
              return (
                <button key={b}
                  onClick={() => canTap && tapHandler(b)}
                  className={`rounded-lg border h-16 px-2 flex flex-col justify-center text-left min-w-0 transition-all
                    ${placeOpen ? "animate-pulse" : ""}
                    ${selected ? "border-yamabuki shadow-[0_0_10px_rgba(255,177,27,.35)] bg-surfaceCard"
                      : placeOpen ? "border-[#6da7ec]/70 bg-brandBlue/10 shadow-[0_0_8px_rgba(109,167,236,.25)]"
                      : p ? "border-gray-700 bg-surfaceCard hover:border-gray-600"
                      : "border-dashed border-gray-700 bg-black/20"}`}
                  style={{ cursor: canTap ? "pointer" : "default", opacity: placing && !open ? 0.4 : 1 }}>
                  <div className="font-logo text-[9px] uppercase tracking-widest text-gray-500 font-semibold leading-none mb-0.5">
                    {b}{placeOpen ? " · open" : ""}
                  </div>
                  {p ? (
                    <>
                      <div className="font-logo text-[11px] text-gray-100 font-semibold truncate leading-tight">
                        {p.PLAYER_NAME?.split(" ").slice(-1)[0]}
                      </div>
                      <div className="text-[8.5px] text-gray-500 leading-none mt-0.5">{(p._season || "").slice(0, 4)}</div>
                    </>
                  ) : (
                    <div className={`text-xs leading-tight ${placeOpen ? "text-[#6da7ec] font-semibold" : "text-gray-700"}`}>
                      {placeOpen ? "tap →" : "—"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Koç */}
      {coach && (
        <div className="flex items-center gap-2 border-t border-gray-800 pt-2">
          <span className="text-asagi"><CoachIcon size={15} /></span>
          <span className="font-logo text-xs text-white font-semibold flex-1 truncate">{coach.name}</span>
          <span className="text-[9.5px] font-logo text-gray-400">O:{coach.off} D:{coach.def}</span>
          {coach.champs > 0 && (
            <span className="text-[9.5px] text-yamabuki inline-flex items-center gap-0.5"><TrophyIcon size={10} />×{coach.champs}</span>
          )}
        </div>
      )}
    </div>
  );
}
