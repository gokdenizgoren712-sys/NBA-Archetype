import "./game.css";

// ── Joker butonu ──────────────────────────────────────────────────────────────
// Harcanabilir bir jeton: kullanılabilirken parıltı süpürmesi + accent glow,
// harcandığında disabled-kutu yerine soluk hayalet çerçeveye düşer.
export default function JokerBtn({ Icon, label, available, onClick }) {
  return (
    <button onClick={onClick} disabled={!available}
      className={`g-joker ${available ? "on" : "off"}`}
      title={available ? `${label} joker — one use per game` : `${label} joker already spent`}>
      <Icon size={21} />
      <span className="lbl">{label}</span>
    </button>
  );
}
