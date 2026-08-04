import { Node, POS_COLOR } from "./CourtBoard";
import "./game.css";

// ── Tam saha 1v1 görünümü ────────────────────────────────────────────────
// vs modlarının (Same Screen / With a Friend) giriş ekranı artık yan panel
// taşımıyor: kurallar mod kartının ⓘ'sinde anlatılıyor, bu ekranın işi
// oyunun ŞEKLİNİ göstermek. Şekil de zaten 1v1: tam saha, solda bir taraf,
// sağda diğeri, altta iki bench yan yana (4+4).
//
// Dizilim CourtBoard'un yarım saha yerleşiminin 90° çevrilmiş hâli — aynı
// 12-gen düğümler, aynı mevki renkleri, tek tasarım dili.

const POSITIONS   = ["PG", "SG", "SF", "PF", "C"];
const BENCH_SLOTS = ["B1", "B2", "B3", "B4"];

// Sol yarı (% tam saha). Sağ yarı bunun aynası.
const SPOT_L = {
  C:  { x: 10, y: 36 },   // sepete yakın, boyalı alanın içi
  PF: { x: 20, y: 66 },   // alt elbow — C ile dikey mesafe dar ekranda da yeter
  SF: { x: 31, y: 16 },   // üst kanat
  SG: { x: 31, y: 84 },   // alt kanat
  PG: { x: 41, y: 50 },   // orta saha çizgisine yakın
};
const SPOT_R = Object.fromEntries(
  Object.entries(SPOT_L).map(([k, v]) => [k, { x: 100 - v.x, y: v.y }]),
);

const last = (name) => (name || "").split(" ").slice(-1)[0];

function Spot({ pos, player, accent, x, y, size, selected, canTap, onTap }) {
  return (
    <button type="button" onClick={() => canTap && onTap?.()} disabled={!canTap}
      className={`g-fc-spot absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-transform
        ${canTap ? "hover:scale-110" : ""}`}
      style={{ left: `${x}%`, top: `${y}%`, cursor: canTap ? "pointer" : "default" }}>
      <Node pos={pos} color={selected ? "#FFB11B" : player ? accent : POS_COLOR[pos]}
        dim={!player && !selected} glow={selected} size={size} />
      <div className="nm font-logo text-[9.5px] font-bold leading-none mt-1 max-w-[74px] truncate text-center"
        style={{ color: selected ? "var(--yamabuki)" : player ? "var(--text-primary)" : "rgba(255,255,255,.18)" }}>
        {player ? last(player.PLAYER_NAME) : "—"}
      </div>
    </button>
  );
}

function BenchCell({ slot, player, accent, selected, canTap, onTap }) {
  return (
    <button type="button" onClick={() => canTap && onTap?.()} disabled={!canTap}
      className="relative overflow-hidden rounded-xl px-2.5 py-2 min-w-0 text-left w-full transition-colors"
      style={{
        cursor: canTap ? "pointer" : "default",
        border: selected ? "1px solid #FFB11B"
          : player ? `1px solid ${accent}44`
          : "1px dashed rgba(255,255,255,.12)",
        background: selected ? "rgba(255,177,27,.08)" : player ? "rgba(255,255,255,.03)" : "transparent",
        boxShadow: selected ? "0 0 16px -3px #FFB11B" : "none",
      }}>
      {player && (
        <span className="aura-blob" style={{
          "--slot-color": selected ? "#FFB11B" : accent, left: "50%", top: -20, width: 90, height: 50,
          transform: "translateX(-50%)", opacity: selected ? 0.3 : 0.18,
        }} />
      )}
      <div className="relative font-logo text-[8.5px] uppercase tracking-widest font-bold leading-none"
        style={{ color: "var(--text-faint)" }}>{slot}</div>
      <div className="relative font-logo text-[11px] font-bold truncate leading-tight mt-1"
        style={{ color: player ? "var(--text-primary)" : "rgba(255,255,255,.16)" }}>
        {player ? last(player.PLAYER_NAME) : "—"}
      </div>
    </button>
  );
}

export default function FullCourtBoard({
  lineups = { 1: {}, 2: {} },
  names = { 1: "Player 1", 2: "Player 2" },
  accents = { 1: "#60a5fa", 2: "#f87171" },
  label = "// Matchup",
  status = "Lobby",
  nodeSize = 46,
  maxWidth = 1080,
  // ── İsteğe bağlı: kadro incelemesi / seri ekranı için ──────────────────
  scores = null,          // { 1: 78, 2: 74 } — takım skoru, isimlerin yanında
  coaches = null,         // { 1: coachObj, 2: coachObj } — isimlerin altında
  moveSrc = null,         // { 1: slot|null, 2: slot|null } — seçili slot
  canTap = null,          // { 1: bool, 2: bool } — o taraf yerleşim değiştirebilir mi
  onSlotTap = null,       // (seat, slot) => void
}) {
  const sides = [
    { seat: 1, spots: SPOT_L, align: "left" },
    { seat: 2, spots: SPOT_R, align: "right" },
  ];
  const tappable = (seat, slot) => !!onSlotTap && !!canTap?.[seat] && (!!lineups[seat]?.[slot] || !!moveSrc?.[seat]);
  const scoreHex = (v) => v >= 78 ? "#7dd3fc" : v >= 62 ? "#93c5fd" : "#d1d5db";

  return (
    <div className="g-court-panel">
      <div className="g-dotgrid" />

      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="g-mono" style={{ color: "var(--yamabuki)" }}>{label}</span>
        <span className="g-status" style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
          Status: {status}
        </span>
      </div>

      {/* Taraf başlıkları — kortun iki ucu (kortla aynı genişlikte hizalı) */}
      <div className="flex items-center justify-between gap-3 mb-2 mx-auto w-full"
        style={{ maxWidth: `min(${maxWidth}px, (100vh - 340px) * 1.88)` }}>
        {sides.map(({ seat }) => {
          const filled = [...POSITIONS, ...BENCH_SLOTS].filter(s => lineups[seat]?.[s]).length;
          const sc = scores?.[seat];
          const co = coaches?.[seat];
          return (
            <div key={seat} className={`flex items-start gap-2 min-w-0${seat === 2 ? " flex-row-reverse text-right" : ""}`}>
              <span className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                style={{ background: accents[seat], boxShadow: `0 0 10px ${accents[seat]}` }} />
              <div className="min-w-0">
                <div className={`flex items-center gap-2 min-w-0${seat === 2 ? " flex-row-reverse" : ""}`}>
                  <span className="font-logo text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{names[seat]}</span>
                  {sc != null ? (
                    <span className="font-logo text-[17px] font-black tabular-nums shrink-0" style={{ color: scoreHex(sc) }}>{sc}</span>
                  ) : (
                    <span className="g-mono shrink-0" style={{ color: "var(--text-faint)" }}>{filled}/9</span>
                  )}
                </div>
                {co && (
                  <div className="g-mono truncate" style={{ color: "var(--text-faint)" }}>
                    {co.name} · O{co.off} D{co.def}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tam saha — 94×50 ft oranı (940×500), preserveAspectRatio none ile
          kutuyu tam doldurur, % düğümler çizgilerle hizalı kalır.
          Genişlik viewport YÜKSEKLİĞİNE göre kısıtlanıyor: 1.88 oranında bir
          kort serbest bırakılırsa geniş ekranda 600px'i aşıp lobiyi
          kaydırılabilir hâle getiriyor. Kortu ezmek yerine (SVG stretch)
          genişliği kısıp oranı koruyoruz. */}
      <div className="relative w-full mx-auto"
        style={{ aspectRatio: "940 / 500", maxWidth: `min(${maxWidth}px, (100vh - 340px) * 1.88)` }}>
        <svg viewBox="0 0 940 500" preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full opacity-60"
          fill="none" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="10" y="10" width="920" height="480" />
          {/* orta saha çizgisi + merkez daire */}
          <line x1="470" y1="10" x2="470" y2="490" />
          <circle cx="470" cy="250" r="60" />
          {/* SOL yarı */}
          <rect x="10" y="170" width="180" height="160" />
          <path d="M 190 190 A 60 60 0 0 1 190 310" />
          <path d="M 190 190 A 60 60 0 0 0 190 310" strokeDasharray="6 6" />
          <line x1="10" y1="30" x2="140" y2="30" />
          <line x1="10" y1="470" x2="140" y2="470" />
          <path d="M 140 30 A 234 234 0 0 1 140 470" />
          <line x1="50" y1="220" x2="50" y2="280" stroke="#c8102e" strokeWidth="3" />
          <circle cx="60" cy="250" r="8" stroke="#c8102e" />
          {/* SAĞ yarı (ayna) */}
          <rect x="750" y="170" width="180" height="160" />
          <path d="M 750 190 A 60 60 0 0 0 750 310" />
          <path d="M 750 190 A 60 60 0 0 1 750 310" strokeDasharray="6 6" />
          <line x1="800" y1="30" x2="930" y2="30" />
          <line x1="800" y1="470" x2="930" y2="470" />
          <path d="M 800 30 A 234 234 0 0 0 800 470" />
          <line x1="890" y1="220" x2="890" y2="280" stroke="#c8102e" strokeWidth="3" />
          <circle cx="880" cy="250" r="8" stroke="#c8102e" />
        </svg>

        {/* Merkez dairede VS */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-logo font-black select-none"
          style={{ fontSize: 26, color: "rgba(255,255,255,.13)", letterSpacing: ".08em" }}>VS</span>

        {sides.map(({ seat, spots }) =>
          POSITIONS.map(pos => (
            <Spot key={`${seat}-${pos}`} pos={pos} player={lineups[seat]?.[pos]}
              accent={accents[seat]} x={spots[pos].x} y={spots[pos].y} size={nodeSize}
              selected={moveSrc?.[seat] === pos}
              canTap={tappable(seat, pos)} onTap={() => onSlotTap(seat, pos)} />
          )),
        )}
      </div>

      {/* Bench — iki taraf yan yana, dörder slot (kort genişliğinde) */}
      <div className="g-fc-bench grid grid-cols-2 gap-3 pt-3 mt-3 mx-auto w-full"
        style={{ borderTop: "1px solid rgba(255,255,255,.08)", maxWidth: `min(${maxWidth}px, (100vh - 340px) * 1.88)` }}>
        {sides.map(({ seat }) => (
          <div key={seat} className="min-w-0">
            <div className="g-label mb-1.5" style={{ fontSize: 8.5, justifyContent: seat === 2 ? "flex-end" : "flex-start" }}>
              {names[seat]} · Bench
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {BENCH_SLOTS.map(b => (
                <BenchCell key={b} slot={b} player={lineups[seat]?.[b]} accent={accents[seat]}
                  selected={moveSrc?.[seat] === b}
                  canTap={tappable(seat, b)} onTap={() => onSlotTap(seat, b)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
