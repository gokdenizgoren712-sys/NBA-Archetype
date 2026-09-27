// ── Yarım saha görünümü (Primary Arch tasarım sistemi) ───────────────────────
// Split-pane sağ tarafı: "Taktiksel Veri Haritası" (blueprint). 5 starter yarım
// sahada 12-gen mevki düğümleriyle, 4 bench SAĞDA dikey. Fonksiyon korunur:
//   • rearrange: dolu slot'a tıkla → seç, sonra hedef → move/swap.
//   • placing (pick_pos): boş court/bench slot'una tıkla → oyuncu yerleşir (desktop).
// Mevki düğümü = 12-gen SVG + içinde <text> (kusursuz ortalama, Rajdhani).

import { benchCoverage } from "./seasonSim";
import "./game.css";
import { StarIcon, CoachIcon, TrophyIcon } from "./GameIcons";
import { POS_COLOR } from "../constants/positionColors";

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
export { POS_COLOR };
const DODECA = "24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7";

// 12-gen düğüm — içine <text> ile mevki harfi (kusursuz ortalanır)
export function Node({ pos, color, dim, glow, size = 54 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48"
      style={glow ? { filter: "drop-shadow(0 0 10px rgba(255,177,27,.5))" } : undefined}>
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
  const nodeColor = selected ? "#FFB11B" : placeOpen ? (eligible ? "#FFB11B" : "#6da7ec") : ring;
  const lit = !!player || placeOpen || selected;

  return (
    <button
      onClick={() => canTap && onTap(pos)}
      aria-label={player ? `${pos}: ${player.PLAYER_NAME}` : `${pos}: open`}
      className={`g-cspot${placeOpen ? " placing" : ""}${lit ? " lit" : ""}`}
      style={{ left: SPOT[pos].left, top: SPOT[pos].top, cursor: canTap ? "pointer" : "default",
        opacity: placing && !open ? 0.4 : 1, "--c": nodeColor }}>
      {/* Handoff 5a: düğümün altında mevki renginde yumuşak bir ışık */}
      <span className="g-cspot-glow" />
      <Node pos={pos} color={nodeColor} dim={!lit} glow={selected || (placeOpen && eligible)} size={60} />
      {player ? (
        <>
          <span className="g-cspot-name">{player.PLAYER_NAME?.split(" ").slice(-1)[0]}</span>
          <span className="g-cspot-sub">
            {(player._season || "").slice(0, 4)}
            {pen < 1 && <b className="pen">{pen <= 0.75 ? "−25%" : "−10%"}</b>}
            {isPrimary && <span className="star"><StarIcon size={10} /></span>}
          </span>
        </>
      ) : placeOpen ? (
        <span className="g-cspot-sub" style={{ color: eligible ? "#FFB11B" : "#6da7ec" }}>
          {penLabel || (eligible ? "Natural fit" : "Open")}
        </span>
      ) : null}
    </button>
  );
}

// `bare`  = dış kabuk çağıran taraftan geliyor (başlık/kart çizilmez).
// `fit`   = kort yüksekliğe göre ölçeklenir (idle: sabit yükseklikli alan).
// `bench` = "column" (3a: kortun sağında) ya da "strip" (5a: kortun altında).
export default function CourtBoard({ lineup, coach, moveSrc, canRearrange, onSlotTap, getPrimaryPos,
                                     placing = false, placingEligible = [], placingPenalties = {}, onPlace,
                                     bare = false, fit = false, bench: benchLayout = "column" }) {
  const bench = BENCH_SLOTS.map(b => lineup[b]).filter(Boolean);
  const cover = benchCoverage(bench);
  const tapHandler = placing ? onPlace : onSlotTap;
  const strip = benchLayout === "strip";

  const hint = placing ? "Tap a spot on the court or bench to place"
    : canRearrange ? (moveSrc ? "Now tap a destination (occupied = swap)" : "Tap a player, then a slot to move or swap")
    : "Rearranging locked";

  const benchSlots = BENCH_SLOTS.map(b => {
    const p = lineup[b];
    const selected = moveSrc === b;
    const open = !p;
    const placeOpen = placing && open;
    const canTap = placing ? open : (canRearrange && (p || moveSrc));
    return (
      <button key={b} onClick={() => canTap && tapHandler(b)}
        className={`g-bslot${p ? " filled" : ""}${selected ? " selected" : ""}${placeOpen ? " placing" : ""}`}
        style={{ cursor: canTap ? "pointer" : "default", opacity: placing && !open ? 0.4 : 1 }}
        aria-label={p ? `${b}: ${p.PLAYER_NAME}` : `${b}: open slot`}>
        <span className="g-bslot-glow" />
        <span className="g-bslot-label">{b}</span>
        <span className="g-bslot-name">
          {p ? p.PLAYER_NAME?.split(" ").slice(-1)[0] : placeOpen ? "Place here" : "Open slot"}
        </span>
      </button>
    );
  });

  const coverChips = (
    <span className="g-bcover" title="A bench with a Guard, Forward AND Center earns a small buff">
      {["G", "F", "C"].map(g => <b key={g} className={cover[g] ? "on" : ""}>{g}</b>)}
    </span>
  );

  return (
    <div className={`g-court${bare ? "" : " g-panel"}${fit ? " fit" : ""}${strip ? " strip" : ""}`}>
      {!bare && (
        <div className="g-court-head">
          <span className="g-court-title">Your roster</span>
          <span className="g-court-hint" style={placing ? { color: "var(--yamabuki)" } : undefined}>{hint}</span>
        </div>
      )}

      <div className="g-court-row">
        <div className="g-court-floor">
          <div className="g-court-box">
            <svg viewBox="0 0 470 500" preserveAspectRatio="none" className="g-court-lines"
              fill="none" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="10" y="10" width="450" height="480" />
              <rect x="190" y="10" width="90" height="185" />
              <path d="M 190 195 A 45 45 0 0 1 280 195" />
              <path d="M 190 195 A 45 45 0 0 0 280 195" strokeDasharray="6 6" />
              <path d="M 45 10 V 110 C 45 330 425 330 425 110 V 10" />
              <line x1="210" y1="30" x2="260" y2="30" stroke="#c8102e" strokeWidth="3" />
              <circle cx="235" cy="43" r="8" stroke="#c8102e" />
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
        </div>

        {!strip && (
          <div className="g-bench-col">
            <div className="g-bench-head"><span>Bench</span>{coverChips}</div>
            {benchSlots}
          </div>
        )}
      </div>

      {strip && (
        <div className="g-bench-row">
          <span className="g-bench-row-label">Bench {coverChips}</span>
          {benchSlots}
        </div>
      )}

      {coach && (
        <div className="g-court-coach">
          <span style={{ color: "#c084fc" }}><CoachIcon size={16} /></span>
          <span className="name">{coach.name}</span>
          <span className="grades">O {coach.off} · D {coach.def}</span>
          {coach.champs > 0 && (
            <span className="rings"><TrophyIcon size={12} />×{coach.champs}</span>
          )}
        </div>
      )}
    </div>
  );
}
