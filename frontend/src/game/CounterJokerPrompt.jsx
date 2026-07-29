import { WarnIcon, RefreshIcon, CalendarIcon } from "./GameIcons";

// ── Karşı-joker pop-up'ı: bekleyen tarafın kendi paneli içinde, aktif
// tarafın turu başlarken otomatik beliren kart — BAN / Force Team / Force
// Year'dan birini seçtirir ya da "No thanks" ile kapatılır. Same Screen ve
// With a Friend arasında paylaşılması için jokers/onUse/onDismiss'e bağlı,
// hiçbir oyun-state'i kendi içinde tutmuyor.
function CounterBtn({ Icon, label, available, onClick }) {
  return (
    <button onClick={onClick} disabled={!available}
      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-center transition-all
        ${available ? "border-brandRed/60 bg-brandRed/15 hover:bg-brandRed/30 cursor-pointer text-brandRed"
                    : "border-gray-800 bg-surfaceBg/40 cursor-not-allowed text-gray-600"}`}>
      <Icon size={17} />
      <span className="text-[9.5px] leading-tight whitespace-nowrap font-semibold">{label}</span>
    </button>
  );
}

export default function CounterJokerPrompt({ jokers, activeSeat, activeName, onUse, onDismiss }) {
  const hasAny = jokers.ban || jokers.forceTeam || jokers.forceYear;
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border border-brandRed/50 bg-brandRed/5 p-2.5 space-y-2">
      <div className="text-[10.5px] font-logo font-bold text-brandRed uppercase tracking-wide">
        Counter {activeName || `Player ${activeSeat}`}'s pick?
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <CounterBtn Icon={WarnIcon} label="BAN" available={jokers.ban} onClick={() => onUse("ban")} />
        <CounterBtn Icon={RefreshIcon} label="Force Team" available={jokers.forceTeam} onClick={() => onUse("forceTeam")} />
        <CounterBtn Icon={CalendarIcon} label="Force Year" available={jokers.forceYear} onClick={() => onUse("forceYear")} />
      </div>
      <button onClick={onDismiss} className="w-full text-center text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
        No thanks
      </button>
    </div>
  );
}
