// ── Best-of-7 seride tek bir maçın box score'u — Same Screen ve With a Friend
// arasında paylaşılır. `labels` seat(1/2)->görünen isim eşlemesi — Same
// Screen "Player 1"/"Player 2" kullanır, With a Friend "You"/rakip kullanıcı
// adını geçirir.
const BOX_COLS = "grid-cols-[1fr_2rem_2rem_2rem_2rem_2rem_2rem]";

function BoxTable({ lines }) {
  return (
    <div>
      <div className={`grid ${BOX_COLS} gap-x-1 text-[8px] text-gray-500 uppercase tracking-wider pb-0.5`}>
        <span>Player</span><span className="text-right">MIN</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span><span className="text-right">STL</span><span className="text-right">BLK</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} className={`grid ${BOX_COLS} gap-x-1 text-[10px] leading-relaxed ${l.bench ? "text-gray-500" : "text-gray-200"}`}>
          <span className="truncate">{l.bench ? "· " : ""}{l.name?.split(" ").slice(-1)[0]}</span>
          <span className="text-right tabular-nums">{l.min}</span>
          <span className="text-right tabular-nums font-semibold">{l.pts}</span>
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
  return (
    <div className="rounded-xl border border-gray-800 bg-surfaceBg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-logo text-xs font-bold text-white uppercase tracking-wide">Game {game.gameIndex + 1}</span>
        <span className="text-[10px] text-gray-500">Home: {labels[game.home]}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map(seat => (
          <div key={seat} className={`rounded-lg p-2 ${game.winner === seat ? "bg-yamabuki/10 border border-yamabuki/40" : "bg-surfaceCard/40 border border-gray-800"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10.5px] font-bold text-white truncate">{labels[seat]}</span>
              <span className={`text-lg font-black tabular-nums shrink-0 ml-1 ${game.winner === seat ? "text-yamabuki" : "text-gray-300"}`}>{game.teamPts[seat]}</span>
            </div>
            <BoxTable lines={game.box[seat]} />
          </div>
        ))}
      </div>
    </div>
  );
}
