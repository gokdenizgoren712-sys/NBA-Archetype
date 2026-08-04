import { WarnIcon, RefreshIcon, CalendarIcon } from "./GameIcons";
import "./game.css";

// ── Karşı-joker pop-up'ı: bekleyen tarafın kendi paneli içinde, aktif
// tarafın turu başlarken otomatik beliren kart — BAN / Force Team / Force
// Year'dan birini seçtirir ya da "No thanks" ile kapatılır. Same Screen ve
// With a Friend arasında paylaşılması için jokers/onUse/onDismiss'e bağlı,
// hiçbir oyun-state'i kendi içinde tutmuyor.
// Joker jetonuyla aynı dil (.g-joker) — sadece accent kırmızı, çünkü bu
// saldırgan/engelleyici bir hamle.
function CounterBtn({ Icon, label, available, onClick }) {
  return (
    <button onClick={onClick} disabled={!available}
      className={`g-joker ${available ? "on" : "off"}`}
      style={available ? { "--accent-line": "rgba(248,113,113,.5)", background: "rgba(248,113,113,.09)", color: "#f87171" } : undefined}>
      <Icon size={17} />
      <span className="lbl">{label}</span>
    </button>
  );
}

export default function CounterJokerPrompt({ jokers, activeSeat, activeName, onUse, onDismiss }) {
  const hasAny = jokers.ban || jokers.forceTeam || jokers.forceYear;
  if (!hasAny) return null;

  return (
    <div className="g-panel p-3 space-y-2.5"
      style={{ "--accent": "#f87171", "--accent-line": "rgba(248,113,113,.5)" }}>
      <span className="aura-blob" style={{ "--slot-color": "#f87171", left: "20%", top: -34, width: 180, height: 96, opacity: 0.24 }} />
      <div className="g-label" style={{ color: "#f87171" }}>
        Counter {activeName || `Player ${activeSeat}`}'s pick?
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <CounterBtn Icon={WarnIcon} label="BAN" available={jokers.ban} onClick={() => onUse("ban")} />
        <CounterBtn Icon={RefreshIcon} label="Force Team" available={jokers.forceTeam} onClick={() => onUse("forceTeam")} />
        <CounterBtn Icon={CalendarIcon} label="Force Year" available={jokers.forceYear} onClick={() => onUse("forceYear")} />
      </div>
      <button onClick={onDismiss} className="aura-pill-btn w-full justify-center" style={{ fontSize: 10, padding: "5px" }}>
        No thanks
      </button>
    </div>
  );
}
