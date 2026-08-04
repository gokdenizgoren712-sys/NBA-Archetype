import "./game.css";

// ── Best-of-7 seride tek bir maçın box score'u — Same Screen ve With a Friend
// arasında paylaşılır. `labels` seat(1/2)->görünen isim eşlemesi — Same
// Screen "Player 1"/"Player 2" kullanır, With a Friend "You"/rakip kullanıcı
// adını geçirir.
//
// Kazanan taraf artık sarı-tint'li bir kutu değil; kendi accent'inde organik
// glow + kenar bevel alıyor, kaybeden sessizleşiyor.
const BOX_COLS = "grid-cols-[1fr_2rem_2rem_2rem_2rem_2rem_2rem]";

function BoxTable({ lines }) {
  return (
    <div>
      <div className={`grid ${BOX_COLS} gap-x-1 text-[8px] uppercase tracking-wider pb-1`}
        style={{ color: "var(--text-faint)" }}>
        <span>Player</span><span className="text-right">MIN</span><span className="text-right">PTS</span>
        <span className="text-right">REB</span><span className="text-right">AST</span>
        <span className="text-right">STL</span><span className="text-right">BLK</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`grid ${BOX_COLS} gap-x-1 text-[10px] leading-relaxed`}
          style={{ color: l.bench ? "var(--text-faint)" : "var(--text-muted)" }}>
          <span className="truncate">{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
          <span className="text-right tabular-nums">{l.min}</span>
          <span className="text-right tabular-nums font-bold" style={{ color: l.bench ? "var(--text-faint)" : "var(--text-primary)" }}>{l.pts}</span>
          <span className="text-right tabular-nums">{l.reb}</span>
          <span className="text-right tabular-nums">{l.ast}</span>
          <span className="text-right tabular-nums">{l.stl}</span>
          <span className="text-right tabular-nums">{l.blk}</span>
        </div>
      ))}
    </div>
  );
}

export default function GameBox({ game, labels = { 1: "Player 1", 2: "Player 2" } }) {
  const SEAT_HEX = { 1: "#FFB11B", 2: "#60a5fa" };
  return (
    <div className="g-panel p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <span className="g-label">Game {game.gameIndex + 1}</span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Home: {labels[game.home]}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map(seat => {
          const won = game.winner === seat;
          const hex = SEAT_HEX[seat];
          return (
            <div key={seat} className="relative overflow-hidden rounded-xl p-2.5"
              style={{
                border: `1px solid ${won ? hex + "55" : "rgba(255,255,255,.06)"}`,
                background: won ? "rgba(255,255,255,.03)" : "transparent",
              }}>
              {won && <span className="aura-blob" style={{ "--slot-color": hex, left: "50%", top: -28, width: 150, height: 80, transform: "translateX(-50%)", opacity: 0.26 }} />}
              <div className="relative flex items-center justify-between mb-1.5">
                <span className="font-logo text-[11px] font-bold truncate"
                  style={{ color: won ? hex : "var(--text-muted)" }}>{labels[seat]}</span>
                <span className="font-logo text-xl font-black tabular-nums shrink-0 ml-1"
                  style={{ color: won ? hex : "var(--text-faint)", textShadow: won ? `0 0 20px ${hex}66` : "none" }}>
                  {game.teamPts[seat]}
                </span>
              </div>
              <div className="relative"><BoxTable lines={game.box[seat]} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
