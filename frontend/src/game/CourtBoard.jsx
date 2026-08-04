// ── Yarım saha görünümü (Primary Arch tasarım sistemi) ───────────────────────
// Split-pane sağ tarafı: "Taktiksel Veri Haritası" (blueprint). 5 starter yarım
// sahada 12-gen mevki düğümleriyle, 4 bench SAĞDA dikey. Fonksiyon korunur:
//   • rearrange: dolu slot'a tıkla → seç, sonra hedef → move/swap.
//   • placing (pick_pos): boş court/bench slot'una tıkla → oyuncu yerleşir (desktop).
// Mevki düğümü = 12-gen SVG + içinde <text> (kusursuz ortalama, Rajdhani).

import { benchCoverage } from "./seasonSim";
import "./game.css";
import { StarIcon, CoachIcon, TrophyIcon } from "./GameIcons";

const POSITIONS   = ["PG", "SG", "SF", "PF", "C"];
const BENCH_SLOTS = ["B1", "B2", "B3", "B4"];

// Geniş yarım saha üzerindeki % konumlar — sepet üstte, dengeli 5'li dizilim
const SPOT = {
  C:  { left: "42%", top: "22%" },   // sol blok (sepete yakın)
  PF: { left: "62%", top: "36%" },   // sağ elbow — C'yi dengeler
  SF: { left: "16%", top: "62%" },   // sol kanat
  SG: { left: "84%", top: "62%" },   // sağ kanat
  PG: { left: "50%", top: "82%" },   // üst / top of the key
};

// Referans mevki renkleri
export const POS_COLOR = {
  PG: "#1d428a", SG: "#00A3AF", SF: "#6da7ec", PF: "#FFB11B", C: "#c8102e",
};
const DODECA = "24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7";

// 12-gen düğüm — içine <text> ile mevki harfi (kusursuz ortalanır)
export function Node({ pos, color, dim, glow, size = 54 }) {
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

// `bare` = dış kabuk çağıran taraftan geliyor (idle ekranındaki HUD court
// paneli kendi başlığını/dot-grid'ini çiziyor), o yüzden burada tekrar panel
// çerçevesi + "Your Roster" başlığı çizilmesin.
export default function CourtBoard({ lineup, coach, moveSrc, canRearrange, onSlotTap, getPrimaryPos,
                                     placing = false, placingEligible = [], placingPenalties = {}, onPlace,
                                     bare = false }) {
  const bench = BENCH_SLOTS.map(b => lineup[b]).filter(Boolean);
  const cover = benchCoverage(bench);
  const tapHandler = placing ? onPlace : onSlotTap;

  return (
    <div className={bare ? "select-none" : "g-panel p-4 space-y-3 select-none"}>
      {!bare && (
        <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: "50%", top: -50, width: 300, height: 150, transform: "translateX(-50%)", opacity: placing ? 0.24 : 0.11, transition: "opacity .35s ease" }} />
      )}
      {!bare && (
        <div className="flex items-center justify-between gap-2">
          <div className="g-label">Your Roster</div>
          {placing ? (
            <span className="text-[10px] font-medium" style={{ color: "var(--yamabuki)" }}>Tap a spot on the court or bench to place</span>
          ) : canRearrange ? (
            <span className="text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              {moveSrc ? "Now tap a destination slot (occupied = swap)" : "Tap a player, then a slot to move / swap"}
            </span>
          ) : (
            <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>Rearranging Locked</span>
          )}
        </div>
      )}

      {/* Court solda (blueprint), bench SAĞDA dikey */}
      <div className="flex gap-3 items-stretch">
        {/* Geniş yarım saha — aspect viewBox (460×380) ile AYNI → letterbox yok,
            % mevki düğümleri kort çizgileriyle hizalı. Landscape → sağı doldurur,
            oranlar doğru (3pt arkı FT dairesini çevreler, içinden geçmez). */}
        <div className="relative flex-1 min-w-0" style={{ aspectRatio: "484 / 493" }}>
          {/* Blueprint yarım saha — none ile kutuyu tam doldurur (düğümler hizalı),
              kutu biraz kısaltıldı ki roster kartı kenarı mode kartlarıyla hizalansın */}
          <svg viewBox="0 0 470 500" preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-60"
            fill="none" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* dış sınır */}
            <rect x="10" y="10" width="450" height="480" />
            {/* boyalı alan (key) */}
            <rect x="190" y="10" width="90" height="185" />
            {/* FT dairesi: üst yarı düz, alt yarı kesikli */}
            <path d="M 190 195 A 45 45 0 0 1 280 195" />
            <path d="M 190 195 A 45 45 0 0 0 280 195" strokeDasharray="6 6" />
            {/* 3'lük çizgisi: köşe dikmeleri + geniş yay (FT dairesini çevreler) */}
            <path d="M 45 10 V 110 C 45 330 425 330 425 110 V 10" />
            {/* pota + backboard (kırmızı) */}
            <line x1="210" y1="30" x2="260" y2="30" stroke="#c8102e" strokeWidth="3" />
            <circle cx="235" cy="43" r="8" stroke="#c8102e" />
            {/* orta saha çizgisi + merkez yarım daire */}
            <line x1="10" y1="485" x2="460" y2="485" />
            <path d="M 191 485 A 44 44 0 0 1 279 485" />
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
        <div className="w-[110px] shrink-0 flex flex-col pl-3" style={{ borderLeft: "1px solid rgba(255,255,255,.07)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="g-label" style={{ fontSize: 8.5 }}>Bench</div>
            <div className="flex items-center gap-1" title="Bench with a Guard, Forward AND Center earns a small buff">
              {["G", "F", "C"].map(g => (
                <span key={g} className="font-logo text-[8px] w-[15px] h-[15px] rounded-md flex items-center justify-center font-bold"
                  style={cover[g]
                    ? { color: "#4ade80", background: "rgba(74,222,128,.14)", border: "1px solid rgba(74,222,128,.45)" }
                    : { color: "rgba(255,255,255,.22)", border: "1px dashed rgba(255,255,255,.14)" }}>
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
                  className={`relative overflow-hidden rounded-xl h-16 px-2.5 flex flex-col justify-center text-left min-w-0 transition-all
                    ${placeOpen ? "animate-pulse" : ""}`}
                  style={{
                    cursor: canTap ? "pointer" : "default",
                    opacity: placing && !open ? 0.4 : 1,
                    border: selected ? "1px solid #FFB11B"
                      : placeOpen ? "1px solid rgba(109,167,236,.7)"
                      : p ? "1px solid rgba(255,255,255,.1)"
                      : "1px dashed rgba(255,255,255,.12)",
                    background: p || selected ? "rgba(255,255,255,.03)" : "transparent",
                    boxShadow: selected ? "0 0 16px -3px #FFB11B"
                      : placeOpen ? "0 0 14px -3px rgba(109,167,236,.6)" : "none",
                  }}>
                  {(p || placeOpen) && (
                    <span className="aura-blob" style={{
                      "--slot-color": placeOpen ? "#6da7ec" : "#9ca3af",
                      left: "50%", top: -18, width: 100, height: 56,
                      transform: "translateX(-50%)", opacity: placeOpen ? 0.34 : 0.16,
                    }} />
                  )}
                  <div className="relative font-logo text-[9px] uppercase tracking-widest font-bold leading-none mb-1"
                    style={{ color: placeOpen ? "#6da7ec" : "var(--text-faint)" }}>
                    {b}{placeOpen ? " · open" : ""}
                  </div>
                  {p ? (
                    <>
                      <div className="relative font-logo text-[11px] font-bold truncate leading-tight" style={{ color: "var(--text-primary)" }}>
                        {p.PLAYER_NAME?.split(" ").slice(-1)[0]}
                      </div>
                      <div className="relative text-[8.5px] leading-none mt-0.5" style={{ color: "var(--text-faint)" }}>{(p._season || "").slice(0, 4)}</div>
                    </>
                  ) : (
                    <div className="relative text-xs leading-tight font-semibold"
                      style={{ color: placeOpen ? "#6da7ec" : "rgba(255,255,255,.16)" }}>
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
        <div className="flex items-center gap-2 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <span style={{ color: "#c084fc" }}><CoachIcon size={15} /></span>
          <span className="font-logo text-xs font-bold flex-1 truncate" style={{ color: "var(--text-primary)" }}>{coach.name}</span>
          <span className="text-[9.5px] font-logo" style={{ color: "var(--text-muted)" }}>O:{coach.off} D:{coach.def}</span>
          {coach.champs > 0 && (
            <span className="text-[9.5px] inline-flex items-center gap-0.5" style={{ color: "var(--yamabuki)" }}><TrophyIcon size={10} />×{coach.champs}</span>
          )}
        </div>
      )}
    </div>
  );
}
